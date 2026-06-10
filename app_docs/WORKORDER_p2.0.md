# AIstivus — Phase 2.0 Workorder
> Status: In progress — Steps 1–3 ready to execute; Steps 4–5 pending design
> Last updated: 2026-06-09
> Design doc: app_docs/DESIGN_p2.0.md

---

## Pre-Work

Before starting any step:
- Check `memory/MEMORY.md` for the current test baseline
- Run tests only if no baseline exists
- Each step should end with a passing test run and an updated baseline in memory

---

## Step 1 — CI/CD Setup 🔲

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

### Files touched
- `requirements.txt` (if ruff not present)
- `.github/workflows/ci.yml` (new)

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

**Goal:** User can paste a job posting URL on the Evaluate page. The app scrapes the
page and pre-fills as many fields as possible. User reviews, optionally runs an AI
gap-fill, then proceeds to evaluation.

### 3.1 Build the `scraper/` service

New directory: `scraper/`

**`scraper/requirements.txt`:**
```
fastapi
uvicorn[standard]
httpx
trafilatura
beautifulsoup4
lxml
```

**`scraper/main.py`:** FastAPI app with one endpoint:

```
POST /scrape
Body: { "url": "https://..." }

Response:
{
  "scrape_quality": "full" | "partial",
  "apply_url": "https://...",
  "title":      string | null,
  "company":    string | null,
  "location":   string | null,
  "remote_type": "Remote" | "Hybrid" | "On-site" | null,
  "pay_band":   string | null,
  "jd_text":    string,
  "error":      null | string
}
```

Extraction strategy:
- `jd_text`: trafilatura main-body extraction
- `apply_url`: echo the request URL
- `title`: `<title>` tag, `<h1>`, JSON-LD `title`
- `company`: `og:site_name`, JSON-LD `hiringOrganization`, `<title>` parse
- `location`: JSON-LD `jobLocation`, labeled text
- `pay_band`: JSON-LD `baseSalary`, labeled text
- `remote_type`: JSON-LD or labeled text; null if not found (LLM fills this)
- `scrape_quality: partial` if `jd_text` word count < 100

**`scraper/Dockerfile`:**
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
```

### 3.2 Add scraper to `docker-compose.yml`

```yaml
scraper:
  build: ./scraper
  ports:
    - "127.0.0.1:8001:8001"
  restart: unless-stopped
```

No volume mounts needed — the scraper is stateless.

### 3.3 Add `scraper.base_url` to config.yaml

Add to `user_data/config.yaml`:
```yaml
scraper:
  base_url: http://scraper:8001   # Docker; change to http://localhost:8001 for local dev
```

Update `templates/CONFIG_TEMPLATE.yaml` with the same key + both URL options as comments.

### 3.4 Add backend scrape route to `main.py`

New route: `POST /api/v1/scrape`

- Reads `scraper.base_url` from config
- POSTs `{url}` to `{base_url}/scrape` via httpx (async)
- Returns the scraper response to the client
- If scraper is unreachable: return `{success: false, error: "Scraper service unavailable"}`
- Apply rate limiting (suggest 10/min — same as evaluate route)
- No DB writes in this route

New route: `POST /api/v1/scrape/fill-gaps`

- Accepts: `{jd_text, title, company, location, remote_type, pay_band}` (nulls included)
- Builds a structured extraction prompt (in `prompt_builder.py` — see Step 4 prerequisite note)
- Calls `llm_client.complete()` using the default configured model
- Returns: same field shape with filled-in values
- Log the LLM call to `llm_call_log` (call_type = `"extraction"`)
- If LLM parse fails: return what we have, surface error to client

**Note:** `prompt_builder.py` does not exist yet. For Step 3, the extraction prompt
can live inline in this route temporarily. Step 4 will move it to `prompt_builder.py`.
Document this as known tech debt when implementing.

### 3.5 Add frontend types

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

### 3.6 Add frontend hooks

In `frontend/src/hooks/useEvaluate.ts` (or new file):
- `useScrapeMutation()` — POST `/api/v1/scrape`
- `useFillGapsMutation()` — POST `/api/v1/scrape/fill-gaps`

### 3.7 Update `Evaluate.tsx`

Add above the existing form fields:

**URL import row:**
- Text input: "Job Posting URL" placeholder `https://…`
- "Import from URL" button — triggers `useScrapeMutation`
- Loading state while scraping (disable form, show spinner)
- On success: pre-fill all returned non-null fields; do not overwrite fields the
  user has already manually entered
- On `scrape_quality: partial`: yellow warning banner —
  "Partial scrape — some fields may be incomplete. Review below."
- On scraper unavailable: inline error message below the URL input;
  rest of the form remains fully usable

**"Fill gaps with AI" button:**
- Appears only after a scrape has run AND at least one field is null
- Triggers `useFillGapsMutation` with current field state
- Loading state (disable button, show elapsed time — this may take 10–25s on local models)
- On success: pre-fill returned non-null fields
- On failure: inline error; fields unchanged

### 3.8 Update `.dockerignore`
Confirm `scraper/` is not inadvertently excluded from the build context.
The scraper has its own `Dockerfile`; the main `.dockerignore` should not interfere.

### 3.9 Write tests

**Scraper service (`scraper/tests/`):**
- Unit tests for each extraction function (mock httpx responses)
- Test `scrape_quality: partial` threshold
- Test graceful handling of unreachable URLs and malformed HTML

**AIstivus backend (`tests/routes/`):**
- `POST /api/v1/scrape`: mock the scraper HTTP call; verify response passthrough
- `POST /api/v1/scrape`: scraper unavailable → verify graceful error response
- `POST /api/v1/scrape/fill-gaps`: mock LLM client; verify field normalization

**Frontend:**
- `Evaluate.tsx`: URL input renders; import button triggers mutation; partial banner
  appears on partial quality; fill-gaps button appears when fields are null

### Dev mode setup (document in README or COMMANDS.md)
```
Terminal 1: python main.py
Terminal 2: cd frontend && npm run dev
Terminal 3: cd scraper && uvicorn main:app --port 8001 --reload
```
Set `scraper.base_url: http://localhost:8001` in `user_data/config.yaml` for local dev.

### Files touched
- `scraper/` (new directory: main.py, requirements.txt, Dockerfile)
- `scraper/tests/` (new)
- `docker-compose.yml`
- `user_data/config.yaml`
- `templates/CONFIG_TEMPLATE.yaml`
- `main.py`
- `frontend/src/types/api.ts`
- `frontend/src/hooks/useEvaluate.ts`
- `frontend/src/pages/Evaluate.tsx`
- `ignore/COMMANDS.md` or `README.md` (dev setup instructions)

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
