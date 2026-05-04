# AIstivus — Project Specification
> AI-Powered Job Search Management Platform
> Version 0.6 — Phase 0 Complete, Phase 0.1 In Progress

---

## 1. Executive Summary

AIstivus is an open-source, locally-hosted web application that gives job seekers a structured, AI-assisted command center for managing their entire job search lifecycle — from discovery through application, evaluation, and document generation.

It is inspired by [career-ops](https://github.com/santifer/career-ops) but takes a fundamentally different architectural approach: a proper relational database backend, a web-based UI, multi-LLM support (local and cloud), and a structured application tracking system — rather than CLI tools operating on markdown and TSV files.

The project is MIT licensed, runs entirely on the user's local machine, and is designed to be self-hosted with no cloud dependency unless the user explicitly configures a cloud LLM provider.

**Tagline:** *"AI Job Search Helper for the Rest of Us"*

**Design philosophy:** Ship working software first. Every phase must produce something immediately useful. Architecture serves the user, not the other way around.

---

## 2. Problem Statement

Job seekers — especially experienced professionals managing high-volume searches — face a fragmented workflow:

- Job discovery is manual and repetitive across multiple boards
- Evaluation of fit requires reloading personal context into every AI session — costing time and tokens
- Application tracking lives in spreadsheets that quickly become stale
- Resume tailoring is time-consuming and inconsistently applied
- Reposted roles and freshness signals are invisible in standard job board interfaces
- There is no system that connects discovery → evaluation → tailoring → tracking in one place

Existing tools either require cloud accounts and subscriptions, operate only through a CLI, or are purpose-built for one part of the workflow. Nothing provides a beautiful, local, AI-integrated full-lifecycle solution.

---

## 3. Goals

### Primary Goals
- Get working software into the user's hands in days, not weeks
- Eliminate repeated context-loading costs by storing personal context locally
- Enable AI-assisted job evaluation using local (Ollama) models first, cloud (Anthropic, OpenAI) models optionally
- Store all data locally in a structured, queryable SQLite database
- Generate tailored resume and cover letter documents from a reusable content library
- Track applications with full audit history
- Surface repost signals and freshness indicators

### Secondary Goals
- Be beautiful and genuinely pleasant to use during a stressful life event
- Be model-agnostic — users should not be locked into any one AI provider
- Be open source and community-extensible
- Eventually support multiple simultaneous job searches via a "Projects" concept
- Eventually be deployable as a hosted web application via Docker

### Non-Goals (current version)
- Automatic job application submission
- LinkedIn or social network integration
- Mobile app
- Multi-user / team features
- Paid SaaS offering
- Built-in authentication (covered by reverse proxy)
- Native Windows support (Windows users use Docker or WSL2)

---

## 4. Target Users & Supported Platforms

**Primary:** Experienced technical professionals (engineering managers, directors, senior ICs) conducting active job searches who are comfortable running a local development environment.

**Secondary:** Any professional conducting a structured job search who wants AI assistance without paying per-use cloud fees.

### Supported Development Platforms

| Platform | Support Level |
|---|---|
| macOS | ✅ Fully supported — primary development platform |
| Linux | ✅ Fully supported |
| Windows (native) | ❌ Not supported — dependency stack has no clean native install |
| Windows (WSL2) | ⚠️ Community supported — use Linux tooling within WSL2 |
| Windows (Docker) | ✅ Supported via Docker in Phase 4 |

**Technical requirements:**
- Python 3.11+
- Node.js 18+ (Phase 1 and beyond — not required for Phase 0)
- Optional: Ollama installed for local model support
- macOS or Linux development environment

---

## 5. Architecture Overview

### 5.1 Phase 0 Architecture

```
┌─────────────────────────────────────────────┐
│     index.html (single page, no framework)   │
│     Paste box + optional fields + results    │
└───────────────────┬─────────────────────────┘
                    │ POST /evaluate
┌───────────────────▼─────────────────────────┐
│         FastAPI (main.py — minimal)          │
│         evaluator.py                         │
│         database.py (full schema, 4 active)  │
│         llm_client.py (Ollama only)          │
└───────────────────┬─────────────────────────┘
                    │
         ┌──────────┴──────────┐
         ▼                     ▼
      jobs.db              /reports/
   (SQLite)             (MD reports)
```

### 5.2 Full Architecture (Phase 1+)

```
┌─────────────────────────────────────────────────────────────┐
│              React 18 + TypeScript Frontend (Vite)           │
└───────────────────────────┬─────────────────────────────────┘
                            │ REST API
┌───────────────────────────▼─────────────────────────────────┐
│                    FastAPI Backend (Python 3.11+)             │
│  scraper.py  │  evaluator.py  │  reporter.py  │  ingestor.py │
│  database.py │  llm_client.py │  logger.py                   │
└─────────────────────────────────────────────────────────────┘
                            │
         ┌──────────────────┼──────────────────┐
         ▼                  ▼                  ▼
      jobs.db           /reports/          /generated/
                         /logs/
```

### 5.3 Tech Stack

| Layer | Phase 0 | Phase 1+ |
|---|---|---|
| Backend | Python 3.11+ / FastAPI | Same |
| Frontend | Single `index.html` (vanilla JS) | React 18 / Vite / TypeScript |
| Styling | Minimal inline CSS | Tailwind CSS |
| Database | SQLite via `sqlite3` (4 active tables) | Same (full schema active) |
| LLM (local) | Ollama REST API | Same |
| LLM (cloud) | Not included | Anthropic / OpenAI APIs |
| Token estimation | Not included | `tiktoken` (Phase 1); Anthropic native counting (Phase 4) |
| Role keyword extraction | String matching against constrained taxonomy | Same |
| Job scraping | Not included | `jobspy` (Phase 3) |
| URL ingestion | Not included | Playwright / Requests-HTML / BS4 (Phase 2) |
| PDF generation | Not included | WeasyPrint + `nh3` sanitization (Phase 2, macOS/Linux only) |
| DOCX generation | Not included | python-docx (Phase 2) |
| Logging | stdout only | Python stdlib `logging` — structured JSON (Phase 1) |
| Testing | Manual only | pytest + Vitest (Phase 1) |
| Inbound rate limiting | Not included | `slowapi` — Phase 1; noted for WSL2/bridged VM users |

### 5.4 LLM Abstraction Layer

Phase 0: `llm_client.py` wraps Ollama only.
Phase 1+: Expanded to full provider-agnostic interface:

```python
response = await llm_client.complete(
    prompt=evaluation_prompt,
    system=system_prompt,
    model="qwen2.5-coder:14b",
    provider="ollama",        # Phase 1+: "anthropic" | "openai"
    max_tokens=2000
)
```

**Token estimation:**
- Phase 1: `tiktoken` for all providers
- Phase 4: Anthropic native `count_tokens` endpoint for Anthropic calls; tiktoken fallback for Ollama/OpenAI. Rationale: tiktoken can diverge 10-25% from Claude's actual count on long prompts — native counting is more accurate for cost forecasting and context window warnings

---

## 6. Database Schema

All data stored in `data/jobs.db`. Canonical definition in `SCHEMA.md`.

**All tables are created at Phase 0 initialization.** Phases activate features against an already-complete schema — no schema migrations are required when a new phase is built. Migrations are only needed when the schema itself changes.

### Current Schema Version: 0.1

```sql
-- ─────────────────────────────────────────
-- Project isolation
-- Stub for Phase 4. See migration note below.
-- ─────────────────────────────────────────
projects (
    id, name, description, is_active, created_at
)

-- ─────────────────────────────────────────
-- Core entities — ACTIVE PHASE 0
-- ─────────────────────────────────────────
companies (
    id, name, website, careerpage, culturepage,
    industry, size, notes, created_at
)

jobs (
    id, company_id, title, location, remote_type,
    description_merged, pay_band,
    role_keyword,
    dedup_status,         -- clean | suspected_duplicate | confirmed_distinct
    first_seen_date,
    last_seen_date,
    posting_count,
    is_repost,
    project_id            -- nullable FK; see Phase 4 migration note
)
-- UNIQUE constraint: (company_id, title, role_keyword)
-- Location excluded from constraint: remote-first search makes location
-- a low-impact differentiator. If future use cases require location-sensitive
-- deduplication, add location to this constraint and add a normalization
-- step in scraper_review.py. Decision documented here for future reference.

job_postings (
    id, job_id, source_board, source_url,
    description_raw, date_posted, date_scraped,
    is_repost,
    days_since_prior_posting,
    repost_url_changed
)

-- ─────────────────────────────────────────
-- AI evaluation — ACTIVE PHASE 0
-- ─────────────────────────────────────────
evaluations (
    id, job_id, model_used,
    score_overall, score_role_fit, score_scope_fit,
    score_culture, score_comp,
    fit_type,       -- Core Fit | Stretch | Mismatch
    archetype,      -- People Leader | Hybrid | Technical Specialist | Functional Leader
    strengths, gaps, recommendation, log_entry,
    prompt_hash,    -- SHA-256 of system prompt; enables valid cross-evaluation comparison
    raw_response,
    evaluated_at
)
-- search_run_id deliberately omitted from Phase 0.
-- Added via migration when Phase 3 scraper is built.

-- ─────────────────────────────────────────
-- Search / scrape runs — ACTIVE PHASE 3
-- ─────────────────────────────────────────
search_runs (
    id, run_at, config_snapshot,
    jobs_found, jobs_evaluated, jobs_above_threshold,
    jobs_failed, error_summary,
    run_source,
    project_id
)

search_run_errors (
    id, search_run_id, source_board, source_url,
    error_type, error_message, timestamp
)

-- ─────────────────────────────────────────
-- Application lifecycle — ACTIVE PHASE 1
-- ─────────────────────────────────────────
applications (
    id, job_id, apply_date, end_date,
    cv_link, cover_link,
    application_status,
    excitement_level,
    project_id
)

application_notes (
    id, application_id, note_type, note,
    created_at        -- required; notes without timestamps are useless in a timeline
)

-- ─────────────────────────────────────────
-- LLM usage tracking — ACTIVE PHASE 1
-- ─────────────────────────────────────────
llm_call_log (
    id, timestamp, provider, model,
    call_type,                    -- evaluation | generation | ingestion |
                                  -- pay_band_extraction | keyword_extraction | chat
    prompt_tokens_estimated,
    prompt_tokens_actual,
    completion_tokens_actual,
    total_tokens_actual,
    latency_ms,
    success, error_message,
    job_id,
    search_run_id
)
-- Retention: configurable via config.yaml (default: retain last 90 days).
-- Cleanup function in database.py runs on startup. Older rows are deleted.
-- Users who want full history set retention to 0 (keep forever).

-- ─────────────────────────────────────────
-- Document generation — ACTIVE PHASE 2
-- ─────────────────────────────────────────
resume_info (
    id, chunk_name, chunk_text,
    chunk_type,           -- enum: summary | key_impact | bullet | skill | competency
                          -- enforced in application layer; invalid values rejected before storage
    tags,
    source_resume,        -- SHA-256 hash of source file content
    source_resume_name,   -- original filename for display only
    is_active,
    created_at
)
-- resume_info records are NEVER hard-deleted.
-- Deactivation (is_active = 0) is the only removal mechanism.
-- This is a permanent architectural constraint that preserves referential
-- integrity of generated_docs.chunks_used across all historical records.
-- Rationale: valid resume content today remains valid in future searches.

generated_docs (
    id, application_id, doc_type,
    chunks_used,    -- JSON array of resume_info IDs: [12, 47, 103]
                    -- fixed format; enables usage history queries
                    -- safe because resume_info records are never hard-deleted
    file_link, model_used, generated_at,
    project_id
)

-- ─────────────────────────────────────────
-- Audit trails — append-only
-- Never DELETE or UPDATE these tables
-- ─────────────────────────────────────────
application_audit   (id, application_id, timestamp, event)
job_posting_audit   (id, job_posting_id, timestamp, event)

-- ─────────────────────────────────────────
-- jobsearch.md version history — ACTIVE PHASE 1
-- ─────────────────────────────────────────
jobsearch_versions (
    id, content, saved_at, note
)
-- Full text snapshot on every Settings UI save.
-- Disk is authoritative (see Section 18 conflict policy).
-- Included in export_db() as a first-class data artifact.

-- ─────────────────────────────────────────
-- Chat interface stub — tables created Phase 0
-- UI and routes built in Phase 3
-- ─────────────────────────────────────────
chat_sessions (
    id, created_at, updated_at, title,
    job_id,
    project_id
)

chat_messages (
    id, session_id,
    role,       -- user | assistant
    content, timestamp,
    tokens_used, model_used
)
-- Stub tables included in export_db() as empty arrays from Phase 0.
-- Consistent export format regardless of phase.

-- ─────────────────────────────────────────
-- Schema versioning
-- ─────────────────────────────────────────
schema_versions (
    id, version, applied_at, description, checksum
)

schema_migrations (
    id, from_version, to_version,
    migration_sql, rollback_sql, created_at
)
```

### Key Design Decisions

**All tables created at initialization.** No phase migrations needed — phases activate features, not schemas.

**UNIQUE constraint is `(company_id, title, role_keyword)` — location intentionally excluded.** Remote-first search makes location low-impact for deduplication. Documented above for future reference if use case changes.

**`evaluations.prompt_hash` uses SHA-256.** MD5 is deprecated; SHA-256 is the correct choice for all new code regardless of whether the hash is used for security purposes. Enables valid comparison of evaluations — scores from different prompt versions are as incomparable as scores from different models.

**`resume_info.source_resume` stores SHA-256 hash of file content.** `source_resume_name` stores the original filename for display. Re-ingestion is matched by content hash, not filename — renaming a file does not break the dedup match.

**`resume_info` records are never hard-deleted.** Deactivation only. Permanent architectural constraint. See schema comment above.

**`application_status` is not a rigid state machine.** Valid statuses: `draft`, `applied`, `screening`, `interview`, `offer`, `rejected`, `ghosted`, `withdrawn`. Transitions are not enforced programmatically — the UI provides guidance but the audit trail (`application_audit`) is the source of truth for history. Rationale: edge cases always break rigid state machines in job search contexts (re-opening a rejected role, jumping stages, etc.). This decision is intentional and documented.

**`application_notes.note_type` valid values:** `recruiter_call`, `interview_feedback`, `compensation`, `general`, `repost_alert`. Enforced in application layer — invalid values rejected before storage.

**`chunk_type` valid values:** `summary`, `key_impact`, `bullet`, `skill`, `competency`. Enforced in application layer.

**`generated_docs.chunks_used` is a JSON array of `resume_info` IDs** — e.g., `[12, 47, 103]`. Fixed format. Safe because `resume_info` records are never hard-deleted, so historical references never become orphaned.

**`project_id` Phase 4 migration policy:** In Phases 0–3, `project_id` is NULL on all records. In Phase 4, Projects are introduced. A default project is created on first Phase 4 run. All existing NULL `project_id` records are migrated to the default project. Going forward, work requires an active project — new users are guided through project creation on first run. The default project eliminates the need for most users to ever create a second project unless they are managing multiple simultaneous job searches or a second user is added.

**`llm_call_log` retention:** Configurable in `config.yaml` (default: 90 days). Cleanup runs on startup. Set to 0 to retain forever.

**`description_merged` algorithm:** Descriptions sorted by character count descending (longest first). Lines are newline-delimited strings. Lines from each subsequent description are appended only if not already present (exact string match after stripping leading/trailing whitespace). Deterministic — two developers implementing this spec produce identical output.

**`jobsearch.md` trimmed fallback:** Available in Phase 1+. When token estimate exceeds a configurable threshold, the UI displays a warning. User manually selects trimmed mode — the system never automatically trims without explicit user confirmation. Trimmed mode uses Sections 4, 6, 7, and 10 only (highest signal, lowest token cost). System never makes this decision autonomously.

**Export format:** All tables included in `export_db()` output, including stub tables with zero rows. Consistent format regardless of phase. Top-level keys: `schema_version`, `export_format_version`, `exported_at`, `jobsearch_md` (full text), `tables` (table name → array of rows). Export format versioned independently from DB schema version. Compatibility rules are explicitly a stub in v0.1 — documented as incomplete and will be written as schema versions accumulate in `MIGRATION_GUIDE.md`.

**File integrity:** `check_file_integrity()` in `database.py` validates all stored file paths. Settings UI surfaces broken links. Generated files accumulate until manually cleared — Settings shows disk usage of `/generated/` and provides "delete files older than N days" action. No automatic deletion.

---

## 7. JD Input — Phase 0

Two input paths — both write to the same database and `/reports/` folder:

**Option A — File drop (`/inbox/`):**

Drop a `.md` or `.txt` file into `/inbox/`. Optional YAML frontmatter:

```yaml
---
company: Google
title: Senior Engineering Manager
url: https://careers.google.com/jobs/...
location: Remote
date_posted: 2026-04-15
---
[JD text below]
```

Run `python evaluate.py` — processes all files in `/inbox/`. On success: file moved to `/inbox/done/`. On failure: file moved to `/inbox/failed/` with a sidecar error file `{original_filename}.error.txt` containing the failure reason, timestamp, and suggested fix. Failed files are never reprocessed automatically — user resolves and re-drops.

**Option B — HTML paste page:**

Open `localhost:8080`. Optional fields: company, title, URL, location. Paste JD. Hit Evaluate. Results display on screen. Evaluation written to DB and `/reports/`.

Both options support backfilling older JDs and past applications via frontmatter.

---

## 8. Feature Specification

### 8.1 Phase 0 (Days 1-2)
- JD ingestion via `/inbox/` file drop or HTML paste
- Startup validation: ping Ollama, confirm configured model is available, surface clear error if not
- Prompt injection mitigation: `[JD_START]`/`[JD_END]` delimiters; delimiter strings stripped from JD text before wrapping
- Evaluation against `jobsearch.md` using local Ollama
- Structured evaluation: scores, fit type, archetype, strengths, gaps, recommendation, log entry
- Evaluation stored in SQLite
- Markdown report written to `/reports/`
- Company and job records created/updated

### 8.2 Phase 1
- React/TypeScript frontend: Dashboard, Jobs list, Job detail, Settings
- Application status tracking with notes (timestamped)
- `jobsearch.md` inline edit + version history + rollback in Settings
- Cloud LLM support (Anthropic + OpenAI) with token estimate and confirmation dialog
- `tiktoken` token estimation + context window pressure warning
- `jobsearch.md` trimmed fallback (warning + manual selection)
- LLM usage log view
- Async polling for long evaluations
- Inbound rate limiting via `slowapi` (noted for WSL2/bridged VM users)
- Structured JSON logging (`logger.py`)
- Basic pytest test suite (80% backend coverage)
- `GET /health` endpoint

### 8.3 Phase 2
- Resume library: ingest, chunk, tag, deactivate (never delete)
- Re-ingestion: matched by `source_resume` content hash; prior chunks deactivated
- MD resume + cover letter generation with inline editor (confirm before save)
- PDF export: WeasyPrint + `nh3` HTML sanitization + external resource blocking
- DOCX export: python-docx
- URL ingestion: Playwright / Requests-HTML / BS4 / manual paste (tiered)
- Multi-model evaluation comparison view
- Generated files disk management in Settings
- File integrity check

### 8.4 Phase 3
- `scraper.py` (jobspy)
- `scraper_review.py` (keyword extraction, dedup, merge, repost detection)
- Job boards management UI
- Repost alerts: dashboard + application detail
- Chat interface (using stub tables from Phase 0)
- Full test suite

### 8.5 Phase 4
- Projects: activate `project_id` stubs + default project migration
- Docker + docker-compose (covers Windows users)
- First-run setup wizard with network exposure warning
- Built-in authentication (single-user passphrase minimum)
- Dark/light mode, keyboard shortcuts
- Export all data
- Database migration tooling
- Anthropic native token counting
- Fuzzy title deduplication
- Deployment guide

---

## 9. Pipeline Architecture

### 9.1 Phase 0 Evaluation Flow

```
1. JD arrives via /inbox/ file or POST /evaluate
2. Parse fields from frontmatter or form
3. Upsert company, upsert job
   → role_keyword assigned via taxonomy string matching (no LLM)
4. Insert job_posting
5. Load jobsearch.md from disk — error if missing
6. Strip [JD_START] and [JD_END] strings from raw JD text
7. Build prompt:
   system: [evaluation persona + jobsearch.md content]
   user:   [JD_START] {sanitized_jd_text} [JD_END]
8. Compute prompt_hash = SHA-256(system_prompt)
9. Call Ollama via llm_client.py
10. Parse structured response
    → Attempt 1: standard structured prompt
    → Attempt 2 (on parse failure): stricter JSON-only prompt
    → On second failure: write evaluation with all score fields NULL,
      raw_response preserved, evaluated_at set
      Surface to user: "Evaluation failed — raw response available"
      Never silently drop a failed evaluation
11. Write evaluation to DB
12. Write markdown report to /reports/{company}_{title}_{date}.md
13. Return result to caller
```

### 9.2 Scrape Pipeline — Phase 3

```
1. Read config.yaml
2. Create search_run record
3. Startup: mark search_runs with status=running older than
   max_task_age_hours as status=aborted
4. For each search term × location × board:
   a. Call jobspy with rate limiting
   b. Upsert company, upsert job, insert job_posting
   c. Board failure → append to error_summary, continue
   d. Job failure → write to search_run_errors, continue
5. Run scraper_review.py automatically as Stage 2
```

### 9.3 Review Pipeline — Phase 3

**Trigger policy:**
- Runs automatically as Stage 2 of every scrape pipeline run
- Can be triggered manually from the UI
- Does NOT run automatically on manual JD ingestion
- Manual JD ingestion goes directly to evaluation
- This design prevents accidental automated LLM calls outside of explicit user-initiated scrape runs

```
Stage 2a — Role keyword extraction (no LLM):
  Score description against taxonomy → assign role_keyword
  Enforce UNIQUE constraint; flag collisions as suspected_duplicate

Stage 2b — Description merge:
  Sort by character count descending (longest first)
  Append lines not already present (exact match, whitespace-stripped)

Stage 2c — Pay band extraction:
  Regex → LLM fallback (logged to llm_call_log) → NULL on failure
  "competitive", "DOE", non-numeric → NULL; no garbage stored

Stage 2d — Repost detection:
  Compare posting dates; gap > min_days_gap → audit events + alerts
```

### 9.4 Evaluation Pipeline — Phase 1+

```
1. Load jobsearch.md — verify exists, warn if missing
2. Estimate tokens via tiktoken (Phase 1+)
   → Warn if estimated tokens exceed threshold
   → Offer trimmed fallback (Sections 4, 6, 7, 10) — user confirms
3. For each job:
   a. Strip delimiters from JD text
   b. Build prompt with [JD_START]/[JD_END] delimiters
   c. Compute SHA-256 prompt_hash
   d. Log pre-call estimate to llm_call_log
   e. Call llm_client; record latency
   f. Log actual tokens to llm_call_log
   g. Parse → retry → NULL record on second failure
   h. Write evaluation
```

### 9.5 Generation Pipeline — Phase 2

```
1. Receive job_id + application_id + model
2. Query resume_info by matching tags
3. Build prompt with matched chunks + JD + jobsearch.md
4. Call LLM
5. Return to frontend inline editor — user reviews and edits
6. On user confirmation only:
   a. Sanitize path: [a-zA-Z0-9_-] only, max 64 chars each component
   b. Validate path within /generated/
   c. Write files
   d. Record chunks_used as JSON array of IDs
   e. Update application file links
```

### 9.6 URL Ingestion — Phase 2

```
Tier 1 — Playwright (primary, optional ~150MB download)
  Required for: LinkedIn, Greenhouse, Lever, Ashby
  Not installed → warn explicitly → fall to Tier 2

Tier 2 — Requests-HTML (secondary)
Tier 3 — requests + BeautifulSoup (tertiary)
Tier 4 — Manual paste (always available, always works)

SSRF Protections (all tiers):
  - https:// only
  - DNS pre-resolved; private/loopback ranges blocked
  - Resolved IP bound directly for request (prevents DNS rebinding)
  - 15s timeout (configurable)
  - Redirects re-validated at each hop
  - Max 2 concurrent Playwright instances (configurable)
```

### 9.7 Async Operations — Phase 1

```
POST → create run → return {run_id} (HTTP 202)
GET /status/{run_id} → polled every 3s
Startup sweep: running tasks older than max_task_age_hours → aborted
```

---

## 10. Security

### 10.1 Local-First Design
- Binds to `127.0.0.1` by default
- API keys in `.env` (gitignored)
- No data leaves machine unless cloud LLM configured

### 10.2 API Key Handling
- Keys never logged, never stored in DB
- Settings GET returns boolean presence only — never echoes values

### 10.3 SSRF Prevention
- `https://` only; private IP ranges blocked via DNS pre-resolution
- Resolved IP bound directly — prevents DNS rebinding
- Timeout enforced; redirects re-validated

### 10.4 Prompt Injection
**Delimiter sanitization is required before prompt construction:**
```python
# Step 1: Strip delimiter strings from raw JD text
jd_clean = jd_text.replace("[JD_START]", "").replace("[JD_END]", "")
# Step 2: Wrap sanitized content
prompt = f"[JD_START]\n{jd_clean}\n[JD_END]"
```
This prevents a JD containing the literal text `[JD_END]` from terminating the delimited block early and injecting into the system prompt space. One line, implemented from Phase 0. Known limitation: no delimiter mitigation is foolproof — documented in user-facing help.

### 10.5 File Path Traversal
- Generated paths: `[a-zA-Z0-9_-]` only, max 64 chars per component
- Final path resolved and validated within `/generated/` before write
- Config path fields: validated to project root on Settings write
- `jobsearch.md` write endpoint: validates exact expected path — no user-supplied destination

### 10.6 CORS Policy
FastAPI CORS middleware configured from Phase 0:
- Allowed origins: `http://localhost:3000` (dev), `http://localhost:8080` (prod build)
- Wildcard (`*`) origins never permitted
- One-liner in `main.py`; noted in CLAUDE.md as non-negotiable

### 10.7 Inbound Rate Limiting
Noted as a Phase 1 addition via `slowapi`. Primary concern: WSL2 and bridged VM users where localhost may be exposed to LAN. A network-adjacent user or misbehaving local process could generate unbounded cloud LLM API costs. Traefik + Authelia is the production answer for exposed deployments; `slowapi` provides in-app baseline protection.

### 10.8 Authentication
- No built-in auth in Phases 0–3
- Localhost binding is baseline protection
- **WSL2/bridged VM users:** port may be LAN-exposed — use reverse proxy
- Recommended: Traefik + Authelia
- Built-in auth deferred to Phase 4

### 10.9 Job Board Scraping
- Public data only; no board credentials
- Rate limiting via `config.yaml`
- Users responsible for ToS compliance
- `LEGAL_DISCLAIMER.md` ships with project

### 10.10 Input Handling
- Parameterized queries only — no SQL string interpolation ever
- File uploads: `.md`, `.txt`, `.pdf` only; max 10MB
- URL validated before any HTTP request

### 10.11 SQLite Permissions
- Setup docs: `chmod 600 data/jobs.db`
- `data/` gitignored

### 10.12 WeasyPrint HTML Injection (Phase 2)
Sanitization library: **`nh3`** (Rust-based, actively maintained, replaces deprecated `bleach`).
Required before PDF generation ships:
- `nh3` sanitization pass on all LLM-generated HTML
- `file://` and all local resource references stripped
- External HTTP resources in CSS (fonts, images, stylesheets) blocked — prevents potential DNS-based data exfiltration
- WeasyPrint configured to disallow network fetches
- Required security review gate before Phase 2 PDF feature ships

### 10.13 Playwright Attack Surface (Phase 2)
- SSRF protections applied before any fetch
- Max 2 concurrent instances (configurable)
- Sandbox mode enabled
- Keep Playwright/Chromium updated
- Documented in risk table

### 10.14 Markdown Editor XSS (Phase 2)
- Inline editor uses `react-markdown` with `rehype-sanitize`
- Required dependency — not optional
- LLM-generated content treated as untrusted regardless of source

---

## 11. Logging

### 11.1 Phase 0
- `print()` and stdout only
- Replaced in Phase 1

### 11.2 Phase 1+
- Python stdlib `logging`, structured JSON
- Rotating file: `logs/app.log` + stdout
- 10MB max, last 5 files, 30-day retention (configurable)
- **Never logged:** API keys, prompt content, LLM responses, resume text, PII

### 11.3 Audit Logs (Database — Append-Only)
- `application_audit`, `job_posting_audit`, `search_run_errors`
- Never DELETE or UPDATE

### 11.4 LLM Usage Log (Database)
- `llm_call_log` — metadata only, never content
- Covers: evaluation, generation, ingestion, pay_band_extraction, keyword_extraction, chat
- Estimated + actual tokens; latency; success/failure
- Retention: configurable (default 90 days); 0 = keep forever

---

## 12. Role Keyword Taxonomy

Deterministic string matching — zero LLM calls. Lives in `config.yaml`.

```yaml
role_keyword_taxonomy:
  platform:       ["platform", "systems", "scalability", "reliability", "core infrastructure"]
  growth:         ["growth", "acquisition", "activation", "retention", "funnel", "conversion", "MAU", "DAU"]
  mobile:         ["iOS", "Android", "React Native", "Swift", "Kotlin", "mobile"]
  data:           ["data engineering", "pipeline", "ETL", "warehouse", "Spark", "Airflow", "dbt"]
  infrastructure: ["DevOps", "SRE", "Kubernetes", "Terraform", "cloud", "AWS", "GCP", "Azure"]
  security:       ["security", "compliance", "vulnerability", "penetration", "SOC2", "SAST"]
  frontend:       ["frontend", "React", "Vue", "CSS", "UI", "web client"]
  backend:        ["backend", "API", "microservices", "REST", "GraphQL", "server-side"]
  ML:             ["machine learning", "ML", "model training", "PyTorch", "TensorFlow", "MLOps"]
  AI:             ["AI", "LLM", "GPT", "Claude", "generative", "RAG", "embeddings", "agents"]
  embedded:       ["embedded", "firmware", "RTOS", "bare metal", "FPGA", "C++"]
  hardware:       ["hardware", "PCB", "electrical", "mechanical", "manufacturing", "DFM"]
  QA:             ["QA", "quality assurance", "SDET", "automation testing"]
  devex:          ["developer experience", "DevEx", "developer productivity", "internal tools"]
  fullstack:      ["full stack", "fullstack", "full-stack", "end-to-end"]
  general:        []  # fallback — assigned when no signals match
```

---

## 13. Repost Detection & Task Configuration

```yaml
filters:
  repost_detection:
    enabled: true
    min_days_gap: 14
    alert_on_applied: true
    alert_on_evaluated: true

tasks:
  max_task_age_hours: 2    # orphaned background task cleanup threshold
                           # separate from repost_detection — different concern
```

Note: `max_task_age_hours` is in its own `tasks` config section — not inside `repost_detection`.

---

## 14. Project Structure

### Phase 0
```
aistivus/
├── README.md
├── LICENSE                 (MIT)
├── CLAUDE.md
├── PROJECT_SPEC.md
├── .env.example
├── .gitignore
├── config.yaml             (gitignored — working copy)
├── jobsearch.md            (gitignored — working copy)
├── requirements.txt        (minimal: fastapi, uvicorn, httpx, python-dotenv)
│
├── main.py                 (FastAPI; single /evaluate route; CORS configured)
├── database.py             (full schema; 4 tables active in Phase 0)
├── evaluator.py            (Ollama evaluation pipeline)
├── llm_client.py           (Ollama only in Phase 0)
│
├── index.html              (paste box + results; no framework)
│
├── inbox/                  (gitignored)
│   ├── done/
│   └── failed/             (failed files + .error.txt sidecars)
├── data/                   (gitignored — jobs.db)
└── reports/                (gitignored — markdown evaluations)
```

### Full Structure (Phase 1+)
```
aistivus/
├── README.md
├── LICENSE
├── LEGAL_DISCLAIMER.md
├── CONTRIBUTING.md
├── CLAUDE.md
├── PROJECT_SPEC.md
├── SCHEMA.md
├── MIGRATION_GUIDE.md
├── LOGGING.md
├── JOBSEARCH_TEMPLATE.md
├── CONFIG_TEMPLATE.yaml
├── .env.example
├── .gitignore
├── config.yaml             (gitignored)
├── jobsearch.md            (gitignored)
│
├── backend/
│   ├── main.py
│   ├── database.py
│   ├── evaluator.py
│   ├── llm_client.py
│   ├── scraper.py          (Phase 3)
│   ├── scraper_review.py   (Phase 3)
│   ├── reporter.py         (Phase 2)
│   ├── ingestor.py         (Phase 2)
│   ├── logger.py           (Phase 1)
│   └── routes/
│       ├── health.py
│       ├── companies.py
│       ├── jobs.py
│       ├── evaluations.py
│       ├── applications.py     (Phase 1)
│       ├── resume.py           (Phase 2)
│       ├── documents.py        (Phase 2)
│       ├── scraper.py          (Phase 3)
│       └── settings.py
│
├── frontend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── src/
│       ├── types/
│       ├── components/
│       └── pages/
│           ├── Dashboard.tsx
│           ├── Jobs.tsx
│           ├── JobDetail.tsx
│           ├── Companies.tsx
│           ├── Applications.tsx    (Phase 1)
│           ├── ResumeLibrary.tsx   (Phase 2)
│           ├── Evaluations.tsx
│           ├── LLMUsage.tsx        (Phase 1)
│           ├── Settings.tsx
│           └── AuditLog.tsx
│
├── tests/                          (Phase 1)
│   ├── fixtures/
│   ├── test_database.py
│   ├── test_evaluator.py
│   ├── test_llm_client.py
│   ├── test_scraper.py             (Phase 3)
│   ├── test_scraper_review.py      (Phase 3)
│   ├── test_ingestor.py            (Phase 2)
│   └── routes/
│
├── inbox/                          (gitignored)
│   ├── done/
│   └── failed/
├── data/                           (gitignored)
├── generated/                      (gitignored)
├── reports/                        (gitignored)
└── logs/                           (gitignored — Phase 1+)
```

---

## 15. Phased Delivery Plan

### Phase 0 — Survival Mode ✅ COMPLETE
**Goal: Replace manual Claude copy-paste with something that works locally today.**

Delivered:
- `requirements.txt`, `database.py`, `llm_client.py`, `evaluator.py`, `main.py`
- `index.html` — landing page with stats and navigation
- `evaluate.html` — JD paste and evaluation UI
- `evaluations.html` — evaluation history with detail panel and report viewer
- Full SQLite schema (all tables initialized at startup)
- Ollama startup validation
- CORS, delimiter injection mitigation, path sanitization
- Markdown evaluation reports with date-first naming
- ATS keyword extraction (25-35 keywords per evaluation)
- `templates/` folder with CONFIG_TEMPLATE.yaml, JOBSEARCH_TEMPLATE.md, INBOX_TEMPLATE.md
- `FEATURES.md` backlog, `README.md`

### Phase 0.1 — Foundation Completion 🔄 IN PROGRESS
**Goal: Close remaining gaps before React frontend begins. Clean handoff to Phase 1.**

Deliverables:
- `evaluate.py` — CLI script for `/inbox/` file drop batch processing
- `jobs.html` — Jobs/Opportunities page showing all jobs with evaluation scores, fit types, and multi-evaluation grouping
- Re-evaluate functionality with model picker — select any available Ollama model or configured cloud provider; run additional evaluations against same job; results grouped by job with model labels
- Multi-evaluation display — jobs and evaluations pages group by job, show all evaluations with model/score/date, cross-model comparison caveat displayed
- `GET /api/models` route — returns available Ollama models for model picker UI
- `LEGAL_DISCLAIMER.md` — scraping ToS and AI output accuracy disclaimer

**Definition of done:**
- User can drop a JD file in `/inbox/`, run `evaluate.py`, see result in browser
- User can view all jobs with their best evaluation score on `jobs.html`
- User can re-evaluate any job with any available model from the UI
- Multiple evaluations per job are clearly displayed with model attribution

### Phase 1 — Minimum Useful Web UI
**Goal: Manage your pipeline in a browser.**

Deliverables:
- React/TypeScript/Vite frontend
- Dashboard, Jobs list, Job detail, Settings pages
- Application status + timestamped notes
- `jobsearch.md` inline edit, version history, rollback
- Cloud LLM support with token estimate + confirmation dialog
- Context window warning + manual trimmed fallback
- LLM usage log view
- Async polling for long evaluations
- `slowapi` inbound rate limiting
- `logger.py` structured JSON logging
- `GET /health`
- pytest test suite — 80% backend coverage

### Phase 2 — Full Workflow
**Goal: Evaluate → apply → generate documents in one system.**

Deliverables:
- Resume library: ingest (content-hash dedup), chunk, tag, deactivate
- MD resume + cover letter generation with inline editor
- PDF export (WeasyPrint + `nh3` — security gate required)
- DOCX export (python-docx)
- URL ingestion (tiered: Playwright / Requests-HTML / BS4 / manual)
- `rehype-sanitize` on markdown editor (XSS mitigation)
- Multi-model evaluation comparison
- File integrity check + disk management in Settings

### Phase 3 — Discovery
**Goal: Automated job discovery.**

Deliverables:
- `scraper.py` (jobspy — convenience layer; manual always works)
- `scraper_review.py` (keyword extraction, dedup, merge, repost detection)
- Job boards management UI
- Repost alerts
- Chat interface (Phase 0 stub tables activated)
- Full test suite

Note: If jobspy becomes unavailable or a superior library emerges, it is replaced at the scraper module boundary. Manual ingestion is always functional. No contingency plan is needed beyond this — the tool is designed so scraping is additive, not foundational.

### Phase 4 — Polish & Open Source
**Goal: Production-quality tool ready for public use.**

Deliverables:
- Projects: default project created; all Phase 0-3 records migrated; work requires active project going forward
- Docker + docker-compose (covers Windows users)
- First-run wizard with network exposure warning
- Built-in authentication
- Dark/light mode, keyboard shortcuts
- Full data export
- Database migration tooling
- Anthropic native token counting
- Fuzzy title deduplication
- Deployment guide (Docker, Traefik + Authelia)

---

## 16. Database Versioning and Migration

Full documentation in `MIGRATION_GUIDE.md` (stub — compatibility rules documented as versions accumulate).

- Schema changes increment `schema_versions`
- Forward + rollback SQL in `schema_migrations`
- `database.py` warns on startup if DB is behind
- Users run migrations explicitly
- Run `backup_db()` before any migration
- Export includes `schema_version` and `export_format_version`
- All tables (including empty stubs) included in export

**Current version: 0.1**

---

## 17. Testing Strategy

**Phase 0:** Manual testing only. Ship fast.

**Phase 1+:**

Backend (pytest):
- Unit: every `database.py` function, every `llm_client.py` provider (mocked), pipeline modules with mocked externals
- Integration: every FastAPI route against fresh test DB per run
- Coverage: 80% minimum (CI enforced)
- No live network calls in tests

Frontend (Vitest + React Testing Library):
- Happy path, loading state, error state per data-fetching component
- API mocking via `msw`
- Coverage: 70% minimum

CI (GitHub Actions — Phase 1):
- Every PR and push to `main`
- Tests + coverage + lint (`ruff` + ESLint)
- PRs blocked on failure

---

## 18. `jobsearch.md` Specification

Full template in `JOBSEARCH_TEMPLATE.md`. Sections:

1. Who I Am
2. Career History
3. Skills & Strengths
4. Target Role Profile (includes Known Gaps)
5. Resume Master Copy
6. Tailoring Rules
7. JD Evaluation Framework
8. Application Log
9. Insights & Lessons Learned
10. Session Instructions

**Dual-storage conflict policy:**
- Disk is authoritative on startup
- Modified timestamp newer than latest `jobsearch_versions` → startup warning logged
- Settings UI reads from disk; writes to disk and `jobsearch_versions` simultaneously
- No automatic merge — conflicts surfaced to user for manual resolution

**Trimmed fallback (Phase 1):**
Warning shown when token estimate exceeds configurable threshold. User manually selects trimmed mode. System never trims autonomously. Trimmed = Sections 4, 6, 7, 10 only.

**Included in all exports and backups as a first-class data artifact.**

---

## 19. Configuration Specification

Full template in `CONFIG_TEMPLATE.yaml`. Phase 0 minimum:

```yaml
ollama:
  base_url: http://localhost:11434
  default_model: qwen2.5-coder:14b

output:
  reports_dir: ./reports

database:
  db_path: ./data/jobs.db
  llm_call_log_retention_days: 90  # 0 = keep forever
```

Full config adds: search config, provider API key references, ingestion settings, repost detection, taxonomy, logging, backup, tasks section.

**`tasks` section (separate from `repost_detection`):**
```yaml
tasks:
  max_task_age_hours: 2
```

Config path fields validated to project root on Settings write — cannot redirect to arbitrary filesystem locations.

---

## 20. Chat Interface Stub (Phase 3 UI, Phase 0 Schema)

`chat_sessions` and `chat_messages` created at Phase 0 init. Zero rows. Included in exports as empty arrays. Phase 3 builds UI and routes against existing schema — no migration needed.

Context management:
- `jobsearch.md` as system context per session
- `job_id` set → job description + evaluations also injected
- History truncated oldest-first at context limits
- All calls to `llm_call_log` with `call_type = chat`

---

## 21. Open Source Posture

- **License:** MIT
- **Repository:** GitHub — public when ready
- **CONTRIBUTING.md:** Added Phase 1
- **CLAUDE.md:** Ships Phase 0
- **Roadmap:** GitHub Projects (Phase 1)
- **Versioning:** Semantic versioning from first tagged release
- **Legal:** `LEGAL_DISCLAIMER.md` covers scraping ToS and AI output accuracy

---

## 22. Known Risks and Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| DNS rebinding attack on SSRF | Medium | Resolved IP bound directly — not re-resolved at connection time |
| Prompt injection via malicious JDs | Medium | Delimiter strings stripped from JD before wrapping; `[JD_START]`/`[JD_END]` delimiters from Phase 0; documented limitation |
| File path traversal | Medium | Alphanumeric sanitization; path validated within `/generated/` |
| Config path injection via Settings | Medium | Path fields validated to project root on write |
| Schema migration breaks user data | Medium | Rollback SQL in all migrations; backup before migrate |
| LLM evaluation parse failure | Medium | Retry once; write NULL record on second failure; surface raw response to user |
| Local LLM quality on complex roles | Medium | Cloud LLM available Phase 1+ |
| Inbound API abuse (WSL2/bridged VM) | Low/Medium | `slowapi` rate limiting in Phase 1; Traefik + Authelia for exposed deployments |
| WeasyPrint HTML injection | Low/Medium | `nh3` sanitization + external resource blocking; Phase 2 security gate |
| Playwright Chromium attack surface | Low/Medium | SSRF protections; instance limit; sandbox; keep updated |
| Network exposure in WSL2/VM | Low/Medium | README and Phase 4 setup wizard warn explicitly |
| SQLite performance at scale | Low | Handles millions of rows; indexes on hot paths |
| API key leakage via Settings | Low | Boolean presence only on GET |
| Cross-model/cross-prompt score comparison | Low | UI caveat on comparison views; `prompt_hash` enables detection |
| `jobsearch.md` loss or corruption | Low | `jobsearch_versions` snapshots; included in all exports |
| Orphaned background tasks | Low | Startup sweep marks stale running tasks as aborted |
| Dead file links accumulating | Low | `check_file_integrity()`; Settings UI surfaces broken links |
| Token cost surprise on cloud evaluation | Low | Estimate shown before confirmation; explicit user approval required |

---

## 23. Success Criteria

**Phase 0 is successful when:**
- `python main.py` starts without errors
- Startup correctly validates Ollama and configured model
- A JD pasted into `localhost:8080` produces a structured evaluation on screen
- Evaluation stored in SQLite; markdown in `/reports/`
- `/inbox/` file drop works; failures go to `/inbox/failed/` with error sidecar
- User feels like they have something working

**Phase 1 is successful when:**
- Full pipeline managed from web UI
- Application status trackable
- Cloud LLM works with confirmation and cost estimate
- Setup from clone to first evaluation under 15 minutes

**Overall success:**
- Job seeker manages entire search without a spreadsheet
- Tool surfaces better-fit roles faster
- Resume generation requires minimal editing before submission

---

*Living specification. Version history in git.*

**Changelog:**
- **v0.1** — Initial specification
- **v0.2** — First review: naming, TypeScript, tiered ingestion, security section, logging, stubs, llm_call_log, async, jobspy risk raised
- **v0.3** — Second review: DNS rebinding, config path injection, tiktoken, chat stub, role_keyword+dedup, taxonomy, repost detection, re-ingestion, pay band failure, export versioning, file integrity, jobsearch_versions, orphan cleanup, Windows removed, Playwright risk added
- **v0.4** — Phase rebuild: Phase 0 added; all tables at init; application_notes.created_at; prompt_hash; chunks_used as JSON array; enums documented; description_merged algorithm; pay band failure specified; jobsearch.md conflict policy; trimmed fallback; export format; CORS; XSS; inbox failure handling; state machine policy; source_resume hash; llm_call_log retention; projects migration note; max_task_age_hours placement; stub export contract; jobspy contingency removed
- **v0.5** — Final pre-implementation: delimiter injection mitigation; SHA-256 for prompt_hash; slowapi noted; nh3 named for WeasyPrint; /inbox/failed/ + error sidecars; application_status intentionally unenforced; source_resume as content hash; llm_call_log retention; trimmed fallback as warning+manual; resume_info never-hard-delete; Ollama startup validation; description_merged algorithm tightened; project_id NULL migration policy; max_task_age_hours to tasks section; stub table export; Phase 1 timeline removed; jobspy fallback removed
- **v0.6** — Phase 0 complete. Phase 0.1 added formally to phased delivery plan. Template files moved to `templates/` folder. `FEATURES.md` backlog created. `README.md` added. `CLAUDE.md` updated with current state and Phase 0.1 checklist. `evaluations.keywords` column added to schema (ATS keyword extraction, 25-35 keywords). `evaluations.log_entry` retained as one-line summary. Phase 0 structure updated to reflect actual delivered files (index.html as landing page, evaluate.html, evaluations.html). Phase 0.1 deliverables: evaluate.py CLI, jobs.html, re-evaluate with model picker, multi-evaluation grouping, GET /api/models route, LEGAL_DISCLAIMER.md.