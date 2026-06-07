# AIstivus — Project Specification v2.0
> AI-Powered Job Search Management Platform
> Version 2.0 — Phase 1.6 Complete, Phase 1.7 Active

---

## 1. Executive Summary

AIstivus is an open-source, locally-hosted web application that gives job seekers a structured,
AI-assisted command center for managing their entire job search lifecycle — from discovery through
application, evaluation, and document generation.

**Tagline:** *"AI Job Search Helper for the Rest of Us"*

**Design philosophy:** Ship working software first. Every phase must produce something immediately
useful. Architecture serves the user, not the other way around.

**Primary goal (Phases 1.0–1.5):** A working personal job search tool the primary developer can
use daily. Evaluations, job tracking tied to applications, multi-server LLM management,
Typst-based resume/document generation, a redesigned jobs UI, and Docker deployment.
Everything else is future work.

---

## 2. Problem Statement

Job seekers conducting active, high-volume searches face a fragmented workflow:

- Evaluation of fit requires reloading personal context into every AI session
- Application tracking lives in spreadsheets that quickly become stale
- Resume tailoring is time-consuming and inconsistently applied
- No single tool connects discovery → evaluation → tailoring → tracking

---

## 3. Goals

### Primary Goals (Phases 1.0–1.5)
- Working evaluation pipeline with local (Ollama) and cloud (Anthropic) models
- Job and application tracking with full audit history
- Multi-server LLM management (multiple Ollama instances, Anthropic API)
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
| Windows (Docker) | ✅ Supported via Docker — Phase 1.7 |

**Technical requirements:**
- Python 3.11+
- Node.js 18+ (Phase 1.1+)
- Ollama (optional — local model support)
- Typst binary (optional — Phase 1.2, document compilation)

---

## 5. Architecture Overview

### Phase 1.1+ (Current)
```
React 18 / TypeScript / Vite
React Query (server state)
        │ /api/v1/ REST
FastAPI (main.py)
evaluator.py │ llm_client.py │ database.py │ logger.py
        │
    jobs.db (SQLite)      /app_data/application_docs/    /app_data/logs/
```

### Phase 1.5+ (Docker)
```
docker-compose
  └── aistivus container
        ├── FastAPI (uvicorn)
        ├── React build (served by FastAPI)
        └── SQLite volume mount
```

### Frontend Routing (Phase 1.5+)

| Route | Component | Notes |
|---|---|---|
| `/` | `Dashboard.tsx` | Full-page; AppHeader (no back link); no sidebar |
| `/jobs` | `Jobs.tsx` | Standalone list; AppHeader `← Home`; no split-pane |
| `/jobs/:jobId` | `JobDetail.tsx` (workspace) | Full-page workspace; sub-header + 5 tabs |
| `/jobs/:jobId?tab=job-details` | JobDetail — JOB DETAILS tab | Default tab |
| `/jobs/:jobId?tab=application` | JobDetail — APPLICATION tab | Loaded from Applications list |
| `/jobs/:jobId?tab=resume-cover` | JobDetail — RESUME/COVER tab | Phase 1.6 content |
| `/jobs/:jobId?tab=interview` | JobDetail — INTERVIEW tab | Future content |
| `/jobs/:jobId?tab=application-log` | JobDetail — APPLICATION LOG tab | Unified timeline |
| `/applications` | `Applications.tsx` | Standalone list; rows link to `/jobs/:id?tab=application` |
| `/evaluate` | `Evaluate.tsx` | AppHeader `← Home` |
| `/profile` | `JobSearchProfile.tsx` | AppHeader `← Home` |
| `/llm-usage` | `LLMUsage.tsx` | AppHeader `← Home` |
| `/settings` | `Settings.tsx` | AppHeader `← Home` |

**Retired routes (Phase 1.5):**
- `/application-detail/:applicationId` — removed; content in `/jobs/:jobId?tab=application`
- `/applications/:applicationId` — removed; split-pane pattern gone

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
| LLM (cloud) | Anthropic (Phase 0.4) | Anthropic (Phase 1.3); OpenAI future |
| Model config | config.yaml | `llm_models` + `llm_servers` tables (Phase 1.3) |
| Document gen | None | Typst binary (Phase 1.4) |
| Logging | stdout | Python stdlib logging, structured JSON (Phase 1.0) |
| Testing | Manual | pytest + Vitest (Phase 1.0) |
| Deployment | Direct uvicorn | Docker + docker-compose (Phase 1.7) |

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
-- LLM server registry — ACTIVE PHASE 1.3
-- ─────────────────────────────────────────
llm_servers (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    server_name TEXT NOT NULL,
    endpoint    TEXT,                     -- required for 'local'; NULL for 'anthropic' (URL hardcoded)
    server_type TEXT NOT NULL DEFAULT 'local',  -- 'local' | 'anthropic'
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
)
-- On first startup with empty tables: auto-seed "Local Ollama" from config.yaml if present.
-- Anthropic base URL is hardcoded in llm_client.py; not stored here.
-- API key for Anthropic lives in .env as ANTHROPIC_API_KEY — never in DB.

-- ─────────────────────────────────────────
-- LLM model registry — ACTIVE PHASE 1.0, updated Phase 1.3
-- ─────────────────────────────────────────
llm_models (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    model               TEXT NOT NULL,
    server_id           INTEGER NOT NULL,   -- FK to llm_servers; replaces endpoint TEXT column
    estimated_eval_time INTEGER,            -- seconds, rolling average from llm_call_log; auto-updated
    available           INTEGER NOT NULL DEFAULT 0,   -- 0/1 flag; set at startup by health check
    default_flag        INTEGER NOT NULL DEFAULT 0,   -- 0/1 flag; only ONE record may have default_flag = 1
    model_weight        INTEGER NOT NULL DEFAULT 1,   -- for future weighted scoring; default 1
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (server_id) REFERENCES llm_servers(id)
)
-- endpoint column removed in Phase 1.3; now on llm_servers via server_id FK.
-- estimated_eval_time is no longer user-entered; auto-updated after each successful LLM call.
-- On startup: re-query availability for each model via its server (local: Ollama ping; anthropic: key present).
-- On first startup with empty tables: auto-seed from config.yaml if ollama config present.
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
    project_id          INTEGER,          -- NULL in Phases 1–3; activated Phase 4
    is_active           INTEGER NOT NULL DEFAULT 0   -- Phase 1.4; 0=exploratory, 1=active/visible in Jobs list
)
-- UNIQUE constraint: (company_name, title, role_keyword)
-- company_name stored as-supplied; dedup comparison is case-insensitive in application layer.
-- When a job is created, a corresponding application record is auto-created with status 'not-started'.
-- get_all_jobs() filters is_active = 1 by default. Activate via POST /api/v1/jobs/{id}/activate.
-- Evaluate page CTA ("Yes, build this job") calls the activate route.

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
    applied             INTEGER NOT NULL DEFAULT 0,   -- 0/1 flag; set when user has formally submitted
    project_id          INTEGER
)
-- Valid status values: not-started | draft | applied | screening | interview |
--                      offer | rejected | ghosted | withdrawn
-- 'not-started' records auto-created when a job is created. Hidden from Applications view.
-- Status transitions not enforced at DB level; application_audit is source of truth.
-- applied flag is independent of application_status; used for stats (jobs_applied_to count).
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
-- Application Q&A — ACTIVE PHASE 1.5
-- ─────────────────────────────────────────
application_questions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id  INTEGER NOT NULL,   -- FK to applications.id
    question        TEXT NOT NULL,      -- full application question text
    response        TEXT,               -- user's answer
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (application_id) REFERENCES applications(id)
)
-- Captures application form questions + user responses per application.
-- Designed to support cross-application full-text search in a future phase.
-- CRUD: GET/POST/PATCH/DELETE /api/v1/applications/{id}/questions

-- ─────────────────────────────────────────
-- Audit trails — append-only, NEVER update or delete
-- ─────────────────────────────────────────
application_audit (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id  INTEGER NOT NULL,
    job_id          INTEGER,            -- nullable; set for job-scope events (Phase 1.5)
    timestamp       TEXT NOT NULL DEFAULT (datetime('now')),
    event           TEXT NOT NULL
)
-- job_id added Phase 1.5 to support job-level events (Job Created, Job Description Attached).
-- create_job() inserts two sequential records: "Job created — {co} — {title}" then
-- "Job description attached" (if description present). Sequential IDs guarantee ordering.
-- Used as the sort tiebreaker (id ASC) in the unified activity log query.
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

**`llm_servers` is a new first-class entity (Phase 1.3).** Named endpoints replace the
`endpoint` TEXT column on `llm_models`. Each server has a `server_type` (`'local'` |
`'anthropic'`). Multiple local Ollama instances are supported. Anthropic's base URL is
hardcoded in `llm_client.py`; only the API key is user-supplied (via `.env`).

**`llm_models` replaces config.yaml model config.** On first startup with empty tables,
auto-seed from `config.yaml` if Ollama config present (creates server record first). After
seeding, DB is authoritative. `default_flag` uniqueness enforced in application layer.
`estimated_eval_time` is auto-updated from `llm_call_log` after each call — not user-entered.

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
| application_log | lesson_learned | Captured via lesson chat on ApplicationDetail (Phase 1.2) |
| company_info | website | |
| company_info | careerpage | |
| company_info | culturepage | |
| company_info | industry | |
| company_info | size | |
| company_info | notes | |
| application_document | resume | |
| application_document | cover_letter | |

---

## 8. LLM Models — Configuration

### Startup Behavior (Phase 1.3+)
1. If BOTH `llm_servers` and `llm_models` tables are empty AND `config.yaml` has
   `ollama.base_url` + `ollama.default_model`:
   - Auto-insert one `llm_servers` record: `server_name = "Local Ollama"`, `endpoint = base_url`,
     `server_type = 'local'`
   - Auto-insert one `llm_models` record: `model = default_model`, `server_id = <new>`,
     `default_flag = 1`
   - Log: `"Auto-seeded default server and model from config.yaml — manage in Settings."`
2. Run availability check on all `llm_models` records via their server:
   - `server_type = 'local'`: `GET {server.endpoint}/api/tags` — check if model appears in list
   - `server_type = 'anthropic'`: set `available = 1` if `ANTHROPIC_API_KEY` present in `.env`
3. Load `.env` at startup (`env_utils.load_dotenv()`); set `app.state.anthropic_key_present`
4. If no default model exists after startup, log a clear error and degrade gracefully
   (evaluation UI shows "no model configured" warning).

### Schema Wipe Policy
All breaking schema changes result in a wipe-and-rebuild. No migration scripts are written
or maintained until this policy is explicitly changed. Users re-enter model configuration
via Settings after any schema-breaking upgrade.

### config.yaml Responsibility Split

**config.yaml owns (infrastructure only):**
- `database.db_path`
- `inbox.*` paths
- `server.host`, `server.port`
- `logging.*`
- `llm_call_log_retention_days`

**`llm_servers` + `llm_models` tables own (all model/server config):**
- Server names, endpoints, types, availability
- Model names, server assignments, default flag, weight, estimated eval time

**`.env` owns (secrets only):**
- `ANTHROPIC_API_KEY` — never in DB, never in config.yaml, never logged or returned to client

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

## 10. Jobs Workspace Specification (Phase 1.5+)

Redesigned in Phase 1.5 as a full-page workspace. See `app_docs/WORKORDER-phase1.5_completed.md` and the Frontend Routing table in Section 5 for current structure.

---

## 11. Evaluate Page — Phase 1.1 complete. See `app_docs/WORKORDER-phase1.2_completed.md`.

---

## 12. Document Management / Typst (Phase 1.2)

### Scope
- Import `.typ` files into the app (associated with an application)
- Compile `.typ` → `.pdf` server-side via Typst binary
- View compiled `.pdf` files in-browser (new tab)
- File management: list, download, delete documents per application

### Storage
- All files stored in `app_data/application_docs/{application_id}/`
- Path components sanitized: `[a-zA-Z0-9_-]` only, max 64 chars
- Paths validated within `app_data/application_docs/` before any read/write
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

`user_data/config.yaml` (volume-mounted in Docker; gitignored) owns infrastructure only.
Model config lives in `llm_models` table. Full template: `templates/CONFIG_TEMPLATE.yaml`.

Key sections:

```yaml
app:
  host: 127.0.0.1    # never 0.0.0.0 without a reverse proxy
  port: 8080

database:
  db_path: ./data/jobs.db
  llm_call_log_retention_days: 90   # 0 = keep forever

output:
  jobsearch_md_path: ./user_data/my_data/jobsearch.md

typst:
  binary_path: typst                              # resolved via PATH or full path
  application_docs_dir: ./app_data/application_docs

logging:
  level: INFO
  max_file_size_mb: 10
  keep_rotations: 5
  retention_days: 30
```

Ollama, cloud providers (Anthropic/OpenAI), inbox, scraping, and role keyword taxonomy
are also in the template — see `templates/CONFIG_TEMPLATE.yaml` for the authoritative source.

---

## 17. Phase Structure

### Phase 0 — Complete ✅
Core evaluation pipeline, HTML frontend, SQLite, Ollama, Anthropic provider. See git history.

### Phase 1.0 — Complete ✅
Schema v1.0, evaluation pipeline, llm_call_log, slowapi, structured logging, pytest. See `app_docs/completed_workorders/`.

### Phase 1.1 — Complete ✅
Full React/TypeScript/Vite frontend; all HTML pages retired; React Query; Vitest.

### Phase 1.2 — Complete ✅
AI-assisted jobsearch.md editor, SSE streaming chat, profile routes, lesson capture, version history.

### Phase 1.3 — Complete ✅
llm_servers table, named endpoints, Anthropic API key flow, Dashboard redesign.

### Phase 1.4 — Complete ✅
Server-aware model dropdown, jobs.is_active flag, activate flow on Evaluate page, Dashboard stats expansion.

### Phase 1.5 — Complete ✅
AppHeader on all pages, sidebar removed, Jobs/Applications as standalone list pages, full job workspace with 5-tab layout, unified activity log, application questions.

### Phase 1.6 — Complete ✅
Typst document import, compile, view; document management UI; bundled resume + cover letter templates; document settings card. See `app_docs/completed_workorders/WORKORDER-phase1.6_completed.md`.

### Phase 1.7 — Docker 🔲
**Goal: Consistent, portable local deployment.**

Deliverables:
- `Dockerfile` — multi-stage: Node build → Python serve; Typst binary baked in
- `docker-compose.yml` — volume mounts for `user_data/`, `app_data/`; env_file for API keys
- `.dockerignore`
- `main.py`: mount `frontend/dist/` as StaticFiles + SPA catch-all route
- README updated with Docker setup instructions

### Phase 2 — Extended Workflow 🔲 (Future)
- URL ingestion (tiered: Playwright / Requests-HTML / BS4 / manual paste)
- Resume chunk library (resume_info table activated)
- LLM-assisted resume/cover letter generation with inline editor
- DOCX export (python-docx)
- Multi-model evaluation comparison view
- Interview prep: practice questions from profile gaps + JD evaluation

### Phase 3 — Discovery 🔲 (Future)
- `scraper.py` (jobspy or equivalent)
- `scraper_review.py` (keyword extraction, dedup, merge, repost detection)
- Job boards management UI
- Repost alerts
- General-purpose chat interface (chat_sessions / chat_messages stub tables activated)

### Phase 4 — Projects & Multi-User 🔲 (Future)
- Projects: activate `project_id` stubs + default project migration
- Built-in authentication (single-user passphrase minimum)
- Public Docker deployment guide (Traefik + Authelia)
- Fuzzy title deduplication
- Dark/light mode, keyboard shortcuts
- Full data export

---

## 18. Project Structure

```
aistivus/
├── CLAUDE.md
├── PROJECT_SPEC.md
├── requirements.txt
├── main.py
├── database.py
├── evaluator.py
├── evaluate.py
├── llm_client.py
├── logger.py
├── profile_routes.py
├── document_routes.py
├── env_utils.py
├── templates/
│   ├── CONFIG_TEMPLATE.yaml
│   ├── JOBSEARCH_TEMPLATE.md
│   ├── JOBSEARCH_COVER_TEMPLATE.md
│   ├── INBOX_TEMPLATE.md
│   └── typst/              (bundled resume + cover letter templates)
├── tests/
│   ├── conftest.py
│   ├── test_database.py
│   ├── test_evaluator.py
│   ├── test_llm_client.py
│   └── routes/
├── frontend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── src/
│       ├── types/
│       ├── hooks/
│       ├── components/
│       ├── pages/
│       └── utils/
├── app_docs/               (planning docs, workorders — committed)
├── user_data/              (gitignored — user-authored; Docker volume)
│   ├── config.yaml
│   └── my_data/
│       ├── jobsearch.md
│       └── resume_templates/
├── app_data/               (gitignored — app-generated; Docker volume)
│   ├── data/
│   ├── application_docs/
│   ├── logs/
│   └── inbox/
├── ignore/                 (gitignored — local archive; never volume-mounted)
└── memory/                 (gitignored — Claude tooling; stays at root)
```

---

## 19. Job Search Profile Page Specification (Phase 1.2)

### Layout

Two-column layout. Left nav entry: **"Job Search Profile"**.

```
┌──────────────────────────────────────────────────────────────────────┐
│ Job Search Profile          [3 of 9 sections complete]  [Review Profile ↗] │
├───────────────────────────────┬──────────────────────────────────────┤
│ LEFT: Section cards           │ RIGHT: Chat panel                    │
│                               │                                      │
│ ● Who I Am        [Complete]  │  (inactive: "Select a section        │
│ ● Career Narrative [Empty]    │   to edit with AI")                  │
│ ● Career History  [In Prog.]  │                                      │
│   [textarea]                  │  Active section header               │
│   [Save] [Edit with AI →]     │  Mode: [Socratic ●] [Directive]     │
│ ● Skills…                     │  Recommended: Socratic               │
│ ...                           │                                      │
│                               │  [Chat thread — streaming]           │
│                               │                                      │
│                               │  [Proposed Update card]              │
│                               │  [Accept] [Discard]                  │
│                               │                                      │
│                               │  [Input] [Send]                      │
│                               │  [Propose Update] [Clear chat]       │
└───────────────────────────────┴──────────────────────────────────────┘
```

### Section Cards (left column)

Each card:
- Section number + name
- Status badge: Complete (green) / In Progress (amber) / Empty (gray)
  - Heuristic: `Complete` = no `[FILL]` markers AND content > 50 chars
- Editable `<textarea>` — direct editing always available
- Save button (appears on content change)
- "Edit with AI →" button — activates right panel for this section

**Special section handling:**

| Section | Special behavior |
|---|---|
| `tailoring_rules` | "Generate Rules" button instead of "Edit with AI" |
| `insights_lessons` | "Synthesize from Logs" button + "Edit with AI" |
| `model_behavior` | No "Edit with AI" — edit-only textarea |
| `resume_master` | "Edit with AI" opens chat with paste-first UX note |

### Chat Panel (right column)

- **Inactive:** "Select a section on the left to edit with AI"
- **Active:** section name, recommended mode label, mode toggle
- **Mode toggle:** Socratic / Directive pill buttons; defaults to section's recommended mode
- **Message thread:** user messages right (accent bg), assistant left (surface2 bg)
- **Streaming:** tokens appear as they arrive; cursor indicator during generation
- **"Propose Update" button:** sends current conversation to propose-update endpoint;
  returns full draft section content; shown in Proposed Update card
- **Proposed Update card:** shows draft content with Accept / Discard
  - Accept: calls `PATCH /api/v1/profile/sections/{id}`, snapshots version, clears card
  - Discard: clears card, conversation continues
- **Input area:** `<textarea>`, Send button, disabled while streaming
- **"Clear conversation" link:** resets chat state for this section

### Profile Strength (Dashboard widget)

- Source: `GET /api/v1/profile/health`
- Shows: progress bar + "X of 9 sections complete" + link to `/profile`
- If `file_exists: false`: "Profile not set up — start here →"
- If `completion_pct === 100`: "Profile complete" in green accent

### Capture a Lesson (ApplicationDetail)

- Button: "Capture a lesson from this application" in the logs section
- Opens inline chat panel below button (not a modal)
- First assistant message auto-sent: "Tell me about your experience with this role..."
- "Save lesson" button triggers finalize call — returns:
  - A `lesson_learned` log entry for this application (always saved)
  - A proposed addition to jobsearch.md Section 8 (user accepts or discards)
- Accepted log entry appears immediately in the application logs list
- Proposed insights addition: toast with "Review in Job Search Profile →" link

### Recommended AI Mode per Section

| Section | Recommended mode | Rationale |
|---|---|---|
| `who_i_am` | Either | Short, preference-driven |
| `career_narrative` | Socratic | Story elicitation for transitions |
| `career_history` | Socratic | Achievement story extraction |
| `skills_strengths` | Directive | Faster to draft and react |
| `target_role` | Either | Mix of hard preferences and trade-offs |
| `resume_master` | Either | Paste + review OR build from scratch |
| `tailoring_rules` | Generate button | One-shot from sections 1–5 |
| `insights_lessons` | Synthesize + journal | Driven by application logs |
| `model_behavior` | Edit only | Model instructions, not personal context |

### Experience Level Calibration

The `experience_level` field from Section 1 is passed with every chat request.
The section system prompts adjust question framing:

- **New grad:** Replace metric/achievement framing with "tell me about a project
  you're proud of, even if it was for a class" style questions. Surface education,
  projects, and non-work leadership as first-class experience.
- **Career changer:** Emphasize translation of prior domain to target domain.
  Help surface transferable skills not obvious in a corporate resume context.
- **All other levels:** Standard professional framing.

---

## 20. Dashboard Specification (Phase 1.3 + 1.4 additions)

### Layout

Dashboard is a **standalone full-page route** — it is NOT wrapped in `Layout.tsx` (no sidebar).
Other pages keep the sidebar. This is the first step toward a top-header navigation model;
future phases may extend the header to other pages.

```
┌──────────────────────────────────────────────────────────────┐
│ AIstivus   AI JOB SEARCH HELPER FOR THE REST OF US  Settings │  ← AppHeader
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────┐  PHASE 1.X — ...   ← eyebrow     │
│  │                      │  Because companies use AI         │
│  │  Find Me My          │  to filter you.    ← headline     │
│  │  Ideal Job           │                                   │
│  │  [description]       │  A local, private job search...   │
│  │  ● Active            │  ← subtitle                       │
│  └──────────────────────┘                                   │
│                                                              │
├──────────────┬──────────────┬──────────────┬────────────────┤
│ Evaluations  │  Open Jobs   │ Jobs Applied │ Apps In Process│  ← stats bar
│     Run      │              │     To       │                │
├──────────────┴──────────────┴──────────────┴────────────────┤
│ TOOLS                                                        │
│ ┌──────────┐ ┌──────────┐                                  │
│ │ ⚡        │ │ 📋       │                                  │  ← nav tiles
│ │ Evaluate │ │ JS Prof. │                                  │
│ │ a Job    │ └──────────┘                                  │
│ └──────────┘                                                │
│                                                              │
│ PROFILE                                                      │
│  Profile Strength widget                                     │
│                                                              │
│ DATA                                                         │
│ ┌──────────┐ ┌──────────┐                                  │
│ │ 📁        │ │ 📊       │                                  │
│ │ Applicat.│ │ LLM Usage│                                  │
│ └──────────┘ └──────────┘                                  │
│                                                              │
│ MODELS                                                       │
│  Model Health widget                                         │
└──────────────────────────────────────────────────────────────┘
```

### AppHeader Component (`frontend/src/components/AppHeader.tsx`)

Reusable component placed at the top of Dashboard (and future pages as they adopt
the header-first layout). Contains:
- **Wordmark:** "AIstivus" — DM Serif Display, accent color (`#c8a96e`)
- **Tagline:** "AI Job Search Helper for the Rest of Us" — small, muted, DM Mono, uppercase
- **Settings link:** right-aligned, DM Mono, muted, links to `/settings`
- Bottom border using `border-border` token

### Hero Block (Phase 1.4 change)

The hero area is restructured into a **two-column layout**:

**Left column — Featured Jobs tile:**
- Larger and more prominent than the standard nav tiles
- Title: "Find Me My Ideal Job"
- Same description text as the former Jobs nav tile
- "● Active" status footer, same green mono style
- Links to `/jobs`
- Styling: larger padding, larger serif title text — visually signals this is the primary CTA

**Right column — Hero text (unchanged):**
- **Eyebrow:** small DM Mono uppercase text in accent-dim (current phase label)
- **Headline:** "Because companies use AI to filter *you.*" — DM Serif Display, ~3rem,
  `you.` in accent italic
- **Subtitle:** "A local, private job search command center. Evaluate roles against your background,
  track applications, and build tailored resumes — powered by models running on your own machine."
  — muted body text

### Stats Bar (Phase 1.4 change)

Four stats in a horizontal bordered row. Labels and sources updated:

| Stat label | Source field | Links to |
|---|---|---|
| Evaluations Run | `stats.evaluations` | — |
| Open Jobs | `stats.jobs` (active jobs, `is_active = 1`) | `/jobs` |
| Jobs Applied To | `stats.jobs_applied_to` (applications where `applied = 1`) | `/applications` |
| Applications In Process | `stats.applications_in_process` (status IN applied/screening/interview/offer) | `/applications` |

`jobs_applied_to` and `applications_in_process` are new fields on the stats endpoint
(added Phase 1.4).

Each cell: large serif accent number, small mono uppercase label.

### Nav Tiles (Phase 1.4 change)

**TOOLS section** — "Tools" label + grid (active pages only):

| Tile | Icon | Route |
|---|---|---|
| Evaluate a Job | ⚡ | `/evaluate` |
| JS Profile | 📋 | `/profile` |

Jobs tile removed from TOOLS (promoted to hero area).
Applications and LLM Usage tiles moved to DATA section (see below).

**PROFILE section** — label + Profile Strength widget.

**DATA section** (new, Phase 1.4) — "Data" label + grid:

| Tile | Icon | Route |
|---|---|---|
| Applications | 📁 | `/applications` |
| LLM Usage | 📊 | `/llm-usage` |

**MODELS section** — label + Model Health widget (unchanged).

Each card: icon, serif title, short description, "● Active" status line in green.
Cards link to their routes. Hover: slight lift + border highlight.

### Retained Widgets

Profile Strength widget and Model Health widget are kept from the current Dashboard
but restyled to fit the full-width (no-sidebar) layout.

### Routing Change

`Dashboard` route moves outside the `<Layout>` wrapper in the app router.
All other routes remain wrapped in `<Layout>` (sidebar visible). This is a small
structural change to the router setup in `main.tsx` or `App.tsx`.

---

## 21. Known Risks and Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Prompt injection via malicious JDs | Medium | Delimiter strings stripped from JD before wrapping |
| File path traversal in /generated/ | Medium | Alphanumeric sanitization; path validated within /generated/ |
| LLM evaluation parse failure | Medium | Retry once; write NULL record; surface raw response |
| Local LLM quality on complex roles | Medium | Cloud LLM (Anthropic) available |
| Inbound API abuse (WSL2/VM) | Low/Medium | slowapi rate limiting Phase 1.0 |
| Typst compile with malicious .typ | Low/Medium | Phase 1.4: validate file extension, size limit, sandboxed process |
| Chat prompt injection via profile content | Low | Profile content is user-supplied and never used as a JD — lower risk than evaluation; no delimiter wrapping required |
| SSE stream abandoned mid-response | Low | Client disconnect handled by FastAPI StreamingResponse; partial LLM call logged to llm_call_log with success=0 |
| Token cost surprise on cloud eval | Low | Estimate shown before confirmation; explicit user approval |
| SQLite performance at scale | Low | Handles millions of rows; indexes on hot paths |
| API key leakage via Settings | Low | Boolean presence only on GET |
| Cross-model score comparison | Low | UI caveat on comparison views; prompt_hash enables detection |
| jobsearch.md loss | Low | jobsearch_versions snapshots |
| Dead file links in /generated/ | Low | Settings UI surfaces disk usage; manual cleanup |
| default_flag uniqueness violation | Low | Enforced in application layer with explicit SELECT before SET |

---

## 22. `jobsearch.md` Specification

Full template in `templates/JOBSEARCH_TEMPLATE.md`.

### Section Structure (Phase 1.2+)

9 sections, each identified by a stable `section_id` used in API routes:

| # | section_id | Name |
|---|---|---|
| 1 | `who_i_am` | Who I Am |
| 2 | `career_narrative` | Career Narrative |
| 3 | `career_history` | Career History |
| 4 | `skills_strengths` | Skills & Strengths |
| 5 | `target_role` | Target Role Profile |
| 6 | `resume_master` | Resume Master Copy |
| 7 | `tailoring_rules` | Tailoring Rules |
| 8 | `insights_lessons` | Insights & Lessons Learned |
| 9 | `model_behavior` | Model Behavior Rules |

### Storage Policy

- **Disk is authoritative.** `jobsearch.md` on disk is always the current version.
- Every write (AI-assisted or manual) snapshots the current content to
  `jobsearch_versions` **before** writing the new content to disk.
- `jobsearch_versions` is a true undo history — `note` field captures what triggered
  the save (e.g. "AI edit — Career History", "Manual edit via Settings").
- Retention: last 30 versions (configurable in Settings).
- Settings UI reads from disk; writes to disk + `jobsearch_versions` simultaneously.
- Modified timestamp newer than latest `jobsearch_versions.saved_at` → startup warning logged.

### Completion Heuristic

A section is considered **complete** when:
- No `[FILL]` markers remain in the section content, AND
- Content length exceeds 50 characters

This is computed server-side in `is_section_complete()` and returned by
`GET /api/v1/profile/health`.

### Token Budget

- Target: under 500 lines / ~8,000 tokens
- Token estimate shown in `GET /api/v1/profile/health` response (`token_estimate` field)
- Warning displayed in Job Search Profile header when estimate exceeds threshold
- System never trims autonomously — user selects trimmed mode manually

---

*Living specification. Version history in git.*

**Changelog:**
- **v0.1–v0.6** — See git history. Phase 0 complete; HTML frontend operational.
- **v2.0** — Full replan. Primary goal: personal-use tool. React/TS/Vite + React Query
  frontend. New schema (system_types, llm_models, job_company_log, application_documents).
  companies table dropped. prompt_hash/raw_response moved to llm_call_log. Typst replaces
  WeasyPrint. Phases restructured as 1.0/1.1/1.2/1.3. Docker at Phase 1.3. Tests from
  Phase 1.0. /api/v1/ versioning. generated_docs retired.
- **v2.1** — Phase 1.2 redesigned as Job Search Profile Builder. Typst → Phase 1.3.
  Docker → Phase 1.4. New: SSE streaming in llm_client.py, profile_routes.py,
  JobSearchProfile.tsx, lesson chat on ApplicationDetail, Dashboard Profile Strength widget.
  lesson_learned system_type added. jobsearch_versions restored to table-based approach.
  JOBSEARCH_TEMPLATE.md revised: Career Narrative section added, Sections 7+9 merged into
  Model Behavior Rules, Experience Level field, new-grad Career History subsections.
- **v2.2** — New Phase 1.3: Multi-Server LLM Management (llm_servers table, Anthropic API
  key via .env, server-aware Settings UI, optgroup model selectors). Typst → Phase 1.4.
  Docker → Phase 1.5. Schema wipe policy documented.
- **v2.3** — Phase 1.3 extended: Dashboard redesign (top-header layout, hero, stats bar, nav
  tiles; standalone route outside sidebar Layout). AppHeader.tsx component added. Settings
  model row shows server name in place of endpoint. Dashboard spec added as Section 20;
  prior sections 20–21 renumbered.
- **v2.4** — Phase renumbering: old Phase 1.4 (Typst) → 1.6; old Phase 1.5 (Docker) → 1.7.
  New Phase 1.4: Settings improvements (server-aware model dropdown, AI Servers layout fix)
  + jobs.is_active lifecycle flag + Evaluate page activate CTA. New Phase 1.5 stub: nav/header
  rollout to all pages + sidebar removal.
