from pydantic import BaseModel, Field
from typing import Literal, Optional, Any, List
from datetime import datetime


class SourceProvenance(BaseModel):
    source_name: str
    source_url: Optional[str] = None
    source_identifier: Optional[str] = None
    retrieval_timestamp: datetime
    access_method: Literal["api", "file_upload", "manual_entry", "public_dataset"]
    freshness_days: Optional[int] = None
    reliability_score: float = Field(ge=0.0, le=1.0)
    legal_basis: str = "public_record"


class ValuedField(BaseModel):
    field_name: str
    raw_value: Any
    normalized_value: Any
    provenance: SourceProvenance
    confidence: float = Field(ge=0.0, le=1.0)


class PropertyIntake(BaseModel):
    address_line: str
    city: str
    state: str
    zip_code: str
    parcel_id: Optional[str] = None
    notes: Optional[str] = None
    selected_sources: Optional[List[str]] = None


class PropertySummary(BaseModel):
    case_id: str
    address: str
    parcel_id: Optional[str]
    square_feet: Optional[ValuedField] = None
    bedrooms: Optional[ValuedField] = None
    bathrooms: Optional[ValuedField] = None
    lot_size: Optional[ValuedField] = None
    year_built: Optional[ValuedField] = None


class ValuationRange(BaseModel):
    floor_value: float
    ceiling_value: float
    median_value: float
    weighted_estimate: float
    confidence_band_low: float
    confidence_band_high: float
    overall_confidence: float
    contributing_factors: list[str]
    conflicting_factors: list[str]
    missing_data_impact: list[str]
    model_version: str
    prompt_version: str
    data_version: str
    disclaimer: str = (
        "Model-generated guidance range. Not a licensed appraisal. "
        "Analyst review required for decisions."
    )


class Comparable(BaseModel):
    comp_id: str
    address: str
    distance_miles: float
    sale_price: Optional[float]
    sale_date: Optional[datetime]
    square_feet: Optional[int]
    similarity_score: float
    reliability_score: float
    provenance: SourceProvenance


class Anomaly(BaseModel):
    anomaly_id: str
    category: str
    severity: Literal["informational", "moderate", "critical"]
    description: str
    evidence: list[str]
    requires_review: bool
    status: Literal["open", "flagged_for_review", "acknowledged", "dismissed", "resolved"] = "open"


class VisionFinding(BaseModel):
    finding_id: str
    finding: str
    confidence: float
    explanation: str
    evidence_thumbnails: list[str]
    limitations: str


class ChatCitation(BaseModel):
    source_name: str
    source_ref: str
    excerpt: str


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str
    citations: list[ChatCitation] = []
    classification: Optional[Literal["fact", "estimate", "anomaly", "assumption", "recommendation"]] = None
    confidence: Optional[float] = None


class ChatRequest(BaseModel):
    case_id: str
    question: str


class ChatResponse(BaseModel):
    direct_answer: str
    supporting_evidence: list[ChatCitation]
    confidence: float
    data_gaps: list[str]
    suggested_next_action: str
    classification: Literal["fact", "estimate", "anomaly", "assumption", "recommendation"]


class GraphNode(BaseModel):
    id: str
    type: str
    label: str
    provenance: Optional[SourceProvenance] = None


class GraphEdge(BaseModel):
    source: str
    target: str
    relationship: str
    explanation: str


class GraphResponse(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
