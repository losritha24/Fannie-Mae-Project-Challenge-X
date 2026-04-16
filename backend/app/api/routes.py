from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from fastapi.responses import Response
import httpx
from uuid import uuid4
import os
from datetime import datetime, timezone
from ..models.schemas import (
    LoginRequest, TokenResponse, PropertyIntake, ChatRequest, ChatResponse, GraphResponse,
)
from ..core.security import USERS, create_access_token, current_user, require_roles
from ..core.audit import log_event, get_events
from ..data.mock_store import CASES, build_graph, seed_demo_case
from ..services.ingestion import extract_pdf, extract_xml
from ..services.chatbot import answer as chat_answer
from ..services.agent import run_agent
from ..services.evaluator import evaluate_address
from ..services.image_gen import generate_property_image
from ..core.retention import RETENTION_POLICY

router = APIRouter(prefix="/api/v1")


# ---------- Auth ----------
@router.post("/auth/login", response_model=TokenResponse)
def login(req: LoginRequest):
    user = USERS.get(req.username)
    if not user or user["password"] != req.password:
        raise HTTPException(401, "Invalid credentials")
    token = create_access_token(req.username, user["role"])
    log_event(req.username, "login", "user", req.username)
    return TokenResponse(access_token=token, role=user["role"])


# ---------- Cases / Properties ----------
@router.get("/cases")
def list_cases(user: dict = Depends(current_user)):
    return [{"case_id": c["case_id"], "address": c["address"],
             "anomaly_count": len(c["anomalies"]),
             "overall_confidence": c["valuation"]["overall_confidence"]}
            for c in CASES.values()]


@router.post("/cases")
def create_case(intake: PropertyIntake, user: dict = Depends(current_user)):
    case_id = f"CASE-{uuid4().hex[:8].upper()}"
    CASES[case_id] = {
        "case_id": case_id,
        "address": f"{intake.address_line}, {intake.city}, {intake.state} {intake.zip_code}",
        "parcel_id": intake.parcel_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "fields": {}, "comparables": [], "anomalies": [], "vision_findings": [],
        "valuation": {
            "floor_value": 0, "ceiling_value": 0, "median_value": 0, "weighted_estimate": 0,
            "confidence_band_low": 0, "confidence_band_high": 0, "overall_confidence": 0,
            "contributing_factors": [], "conflicting_factors": [],
            "missing_data_impact": ["Awaiting source aggregation"],
            "model_version": "n/a", "prompt_version": "n/a", "data_version": "n/a",
        },
        "documents": [],
    }
    log_event(user["sub"], "case.create", "case", case_id, {"address": CASES[case_id]["address"]})
    return CASES[case_id]


@router.get("/cases/{case_id}")
def get_case(case_id: str, user: dict = Depends(current_user)):
    c = CASES.get(case_id)
    if not c:
        raise HTTPException(404, "Case not found")
    log_event(user["sub"], "case.viewed", "case", case_id)
    return c


@router.post("/cases/reset-demo")
def reset_demo(user: dict = Depends(require_roles("administrator"))):
    CASES.clear()
    seed_demo_case()
    log_event(user["sub"], "demo.reset", "system", "cases")
    return {"ok": True}


# ---------- Evaluate ----------
@router.post("/evaluate")
def evaluate(intake: PropertyIntake, user: dict = Depends(current_user)):
    try:
        result = evaluate_address(
            intake.address_line, intake.city, intake.state, intake.zip_code,
            intake.parcel_id, intake.notes,
        )
    except Exception as e:
        log_event(user["sub"], "case.evaluate.failed", "case", "n/a",
                  {"address": f"{intake.address_line}, {intake.city}, {intake.state} {intake.zip_code}",
                   "error": f"{type(e).__name__}: {e}"})
        raise HTTPException(502, f"LLM evaluation failed: {type(e).__name__}: {e}")
    log_event(user["sub"], "case.evaluate", "case", result["case_id"],
              {"address": result["address"],
               "engine": result.get("engine"),
               "weighted_estimate": result["valuation"]["weighted_estimate"],
               "confidence": result["valuation"]["overall_confidence"]})
    return result


# ---------- Google Maps proxy ----------
@router.get("/maps/streetview")
async def maps_streetview(address: str, user: dict = Depends(current_user)):
    key = os.getenv("GOOGLE_MAPS_KEY")
    if not key:
        raise HTTPException(503, "GOOGLE_MAPS_KEY not configured")
    # Check metadata first so we can return a clear 404 if no imagery exists
    async with httpx.AsyncClient() as client:
        meta = await client.get(
            "https://maps.googleapis.com/maps/api/streetview/metadata",
            params={"location": address, "key": key},
        )
        if meta.json().get("status") != "OK":
            raise HTTPException(404, "No Street View imagery available for this address")
        img = await client.get(
            "https://maps.googleapis.com/maps/api/streetview",
            params={"size": "800x500", "location": address, "fov": "90", "pitch": "0", "key": key},
        )
    return Response(content=img.content, media_type="image/jpeg")


@router.get("/maps/satellite")
async def maps_satellite(address: str, user: dict = Depends(current_user)):
    key = os.getenv("GOOGLE_MAPS_KEY")
    if not key:
        raise HTTPException(503, "GOOGLE_MAPS_KEY not configured")
    async with httpx.AsyncClient() as client:
        img = await client.get(
            "https://maps.googleapis.com/maps/api/staticmap",
            params={
                "center": address, "zoom": "18", "size": "800x500",
                "maptype": "satellite",
                "markers": f"color:red|{address}",
                "key": key,
            },
        )
    return Response(content=img.content, media_type="image/png")


# ---------- Property image (DALL-E) ----------
@router.get("/cases/{case_id}/property-image")
def property_image(case_id: str, user: dict = Depends(current_user)):
    if case_id not in CASES:
        raise HTTPException(404, "Case not found")
    try:
        result = generate_property_image(case_id)
    except Exception as e:
        raise HTTPException(502, f"Image generation failed: {type(e).__name__}: {e}")
    log_event(user["sub"], "image.generate", "case", case_id, {"model": result.get("model")})
    return result


# ---------- Documents ----------
@router.post("/documents/upload")
async def upload_document(case_id: str, file: UploadFile = File(...),
                          user: dict = Depends(current_user)):
    if case_id not in CASES:
        raise HTTPException(404, "Case not found")
    content = await file.read()
    if file.filename.lower().endswith(".pdf"):
        result = extract_pdf(content)
    elif file.filename.lower().endswith(".xml"):
        result = extract_xml(content)
    else:
        raise HTTPException(400, "Only PDF or XML supported")
    doc_id = f"D-{uuid4().hex[:6].upper()}"
    CASES[case_id]["documents"].append({
        "doc_id": doc_id, "filename": file.filename, "type": result["type"],
        "pages": result.get("page_count"),
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "extraction_confidence": result["extraction_confidence"],
    })
    log_event(user["sub"], "document.upload", "case", case_id,
              {"doc_id": doc_id, "filename": file.filename,
               "extraction_confidence": result["extraction_confidence"]})
    return {"doc_id": doc_id, **result}


# ---------- Sources ----------
@router.get("/sources/available")
def sources():
    return [
        {"name": "Federal Housing Finance Agency (FHFA)", "type": "public", "reliability": 0.98},
        {"name": "U.S. Department of Housing and Urban Development (HUD)", "type": "public", "reliability": 0.97},
        {"name": "County Assessor", "type": "public", "reliability": 0.95},
        {"name": "Multiple Listing Service (MLS)", "type": "licensed", "reliability": 0.88},
        {"name": "Zillow", "type": "market_signal", "reliability": 0.72},
        {"name": "Redfin", "type": "market_signal", "reliability": 0.78},
        {"name": "HouseCanary", "type": "market_signal", "reliability": 0.82},
        {"name": "CoreLogic", "type": "licensed", "reliability": 0.9},
    ]


# ---------- Valuation ----------
@router.get("/valuations/{case_id}")
def valuation(case_id: str, user: dict = Depends(current_user)):
    c = CASES.get(case_id)
    if not c:
        raise HTTPException(404, "Case not found")
    return c["valuation"]


# ---------- Comparables ----------
@router.get("/comparables/{case_id}")
def comparables(case_id: str, user: dict = Depends(current_user)):
    c = CASES.get(case_id)
    if not c:
        raise HTTPException(404, "Case not found")
    return c["comparables"]


# ---------- Anomalies ----------
@router.get("/anomalies/{case_id}")
def anomalies(case_id: str, user: dict = Depends(current_user)):
    c = CASES.get(case_id)
    if not c:
        raise HTTPException(404, "Case not found")
    return c["anomalies"]


@router.post("/anomalies/{case_id}/{anomaly_id}/review")
def review_anomaly(case_id: str, anomaly_id: str, decision: str, notes: str = "",
                   user: dict = Depends(require_roles("quality_control_reviewer", "compliance_reviewer"))):
    c = CASES.get(case_id)
    if not c:
        raise HTTPException(404, "Case not found")
    for a in c["anomalies"]:
        if a.anomaly_id == anomaly_id:
            a.status = decision  # type: ignore
            log_event(user["sub"], "anomaly.review", "case", case_id,
                      {"anomaly_id": anomaly_id, "decision": decision, "notes": notes})
            return a
    raise HTTPException(404, "Anomaly not found")


# ---------- Vision ----------
@router.get("/images/{case_id}/findings")
def vision(case_id: str, user: dict = Depends(current_user)):
    c = CASES.get(case_id)
    if not c:
        raise HTTPException(404, "Case not found")
    return c["vision_findings"]


# ---------- Graph ----------
@router.get("/graph/{case_id}", response_model=GraphResponse)
def graph(case_id: str, user: dict = Depends(current_user)):
    if case_id not in CASES:
        raise HTTPException(404, "Case not found")
    nodes, edges = build_graph(case_id)
    return GraphResponse(nodes=nodes, edges=edges)


# ---------- Chat ----------
@router.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest, user: dict = Depends(current_user)):
    if req.case_id not in CASES:
        raise HTTPException(404, f"Case {req.case_id} not found. Create one via /evaluate.")
    log_event(user["sub"], "chat.question", "case", req.case_id, {"q": req.question})
    try:
        resp = chat_answer(req.case_id, req.question)
    except Exception as e:
        log_event(user["sub"], "chat.error", "case", req.case_id,
                  {"error": f"{type(e).__name__}: {e}"})
        raise HTTPException(502, f"LLM chat failed: {type(e).__name__}: {e}")
    log_event(user["sub"], "chat.answer", "case", req.case_id,
              {"classification": resp.classification, "confidence": resp.confidence,
               "model": os.getenv("OPENAI_MODEL", "gpt-5.4")})
    return resp


# ---------- Agent (LangChain) ----------
@router.post("/agent/chat", response_model=ChatResponse)
def agent_chat(req: ChatRequest, user: dict = Depends(current_user)):
    if req.case_id not in CASES:
        raise HTTPException(404, f"Case {req.case_id} not found. Create one via /evaluate.")
    log_event(user["sub"], "agent.question", "case", req.case_id, {"q": req.question})
    try:
        resp = run_agent(req.case_id, req.question)
        used = "langchain_agent"
    except Exception as e:
        # Safe fallback so the UI stays functional when the LLM is unavailable.
        resp = chat_answer(req.case_id, req.question)
        used = f"fallback_rule_based ({type(e).__name__})"
    log_event(user["sub"], "agent.answer", "case", req.case_id,
              {"engine": used, "classification": resp.classification,
               "confidence": resp.confidence})
    return resp


# ---------- History / Audit ----------
@router.get("/history/{case_id}")
def history(case_id: str, user: dict = Depends(current_user)):
    return get_events(case_id)


@router.get("/history")
def all_history(user: dict = Depends(require_roles("audit_reviewer", "compliance_reviewer"))):
    return get_events()


# ---------- AVM vendor comparison ----------
@router.get("/avm/{case_id}")
def avm(case_id: str, user: dict = Depends(current_user)):
    c = CASES.get(case_id)
    if not c:
        raise HTTPException(404, "Case not found")
    vendors = c.get("avm_vendors", [])
    estimates = [v.get("estimate") for v in vendors if isinstance(v.get("estimate"), (int, float))]
    aligned = {
        "floor": min([v.get("low", v.get("estimate")) for v in vendors if v.get("low") or v.get("estimate")], default=None),
        "ceiling": max([v.get("high", v.get("estimate")) for v in vendors if v.get("high") or v.get("estimate")], default=None),
        "median": sorted(estimates)[len(estimates)//2] if estimates else None,
        "vendor_count": len(vendors),
    }
    return {"case_id": case_id, "vendors": vendors, "aligned_range": aligned,
            "case_valuation": c["valuation"]}


# ---------- Key datapoint alignment ----------
@router.get("/alignment/{case_id}")
def alignment(case_id: str, user: dict = Depends(current_user)):
    c = CASES.get(case_id)
    if not c:
        raise HTTPException(404, "Case not found")
    return {"case_id": case_id, "alignment": c.get("alignment", [])}


# ---------- Anomaly review queue (product view for analysts) ----------
@router.get("/anomalies/review-queue")
def review_queue(user: dict = Depends(current_user)):
    queue = []
    for c in CASES.values():
        for a in c.get("anomalies", []):
            sev = a.severity if hasattr(a, "severity") else a.get("severity")
            status = a.status if hasattr(a, "status") else a.get("status", "open")
            req = a.requires_review if hasattr(a, "requires_review") else a.get("requires_review", False)
            if req and status == "open" and sev in ("moderate", "critical"):
                item = a.model_dump(mode="json") if hasattr(a, "model_dump") else dict(a)
                item.update({"case_id": c["case_id"], "address": c["address"]})
                queue.append(item)
    queue.sort(key=lambda x: 0 if x["severity"] == "critical" else 1)
    return queue


# ---------- Compliance: retention & AI governance policy ----------
@router.get("/compliance/retention-policy")
def retention_policy(user: dict = Depends(current_user)):
    return RETENTION_POLICY


# ---------- Reports ----------
@router.get("/reports/{case_id}/summary")
def report(case_id: str, user: dict = Depends(current_user)):
    c = CASES.get(case_id)
    if not c:
        raise HTTPException(404, "Case not found")
    return {
        "case_id": case_id, "address": c["address"],
        "valuation": c["valuation"],
        "anomaly_count_by_severity": {
            sev: sum(1 for a in c["anomalies"] if a.severity == sev)
            for sev in ("informational", "moderate", "critical")
        },
        "disclaimer": "Decision-support output. Not a licensed appraisal or lending decision.",
    }
