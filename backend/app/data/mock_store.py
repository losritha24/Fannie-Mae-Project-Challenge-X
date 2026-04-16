"""In-memory mock data store — swappable for Postgres/S3/Neo4j in prod."""
from datetime import datetime, timezone, timedelta
from uuid import uuid4
from ..models.schemas import (
    SourceProvenance, ValuedField, Comparable, Anomaly, VisionFinding, GraphNode, GraphEdge
)

NOW = datetime.now(timezone.utc)


def _prov(name: str, rel: float, method="api", days=7) -> SourceProvenance:
    return SourceProvenance(
        source_name=name,
        source_url=f"https://example.org/{name.lower().replace(' ', '-')}",
        retrieval_timestamp=NOW - timedelta(days=days),
        access_method=method,
        freshness_days=days,
        reliability_score=rel,
        legal_basis="public_record" if "FHFA" in name or "HUD" in name or "Assessor" in name else "licensed_api",
    )


CASES: dict[str, dict] = {}


def seed_demo_case() -> str:
    case_id = "CASE-1001"
    CASES[case_id] = {
        "case_id": case_id,
        "address": "123 Maple Street, Austin, TX 78701",
        "parcel_id": "PARCEL-TX-78701-0423",
        "created_at": NOW.isoformat(),
        "fields": {
            "square_feet": ValuedField(
                field_name="square_feet", raw_value="2,104", normalized_value=2104,
                provenance=_prov("County Assessor", 0.95, "public_dataset", 30), confidence=0.93,
            ),
            "bedrooms": ValuedField(
                field_name="bedrooms", raw_value="3", normalized_value=3,
                provenance=_prov("MLS (licensed)", 0.88, "api", 5), confidence=0.9,
            ),
            "bathrooms": ValuedField(
                field_name="bathrooms", raw_value="2.5", normalized_value=2.5,
                provenance=_prov("MLS (licensed)", 0.88, "api", 5), confidence=0.88,
            ),
            "lot_size": ValuedField(
                field_name="lot_size", raw_value="0.18 ac", normalized_value=7840,
                provenance=_prov("County Assessor", 0.95, "public_dataset", 30), confidence=0.9,
            ),
            "year_built": ValuedField(
                field_name="year_built", raw_value="1998", normalized_value=1998,
                provenance=_prov("County Assessor", 0.95, "public_dataset", 30), confidence=0.95,
            ),
        },
        "comparables": [
            Comparable(
                comp_id="C1", address="118 Maple Street", distance_miles=0.05,
                sale_price=465000, sale_date=NOW - timedelta(days=45), square_feet=2050,
                similarity_score=0.92, reliability_score=0.9,
                provenance=_prov("Redfin", 0.78, "api", 5),
            ),
            Comparable(
                comp_id="C2", address="204 Oak Avenue", distance_miles=0.3,
                sale_price=489000, sale_date=NOW - timedelta(days=90), square_feet=2180,
                similarity_score=0.85, reliability_score=0.85,
                provenance=_prov("Zillow", 0.72, "api", 3),
            ),
            Comparable(
                comp_id="C3", address="77 Elm Court", distance_miles=0.8,
                sale_price=512000, sale_date=NOW - timedelta(days=180), square_feet=2240,
                similarity_score=0.74, reliability_score=0.65,
                provenance=_prov("HouseCanary", 0.82, "api", 14),
            ),
        ],
        "anomalies": [
            Anomaly(
                anomaly_id="A1", category="square_footage_mismatch", severity="moderate",
                description="Appraisal reports 2,104 sqft; MLS lists 2,190 sqft (~4% delta).",
                evidence=["appraisal.pdf p.3", "MLS record 2025-03-12"],
                requires_review=True,
            ),
            Anomaly(
                anomaly_id="A2", category="stale_market_data", severity="informational",
                description="Most recent HouseCanary comparable is 180 days old.",
                evidence=["HouseCanary retrieval 2026-04-07"],
                requires_review=False,
            ),
            Anomaly(
                anomaly_id="A3", category="image_condition_mismatch", severity="critical",
                description="Vision model flags visible roof damage inconsistent with 'good' condition rating on appraisal.",
                evidence=["subject_img_04.jpg", "appraisal.pdf p.5"],
                requires_review=True,
            ),
        ],
        "vision_findings": [
            VisionFinding(
                finding_id="V1", finding="Exterior condition rated Good — consistent across appraisal and MLS",
                confidence=0.84,
                explanation="Appraisal (filed 2 days ago) and MLS listing photos confirm Good exterior condition: intact siding, well-maintained landscaping, and no visible structural concerns on the facade.",
                evidence_thumbnails=[],
                limitations="Rear and interior condition not confirmed by appraisal; BPO rates interior as Average-Good.",
            ),
            VisionFinding(
                finding_id="V2", finding="Roof age estimated 28 years — condition monitoring advised",
                confidence=0.74,
                explanation="Based on 1998 construction date per County Assessor and no permit records for roof replacement, the roof is approximately 28 years old. HouseCanary AVM flags roofs over 20 years for condition watch in this market tier.",
                evidence_thumbnails=[],
                limitations="No physical roof inspection on file. Permit history search or inspector report would confirm replacement date.",
            ),
            VisionFinding(
                finding_id="V3", finding="Condition rating conflict: Appraisal (Good) vs BPO (Average-Good)",
                confidence=0.70,
                explanation="The licensed appraisal rates overall condition as Good while the Broker Price Opinion (BPO) rates it Average-Good. The delta is consistent with the BPO's drive-by methodology vs the appraiser's interior access.",
                evidence_thumbnails=[],
                limitations="Condition reconciliation requires reconciling the appraiser's interior inspection notes with the BPO drive-by observation.",
            ),
            VisionFinding(
                finding_id="V4", finding="Mechanicals consistent with typical maintenance for 1998 vintage",
                confidence=0.68,
                explanation="CoreLogic property profile and BPO notes indicate HVAC and water heater are consistent with a once-updated mechanical package typical for 1998-built properties in this Austin market tier.",
                evidence_thumbnails=[],
                limitations="CoreLogic data is public-record derived; a licensed HVAC inspection would provide higher confidence.",
            ),
        ],
        "valuation": {
            "floor_value": 448000.0,
            "ceiling_value": 512000.0,
            "median_value": 478000.0,
            "weighted_estimate": 476500.0,
            "confidence_band_low": 462000.0,
            "confidence_band_high": 494000.0,
            "overall_confidence": 0.74,
            "contributing_factors": [
                "Three comparable sales within 0.8 miles",
                "County assessor lot size and year-built corroborated",
                "FHFA House Price Index trend for ZIP 78701: +3.1% YoY",
            ],
            "conflicting_factors": [
                "Square footage discrepancy between appraisal and MLS (~4%)",
                "Vision finding of possible roof wear not reflected in appraisal condition",
            ],
            "data_quality_notes": [
                "AVM vendor data (HouseCanary, Zillow, Redfin, CoreLogic) queried within the last 14 days; reliability 0.72–0.88",
                "County Assessor records last refreshed 30 days ago; reliability 0.95",
                "BPO filed 1 day ago — high recency; appraisal filed 2 days ago",
                "FHFA HPI applied at ZIP 78701 level; accounts for +3.1% YoY market trend",
            ],
            "model_version": "valuation-reasoner-v0.3",
            "prompt_version": "vp-2026-04-10",
            "data_version": "ds-2026-04-13",
        },
        "documents": [
            {"doc_id": "D1", "filename": "appraisal.pdf", "type": "Appraisal", "pages": 42, "uploaded_at": (NOW - timedelta(days=2)).isoformat(), "extraction_confidence": 0.89},
            {"doc_id": "D2", "filename": "bpo.xml", "type": "Broker Price Opinion (BPO)", "pages": None, "uploaded_at": (NOW - timedelta(days=1)).isoformat(), "extraction_confidence": 0.94},
        ],
        "avm_vendors": [
            {"vendor": "HouseCanary",       "estimate": 471000, "low": 452000, "high": 490000, "confidence": 0.81, "as_of": "2026-04-12"},
            {"vendor": "Zillow (Zestimate)", "estimate": 483000, "low": 461000, "high": 505000, "confidence": 0.72, "as_of": "2026-04-13"},
            {"vendor": "CoreLogic AVM",      "estimate": 468000, "low": 449000, "high": 487000, "confidence": 0.88, "as_of": "2026-04-10"},
            {"vendor": "Redfin Estimate",    "estimate": 478000, "low": 458000, "high": 498000, "confidence": 0.79, "as_of": "2026-04-13"},
            {"vendor": "RedBell",            "estimate": 465000, "low": 445000, "high": 485000, "confidence": 0.76, "as_of": "2026-04-11"},
            {"vendor": "Fannie Mae AVM",     "estimate": 476500, "low": 448000, "high": 512000, "confidence": 0.74, "as_of": "2026-04-14"},
        ],
        "alignment": [
            {"field": "Square Footage",   "appraisal": "2,104 sqft", "bpo": "2,100 sqft", "mls": "2,190 sqft", "vision": "—",            "housecanary": "—",          "zillow": "—",         "county": "2,104 sqft", "status": "conflict", "note": "MLS reports ~4% more than appraisal"},
            {"field": "Condition",        "appraisal": "Good",       "bpo": "Average-Good","mls": "—",          "vision": "Fair (roof)",   "housecanary": "Average",    "zillow": "—",         "county": "—",          "status": "conflict", "note": "Vision flags roof damage vs 'Good' in appraisal"},
            {"field": "Bedrooms",         "appraisal": "3",          "bpo": "3",           "mls": "3",          "vision": "—",            "housecanary": "3",          "zillow": "3",         "county": "—",          "status": "aligned"},
            {"field": "Bathrooms",        "appraisal": "2.5",        "bpo": "2.5",         "mls": "2.5",        "vision": "—",            "housecanary": "2.5",        "zillow": "2.5",       "county": "—",          "status": "aligned"},
            {"field": "Year Built",       "appraisal": "1998",       "bpo": "1998",        "mls": "1998",       "vision": "—",            "housecanary": "1998",       "zillow": "1998",      "county": "1998",       "status": "aligned"},
            {"field": "Lot Size",         "appraisal": "7,840 sqft", "bpo": "7,840 sqft",  "mls": "—",          "vision": "—",            "housecanary": "—",          "zillow": "—",         "county": "7,840 sqft", "status": "aligned"},
            {"field": "Value Estimate",   "appraisal": "$475,000",   "bpo": "$468,000",    "mls": "—",          "vision": "—",            "housecanary": "$471,000",   "zillow": "$483,000",  "county": "—",          "status": "partial", "note": "$7K delta appraisal vs BPO; Zillow highest at $483K"},
        ],
    }
    return case_id


def build_graph(case_id: str) -> tuple[list[GraphNode], list[GraphEdge]]:
    c = CASES[case_id]
    nodes = [
        GraphNode(id=case_id, type="Property", label=c["address"]),
        GraphNode(id=c["parcel_id"], type="Parcel", label=c["parcel_id"]),
        GraphNode(id="SRC-FHFA", type="Source", label="Federal Housing Finance Agency (FHFA)"),
        GraphNode(id="SRC-HUD", type="Source", label="U.S. Department of Housing and Urban Development (HUD)"),
        GraphNode(id="SRC-ASSESSOR", type="Source", label="County Assessor"),
        GraphNode(id="SRC-MLS", type="Source", label="Multiple Listing Service (MLS)"),
        GraphNode(id="D1", type="Appraisal", label="appraisal.pdf"),
        GraphNode(id="D2", type="BrokerPriceOpinion", label="bpo.xml"),
        GraphNode(id="AVM-1", type="AutomatedValuationModelOutput", label="AVM estimate $476.5K"),
    ]
    for comp in c["comparables"]:
        nodes.append(GraphNode(id=comp.comp_id, type="ComparableProperty", label=comp.address))
    for a in c["anomalies"]:
        nodes.append(GraphNode(id=a.anomaly_id, type="Anomaly", label=a.category))

    edges = [
        GraphEdge(source=case_id, target=c["parcel_id"], relationship="HAS_PARCEL",
                  explanation="Subject property is recorded on this parcel."),
        GraphEdge(source=case_id, target="D1", relationship="HAS_REPORT",
                  explanation="Appraisal report attached to the case."),
        GraphEdge(source=case_id, target="D2", relationship="HAS_REPORT",
                  explanation="Broker Price Opinion attached to the case."),
        GraphEdge(source=c["parcel_id"], target="SRC-ASSESSOR", relationship="RETRIEVED_FROM_SOURCE",
                  explanation="Parcel facts sourced from the County Assessor public record."),
        GraphEdge(source="AVM-1", target=case_id, relationship="DERIVED_FROM",
                  explanation="AVM output computed from comparables, FHFA trend, and appraisal."),
    ]
    for comp in c["comparables"]:
        edges.append(GraphEdge(source=case_id, target=comp.comp_id, relationship="HAS_COMPARABLE",
                               explanation=f"Comparable {comp.distance_miles} mi away, similarity {comp.similarity_score:.2f}."))
    for a in c["anomalies"]:
        edges.append(GraphEdge(source=case_id, target=a.anomaly_id, relationship="HAS_ANOMALY",
                               explanation=a.description))
    return nodes, edges


seed_demo_case()
