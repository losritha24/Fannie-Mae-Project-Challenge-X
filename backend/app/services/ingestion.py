"""Document ingestion — PDF/XML parsing with extraction confidence."""
from io import BytesIO
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
