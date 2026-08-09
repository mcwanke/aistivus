# POC_PLAN_p2.6.a — Company Query & Job Extraction

## Overview

**Goal:** Validate core mechanics of the company-forward job search model without committing to full Phase 2.6 architecture.

**What we're testing:**
1. Can crawl4ai effectively extract job listings (titles + links) from a company career page?
2. Can we extract structured job data (title, description, salary, remote status) from individual job posting URLs?
3. Do heuristic extraction approaches work, or do we need LLM-based extraction?
4. What are the edge cases and failure modes?

**What we're NOT doing yet:**
- Company research prompt generation (Stage 2 deferred)
- Database persistence of any POC data
- Integration into main Jobs workflow
- Public deployment (localhost-only)

**Success criteria:**
- Can input company career page URL and get a list of open roles
- Can input job URL and extract title, description, salary range, remote status
- Form state persists across page reloads
- Error handling surfaces issues clearly (toasts/popups)
- Easy to modify extraction logic and re-test

---

## Architecture

### Frontend
**Route:** `/poc-company` (direct URL access only, not linked in nav)
**Component:** `frontend/src/pages/CompanyPOCPage.tsx`

**Layout:** Single scrollable page with form state save/load

```
[HEADER] Company Query & Job Extraction POC
[Save State] [Load State] (buttons)

--- SECTION 1: COMPANY QUERY ---
Company Name: [textbox]
Company URL: [textbox]
Careers Page URL: [textbox]
[Query Open Roles] (button)

[Output area]
Job Title | Job URL
Engineering Manager | https://...
Senior Software Engineer | https://...
(list of {title, url} pairs)

--- SECTION 2: JOB EXTRACTION ---
Job URL: [textbox]
[Pull Job Data] (button)

[Output area]
Title: Engineering Manager
Description: [first 500 chars or full]
Salary Range: $150k–$200k
Remote Status: Hybrid
(structured fields)
```

### Backend
**File:** `poc_routes.py` (new)
**Base:** `/api/v1/poc/`

#### Endpoint 1: Query Open Roles
```
POST /api/v1/poc/query-company
Input JSON:
{
  "company_name": "Vetcove",
  "company_url": "https://vetcove.com",
  "careers_page_url": "https://vetcove.com/careers"
}

Output JSON:
{
  "success": true,
  "jobs": [
    {"title": "Senior Engineering Manager", "url": "https://..."},
    {"title": "Senior Software Engineer", "url": "https://..."}
  ],
  "error": null,
  "extraction_method": "clustering"
}

On error:
{
  "success": false,
  "jobs": [],
  "error": "Crawl timeout after 30s",
  "extraction_method": null
}
```

**Implementation notes:**
- Import `crawl4ai.AsyncWebCrawler` (Python SDK, not HTTP)
- Call `crawler.arun(careers_page_url)` to fetch and crawl
- Use **clustering extraction strategy** to identify repeated job listing patterns
- crawl4ai returns `CrawlResult` with extracted structured data
- Parse job listings from the result (titles + URLs from repeated patterns)
- Timeout: 30s per crawl
- Return both success and error cases (never silently fail)

#### Endpoint 2: Extract Job Data
```
POST /api/v1/poc/extract-job
Input JSON:
{
  "job_url": "https://vetcove.com/careers/senior-eng-manager"
}

Output JSON:
{
  "success": true,
  "job": {
    "title": "Senior Engineering Manager",
    "description": "Join Vetcove and help...",
    "salary_range": "$150,000–$200,000",
    "remote_status": "remote" | "hybrid" | "on-site" | "unknown"
  },
  "error": null,
  "extraction_method": "llm" | "structured",
  "confidence": "high" | "medium" | "low"
}

On error:
{
  "success": false,
  "job": {...with partial data if any},
  "error": "Failed to extract job data",
  "extraction_method": null,
  "confidence": "low"
}
```

**Implementation notes:**
- Import `crawl4ai.AsyncWebCrawler` (Python SDK, not HTTP)
- Call `crawler.arun(job_url, extraction_strategy=...)` with LLM-based or structured strategy
- **Primary approach:** Use LLM-based extraction (more reliable across varied page structures)
  - Provide a simple extraction prompt to crawl4ai: "Extract job title, description, salary range, and remote status"
  - crawl4ai handles HTML→markdown→LLM parsing
- **Fallback approach:** Use structured extraction with CSS selectors if LLM extraction fails or is slow
- Capture extraction confidence (high/medium/low) from crawl4ai results
- Include `extraction_method` so we can track what worked
- Return partial data if some fields are extracted, even if others fail
- Timeout: 30s per crawl

---

## Extraction Strategy (Using crawl4ai Python SDK)

### Section 1: Career Page Job Listing Extraction

**Approach:** Use crawl4ai's **clustering extraction strategy**

crawl4ai's clustering automatically identifies and groups repeated patterns in a page—perfect for job listings where each job has the same structure (title, link, maybe description).

**How it works:**
1. Call `crawler.arun(careers_url, extraction_strategy=ClusteringStrategy())`
2. crawl4ai returns structured data with identified job blocks
3. Parse the clustered results: extract `title` and `url` from each cluster
4. Return array of `{title, url}` pairs

**Advantages over manual heuristics:**
- Handles different HTML structures automatically
- Robust to layout changes
- No need to write CSS selectors or regex patterns
- Works for simple tables and complex card-based layouts

**Fallback if clustering doesn't work:**
- Use structured extraction with CSS/XPath selectors
- Manual patterns: look for `<a>` tags with `/job`, `/career`, `/position` in href

**Output:** Array of `{title, url}` where both are non-empty strings

**Test sites to validate against (start with these):**
- Vetcove (from the prompt example)
- 1–2 other companies you apply to regularly
- Document extraction method used for each (clustering, selector, fallback)

---

### Section 2: Job Posting Data Extraction

**Approach:** Use crawl4ai's **LLM-based extraction strategy** (primary) with structured fallback

**Primary: LLM-based extraction**
1. Call `crawler.arun(job_url, extraction_strategy=LLMStrategy(schema={...}))`
2. Provide extraction schema:
   ```
   {
     "title": "Job title",
     "description": "Job description (first 500 chars)",
     "salary_range": "Salary range if present, else null",
     "remote_status": "remote|hybrid|on-site|unknown"
   }
   ```
3. crawl4ai converts HTML→markdown and uses LLM (or local model) to extract structured fields
4. Returns parsed JSON matching the schema

**Advantages:**
- Works across diverse page structures
- No brittle CSS selectors or regex
- Handles natural language variations ("work from home" → `remote`, "3 days in office" → `hybrid`)
- More accurate salary range extraction
- Markdown conversion ensures cleaner input to extraction logic

**Fallback: Structured extraction with CSS/XPath**
- If LLM extraction is slow or fails, use CSS selectors
- Look for common class names: `.salary`, `.compensation`, `.job-title`, `.description`, etc.
- Fall back to first `<h1>` for title, first text block for description

**Confidence scoring:**
- `high`: All 4 fields extracted via LLM strategy
- `medium`: 2–3 fields extracted, or mixed LLM + selector extraction
- `low`: <2 fields extracted or extraction method uncertain

**Output:** Structured object with all fields (null if not found)

**Test sites:**
- Start with 2–3 companies you know well
- Test both simple job pages and complex ones (dynamic content, structured data)
- Document extraction method used for each (LLM, selector, fallback)

---

## Frontend Implementation

### File: `frontend/src/pages/CompanyPOCPage.tsx`

**State management:**
- Form inputs: `company_name`, `company_url`, `careers_page_url`, `job_url`, `research_prompt` (even if not used yet)
- API outputs: `company_query_result`, `job_extraction_result`
- Loading/error states per section

**Save/Load logic:**
- **Save:** Click "Save State" → serialize all form inputs to JSON → write to `app_data/poc_state.json` (via new backend endpoint)
- **Load:** On page mount, fetch `app_data/poc_state.json` → hydrate form fields
- **Button behavior:** Both buttons always available, no confirm dialogs

**New backend endpoint for form state:**
```
GET /api/v1/poc/state
Returns: JSON from app_data/poc_state.json (or empty object if not found)

POST /api/v1/poc/state
Input: { company_name, company_url, careers_page_url, job_url, ... }
Action: Write to app_data/poc_state.json
Returns: { success: true }
```

**Error handling:**
- API errors: Toast popup with error message (e.g., "Crawl timeout after 30s")
- Parsing errors: Toast popup (e.g., "Failed to extract salary range")
- Both dismiss automatically after 5s
- All errors are user-facing; don't swallow them

### Types: `frontend/src/types/poc.ts`

```typescript
export interface JobListing {
  title: string;
  url: string;
}

export interface QueryCompanyResponse {
  success: boolean;
  jobs: JobListing[];
  error: string | null;
  raw_html_length: number;
}

export interface ExtractedJob {
  title: string;
  description: string;
  salary_range: string | null;
  remote_status: "remote" | "hybrid" | "on-site" | "unknown";
}

export interface ExtractJobResponse {
  success: boolean;
  job: Partial<ExtractedJob>;
  error: string | null;
  extraction_method: string | null;
  confidence: "high" | "medium" | "low";
}

export interface POCState {
  company_name: string;
  company_url: string;
  careers_page_url: string;
  job_url: string;
  research_prompt: string;
}
```

---

## Backend Implementation

### File: `poc_routes.py`

**Dependencies:**
- `crawl4ai` — Python SDK (`pip install crawl4ai`)
- `json` for parsing/dumping state
- Standard library modules

**Key functions:**

```python
async def query_company(company_name: str, company_url: str, careers_page_url: str):
    """Crawl career page, extract job listings via clustering."""
    # 1. Import AsyncWebCrawler from crawl4ai
    # 2. Call crawler.arun(careers_page_url, extraction_strategy=ClusteringStrategy())
    # 3. Parse clustered results for {title, url} pairs
    # 4. Return {success, jobs: [{title, url}], error, extraction_method}

async def extract_job(job_url: str):
    """Crawl job posting, extract structured fields via LLM strategy."""
    # 1. Import AsyncWebCrawler from crawl4ai
    # 2. Define extraction schema (title, description, salary_range, remote_status)
    # 3. Call crawler.arun(job_url, extraction_strategy=LLMStrategy(schema=...))
    # 4. Parse LLM extraction result or fall back to structured selectors
    # 5. Score confidence based on completeness
    # 6. Return {success, job: {...}, error, extraction_method, confidence}

def _parse_clustering_result(crawl_result) -> List[Dict[str, str]]:
    """Extract {title, url} pairs from clustering result."""
    # Parse crawl_result.structured_data or extracted_content
    # Return [{title, url}, ...]

def _parse_llm_extraction(crawl_result) -> Dict:
    """Extract structured job data from LLM extraction result."""
    # Parse crawl_result with LLM strategy output
    # Return {title, description, salary_range, remote_status}

async def get_poc_state() -> Dict:
    """Load form state from app_data/poc_state.json."""

async def save_poc_state(state: Dict) -> Dict:
    """Save form state to app_data/poc_state.json."""
```

**crawl4ai Python SDK integration:**
- Import: `from crawl4ai import AsyncWebCrawler, ClusteringStrategy, LLMStrategy`
- Initialize crawler: `crawler = AsyncWebCrawler()`
- Call signature: `await crawler.arun(url, extraction_strategy=Strategy())`
- Returns: `CrawlResult` object with structured data, markdown, metadata
- Timeout: 30s (configurable)
- Error handling: Catch crawl exceptions, network errors, timeout errors, and surface to user
- Session management: Create new crawler per request (or reuse if performance is critical)

**File I/O:**
- State file: `app_data/poc_state.json`
- Create directory if missing
- Atomic writes (write to temp, then rename)
- Handle missing file gracefully (return empty state)

---

## Testing Strategy

### Manual testing (no test suite for POC)
1. **Test Section 1 (Career Page Parsing):**
   - Input: Vetcove careers page URL
   - Expected: List of open roles (at least 3–5 visible jobs) extracted via clustering
   - Note: Does clustering strategy correctly identify job patterns?
   - Document extraction method used (clustering, selector, fallback)
   - Edge case: What if page uses JavaScript rendering? (crawl4ai handles via browser)
   - Edge case: Career page with paginated jobs (clustering may only catch visible page)

2. **Test Section 2 (Job Extraction):**
   - Input: A job URL from Section 1 output
   - Expected: Title, description (partial), salary (if visible), remote status via LLM extraction
   - Document extraction method used (LLM, selector, fallback)
   - Edge case: Pages with no salary listed → should return `null` for salary_range
   - Edge case: Salary in different formats ($X-Y, "competitive", ranges in prose)
   - Edge case: Remote status implied (e.g., "San Francisco office" → on-site)

3. **Form State Persistence:**
   - Fill all fields → Save → Reload page → Check fields are hydrated
   - Clear fields → Save → Reload page → Check fields are cleared

4. **Error cases:**
   - Invalid URL → Toast error
   - Timeout (wait 35s) → Toast error + graceful degradation
   - Career page with no jobs listed → Show empty list (not an error)
   - LLM extraction fails → Fallback to selectors or return partial data

### Known limitations
- JavaScript-rendered job sites may have limited crawl depth (crawl4ai handles JS but with constraints)
- Anti-scraping measures may block access (capture in error message)
- LLM-based extraction quality depends on schema clarity and page structure
- No retry logic in POC (fail once and show error)
- Clustering strategy works best on pages with repeated job patterns (may fail on truly custom layouts)

---

## Decision Points & Next Steps

### If clustering extraction works well for job listings (>80% accuracy on 3+ test sites):
→ Keep clustering approach, ship to production, integrate with real job workflow
→ Consider batch crawling (use `crawler.arun_many()`) for multiple companies

### If clustering extraction fails or misses jobs:
→ Debug: Check if page uses custom job card structure or nested patterns
→ Fallback: Use CSS/XPath selector strategy instead
→ Investigate: Document the page structure and why clustering didn't work (for future reference)

### If LLM-based extraction works well (>80% accuracy):
→ Use as primary approach, keep selector fallback for edge cases
→ Consider caching extraction schema across similar sites

### If LLM-based extraction is slow or unreliable:
→ Switch to structured extraction with CSS/XPath selectors
→ Or try hybrid: LLM for description + selectors for metadata fields

### Once Section 1 & 2 are solid:
→ Re-engage Stage 2 (research navigator): POST `/api/v1/poc/research-navigator` to ask Claude for research URLs
→ Implement Stage 3 (crawl research sources): Use crawl4ai to fetch recommended URLs
→ Implement Stage 4 (local LLM synthesis): Feed aggregated crawl4ai markdown output to local LLM for company research

### If crawl4ai performance is acceptable:
→ Consider migrating to full Phase 2.6 company-forward model
→ Plan Stage 2 company research navigator
→ Design cron-like scheduling for background company research updates

---

## Files to Create/Modify

### New files:
- `poc_routes.py` — backend routes
- `frontend/src/pages/CompanyPOCPage.tsx` — frontend page
- `frontend/src/types/poc.ts` — TypeScript types
- `app_data/poc_state.json` — form state (created on first save)

### Modified files:
- `main.py` — register `poc_routes` blueprint
- `frontend/src/App.tsx` or router config — add `/poc-company` route

### No changes needed:
- Database schema
- Existing routes
- Existing components (except router)

---

## Effort Estimate

- Backend: 2–3 hours (crawl4ai SDK integration, extraction strategy setup, error handling)
  - Much simpler than manual heuristics—leveraging crawl4ai's built-in strategies
- Frontend: 2–3 hours (form, save/load, API calls, error toasts)
- Testing & iteration: 2–3 hours (trying different sites, evaluating extraction quality, fallback logic)
- **Total: 6–9 hours** (simpler than original estimate due to crawl4ai SDK leverage)

---

## Notes

- Keep the POC scoped: no database, no main app integration, no fancy UI
- Prioritize getting *working* extraction over perfect extraction
- Document what worked/failed for each test site — this informs next iteration
- If crawl4ai calls become slow, profile and add caching (cache by URL hash)
- Use `print()` or logging to debug extraction logic locally before pushing

