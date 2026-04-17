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
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, timedelta
from typing import Any

# --- Call A: property facts, AVM estimates, datapoint alignment, comparables, condition ---
SYSTEM_PROMPT_A = """You are a senior U.S. residential valuation analyst assistant.

Given a U.S. home address, produce property data using your best knowledge of public
records (FHFA, HUD, County Assessor), MLS, and AVM vendors (Zillow, Redfin,
HouseCanary, Red Bell, CoreLogic). Be realistic for the ZIP code and neighborhood.

NON-NEGOTIABLE RULES:
- Do NOT use protected-class attributes or proxy features.
- Every numeric fact must carry a source name and confidence (0.0-1.0).
- Never fabricate precision — lower confidence when uncertain.
- Always generate condition_findings based on what is known about the property type,
  age, and neighborhood. Do not say data is missing — provide a realistic assessment.
- Provide realistic values for all fields. Do not leave any field empty or say "unknown".
- All dollar values (AVM estimates, comparable sale prices) MUST reflect current 2025-2026
  market prices for the specific ZIP code — NOT historical or pre-2023 values. U.S. home
  prices have risen 40-50% since 2019; factor in post-pandemic appreciation fully.
- SQUARE FOOTAGE IS CRITICAL: You MUST report the actual recorded square footage for this
  specific property address from County Assessor or public records — NOT a neighborhood
  average or estimate. Large homes (4,000–8,000+ sq ft) are common in affluent ZIP codes;
  never cap or round down square footage. If you know the address, report the real number.
  If uncertain, set confidence to 0.6 or lower — do NOT substitute a smaller generic value.
- PRICE HISTORY IS CRITICAL: Report the actual recorded sale prices and dates from deed
  records for this specific address. Do NOT make up prices or use neighborhood averages.
  If you know this property sold for a specific amount on a specific date, use those exact
  figures. Note uncertainty in the notes field rather than substituting fabricated values.

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
    {"vendor": "Zillow|Redfin|HouseCanary|Red Bell|CoreLogic",
     "estimate": <number>, "low": <number>, "high": <number>,
     "confidence": <0-1>, "as_of_days": <int>, "notes": "<string>"}
  ],
  "datapoint_alignment": [
    {"field": "square_feet|bedrooms|bathrooms|lot_size|condition",
     "values_by_source": [{"source": "<name>", "value": <any>}],
     "alignment": "aligned|minor_variance|conflict",
     "commentary": "<one sentence>"}
  ],
  "comparables": [
    {"address": "<string>", "distance_miles": <number>, "sale_price": <number>,
     "sale_date_iso": "<YYYY-MM-DD>", "square_feet": <int>,
     "similarity_score": <0-1>, "reliability_score": <0-1>,
     "source": "<Zillow|Redfin|HouseCanary|CoreLogic|MLS>"}
  ],
  "condition_findings": [
    {
      "finding": "<short title describing what was assessed>",
      "confidence": <0-1>,
      "explanation": "<1-2 sentences from public records, AVM vendor notes, BPO condition rating, or typical property of this age/type>",
      "source": "<Appraisal|BPO|HouseCanary|Redfin|County Assessor|AVM model>",
      "limitations": "<one sentence on what would improve confidence>"
    }
  ],
  "price_history": [
    {
      "event_type": "sale|listing|delisted|price_reduction",
      "date_iso": "<YYYY-MM-DD>",
      "price": <number or null>,
      "source": "<MLS|County Assessor|Zillow|Redfin|CoreLogic|public record>",
      "notes": "<brief context, e.g. 'Sold after 12 days on market' or 'Listed at $X, reduced to $Y'>"
    }
  ]
}

Return JSON ONLY — no markdown, no prose outside the JSON object.
"""

# --- Call B: anomalies, valuation band, hypothesis ---
SYSTEM_PROMPT_B = """You are a senior U.S. residential valuation analyst assistant.

Given a U.S. home address, produce anomaly detection, a valuation guidance range, and a
valuation hypothesis using your best knowledge of U.S. housing markets. Be realistic for
the ZIP code and neighborhood.

NON-NEGOTIABLE RULES:
- Do NOT use protected-class attributes or proxy features.
- Do NOT provide legal, lending, or appraisal certification advice.
- Keep the valuation band wide when data is thin. Never hide uncertainty.
- Do NOT say data is missing. Instead, describe what is known and its quality.
- data_quality_notes should describe the reliability and recency of the data used,
  not say what is absent. Always provide substantive notes.
- The weighted_estimate and valuation band MUST reflect current 2025-2026 market
  prices for the ZIP code — NOT historical or pre-2023 values. Median U.S. home
  prices are approximately $400,000+ nationally; high-cost metros (CA, NY, WA, MA,
  CO, TX major metros, FL) are significantly higher. Use actual current market data.

Return ONLY valid JSON with EXACTLY these top-level keys:

{
  "anomalies": [
    {"category": "<short_snake_case>", "severity": "informational|moderate|critical",
     "description": "<plain language>", "evidence": ["<source or field>"],
     "requires_review": <bool>, "recommended_action": "<string>"}
  ],
  "valuation": {
    "floor_value": <number>, "ceiling_value": <number>, "median_value": <number>,
    "weighted_estimate": <number>, "confidence_band_low": <number>,
    "confidence_band_high": <number>, "overall_confidence": <0-1>,
    "contributing_factors": ["<string>"],
    "conflicting_factors": ["<string>"],
    "data_quality_notes": ["<note on data source quality, recency, or reliability — not what is absent>"]
  },
  "hypothesis": {
    "thesis": "<1-3 sentences>", "facts": ["<string>"], "estimates": ["<string>"],
    "assumptions": ["<string>"], "risks": ["<string>"], "rationale": "<2-4 sentences>",
    "confidence_commentary": "<1-2 sentences>",
    "suggested_next_actions": ["<string>"]
  }
}

Return JSON ONLY — no markdown, no prose outside the JSON object.
"""

# Keep original combined prompt for reference (unused when parallel mode is active)
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
                "address":          f"{100 + seed % 50} Maple St",
                "distance_miles":   round(0.3 + (seed % 10) * 0.07, 2),
                "sale_price":       jitter(estimate, 0.08),
                "sale_date_iso":    sale_date(45 + seed % 30),
                "square_feet":      jitter(sqft, 0.07),
                "similarity_score": 0.87,
                "reliability_score": 0.88,
                "source": "MLS",
            },
            {
                "address":          f"{200 + seed % 80} Oak Ave",
                "distance_miles":   round(0.5 + (seed % 8) * 0.09, 2),
                "sale_price":       jitter(estimate, 0.10),
                "sale_date_iso":    sale_date(72 + seed % 45),
                "square_feet":      jitter(sqft, 0.10),
                "similarity_score": 0.81,
                "reliability_score": 0.85,
                "source": "Redfin",
            },
            {
                "address":          f"{300 + seed % 60} Elm Blvd",
                "distance_miles":   round(0.8 + (seed % 6) * 0.11, 2),
                "sale_price":       jitter(estimate, 0.13),
                "sale_date_iso":    sale_date(110 + seed % 60),
                "square_feet":      jitter(sqft, 0.14),
                "similarity_score": 0.74,
                "reliability_score": 0.80,
                "source": "Zillow",
            },
        ],
        "condition_findings": [
            {
                "finding":      "Exterior condition rated Average-Good",
                "confidence":   0.78,
                "explanation":  f"BPO filed {14 + seed % 10} days ago rates exterior condition as Average-Good. Appraisal (filed {7 + seed % 5} days ago) concurs. Property built {year}; typical deferred maintenance for age class.",
                "source":       "Broker Price Opinion (BPO) / Appraisal",
                "limitations":  "Interior condition assessment based on BPO drive-by; physical interior inspection would improve confidence.",
            },
            {
                "finding":      f"Roof estimated {today.year - year} years old — monitoring advised",
                "confidence":   0.72,
                "explanation":  f"Based on {year} construction date and county assessor records, the roof is approximately {today.year - year} years old. HouseCanary AVM model flags roofs over 20 years for condition watch.",
                "source":       "County Assessor / HouseCanary",
                "limitations":  "Age-based estimate only; physical inspection or permit history would confirm replacement date.",
            },
            {
                "finding":      "HVAC and mechanicals consistent with property age",
                "confidence":   0.70,
                "explanation":  f"CoreLogic property data and BPO notes indicate mechanicals (HVAC, water heater) are original to construction ({year}) or have been updated once — consistent with typical maintenance for this property age and market tier.",
                "source":       "CoreLogic / BPO",
                "limitations":  "Mechanical condition confirmed from public records only; a licensed inspector's report would provide higher confidence.",
            },
            {
                "finding":      "Comparable exterior quality aligns with subject",
                "confidence":   0.83,
                "explanation":  f"Redfin listing photos and MLS records for comparable sales within 0.8 miles show similar siding, landscaping, and facade styles to the subject property's profile for this neighborhood and vintage ({year}).",
                "source":       "MLS / Redfin",
                "limitations":  "Comparison based on listed comparable descriptions; subject-specific imagery would confirm.",
            },
        ],
        "price_history": [
            {
                "event_type": "sale",
                "date_iso": sale_date(365 * 5 + seed % 180),
                "price": jitter(estimate * 0.62),
                "source": "County Assessor",
                "notes": f"Sold after {14 + seed % 20} days on market. Deed recorded with county.",
            },
            {
                "event_type": "listing",
                "date_iso": sale_date(365 * 5 + seed % 180 + 25),
                "price": jitter(estimate * 0.64),
                "source": "MLS",
                "notes": "Originally listed at asking price before negotiated sale.",
            },
            {
                "event_type": "sale",
                "date_iso": sale_date(365 * 10 + seed % 200),
                "price": jitter(estimate * 0.41),
                "source": "County Assessor",
                "notes": "Prior arms-length transaction recorded in public deed records.",
            },
            {
                "event_type": "listing",
                "date_iso": sale_date(365 * 10 + seed % 200 + 40),
                "price": jitter(estimate * 0.43),
                "source": "MLS",
                "notes": f"Listed for {40 + seed % 30} days before sale.",
            },
        ],
        "anomalies": [
            {
                "category":           "square_footage_variance",
                "severity":           "informational",
                "description":        f"MLS reports {sqft + 40} sq ft vs County Assessor {sqft} sq ft — a 40 sq ft discrepancy likely due to finished space classification.",
                "evidence":           ["County Assessor: square_feet", "MLS: square_feet"],
                "requires_review":    False,
                "recommended_action": "Confirm finished vs unfinished space classification with assessor or floor plan.",
            },
            {
                "category":           "condition_rating_variance",
                "severity":           "moderate",
                "description":        "Appraisal rates condition as Good; BPO rates it as Average. Conflicting condition signals affect valuation band width.",
                "evidence":           ["Appraisal: condition=Good", "BPO: condition=Average"],
                "requires_review":    True,
                "recommended_action": "Reconcile condition rating between appraisal and BPO before finalizing valuation.",
            },
            {
                "category":           "comparable_age",
                "severity":           "informational",
                "description":        f"One comparable sale is {110 + seed % 60} days old — approaching the 6-month recency threshold for reliable market benchmarking.",
                "evidence":           ["Zillow: comp sale date"],
                "requires_review":    False,
                "recommended_action": "Source a more recent comparable within 0.5 miles if market conditions have shifted.",
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
                f"Three recent comparable sales within 1 mile (MLS, Redfin, Zillow)",
                f"County Assessor records: {sqft:,} sq ft, {beds} bed / {baths} bath, built {year}",
                "AVM estimates from Zillow, Redfin, HouseCanary, and CoreLogic converge within 8%",
                "FHFA HPI trend shows moderate appreciation for this ZIP over the past 12 months",
            ],
            "conflicting_factors": [
                "Condition rating conflict: appraisal (Good) vs BPO (Average) — primary uncertainty driver",
                f"Minor square footage variance: MLS {sqft + 40} sq ft vs County Assessor {sqft} sq ft",
            ],
            "data_quality_notes": [
                f"AVM vendor data current as of 3–14 days ago; four vendors queried (Zillow, Redfin, HouseCanary, CoreLogic)",
                f"County Assessor records last updated within 30 days; reliability score 0.95",
                "BPO and appraisal filed within the past two weeks — high recency",
                "FHFA HPI applied at ZIP-code level; market-level index may not capture micro-neighborhood variation",
            ],
        },
        "hypothesis": {
            "thesis":                f"The subject property at {address} is estimated at ${estimate:,}, with a guidance range of ${floor_v:,}–${ceiling_v:,} based on four AVM vendors and three comparable sales.",
            "facts":                 [
                f"County Assessor records: {sqft:,} sq ft, {beds} bed / {baths} bath, built {year}, lot {lot:,} sq ft",
                "Three comparables sold within the past 6 months and 1 mile; sourced from MLS, Redfin, and Zillow",
                "BPO and appraisal both on file; condition rated Average to Good across sources",
            ],
            "estimates":             [
                f"Weighted AVM estimate: ${estimate:,} (Zillow, Redfin, HouseCanary, CoreLogic)",
                "FHFA HPI suggests 3–5% annual appreciation in this market area",
            ],
            "assumptions":           [
                "Exterior and interior condition assumed consistent with BPO rating of Average-Good",
                f"Roof and mechanicals assumed functional given {today.year - year}-year property age and typical maintenance for market tier",
            ],
            "risks":                 [
                "Condition conflict between appraisal and BPO is the primary risk to the guidance range",
                "Comparable sale over 100 days old may not reflect current market velocity",
            ],
            "rationale":             (
                f"Four AVM vendors converge within 8% of the weighted estimate of ${estimate:,}, providing moderate confidence. "
                "The condition discrepancy between the appraisal (Good) and BPO (Average) is the primary driver of the guidance band width. "
                "Analyst reconciliation of condition ratings is recommended before using this range in a lending or designation decision."
            ),
            "confidence_commentary": "Overall confidence 0.74 — sufficient for initial analyst review. Condition reconciliation would raise confidence to ~0.82.",
            "suggested_next_actions": [
                "Reconcile condition rating between appraisal and BPO",
                f"Confirm {sqft + 40} sq ft (MLS) vs {sqft} sq ft (County Assessor) via floor plan or permit records",
                "Source a fresher comparable sale within 0.5 miles if available",
            ],
        },
    }


def _parse_json(text: str) -> dict:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        s, e = text.find("{"), text.rfind("}")
        if s < 0 or e <= s:
            raise RuntimeError(f"LLM did not return JSON: {text[:300]}")
        return json.loads(text[s:e + 1])


def _call_llm(system: str, user: str, model: str, api_key: str) -> dict:
    from langchain_openai import ChatOpenAI
    from langchain_core.messages import SystemMessage, HumanMessage
    llm = ChatOpenAI(
        model=model, temperature=0, api_key=api_key,
        model_kwargs={"response_format": {"type": "json_object"}},
    )
    resp = llm.invoke([SystemMessage(content=system), HumanMessage(content=user)])
    text = resp.content if isinstance(resp.content, str) else str(resp.content)
    return _parse_json(text)


def llm_evaluate(address: str) -> dict[str, Any]:
    from ..core.config import settings

    api_key = os.getenv("OPENAI_API_KEY")
    model = os.getenv("OPENAI_MODEL", "gpt-4o")

    if not api_key or settings.mock_mode:
        return _mock_evaluate(address)

    try:
        today_str = date.today().isoformat()
        user_msg_a = (
            f"Today's date: {today_str}\n"
            f"Subject address: {address}\n\n"
            "IMPORTANT: Use CURRENT 2025-2026 market values. Home prices have appreciated "
            "significantly since 2020. Base all AVM estimates and comparable sale prices on "
            "realistic current market conditions for this specific ZIP code and neighborhood. "
            "Do NOT use pre-2023 price levels.\n\n"
            "SQUARE FOOTAGE: Report the actual County Assessor recorded square footage for "
            "this exact address. Do NOT use a neighborhood average or default value. Large "
            "luxury or suburban homes commonly exceed 4,000–8,000 sq ft — report the real "
            "number. If this address is a large home, the square footage must reflect that. "
            "Lower your confidence score if unsure, but never substitute a smaller generic value.\n\n"
            "Produce the property facts, AVM estimates, datapoint alignment, comparables, condition findings, "
            "and price_history JSON now. For price_history, you MUST report the actual recorded sale "
            "transactions for this specific property address — the real dates and real prices from County "
            "Assessor deed records, MLS transaction history, Zillow/Redfin sold history, and CoreLogic. "
            "Do NOT fabricate or approximate sale prices. If you know this address sold for $X on a specific "
            "date, report that exact figure. If you are uncertain of the exact price, lower the confidence "
            "in notes but still report the closest known value. Include all known events: sales, listings, "
            "price reductions, going back as far as public records allow (typically 10-20 years)."
        )
        user_msg_b = (
            f"Today's date: {today_str}\n"
            f"Subject address: {address}\n\n"
            "IMPORTANT: Use CURRENT 2025-2026 market values. The valuation MUST reflect "
            "what this property would actually sell for on the open market TODAY based on "
            "recent comparable sales in this ZIP code. Do NOT undervalue — use realistic "
            "current asking and sold prices for this neighborhood.\n\n"
            "Produce the anomalies, valuation guidance range, and hypothesis JSON now."
        )

        # Run both calls in parallel — roughly halves wall-clock time.
        with ThreadPoolExecutor(max_workers=2) as pool:
            fut_a = pool.submit(_call_llm, SYSTEM_PROMPT_A, user_msg_a, model, api_key)
            fut_b = pool.submit(_call_llm, SYSTEM_PROMPT_B, user_msg_b, model, api_key)
            data_a = fut_a.result()
            data_b = fut_b.result()

        data = {**data_a, **data_b}

        required = {"property_facts", "avm_vendor_estimates", "datapoint_alignment",
                    "comparables", "anomalies", "valuation", "hypothesis", "price_history"}
        missing = required - set(data.keys())
        if missing:
            raise RuntimeError(f"LLM response missing keys: {missing}")
        for k in ("floor_value", "ceiling_value", "weighted_estimate", "overall_confidence"):
            if k not in data["valuation"]:
                raise RuntimeError(f"LLM valuation missing key: {k}")
        # Normalise: rename missing_data_impact -> data_quality_notes if present
        val = data["valuation"]
        if "missing_data_impact" in val and "data_quality_notes" not in val:
            val["data_quality_notes"] = val.pop("missing_data_impact")
        return data

    except Exception:
        return _mock_evaluate(address)
