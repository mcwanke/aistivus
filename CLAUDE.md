# CLAUDE.md — AI Code Generation Context & Boundaries

## How to Work With Me

This file is consumed by AI-assisted code generation tooling at the start of every session. Read this file completely before writing or modifying any code. For full architecture detail, see PROJECT_SPEC.md. 

Never open responses with filler phrases like "Great question!", "Of course!", "Certainly!", or similar warmups. Start every response with the actual answer. No preamble, no acknowledgment of the question. 

Match response length to task complexity. Simple questions get direct, short answers. Complex tasks get full, detailed responses. Never pad responses with restatements of the question or closing sentences that repeat what you just said. 

Before any significant task, show me 2-3 ways you could approach this work. Wait for me to choose before proceeding. 

If you are uncertain about any fact, statistic, date, or piece of technical information: say so explicitly before including it. Never fill gaps in your knowledge with plausible-sounding information. When in doubt, say so.

I am learning and using this as a way to grow my knowledge. I have a background in software engineernig and a strong grasp of the fundamentals. Assume I am still learning the technology in the project and I will state when my comfort level with the topic is strong enough to skip over elements. Adjust the depth of every response to match this. Never over-explain what I already know. Never skip context I need.

NEVER create, write, or modify any file without explicit user approval. State what you intend to write and wait for confirmation before touching disk.

## Behavior

Only modify files, functions, and lines of code directly related to the current task. Do not refactor, rename, reorganize, reformat, or "improve" anything I did not explicitly ask you to change. If you notice something worth fixing elsewhere, mention it in a note at the end. Do not touch it. Ever.

Before making any change that significantly alters content I've already created (rewriting sections, removing paragraphs, restructuring flow, changing tone): stop. Describe exactly what you're about to change and why. Wait for my confirmation before proceeding.

Before deleting any file, overwriting existing code, dropping database records, or removing dependencies: stop. List exactly what will be affected. Ask for explicit confirmation. Only proceed after I say yes in the current message. "You mentioned this earlier" is not confirmation.

The following require explicit in-session confirmation, no exceptions: deploying or pushing to any environment, running migrations or schema changes, sending any external API call, executing any command with irreversible side effects. I must say yes in the current message.

The following also require explicit in-session confirmation before executing: any shell command run via terminal (including read-only commands like ls, git status, docker ps). State what you intend to run and why. Wait for my approval.

After any coding task, end with: Files changed (list every file touched) / What was modified (one line per file) / Files intentionally not touched / Follow-up needed.

Never send, post, publish, share, or schedule anything on my behalf without my explicit confirmation in the current message. This includes emails, calendar invites, document shares, or any action outside this conversation. I must say yes in the current message.

For any task involving architecture decisions, debugging complex issues, or non-trivial features: work through the problem step by step before writing any code. Show your reasoning. Identify where you're uncertain. Then implement.

## Memory

Project decisions and deferred work are tracked in `memory/`. This folder is gitignored — it does not get committed. Check `memory/MEMORY.md` for an index before starting significant work.

Read memory/MEMORY.md at the start of every session. Never contradict a logged decision without flagging it first.

When I say "END SESSION" or "end session": ask me "Ready to write session summary to memory/MEMORY.md?", provide a short bullet point summary list of what you would write, and wait for confirmation before writing. Include: Worked on / Completed / In progress / Decisions made / Next session priorities. Once this is done remind me to commit to github if needed.

Maintain a file called memory/ERRORS.md. When an approach takes more than 2 attempts to work, ask me "Ready to log this to memory/ERRORS.md?" and wait for confirmation before writing. Check memory/ERRORS.md before suggesting approaches to similar tasks.

For questions involving system architecture, performance tradeoffs, database design, or long-term technical decisions: reason through the problem step by step before answering. Surface tradeoffs I haven't considered. Flag assumptions that might not hold at scale. Then give your recommendation.

## Core Rules

1. Ask, don't assume. If something is unclear, ask before writing a single line. Never make silent assumptions about intent, architecture, or requirements.

2. Simplest solution first. Always implement the simplest thing that could work. Do not add abstractions or flexibility that weren't explicitly requested.

3. Don't touch unrelated code. If a file or function is not directly part of the current task, do not modify it, even if you think it could be improved.

4. Flag uncertainty explicitly. If you are not confident about an approach or technical detail, say so before proceeding. Confidence without certainty causes more damage than admitting a gap.

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

## Current Phase: PHASE 2.1 — Evaluation Quality + Prompt System (Active)

See `app_docs/WORKORDER_p2.1.md` for full implementation detail.

### Phase 2.1 — Step 1: Prompt Calibration Fixes ✅
- `evaluator.py` `SYSTEM_PROMPT_TEMPLATE`: reframe scoring bands 1–10; remove "10 is rare" language; remove contradictory "don't suppress high scores" instruction
- `main.py` external eval prompt: extract to `EXTERNAL_EVAL_PROMPT_TEMPLATE` constant; add matching calibration guidance

### Phase 2.1 — Step 2: Quick UX Wins + Re-Run Eval ✅
- Spinner icon on Fill With AI button (`Evaluate.tsx`)
- Text search input (first element in Jobs filter bar, client-side, company + title)
- Company name + title added to existing Job Info edit modal (`JobDetail.tsx`)
- "Re-Run Internal Eval" button on Job Details → Evaluations tab: navigates to Evaluate page with all 7 fields pre-populated via router state; `job_id` in state bypasses dedup detection

### Phase 2.1 — Step 3: Create Job Without Eval + Post-Action Widget ✅
- New "Create Job Without Eval" button on Evaluate page (same fields, no model selector, no AI call)
- All evaluated jobs auto-activate (`is_active = 1`) — evaluate endpoint sets this directly; "Yes/No, build this job" buttons removed
- New `POST /api/v1/jobs/create` endpoint
- Post-eval and post-import: inline widget (not a modal) with **Go To Job** | **Evaluate Again**; appears above evaluation result

### Phase 2.1 — Step 4: Evaluation Feedback System ✅
- New `prompt_feedback` table (superseded by `prompt_usage` in Step 5a — not deployed to production)
- New `POST /api/v1/prompt-feedback` endpoint
- `EvaluationFeedbackButton` component: inline button → modal with agree/disagree + dimension selector + optional text
- Wired in two places: above result on Evaluate page (internal eval); second modal after Import External Eval success (external eval)
- Feedback not displayed to user in this phase — stored for Phase 2.2 review tool

### Phase 2.1 — Immediate Fixes (Issue 1 + 2) ✅
- `Evaluate.tsx` `ResultPanel`: add prominent `score_overall` display above sub-score grid (field exists in response, not rendered)
- `EvaluationFeedbackButton.tsx`: convert "Rate this evaluation" text link into bordered card-style widget with explanation line and real button

### Phase 2.1 — Step 5a: Schema Foundation + prompt_generation.py 🔲
- New `prompts` table: versioned, editable prompt templates; `[[EDITABLE]]`/`[[READONLY]]` segment markers; `is_active` uniqueness enforced in application layer
- New `prompt_usage` table: per-call prompt instances; holds `prompt_key`, `prompt_version`, `prompt_text`, `prompt_hash`, `source`, `job_id`; inline feedback fields (`agree`, `dimension`, `feedback_text`, `is_consumed`)
- Drop `prompt_feedback` table (replaced by `prompt_usage`; safe — not deployed to production)
- `llm_call_log`: ADD COLUMN `prompt_usage_id` FK; DROP COLUMN `prompt`; DROP COLUMN `prompt_hash` (after data migration)
- Data migration: seed `prompts` table with current eval constants (version 1); migrate historical evaluation `llm_call_log` records to `prompt_usage`; backfill FK
- New `prompt_generation.py`: single entry point for all managed prompt construction; writes `prompt_usage` rows; returns `{ prompt_text, prompt_usage_id }`
- `evaluator.py`: replace inline prompt construction with `prompt_generation.get_prompt()`
- External eval route: uses `prompt_generation.get_prompt()`; `prompt_usage_id` embedded in JSON response structure for round-trip preservation
- `EvaluationFeedbackButton`: props updated to `promptUsageId`; calls new `POST /api/v1/prompt-usage/{id}/feedback` endpoint

### Phase 2.1 — Step 5b: Prompt Editor UI + Feedback Loop Trigger 🔲
- New "Prompts" section in Settings page
- `PromptEditor` component: prompt dropdown; left column = editable segments as `<textarea>`, locked segments as muted read-only; right column = assembled preview with `preview_context` values substituted
- "Run Feedback Loop" button in editor header: gathers unprocessed feedback for selected prompt → sends to cloud LLM with prompt text → returns improvement suggestions → marks feedback `is_consumed = 1`
- New API endpoints: `GET /api/v1/prompts`, `GET /api/v1/prompts/{key}`, `POST /api/v1/prompts/{key}/save`, `GET /api/v1/prompts/{key}/preview`, `POST /api/v1/prompts/{key}/feedback-loop`

### Phase 2.1 — Step 6: Multi-Prompt Split 🔲
- Migrate evaluation prompts from code constants to `prompts` table as four entries: `eval_analysis_system`, `eval_analysis_user`, `eval_scoring_system`, `eval_scoring_user`
- Two-call evaluation pipeline in `evaluator.py`: Call 1 (archetype + deal-breaker + domain analysis) → Call 2 (scoring using committed Call 1 output); outputs merged into single `evaluations` record
- `evaluations.llm_call_log_id` points to Call 2; Call 1 traceable via `job_id` on `llm_call_log`
- Call 1 failure → fail entire evaluation; Call 2 failure → retry once (existing contract)
- New nullable `analysis_json TEXT` column on `evaluations` (delta migration via ALTER TABLE)
- Original code constants retained as seeding fallbacks; `test_evaluator.py` requires significant rewrite

### Phase 2.0 — Steps 1–3 ✅ Complete
- Step 1: CI/CD — `.github/workflows/ci.yml`; pytest + ruff + vitest + build on every push/PR
- Step 2: Nav restructure — `AppHeader.tsx` three-item nav group; `/career` stub route
- Step 3: URL ingestion — `scrape_routes.py`; Crawl4AI client; fill-gaps AI endpoint; Evaluate page UI
- Step 4: Superseded by Phase 2.1 workorder
- Step 5: 🔲 Not yet designed — Memory, Dashboard redesign, Career workflow

### Phase 1.7 — Docker ✅ Complete
- Dockerfile (multi-stage: Node:20-slim build → python:3.11-slim serve; Typst v0.14.2 baked in; HEALTHCHECK)
- docker-compose.yml (volume mounts: user_data/, app_data/; env_file: .env; port 127.0.0.1:8080)
- .dockerignore
- main.py: StaticFiles + SPA catch-all already in place from Phase 1.1
- README.md: Docker setup instructions complete; Ollama host.docker.internal note added

### Target File Structure
```
aistivus/
├── CLAUDE.md
├── PROJECT_SPEC.md
├── requirements.txt
├── main.py
├── database.py
├── evaluator.py
├── evaluate.py
├── prompt_generation.py
├── llm_client.py
├── logger.py
├── profile_routes.py
├── document_routes.py
├── env_utils.py
├── templates/              (committed — ships with repo)
│   ├── CONFIG_TEMPLATE.yaml
│   ├── JOBSEARCH_TEMPLATE.md
│   ├── JOBSEARCH_COVER_TEMPLATE.md
│   ├── INBOX_TEMPLATE.md
│   └── typst/
│       ├── README.md
│       ├── resume/
│       └── cover-letter/
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
│       └── pages/
├── app_docs/               (planning docs, workorders)
├── user_data/              (gitignored — user-authored; Docker volume)
│   ├── config.yaml
│   └── my_data/
│       ├── jobsearch.md
│       ├── jobsearch_cover.md
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
| Document gen | Typst binary (Phase 1.4) |
| Rate limiting | slowapi (Phase 1.0) |
| Logging | Python stdlib logging — structured JSON (Phase 1.0) |
| Testing | pytest + Vitest (Phase 1.0/1.1) |
| Streaming | SSE via FastAPI `StreamingResponse` (Phase 1.2) |
| Deployment | Docker + docker-compose (Phase 1.7) |

---

## Database Rules (Non-Negotiable)

- **Schema migration policy:** The wipe-and-rebuild policy is **retired** — the user has
  real data in the database. All schema changes must be **delta migrations**: `ALTER TABLE`
  to add columns, `CREATE TABLE` for new tables. Never drop and recreate tables. Never call
  `init_db()` in a way that would destroy existing data.

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

### system_types Seed Values
Seed values are defined in `init_db()` in `database.py` — that is the authoritative source.

### Active Schema (v1.0)
Full schema DDL lives in `database.py` `init_db()` — that is the authoritative source.

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
3. Phase 1.4: check Typst binary — degrade gracefully if not found
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
  validated within `app_data/application_docs/`.
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
- Writing to the filesystem outside `user_data/`, `app_data/`, or `ignore/`
- Adding any network binding outside `127.0.0.1`
- Logging anything that could capture user content, API keys, or PII
- Refactoring working code not related to the current task

---

## What NOT to Do

- No ORM
- No additional frontend frameworks beyond React/Vite/TypeScript/Tailwind
- No Axios — React Query + fetch only
- No raw `fetch()` in React components for server state — use React Query
- No authentication (Phases 1.0–1.7; covered by localhost binding or reverse proxy)
- No telemetry or analytics
- No SQL outside `database.py`
- No LLM API calls outside `llm_client.py`
- No auto-submit of applications
- No hard-deletion of `resume_info` records
- No automatic schema changes on startup (the one exception: auto-seed `llm_models` from
  config.yaml on first run when table is empty)
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
| `app_docs/FEATURES.md` | Backlog of future ideas — not scheduled work |
| `user_data/config.yaml` | Runtime infrastructure configuration (gitignored) |
| `user_data/my_data/jobsearch.md` | User's job search context (gitignored) |
| `database.py` | Authoritative schema and all DB helper functions |
| `templates/` | Template files users copy to create working copies |

---

*Update the Current Phase section and checklists as work progresses.*
*Update this file when tech stack, schema, or architectural decisions change.*
