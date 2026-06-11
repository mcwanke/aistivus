# AIstivus — Phase 2.0 Workorder
> Status: In progress — Step 1 complete; Steps 2–3 ready to execute; Steps 4–5 pending design
> Last updated: 2026-06-10
> Design doc: app_docs/DESIGN_p2.0.md

---

## Pre-Work

Before starting any step:
- Check `memory/MEMORY.md` for the current test baseline
- Run tests only if no baseline exists
- Each step should end with a passing test run and an updated baseline in memory

---

## Step 1 — CI/CD Setup ✅

**Goal:** Automated test runs on every push/PR. GitHub blocks merges to `main` if
backend or frontend checks fail.

### 1.1 Verify ruff is in requirements.txt
Check `requirements.txt`. If `ruff` is not present, add it before writing the workflow.

### 1.2 Create `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  backend:
    name: Backend — pytest + ruff
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
          cache: 'pip'

      - run: pip install -r requirements.txt

      - run: pytest tests/ -v

      - run: ruff check .

  frontend:
    name: Frontend — vitest + build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json

      - run: cd frontend && npm ci

      - run: cd frontend && npm test -- --run

      - run: cd frontend && npm run build
```

### 1.3 Push and verify first CI run is green
Do not enable branch protection until the first run passes. Fix any failures first.

### 1.4 Enable branch protection on GitHub
Repository Settings → Branches → Add rule for `main`:
- Require status checks to pass before merging
- Add `backend` and `frontend` as required checks
- (Optional) Require branch to be up to date before merging

> ⚠️ Manual step — must be done in GitHub UI after first green CI run.

### Files touched
- `requirements.txt` — added `ruff>=0.4.0`
- `.github/workflows/ci.yml` (new) — added `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: 'true'` env
- `database.py`, `logger.py`, `main.py` — fixed ruff F841/E741 violations
- `tests/` — fixed ruff F401/F541/F841/E741 violations across 5 test files

---

## Step 2 — Nav Restructure 🔲

**Goal:** AppHeader gains three top-right navigation links. Career route is stubbed.
No dashboard redesign — AppHeader change only.

### 2.1 Update `AppHeader.tsx`

Add three navigation links to the top-right of the header, alongside the existing
Settings link (which becomes part of the nav group):

- **Career** → `/career`
- **Job Search** → `/jobs`
- **Settings** → `/settings`

Style: DM Mono, muted, consistent with existing Settings link treatment. Active
route highlighted (match current path).

Remove the standalone Settings link that currently sits top-right — it becomes the
third item in the nav group.

### 2.2 Create `/career` stub page

New file: `frontend/src/pages/Career.tsx`

Minimal placeholder — AppHeader + a centered message indicating this section is
coming soon. No functionality. Matches the visual style of other pages.

### 2.3 Add `/career` route to React Router

In `frontend/src/main.tsx` or `App.tsx`, add:
```tsx
<Route path="/career" element={<Career />} />
```

### 2.4 Update TypeScript types if needed
No new API types expected for this step.

### 2.5 Write/update tests
- AppHeader test: verify three nav links render with correct hrefs
- Career page: verify it renders without error
- Existing AppHeader tests: update for the new nav structure

### Files touched
- `frontend/src/components/AppHeader.tsx`
- `frontend/src/pages/Career.tsx` (new)
- `frontend/src/main.tsx` or `App.tsx`
- Relevant test files

---

## Step 3 — URL Ingestion 🔲

**Goal:** User can paste a job posting URL on the Evaluate page. The app calls Crawl4AI
(external service), extracts structured fields from the rendered page, and pre-fills as
many form fields as possible. User reviews, optionally runs an AI gap-fill, then proceeds
to evaluation.

### 3.1 Add `scrape_routes.py` to aistivus backend

New file: `scrape_routes.py` (matches existing `profile_routes.py` / `document_routes.py` pattern).

**Crawl4AI client function:**
- Reads `crawl4ai.base_url` from config
- POSTs to `{base_url}/crawl` via httpx (async)
- Request body:
  ```json
  {
    "urls": ["https://..."],
    "browser_config": {"type": "BrowserConfig", "params": {"headless": true}},
    "crawler_config": {"type": "CrawlerRunConfig", "params": {"cache_mode": "bypass"}}
  }
  ```
- 30-second timeout — prevents the backend hanging on a stalled Playwright render
- On success: returns `results[0]` (markdown + html fields)
- On failure / unreachable: raises handled exception, returns graceful error response

**Structured field extraction (against rendered HTML via BS4):**
- `results[0].markdown` → `jd_text`
- `results[0].html` → BS4 parse for JSON-LD (`<script type="application/ld+json">`)
  - `title`: JSON-LD `title`, fallback `<h1>`, fallback `<title>` tag
  - `company`: JSON-LD `hiringOrganization`, fallback `og:site_name`
  - `location`: JSON-LD `jobLocation`
  - `pay_band`: JSON-LD `baseSalary`
  - `remote_type`: JSON-LD or labeled text; null if not found (LLM fills this)
- `scrape_quality: partial` if `jd_text` word count < 100

**Routes:**

`POST /api/v1/scrape`
- Calls Crawl4AI client function
- Runs structured field extraction
- Returns `ScrapeResult`
- If Crawl4AI unreachable: return `{success: false, error: "Crawl4AI service unavailable"}`
- Rate limiting: 10/min

`POST /api/v1/scrape/fill-gaps`
- Accepts: `{jd_text, title, company, location, remote_type, pay_band}` (nulls included)
- Builds structured extraction prompt (inline for now — moved to `prompt_builder.py` in Step 4)
- Calls `llm_client.complete()` using the default configured model
- Logs LLM call to `llm_call_log` (`call_type = "extraction"`)
- Returns: same field shape with filled-in values
- If LLM parse fails: return what we have, surface error to client
- Rate limiting: 10/min

Register both routes in `main.py`.

### 3.2 Crawl4AI is an external service — no docker-compose changes required

Crawl4AI runs as a standalone container managed independently (same model as Ollama).
No new service is added to `docker-compose.yml`.

Optional: add a commented convenience block to `docker-compose.yml` for users who want
to manage Crawl4AI within the same compose stack.

Document Crawl4AI standalone setup in `README.md`.

### 3.3 Add `crawl4ai.base_url` to config.yaml

Add to `user_data/config.yaml`:
```yaml
crawl4ai:
  base_url: http://crawl:11235   # Docker network name; change to server address for dev
```

Update `templates/CONFIG_TEMPLATE.yaml` with the same key and both options as comments:
```yaml
crawl4ai:
  base_url: http://crawl:11235             # Docker network (container named 'crawl')
  # base_url: https://crawl4ai.yourdomain.com  # Traefik / remote server
```

### 3.4 Add frontend types

In `frontend/src/types/api.ts`, add:
```typescript
interface ScrapeResult {
  scrape_quality: 'full' | 'partial'
  apply_url: string
  title: string | null
  company: string | null
  location: string | null
  remote_type: 'Remote' | 'Hybrid' | 'On-site' | null
  pay_band: string | null
  jd_text: string
  error: string | null
}

interface FillGapsResult {
  title: string | null
  company: string | null
  location: string | null
  remote_type: 'Remote' | 'Hybrid' | 'On-site' | null
  pay_band: string | null
  error: string | null
}
```

### 3.5 Add frontend hooks

In `frontend/src/hooks/useEvaluate.ts` (or new file):
- `useScrapeMutation()` — POST `/api/v1/scrape`
- `useFillGapsMutation()` — POST `/api/v1/scrape/fill-gaps`

### 3.6 Update `Evaluate.tsx`

Add above the existing form fields:

**URL import row:**
- Text input: "Job Posting URL" placeholder `https://…`
- "Import from URL" button — triggers `useScrapeMutation`
- Loading state while scraping (disable form, show spinner with elapsed time)
- On success: pre-fill all returned non-null fields; do not overwrite fields the
  user has already manually entered
- On `scrape_quality: partial`: yellow warning banner —
  "Partial scrape — some fields may be incomplete. Review below."
- On Crawl4AI unavailable: inline error below the URL input —
  "Crawl4AI unavailable — enter fields manually";
  rest of the form remains fully usable

**"Fill gaps with AI" button:**
- Appears only after a scrape has run AND at least one field is null
- Triggers `useFillGapsMutation` with current field state
- Loading state (disable button, show elapsed time — may take 10–25s on local models)
- On success: pre-fill returned non-null fields
- On failure: inline error; fields unchanged

### 3.7 Write tests

**AIstivus backend (`tests/routes/`):**
- `POST /api/v1/scrape`: mock Crawl4AI HTTP call; verify `ScrapeResult` field mapping
- `POST /api/v1/scrape`: mock Crawl4AI returning short markdown; verify `scrape_quality: partial`
- `POST /api/v1/scrape`: Crawl4AI unreachable → verify graceful error response
- `POST /api/v1/scrape/fill-gaps`: mock `llm_client.complete()`; verify field normalization
  and `llm_call_log` write

**Frontend:**
- `Evaluate.tsx`: URL input renders; import button triggers mutation; partial banner
  appears on partial quality; fill-gaps button appears when fields are null;
  inline error shown when Crawl4AI unavailable

### Dev setup

Crawl4AI runs as a standalone container on a remote server. Set `crawl4ai.base_url`
in `user_data/config.yaml` to the server address before running. No third local process
required.

### Files touched
- `scrape_routes.py` (new)
- `main.py` — register scrape routes
- `requirements.txt` — confirm `beautifulsoup4` present; no new deps
- `user_data/config.yaml` — add `crawl4ai.base_url`
- `templates/CONFIG_TEMPLATE.yaml` — same
- `docker-compose.yml` — optional commented Crawl4AI block
- `frontend/src/types/api.ts` — new interfaces
- `frontend/src/hooks/` — new mutations
- `frontend/src/pages/Evaluate.tsx` — URL import UI
- `README.md` — Crawl4AI setup instructions
- `app_docs/DESIGN_p2.0.md` — Section 3 rewrite
- `tests/routes/` — new scrape route tests

---

## Step 4 — Prompt Editing 🔲 (STUB — design session required)

**Goal:** Users can view and customize AI prompts without touching source code.
Prompts are extracted from inline route handlers into a manageable, editable store.

**Prerequisites:** `prompt_builder.py` extraction must happen as part of this step.
Currently three route handlers in `main.py` embed 200–400-line prompt strings.
These must be functions in `prompt_builder.py` before any editing UI is built.

**Open design questions (resolve before workorder'ing this step):**
- Storage format: markdown files on disk vs. DB `prompts` table
- Editability boundary: which prompts are safe to expose vs. structural (parser-coupled)
- UI location: Settings page vs. Profile & Document Builder
- Versioning model

See `app_docs/DESIGN_p2.0.md` Section 5 for full open questions list.

---

## Step 5 — Pending 🔲

Items identified for Phase 2 but not yet designed or scheduled:

- **Memory** — persistent AI context for Job Search and Career workflows.
  See `app_docs/DESIGN_p2.0.md` Section 6.
- **Dashboard redesign** — main page update for three-workflow model.
  See `app_docs/DESIGN_p2.0.md` Section 7.
- **Career workflow** — full design for structured history, diary, story-to-document.
  See `app_docs/DESIGN_p2.0.md` Section 2.
- Additional Job Search features from `ignore/FEATURES.md` — to be scheduled after
  Steps 1–3 are complete.
