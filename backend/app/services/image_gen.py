"""Generate a representative exterior property image using DALL-E 3.

The image is clearly labeled as AI-generated — it is a visual aid based on
property facts (year built, size, condition, location context), not an actual
photograph of the subject property.
"""
from __future__ import annotations
import os
from ..data.mock_store import CASES


DISCLAIMER = (
    "AI-generated representative image based on property facts. "
    "Not an actual photograph of the subject property. "
    "For visual reference only — not an appraisal document."
)


def _build_prompt(case: dict) -> str:
    facts = case.get("fields", {})

    def val(key: str) -> str:
        f = facts.get(key)
        return str(f.normalized_value) if f else "unknown"

    address = case.get("address", "")
    parts = address.split(",")
    city_state = ", ".join(parts[1:]).strip() if len(parts) > 1 else ""

    year = val("year_built")
    sqft = val("square_feet")
    beds = val("bedrooms")
    baths = val("bathrooms")
    condition = "good"

    for a in case.get("anomalies", []):
        desc = (a.description if hasattr(a, "description") else a.get("description", "")).lower()
        if "condition" in desc:
            condition = "average"
            break

    return (
        f"Realistic exterior photograph of an American single-family residential home. "
        f"Built approximately {year}, {sqft} square feet, {beds} bedrooms, {baths} bathrooms. "
        f"Condition: {condition}. Located in {city_state}. "
        f"Daytime, overcast natural lighting. Front-facing street view perspective. "
        f"Suburban neighborhood setting. No text, no watermarks, no people."
    )


def generate_property_image(case_id: str) -> dict:
    case = CASES.get(case_id)
    if not case:
        raise ValueError(f"Case {case_id} not found")

    from ..core.config import settings

    if settings.mock_mode:
        return {
            "url": "https://placehold.co/800x500/eef2f7/1f4e8a?text=AI+Image+(mock+mode)",
            "prompt": "Mock mode — enable LLM to generate real imagery.",
            "model": "mock",
            "disclaimer": DISCLAIMER,
        }

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY not set")

    prompt = _build_prompt(case)

    from openai import OpenAI
    client = OpenAI(api_key=api_key)
    response = client.images.generate(
        model="dall-e-3",
        prompt=prompt,
        size="1024x576",
        quality="standard",
        n=1,
    )
    url = response.data[0].url
    return {
        "url": url,
        "prompt": prompt,
        "model": "dall-e-3",
        "disclaimer": DISCLAIMER,
    }
