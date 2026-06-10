# AIstivus — Phase 2.0 Design Document
> Status: Active planning — decisions recorded as made, open questions tracked until resolved
> Last updated: 2026-06-09

---

## 1. Three-Workflow Architecture

Phase 2 restructures the app around three top-level workflows. These become the primary
navigation entry points replacing the current sidebar model.

### Career
Gives the user a place to build and maintain their career history, skills, and personal
documents over time — usable even when not actively job searching.

**Phase 2 intent (scoped):** Generate and maintain `jobsearch.md` and `jobsearch_cover.md`.
The current Job Search Profile builder (section editor + AI chat) moves here.

**Full design: deferred.** The broader Career workflow — structured job history, skills,
projects, diary/log, story-to-document AI parsing, persistent memory — needs a dedicated
design session before it can be workorder'd.

### Job Search
Existing functionality plus new features added incrementally. First additions:
URL ingestion (Step 3), memory (design TBD).

### Settings
Existing settings page plus: prompt editing (Step 4), data dashboards (future).

---

## 2. Navigation Model

**Component:** `AppHeader.tsx` — already used on all pages.

**Change:** Add three navigation links to the top-right of AppHeader:
- **Career** → `/career` (stub in Phase 2.0)
- **Job Search** → `/jobs`
- **Settings** → `/settings`

No dashboard redesign in Phase 2.0. The main page is intentionally deferred — needs
its own design session.

---

## 3. Scraper Service Design

### Approach
Standalone Python microservice in a `scraper/` subdirectory of the aistivus repo.
Bundled into `docker-compose.yml` as a second service (Option A). In dev mode, run
manually as a third local process alongside uvicorn and the Vite dev server.

**Rationale for bundled (vs. separate repo):** The second app that would consume this
service is months out and not yet concrete. Extract to a separate repo when that need
is real. The internal module boundary is clean enough to make extraction a half-day job.

### Tech Stack (Phase 1)
- FastAPI — API layer
- httpx — HTTP requests
- trafilatura — main-body content extraction (strips nav, ads, footer boilerplate)
- BeautifulSoup4 — structured metadata extraction (JSON-LD, meta tags)
- lxml — HTML parser (trafilatura dependency)

**Explicitly excluded from Phase 1:**
- keyBERT / sentence-transformers — heavy ML dependency (~800MB+); duplicates keyword
  extraction already done by the LLM evaluator
- Playwright — headless browser for JS-heavy pages; Phase 2 addition
- ATS-specific extractors (Greenhouse, Lever, Workday) — Phase 2 addition
- Redis / async job queue — synchronous is sufficient for single-URL requests at this scale
- URL response caching — Phase 2 addition

### API Contract

```
POST /scrape
{
  "url": "https://..."
}

Response:
{
  "scrape_quality": "full" | "partial",
  "apply_url": "https://...",     // echoed from request
  "title":     "Engineering Manager" | null,
  "company":   "Acme Corp" | null,
  "location":  "New York, NY" | null,
  "remote_type": "Remote" | "Hybrid" | "On-site" | null,
  "pay_band":  "$150k–$180k" | null,
  "jd_text":   "...",              // main body content; may be partial
  "error":     null | "message"
}
```

`scrape_quality: partial` is returned when jd_text is below a word count threshold
(exact threshold TBD at implementation time — suggest 100 words as a starting point).

### Field Extraction Strategy

| Field | Source | Confidence |
|---|---|---|
| `jd_text` | trafilatura main-body extraction | High |
| `apply_url` | Echoed from request URL | Free |
| `title` | `<title>` tag, `<h1>`, JSON-LD `title` | High |
| `company` | `og:site_name`, JSON-LD `hiringOrganization`, `<title>` pattern | Usually |
| `location` | JSON-LD `jobLocation`, labeled text | Sometimes |
| `pay_band` | JSON-LD `baseSalary`, labeled text | Best-effort |
| `remote_type` | JSON-LD or labeled text; LLM inference as fallback | Unreliable structurally |

### Phase 2 Additions (designed for, not yet built)
- Playwright headless browser for JS-heavy SPAs (Workday, iCIMS)
- ATS platform-specific targeted extractors
- URL response caching with TTL

---

## 4. URL Ingestion Flow

### User Flow
1. User enters a job posting URL on the Evaluate page
2. AIstivus backend calls the scraper service
3. Scraper returns extracted fields + `scrape_quality`
4. Fields pre-fill the Evaluate form; user sees results immediately
5. If `scrape_quality: partial` → yellow warning banner above form
6. If fields are missing: "Fill gaps with AI" button triggers LLM extraction call
7. If LLM call is also insufficient: user fills manually (always available)

### "Fill gaps with AI" LLM Call
- Opt-in — button, not automatic
- Rationale: local models (e.g. qwen3:14b) take 10–25 seconds for this call;
  automatic execution would feel like friction when the scraper already got most fields
- Input: raw `jd_text` + current field values (so LLM only fills what's missing)
- Output: structured JSON with normalized field values
- Uses existing `llm_client.py` + `llm_models` table — no new model config needed
- Prompt lives in `prompt_builder.py` (Phase 2.0 prompt extraction work)

### Dev Mode
Run scraper as a third local process:
```
cd scraper && uvicorn main:app --port 8001 --reload
```
`config.yaml` has `scraper.base_url`:
- Local dev: `http://localhost:8001`
- Docker: `http://scraper:8001` (Docker Compose service name)

If scraper is not running: URL import button disabled with a clear message;
rest of Evaluate page unaffected.

---

## 5. Prompt Editing — Design (Open)

### Intent
Move prompt strings out of inline route handlers and into an editable, versionable store.
Lets users customize AI behavior (chat persona, lesson capture, org summary, etc.)
without touching source code.

### Prerequisites
`prompt_builder.py` extraction must happen first. Currently three route handlers in
`main.py` embed 200–400-line prompt strings inline. These become functions in
`prompt_builder.py`; route handlers become thin callers.

### Open Questions (design session needed)
- **Storage format:** markdown files on disk vs. DB records in a new `prompts` table.
  Markdown is simpler and git-trackable; DB enables versioning and UI editing more naturally.
- **Which prompts are user-editable:** All? Only instructional/persona prompts?
  Structural prompts (evaluation, resume generation) have rigid JSON output schemas
  that the parser depends on — user edits could break parsing. Need to define the
  boundary between "safe to customize" and "structural — edit at your own risk."
- **UI location:** New "Prompts" tab in Settings, or a section in the Profile & Document
  Builder? Settings is simpler; Profile Builder is more coherent if prompts are
  tied to the Career workflow.
- **Versioning:** Snapshot on every save (like `jobsearch_versions`)? Last N versions?

---

## 6. Memory — Design (Open)

Referenced in PLAN_2.0.md for both Career and Job Search workflows. Needs a dedicated
design session.

### Open Questions
- **What does "memory" mean concretely?** Options:
  - In-context summarization: summarize past applications/lessons, pass with each LLM call
  - Structured DB facts: extract entities (companies, roles, outcomes) from logs into records
  - Vector store: embed past content, retrieve semantically similar context at call time
- **Scope per workflow:** Career memory vs. Job Search memory may be different things
  with different architectures
- **Persistence model:** How does memory get built up over time? Manual trigger?
  Auto-extract after certain events (rejection logged, evaluation complete)?

---

## 7. Dashboard Redesign — Deferred

The main page/dashboard redesign needs its own design session. It will need to reflect
the three-workflow structure but the specifics are not yet designed.

Not in Phase 2.0 workorder scope.

---

## 8. Open Questions Index

| # | Question | Blocking |
|---|---|---|
| D1 | Dashboard redesign — layout and content for three-workflow model | No (deferred) |
| D2 | Career workflow full design — structured history, diary, story parsing | No (stubbed) |
| D3 | Memory architecture — in-context vs. structured vs. vector | No (pending) |
| D4 | Prompt storage format — markdown files vs. DB table | Yes (Step 4) |
| D5 | Prompt editability boundary — which prompts are safe to expose | Yes (Step 4) |
| D6 | Prompt editing UI location — Settings vs. Profile Builder | Yes (Step 4) |
