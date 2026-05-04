# CLAUDE.md — AI Code Generation Context & Boundaries

> This file is consumed by AI-assisted code generation tooling (Claude Code, Continue.dev, Cursor, etc.)
> at the start of every session. Read this file completely before writing or modifying any code.
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

## Current Phase: PHASE 0.1 — Completing the Foundation

**Phase 0 is complete.** Core evaluation pipeline is working end-to-end.

**Phase 0.1 active work** — completing these before Phase 1 begins:

### Completed ✅
- [x] GitHub repo initialized
- [x] PROJECT_SPEC.md, CLAUDE.md, FEATURES.md, README.md
- [x] .gitignore, .env.example
- [x] templates/ folder with CONFIG_TEMPLATE.yaml, JOBSEARCH_TEMPLATE.md, INBOX_TEMPLATE.md
- [x] requirements.txt
- [x] database.py — full schema, all tables initialized at startup
- [x] llm_client.py — Ollama provider
- [x] evaluator.py — full evaluation pipeline with retry, parse failure handling, keywords
- [x] main.py — FastAPI server, startup validation, all routes
- [x] index.html — landing page with stats and navigation
- [x] evaluate.html — JD paste and evaluation UI
- [x] evaluations.html — evaluation history with detail panel and report viewer

### In Progress / Todo for Phase 0.1 🔄
- [ ] evaluate.py — CLI script for /inbox/ file drop processing
- [ ] jobs.html — jobs/opportunities page showing all jobs with evaluation scores
- [ ] Re-evaluate functionality with model picker (on evaluations and jobs pages)
- [ ] Multi-evaluation display — group by job, show all evaluations with model labels
- [ ] Update main.py with any additional routes for above features
- [ ] CONFIG_TEMPLATE.yaml moved to templates/ folder
- [ ] Update LEGAL_DISCLAIMER.md stub

### Phase 0.1 File Structure
```
aistivus/
├── CLAUDE.md
├── FEATURES.md
├── LEGAL_DISCLAIMER.md
├── LICENSE
├── PROJECT_SPEC.md
├── README.md
├── .env.example
├── .gitignore
├── config.yaml             (gitignored — working copy)
├── jobsearch.md            (gitignored — user's context doc)
├── requirements.txt
├── main.py                 (FastAPI server — all routes)
├── database.py             (full schema + all DB helpers)
├── evaluator.py            (evaluation pipeline)
├── evaluate.py             (CLI inbox processor) ← TODO
├── llm_client.py           (Ollama in Phase 0; multi-provider Phase 1+)
├── index.html              (landing page)
├── evaluate.html           (evaluation UI)
├── evaluations.html        (evaluation history)
├── jobs.html               (jobs/opportunities view) ← TODO
├── templates/
│   ├── CONFIG_TEMPLATE.yaml
│   ├── JOBSEARCH_TEMPLATE.md
│   └── INBOX_TEMPLATE.md
├── inbox/                  (gitignored)
│   ├── done/
│   └── failed/
├── data/                   (gitignored — jobs.db)
└── reports/                (gitignored — markdown evaluations)
```

---

## Tech Stack

### Current (Phase 0.1)
| Layer | Technology |
|---|---|
| Backend | Python 3.11+ / FastAPI |
| Web server | Uvicorn |
| Frontend | Vanilla HTML/CSS/JS — no framework |
| Database | SQLite via Python `sqlite3` stdlib — no ORM |
| LLM | Ollama REST API |
| Config | `config.yaml` + `.env` via python-dotenv |

### Phase 1+ Additions (do not implement until Phase 1)
| Layer | Technology |
|---|---|
| Frontend | React 18 / Vite / TypeScript / Tailwind CSS |
| LLM (cloud) | Anthropic + OpenAI APIs |
| Token estimation | tiktoken (Phase 1); Anthropic native counting (Phase 4) |
| Rate limiting | slowapi |
| Logging | Python stdlib logging (structured JSON) |
| Testing | pytest + Vitest |

**Do not introduce new dependencies without explicit instruction.**

---

## Database Rules (Non-Negotiable)

- **All database logic lives in `database.py`.** No SQL anywhere else.
- **All queries use parameterized statements.** No string interpolation in SQL. Ever.
- **No ORM.** Python `sqlite3` stdlib only.
- **`get_connection()` is the only way to open a database connection.**
- **Upsert = explicit SELECT + INSERT/UPDATE.** Never `INSERT OR REPLACE`.
- **Audit tables are append-only.** Never DELETE or UPDATE them.
- **`resume_info` records are never hard-deleted.** Deactivation (`is_active = 0`) only.
- **`data/` directory created automatically** by `database.py` on first run.

### Active Schema (Phase 0.1 — all tables created at init)

```
-- ACTIVE PHASE 0
companies   (id, name, website, careerpage, culturepage, industry, size, notes, created_at)
jobs        (id, company_id, title, location, remote_type, description_merged, pay_band,
             role_keyword, dedup_status, first_seen_date, last_seen_date, posting_count,
             is_repost, project_id)
             UNIQUE: (company_id, title, role_keyword)
job_postings (id, job_id, source_board, source_url, description_raw, date_posted,
              date_scraped, is_repost, days_since_prior_posting, repost_url_changed)
evaluations (id, job_id, model_used, score_overall, score_role_fit, score_scope_fit,
             score_culture, score_comp, fit_type, archetype, strengths, gaps,
             recommendation, log_entry, prompt_hash, raw_response, keywords, evaluated_at)

-- ACTIVE PHASE 1
applications        (id, job_id, apply_date, end_date, cv_link, cover_link,
                     application_status, excitement_level, project_id)
application_notes   (id, application_id, note_type, note, created_at)
application_audit   (id, application_id, timestamp, event)
llm_call_log        (id, timestamp, provider, model, call_type, prompt_tokens_estimated,
                     prompt_tokens_actual, completion_tokens_actual, total_tokens_actual,
                     latency_ms, success, error_message, job_id, search_run_id)
jobsearch_versions  (id, content, saved_at, note)

-- ACTIVE PHASE 2
resume_info     (id, chunk_name, chunk_text, chunk_type, tags, source_resume,
                 source_resume_name, is_active, created_at)
generated_docs  (id, application_id, doc_type, chunks_used, file_link, model_used,
                 generated_at, project_id)

-- ACTIVE PHASE 3
search_runs       (id, run_at, config_snapshot, jobs_found, jobs_evaluated,
                   jobs_above_threshold, jobs_failed, error_summary, run_source, project_id)
search_run_errors (id, search_run_id, source_board, source_url, error_type,
                   error_message, timestamp)
job_posting_audit (id, job_posting_id, timestamp, event)

-- STUB PHASE 0 / ACTIVE PHASE 3
chat_sessions  (id, created_at, updated_at, title, job_id, project_id)
chat_messages  (id, session_id, role, content, timestamp, tokens_used, model_used)

-- STUB PHASE 4
projects (id, name, description, is_active, created_at)

-- ALWAYS
schema_versions   (id, version, applied_at, description, checksum)
schema_migrations (id, from_version, to_version, migration_sql, rollback_sql, created_at)
```

### Key Schema Decisions
- `evaluations.prompt_hash` — SHA-256 of system prompt. Use `hashlib.sha256()`. Never MD5.
- `evaluations.keywords` — comma-separated ATS keywords extracted from JD. 25-35 keywords.
- `resume_info.source_resume` — SHA-256 hash of file content, not filename.
- `generated_docs.chunks_used` — JSON array of resume_info IDs: `[12, 47, 103]`.
- `application_status` valid values: `draft`, `applied`, `screening`, `interview`, `offer`, `rejected`, `ghosted`, `withdrawn`. Not enforced at DB level — audit trail is source of truth.
- `chunk_type` valid values: `summary`, `key_impact`, `bullet`, `skill`, `competency`.
- `note_type` valid values: `recruiter_call`, `interview_feedback`, `compensation`, `general`, `repost_alert`.
- `project_id` is NULL in Phases 0-3. Phase 4 creates default project and migrates all NULL records.

---

## Evaluation Pipeline Rules (Critical)

### Prompt Injection Mitigation — Required on Every Evaluation
```python
# Always strip delimiter strings from JD text before wrapping
jd_clean = jd_text.replace("[JD_START]", "").replace("[JD_END]", "")
prompt = f"[JD_START]\n{jd_clean}\n[JD_END]"
```
This is non-negotiable. Every evaluation must do this.

### LLM Parse Failure Contract
- Attempt 1: standard structured prompt
- Attempt 2 (on parse failure): stricter JSON-only prompt
- On second failure: write evaluation with all score fields NULL, `raw_response` preserved
- Never silently drop a failed evaluation
- Surface to user: "Evaluation failed — raw response available"

### Multi-Model Evaluation
- Multiple evaluations per job are supported and expected
- Each evaluation stores `model_used` (format: `provider/model`) and `prompt_hash`
- UI groups evaluations by job, shows all evaluations with model labels
- Cross-model score comparisons include explicit caveat in the UI

### Ollama Startup Validation
On startup, `main.py` must:
1. Ping Ollama at configured `base_url`
2. Confirm configured model is available
3. If either fails: print clear error and exit with non-zero code

---

## /inbox/ Processing Rules

- Successful processing → move file to `/inbox/done/`
- Failed processing → move to `/inbox/failed/` + create `{filename}.error.txt` sidecar
- Never reprocess failed files automatically
- Never block on a single failed file — continue processing remaining files
- Frontmatter fields (company, title, url, location, date_posted, notes) are optional

---

## Security Rules (Non-Negotiable)

- **No SQL string interpolation. Ever.**
- **API keys never leave the server.** Never in responses, logs, or DB.
- **Bind to `127.0.0.1` by default.**
- **CORS:** `http://localhost:3000` and `http://localhost:8080` only. Never `*`.
- **SHA-256 for all hashing.** Never MD5.
- **Delimiter injection prevention** on every evaluation — strip `[JD_START]` and `[JD_END]` from JD text before wrapping.
- **File path sanitization:** `[a-zA-Z0-9_-]` only for generated paths, max 64 chars, validated within `/generated/`.
- **Report path validation:** `/report` endpoint validates path is within `/reports/` directory.

---

## LLM Client Interface

All LLM calls go through `llm_client.py`. No direct API calls anywhere else.

```python
# Phase 0 — Ollama
response = await llm_client.complete(
    prompt: str,
    system: str,
    model: str,          # e.g. "qwen2.5-coder:14b"
    provider: str,       # "ollama" in Phase 0
    base_url: str,
    max_tokens: int = 2000
) -> dict                # keys: success, content, error, model, provider,
                         #       latency_ms, prompt_tokens_actual,
                         #       completion_tokens_actual, total_tokens_actual
```

Phase 1+ adds `anthropic` and `openai` providers to the same interface.

---

## Available Models (Phase 0.1)

For the re-evaluate model picker, these are the available options:
- **Ollama models:** dynamically fetched from `GET /api/models` which calls `llm_client.check_ollama_health()`
- **Cloud models:** only shown if API key is configured in `.env` (Phase 1+)

The model picker UI should show:
- Ollama models pulled and available (from Ollama API)
- "Claude (not configured)" if ANTHROPIC_API_KEY not set (Phase 1+)

---

## Code Style

- **Python:** PEP 8, type hints on all function signatures, docstrings on all public functions
- **JavaScript:** `const` and arrow functions, no `var`, no framework in Phase 0
- **Naming:** `snake_case` Python, `camelCase` JS, `PascalCase` React components (Phase 1+)
- **Comments:** explain *why*, not *what*
- **No dead code** in commits
- **No TODO comments** in committed code — use GitHub Issues

---

## What to Ask Before Doing

Stop and ask for explicit confirmation before:
- Adding any new Python or JavaScript dependency
- Modifying the database schema
- Changing the LLM client interface
- Writing to the filesystem outside `data/`, `generated/`, `reports/`, or `inbox/`
- Adding any network binding outside `127.0.0.1`
- Logging anything that could capture user content, API keys, or PII
- Refactoring working code not related to the current task

---

## What NOT to Do

- No ORM
- No frontend framework in Phase 0 (React comes in Phase 1)
- No authentication (Phase 0-3)
- No telemetry or analytics
- No aggressive scraping — respect rate limits and ToS
- No SQL outside `database.py`
- No LLM API calls outside `llm_client.py`
- No auto-submit of applications
- No hard-deletion of `resume_info` records
- No automatic schema changes on startup

---

## Context Files

| File | Purpose |
|---|---|
| `PROJECT_SPEC.md` | Full specification — architecture, schema, pipeline, phases |
| `CLAUDE.md` | This file — rules and current state for code generation |
| `FEATURES.md` | Backlog of future ideas — not scheduled work |
| `jobsearch.md` | User's job search context (gitignored) |
| `config.yaml` | Runtime configuration |
| `database.py` | Authoritative schema and all DB helper functions |
| `templates/` | Template files users copy to create working copies |

---

*Update the Current Phase section as work progresses.*
*Update this file when tech stack, schema, or architectural decisions change.*