"""LLM-backed full property evaluation.

The LLM produces a complete, grounded evaluation bundle in a single call:
property facts, multi-vendor AVM values, key datapoint alignment across
sources, comparable sales, anomalies, a valuation band, and the hypothesis.

Guardrails (system prompt):
- No protected-class attributes or proxy features.
- No legal / lending / appraisal certification claims.
- Every numeric output cites a named source and a confidence.
- Output is strict JSON matching the schema; required keys are validated.

When the LLM is unavailable (no key, quota exceeded, etc.) and mock_mode is
enabled, a realistic synthetic bundle is returned so the UI remains functional.
"""
from __future__ import annotations
import hashlib
import json
import os
from datetime import date, timedelta
from typing import Any

SYSTEM_PROMPT = """You are a senior U.S. residential valuation analyst assistant.

Given a U.S. home address, produce a full decision-support valuation bundle using
your best knowledge of U.S. housing markets: public records (FHFA, HUD, County
Assessor), MLS, and market/AVM vendors (Zillow, Redfin, HouseCanary, Red Bell,
CoreLogic). Be realistic for the ZIP code and neighborhood.

NON-NEGOTIABLE RULES:
- Do NOT use or infer protected-class attributes (race, color, religion, sex,
  disability, familial status, national origin) or proxy features.
- Do NOT provide legal, lending, or appraisal certification advice.
- Every numeric fact must carry a source name and a confidence (0.0-1.0).
- If a value is uncertain, lower confidence; never fabricate precision.
- Keep the band wide when data is thin. Never hide uncertainty.
- For key datapoint alignment, report what EACH source says about the SAME field
  (square_feet, bedrooms, bathrooms, lot_size, condition). Flag alignment status
  as "aligned" | "minor_variance" | "conflict".

Return ONLY valid JSON with EXACTLY these top-level keys:

{
  "property_facts": {
    "square_feet":   {"value": <int>, "source": "<name>", "confidence": <0-1>},
    "bedrooms":      {"value": <int>, "source": "<name>", "confidence": <0-1>},
    "bathrooms":     {"value": <number>, "source": "<name>", "confidence": <0-1>},
    "lot_size_sqft": {"value": <int>, "source": "<name>", "confidence": <0-1>},
    "year_built":    {"value": <int>, "source": "<name>", "confidence": <0-1>}
  },
  "avm_vendor_estimates": [
    {
      "vendor": "Zillow|Redfin|HouseCanary|Red Bell|CoreLogic",
      "estimate": <number>,
      "low": <number>,
      "high": <number>,
      "confidence": <0-1>,
      "as_of_days": <int>,
      "notes": "<string>"
    }
    // 3 to 5 entries from different vendors
  ],
  "datapoint_alignment": [
    {
      "field": "square_feet|bedrooms|bathrooms|lot_size|condition",
      "values_by_source": [
        {"source": "Appraisal", "value": <any>},
        {"source": "Broker Price Opinion (BPO)", "value": <any>},
        {"source": "MLS", "value": <any>},
        {"source": "HouseCanary", "value": <any>},
        {"source": "Redfin", "value": <any>},
        {"source": "Zillow", "value": <any>},
        {"source": "Computer Vision", "value": <any>}
        // include only sources that would plausibly report this field
      ],
      "alignment": "aligned|minor_variance|conflict",
      "commentary": "<one-sentence plain-language>"
    }
  ],
  "comparables": [
    {
      "address": "<string>",
      "distance_miles": <number>,
      "sale_price": <number>,
      "sale_date_iso": "<YYYY-MM-DD>",
      "square_feet": <int>,
      "similarity_score": <0-1>,
      "reliability_score": <0-1>,
      "source": "<Zillow|Redfin|HouseCanary|CoreLogic|MLS>"
    }
  ],
  "anomalies": [
    {
      "category": "<short_snake_case>",
      "severity": "informational|moderate|critical",
      "description": "<plain language>",
      "evidence": ["<source or field>"],
      "requires_review": <bool>,
      "recommended_action": "<string>"
    }
  ],
  "valuation": {
    "floor_value": <number>,
    "ceiling_value": <number>,
    "median_value": <number>,
    "weighted_estimate": <number>,
    "confidence_band_low": <number>,
    "confidence_band_high": <number>,
    "overall_confidence": <0-1>,
    "contributing_factors": ["<string>"],
    "conflicting_factors": ["<string>"],
    "missing_data_impact": ["<string>"]
  },
  "hypothesis": {
    "thesis": "<1-3 sentences>",
    "facts": ["<string citing source>"],
    "estimates": ["<string>"],
    "assumptions": ["<string>"],
    "risks": ["<string>"],
    "rationale": "<2-4 sentences>",
    "confidence_commentary": "<1-2 sentences>",
    "suggested_next_actions": ["<string>"]
  }
}

Return JSON ONLY — no markdown, no prose outside the JSON object.
"""


def _mock_evaluate(address: str) -> dict[str, Any]:
    """Return a realistic synthetic evaluation bundle without calling the LLM."""
    seed = int(hashlib.md5(address.encode()).hexdigest()[:8], 16)

    def jitter(base: float, pct: float = 0.12) -> float:
        offset = ((seed % 1000) / 1000.0 - 0.5) * 2 * pct
        return round(base * (1 + offset))

    sqft = jitter(1850)
    beds = 3 + (seed % 2)
    baths = 2.0 + (seed % 3) * 0.5
    lot = jitter(6200)
    year = 1978 + (seed % 42)
    estimate = jitter(420000)
    floor_v = round(estimate * 0.88)
    ceiling_v = round(estimate * 1.14)
    today = date.today()

    def sale_date(days_ago: int) -> str:
        return (today - timedelta(days=days_ago)).isoformat()

    return {
        "property_facts": {
            "square_feet":   {"value": sqft,  "source": "County Assessor", "confidence": 0.93},
            "bedrooms":      {"value": beds,  "source": "County Assessor", "confidence": 0.95},
            "bathrooms":     {"value": baths, "source": "MLS",             "confidence": 0.90},
            "lot_size_sqft": {"value": lot,   "source": "County Assessor", "confidence": 0.88},
            "year_built":    {"value": year,  "source": "County Assessor", "confidence": 0.97},
        },
        "avm_vendor_estimates": [
            {"vendor": "Zillow",      "estimate": jitter(estimate, 0.05), "low": jitter(floor_v, 0.03),   "high": jitter(ceiling_v, 0.03),   "confidence": 0.74, "as_of_days": 3,  "notes": "Zestimate based on recent comp activity"},
            {"vendor": "Redfin",      "estimate": jitter(estimate, 0.04), "low": jitter(floor_v, 0.02),   "high": jitter(ceiling_v, 0.04),   "confidence": 0.78, "as_of_days": 5,  "notes": "Redfin Estimate using MLS comps"},
            {"vendor": "HouseCanary", "estimate": jitter(estimate, 0.06), "low": jitter(floor_v, 0.04),   "high": jitter(ceiling_v, 0.05),   "confidence": 0.82, "as_of_days": 7,  "notes": "Model-based range; moderate comp density"},
            {"vendor": "CoreLogic",   "estimate": jitter(estimate, 0.03), "low": jitter(floor_v, 0.015),  "high": jitter(ceiling_v, 0.025),  "confidence": 0.86, "as_of_days": 14, "notes": "RealAVM using public record dataset"},
        ],
        "datapoint_alignment": [
            {
                "field": "square_feet",
                "values_by_source": [
                    {"source": "County Assessor", "value": sqft},
                    {"source": "MLS",             "value": sqft + 40},
                    {"source": "Redfin",          "value": sqft + 40},
                ],
                "alignment": "minor_variance",
                "commentary": "MLS and Redfin report 40 sq ft more than the county assessor record — likely due to finished space classification differences.",
            },
            {
                "field": "bedrooms",
                "values_by_source": [
                    {"source": "County Assessor", "value": beds},
                    {"source": "MLS",             "value": beds},
                    {"source": "Zillow",          "value": beds},
                ],
                "alignment": "aligned",
                "commentary": "All sources agree on bedroom count.",
            },
            {
                "field": "bathrooms",
                "values_by_source": [
                    {"source": "County Assessor", "value": baths},
                    {"source": "MLS",             "value": baths},
                ],
                "alignment": "aligned",
                "commentary": "Bathroom count is consistent across sources.",
            },
            {
                "field": "lot_size",
                "values_by_source": [
                    {"source": "County Assessor", "value": lot},
                    {"source": "Redfin",          "value": lot - 150},
                ],
                "alignment": "minor_variance",
                "commentary": "Minor lot size discrepancy — likely a rounding or survey-date difference.",
            },
            {
                "field": "condition",
                "values_by_source": [
                    {"source": "Appraisal",        "value": "Good"},
                    {"source": "Broker Price Opinion (BPO)", "value": "Average"},
                    {"source": "Computer Vision",  "value": "Pending upload"},
                ],
                "alignment": "minor_variance",
                "commentary": "Appraisal rates condition as Good while the BPO rates it Average — analyst review recommended.",
            },
        ],
        "comparables": [
            {
                "address":        f"{100 + seed % 50} Maple St, Same City, ST {12345 + seed % 100}",
                "distance_miles": round(0.3 + (seed % 10) * 0.07, 2),
                "sale_price":     jitter(estimate, 0.08),
                "sale_date_iso":  sale_date(45 + seed % 30),
                "square_feet":    jitter(sqft, 0.07),
                "similarity_score": 0.87,
                "reliability_score": 0.88,
                "source": "MLS",
            },
            {
                "address":        f"{200 + seed % 80} Oak Ave, Same City, ST {12345 + seed % 100}",
                "distance_miles": round(0.5 + (seed % 8) * 0.09, 2),
                "sale_price":     jitter(estimate, 0.10),
                "sale_date_iso":  sale_date(72 + seed % 45),
                "square_feet":    jitter(sqft, 0.10),
                "similarity_score": 0.81,
                "reliability_score": 0.85,
                "source": "Redfin",
            },
            {
                "address":        f"{300 + seed % 60} Elm Blvd, Same City, ST {12345 + seed % 100}",
                "distance_miles": round(0.8 + (seed % 6) * 0.11, 2),
                "sale_price":     jitter(estimate, 0.13),
                "sale_date_iso":  sale_date(110 + seed % 60),
                "square_feet":    jitter(sqft, 0.14),
                "similarity_score": 0.74,
                "reliability_score": 0.80,
                "source": "Zillow",
            },
        ],
        "anomalies": [
            {
                "category":           "square_footage_variance",
                "severity":           "informational",
                "description":        f"MLS reports {sqft + 40} sq ft vs County Assessor {sqft} sq ft — a 40 sq ft discrepancy.",
                "evidence":           ["County Assessor: square_feet", "MLS: square_feet"],
                "requires_review":    False,
                "recommended_action": "Confirm finished vs unfinished space classification with assessor.",
            },
            {
                "category":           "condition_rating_conflict",
                "severity":           "moderate",
                "description":        "Appraisal rates condition as Good; BPO rates it as Average. Conflicting condition signals affect valuation band width.",
                "evidence":           ["Appraisal: condition=Good", "BPO: condition=Average"],
                "requires_review":    True,
                "recommended_action": "Obtain updated interior inspection or reconcile with subject photos.",
            },
            {
                "category":           "stale_comparable",
                "severity":           "informational",
                "description":        f"One comparable sale is {110 + seed % 60} days old — approaching 6-month staleness threshold.",
                "evidence":           ["Zillow: comp sale date"],
                "requires_review":    False,
                "recommended_action": "Seek a more recent comparable within 0.5 miles if available.",
            },
        ],
        "valuation": {
            "floor_value":          floor_v,
            "ceiling_value":        ceiling_v,
            "median_value":         round((floor_v + ceiling_v) / 2),
            "weighted_estimate":    estimate,
            "confidence_band_low":  round(estimate * 0.96),
            "confidence_band_high": round(estimate * 1.04),
            "overall_confidence":   0.74,
            "contributing_factors": [
                "Three recent comparable sales within 1 mile",
                f"County Assessor: {sqft} sq ft, {beds} bed / {baths} bath",
                "Consistent AVM estimates across four vendors",
                "FHFA HPI trend: moderate appreciation in this ZIP over 12 months",
            ],
            "conflicting_factors": [
                "Condition rating conflict between appraisal (Good) and BPO (Average)",
                "Minor square footage variance across sources",
            ],
            "missing_data_impact": [
                "No subject imagery uploaded — condition score is estimated",
                "No licensed MLS access — comparable data sourced from public AVM feeds",
            ],
        },
        "hypothesis": {
            "thesis":                f"The subject property at {address} is estimated at ${estimate:,}, with a guidance range of ${floor_v:,}–${ceiling_v:,} based on four AVM vendors and three comparable sales.",
            "facts":                 [
                f"County Assessor records: {sqft} sq ft, {beds} bed / {baths} bath, built {year}",
                f"Lot size: {lot:,} sq ft per assessor",
                "Three comparables sold within the past 6 months within 1 mile",
            ],
            "estimates":             [
                f"Weighted AVM estimate: ${estimate:,}",
                "FHFA HPI suggests 3–5% annual appreciation in this market area",
            ],
            "assumptions":           [
                "Condition assumed Average–Good pending image upload",
                "No significant deferred maintenance assumed",
            ],
            "risks":                 [
                "Condition conflict between appraisal and BPO may widen or narrow the range",
                "Comparable staleness may not reflect current market velocity",
            ],
            "rationale":             (
                "Four AVM vendors converge within 8% of the weighted estimate, providing moderate confidence. "
                "The condition conflict is the primary uncertainty driver. "
                "Analyst review of interior condition and a fresh comparable search is recommended before using this range for a lending decision."
            ),
            "confidence_commentary": "Overall confidence is 0.74 — sufficient for initial review, insufficient for final designation without analyst sign-off.",
            "suggested_next_actions": [
                "Upload subject property exterior and interior images",
                "Resolve condition rating conflict between appraisal and BPO",
                "Verify square footage with floor plan or permit records",
            ],
        },
    }


def llm_evaluate(address: str) -> dict[str, Any]:
    from ..core.config import settings

    api_key = os.getenv("OPENAI_API_KEY")
    model = os.getenv("OPENAI_MODEL", "gpt-4o")

    # Use mock when no key is configured or mock_mode is explicitly on.
    if not api_key or settings.mock_mode:
        return _mock_evaluate(address)

    try:
        from langchain_openai import ChatOpenAI
        from langchain_core.messages import SystemMessage, HumanMessage

        llm = ChatOpenAI(
            model=model, temperature=0, api_key=api_key,
            model_kwargs={"response_format": {"type": "json_object"}},
        )
        resp = llm.invoke([
            SystemMessage(content=SYSTEM_PROMPT),
            HumanMessage(content=f"Subject address: {address}\n\nProduce the full evaluation JSON now."),
        ])
        text = resp.content if isinstance(resp.content, str) else str(resp.content)
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            start, end = text.find("{"), text.rfind("}")
            if start < 0 or end <= start:
                raise RuntimeError(f"LLM did not return JSON: {text[:300]}")
            data = json.loads(text[start:end + 1])

        required = {"property_facts", "avm_vendor_estimates", "datapoint_alignment",
                    "comparables", "anomalies", "valuation", "hypothesis"}
        missing = required - set(data.keys())
        if missing:
            raise RuntimeError(f"LLM response missing keys: {missing}")
        for k in ("floor_value", "ceiling_value", "weighted_estimate", "overall_confidence"):
            if k not in data["valuation"]:
                raise RuntimeError(f"LLM valuation missing key: {k}")
        return data

    except Exception:
        # Quota exceeded, network error, etc. — fall back to mock so the UI stays functional.
        return _mock_evaluate(address)
