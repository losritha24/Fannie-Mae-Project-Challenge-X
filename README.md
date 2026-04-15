# Agentic AI Property Valuation and Property Designation Assistant

An analyst-facing decision-support application that ingests fragmented property and
market data, extracts valuation products (PDF/XML), analyzes property imagery, reconciles
evidence across sources, detects anomalies, and answers drill-down questions through an
evidence-grounded LangChain agent — with full provenance, confidence, and audit trail.

> **Disclaimer.** This system provides analyst decision-support only. It is not a
> licensed appraisal, lending, legal, or compliance judgment. Every material output
> carries source provenance, a confidence score, and a human review checkpoint.

---

## Quick start

```bash
cp .env.example .env          # then edit .env and set OPENAI_API_KEY
./start.sh                    # backend on :2727, frontend on :1717
# visit http://localhost:1717
./stop.sh
```

- **Frontend:** <http://localhost:1717>
- **Backend API:** <http://localhost:2727/health> · Swagger at `/docs`
- **Demo login:** `analyst / demo` (roles: `analyst`, `reviewer`, `compliance`, `auditor`, `admin`)
- **Mock mode** is on by default — the system runs without real source APIs using a seeded `CASE-1001`.

---

## Architecture overview

```mermaid
flowchart LR
    subgraph UI["React UI (port 1717)"]
        DASH[Dashboard]
        WS[Property Workspace]
        KG[Knowledge Graph View]
        AUD[Audit & History]
    end

    subgraph API["FastAPI Gateway (port 2727)"]
        AUTH[/auth/]
        CASES[/cases/]
        DOCS[/documents/]
        SRC[/sources/]
        VAL[/valuations/]
        CMP[/comparables/]
        AN[/anomalies/]
        IMG[/images/]
        GR[/graph/]
        CHAT[/chat/]
        AGENT[/agent/chat/]
        HIST[/history/]
    end

    subgraph SVC["Service Layer (Python)"]
        INGEST[Ingestion Service<br/>PDF · XML · OCR fallback]
        NORM[Normalization &<br/>Reconciliation]
        RECON[Valuation Reasoning]
        CV[Computer Vision]
        ANOM[Anomaly Detection]
        BOT[Rule-based Chatbot]
        LCA[LangChain Agent<br/>GPT-5.4]
        KGS[Knowledge Graph]
        AUDIT[Audit / Event Log]
    end

    subgraph DATA["Data & Storage"]
        PG[(PostgreSQL<br/>raw · canonical · audit)]
        OBJ[(Object Storage<br/>docs · images)]
        VEC[(Vector Store)]
        GDB[(Graph DB)]
        REDIS[(Redis)]
    end

    subgraph EXT["Trusted External Sources"]
        FHFA[FHFA]
        HUD[HUD]
        CAS[County Assessor]
        MLS[MLS licensed]
        ZR[Zillow / Redfin / HouseCanary / CoreLogic]
    end

    UI --> API
    API --> SVC
    SVC --> DATA
    SVC -. authorized connectors .-> EXT
    LCA -->|tool calls<br/>grounded| SVC
```

**Principles**

- Evidence-first: every number carries `source_name`, `retrieval_timestamp`, `reliability_score`, `confidence`.
- Facts · estimates · inferences · model outputs are stored and displayed separately.
- Raw source truth is never overwritten — reconciliation sits in a separate layer.
- Human-in-the-loop is required for `moderate` and `critical` anomalies.

---

## Repository layout

```
challengex-fnma/
├── start.sh · stop.sh · .env.example
├── backend/
│   ├── requirements.txt
│   └── app/
│       ├── main.py                 # FastAPI app, CORS, correlation IDs
│       ├── api/routes.py           # /api/v1/* endpoints
│       ├── core/
│       │   ├── config.py           # settings (pydantic-settings)
│       │   ├── security.py         # JWT, RBAC, demo user store
│       │   └── audit.py            # append-only event log
│       ├── models/schemas.py       # Pydantic contracts w/ provenance + confidence
│       ├── services/
│       │   ├── ingestion.py        # PDF (pypdf) + XML (lxml) extraction
│       │   ├── chatbot.py          # deterministic rule-based drill-down
│       │   └── agent.py            # LangChain agent w/ grounded tools (GPT-5.4)
│       └── data/mock_store.py      # seeded demo case CASE-1001
└── frontend/
    ├── package.json · vite.config.ts · tsconfig.json · index.html
    └── src/
        ├── App.tsx · main.tsx · styles.css
        ├── api/client.ts
        └── pages/{Dashboard,Workspace,GraphView,Audit}.tsx
```

---

## LangChain agent (GPT-5.4)

The `/api/v1/agent/chat` endpoint runs a tool-using agent whose tools are bound to the
case store. The LLM cannot see anything the tools don't return, which keeps answers
**grounded in case evidence** rather than model priors.

**Tools exposed to the agent (read-only):**

- `get_valuation` — current range + contributing/conflicting factors
- `list_comparables` — comparables with provenance and reliability
- `list_anomalies` — anomalies with severity and evidence
- `list_documents` — uploaded PDF/XML valuation products
- `list_vision_findings` — CV findings with confidence and limitations
- `get_property_facts` — normalized sqft/beds/baths/lot/year w/ source

**System-prompt invariants** (see [`backend/app/services/agent.py`](backend/app/services/agent.py)):
answer only from tool results, classify every answer (`fact` / `estimate` / `anomaly` /
`assumption` / `recommendation`), include confidence and data gaps, refuse legal or
appraisal certification, and never use or infer protected-class attributes.

If `OPENAI_API_KEY` is missing or the LLM call fails, the endpoint transparently falls
back to the deterministic rule-based chatbot so the UI stays functional. Both paths are
logged to the audit event store with engine name, classification, and confidence.

> **Security note.** The OpenAI API key you pasted during development was leaked in
> plaintext in a chat transcript. **Rotate it immediately** and re-issue a fresh key
> into `.env` (which is `.gitignored`).

---

## Sequence flows (mermaid)

### 1. Property intake → case creation

```mermaid
sequenceDiagram
    actor A as Valuation Analyst
    participant UI as React UI
    participant API as FastAPI /cases
    participant AUD as Audit Log
    participant DB as PostgreSQL

    A->>UI: Enter address + parcel + notes
    UI->>API: POST /api/v1/cases
    API->>API: Pydantic validate (PropertyIntake)
    API->>DB: INSERT case, normalized fields
    API->>AUD: log_event("case.create", actor, case_id)
    API-->>UI: 201 Case { case_id, status: "awaiting_sources" }
    UI-->>A: Workspace opens with intake card
```

### 2. Document ingestion (PDF / XML)

```mermaid
sequenceDiagram
    actor A as Analyst
    participant UI as React UI
    participant API as /documents/upload
    participant ING as Ingestion Service
    participant OBJ as Object Storage
    participant AUD as Audit Log

    A->>UI: Upload appraisal.pdf / bpo.xml
    UI->>API: multipart POST (case_id, file)
    API->>OBJ: store raw file (signed URL)
    API->>ING: extract_pdf() / extract_xml()
    ING->>ING: detect native text · fields · tables
    ING-->>API: pages, fields, extraction_confidence, ocr_required
    API->>AUD: log_event("document.upload", confidence, doc_id)
    API-->>UI: { doc_id, extraction_confidence }
    UI-->>A: Document Intelligence View (extracted vs. original, low-conf flagged)
```

### 3. Source aggregation & reconciliation

```mermaid
sequenceDiagram
    participant JOB as Background Worker
    participant FHFA
    participant CAS as County Assessor
    participant MLS
    participant MKT as Zillow/Redfin/HouseCanary
    participant NORM as Normalization
    participant RECON as Reconciliation
    participant DB as Raw + Canonical Tables

    JOB->>FHFA: HPI ZIP trend (public)
    JOB->>CAS: parcel, lot, year_built (public)
    JOB->>MLS: bed/bath/sqft (licensed)
    JOB->>MKT: AVM + listing signals (market)
    FHFA-->>JOB: values + provenance
    CAS-->>JOB: values + provenance
    MLS-->>JOB: values + provenance
    MKT-->>JOB: values + provenance
    JOB->>DB: append to RAW tables (never overwritten)
    JOB->>NORM: address · units · types
    NORM->>RECON: candidate values per field
    RECON->>RECON: reliability-weighted pick + flag conflicts
    RECON->>DB: canonical + provenance chain
```

### 4. Valuation reasoning with explainability

```mermaid
sequenceDiagram
    actor A as Analyst
    participant UI
    participant VAL as /valuations/{case_id}
    participant RSN as Valuation Reasoner
    participant RECON as Reconciled Evidence
    participant MV as Model/Version Registry

    A->>UI: Open Workspace
    UI->>VAL: GET valuation
    VAL->>RECON: fetch comps, facts, anomalies
    VAL->>RSN: compute floor · ceiling · median · weighted · band
    RSN->>RSN: list contributing / conflicting / missing-data factors
    RSN->>MV: stamp model_version · prompt_version · data_version
    VAL-->>UI: ValuationRange (+ disclaimer)
    UI-->>A: Range card + factor lists + plain-language summary
```

### 5. Computer vision finding

```mermaid
sequenceDiagram
    participant UP as Image Upload
    participant CV as Vision Pipeline
    participant ANOM as Anomaly Detector
    participant UI
    actor QC as QC Reviewer

    UP->>CV: subject + comparable images
    CV->>CV: condition cues · similarity · duplicate detection
    CV-->>ANOM: finding + confidence + evidence thumbs + limitations
    ANOM->>ANOM: compare vs. doc-declared condition
    ANOM-->>UI: VisionFinding + possible anomaly (e.g. roof wear vs "good")
    UI-->>QC: Review required (critical)
    QC->>UI: acknowledge / dismiss / escalate w/ notes
    UI->>ANOM: POST /anomalies/{id}/review (logged)
```

### 6. Chatbot drill-down (LangChain agent)

```mermaid
sequenceDiagram
    actor A as Analyst
    participant UI
    participant API as /agent/chat
    participant AG as LangChain Agent (GPT-5.4)
    participant T as Grounded Tools
    participant STORE as Case Store
    participant AUD as Audit Log

    A->>UI: "Why is the estimated range so wide?"
    UI->>API: POST { case_id, question }
    API->>AUD: log_event("agent.question")
    API->>AG: invoke(system_prompt + question)
    AG->>T: get_valuation()
    T->>STORE: read canonical valuation
    T-->>AG: factors + band + model version
    AG->>T: list_anomalies()
    T-->>AG: anomaly A1 (sqft mismatch), A3 (image condition)
    AG->>T: list_comparables()
    T-->>AG: comps with reliability
    AG->>AG: compose JSON: answer + citations + classification + confidence + gaps + next action
    AG-->>API: ChatResponse
    API->>AUD: log_event("agent.answer", engine, confidence)
    API-->>UI: answer + citations
    UI-->>A: Direct answer · evidence pills · confidence · gaps · suggested next action
```

### 7. Knowledge graph drill-down

```mermaid
sequenceDiagram
    actor A as Analyst
    participant UI as Graph View
    participant API as /graph/{case_id}
    participant KG as Graph Builder
    participant DB

    A->>UI: Open Knowledge Graph
    UI->>API: GET graph
    API->>KG: build_graph(case_id)
    KG->>DB: fetch property, parcel, sources, reports, comps, anomalies
    KG-->>API: nodes[] + edges[] with explanations
    API-->>UI: GraphResponse
    A->>UI: click node (e.g. AVM-1)
    UI-->>A: relationships + plain-language "why"
```

### 8. Anomaly review workflow (human-in-the-loop)

```mermaid
sequenceDiagram
    participant DET as Anomaly Detector
    participant UI
    actor QC as QC / Compliance Reviewer
    participant API as /anomalies/.../review
    participant AUD as Audit Log

    DET-->>UI: anomaly (severity=critical, requires_review=true)
    UI-->>QC: highlighted in queue
    QC->>UI: choose decision + notes
    UI->>API: POST review (requires reviewer role)
    API->>AUD: append-only immutable event
    API-->>UI: anomaly.status updated
```

### 9. Audit timeline replay

```mermaid
sequenceDiagram
    actor AU as Audit Reviewer
    participant UI as Audit View
    participant API as /history/{case_id}
    participant LOG as Event Log (append-only)

    AU->>UI: Open case audit
    UI->>API: GET /history/CASE-1001
    API->>LOG: fetch events by entity_id
    LOG-->>API: ordered events (actor, action, details, ts)
    API-->>UI: timeline
    UI-->>AU: Replayable history: uploads, source pulls, model runs, reviews, overrides
```

---

## Data model highlights

- **Raw-source tables** — immutable, one row per retrieval with full provenance.
- **Canonical tables** — normalized values with reliability-weighted chosen source.
- **Reconciliation tables** — conflict records (never silently merged).
- **Event log** — append-only, correlation-ID tagged; source of truth for audit.
- **Model run table** — every AI call records model, prompt version, data version, confidence, classification.

Every `ValuedField` carries both `raw_value` and `normalized_value`, plus a `SourceProvenance`
with `source_name`, `source_url`, `retrieval_timestamp`, `access_method`, `freshness_days`,
`reliability_score`, and `legal_basis`.

---

## API surface (v1)

| Domain       | Verb | Path                                         | Notes |
|--------------|------|----------------------------------------------|-------|
| Auth         | POST | `/api/v1/auth/login`                         | JWT + role |
| Cases        | GET/POST | `/api/v1/cases`, `/cases/{id}`           | intake, listing |
| Documents    | POST | `/api/v1/documents/upload`                   | PDF / XML; returns extraction confidence |
| Sources      | GET  | `/api/v1/sources/available`                  | reliability scores |
| Valuation    | GET  | `/api/v1/valuations/{case_id}`               | floor/ceiling/band + factors |
| Comparables  | GET  | `/api/v1/comparables/{case_id}`              | provenance + similarity |
| Anomalies    | GET/POST | `/api/v1/anomalies/{case_id}[/{id}/review]` | RBAC: reviewer roles |
| Images       | GET  | `/api/v1/images/{case_id}/findings`          | CV findings + limitations |
| Graph        | GET  | `/api/v1/graph/{case_id}`                    | nodes + edges w/ explanations |
| Chat         | POST | `/api/v1/chat`                               | deterministic rule-based |
| Agent        | POST | `/api/v1/agent/chat`                         | LangChain + GPT-5.4 |
| History      | GET  | `/api/v1/history/{case_id}` · `/history`     | timeline (global: auditor role) |
| Reports      | GET  | `/api/v1/reports/{case_id}/summary`          | export payload |

Every request/response is typed (Pydantic); every call gets an `X-Correlation-Id` header.

---

## Compliance regulations followed

The application is designed to support analyst workflows under the following U.S.
housing, fair-lending, privacy, accessibility, and AI-governance regimes. This is a
technical-controls map, **not a legal certification** — compliance ownership sits with
the deploying institution's Legal, Compliance, and Risk functions.

| # | Regulation / Framework | Scope | How the system supports compliance |
|---|------------------------|-------|------------------------------------|
| 1 | **Fair Housing Act (FHA, 42 U.S.C. §3601 et seq.)** | Prohibits discrimination based on race, color, religion, sex, disability, familial status, national origin | Protected-class attributes are excluded from the data model, agent prompt, and reasoner; agent system prompt forbids use or inference; proxy-feature review flag route exists |
| 2 | **Equal Credit Opportunity Act (ECOA) / Regulation B (12 CFR Part 1002)** | Fair lending, adverse-action reasons | Valuation outputs include **factor-level explanations** (contributing / conflicting / missing-data factors) suitable for adverse-action reason codes; no black-box final decisions |
| 3 | **HUD Fair Housing guidance on appraisal bias (PAVE Task Force)** | Property-valuation discrimination | Human review required for `moderate` and `critical` anomalies; appraisal vs. AVM vs. BPO vs. market signals kept **separately visible**; vision findings carry limitations statements |
| 4 | **Interagency Guidance on Model Risk Management (SR 11-7 / OCC 2011-12)** | Model governance | Every model output stamps `model_version`, `prompt_version`, `data_version`; append-only event log provides reproducibility; confidence displayed; fallback paths visible |
| 5 | **CFPB guidance on Automated Valuation Models (AVMs) — Dodd-Frank §1473(q)** | AVM quality controls: accuracy, data integrity, conflict-of-interest, random sample testing, anti-discrimination | Reliability-weighted multi-source reconciliation; raw vs. normalized retained; conflict flags surfaced; audit trail enables testing samples; protected-class exclusion |
| 6 | **Fair Credit Reporting Act (FCRA, 15 U.S.C. §1681)** | Consumer reports require permissible purpose | Consumer-report / tenant-screening / credit-adjacent data is **segregated** behind access controls with purpose checks and an auditable access trail; never mixed into general model context |
| 7 | **Gramm-Leach-Bliley Act (GLBA) — Safeguards Rule** | Non-public personal info (NPI) protection | Encryption in transit and at rest, role-based access control, secrets management, signed URLs for document/image access, redaction of secrets from logs |
| 8 | **State privacy laws — CCPA/CPRA, VCDPA, CPA, etc.** | Consumer rights: access, deletion, opt-out | Data classified by sensitivity; retention rules by document/source class; deletion + legal-hold + audit-retention patterns supported |
| 9 | **NIST AI Risk Management Framework (AI RMF 1.0) — Govern · Map · Measure · Manage** | Trustworthy AI characteristics | Explainability (factor lists + citations), reliability (confidence + limitations), safety (human review gates), accountability (audit log + model registry), validity (source grounding), fairness (protected-class exclusion + fairness-review flag) |
| 10 | **NIST SP 800-53 / 800-63 (access control, auth)** | Federal security baseline | JWT auth, RBAC for analyst / reviewer / compliance / auditor / admin, least-privilege endpoints, rate-limiting surface, environment separation |
| 11 | **OWASP ASVS / Top 10** | Application security | Typed request validation, structured errors, correlation IDs, CORS allow-list, file-type validation on uploads, prompt-injection-resistant retrieval (agent tools return structured JSON only) |
| 12 | **WCAG 2.1 AA · Section 508** | Accessibility | Semantic landmarks (`nav`, `main`, `role=region`), keyboard-friendly controls, ARIA labels, high-contrast palette, no color-only signaling, plain-language summaries under charts, abbreviation expansion on first use (AVM, FHFA, HUD, BPO, MLS) |
| 13 | **NY DFS Part 500 / EU AI Act (high-risk AI transparency)** | AI transparency, oversight | User-visible disclaimer that the tool is decision-support (not licensed appraisal); AI use is logged with task, model, prompt version, sources, confidence, limitations |
| 14 | **Data-provider licensing & terms (MLS IDX rules, Zillow/Redfin/HouseCanary/CoreLogic ToS, robots.txt)** | Contractual / access-control compliance | Source connectors respect authorized integration paths; `legal_basis` recorded per retrieval; no scraping in violation of provider permissions |

### Responsible-AI controls (summary)

- **Explainability** — factor-level reasons on every estimate; citations on every chatbot answer.
- **Traceability** — append-only event log · model/prompt/data version stamping · correlation IDs.
- **Human-in-the-loop** — moderate/critical anomalies cannot be auto-closed.
- **Source grounding** — agent tools are the only path to facts; no free-form "recall".
- **Confidence & limitations** — displayed on every AI output, never hidden.
- **Fairness** — protected-class attributes excluded from schemas and prompts; proxy-feature review route.
- **Reproducibility** — deterministic fallback; versioned prompts; immutable event log enables replay.

---

## MVP scope (implemented in this repo)

- [x] Property intake (address + parcel + notes)
- [x] PDF/XML upload with extraction confidence
- [x] Source catalog (FHFA, HUD, County Assessor, MLS, Zillow, Redfin, HouseCanary, CoreLogic)
- [x] Comparable property table with provenance
- [x] Anomaly detection w/ severity + evidence + review gate
- [x] Valuation guidance range with factor lists + version stamps
- [x] Chatbot drill-down (rule-based + LangChain agent with GPT-5.4)
- [x] Knowledge graph view (nodes + edges + explanations)
- [x] Audit trail (append-only event log)
- [x] JWT auth + role-based access control
- [x] Mock-data mode so the demo runs with zero external dependencies

## Phase-wise roadmap

1. **Phase 1 (this MVP)** — local mock, LangChain agent, seeded case, UI skeleton.
2. **Phase 2** — PostgreSQL + S3 + Redis + real source connectors (FHFA, HUD, one market source).
3. **Phase 3** — Neo4j knowledge graph, vector store for doc retrieval, OCR fallback, CV model.
4. **Phase 4** — Production hardening: SSO/SAML, KMS, WAF, SOC 2 controls, model-monitoring, bias testing.
5. **Phase 5** — Multi-tenant, export to GSE-compatible formats, regulator-facing reports.

## Risks, assumptions, open questions

- "GPT-5.4" is used per project directive; swap `OPENAI_MODEL` in `.env` if a different model is required.
- Mock store is in-memory and resets on restart; production deployments must migrate to PostgreSQL + S3.
- Vision findings in the demo are illustrative; real deployment needs a trained model plus human calibration.
- Protected-class exclusion relies on input schemas — production must add automated proxy-feature scans.

---

## Testing suggestions

- **Unit:** Pydantic contract tests for `ValuedField` and `ValuationRange`; ingestion service on sample PDF/XML.
- **Integration:** `/cases` → `/documents/upload` → `/valuations` happy path; RBAC denial paths.
- **Agent:** snapshot tests that assert the agent never returns a numeric claim without a citation.
- **Fairness:** fuzz tests that inject protected-class-like fields and assert they never appear in prompts or outputs.
- **Audit:** verify every state-changing endpoint appends an immutable event.
