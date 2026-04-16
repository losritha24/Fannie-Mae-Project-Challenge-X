"""Document ingestion — PDF/XML parsing with extraction confidence and AI analysis."""
from io import BytesIO
import json
import os
from pypdf import PdfReader
from lxml import etree


def extract_pdf(content: bytes) -> dict:
    reader = PdfReader(BytesIO(content))
    pages = []
    for i, page in enumerate(reader.pages):
        try:
            text = page.extract_text() or ""
        except Exception:
            text = ""
        pages.append({"page": i + 1, "text": text, "char_count": len(text)})
    native_chars = sum(p["char_count"] for p in pages)
    confidence = 0.9 if native_chars > 200 else 0.4
    return {
        "type": "pdf",
        "page_count": len(pages),
        "pages": pages,
        "extraction_confidence": confidence,
        "ocr_required": native_chars < 200,
    }


def analyze_document_with_ai(extracted_text: str, filename: str) -> dict:
    """Run extracted document text through the LLM for property-focused analysis."""
    api_key = os.getenv("OPENAI_API_KEY", "")
    mock = os.getenv("MOCK_MODE", "false").lower() == "true"

    if not api_key or mock:
        return _mock_doc_analysis(filename)

    try:
        from openai import OpenAI
        client = OpenAI(api_key=api_key)
        model = os.getenv("OPENAI_MODEL", "gpt-4o")

        system = """You are a U.S. residential real estate document analyst.
Analyze the provided document text and extract key property-related information.
Return ONLY valid JSON with these keys:
{
  "document_type": "<e.g. Appraisal Report, Purchase Agreement, Inspection Report, Tax Record, etc.>",
  "summary": "<2-3 sentence plain-English summary of the document>",
  "key_facts": [{"field": "<field name>", "value": "<value>", "significance": "<why it matters>"}],
  "flags": [{"issue": "<issue title>", "detail": "<detail>", "severity": "low|moderate|high"}],
  "property_address": "<address if found, else null>",
  "valuation_impact": "<how this document affects property valuation>",
  "confidence": <0.0-1.0 confidence in extraction quality>
}"""

        # Truncate text to avoid token limits
        text_excerpt = extracted_text[:6000] if len(extracted_text) > 6000 else extracted_text
        user_msg = f"Filename: {filename}\n\nDocument text:\n{text_excerpt}"

        resp = client.chat.completions.create(
            model=model,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user_msg}],
            temperature=0.1,
            max_tokens=1200,
        )
        raw = resp.choices[0].message.content or ""
        # Strip markdown code fences if present
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        return json.loads(raw.strip())
    except Exception as e:
        return _mock_doc_analysis(filename, error=str(e))


def _mock_doc_analysis(filename: str, error: str = "") -> dict:
    return {
        "document_type": "Property Document",
        "summary": f"Document '{filename}' was received and parsed. AI analysis ran in mock mode — "
                   "connect an OpenAI key for full extraction.",
        "key_facts": [
            {"field": "Filename", "value": filename, "significance": "Uploaded document identifier"},
        ],
        "flags": [{"issue": "Mock mode active", "detail": error or "No OpenAI key configured", "severity": "low"}],
        "property_address": None,
        "valuation_impact": "Unable to assess — AI analysis unavailable in mock mode.",
        "confidence": 0.1,
    }


def extract_xml(content: bytes) -> dict:
    try:
        root = etree.fromstring(content)
    except etree.XMLSyntaxError as e:
        return {"type": "xml", "error": str(e), "extraction_confidence": 0.0}
    fields = {}
    for el in root.iter():
        if el.text and el.text.strip() and len(el) == 0:
            fields[el.tag] = el.text.strip()
    return {
        "type": "xml",
        "root_tag": root.tag,
        "fields_extracted": len(fields),
        "fields": dict(list(fields.items())[:50]),
        "extraction_confidence": 0.95 if fields else 0.3,
    }
