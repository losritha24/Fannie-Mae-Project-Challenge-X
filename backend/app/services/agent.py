"""LangChain agent for evidence-grounded drill-down questions.

The agent is given a small toolset bound to the in-memory case store so that
every answer is grounded in specific case artifacts. The LLM is instructed to
cite sources, classify its output (fact/estimate/anomaly/assumption/
recommendation), and never fabricate evidence.

Environment:
  OPENAI_API_KEY   — required at runtime (do not hardcode).
  OPENAI_MODEL     — defaults to 'gpt-5.4' (per project directive).

If the key or langchain packages are missing, the orchestration layer falls
back to the deterministic rule-based chatbot in services.chatbot.
"""
from __future__ import annotations
import os
import json
from typing import Any
from ..data.mock_store import CASES
from ..models.schemas import ChatResponse, ChatCitation

SYSTEM_PROMPT = """You are the Property Valuation & Designation Assistant agent.

RULES (non-negotiable):
- Answer ONLY from evidence returned by the provided tools. Never fabricate sources,
  comparables, values, or citations.
- Every numeric or factual claim must cite a tool result.
- Classify your answer as exactly one of: fact, estimate, anomaly, assumption, recommendation.
- If evidence is insufficient, say so and list data gaps.
- Never provide legal, lending, or appraisal certification advice.
- Do NOT use or infer protected-class attributes (race, color, religion, sex,
  disability, familial status, national origin) or proxy features.
- Always include confidence (0.0–1.0) and a suggested next action.

Return a final JSON object with fields:
  direct_answer, supporting_evidence (list of {source_name, source_ref, excerpt}),
  confidence, data_gaps (list), suggested_next_action, classification.
"""


def _tools_for_case(case_id: str):
    from langchain_core.tools import tool

    @tool
    def get_valuation(_: str = "") -> str:
        """Return the current valuation guidance range for the case."""
        c = CASES.get(case_id)
        return json.dumps(c["valuation"]) if c else "{}"

    @tool
    def list_comparables(_: str = "") -> str:
        """Return the list of comparable properties with provenance and reliability."""
        c = CASES.get(case_id)
        if not c:
            return "[]"
        return json.dumps([x.model_dump(mode="json") for x in c["comparables"]])

    @tool
    def list_anomalies(_: str = "") -> str:
        """Return detected anomalies with severity, evidence, and review status."""
        c = CASES.get(case_id)
        if not c:
            return "[]"
        return json.dumps([a.model_dump(mode="json") for a in c["anomalies"]])

    @tool
    def list_documents(_: str = "") -> str:
        """Return uploaded valuation documents (PDF/XML) with extraction confidence."""
        c = CASES.get(case_id)
        return json.dumps(c["documents"]) if c else "[]"

    @tool
    def list_vision_findings(_: str = "") -> str:
        """Return computer-vision findings for subject/comparable imagery."""
        c = CASES.get(case_id)
        if not c:
            return "[]"
        return json.dumps([v.model_dump(mode="json") for v in c["vision_findings"]])

    @tool
    def get_property_facts(_: str = "") -> str:
        """Return normalized property facts (sqft, beds, baths, lot, year) with source provenance."""
        c = CASES.get(case_id)
        if not c:
            return "{}"
        return json.dumps({k: v.model_dump(mode="json") for k, v in c["fields"].items()})

    return [get_valuation, list_comparables, list_anomalies,
            list_documents, list_vision_findings, get_property_facts]


def run_agent(case_id: str, question: str) -> ChatResponse:
    """Run the LangChain agent. Raises if OPENAI_API_KEY or langchain not available."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY not set")
    model = os.getenv("OPENAI_MODEL", "gpt-5.4")

    from langchain_openai import ChatOpenAI
    from langchain.agents import AgentExecutor, create_openai_tools_agent
    from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

    llm = ChatOpenAI(model=model, temperature=0, api_key=api_key)
    tools = _tools_for_case(case_id)
    prompt = ChatPromptTemplate.from_messages([
        ("system", SYSTEM_PROMPT),
        ("human", "Case: {case_id}\n\nQuestion: {input}"),
        MessagesPlaceholder("agent_scratchpad"),
    ])
    agent = create_openai_tools_agent(llm, tools, prompt)
    executor = AgentExecutor(agent=agent, tools=tools, max_iterations=6, verbose=False)
    result = executor.invoke({"case_id": case_id, "input": question})
    raw = result.get("output", "")

    parsed: dict[str, Any] = {}
    try:
        start = raw.find("{"); end = raw.rfind("}")
        if start >= 0 and end > start:
            parsed = json.loads(raw[start:end + 1])
    except Exception:
        parsed = {}

    return ChatResponse(
        direct_answer=parsed.get("direct_answer") or raw.strip() or "No answer produced.",
        supporting_evidence=[ChatCitation(**c) for c in parsed.get("supporting_evidence", []) if isinstance(c, dict)],
        confidence=float(parsed.get("confidence", 0.5)),
        data_gaps=list(parsed.get("data_gaps", [])),
        suggested_next_action=parsed.get("suggested_next_action", "Analyst review recommended."),
        classification=parsed.get("classification", "assumption"),
    )
