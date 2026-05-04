# CLAUDE.md — AI Code Generation Context & Boundaries

> This file is consumed by AI-assisted code generation tooling (Claude Code, Continue.dev, Cursor, etc.)
> at the start of every session. It defines the project, the rules, and the boundaries for all
> AI-assisted code generation. Read this file completely before writing or modifying any code.
> For full architecture detail, see PROJECT_SPEC.md.

---

## What This Project Is

**AIstivus** — *"AI Job Search Helper for the Rest of Us"*

A locally-hosted, open-source web application that gives job seekers an AI-assisted command center for managing their entire job search lifecycle: discovery, evaluation, application tracking, and document generation.

**Key principles:**
- All data stays local — no cloud dependency unless user explicitly configures a cloud LLM
- Ship working software first — every phase produces something immediately useful
- Manual always works — no feature is foundational enough to block the tool if it breaks
- The web interface binds to `127.0.0.1` (localhost) only by default

---

## Current Phase: PHASE 0 — Survival Mode

**Goal:** Replace manual Claude copy-paste workflow with something that works locally today.

**A win is:** Paste a JD → get a structured evaluation → stored in a database.

### Phase 0 Active Work Items
- [x] GitHub repo initialized
- [x] PROJECT_SPEC.md
- [x] .gitignore
- [x] .env.example
- [ ] CLAUDE.md (this file)
- [ ] JOBSEARCH_TEMPLATE.md
- [ ] requirements.txt
- [ ] config.yaml (working copy)
- [ ] database.py — full schema; Phase 0 writes 4 tables
- [ ] llm_client.py — Ollama only
- [ ] evaluator.py — reads jobsearch.md, calls Ollama, writes to DB and /reports/
- [ ] evaluate.py — CLI script for /inbox/ file processing
- [ ] main.py — FastAPI with POST /evaluate; CORS configured
- [ ] index.html — paste box, optional fields, results display

### Phase 0 Deliberately Excludes
No scraper. No resume library. No document generation. No React. No TypeScript.
No tests. No auth. No structured logging. No audit logs. No LLM cost tracking.

### Phase 0 File Structure
```
aistivus/
├── CLAUDE.md
├── PROJECT_SPEC.md
├── JOBSEARCH_TEMPLATE.md
├── LICENSE
├── README.md
├── .env.example
├── .gitignore
├── config.yaml             (gitignored — working copy)
├── jobsearch.md            (gitignored — user's context doc)
├── requirements.txt
├── main.py                 (FastAPI — single /evaluate route)
├── database.py             (full schema; 4 tables active)
├── evaluator.py            (evaluation pipeline)
├── evaluate.py             (CLI script — processes /inbox/)
├── llm_client.py           (Ollama only in Phase 0)
├── index.html              (paste box + results; no framework)
├── inbox/                  (gitignored — drop JD files here)
│   ├── done/               (successfully processed files)
│   └── failed/             (failed files + .error.txt sidecars)
├── data/                   (gitignored — jobs.db lives here)
└── reports/                (gitignored — markdown evaluation output)
```

---

## Tech Stack

### Phase 0
| Layer | Technology |
|---|---|
| Backend | Python 3.11+ / FastAPI |
| Web server | Uvicorn |
| Frontend | Single `index.html` — vanilla JS, no framework |
| Database | SQLite via Python `sqlite3` stdlib — no ORM |
| LLM | Ollama REST API only |
| Config | `config.yaml` + `.env` via python-dotenv |

### Phase 1+ Additions (do not implement until Phase 1)
| Layer | Technology |
|---|---|
| Frontend | React 18 / Vite / TypeScript / Tailwind CSS |
| LLM (cloud) | Anthropic + OpenAI APIs |
| Token estimation | tiktoken |
| Rate limiting | slowapi |
| Logging | Python stdlib logging (structured JSON) |
| Testing | pytest + Vitest |

**Do not introduce new dependencies without explicit instruction.** Flag and explain before adding anything.

---

## Database Rules (Non-Negotiable)

- **All database logic lives in `database.py`.** No SQL in any other file. Routes and pipelines call `database.py` functions only.
- **All queries use parameterized statements.** No string interpolation or f-strings in SQL. Ever.
- **No ORM.** Python `sqlite3` stdlib only. No SQLAlchemy, no Tortoise, no Peewee.
- **Schema defined in `database.py` `SCHEMA` constant** as a multi-statement string via `executescript`. Tables created nowhere else.
- **`get_connection()` is the only way to open a database connection.** Sets `row_factory = sqlite3.Row`, enables WAL mode and foreign keys.
- **Upsert = explicit SELECT + INSERT/UPDATE.** Never `INSERT OR REPLACE` — it deletes and reinserts, breaking FK cascades.
- **Audit tables are append-only.** Never DELETE or UPDATE `application_audit` or `job_posting_audit`.
- **`resume_info` records are never hard-deleted.** Deactivation (`is_active = 0`) only. Permanent architectural constraint.
- **`data/` directory created automatically** by `database.py` on first run using `Path("data").mkdir(exist_ok=True)`.

### Active Schema (Phase 0 — 4 tables written, all tables created)

All tables are created at Phase 0 initialization even if not yet active.
Phases activate features — they do not require schema migrations.

```
-- ACTIVE PHASE 0
companies (
    id, name, website, careerpage, culturepage,
    industry, size, notes, created_at
)

jobs (
    id, company_id, title, location, remote_type,
    description_merged, pay_band, role_keyword,
    dedup_status, first_seen_date, last_seen_date,
    posting_count, is_repost, project_id
)
UNIQUE: (company_id, title, role_keyword)

job_postings (
    id, job_id, source_board, source_url,
    description_raw, date_posted, date_scraped,
    is_repost, days_since_prior_posting, repost_url_changed
)

evaluations (
    id, job_id, model_used,
    score_overall, score_role_fit, score_scope_fit,
    score_culture, score_comp, fit_type, archetype,
    strengths, gaps, recommendation, log_entry,
    prompt_hash, raw_response, evaluated_at
)
NOTE: search_run_id omitted from Phase 0 — added via migration in Phase 3

-- ACTIVE PHASE 1
applications (id, job_id, apply_date, end_date, cv_link, cover_link, application_status, excitement_level, project_id)
application_notes (id, application_id, note_type, note, created_at)
application_audit (id, application_id, timestamp, event)
llm_call_log (id, timestamp, provider, model, call_type, prompt_tokens_estimated, prompt_tokens_actual, completion_tokens_actual, total_tokens_actual, latency_ms, success, error_message, job_id, search_run_id)
jobsearch_versions (id, content, saved_at, note)

-- ACTIVE PHASE 2
resume_info (id, chunk_name, chunk_text, chunk_type, tags, source_resume, source_resume_name, is_active, created_at)
generated_docs (id, application_id, doc_type, chunks_used, file_link, model_used, generated_at, project_id)

-- ACTIVE PHASE 3
search_runs (id, run_at, config_snapshot, jobs_found, jobs_evaluated, jobs_above_threshold, jobs_failed, error_summary, run_source, project_id)
search_run_errors (id, search_run_id, source_board, source_url, error_type, error_message, timestamp)
job_posting_audit (id, job_posting_id, timestamp, event)

-- STUB PHASE 0 / ACTIVE PHASE 3
chat_sessions (id, created_at, updated_at, title, job_id, project_id)
chat_messages (id, session_id, role, content, timestamp, tokens_used, model_used)

-- STUB PHASE 4
projects (id, name, description, is_active, created_at)

-- ALWAYS
schema_versions (id, version, applied_at, description, checksum)
schema_migrations (id, from_version, to_version, migration_sql, rollback_sql, created_at)
```

### Schema Design Decisions (do not change without explicit instruction)

- `evaluations.prompt_hash` — SHA-256 of system prompt. Use `hashlib.sha256()`. Never MD5.
- `resume_info.source_resume` — SHA-256 hash of file content, not filename. `source_resume_name` stores display name.
- `generated_docs.chunks_used` — JSON array of `resume_info` IDs: `[12, 47, 103]`. Fixed format.
- `application_status` — not a rigid state machine. Valid values: `draft`, `applied`, `screening`, `interview`, `offer`, `rejected`, `ghosted`, `withdrawn`. Enforced in UI only; audit trail is source of truth.
- `chunk_type` valid values: `summary`, `key_impact`, `bullet`, `skill`, `competency`. Enforced in application layer.
- `note_type` valid values: `recruiter_call`, `interview_feedback`, `compensation`, `general`, `repost_alert`. Enforced in application layer.
- `llm_call_log` retention: configurable (default 90 days). Cleanup on startup. 0 = keep forever.
- `project_id` is NULL in Phases 0–3. Phase 4 creates a default project and migrates all NULL records to it.

---

## Evaluation Pipeline Rules (Phase 0 Critical)

### Prompt Injection Mitigation — Required in Phase 0
```python
# Always strip delimiter strings from JD text before wrapping
jd_clean = jd_text.replace("[JD_START]", "").replace("[JD_END]", "")
prompt = f"[JD_START]\n{jd_clean}\n[JD_END]"
```
This is non-negotiable. Every evaluation must do this. No exceptions.

### LLM Parse Failure Contract
- Attempt 1: standard structured prompt
- Attempt 2 (on parse failure): stricter JSON-only prompt
- On second failure: write evaluation record with all score fields NULL, `raw_response` = full LLM output
- Never silently drop a failed evaluation
- Surface to user: "Evaluation failed — raw response available for review"

### Ollama Startup Validation (Phase 0)
On startup, `main.py` must:
1. Ping Ollama at configured `base_url`
2. Confirm configured model is available (`ollama list`)
3. If either fails: print clear error message and exit with non-zero code
Do not start the server if Ollama or the model is unavailable.

---

## /inbox/ Processing Rules

- Successful processing: move file to `/inbox/done/`
- Failed processing: move file to `/inbox/failed/` + create `{filename}.error.txt` sidecar with: failure reason, timestamp, suggested fix
- Failed files are never reprocessed automatically — user resolves and re-drops
- Never block on a single failed file — continue processing remaining files

---

## Security Rules (Non-Negotiable)

- **No SQL string interpolation. Ever.**
- **API keys never leave the server.** Never returned in API responses, never logged, never in DB.
- **Bind to `127.0.0.1` by default.** Never `0.0.0.0` without explicit user configuration.
- **CORS:** Allowed origins `http://localhost:3000` and `http://localhost:8080` only. Never `*`.
- **SHA-256 for all hashing.** Never MD5.
- **Delimiter injection prevention** on every evaluation — see Evaluation Pipeline Rules above.
- **File path sanitization:** `[a-zA-Z0-9_-]` only for generated paths, max 64 chars per component, validated within `/generated/`.
- **Config path fields** validated to project root on write — no arbitrary filesystem paths.
- **File uploads:** `.md`, `.txt`, `.pdf` only; max 10MB.

---

## LLM Client Interface

All LLM calls go through `llm_client.py`. No direct Ollama or Anthropic calls anywhere else.

```python
# Phase 0 — Ollama only
response = await llm_client.complete(
    prompt: str,
    system: str,
    model: str,          # e.g. "qwen2.5-coder:14b"
    provider: str,       # "ollama" in Phase 0
    max_tokens: int = 2000
) -> str
```

---

## Code Style

- **Python:** PEP 8. Type hints on all function signatures. Docstrings on all public functions.
- **TypeScript/React (Phase 1+):** Airbnb style guide. `const` and arrow functions. No `var`.
- **Naming:** `snake_case` Python, `camelCase` JS/TS, `PascalCase` React components.
- **Comments:** explain *why*, not *what*. Non-obvious decisions get a comment.
- **No dead code** in commits. Use git history for rollback.
- **No TODO comments** in committed code. Use GitHub Issues.
- **TypeScript teaching mode (Phase 1+):** Add brief inline comments explaining non-obvious TypeScript syntax. Prefer explicit type annotations over inferred types. Avoid advanced patterns (decorators, complex conditional types) without explanation.

---

## What to Ask Before Doing

Stop and ask for explicit confirmation before:
- Adding any new Python or JavaScript dependency
- Modifying the database schema
- Changing the LLM client interface
- Adding a route outside the existing resource domain structure
- Writing to the filesystem outside `data/`, `generated/`, `reports/`, or `inbox/`
- Adding any network binding outside `127.0.0.1`
- Logging anything that could capture user content, API keys, or personal data
- Refactoring working code that wasn't the subject of the current task

---

## What NOT to Do

- No ORM (SQLAlchemy, Tortoise, Peewee, etc.)
- No frontend framework other than React (Phase 1+) — no Vue, Svelte, Angular
- No CSS framework other than Tailwind (Phase 1+)
- No authentication or user accounts (Phase 0–3)
- No telemetry, analytics, or usage tracking
- No aggressive scraping — respect rate limits and ToS
- No API keys except in `.env`
- No SQL outside `database.py`
- No LLM API calls outside `llm_client.py`
- No auto-submit of job applications
- No automatic schema changes on startup — migrations are explicit and user-initiated
- No hard-deletion of `resume_info` records — deactivate only

---

## Context Files

| File | Purpose |
|---|---|
| `PROJECT_SPEC.md` | Full specification — goals, architecture, schema, pipeline, phases |
| `CLAUDE.md` | This file — rules and boundaries for code generation |
| `jobsearch.md` | User's job search context (gitignored — never reference in code) |
| `config.yaml` | Runtime configuration — model, paths, thresholds |
| `database.py` | Authoritative schema and all DB helper functions |

---

*Update the Current Phase section as work progresses.*
*Update this file whenever tech stack, schema, or architectural decisions change.*