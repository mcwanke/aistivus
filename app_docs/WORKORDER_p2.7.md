# WORKORDER — Phase 2.7: Company Workflows & Crawl4ai Integration

## Overview

**Phase 2.7** introduces company-forward job discovery. Users add target companies ("orgs"), the system automatically crawls their career pages on a schedule, extracts roles, filters for matches, and scores them locally. Matched roles surface as "interesting" for the user to evaluate and optionally promote to the main Jobs workflow.

**Key principle:** Orgs/roles are a *separate namespace* from the existing Jobs/Companies model. New roles flow one-way into Jobs (via Promote); existing job data never back-migrates to the org model.

---

## Phase 2.7 Scope

### What's In
- ✅ Org management (CRUD, settings)
- ✅ Career page crawling (automatic + manual triggers)
- ✅ Role extraction (LLM-based, local fallback)
- ✅ Keyword matching (from jobsearch.md)
- ✅ Local Ollama scoring (free, automated)
- ✅ Role promotion to Jobs (with local eval data)
- ✅ Company research UI (stub: copy-paste prompt flow)
- ✅ Crawl history page (status tracking)
- ✅ APScheduler background jobs (staggered, auto-retry)

### What's Out (Deferred)
- ❌ Fully automated company research (Claude API, manual-trigger only)
- ❌ Fully automated external evaluation (button exists, manual-trigger only)
- ❌ Postgres migration (discussion-only for now)
- ❌ Advanced matching strategies (keyword matching MVP only)
- ❌ Role re-scrape on demand (button stub only)

---

## Architecture & Data Model

### Core Tables (New)

#### `orgs`
```sql
CREATE TABLE orgs (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  name                  TEXT NOT NULL,
  url                   TEXT NOT NULL,
  career_page_url       TEXT NOT NULL,
  crawl_frequency       INTEGER NOT NULL DEFAULT 3,  -- days
  crawl_offset_minutes  INTEGER NOT NULL,              -- 0–120 random
  last_crawl_at         TEXT,
  next_crawl_at         TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  modified_at           TEXT NOT NULL DEFAULT (datetime('now')),
  project_id            INTEGER NOT NULL
);
```

#### `org_crawls`
```sql
CREATE TABLE org_crawls (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id          INTEGER NOT NULL REFERENCES orgs(id),
  status          TEXT NOT NULL,  -- 'pending', 'running', 'success', 'error'
  started_at      TEXT NOT NULL,
  completed_at    TEXT,
  roles_found     INTEGER,
  roles_added     INTEGER,
  roles_closed    INTEGER,
  error_msg       TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_org_crawls_org_id ON org_crawls(org_id);
```

#### `org_roles`
```sql
CREATE TABLE org_roles (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id               INTEGER NOT NULL REFERENCES orgs(id),
  title                TEXT NOT NULL,
  description          TEXT,
  salary_range         TEXT,
  remote_type          TEXT,  -- 'remote', 'hybrid', 'on-site', 'unknown'
  first_seen_date      TEXT,
  last_seen_date       TEXT,
  scrape_date          TEXT NOT NULL,
  keywords             TEXT,  -- JSON array of extracted keywords
  
  -- Local scoring (Ollama)
  local_score_overall  REAL,
  local_score_fit      REAL,
  local_score_scope    REAL,
  local_score_culture  REAL,
  local_score_comp     REAL,
  
  -- Flags
  is_interesting       BOOLEAN DEFAULT 0,  -- 1 if matched AND score > 5.0 (or scoring failed)
  job_id               INTEGER REFERENCES jobs(id),  -- FK to promoted job (nullable)
  
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  modified_at          TEXT NOT NULL DEFAULT (datetime('now')),
  project_id           INTEGER NOT NULL
);
CREATE INDEX idx_org_roles_org_id ON org_roles(org_id);
CREATE INDEX idx_org_roles_is_interesting ON org_roles(is_interesting);
CREATE INDEX idx_org_roles_job_id ON org_roles(job_id);
```

### Schema Changes (Existing Tables)

#### `job_research` — Polymorphic Update
```sql
ALTER TABLE job_research ADD COLUMN org_id INTEGER REFERENCES orgs(id);

-- Now: job_id OR org_id can be set (not both, enforced in app layer)
-- Old jobs: FK to job_id (backward compat)
-- New jobs from orgs: link to org_id, share research across all roles from that org
-- Check constraint (optional, for DB enforcement):
-- CHECK((job_id IS NOT NULL AND org_id IS NULL) OR (job_id IS NULL AND org_id IS NOT NULL))
```

#### `jobs` — Optional Org FK
```sql
ALTER TABLE jobs ADD COLUMN org_id INTEGER REFERENCES orgs(id);
-- Set when job is promoted from org_role
```

---

## Implementation Phases

### Phase 1: Database Schema (1–2 hours)

**Files:** `database.py`

**Tasks:**
1. Add `orgs`, `org_crawls`, `org_roles` tables to `init_db()`
2. Alter `job_research` to make `job_id` nullable, add `org_id` FK
3. Alter `jobs` to add `org_id` FK (optional)
4. Add indices for query performance
5. No data migration (new tables only)

**Testing:** Schema loads without error; all tables exist on fresh DB.

---

### Phase 2: POC Extraction Hardening (4–6 hours, parallel with Phase 1)

**Files:** `poc_routes.py`, `CompanyPOCPage.tsx`

**Activities:**
1. **Timing instrumentation** — Add start/end timestamps to both extraction endpoints
2. **Real-world testing** — Test on 10+ actual job postings across different companies
3. **Document extraction strategy results:**
   - Career page listing: does clustering work, or does LLM fallback kick in?
   - Individual job: does LLM extraction work, or selector fallback?
4. **Measure crawl latency:**
   - Record median + p95 time per crawl
   - Set timeout = p95 + 30s buffer
5. **Edge cases** — Document:
   - Missing salary fields → return null
   - Remote status inference (text hints)
   - Description truncation (if needed)
   - Partial extraction failure handling
6. **Decide final extraction strategy:**
   - Career page: LLM (primary) + clustering (fallback)
   - Individual job: LLM (primary) + selectors (fallback)

**Output:** Timing data + extraction strategy guide (used in Phase 3).

**Testing:** Manual testing on real sites; document results.

---

### Phase 3: Crawl Routes & Core Logic (2–3 hours)

**Files:** `crawl_routes.py` (new), `database.py`

**Routes:**

```
POST /api/v1/orgs
  Input: { name, url, career_page_url, crawl_frequency }
  Output: { id, ... }

GET /api/v1/orgs
  Query params: search, sort, filter
  Output: [ { id, name, last_crawl_at, next_crawl_at, ... } ]

GET /api/v1/orgs/{org_id}
  Output: { id, name, url, career_page_url, crawl_frequency, ... }

POST /api/v1/orgs/{org_id}/crawl
  Trigger manual crawl (async)
  Output: { crawl_id, status: 'pending' }

GET /api/v1/orgs/{org_id}/crawls
  Crawl history for org
  Output: [ { id, status, started_at, roles_found, error_msg } ]

GET /api/v1/orgs/{org_id}/roles
  Get roles for org (paginated, filtered)
  Output: [ { id, title, description, local_score_overall, is_interesting } ]

GET /api/v1/orgs/{org_id}/roles/{role_id}
  Get single role details
  Output: { id, title, description, salary_range, remote_type, local_scores, ... }
```

**Core Function: `crawl_one_org(org_id)` — Sequential Pipeline**

```
1. Fetch org from DB
2. Create org_crawls record (status='running')
3. Fetch career page URL via crawl4ai
4. Extract job listings (title + URL per role)
   - Strategy: LLM (from Phase 2 decision)
   - Fallback: clustering
5. For each extracted job:
   a. Fetch individual job page via crawl4ai
   b. Extract structured fields (title, description, salary, remote)
      - Strategy: LLM (from Phase 2 decision)
      - Fallback: CSS selectors
   c. Store as org_role (all fields, local_scores = NULL, is_interesting = NULL)
6. Matching pass (Phase 5): for each org_role, run matching logic
   - If match found: set flag, proceed to scoring
   - If no match: set is_interesting=0, done
7. Scoring pass (Phase 6): for matched roles, run local scoring
   - Run Ollama eval, capture scores
   - If score > 5.0: set is_interesting=1
   - If scoring fails: set is_interesting=1 (fallback pass)
8. Update org_crawls (status='success', roles_found, roles_added)
9. Update org.last_crawl_at, org.next_crawl_at
```

**Error Handling:**
- Crawl timeout → set org_crawls.status='error', org_crawls.error_msg
- Extraction partial failure → store what we have, mark confidence in org_crawls
- Matching/scoring failure → log but don't block; role stored as-is

**Testing:**
- POST crawl trigger manually, verify org_crawls record created
- Monitor crawl progress in database
- Verify org_roles inserted correctly
- Check error handling (bad URL, timeout, etc.)

---

### Phase 4: APScheduler Setup (1–2 hours)

**Files:** `main.py`, `database.py`

**Tasks:**

1. **Initialize APScheduler** — On app startup:
   ```python
   from apscheduler.schedulers.background import BackgroundScheduler
   
   scheduler = BackgroundScheduler()
   scheduler.add_listener(scheduler_listener)  # for logging
   ```

2. **Load scheduled crawls from DB** — At startup:
   - Query all `orgs` from DB
   - For each org: calculate next run time
   - `next_run = org.next_crawl_at OR (now + crawl_offset_minutes + 2:00am)`
   - Add job to scheduler: `scheduler.add_job(crawl_one_org, args=[org_id], trigger='cron', ...)`

3. **Stagger scheduling** — Prevent thundering herd:
   - Use `crawl_offset_minutes` (0–120 random value, set at org creation)
   - Scheduled time = 2:00 AM + offset
   - Result: crawls spread over 2-hour window

4. **Auto-retry incomplete crawls on startup:**
   ```python
   def retry_incomplete_crawls():
       incomplete = db.query(
           "SELECT id, org_id FROM org_crawls 
            WHERE status IN ('pending', 'running') 
            AND started_at < datetime('now', '-10 minutes')"
       )
       for crawl in incomplete:
           scheduler.add_job(crawl_one_org, args=[crawl['org_id']])
   ```
   - Timeout threshold: 10 minutes (from Phase 2 data)
   - Only retry once per startup (prevent loops)

5. **Shutdown gracefully** — On app exit:
   - `scheduler.shutdown(wait=True)`

**Testing:**
- Manually add an org, verify scheduled crawl appears in scheduler
- Restart app, verify incomplete crawls auto-retry
- Test staggered scheduling (multiple orgs, verify spread)

---

### Phase 5: Matching Logic (1–2 hours)

**Files:** `database.py`, `crawl_routes.py`

**Tasks:**

1. **Parse target roles from jobsearch.md:**
   - Read `user_data/jobsearch.md` at app startup (or on-demand)
   - Extract Section 5:
     - "Titles I'm targeting" → list of titles
     - "Titles I'm open to" → list of titles
     - "Titles I'm NOT interested in" → list of titles (exclude these)
   - Store in app state (cache in memory)

2. **Matching prompt for Ollama:**
   ```
   You are a job matching assistant.
   
   Target roles the user is interested in:
   - Engineering Manager
   - Staff Engineer
   - Director of Engineering
   
   Titles the user wants to avoid:
   - Staff IC
   - Individual Contributor
   
   Evaluate this job title and decide if it matches the user's target roles.
   Return only "MATCH" or "NO_MATCH".
   
   Job title: {role_title}
   ```

3. **Integrate into crawl pipeline:**
   - In `crawl_one_org()`, after extracting roles
   - For each role: call Ollama matching prompt
   - If "MATCH": set match flag, proceed to scoring
   - If "NO_MATCH": set is_interesting=0, skip scoring

4. **Error handling:**
   - If matching fails (timeout, parse error): log warning, assume match (conservative)

**Testing:**
- Test prompt on 5–10 real role titles
- Verify matching logic filters correctly
- Check that non-matches are skipped in scoring phase

---

### Phase 6: Local Scoring Logic (1–2 hours)

**Files:** `database.py`, `crawl_routes.py`, `evaluator.py` (adapt existing eval logic)

**Tasks:**

1. **Scoring prompt for Ollama** (adapt from existing job eval prompt):
   ```
   You are a job fit evaluator.
   
   User context: [jobsearch.md Section 1–4]
   
   Evaluate this role:
   Title: {role_title}
   Description: {role_description}
   Salary: {salary_range}
   Remote: {remote_type}
   
   Score on a 0–10 scale (only integers):
   - Overall fit (0–10): 
   - Role fit (0–10): 
   - Scope/level fit (0–10): 
   - Culture alignment (0–10): 
   - Compensation fit (0–10): 
   
   Return only JSON: { "score_overall": X, "score_fit": X, ... }
   ```

2. **Integrate into crawl pipeline:**
   - In `crawl_one_org()`, after matching pass
   - For each matched role: call Ollama scoring prompt
   - Parse JSON response → update org_role local_score_* fields
   - If score_overall > 5.0: set is_interesting=1
   - If score_overall ≤ 5.0: set is_interesting=0
   - If scoring fails: set is_interesting=1 (fallback pass)

3. **Error handling:**
   - Timeout/parse failure: log, set is_interesting=1, store NULL for scores
   - Don't block crawl on scoring failures

**Testing:**
- Test prompt on 5–10 real roles
- Verify >5.0 threshold works correctly
- Verify fallback (failed scoring → is_interesting=1)

---

### Phase 7: Navigation Updates (0.5 hours)

**Files:** `frontend/src/App.tsx` (or router config)

**Tasks:**
1. Update top nav: add "Company Search" link between "Career" and "Job Search"
2. Link to `/org/` route (created in Phase 9)

**Testing:** Nav appears, links work.

---

### Phase 8: CreateOrg Page (1–2 hours)

**Files:** `frontend/src/pages/CreateOrgPage.tsx`, `frontend/src/types/orgs.ts`

**UI:**
```
[Header] Create Organization

Org Name:           [textbox - required]
Organization URL:   [textbox - required]
Career Page URL:    [textbox - required]
Crawl Frequency:    [dropdown: 1, 2, 3*, 5, 7, 14 days] (* = default)

[Create & View] [Create & Add Another]

---
(validation errors shown inline)
```

**Behavior:**
- Validate: all fields required, URLs must be valid format
- On submit: POST /api/v1/orgs → get org_id
- Button 1: navigate to OrgDetails page for new org
- Button 2: clear form, stay on page, ready for next org

**Testing:**
- Create org with valid data → navigates to OrgDetails
- Create org → "Create & Add Another" → form clears
- Missing field → validation error shown
- Invalid URL → validation error shown

---

### Phase 9: OrgsList Page (2–3 hours)

**Files:** `frontend/src/pages/OrgsListPage.tsx`, `frontend/src/hooks/useOrgs.ts`

**UI:**
```
[Header] Organizations

[Search Box] [Sort: ▼ Name] [Filter: ▼ All]

Org Name          | Last Crawl   | Open Jobs | Matched Jobs | Active Jobs | Next Crawl
Vetcove           | 2h ago       | 12        | 3            | 1           | in 2d
Acme Corp         | 5d ago       | 8         | 1            | 0           | in 1h
[...paginated...]

[+ Add Organization] (button)
```

**Columns:**
- Org Name: clickable → OrgDetails
- Last Crawl: timestamp (human-readable)
- Open Jobs: count of roles found in current crawl
- Matched Jobs: count where is_interesting=1
- Active Jobs: count where job_id IS NOT NULL
- Next Crawl: relative time until next scheduled crawl

**Features:**
- **Search:** filter by org name
- **Sort:** by name, last crawl date, matched count (ascending/descending)
- **Filter:** all orgs / only matched / only with active jobs
- **Pagination:** 20 per page
- **Row click:** navigate to OrgDetails

**React Query Hook:**
```typescript
useOrgs(search?, sort?, filter?, page?)
  // Fetches from GET /api/v1/orgs with params
  // Returns: { data, isLoading, error }
```

**Testing:**
- List orgs, verify data displayed correctly
- Search/sort/filter work
- Pagination works
- Row click navigates to details

---

### Phase 10: OrgDetails Page (2–3 hours)

**Files:** `frontend/src/pages/OrgDetailsPage.tsx`, `frontend/src/hooks/useOrgRoles.ts`

**UI — Tabbed Layout:**

#### Tab 1: Org Info
```
Organization: Vetcove
URL: https://vetcove.com
Career Page: https://vetcove.com/careers
Crawl Frequency: Every 3 days
Next Crawl: in 2 days at 2:47 AM
Last Crawl: 2h ago (success)

[Crawl Now] [Generate Company Research] [View Crawl History]

Research Summary: [if exists]
(displays company research JSON parsed from job_research table)
```

#### Tab 2: Interesting Roles
```
Matched roles (is_interesting=1), sorted by score_overall desc

Title                        | Score | Remote | Salary
Senior Engineering Manager   | 8.5   | hybrid | $200k–$240k
Staff Engineer               | 7.2   | remote | $180k–$220k
[...paginated...]

Row click → RoleDetails
```

#### Tab 3: All Roles
```
All roles from this org (including unmatched), paginated

Title                        | Score | Remote | Matched
Senior Engineering Manager   | 8.5   | hybrid | ✓
Junior Developer             | 3.1   | on-site| ✗
[...paginated...]

Row click → RoleDetails
```

**Buttons & Flows:**
- **Crawl Now:** POST /api/v1/orgs/{id}/crawl → show "Crawl in progress..." → auto-refresh on completion
- **Generate Company Research:** button → modal with copy-paste prompt flow (Phase 14)
- **View Crawl History:** link → navigate to CrawlRuns page for this org

**React Query Hooks:**
```typescript
useOrg(org_id)          // GET /api/v1/orgs/{id}
useOrgRoles(org_id)     // GET /api/v1/orgs/{id}/roles (with pagination)
useOrgResearch(org_id)  // fetch from job_research where org_id
```

**Testing:**
- Tab switching works
- Roles display with correct data
- Crawl Now triggers crawl
- Page auto-refreshes after crawl completes
- Company research displays if it exists

---

### Phase 11: RoleDetails Page (1–2 hours)

**Files:** `frontend/src/pages/RoleDetailsPage.tsx`

**UI:**
```
[Back to Org]

Title: Senior Engineering Manager
Organization: Vetcove
Description: [first 500 chars or full]

Salary: $200k–$240k
Remote: Hybrid
First Seen: 3d ago
Last Seen: 2h ago (current crawl)

Local Scores (Ollama):
  Overall Fit:    8.5 / 10
  Role Fit:       8.0 / 10
  Scope:          9.0 / 10
  Culture:        7.5 / 10
  Compensation:   8.5 / 10

[Promote to Jobs] [Re-scrape] (button - stub)

---
(if already promoted: "This role is active in Jobs as: [link to job]")
```

**Buttons:**
- **Promote to Jobs:** POST /api/v1/orgs/{org_id}/roles/{role_id}/promote → creates job, navigates to job details
- **Re-scrape:** button stub (no-op for MVP)

**React Query Hook:**
```typescript
useOrgRole(org_id, role_id)  // GET /api/v1/orgs/{id}/roles/{id}
```

**Testing:**
- Role data displays correctly
- Local scores shown
- Promote button works (creates job)
- Re-scrape button exists (stub)

---

### Phase 12: CrawlRuns History Page (1–2 hours)

**Files:** `frontend/src/pages/CrawlRunsPage.tsx`, `frontend/src/hooks/useCrawlRuns.ts`

**UI:**
```
[Header] Crawl History

[Filter by Org: ▼ All Organizations]

Started            | Org         | Status  | Roles Found | Added | Closed | Errors
2h ago             | Vetcove     | success | 12          | 3     | 2      | —
1d ago             | Acme Corp   | success | 8           | 1     | 0      | —
2d ago             | TechCorp    | error   | —           | —     | —      | Timeout after 30s
[...paginated...]
```

**Columns:**
- Started: timestamp (human-readable)
- Org: org name (clickable → OrgDetails)
- Status: success / error / running
- Roles Found: count
- Added: count of roles added to DB
- Closed: count of roles no longer found (deactivated)
- Errors: error message (if any)

**Features:**
- **Filter by Org:** dropdown
- **Pagination:** 20 per page
- **Auto-refresh** every 5s if any crawls are running

**React Query Hook:**
```typescript
useCrawlRuns(org_id?, status?)  // GET /api/v1/orgs/{id}/crawls
```

**Testing:**
- Crawl history displays
- Filter by org works
- Pagination works
- Auto-refresh works for running crawls

---

### Phase 13: TypeScript Types & React Query Hooks (1 hour)

**Files:** `frontend/src/types/orgs.ts`, `frontend/src/hooks/useOrgs.ts`, etc.

**Types:**
```typescript
export interface Org {
  id: number;
  name: string;
  url: string;
  career_page_url: string;
  crawl_frequency: number;
  crawl_offset_minutes: number;
  last_crawl_at: string | null;
  next_crawl_at: string | null;
  created_at: string;
}

export interface OrgRole {
  id: number;
  org_id: number;
  title: string;
  description: string | null;
  salary_range: string | null;
  remote_type: string;
  local_score_overall: number | null;
  local_score_fit: number | null;
  // ... other scores
  is_interesting: boolean;
  job_id: number | null;
  created_at: string;
}

export interface OrgCrawl {
  id: number;
  org_id: number;
  status: 'pending' | 'running' | 'success' | 'error';
  started_at: string;
  completed_at: string | null;
  roles_found: number | null;
  roles_added: number | null;
  roles_closed: number | null;
  error_msg: string | null;
  created_at: string;
}
```

**Hooks:**
- `useOrgs(search?, sort?, filter?, page?)` — List orgs with pagination
- `useOrg(org_id)` — Get single org details
- `useOrgRoles(org_id, page?)` — Get roles for org
- `useOrgRole(org_id, role_id)` — Get single role
- `useCrawlRuns(org_id?, status?)` — Get crawl history
- `createOrg(data)` — Mutation
- `triggerCrawl(org_id)` — Mutation
- `promoteRole(org_id, role_id)` — Mutation

**Testing:** Types compile, hooks fetch data correctly.

---

### Phase 14: Company Research UI (1–2 hours)

**Files:** `frontend/src/components/CompanyResearchModal.tsx` (new), `crawl_routes.py`

**Route (stub backend):**
```
POST /api/v1/orgs/{org_id}/research
  Input: {} (or accept org_id in route)
  Output: { 
    prompt: "...",  // generated prompt for user
    status: "ready"
  }

POST /api/v1/orgs/{org_id}/research/submit
  Input: { raw_json: "..." }  // user pastes Claude output
  Output: { success: true, research_id: ... }
```

**UI — Modal on OrgDetails:**
```
[Modal: Generate Company Research]

This org doesn't have company research yet.

[Show Prompt]
(expands to show the research prompt)

Copy the prompt above and paste it into Claude API.
Then paste the JSON response back here:

[Textarea]

[Submit] [Cancel]

---
On success: modal closes, research appears on Org Info tab
```

**Behavior:**
- **Show Prompt:** Click "Generate Company Research" on Org Info tab
- Modal displays: generates research prompt (Claude API configured)
- User copies prompt
- User runs in Claude (external)
- User pastes JSON response into textarea
- Click Submit: POST /api/v1/orgs/{id}/research/submit → stores in job_research (org_id path)
- Modal closes, research displays on page

**Backend (stub):**
- Generate prompt with org name + context
- Parse user-provided JSON
- Validate against expected schema
- Store in `job_research` (org_id set, job_id NULL)

**Testing:**
- Modal appears
- Prompt generates
- JSON parsing works
- Research displays on Org Info tab

---

### Phase 15: Promote Flow (2–3 hours)

**Files:** `crawl_routes.py`, `database.py`, `frontend/src/pages/RoleDetailsPage.tsx`

**Route:**
```
POST /api/v1/orgs/{org_id}/roles/{role_id}/promote
  Input: {}
  Output: { job_id: ... }
```

**Backend Logic:**
1. Fetch org_role from DB
2. Create new job record:
   - title ← org_role.title
   - company_name ← org.name
   - description ← org_role.description
   - salary_range ← org_role.salary_range
   - remote_type ← org_role.remote_type
   - org_id ← org.id (FK for backref)
3. Set org_role.job_id = new_job.id
4. Create evaluation records (if local scores exist):
   - For each non-null local_score_*: create evaluations entry with llm_model_id = local_ollama, scores set
   - Recalculate job.agg_score_overall
5. Link to company research (if it exists):
   - If job_research exists for this org, user can access it from job's Research tab
6. Return { job_id }

**Frontend Logic:**
- User clicks "Promote to Jobs" on RoleDetails page
- POST /api/v1/orgs/{org_id}/roles/{role_id}/promote
- On success: navigate to job details page (jobs/{job_id})
- User then: external eval → resume generation → apply workflow

**Testing:**
- Promote creates job with correct data
- Evaluation records created from local scores
- Agg scores recalculated
- Job navigates correctly
- Job details page shows local eval data

---

### Phase 16: Manual Testing & Integration (2–3 hours)

**End-to-End Flow:**
1. Create org (CreateOrg page)
2. Navigate to OrgDetails
3. Click "Crawl Now" → watch crawl run
4. After crawl: switch to "Interesting Roles" tab → see matched + scored roles
5. Click role → RoleDetails
6. Click "Promote to Jobs" → job created, navigate to job details
7. Verify job has local eval data
8. Optional: generate company research, paste JSON, verify it displays

**Test Cases:**
- Create org, crawl immediately (manual trigger)
- Verify matching logic filters correctly
- Verify scoring assigns scores, is_interesting flag set
- Verify promote creates job + evaluations
- Verify navigation works throughout
- Verify error handling (timeout, bad URL, etc.)
- Test APScheduler: restart app, verify incomplete crawls retry

**Browsers:** Chrome, Firefox (smoke test)

---

## Data Flow Diagram

```
1. Create Org
   └─> Org created, next_crawl_at set based on crawl_offset_minutes

2. Manual Trigger or Scheduled Crawl
   └─> APScheduler fires crawl_one_org(org_id)
       └─> org_crawls record created (status='running')

3. Fetch Career Page
   └─> crawl4ai fetches org.career_page_url
   └─> Extract job listings (title + URL per role)
       └─> LLM extraction (primary) or clustering (fallback)

4. Extract Individual Job Data
   └─> For each extracted job URL:
       └─> crawl4ai fetches job page
       └─> Extract structured data (title, description, salary, remote)
           └─> LLM extraction (primary) or CSS selectors (fallback)
       └─> Store as org_role (initial: all fields, scores=NULL)

5. Matching Pass
   └─> For each org_role:
       └─> Run Ollama matching prompt (target roles from jobsearch.md)
       └─> If "MATCH": proceed to scoring; else set is_interesting=0

6. Scoring Pass
   └─> For each matched role:
       └─> Run Ollama eval prompt
       └─> Capture local_score_* fields
       └─> If score_overall > 5.0: set is_interesting=1
       └─> If scoring fails: set is_interesting=1 (fallback)

7. Update Org Crawl
   └─> org_crawls.status='success'
   └─> org.last_crawl_at, org.next_crawl_at updated
   └─> If errors: org_crawls.error_msg set

8. User Reviews Roles
   └─> OrgDetails page: "Interesting Roles" tab (is_interesting=1)
   └─> User clicks role → RoleDetails page
   └─> User sees local scores, decides to promote

9. Promote to Jobs
   └─> "Promote" button → new job created in jobs table
   └─> org_role.job_id set
   └─> Evaluation records created from local_score_* fields
   └─> Job now in Jobs workflow: external eval → resume → apply

10. Optional: Company Research
    └─> "Generate Research" button → modal
    └─> User copies prompt, runs in Claude, pastes JSON
    └─> Research stored in job_research (org_id path)
    └─> Accessible from job's Research tab
```

---

## Known Unknowns & Defer-to-Implementation

1. **Crawl timeout value** — Measure during Phase 2 (POC hardening); set to p95 + 30s buffer
2. **Incomplete crawl retry threshold** — Measure during Phase 2; likely 10 minutes
3. **OrgsList sort/filter details** — Flesh out during Phase 9 UI build
4. **RoleDetails UI layout** — Finalize during Phase 11
5. **Company research JSON schema validation** — Implement during Phase 14
6. **Error toast styling** — Apply during frontend build
7. **Exact pagination sizes** — Adjust based on performance during testing
8. **Re-scrape button behavior** — Stub for now; implement in future phase

---

## Testing Strategy

### Unit Tests
- Matching prompt logic (5–10 test cases)
- Scoring threshold logic (is_interesting flag)
- Role deduplication (same title, later crawl)
- Job promotion (data mapping, evaluation record creation)

### Integration Tests
- Full crawl pipeline (crawl → extract → match → score)
- Org CRUD + crawl trigger
- Promote flow (org_role → job → evaluations)

### Manual Testing
- Real-world org crawling (Vetcove, 2–3 others)
- UI navigation across all pages
- Form validation (CreateOrg)
- Error handling (timeout, bad URL, extraction failure)

### Performance Testing
- Crawl time (single org, 10+ roles)
- APScheduler load (10+ orgs, staggered crawls)
- OrgsList query performance (100+ orgs)

---

## Effort Estimate

| Phase | Hours | Notes |
|-------|-------|-------|
| 1. DB Schema | 1–2 | Straightforward DDL |
| 2. POC Hardening | 4–6 | Critical; measure timing |
| 3. Crawl Routes | 2–3 | Pipeline implementation |
| 4. APScheduler | 1–2 | Setup + auto-retry |
| 5. Matching | 1–2 | Prompt + logic |
| 6. Scoring | 1–2 | Prompt + logic |
| 7. Navigation | 0.5 | Quick |
| 8. CreateOrg | 1–2 | Form + validation |
| 9. OrgsList | 2–3 | Listing + React Query |
| 10. OrgDetails | 2–3 | Tabs + logic |
| 11. RoleDetails | 1–2 | Data display |
| 12. CrawlRuns | 1–2 | History page |
| 13. Types & Hooks | 1 | TypeScript setup |
| 14. Company Research | 1–2 | Stub UI + prompt |
| 15. Promote | 2–3 | Flow + integration |
| 16. Testing | 2–3 | Manual E2E |
| **Total** | **~25–35 hours** | With parallelization (DB + Extract): ~20–30 |

---

## Success Criteria

- ✅ Create org, crawl career page, extract 5+ roles
- ✅ Matching filters roles (test on known target roles)
- ✅ Scoring assigns local_score_* fields, flags interesting roles
- ✅ Promote flow creates job + evaluation records
- ✅ APScheduler runs scheduled crawls (verify in logs)
- ✅ Incomplete crawls auto-retry on restart
- ✅ All UI pages render and navigate correctly
- ✅ Company research stub works (prompt generated, JSON accepted)
- ✅ No regressions in existing Jobs/Applications workflows

---

## Notes

- **Extraction strategy choice** (LLM vs clustering/selectors) will be validated in Phase 2 with real data. Build backend with both fallbacks.
- **Timing data** from Phase 2 is critical for setting realistic crawl timeout + retry logic.
- **Navigation & UX polish** (entry points to CrawlRuns page, visual hierarchy) can be iterated during implementation.
- **Company research** is stub-only for MVP; full automation deferred to future phase.
- **Promote flow** is one-way: org → job. Existing jobs never backport to orgs model.

