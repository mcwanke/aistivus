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
Crawl4AI runs as a standalone external service — the same model as Ollama. AIstivus
calls it via HTTP from `scrape_routes.py`. Users manage the Crawl4AI container lifecycle
independently; it is not bundled in AIstivus's `docker-compose.yml`.

**Rationale:** Crawl4AI is a reusable general-purpose scraping service, not an AIstivus-
specific component. Running it standalone makes it available across projects. The abstraction
boundary is clean: `scrape_routes.py` in the AIstivus backend owns the API contract and
structured field extraction; Crawl4AI owns the page rendering.

### Why Crawl4AI

Three options were evaluated before this decision:

| Option | Outcome |
|---|---|
| Custom scraper (trafilatura + httpx) | Rejected. Plain HTTP fails silently on JS-rendered job boards (Workday, iCIMS, Greenhouse, Lever) — the most common boards. Playwright support was Phase 2 deferred work with no clear timeline. |
| Scrapper (amerkurev/scrapper) | Rejected. 297 GitHub stars, pre-1.0. Mozilla Readability.js extraction does not return structured metadata (JSON-LD) — BS4 would still be needed. Same ~2GB image size as Crawl4AI with significantly more maintenance risk. |
| **Crawl4AI (unclecode/crawl4ai)** | **Selected.** 50k+ GitHub stars, actively maintained (v0.8.9, June 2026), pinnable version tags, Playwright built in, returns both rendered HTML and clean markdown, health endpoint at `/health`. |

### Always Playwright

Crawl4AI is always invoked with Playwright (headless Chromium). No fast-path plain HTTP
fallback.

**Rationale:** The most common job boards (Workday, iCIMS, Greenhouse, Lever) are
JavaScript-rendered SPAs. Plain HTTP returns page shell, not the job description. A
fast-path fallback adds code complexity and a false-confidence failure mode: short rendered
content is indistinguishable from a JS-rendered page without actually rendering it. For a
single-user tool making infrequent single-URL requests, the 3–8 second Playwright render
time is acceptable. A spinner with elapsed time is shown in the UI during the wait.

### Tech Stack

| Component | Technology |
|---|---|
| Page fetch + JS rendering | Crawl4AI REST API (`POST /crawl`, port 11235) |
| Structured field extraction | BeautifulSoup4 — JSON-LD parsing against rendered HTML |
| Gap-fill LLM call | Existing `llm_client.py` + `llm_models` table |

### API Contract

**Request to Crawl4AI (`POST /crawl`):**
```json
{
  "urls": ["https://..."],
  "browser_config": {"type": "BrowserConfig", "params": {"headless": true}},
  "crawler_config": {"type": "CrawlerRunConfig", "params": {"cache_mode": "bypass"}}
}
```

**From Crawl4AI response:**
- `results[0].markdown` → `jd_text` (clean body content)
- `results[0].html` → BS4 JSON-LD extraction for structured fields

**AIstivus `ScrapeResult` contract (returned to frontend — unchanged):**
```
scrape_quality, apply_url, title, company, location, remote_type, pay_band, jd_text, error
```

`scrape_quality: partial` when `jd_text` word count < 100.

### Field Extraction Strategy

| Field | Source | Confidence |
|---|---|---|
| `jd_text` | Crawl4AI markdown output | High |
| `apply_url` | Echoed from request URL | Free |
| `title` | JSON-LD `title`, fallback `<h1>`, fallback `<title>` tag | High |
| `company` | JSON-LD `hiringOrganization`, fallback `og:site_name` | Usually |
| `location` | JSON-LD `jobLocation` | Sometimes |
| `pay_band` | JSON-LD `baseSalary` | Best-effort |
| `remote_type` | JSON-LD or labeled text; null if not found (LLM fills this) | Unreliable structurally |

### Configuration

`crawl4ai.base_url` in `config.yaml`:
- Docker network: `http://crawl:11235` (container named `crawl`)
- Remote server / dev: server address (Traefik URL or direct IP)

If unreachable: per-request inline error returned to frontend; URL import shows
"Crawl4AI unavailable — enter fields manually"; rest of Evaluate page unaffected.

### Phase 2 Additions (designed for, not yet built)
- ATS platform-specific targeted extractors (Greenhouse, Lever, Workday)
- URL response caching with TTL
- Proxy configuration for anti-bot sites

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
Crawl4AI runs as a standalone container on a remote server — no third local process
required. Set `crawl4ai.base_url` in `user_data/config.yaml` to the server address
before running.

If Crawl4AI is unreachable: per-request inline error shown below the URL input;
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
