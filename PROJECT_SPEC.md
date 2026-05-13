# AIstivus — Project Specification v2.0
> AI-Powered Job Search Management Platform
> Version 2.0 — Phases 0–0.4 Complete, Phase 1.0 Active

---

## 1. Executive Summary

AIstivus is an open-source, locally-hosted web application that gives job seekers a structured,
AI-assisted command center for managing their entire job search lifecycle — from discovery through
application, evaluation, and document generation.

**Tagline:** *"AI Job Search Helper for the Rest of Us"*

**Design philosophy:** Ship working software first. Every phase must produce something immediately
useful. Architecture serves the user, not the other way around.

**Primary goal (Phases 1.0–1.3):** A working personal job search tool the primary developer can
use daily. Evaluations, job tracking tied to applications, Typst-based resume/document generation,
a redesigned jobs UI, and Docker deployment. Everything else is future work.

---

## 2. Problem Statement

Job seekers conducting active, high-volume searches face a fragmented workflow:

- Evaluation of fit requires reloading personal context into every AI session
- Application tracking lives in spreadsheets that quickly become stale
- Resume tailoring is time-consuming and inconsistently applied
- No single tool connects discovery → evaluation → tailoring → tracking

---

## 3. Goals

### Primary Goals (Phases 1.0–1.3)
- Working evaluation pipeline with local (Ollama) and cloud (Anthropic) models
- Job and application tracking with full audit history
- Typst-based document generation (import, compile, view)
- Redesigned React/TypeScript frontend
- Docker deployment for consistent local use

### Secondary Goals
- Be model-agnostic — not locked into any one AI provider
- Be open source and community-extensible
- Eventually support multiple simultaneous job searches (Projects concept)

### Explicitly Out of Scope (current phases)
- Automated job scraping
- In-app resume chunk library and AI-assisted generation
- DOCX export
- URL ingestion
- Chat interface
- Multi-user / team features
- Built-in authentication (covered by localhost binding or reverse proxy)

---

## 4. Target Users & Supported Platforms

**Primary:** Experienced technical professionals conducting active job searches who are comfortable
running a local development environment.

### Supported Platforms

| Platform | Support |
|---|---|
| macOS | ✅ Fully supported |
| Linux | ✅ Fully supported |
| Windows (native) | ❌ Not supported |
| Windows (WSL2) | ⚠️ Community supported — use Linux tooling within WSL2 |
| Windows (Docker) | ✅ Supported via Docker — Phase 1.3 |

**Technical requirements:**
- Python 3.11+
- Node.js 18+ (Phase 1.1+)
- Ollama (optional — local model support)
- Typst binary (optional — Phase 1.2, document compilation)

---

## 5. Architecture Overview

### Phase 0.4 (Current)
```
HTML pages (vanilla JS)
        │ fetch
FastAPI (main.py)
evaluator.py │ llm_client.py │ database.py
        │
    jobs.db (SQLite)
```

### Phase 1.1+ (Target)
```
React 18 / TypeScript / Vite
React Query (server state)
        │ /api/v1/ REST
FastAPI (main.py)
evaluator.py │ llm_client.py │ database.py │ logger.py
        │
    jobs.db (SQLite)      /reports/    /generated/    /logs/
```

### Phase 1.3+ (Docker)
```
docker-compose
  └── aistivus container
        ├── FastAPI (uvicorn)
        ├── React build (served by FastAPI)
        └── SQLite volume mount
```

### Tech Stack

| Layer | Phase 0.4 | Phase 1.1+ |
|---|---|---|
| Backend | Python 3.11+ / FastAPI | Same |
| API routes | Mixed /api/* paths | /api/v1/* (versioned) |
| Frontend | Vanilla JS + HTML | React 18 / Vite / TypeScript |
| Data fetching | fetch() | React Query (TanStack Query) |
| Styling | Minimal inline CSS | Tailwind CSS |
| Database | SQLite via `sqlite3` | Same |
| LLM (local) | Ollama REST API | Same |
| LLM (cloud) | Anthropic (Phase 0.4) | Anthropic + OpenAI |
| Model config | config.yaml | `llm_models` table (DB) |
| Document gen | None | Typst binary (Phase 1.2) |
| Logging | stdout | Python stdlib logging, structured JSON (Phase 1.0) |
| Testing | Manual | pytest + Vitest (Phase 1.0) |
| Deployment | Direct uvicorn | Docker + docker-compose (Phase 1.3) |

---

## 6. Database Schema

All data stored in `data/jobs.db`. All DB logic in `database.py`. No SQL anywhere else.
**Schema version: 1.0** — clean break from v0.1. No migration from prior data; start fresh.

```sql
-- ─────────────────────────────────────────
-- Type registry — ACTIVE PHASE 1.0
-- ─────────────────────────────────────────
system_types (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    type_name   TEXT NOT NULL,    -- category: application_log | company_info | application_document
    type_value  TEXT NOT NULL,    -- code-friendly value: recruiter_call | website | resume
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (type_name, type_value)
)
-- Types are add/delete only — never edited.
-- Can only be deleted if no records reference this type_id.
-- Seeded at init_db(). See Section 7 for seed values.

-- ─────────────────────────────────────────
-- LLM model registry — ACTIVE PHASE 1.0
-- ─────────────────────────────────────────
llm_models (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    model               TEXT NOT NULL,
    endpoint            TEXT NOT NULL,    -- Ollama: http://localhost:11434 | Anthropic: https://api.anthropic.com
    estimated_eval_time INTEGER,          -- seconds, calculated average; NULL until first run completes
    available           INTEGER NOT NULL DEFAULT 0,   -- 0/1 flag; set at startup by health check
    default_flag        INTEGER NOT NULL DEFAULT 0,   -- 0/1 flag; only ONE record may have default_flag = 1
    model_weight        INTEGER NOT NULL DEFAULT 1,   -- for future weighted scoring; default 1
    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
)
-- On startup: re-query availability for each model, update available flag.
-- On first startup with empty table: auto-seed from config.yaml if ollama config present.
-- default_flag uniqueness enforced in application layer, not DB constraint.

-- ─────────────────────────────────────────
-- Core job entity — ACTIVE PHASE 0
-- ─────────────────────────────────────────
jobs (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    company_name        TEXT NOT NULL,    -- denormalized; was FK to companies (dropped)
    title               TEXT NOT NULL,
    location            TEXT,
    remote_type         TEXT,             -- Remote | Hybrid | On-site
    description_merged  TEXT,
    pay_band            TEXT,
    role_keyword        TEXT,
    dedup_status        TEXT DEFAULT 'clean',   -- clean | suspected_duplicate | confirmed_distinct
    first_seen_date     TEXT,
    last_seen_date      TEXT,
    posting_count       INTEGER DEFAULT 1,
    is_repost           INTEGER DEFAULT 0,
    -- Aggregated evaluation scores (recalculated on each new evaluation)
    agg_role_fit        REAL,             -- average of evaluations.score_role_fit
    agg_scope_fit       REAL,             -- average of evaluations.score_scope_fit
    agg_culture         REAL,             -- average of evaluations.score_culture
    agg_comp            REAL,             -- average of evaluations.score_comp
    agg_score_overall   REAL,             -- simple average of evaluations.score_overall
    -- User's own ratings (manually entered)
    my_role_fit         REAL,
    my_scope_fit        REAL,
    my_culture          REAL,
    my_comp             REAL,
    my_score_overall    REAL,
    excitement_level    TEXT,             -- moved from applications table
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    project_id          INTEGER           -- NULL in Phases 1–3; activated Phase 4
)
-- UNIQUE constraint: (company_name, title, role_keyword)
-- company_name stored as-supplied; dedup comparison is case-insensitive in application layer.
-- When a job is created, a corresponding application record is auto-created with status 'not-started'.

-- ─────────────────────────────────────────
-- Company detail log — ACTIVE PHASE 1.0
-- ─────────────────────────────────────────
job_company_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id          INTEGER NOT NULL,
    type_id         INTEGER NOT NULL,   -- FK to system_types (type_name = 'company_info')
    log             TEXT,
    url             TEXT,
    log_timestamp   TEXT NOT NULL DEFAULT (datetime('now'))
)
-- Replaces the dropped companies table.
-- Company details (website, careerpage, culturepage, industry, size, notes) stored as log entries.
-- New detail types can be added via system_types without schema changes.

-- ─────────────────────────────────────────
-- Job postings (source tracking) — ACTIVE PHASE 0
-- ─────────────────────────────────────────
job_postings (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id                  INTEGER NOT NULL,
    source_board            TEXT,         -- manual | linkedin | indeed | etc.
    source_url              TEXT,         -- apply URL
    description_raw         TEXT,
    date_posted             TEXT,
    date_scraped            TEXT,
    is_repost               INTEGER DEFAULT 0,
    days_since_prior_posting INTEGER,
    repost_url_changed      INTEGER DEFAULT 0
)

-- ─────────────────────────────────────────
-- AI evaluations — ACTIVE PHASE 0
-- ─────────────────────────────────────────
evaluations (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id          INTEGER NOT NULL,
    llm_model_id    INTEGER NOT NULL,   -- FK to llm_models; replaces model_used TEXT
    score_overall   REAL,
    score_role_fit  REAL,
    score_scope_fit REAL,
    score_culture   REAL,
    score_comp      REAL,
    fit_type        TEXT,               -- Core Fit | Stretch | Mismatch
    archetype       TEXT,               -- People Leader | Hybrid | Technical Specialist | Functional Leader
    strengths       TEXT,
    gaps            TEXT,
    recommendation  TEXT,               -- Apply | Apply with modifications | Skip
    keywords        TEXT,               -- comma-separated ATS keywords (25-35)
    domain_match    TEXT,               -- Same domain | Adjacent domain | Different domain | Wrong domain entirely
    role_type_match TEXT,               -- Target match | Adjacent | Function mismatch | Seniority mismatch
    keyword_gaps    TEXT,               -- comma-separated tailoring targets from JD
    llm_call_log_id INTEGER,            -- FK to llm_call_log; access prompt/raw_response via join
    evaluated_at    TEXT NOT NULL DEFAULT (datetime('now'))
)
-- prompt_hash and raw_response moved to llm_call_log.
-- log_entry removed.
-- agg_* scores on jobs table are recalculated after each new evaluation insert.

-- ─────────────────────────────────────────
-- LLM call log — ACTIVE PHASE 1.0
-- ─────────────────────────────────────────
llm_call_log (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp                   TEXT NOT NULL DEFAULT (datetime('now')),
    llm_model_id                INTEGER,        -- FK to llm_models
    call_type                   TEXT,           -- evaluation | generation | chat
    prompt                      TEXT,           -- full prompt text sent to LLM
    prompt_hash                 TEXT,           -- SHA-256 of system prompt; moved from evaluations
    raw_response                TEXT,           -- raw LLM output; moved from evaluations
    prompt_tokens_estimated     INTEGER,
    prompt_tokens_actual        INTEGER,
    completion_tokens_actual    INTEGER,
    total_tokens_actual         INTEGER,
    latency_ms                  INTEGER,
    call_time                   INTEGER,        -- wall-clock seconds for full call
    success                     INTEGER,        -- 0/1
    error_message               TEXT,
    job_id                      INTEGER,
    search_run_id               INTEGER
)
-- Retention: configurable via config.yaml (default: 90 days). 0 = keep forever.
-- Never log API keys, jobsearch.md content, or PII.

-- ─────────────────────────────────────────
-- Application lifecycle — ACTIVE PHASE 0
-- ─────────────────────────────────────────
applications (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id              INTEGER NOT NULL,
    apply_date          TEXT,
    end_date            TEXT,
    requested_salary    TEXT,           -- added Phase 1.0; captured at application time
    application_status  TEXT NOT NULL DEFAULT 'not-started',
    project_id          INTEGER
)
-- Valid status values: not-started | draft | applied | screening | interview |
--                      offer | rejected | ghosted | withdrawn
-- 'not-started' records auto-created when a job is created. Hidden from Applications view.
-- Status transitions not enforced at DB level; application_audit is source of truth.
-- cv_link and cover_link removed; documents tracked in application_documents.
-- excitement_level moved to jobs table.

-- ─────────────────────────────────────────
-- Application log entries — ACTIVE PHASE 0
-- ─────────────────────────────────────────
application_logs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id  INTEGER NOT NULL,
    type_id         INTEGER NOT NULL,   -- FK to system_types (type_name = 'application_log')
    log             TEXT,               -- renamed from 'note'
    url             TEXT,
    log_timestamp   TEXT NOT NULL DEFAULT (datetime('now')),  -- renamed from 'timestamp'
    llm_call_log_id INTEGER             -- FK to llm_call_log; populated when log entry is from an LLM call
)

-- ─────────────────────────────────────────
-- Application documents — ACTIVE PHASE 1.2
-- ─────────────────────────────────────────
application_documents (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id  INTEGER NOT NULL,
    type_id         INTEGER NOT NULL,   -- FK to system_types (type_name = 'application_document')
    file_path       TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
)
-- Replaces cv_link and cover_link columns on applications.
-- file_path extension indicates format (.typ, .pdf).
-- One record per file; .typ source and compiled .pdf are separate records.

-- ─────────────────────────────────────────
-- Audit trails — append-only, NEVER update or delete
-- ─────────────────────────────────────────
application_audit   (id, application_id, timestamp, event)
job_posting_audit   (id, job_posting_id, timestamp, event)    -- STUB Phase 3

-- ─────────────────────────────────────────
-- jobsearch.md version history — ACTIVE PHASE 1.0
-- ─────────────────────────────────────────
jobsearch_versions (
    id, content, saved_at, note
)

-- ─────────────────────────────────────────
-- Stubs — tables created at init, activated in future phases
-- ─────────────────────────────────────────
resume_info (
    id, chunk_name, chunk_text, chunk_type, tags,
    source_resume, source_resume_name, is_active, created_at
)
-- Phase 2+. resume_info records are NEVER hard-deleted (deactivation only).

search_runs (
    id, run_at, config_snapshot, jobs_found, jobs_evaluated,
    jobs_above_threshold, jobs_failed, error_summary, run_source, project_id
)
-- Phase 3.

search_run_errors   (id, search_run_id, source_board, source_url, error_type, error_message, timestamp)
chat_sessions       (id, created_at, updated_at, title, job_id, project_id)
chat_messages       (id, session_id, role, content, timestamp, tokens_used, model_used)
projects            (id, name, description, is_active, created_at)   -- Phase 4

-- ─────────────────────────────────────────
-- Schema versioning — ALWAYS
-- ─────────────────────────────────────────
schema_versions   (id, version, applied_at, description, checksum)
schema_migrations (id, from_version, to_version, migration_sql, rollback_sql, created_at)
```

### Key Schema Decisions

**`companies` table dropped.** `company_name` denormalized into `jobs` as a TEXT field.
Company detail (website, career page, etc.) stored in `job_company_log` via `type_id` FK —
flexible, no column additions needed as new detail types are introduced.

**`system_types` is the single type registry.** Other tables link via `type_id` INTEGER FK.
Types are append/delete only (never edited). Delete blocked if referencing records exist.
`type_name` = category, `type_value` = code-friendly value (underscores, no spaces).

**`llm_models` replaces config.yaml model config.** On first startup with empty table,
auto-seed from `config.yaml` if Ollama config present. After seeding, DB is authoritative.
`default_flag` uniqueness enforced in application layer.

**`prompt_hash` and `raw_response` moved to `llm_call_log`.** Evaluations link via
`llm_call_log_id` FK. This keeps the call record complete in one place and supports
non-evaluation LLM calls (generation, chat) using the same structure.

**`excitement_level` moved to `jobs`.** Reflects that excitement is about the opportunity,
not the specific application instance.

**`application_status = 'not-started'` auto-created with every job.** Enables
`application_logs` entries from day one (requires `application_id`). Hidden from
Applications view. Activated to `draft` when the user intentionally starts an application.

**`agg_score_overall` formula (current).** Simple average of all `evaluations.score_overall`
for the job. Recalculated on every new evaluation insert. Formula will be refined in future
phases when `llm_models.model_weight` is incorporated.

**`application_documents` replaces `cv_link`/`cover_link`.** Flexible document tracking
via `type_id` FK. `.typ` source files and compiled `.pdf` files are stored as separate records.
`generated_docs` table retired; re-introduced when resume chunk library is built (Phase 2+).

---

## 7. System Types — Initial Seed Data

Seeded at `init_db()`. Users may add types via Settings UI; seed values must always be present.

| type_name | type_value | Notes |
|---|---|---|
| application_log | recruiter_call | |
| application_log | interview_feedback | |
| application_log | compensation | |
| application_log | general | |
| application_log | repost_alert | |
| application_log | prompt | LLM prompt log entry |
| company_info | website | |
| company_info | careerpage | |
| company_info | culturepage | |
| company_info | industry | |
| company_info | size | |
| company_info | notes | |
| application_document | resume | |
| application_document | cover_letter | |

---

## 8. LLM Models — Configuration & Migration

### Startup Behavior
1. Run availability check on all `llm_models` records; update `available` flag.
2. If `llm_models` table is empty and `config.yaml` has `ollama.base_url` + `ollama.default_model`:
   - Auto-insert one record: `model = default_model`, `endpoint = base_url`, `default_flag = 1`
   - Log: `"Model config migrated from config.yaml — manage models in Settings."`
3. If no default model exists after startup, log a clear error and degrade gracefully
   (evaluation UI shows "no model configured" warning).

### config.yaml Responsibility Split

**config.yaml owns (infrastructure only):**
- `database.db_path`
- `output.reports_dir`
- `inbox.*` paths
- `server.host`, `server.port`
- `logging.*`
- `llm_call_log_retention_days`

**`llm_models` table owns (all model config):**
- Model name, endpoint URL, availability, default flag, weight, estimated eval time

API keys remain in `.env` (never in DB, never in config.yaml at rest).

---

## 9. Evaluation Pipeline

### Prompt Construction
```
system: evaluation persona + jobsearch.md context
user:   [JD_START] {sanitized_jd_text} [JD_END]
```

**Delimiter injection mitigation (required on every evaluation):**
```python
jd_clean = jd_text.replace("[JD_START]", "").replace("[JD_END]", "")
```

**Prompt hash:** SHA-256 of system prompt, stored in `llm_call_log.prompt_hash`.

### LLM Response Fields
All fields below must be captured and stored:

| JSON field | DB column | Table |
|---|---|---|
| score_overall | score_overall | evaluations |
| score_role_fit | score_role_fit | evaluations |
| score_scope_fit | score_scope_fit | evaluations |
| score_culture | score_culture | evaluations |
| score_comp | score_comp | evaluations |
| fit_type | fit_type | evaluations |
| archetype | archetype | evaluations |
| strengths | strengths | evaluations |
| gaps | gaps | evaluations |
| recommendation | recommendation | evaluations |
| keywords | keywords | evaluations |
| domain_match | domain_match | evaluations |
| role_type_match | role_type_match | evaluations |
| keyword_gaps | keyword_gaps | evaluations |
| (full prompt) | prompt | llm_call_log |
| (raw response) | raw_response | llm_call_log |

### Parse Failure Contract
- Attempt 1: standard structured prompt
- Attempt 2 (on parse failure): stricter JSON-only prompt
- On second failure: write evaluation with all score fields NULL, `llm_call_log.raw_response`
  preserved. Never silently drop.
- Surface to user: "Evaluation failed — raw response available"

### Post-Evaluation Updates
After a successful evaluation write:
1. Recalculate and update `jobs.agg_*` fields for the evaluated job.
2. Write `llm_call_log` record with prompt, raw_response, prompt_hash, tokens, latency.
3. Write `application_logs` entry linking to `llm_call_log_id` (type = `prompt`).

### Startup Validation
On `main.py` startup:
1. Check each `llm_models` record where `available = 1` — verify endpoint reachable.
2. Update `available` flags accordingly.
3. Phase 1.2+: check Typst binary accessible. If not found, log warning; Typst features
   degraded gracefully (import/view still work; compile disabled).
4. If no models available: log clear error, continue startup (app usable for browsing).

---

## 10. Jobs Page Specification

### Left Panel — Job Row Layout

```
┌────────────────────────────────────────────────────────────────────┐
│ Company Name        R    SC    CU    CO   OVR  [Application Button] │
│ Job Title          /5.  /5.   /5.   /5.  /10  [status-pill]        │
│ 📍 Location                                                         │
└────────────────────────────────────────────────────────────────────┘
```

- **R / SC / CU / CO:** `agg_role_fit`, `agg_scope_fit`, `agg_culture`, `agg_comp` (each /5)
- **OVR:** `agg_score_overall` (/10)
- Score columns show `—` when no evaluations exist
- **Remote type pill:** stays
- **Application Button:** "+ Start Application" (status = not-started) or "View Application →"
  (status ≥ draft). Slightly larger than current.
- **[status-pill]:** current `application_status` — right-aligned on title row
- Removed from left panel: fit pill, eval count pill, Re-Evaluate button

### Right Panel — Sections

**Section 1 — Job Detail** (no collapse)
- Company name, job title, location, remote status, `jobs.created_at` date
- Edit button → modal to edit company name, job title, location, remote type

**Section 2 — Application Status** (no collapse)
- Current `application_status` pill
- Apply date, excitement level (when status ≥ draft)
- Apply URL (from `job_postings.source_url`)
- "+ Start Application" / "View Application →" button (moved from left panel)

**Section 3 — My Ratings** (no collapse)
- Input fields: `my_role_fit` (/5), `my_scope_fit` (/5), `my_culture` (/5),
  `my_comp` (/5), `my_score_overall` (/10)
- Saves on blur / explicit Save button

**Section 4 — Job Description** (collapsible, default expanded)
- Full `description_merged` text
- Edit button → modal for editing description
- HR separator below section

**Section 5 — Evaluations** (collapsible, default expanded)
- All evaluation cards for this job, grouped by `evaluated_at`
- Each card shows: model name, scores, fit type, archetype, recommendation,
  domain_match, role_type_match, strengths, gaps, keywords, keyword_gaps
- Re-Evaluate button (moved from left panel)

---

## 11. Evaluate Page Specification (Phase 1.1 UI changes)

- **Animated right panel** while evaluation is running (replace static content with
  animation indicating active processing)
- **Clear/reset right panel** when a new evaluation is submitted — do not show
  stale previous result during new run
- **Dual timer:** count-up (existing, shows elapsed time) + count-down (new, based on
  `llm_models.estimated_eval_time` for the selected model; shows estimated remaining)
- Count-down timer only shown when `estimated_eval_time` is non-NULL for the selected model

---

## 12. Document Management / Typst (Phase 1.2)

### Scope
- Import `.typ` files into the app (associated with an application)
- Compile `.typ` → `.pdf` server-side via Typst binary
- View compiled `.pdf` files in-browser (new tab)
- File management: list, download, delete documents per application

### Storage
- All files stored in `/generated/{application_id}/`
- Path components sanitized: `[a-zA-Z0-9_-]` only, max 64 chars
- Paths validated within `/generated/` before any read/write
- Records in `application_documents` table; `file_path` stores relative path

### Startup Validation
- Check Typst binary at configured path (or `PATH`)
- If not found: compile button disabled; import and view still functional
- Warning surfaced in Settings page: "Typst binary not found — compilation disabled"

### Bundled Templates
- At least two Typst resume templates shipped with the repo in `templates/typst/`
- Templates are copy-to-use; not modified in place

### API Routes (Phase 1.2)
```
POST   /api/v1/applications/{id}/documents          — upload .typ or .pdf
GET    /api/v1/applications/{id}/documents          — list documents
DELETE /api/v1/applications/{id}/documents/{doc_id} — delete document
POST   /api/v1/applications/{id}/documents/{doc_id}/compile — compile .typ → .pdf
GET    /api/v1/documents/file/{doc_id}              — serve file for download/view
```

---

## 13. Security

### Non-Negotiable Rules
- No SQL string interpolation. Ever. Parameterized queries only.
- API keys never leave the server. Never in responses, logs, or DB.
- Bind to `127.0.0.1` by default.
- CORS: `http://localhost:3000` (dev) and `http://localhost:8080` (prod) only. Never `*`.
- SHA-256 for all hashing. Never MD5.
- Delimiter injection prevention on every evaluation.
- File path sanitization: `[a-zA-Z0-9_-]` only, max 64 chars per component.
- Path validation within `/generated/` before any file operation.

### Prompt Injection Mitigation
```python
jd_clean = jd_text.replace("[JD_START]", "").replace("[JD_END]", "")
prompt = f"[JD_START]\n{jd_clean}\n[JD_END]"
```

### CORS Policy
```python
origins = ["http://localhost:3000", "http://localhost:8080"]
```

### API Keys
- Settings `GET` returns boolean presence only — never echoes values.
- Anthropic / OpenAI keys in `.env` only, gitignored.

### WSL2 / Bridged VM Users
- Port may be LAN-exposed. Use reverse proxy (Traefik + Authelia) for exposed deployments.
- `slowapi` rate limiting added Phase 1.0 as baseline protection.

---

## 14. Logging

### Phase 0.4 (Current)
`print()` and stdout only.

### Phase 1.0+
- Python stdlib `logging`, structured JSON
- Rotating file: `logs/app.log` + stdout
- 10MB max, last 5 files, 30-day retention (configurable)
- **Never logged:** API keys, prompt content, LLM responses, resume text, PII

### Audit Logs (Database — Append-Only)
`application_audit`, `job_posting_audit` — never DELETE or UPDATE.

### LLM Usage Log
`llm_call_log` — metadata only, never content (except `prompt` and `raw_response` fields
which are stored intentionally for debugging and copy/paste workflows).

---

## 15. Testing Strategy

**Phase 1.0 — tests written alongside the code they cover: schema first, tests for schema, then evaluator + routes, tests for those.**

### Backend (pytest)
- Fixtures: fresh in-memory SQLite DB per test, mocked LLM client
- Unit: every `database.py` function, every `llm_client.py` provider (mocked),
  evaluator pipeline with mocked LLM
- Integration: every `/api/v1/` route against fresh test DB
- Coverage: 80% minimum (CI enforced)
- No live network calls in tests

### Frontend (Vitest + React Testing Library)
- Phase 1.1: alongside each React page
- Happy path, loading state, error state per React Query hook
- API mocking via `msw`
- Coverage: 70% minimum

### CI (GitHub Actions — Phase 1.0)
- Every PR and push to `main`
- pytest + coverage + ruff lint
- Phase 1.1: Vitest + ESLint added
- PRs blocked on failure

---

## 16. Configuration Specification

`config.yaml` owns infrastructure only. Model config lives in `llm_models` table.

```yaml
server:
  host: 127.0.0.1
  port: 8080

database:
  db_path: ./data/jobs.db
  llm_call_log_retention_days: 90   # 0 = keep forever

output:
  reports_dir: ./reports

inbox:
  done_path: ./inbox/done
  failed_path: ./inbox/failed

evaluation:
  jobsearch_md_path: ./jobsearch.md

typst:
  binary_path: typst   # Phase 1.2; name or full path; resolved via PATH if just name
  generated_dir: ./generated

logging:
  level: INFO
  file: ./logs/app.log
  max_bytes: 10485760   # 10MB
  backup_count: 5
  retention_days: 30
```

Full template in `templates/CONFIG_TEMPLATE.yaml`.

---

## 17. Phase Structure

### Phase 0 — Complete ✅
Core evaluation pipeline, HTML frontend, SQLite, Ollama, Anthropic provider,
cloud evaluation confirmation dialog, application routes, settings routes,
LLM usage routes, JSON import from Claude evaluation run.

### Phase 1.0 — DB + Backend + Tests 🔄
**Goal: Correct schema, fully instrumented backend, test coverage from day one.**

Deliverables:
- New schema v1.0 (see Section 6) — clean slate, all tables
- `system_types` seeded at init
- `llm_models` table + startup migration from config.yaml
- `companies` table replaced by `company_name` on jobs + `job_company_log`
- Evaluator updated: populate domain_match, role_type_match, keyword_gaps;
  write to llm_call_log; link evaluations via llm_call_log_id
- `agg_*` score recalculation after each evaluation
- Auto-create `not-started` application on job creation
- `requested_salary` on applications
- `/api/v1/` prefix on all routes
- `slowapi` inbound rate limiting
- `logger.py` structured JSON logging
- `GET /api/v1/health` endpoint
- pytest setup: fixtures, unit tests, integration tests, 80% coverage
- GitHub Actions CI

### Phase 1.1 — React Frontend 🔲
**Goal: Full React/TypeScript/Vite frontend replacing all HTML pages.**

Pre-work: tech stack re-validation confirmation (React/TS/Vite — already validated,
document decision formally).

Deliverables:
- Vite + React 18 + TypeScript + Tailwind scaffolding
- React Query (TanStack Query) for all server state
- TypeScript interfaces for all API responses in `frontend/src/types/`
- All 6 pages rebuilt in React (HTML pages retired):
  - `Dashboard.tsx` — stats, health indicators, recent activity
  - `Jobs.tsx` / `JobDetail.tsx` — redesigned per Section 10
  - `Evaluate.tsx` — animated panel, reset on new run, dual timer
  - `Applications.tsx` — excludes not-started; create, status tracking
  - `ApplicationDetail.tsx` — logs, audit, applied button, documents
  - `Settings.tsx` — model management, system_types, jobsearch.md editor + history
  - `LLMUsage.tsx` — llm_call_log viewer with copy-prompt button
- Claude import modal preserved (modal on Evaluate page)
- Vite dev proxy → FastAPI; FastAPI serves `frontend/dist/` in prod
- Vitest + React Testing Library, 70% coverage

### Phase 1.2 — Typst / Documents 🔲
**Goal: Import, compile, and view Typst resume files within the app.**

Deliverables:
- Typst binary startup validation (graceful degradation if not found)
- `/api/v1/applications/{id}/documents` routes (upload, list, delete)
- Compile endpoint: calls `typst compile` server-side, stores PDF
- PDF viewer: served via file endpoint, opened in new browser tab
- Document section on ApplicationDetail page
- At least two bundled Typst resume templates in `templates/typst/`
- Settings: Typst binary path configuration, generated files disk usage

### Phase 1.3 — Docker 🔲
**Goal: Consistent, portable local deployment.**

Deliverables:
- `Dockerfile` — Python + Node build, single container
- `docker-compose.yml` — volume mounts for `data/`, `generated/`, `reports/`, `logs/`
- `.dockerignore`
- First-run wizard: network exposure warning, Typst binary note
- README updated with Docker setup instructions
- `config.yaml` volume-mounted (not baked into image)

### Phase 2 — Extended Workflow 🔲 (Future)
- URL ingestion (tiered: Playwright / Requests-HTML / BS4 / manual paste)
- Resume chunk library (resume_info table activated)
- LLM-assisted resume/cover letter generation with inline editor
- DOCX export (python-docx)
- Multi-model evaluation comparison view

### Phase 3 — Discovery 🔲 (Future)
- `scraper.py` (jobspy or equivalent)
- `scraper_review.py` (keyword extraction, dedup, merge, repost detection)
- Job boards management UI
- Repost alerts
- Chat interface (stub tables activated)

### Phase 4 — Projects & Multi-User 🔲 (Future)
- Projects: activate `project_id` stubs + default project migration
- Built-in authentication (single-user passphrase minimum)
- Public Docker deployment guide (Traefik + Authelia)
- Fuzzy title deduplication
- Dark/light mode, keyboard shortcuts
- Full data export

---

## 18. Project Structure

### Phase 1.0 Target
```
aistivus/
├── CLAUDE.md
├── PROJECT_SPEC.md
├── FEATURES.md
├── LEGAL_DISCLAIMER.md
├── LICENSE
├── README.md
├── .env.example
├── .gitignore
├── config.yaml                 (gitignored)
├── jobsearch.md                (gitignored)
├── requirements.txt
│
├── main.py
├── database.py
├── evaluator.py
├── evaluate.py
├── llm_client.py
├── logger.py                   (new Phase 1.0)
│
├── templates/
│   ├── CONFIG_TEMPLATE.yaml
│   ├── JOBSEARCH_TEMPLATE.md
│   ├── INBOX_TEMPLATE.md
│   └── typst/                  (Phase 1.2 — bundled templates)
│
├── pages/                      (read-only reference; retired after Phase 1.1)
│
├── tests/                      (new Phase 1.0)
│   ├── conftest.py
│   ├── test_database.py
│   ├── test_evaluator.py
│   ├── test_llm_client.py
│   └── routes/
│       ├── test_jobs.py
│       ├── test_evaluations.py
│       ├── test_applications.py
│       └── test_settings.py
│
├── frontend/                   (new Phase 1.1)
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── src/
│       ├── types/
│       ├── components/
│       └── pages/
│           ├── Dashboard.tsx
│           ├── Jobs.tsx
│           ├── Evaluate.tsx
│           ├── Applications.tsx
│           ├── ApplicationDetail.tsx
│           ├── LLMUsage.tsx
│           └── Settings.tsx
│
├── inbox/                      (gitignored)
├── data/                       (gitignored)
├── generated/                  (gitignored)
├── reports/                    (gitignored)
└── logs/                       (gitignored)
```

### Phase 1.3 Additions
```
aistivus/
├── Dockerfile
├── docker-compose.yml
└── .dockerignore
```

---

## 19. Known Risks and Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Prompt injection via malicious JDs | Medium | Delimiter strings stripped from JD before wrapping |
| File path traversal in /generated/ | Medium | Alphanumeric sanitization; path validated within /generated/ |
| LLM evaluation parse failure | Medium | Retry once; write NULL record; surface raw response |
| Local LLM quality on complex roles | Medium | Cloud LLM (Anthropic) available |
| Inbound API abuse (WSL2/VM) | Low/Medium | slowapi rate limiting Phase 1.0 |
| Typst compile with malicious .typ | Low/Medium | Phase 1.2: validate file extension, size limit, sandboxed process |
| Token cost surprise on cloud eval | Low | Estimate shown before confirmation; explicit user approval |
| SQLite performance at scale | Low | Handles millions of rows; indexes on hot paths |
| API key leakage via Settings | Low | Boolean presence only on GET |
| Cross-model score comparison | Low | UI caveat on comparison views; prompt_hash enables detection |
| jobsearch.md loss | Low | jobsearch_versions snapshots |
| Dead file links in /generated/ | Low | Settings UI surfaces disk usage; manual cleanup |
| default_flag uniqueness violation | Low | Enforced in application layer with explicit SELECT before SET |

---

## 20. `jobsearch.md` Specification

Full template in `templates/JOBSEARCH_TEMPLATE.md`.

**Dual-storage conflict policy:**
- Disk is authoritative on startup
- Settings UI reads from disk; writes to disk and `jobsearch_versions` simultaneously
- Modified timestamp newer than latest `jobsearch_versions.saved_at` → startup warning logged

**Trimmed fallback (Phase 1.0+):**
Warning shown when token estimate exceeds configurable threshold. User manually selects
trimmed mode. System never trims autonomously.

---

*Living specification. Version history in git.*

**Changelog:**
- **v0.1–v0.6** — See git history. Phase 0 complete; HTML frontend operational.
- **v2.0** — Full replan. Primary goal: personal-use tool. React/TS/Vite + React Query
  frontend. New schema (system_types, llm_models, job_company_log, application_documents).
  companies table dropped. prompt_hash/raw_response moved to llm_call_log. Typst replaces
  WeasyPrint. Phases restructured as 1.0/1.1/1.2/1.3. Docker at Phase 1.3. Tests from
  Phase 1.0. /api/v1/ versioning. generated_docs retired.
