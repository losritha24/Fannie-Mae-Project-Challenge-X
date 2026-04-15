"""Data retention and usage policy (served to the UI for transparency).

This is the single source of truth for how long each data class is retained,
the lawful basis, and whether the data is eligible to enter the model context.
"""

RETENTION_POLICY = {
    "policy_version": "1.0",
    "effective_date": "2026-04-14",
    "classes": [
        {
            "class": "public_record",
            "examples": ["County Assessor", "FHFA", "HUD"],
            "retention_days": 2555,  # 7 years
            "lawful_basis": "public_record",
            "model_eligible": True,
            "notes": "Public-record facts retained for audit and repeatability."
        },
        {
            "class": "licensed_market_data",
            "examples": ["MLS", "CoreLogic", "HouseCanary"],
            "retention_days": 1825,  # 5 years
            "lawful_basis": "contract",
            "model_eligible": True,
            "notes": "Subject to provider terms; deleted on license termination."
        },
        {
            "class": "market_signal",
            "examples": ["Zillow", "Redfin"],
            "retention_days": 1095,  # 3 years
            "lawful_basis": "contract",
            "model_eligible": True,
            "notes": "Signal-grade; never treated as source of truth."
        },
        {
            "class": "uploaded_documents",
            "examples": ["appraisal.pdf", "bpo.xml"],
            "retention_days": 2555,  # 7 years (valuation record)
            "lawful_basis": "business_record",
            "model_eligible": True,
            "notes": "Encrypted at rest; signed-URL access; virus-scanned on upload."
        },
        {
            "class": "property_images",
            "examples": ["subject_img_*.jpg"],
            "retention_days": 2555,
            "lawful_basis": "business_record",
            "model_eligible": True,
            "notes": "EXIF stripped server-side; no face recognition."
        },
        {
            "class": "consumer_report_adjacent",
            "examples": ["credit data", "tenant screening"],
            "retention_days": 730,
            "lawful_basis": "FCRA_permissible_purpose",
            "model_eligible": False,
            "notes": "Access-controlled; purpose checked; NEVER fed into general model context."
        },
        {
            "class": "ai_interaction_log",
            "examples": ["chatbot Q&A", "agent tool calls"],
            "retention_days": 2555,
            "lawful_basis": "audit_and_model_risk_management",
            "model_eligible": False,
            "notes": "Captures model, prompt version, data version, confidence, classification."
        },
        {
            "class": "audit_event_log",
            "examples": ["case state changes", "reviewer decisions"],
            "retention_days": 2555,
            "lawful_basis": "regulatory_audit",
            "model_eligible": False,
            "notes": "Append-only, immutable, legal-hold compatible."
        },
        {
            "class": "authentication_logs",
            "examples": ["login / logout / MFA events"],
            "retention_days": 730,
            "lawful_basis": "security_monitoring",
            "model_eligible": False,
            "notes": "No passwords or tokens stored; redacted secrets."
        }
    ],
    "deletion": {
        "user_initiated": "supported via /admin/retention (admin role)",
        "legal_hold": "suspends deletion until released by compliance",
        "crypto_shred": "object-storage keys rotated to render encrypted data unreadable"
    },
    "ai_governance": {
        "model_ecosystem_usage": [
            "Prompts include ONLY property data, never consumer-report data.",
            "LLM provider terms must forbid training on submitted data.",
            "No protected-class attributes or proxies are sent to the model.",
            "All model calls are logged with model/version/prompt/data versions."
        ]
    }
}
