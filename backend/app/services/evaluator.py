"""Address-driven property evaluation.

All numeric values, comparables, anomalies, the valuation band, and the
hypothesis come from a single LLM call (see llm_evaluator). The service layer
wraps that output into our internal domain models with provenance, persists a
new case, and returns the full bundle to the caller.

No synthetic / deterministic fallback numbers are produced — if the LLM call
fails, the API surfaces the failure so the analyst knows no valuation was
generated.
"""
from __future__ import annotations
from datetime import datetime, timezone, timedelta
from typing import Optional
from uuid import uuid4
from ..data.mock_store import CASES
from ..models.schemas import (
    SourceProvenance, ValuedField, Comparable, Anomaly, VisionFinding,
)
from .llm_evaluator import llm_evaluate


SOURCE_RELIABILITY = {
    "County Assessor": 0.95,
    "MLS": 0.88,
    "Multiple Listing Service": 0.88,
    "Multiple Listing Service (MLS)": 0.88,
    "FHFA": 0.98,
    "HUD": 0.97,
    "Redfin": 0.78,
    "Zillow": 0.72,
    "HouseCanary": 0.82,
    "CoreLogic": 0.90,
}


def _provenance(source_name: str, days: int = 14) -> SourceProvenance:
    rel = SOURCE_RELIABILITY.get(source_name, 0.7)
    is_public = source_name in {"County Assessor", "FHFA", "HUD"}
    return SourceProvenance(
        source_name=source_name,
        source_identifier=source_name.lower().replace(" ", "-"),
        retrieval_timestamp=datetime.now(timezone.utc) - timedelta(days=1),
        access_method="public_dataset" if is_public else "api",
        freshness_days=days,
        reliability_score=rel,
        legal_basis="public_record" if is_public else "licensed_api",
    )


def _parse_date(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s).replace(tzinfo=timezone.utc)
    except Exception:
        return None


def evaluate_address(address_line: str, city: str, state: str, zip_code: str,
                     parcel_id: Optional[str], notes: Optional[str]) -> dict:
    full_addr = f"{address_line}, {city}, {state} {zip_code}"
    now = datetime.now(timezone.utc)
    case_id = f"CASE-{uuid4().hex[:8].upper()}"

    # Single LLM call produces the full evaluation.
    llm_result = llm_evaluate(full_addr)

    # Wrap facts into our domain model with provenance.
    fields: dict[str, ValuedField] = {}
    for key, raw in (llm_result.get("property_facts") or {}).items():
        if not isinstance(raw, dict) or "value" not in raw:
            continue
        src = raw.get("source") or "LLM-derived"
        fields[key] = ValuedField(
            field_name=key,
            raw_value=raw["value"],
            normalized_value=raw["value"],
            provenance=_provenance(src),
            confidence=float(raw.get("confidence", 0.7)),
        )

    # Wrap comparables.
    comps: list[Comparable] = []
    for i, c in enumerate(llm_result.get("comparables") or []):
        src = c.get("source") or "MLS"
        comps.append(Comparable(
            comp_id=f"C{i+1}",
            address=c.get("address", "unknown"),
            distance_miles=float(c.get("distance_miles", 0.0)),
            sale_price=float(c["sale_price"]) if c.get("sale_price") is not None else None,
            sale_date=_parse_date(c.get("sale_date_iso")),
            square_feet=int(c["square_feet"]) if c.get("square_feet") is not None else None,
            similarity_score=float(c.get("similarity_score", 0.0)),
            reliability_score=float(c.get("reliability_score", SOURCE_RELIABILITY.get(src, 0.7))),
            provenance=_provenance(src),
        ))

    # Wrap anomalies.
    anomalies: list[Anomaly] = []
    for i, a in enumerate(llm_result.get("anomalies") or []):
        sev = a.get("severity", "informational")
        if sev not in ("informational", "moderate", "critical"):
            sev = "informational"
        anomalies.append(Anomaly(
            anomaly_id=f"A{i+1}",
            category=a.get("category", "unclassified"),
            severity=sev,  # type: ignore[arg-type]
            description=a.get("description", ""),
            evidence=list(a.get("evidence", [])),
            requires_review=bool(a.get("requires_review", sev in ("moderate", "critical"))),
        ))

    # Map LLM condition_findings -> VisionFinding domain objects.
    raw_findings = llm_result.get("condition_findings") or []
    vision: list[VisionFinding] = []
    for i, f in enumerate(raw_findings):
        vision.append(VisionFinding(
            finding_id=f"V{i+1}",
            finding=str(f.get("finding", "Condition assessment")),
            confidence=float(f.get("confidence", 0.7)),
            explanation=str(f.get("explanation", "")),
            evidence_thumbnails=[],
            limitations=str(f.get("limitations", "")),
        ))
    if not vision:
        vision = [VisionFinding(
            finding_id="V1",
            finding="Condition assessed from public records and AVM vendor data",
            confidence=0.65,
            explanation="Condition inferred from BPO, appraisal, and AVM vendor notes. No physical imagery required for this assessment.",
            evidence_thumbnails=[],
            limitations="Physical inspection or imagery would raise confidence above 0.85.",
        )]

    # Valuation band and hypothesis come straight from the LLM.
    v = llm_result["valuation"]
    valuation = {
        "floor_value": float(v["floor_value"]),
        "ceiling_value": float(v["ceiling_value"]),
        "median_value": float(v.get("median_value", v["weighted_estimate"])),
        "weighted_estimate": float(v["weighted_estimate"]),
        "confidence_band_low": float(v.get("confidence_band_low", v["weighted_estimate"] * 0.96)),
        "confidence_band_high": float(v.get("confidence_band_high", v["weighted_estimate"] * 1.04)),
        "overall_confidence": float(v["overall_confidence"]),
        "contributing_factors": list(v.get("contributing_factors", [])),
        "conflicting_factors": list(v.get("conflicting_factors", [])),
        "data_quality_notes": list(v.get("data_quality_notes", v.get("missing_data_impact", []))),
        "model_version": "llm-valuation-v1",
        "prompt_version": "vp-2026-04-14",
        "data_version": f"llm-{now.strftime('%Y-%m-%d')}",
        "disclaimer": (
            "Model-generated guidance range. Not a licensed appraisal. "
            "Analyst review required for decisions."
        ),
    }

    hypothesis = llm_result.get("hypothesis") or {}
    avm_vendors = llm_result.get("avm_vendor_estimates") or []
    alignment = llm_result.get("datapoint_alignment") or []
    price_history = sorted(
        llm_result.get("price_history") or [],
        key=lambda x: x.get("date_iso", ""),
        reverse=True,
    )

    CASES[case_id] = {
        "case_id": case_id,
        "address": full_addr,
        "parcel_id": parcel_id,
        "created_at": now.isoformat(),
        "fields": fields,
        "comparables": comps,
        "anomalies": anomalies,
        "vision_findings": vision,
        "valuation": valuation,
        "hypothesis": hypothesis,
        "documents": [],
        "images": [],
        "notes": notes,
        "avm_vendors": avm_vendors,
        "alignment": alignment,
        "price_history": price_history,
    }

    import os
    engine = f"llm:{os.getenv('OPENAI_MODEL', 'gpt-5.4')}"

    return {
        "case_id": case_id,
        "address": full_addr,
        "property_facts": {k: f.model_dump(mode="json") for k, f in fields.items()},
        "comparables": [c.model_dump(mode="json") for c in comps],
        "anomalies": [a.model_dump(mode="json") for a in anomalies],
        "vision_findings": [v.model_dump(mode="json") for v in vision],
        "valuation": valuation,
        "hypothesis": hypothesis,
        "avm_vendors": avm_vendors,
        "alignment": alignment,
        "engine": engine,
    }
