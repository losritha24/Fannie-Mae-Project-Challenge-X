"""Evidence-grounded chatbot.

Every question is answered by the LLM with the full current case context
injected into the prompt. This is a single-shot RAG-style call: the case is
serialized (facts, comparables, anomalies, valuation, AVM vendors, datapoint
alignment, vision findings, documents) and handed to the model together with
the user's question. The model is instructed to answer ONLY from that context,
cite sources, classify the output, and surface uncertainty.

If the LLM is unavailable, the endpoint raises — no silent fallback.
"""
from __future__ import annotations
import json
import os
from typing import Optional
from ..models.schemas import ChatResponse, ChatCitation
from ..data.mock_store import CASES


SYSTEM_PROMPT = """You are the Property Valuation & Designation Assistant chatbot.

You will be given the FULL case context for a subject property as JSON, plus a
user question. Answer the question using ONLY that context.

RULES:
- Do NOT invent facts, sources, comparables, prices, or citations.
- Every numeric or factual claim must cite a field present in the case context.
- Classify your answer as exactly one of: fact, estimate, anomaly, assumption, recommendation.
- Provide confidence 0.0-1.0 reflecting how well the context answers the question.
- List data gaps explicitly when the context is insufficient.
- Never provide legal, lending, or appraisal certification advice.
- Never use or infer protected-class attributes (race, color, religion, sex,
  disability, familial status, national origin) or proxy features.
- Also allow general valuation-methodology questions (e.g. "what is an AVM?",
  "how is the floor computed?") — answer from general knowledge but still cite
  any case fields you reference and classify as 'fact' for definitions.

Return ONLY valid JSON with exactly these keys:
{
  "direct_answer": "<concise answer first>",
  "supporting_evidence": [
    {"source_name": "<name>", "source_ref": "<case field path or doc>", "excerpt": "<short quote or value>"}
  ],
  "confidence": <0.0-1.0>,
  "data_gaps": ["<string>"],
  "suggested_next_action": "<string>",
  "classification": "fact|estimate|anomaly|assumption|recommendation"
}
"""


def _serialize_case(case_id: str) -> Optional[dict]:
    c = CASES.get(case_id)
    if not c:
        return None
    return {
        "case_id": c["case_id"],
        "address": c["address"],
        "parcel_id": c.get("parcel_id"),
        "property_facts": {k: v.model_dump(mode="json") for k, v in c.get("fields", {}).items()},
        "valuation": c.get("valuation", {}),
        "comparables": [x.model_dump(mode="json") for x in c.get("comparables", [])],
        "anomalies": [a.model_dump(mode="json") for a in c.get("anomalies", [])],
        "vision_findings": [v.model_dump(mode="json") for v in c.get("vision_findings", [])],
        "avm_vendors": c.get("avm_vendors", []),
        "alignment": c.get("alignment", []),
        "documents": c.get("documents", []),
        "notes": c.get("notes"),
    }


def answer(case_id: str, question: str) -> ChatResponse:
    """Answer the user's question using the LLM with the full case context."""
    context = _serialize_case(case_id)
    if context is None:
        raise ValueError(f"Case {case_id} not found")

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY not set")
    model = os.getenv("OPENAI_MODEL", "gpt-5.4")

    from langchain_openai import ChatOpenAI
    from langchain_core.messages import SystemMessage, HumanMessage

    llm = ChatOpenAI(
        model=model, temperature=0, api_key=api_key,
        model_kwargs={"response_format": {"type": "json_object"}},
    )
    user_msg = (
        "CASE CONTEXT (JSON):\n"
        + json.dumps(context, default=str, indent=2)
        + f"\n\nUSER QUESTION: {question}\n\nReturn the JSON answer now."
    )
    resp = llm.invoke([SystemMessage(content=SYSTEM_PROMPT), HumanMessage(content=user_msg)])
    text = resp.content if isinstance(resp.content, str) else str(resp.content)

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        s, e = text.find("{"), text.rfind("}")
        if s < 0 or e <= s:
            raise RuntimeError(f"LLM did not return JSON: {text[:200]}")
        data = json.loads(text[s:e + 1])

    citations = []
    for c in data.get("supporting_evidence", []):
        if isinstance(c, dict):
            citations.append(ChatCitation(
                source_name=str(c.get("source_name", "case")),
                source_ref=str(c.get("source_ref", "")),
                excerpt=str(c.get("excerpt", "")),
            ))
    cls = data.get("classification", "assumption")
    if cls not in ("fact", "estimate", "anomaly", "assumption", "recommendation"):
        cls = "assumption"
    return ChatResponse(
        direct_answer=str(data.get("direct_answer", "")).strip() or "No answer produced.",
        supporting_evidence=citations,
        confidence=float(data.get("confidence", 0.5)),
        data_gaps=list(data.get("data_gaps", [])),
        suggested_next_action=str(data.get("suggested_next_action", "Analyst review recommended.")),
        classification=cls,  # type: ignore[arg-type]
    )
