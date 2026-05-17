# CLAUDE.md — AI Code Generation Context & Boundaries

> This file is consumed by AI-assisted code generation tooling at the start of every session.
> Read this file completely before writing or modifying any code.
> For full architecture detail, see PROJECT_SPEC.md.

---

## What This Project Is

**AIstivus** — *"AI Job Search Helper for the Rest of Us"*

A locally-hosted, open-source web application that gives job seekers an AI-assisted command center
for managing their entire job search lifecycle: discovery, evaluation, application tracking, and
document generation.

**Key principles:**
- All data stays local — no cloud dependency unless user explicitly configures a cloud LLM
- Ship working software first — every phase produces something immediately useful
- Manual always works — no feature is foundational enough to block the tool if it breaks
- The web interface binds to `127.0.0.1` (localhost) only by default

---

## Current Phase: PHASE 1.0 — DB + Backend + Tests

**Phases 0 through 1.1 are complete.** Core evaluation pipeline working end-to-end.
HTML frontend operational (read-only reference — do not modify).

### Phase 1.0 Checklist 🔄
- [x] New schema v1.0 — clean slate (`init_db()` with all new tables)
- [x] `system_types` table seeded at init (see seed values in DATABASE RULES)
- [x] `llm_models` table + startup auto-seed from config.yaml if empty
- [x] `companies` table dropped → `company_name` on jobs + `job_company_log` table
- [x] Evaluator updated: populate `domain_match`, `role_type_match`, `keyword_gaps`
- [x] Evaluator writes to `llm_call_log`; sets `evaluations.llm_call_log_id`
- [x] Evaluator writes `application_logs` prompt entry (type=prompt, llm_call_log_id set)
- [x] Model resolved from `llm_models` table; `model`/`provider` params removed from routes
- [x] `agg_*` score recalculation on jobs after each evaluation insert
- [x] Auto-create `not-started` application on job creation
- [x] `requested_salary` on applications
- [x] All routes → `/api/v1/` prefix
- [x] `slowapi` inbound rate limiting
- [x] `logger.py` structured JSON logging
- [x] `GET /api/v1/health` endpoint
- [x] pytest setup: fixtures, unit tests, 90% coverage (tests/conftest.py + tests/test_database.py + tests/test_evaluator.py)
- [x] Integration tests for routes (tests/routes/)
- [ ] GitHub Actions CI (pytest + ruff lint)

### Phase 1.1 Checklist 🔲
- [x] Vite + React 18 + TypeScript + Tailwind scaffolding
- [x] React Query (TanStack Query) configured
- [x] TypeScript interfaces for all API responses in `frontend/src/types/`
- [x] Dashboard.tsx
- [x] Jobs.tsx / JobDetail.tsx (redesigned layout per PROJECT_SPEC Section 10)
- [x] Evaluate.tsx (animated panel, reset on new run, dual timer)
- [x] Applications.tsx (excludes not-started)
- [x] ApplicationDetail.tsx (logs, audit, applied button, documents)
- [x] Settings.tsx (model management, system_types, My Data editor, app settings, system info)
- [x] LLMUsage.tsx (llm_call_log viewer with copy-prompt button)
- [x] Claude import modal preserved on Evaluate page
- [x] HTML pages retired
- [x] Vitest + React Testing Library, 70% coverage

### Phase 1.2 Checklist 🔲
- [x] Revised `JOBSEARCH_TEMPLATE.md` (Career Narrative, Experience Level, new-grad sections, merged Model Behavior Rules)
- [x] `lesson_learned` added to `system_types` seed in `database.py`
- [x] `jobsearch_versions` table-based approach verified/restored in `database.py`
- [x] Streaming support (`complete_stream()`) added to `llm_client.py`
- [x] Profile section parser utility in `database.py`
- [x] `profile_routes.py` with all profile API routes registered in `main.py`
- [x] SSE streaming chat route (`POST /api/v1/profile/chat`)
- [x] One-shot routes: synthesize-insights, coherence-check, generate-tailoring-rules
- [x] Lesson chat route on applications (`POST /api/v1/applications/{id}/lesson-chat`)
- [x] TypeScript interfaces in `frontend/src/types/profile.ts`
- [x] Profile hooks: `useProfileHealth`, `useProfileSections`, `useProfileVersions`, `useProfileChat`, `useLessonChat`
- [x] `JobSearchProfile.tsx` — two-column layout, section cards, AI chat panel, accept/discard flow
- [x] Left nav entry: "Job Search Profile" (label: "JS Profile")
- [x] Dashboard Profile Strength widget
- [x] ApplicationDetail "Capture a lesson" feature
- [x] Settings My Data: version history with preview + restore
- [x] Profile page UX enhancements + quality audit — all parts complete (A: backend, B: frontend, C: jobsearch.md, D: template)
- [x] Backend tests for all profile routes
- [ ] Frontend tests for Job Search Profile page

### Phase 1.3 Checklist 🔲
- [ ] Typst binary startup validation (graceful degradation)
- [ ] Document upload/list/delete routes (`/api/v1/applications/{id}/documents`)
- [ ] Compile endpoint (`typst compile` server-side)
- [ ] PDF view (new browser tab)
- [ ] Document section on ApplicationDetail
- [ ] Two bundled Typst templates in `templates/typst/`
- [ ] Settings: Typst binary path + disk usage

### Phase 1.4 Checklist 🔲
- [ ] Dockerfile
- [ ] docker-compose.yml (volume mounts: data/, generated/, reports/, logs/)
- [ ] .dockerignore
- [ ] README Docker setup instructions

### Target File Structure (Phase 1.0)
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
├── logger.py               (Phase 1.0 — new)
├── profile_routes.py       (Phase 1.2 — new)
├── templates/
│   └── typst/              (Phase 1.3)
├── pages/                  (read-only reference; retired Phase 1.1)
├── tests/                  (Phase 1.0 — new)
│   ├── conftest.py
│   ├── test_database.py
│   ├── test_evaluator.py
│   ├── test_llm_client.py
│   └── routes/
├── frontend/               (Phase 1.1 — new)
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── src/
│       ├── types/
│       │   └── profile.ts  (Phase 1.2 — new)
│       ├── hooks/
│       │   ├── useProfileHealth.ts    (Phase 1.2 — new)
│       │   ├── useProfileSections.ts  (Phase 1.2 — new)
│       │   ├── useProfileVersions.ts  (Phase 1.2 — new)
│       │   ├── useProfileChat.ts      (Phase 1.2 — new)
│       │   └── useLessonChat.ts       (Phase 1.2 — new)
│       ├── components/
│       └── pages/
│           └── JobSearchProfile.tsx   (Phase 1.2 — new)
├── app_docs/               (planning docs, workorders)
├── my_data/                (gitignored — user PII)
│   ├── jobsearch.md
│   └── resume_templates/
│       └── resume_template.typ
├── inbox/                  (gitignored)
├── data/                   (gitignored)
├── generated/              (gitignored)
├── reports/                (gitignored)
└── logs/                   (gitignored)
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.11+ / FastAPI |
| Web server | Uvicorn |
| Frontend | React 18 / Vite / TypeScript / Tailwind CSS |
| Server state | React Query (TanStack Query) |
| Database | SQLite via Python `sqlite3` stdlib — no ORM |
| LLM (local) | Ollama REST API |
| LLM (cloud) | Anthropic API |
| Model config | `llm_models` DB table (replaces config.yaml model config) |
| Document gen | Typst binary (Phase 1.3) |
| Rate limiting | slowapi (Phase 1.0) |
| Logging | Python stdlib logging — structured JSON (Phase 1.0) |
| Testing | pytest + Vitest (Phase 1.0/1.1) |
| Streaming | SSE via FastAPI `StreamingResponse` (Phase 1.2) |
| Deployment | Docker + docker-compose (Phase 1.4) |

---

## Database Rules (Non-Negotiable)

- **All database logic lives in `database.py`.** No SQL anywhere else.
- **All queries use parameterized statements.** No string interpolation in SQL. Ever.
- **No ORM.** Python `sqlite3` stdlib only.
- **`get_connection()` is the only way to open a database connection.**
- **Upsert = explicit SELECT + INSERT/UPDATE.** Never `INSERT OR REPLACE`.
- **Audit tables are append-only.** Never DELETE or UPDATE `application_audit` or
  `job_posting_audit`.
- **`resume_info` records are never hard-deleted.** Deactivation (`is_active = 0`) only.
- **`system_types` records are never edited.** Add or delete only. Delete blocked if
  referencing records exist.
- **`llm_models.default_flag`:** only one record may have `default_flag = 1`. Enforce via
  explicit SELECT check before any SET in application layer — not a DB constraint.
- **`data/` directory created automatically** by `database.py` on first run.
- **Schema version: 1.0.** Clean break from v0.1. No migration from prior data.

### system_types Seed Values (must be present after `init_db()`)

| type_name | type_value |
|---|---|
| application_log | recruiter_call |
| application_log | interview_feedback |
| application_log | compensation |
| application_log | general |
| application_log | repost_alert |
| application_log | prompt |
| application_log | lesson_learned |
| company_info | website |
| company_info | careerpage |
| company_info | culturepage |
| company_info | industry |
| company_info | size |
| company_info | notes |
| application_document | resume |
| application_document | cover_letter |

### Active Schema (v1.0)

```sql
system_types        (id, type_name, type_value, created_at)
                    UNIQUE (type_name, type_value)

llm_models          (id, model, endpoint, estimated_eval_time,
                     available, default_flag, model_weight, created_at)

jobs                (id, company_name, title, location, remote_type,
                     description_merged, pay_band, role_keyword,
                     dedup_status, first_seen_date, last_seen_date,
                     posting_count, is_repost,
                     agg_role_fit, agg_scope_fit, agg_culture, agg_comp,
                     agg_score_overall,
                     my_role_fit, my_scope_fit, my_culture, my_comp,
                     my_score_overall,
                     excitement_level, created_at, project_id)
                    UNIQUE (company_name, title, role_keyword)

job_company_log     (id, job_id, type_id, log, url, log_timestamp)

job_postings        (id, job_id, source_board, source_url,
                     description_raw, date_posted, date_scraped,
                     is_repost, days_since_prior_posting, repost_url_changed)

evaluations         (id, job_id, llm_model_id,
                     score_overall, score_role_fit, score_scope_fit,
                     score_culture, score_comp,
                     fit_type, archetype, strengths, gaps, recommendation,
                     keywords, domain_match, role_type_match, keyword_gaps,
                     llm_call_log_id, evaluated_at)

llm_call_log        (id, timestamp, llm_model_id, call_type,
                     prompt, prompt_hash, raw_response,
                     prompt_tokens_estimated, prompt_tokens_actual,
                     completion_tokens_actual, total_tokens_actual,
                     latency_ms, call_time, success, error_message,
                     job_id, search_run_id)

applications        (id, job_id, apply_date, end_date,
                     requested_salary, application_status, project_id)
                    DEFAULT application_status = 'not-started'

application_logs    (id, application_id, type_id, log, url,
                     log_timestamp, llm_call_log_id)

application_documents (id, application_id, type_id, file_path, created_at)

application_audit   (id, application_id, timestamp, event)   -- append-only
job_posting_audit   (id, job_posting_id, timestamp, event)   -- append-only, Phase 3

jobsearch_versions  (id, content, saved_at, note)

-- Stubs (created at init, activated in noted phase):
resume_info         -- Phase 2+
search_runs         -- Phase 3
search_run_errors   -- Phase 3
chat_sessions       -- Phase 3
chat_messages       -- Phase 3
projects            -- Phase 4

schema_versions     (id, version, applied_at, description, checksum)
schema_migrations   (id, from_version, to_version, migration_sql, rollback_sql, created_at)
```

### Key Schema Decisions
- `companies` table is **dropped**. `company_name` is a TEXT field on `jobs`.
- `job_company_log` stores company details as typed log entries (same pattern as
  `application_logs`). New detail types added via `system_types`, no schema change needed.
- `evaluations.model_used` (TEXT) replaced by `evaluations.llm_model_id` (FK to `llm_models`).
- `evaluations.prompt_hash`, `evaluations.raw_response`, `evaluations.log_entry` removed.
  `prompt_hash` and `raw_response` now live in `llm_call_log`.
- `evaluations.llm_call_log_id` FK links each evaluation to its source LLM call.
- `applications.excitement_level` moved to `jobs.excitement_level`.
- `applications.cv_link`, `applications.cover_link` removed — use `application_documents`.
- `application_logs`: `note_type` → `type_id`, `note` → `log`, `timestamp` → `log_timestamp`.
- `application_status = 'not-started'`: auto-created with every job insert. Hidden from
  Applications view (filter: `application_status != 'not-started'`).
- `agg_score_overall`: simple average of all `evaluations.score_overall` for the job.
  Recalculated after every evaluation insert.
- `generated_docs` table is **retired**. `application_documents` handles all file tracking.

---

## Evaluation Pipeline Rules (Critical)

### Prompt Injection Mitigation — Required on Every Evaluation
```python
jd_clean = jd_text.replace("[JD_START]", "").replace("[JD_END]", "")
prompt = f"[JD_START]\n{jd_clean}\n[JD_END]"
```

### LLM Response Fields — All Must Be Stored
`score_overall`, `score_role_fit`, `score_scope_fit`, `score_culture`, `score_comp`,
`fit_type`, `archetype`, `strengths`, `gaps`, `recommendation`, `keywords`,
`domain_match`, `role_type_match`, `keyword_gaps`

### LLM Parse Failure Contract
- Attempt 1: standard structured prompt
- Attempt 2 (on parse failure): stricter JSON-only prompt
- On second failure: write evaluation with all score fields NULL, `raw_response` preserved
  in `llm_call_log`. Never silently drop a failed evaluation.
- Surface to user: "Evaluation failed — raw response available"

### Post-Evaluation Steps (always, even on parse failure)
1. Write `llm_call_log` record (prompt, raw_response, prompt_hash, tokens, latency)
2. Set `evaluations.llm_call_log_id`
3. Recalculate and update `jobs.agg_*` fields (skip if all scores NULL)
4. Write `application_logs` entry with type = `prompt`, `llm_call_log_id` set

### Startup Validation
1. Check each `llm_models` record — update `available` flag
2. If `llm_models` empty: auto-seed from config.yaml (`ollama.base_url` + `ollama.default_model`)
3. Phase 1.2: check Typst binary — degrade gracefully if not found
4. If no models available: log error, continue (app usable for browsing)

---

## /inbox/ Processing Rules

- Successful processing → move file to `/inbox/done/`
- Failed processing → move to `/inbox/failed/` + create `{filename}.error.txt` sidecar
- Never reprocess failed files automatically
- Never block on a single failed file — continue processing remaining files

---

## Security Rules (Non-Negotiable)

- **No SQL string interpolation. Ever.**
- **API keys never leave the server.** Never in responses, logs, or DB.
- **Bind to `127.0.0.1` by default.**
- **CORS:** `http://localhost:3000` and `http://localhost:8080` only. Never `*`.
- **SHA-256 for all hashing.** Never MD5.
- **Delimiter injection prevention** on every evaluation.
- **File path sanitization:** `[a-zA-Z0-9_-]` only for generated paths, max 64 chars,
  validated within `/generated/`.
- **All API routes use `/api/v1/` prefix.**
- **Settings GET for API keys:** boolean presence only — never echo values.

---

## LLM Client Interface

All LLM calls go through `llm_client.py`. No direct API calls anywhere else.

```python
response = await llm_client.complete(
    prompt: str,
    system: str,
    model: str,
    provider: str,       # "ollama" | "anthropic" | "openai"
    base_url: str,
    max_tokens: int = 2000
) -> dict                # keys: success, content, error, model, provider,
                         #       latency_ms, prompt_tokens_actual,
                         #       completion_tokens_actual, total_tokens_actual
```

Model and endpoint resolved from `llm_models` table before calling `llm_client.complete()`.
Never read model config from `config.yaml` directly in evaluator or routes.

---

## React / TypeScript Rules (Phase 1.1+)

### Structure
- All frontend code in `frontend/`
- Pages: `frontend/src/pages/` — one file per route
- Components: `frontend/src/components/` — reusable UI
- Types: `frontend/src/types/` — all API response interfaces defined here **first**,
  before building any page that uses them
- Hooks: `frontend/src/hooks/` — all React Query custom hooks live here

### Data Fetching
- **All server state uses React Query (TanStack Query).** No raw `fetch()` in components
  for data that needs loading states, caching, or error handling.
- Wrap all queries in custom hooks in `frontend/src/hooks/`
- Every data-fetching hook handles: loading state, error state, empty state

### Components
- Functional components only — no class components
- No `any` type — use `unknown` and narrow it
- Explicit type annotations preferred over inferred
- Brief inline comments on non-obvious TypeScript patterns only

### Styling
- Tailwind CSS only — no inline styles, no CSS modules
- Design tokens (configure in tailwind.config):
  - bg: `#0f0f0f`, surface: `#181818`, surface2: `#222222`
  - accent: `#c8a96e`, green: `#6a9c6a`, red: `#9c6a6a`
  - Fonts: DM Serif Display, DM Mono, DM Sans

### API
- All calls to `/api/v1/` — no legacy route paths
- No localStorage or sessionStorage
- Confirmation required for destructive actions

---

## Code Style

- **Python:** PEP 8, type hints on all function signatures, docstrings on public functions
- **TypeScript/React:** explicit types, no `any`, functional components only
- **Naming:** `snake_case` Python, `camelCase` JS/TS, `PascalCase` React components
- **Comments:** explain *why*, not *what*. Default to no comments.
- **No dead code** in commits
- **No TODO comments** in committed code — use GitHub Issues

---

## What to Ask Before Doing

Stop and ask for explicit confirmation before:
- Adding any new Python or JavaScript/TypeScript dependency
- Modifying the database schema
- Changing the LLM client interface
- Writing to the filesystem outside `data/`, `generated/`, `reports/`, or `inbox/`
- Adding any network binding outside `127.0.0.1`
- Logging anything that could capture user content, API keys, or PII
- Refactoring working code not related to the current task

---

## What NOT to Do

- No ORM
- No additional frontend frameworks beyond React/Vite/TypeScript/Tailwind
- No Axios — React Query + fetch only
- No raw `fetch()` in React components for server state — use React Query
- No authentication (Phases 1.0–1.2)
- No telemetry or analytics
- No SQL outside `database.py`
- No LLM API calls outside `llm_client.py`
- No auto-submit of applications
- No hard-deletion of `resume_info` records
- No automatic schema changes on startup (the one exception: auto-seed `llm_models` from
  config.yaml on first run when table is empty)
- Do not modify HTML pages in `pages/` — read-only reference material
- Do not build React pages without first defining TypeScript interfaces in `frontend/src/types/`
- Do not use `any` type in TypeScript
- Do not add frontend dependencies without explicit instruction
- Do not read model config from `config.yaml` in evaluator or routes — use `llm_models` table
- Do not store API keys in the database or config.yaml

---

## Context Files

| File | Purpose |
|---|---|
| `PROJECT_SPEC.md` | Full specification — architecture, schema, pipeline, phases |
| `CLAUDE.md` | This file — rules and current state for code generation |
| `FEATURES.md` | Backlog of future ideas — not scheduled work |
| `WORKORDER_ideas.md` | Design notes and ideas scratchpad |
| `jobsearch.md` | User's job search context (gitignored) |
| `config.yaml` | Runtime infrastructure configuration |
| `database.py` | Authoritative schema and all DB helper functions |
| `pages/` | HTML pages — read-only reference, retired in Phase 1.1 |
| `templates/` | Template files users copy to create working copies |

---

*Update the Current Phase section and checklists as work progresses.*
*Update this file when tech stack, schema, or architectural decisions change.*
