# AIstivus — Phase 1.5 Work Order: Job Workspace + Navigation Overhaul

## How to Use This File

Read `CLAUDE.md` and `PROJECT_SPEC.md` fully before doing anything.
This file defines what to build and in what order for Phase 1.5.

**Session startup prompt:**
> "Read CLAUDE.md and PROJECT_SPEC.md and app_docs/WORKORDER-phase1.5.md fully before doing
> anything. Today's task only: [paste the single item block below]
> Tell me what files you plan to touch and what changes you plan to make.
> Do not write any code until I approve your plan."

**Rules:**
- Complete ONE priority at a time
- After each priority, stop and wait for explicit approval
- Mark completed items `[x]` with a one-line note
- Never touch files not listed in the item's scope
- Never refactor code outside the current item's scope

---

## Phase 1.5 Goal

Two scopes in one phase:

**Scope A — Navigation overhaul:**
Replace the sidebar (`<Layout>` wrapper) on all non-Dashboard pages with a simplified top
header (`AppHeader` variant) showing `← Home · AIstivus · [Page Name]`. This was always
Phase 1.5's core mission. The split-pane pattern on Jobs and Applications is retired; both
become standalone list pages. A design foundation priority extracts visual patterns from the
original HTML pages so every component is built to the correct visual spec from the start.

**Scope B — Unified Job Workspace:**
The current Jobs + ApplicationDetail experience is fragmented across four separate views
(JobDetail embedded in Jobs, ApplicationSummary embedded in Applications,
ApplicationDetailPage as a standalone). Phase 1.5 replaces this with a single unified job
workspace at `/jobs/:jobId?tab=...` with five tabs: JOB DETAILS, APPLICATION, RESUME/COVER,
INTERVIEW, APPLICATION LOG. ApplicationDetailPage.tsx and ApplicationSummary.tsx are retired.
A new `application_questions` table supports capturing application Q&A. The `application_audit`
table is expanded to job scope so "Job Created" and "Job Description" events are real DB
records rather than frontend synthetics. The APPLICATION LOG tab presents a unified timeline
of all activity across a job's full lifecycle.

### What's New in Phase 1.5
- Simplified `← Home` AppHeader on all non-Dashboard pages
- Sidebar (`<Layout>`) removed from all non-Dashboard pages
- Jobs.tsx and Applications.tsx become standalone list pages (no split-pane)
- Unified job workspace at `/jobs/:jobId?tab=...` (5 tabs, 2-column layout)
- Sub-header component: score, status, company, title, location, remote type
- `application_questions` table + APPLICATION QUESTIONS section in workspace
- `application_audit.job_id` column; "Job Created" / "Job Description" become real audit records
- APPLICATION LOG tab: unified timeline of all 7 data sources with color-coded type badges
- ADD EVENT feature with 7 new `system_types` event type values
- "Generate External Eval + Tailored Resume" button (renamed from "Generate Prompt")
- Import External Eval button moved into EVALUATIONS right column
- Shared frontend utils extracted: `fmtScore`, `fmtDate`, `STATUS_COLORS`, `STATUSES`
- RESUME/COVER and INTERVIEW tabs stubbed with intentional placeholder cards
- ApplicationDetailPage.tsx and ApplicationSummary.tsx retired

### What's NOT in Phase 1.5
- Application questions search UI (table designed to support it; UI is future work)
- INTERVIEW tab content (stubbed only; full design TBD)
- RESUME/COVER tab content (stubbed only; Phase 1.6)
- Typst / document management (Phase 1.6)
- Docker (Phase 1.7)
- Pagination on the APPLICATION LOG endpoint (future)
- Deactivation flow for jobs (future)

---

## Design Decisions

### Navigation model
All non-Dashboard pages use a simplified AppHeader variant with `← Home` link, wordmark,
and page name. The Settings link is shown on all pages. The tagline is omitted in this variant.
Dashboard keeps its existing form (no back link, tagline visible).

### Routing architecture
`/jobs/:jobId` becomes a full-page standalone workspace (not embedded in a split-pane).
Tab state is carried in the URL query param: `/jobs/42?tab=application`. Default tab when
no param is present: `job-details`. The workspace never appears inside Jobs.tsx.

`ApplicationDetailPage.tsx` and `ApplicationSummary.tsx` are fully retired. Their content
moves into workspace tabs. The route `/application-detail/:applicationId` is removed.
The split-pane `/applications/:applicationId` route is removed.

Applications list rows navigate to `/jobs/:jobId?tab=application`. The workspace loads with
APPLICATION tab active and DETAILS pre-selected.

### Query loading chain
The workspace loads job data first (`useJobDetail(jobId)`), which now returns `application_id`
explicitly. The application data query (`useApplicationDetail(applicationId)`) is gated on
`application_id` being available (`enabled: !!applicationId`). The sub-header status field
shows `—` until application data resolves. This is acceptable; do not block the whole workspace
on application load.

### Sub-header layout (2 rows, sticky)
```
Row 1:  [score big]   STATUS (label)          [Job Title]         [Remote Type]
Row 2:  [/ 10 muted]  [value: Applied]  Co.   📍 [Location]
```
Score: large accent-colored number with muted `/ 10` underneath (same treatment as HTML pages).
If `agg_score_overall` is NULL, show `—` / `/ 10`. Status badge uses `STATUS_COLORS` map.
Sub-header is sticky below AppHeader. Appears only on workspace pages — not on list pages,
Evaluate, Settings, etc.

### Action button pattern (left column)
Only one action button may be active at a time. Active state: `bg-surface2 text-accent border-l-2
border-accent`. Inactive: `text-muted hover:text-text`. Clicking an active button does nothing
(stays selected — no toggle-off). Default on tab load:
- JOB DETAILS tab → EVALUATIONS
- APPLICATION tab → DETAILS

### Form + rows pattern (right column)
All action sections that accept user input follow the same pattern:
- Add form is always visible at the top (never hidden behind an "Add" button)
- Existing entries render as expandable rows below the form
- Clicking a row header expands/collapses it (chevron indicator)
- Zero state: a single sentence below the form when no records exist yet
- This pattern applies to: COMPANY INFO, ADD EVENT, ADD APPLICATION NOTE, APPLICATION QUESTIONS

### application_audit expansion
`application_audit` gains a nullable `job_id` column. When `create_job()` runs, it inserts
two audit records sequentially (using the auto-created application_id and the new job_id):
1. `"Job created — {company_name} — {title}"`
2. `"Job description attached"` (only if `description_merged` is non-empty)

Sequential inserts get sequential auto-increment IDs. APPLICATION LOG sorts by timestamp DESC
with `id ASC` as tiebreaker. "Job Created" always appears before "Job Description" at identical
timestamps. The frontend `ApplicationDetailPage.tsx` synthetic items (`job-added`, `job-desc`)
are removed — these are now real DB records.

### APPLICATION LOG unified timeline
`GET /api/v1/jobs/:id/activity-log` returns all entries merged and sorted. Each entry has:
`entry_type`, `timestamp`, `activity_type`, `source`, `text`, `url`, `raw_id`,
`can_delete`, `can_edit_timestamp`.

Entry type → badge color mapping:
| entry_type | badge class |
|---|---|
| `evaluation` | `bg-green/15 text-green` |
| `llm_call` | `bg-accent/15 text-accent` |
| `application_log` | `bg-blue/15 text-blue` |
| `audit` | `bg-surface2 text-muted` |
| `company_log` | `bg-purple/15 text-purple` |
| `job_posting` | `bg-surface2 text-dim` |
| `application_question` | `bg-blue/10 text-blue` |

### application_questions schema
```sql
application_questions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id  INTEGER NOT NULL,   -- FK to applications.id
    question        TEXT NOT NULL,
    response        TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (application_id) REFERENCES applications(id)
)
```
Table designed to support full-text search in a future phase (question + response fields are
the search targets). Search UI is NOT in scope for Phase 1.5.

### ADD EVENT system_types (new seeds)
Seven new `application_log` type values added to `system_types`:
`recruiter_outreach`, `phone_screen`, `onsite_interview`, `offer_received`,
`rejection_received`, `withdrawal`, `application_communication`

These are selectable in the ADD EVENT right column. They are stored in `application_logs`
(Option A — no new table). This extends the existing log pattern without schema overhead.

### Jobs.tsx + Applications.tsx after change
Both become standalone list pages. The right-pane split is removed entirely. All existing
list columns are preserved unchanged:
- Jobs: company, title/location/remote, 5 score cells (Overall/Role/Scope/Culture/Comp)
- Applications: company, title/status, apply date/location

### Shared utils extraction
Since JobDetail.tsx, ApplicationDetailPage.tsx, and ApplicationSummary.tsx all duplicate
`fmtScore`, `fmtDate`, `STATUS_COLORS`, `STATUSES`, and `StatusBadge`, extract these into:
- `frontend/src/utils/formatting.ts` — `fmtScore`, `fmtDate`
- `frontend/src/utils/status.ts` — `STATUS_COLORS`, `STATUSES`, `StatusBadge` component

This is not a refactor of working code — it is right-sizing new files that replace the old ones.

### DB wipe
Phase 1.5 introduces two breaking schema changes (`application_questions` table,
`application_audit.job_id` column). Per project policy, the database is wiped and rebuilt.
User manually deletes `data/jobs.db` as part of the upgrade.

### RESUME/COVER and INTERVIEW stubs
Both tabs use the 2-column layout. The right column contains a placeholder card:
- **RESUME/COVER:** "Upload and manage your resume and cover letter documents.
  Connect to Typst for PDF generation. Coming in Phase 1.6."
- **INTERVIEW:** "Track interview stages, schedule, prep notes, and feedback from each round.
  Coming soon."
Left column: a muted label "Nothing to configure yet."

---

## Priority 1 — Schema + database.py

- [x] **1. Schema additions, audit expansion, create_job() updates** — application_questions table added; application_audit.job_id nullable column added; 7 new application_log seeds; upsert_job() inserts Job created/Job description audit records; get_activity_log() added; application_questions CRUD added; schema version bumped to 1.5

  **Files:** `database.py`

  DB wipe required after this change. Do not write migration code.

  ---

  ### Part A — New `application_questions` table

  In `init_db()`, add after `application_documents`:
  ```sql
  application_questions (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      application_id  INTEGER NOT NULL,
      question        TEXT NOT NULL,
      response        TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (application_id) REFERENCES applications(id)
  )
  ```

  ---

  ### Part B — Expand `application_audit` with `job_id`

  In `init_db()`, update `application_audit` definition:
  ```sql
  application_audit (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      application_id  INTEGER NOT NULL,
      job_id          INTEGER,            -- nullable; added Phase 1.5 for job-scope events
      timestamp       TEXT NOT NULL DEFAULT (datetime('now')),
      event           TEXT NOT NULL
  )
  ```
  `job_id` is nullable for backward compatibility. New audit inserts from `create_job()` will
  set both `application_id` and `job_id`.

  ---

  ### Part C — New `system_types` seeds

  Add to `init_db()` seed block (all `type_name = 'application_log'`):
  ```python
  ('application_log', 'recruiter_outreach'),
  ('application_log', 'phone_screen'),
  ('application_log', 'onsite_interview'),
  ('application_log', 'offer_received'),
  ('application_log', 'rejection_received'),
  ('application_log', 'withdrawal'),
  ('application_log', 'application_communication'),
  ```

  ---

  ### Part D — Update `create_job()`

  After the existing job INSERT and auto-created application INSERT, add sequential audit inserts:
  ```python
  conn.execute(
      "INSERT INTO application_audit (application_id, job_id, event) VALUES (?, ?, ?)",
      (application_id, job_id, f"Job created — {company_name} — {title}")
  )
  if description_merged:
      conn.execute(
          "INSERT INTO application_audit (application_id, job_id, event) VALUES (?, ?, ?)",
          (application_id, job_id, "Job description attached")
      )
  ```
  Sequential inserts guarantee deterministic ordering by auto-increment `id`. These replace
  the frontend synthetic items permanently.

  ---

  ### Part E — Update `get_job_by_id()` to return `application_id`

  Update the query to JOIN `applications` and return `application_id`:
  ```sql
  SELECT j.*, a.id as application_id
  FROM jobs j
  LEFT JOIN applications a ON a.job_id = j.id AND a.application_status != 'not-started'
  -- if no non-not-started application exists yet, fall back:
  -- always return the auto-created application id
  WHERE j.id = ?
  ```

  Actually use the simpler form since every active job has exactly one auto-created application:
  ```sql
  SELECT j.*, a.id as application_id
  FROM jobs j
  LEFT JOIN applications a ON a.job_id = j.id
  WHERE j.id = ?
  ORDER BY a.id ASC
  LIMIT 1
  ```
  Returns `application_id` as part of the row. If multiple applications exist in future, this
  returns the earliest (the auto-created one).

  ---

  ### Part F — Add `application_questions` CRUD functions

  ```python
  def get_application_questions(application_id: int) -> list[sqlite3.Row]:
      ...SELECT * FROM application_questions WHERE application_id = ? ORDER BY created_at DESC...

  def create_application_question(application_id: int, question: str, response: str | None) -> int:
      ...INSERT INTO application_questions...returns new id...

  def update_application_question(question_id: int, question: str | None, response: str | None) -> None:
      ...UPDATE application_questions SET ... WHERE id = ?...

  def delete_application_question(question_id: int) -> None:
      ...DELETE FROM application_questions WHERE id = ?...
  ```

  ---

  ### Part G — Add `get_activity_log(job_id)` function

  Returns merged, timestamp-sorted list of all activity for a job. Unions from:
  1. `evaluations` — joined with `llm_models` for model name
  2. `llm_call_log` — where `job_id = ?` (prompt entries)
  3. `application_logs` — via job's application_id
  4. `application_audit` — where `job_id = ?` OR `application_id` matches job's application
  5. `job_company_log` — where `job_id = ?`
  6. `job_postings` — where `job_id = ?`
  7. `application_questions` — via job's application_id

  Each source contributes: `entry_type` (string constant), `timestamp`, `activity_type`,
  `source`, `text`, `url`, `raw_id`, `can_delete` (0/1), `can_edit_timestamp` (0/1).

  Return as a Python list of dicts, sorted by `timestamp DESC`, then `id ASC` as tiebreaker
  (ensures "Job Created" always precedes "Job Description" at identical timestamps).

  **Do NOT touch any other database functions.**

---

## Priority 2 — Backend routes

- [x] **2. application_questions CRUD routes; activity log route; job detail application_id** — GET/POST/PATCH/DELETE /api/v1/applications/{id}/questions; GET /api/v1/jobs/{id}/activity-log; job detail application_id already present via get_job() JOIN

  **Files:** `main.py`

  ---

  ### Part A — application_questions routes

  ```
  GET    /api/v1/applications/{application_id}/questions
  POST   /api/v1/applications/{application_id}/questions
  PATCH  /api/v1/applications/{application_id}/questions/{question_id}
  DELETE /api/v1/applications/{application_id}/questions/{question_id}
  ```

  - `GET`: returns list from `database.get_application_questions(application_id)`
  - `POST` body: `{ question: str, response: str | None }`; returns new record
  - `PATCH` body: `{ question: str | None, response: str | None }`; 404 if question_id not found
  - `DELETE`: 404 if question_id not found; returns `{ deleted: true }`
  - All routes: 404 if application_id not found
  - Rate limit: same as other application routes

  ---

  ### Part B — Activity log route

  ```
  GET /api/v1/jobs/{job_id}/activity-log
  ```

  - Returns `{ entries: [...] }` from `database.get_activity_log(job_id)`
  - 404 if job not found
  - No pagination in Phase 1.5
  - Rate limit: same as other job routes

  Each entry shape:
  ```json
  {
    "entry_type": "evaluation",
    "timestamp": "2026-01-15T10:30:00",
    "activity_type": "EVALUATION",
    "source": "llama3.2 — Core Fit",
    "text": "Score: 8.5/10 ...",
    "url": null,
    "raw_id": 42,
    "can_delete": false,
    "can_edit_timestamp": false
  }
  ```

  ---

  ### Part C — Update route list comment

  Update the route list comment at the top of `main.py` to include the four new
  `application_questions` routes and the activity log route.

  **Do NOT modify any other route.**

---

## Priority 3 — TypeScript interfaces + hooks

- [x] **3. New interfaces, hooks, shared utils** — Job.application_id + ApplicationAuditEntry.job_id added; ApplicationQuestion, ActivityEntryType, ActivityLogEntry, ActivityLogResponse interfaces added; useApplicationQuestions hook (4 exports); useActivityLog added to useJobs.ts; activity-log invalidation wired in useActivateJob + useAddCompanyLog; formatting.ts + status.ts utils created

  **Files:** `frontend/src/types/api.ts`, `frontend/src/hooks/useApplicationQuestions.ts` (new),
  `frontend/src/hooks/useJobs.ts` (updated), `frontend/src/utils/formatting.ts` (new),
  `frontend/src/utils/status.ts` (new)

  ---

  ### Part A — New and updated interfaces in `api.ts`

  Add `application_id` to `Job` interface (now returned by job detail endpoint):
  ```typescript
  application_id: number | null
  ```

  New `ApplicationQuestion` interface:
  ```typescript
  export interface ApplicationQuestion {
    id: number
    application_id: number
    question: string
    response: string | null
    created_at: string
  }
  ```

  New `ActivityLogEntry` interface:
  ```typescript
  export type ActivityEntryType =
    | 'evaluation'
    | 'llm_call'
    | 'application_log'
    | 'audit'
    | 'company_log'
    | 'job_posting'
    | 'application_question'

  export interface ActivityLogEntry {
    entry_type: ActivityEntryType
    timestamp: string
    activity_type: string
    source: string
    text: string | null
    url: string | null
    raw_id: number | null
    can_delete: boolean
    can_edit_timestamp: boolean
  }

  export interface ActivityLogResponse {
    entries: ActivityLogEntry[]
  }
  ```

  ---

  ### Part B — `useApplicationQuestions` hook (new file)

  ```typescript
  export function useApplicationQuestions(applicationId: number) { ... }

  export function useCreateApplicationQuestion() { ... }
  // mutationFn: POST /api/v1/applications/{id}/questions
  // onSuccess: invalidate ['application-questions', applicationId]

  export function useUpdateApplicationQuestion() { ... }
  // mutationFn: PATCH /api/v1/applications/{id}/questions/{qid}

  export function useDeleteApplicationQuestion() { ... }
  // mutationFn: DELETE /api/v1/applications/{id}/questions/{qid}
  ```

  ---

  ### Part C — `useActivityLog` hook (add to `useJobs.ts`)

  ```typescript
  export function useActivityLog(jobId: number) {
    return useQuery({
      queryKey: ['activity-log', jobId],
      queryFn: () =>
        fetch(`/api/v1/jobs/${jobId}/activity-log`)
          .then((r) => { if (!r.ok) throw new Error('Failed'); return r.json() as Promise<ActivityLogResponse> }),
    })
  }
  ```

  Invalidate `['activity-log', jobId]` in `useActivateJob.onSuccess`, `useAddCompanyLog.onSuccess`,
  `useAddLog.onSuccess`, `useCreateApplicationQuestion.onSuccess`.

  ---

  ### Part D — Shared utils

  `frontend/src/utils/formatting.ts`:
  ```typescript
  export function fmtScore(val: number | null | undefined): string { ... }
  export function fmtDate(iso: string | null | undefined): string { ... }
  export function fmtDateTime(iso: string | null | undefined): string { ... }
  ```

  `frontend/src/utils/status.ts`:
  ```typescript
  export const STATUSES: ApplicationStatus[] = [
    'draft', 'applied', 'screening', 'interview', 'offer', 'rejected', 'ghosted', 'withdrawn',
  ]
  export const STATUS_COLORS: Record<ApplicationStatus, string> = { ... }
  export function StatusBadge({ status }: { status: ApplicationStatus }): React.JSX.Element { ... }
  ```

  **Do NOT modify any other file. Do not delete old duplicate code yet** — that happens when each
  consuming file is rewritten in later priorities.

---

## Priority 4 — Design Foundation

- [x] **4. Extract visual patterns from `pages/` HTML; document for use in P5–P17** — application_detail.html + jobs.html reviewed; all patterns in workorder confirmed correct; noted: section labels use text-dim in HTML but workorder specifies text-muted (follow workorder); page-mode header uses px-8 py-[18px]; score display uses text-4xl in workspace sub-header vs 1.6rem in list rows (intentional per spec)

  **Files:** Read-only reference: `pages/application_detail.html`, `pages/jobs.html`,
  `pages/settings.html`, `pages/evaluate.html`. No code is written in this priority.

  This priority has no code output. Its output is a clear list of specific Tailwind class
  patterns that all subsequent priorities must use when building components. The developer
  should work through each HTML file and confirm or update the patterns below.

  ---

  ### Patterns to establish and apply from P5 onwards

  **Top header (all pages):**
  - Sticky, `border-b border-surface2`, `px-8 py-[18px]`, `flex items-baseline gap-4`
  - Back link: `text-xs font-mono text-dim hover:text-muted transition-colors`
  - Wordmark: `font-serif text-accent text-2xl tracking-tight`
  - Page name: `text-sm text-text`
  - Right slot (Settings link): `ml-auto text-xs font-mono text-muted hover:text-accent`

  **Section headers (uppercase mono labels):**
  - `text-[10px] font-mono text-muted uppercase tracking-widest`

  **Collapsible section rows:**
  - Row header: `w-full flex items-center justify-between py-2 text-left group cursor-pointer`
  - Row title: `text-xs font-mono text-muted group-hover:text-text transition-colors uppercase tracking-widest`
  - Arrow indicator: `text-xs text-muted`
  - Expanded content: `pb-3 border-t border-surface2 pt-2`

  **Form fields:**
  - Label: `text-[10px] font-mono text-muted uppercase tracking-widest block`
  - Input/select/textarea: `mt-1 w-full bg-surface2 rounded px-3 py-2 text-text text-sm
    focus:outline-none focus:ring-1 focus:ring-accent`
  - Textarea: add `resize-y` and appropriate `h-*` class

  **Buttons:**
  - Primary: `px-4 py-2 text-sm bg-accent text-bg rounded hover:bg-accent/90 transition-colors`
  - Secondary: `px-3 py-1.5 text-xs font-mono text-muted border border-surface2 rounded
    hover:text-text hover:border-accent/40 transition-colors`
  - Destructive confirm: `text-xs font-mono border border-red text-red rounded px-1.5 py-0.5`

  **Score display (sub-header):**
  - Big number: `font-serif text-4xl text-accent leading-none`
  - Denominator: `font-mono text-xs text-muted`
  - Wrap in a flex-col container, items-start

  **Surface cards:**
  - `bg-surface border border-surface2 rounded-xl p-5`

  **HR divider:**
  - `border-surface2`

  Read the HTML files to confirm these patterns are correct and adjust before building P5.
  If any pattern in the HTML differs from what's in the Tailwind config or existing React
  components, flag it and resolve before proceeding to P5.

---

## Priority 5 — AppHeader variant

- [x] **5. Add `pageName` prop to `AppHeader.tsx`; ← Home variant** — optional pageName prop added; page-mode renders ← Home link + wordmark + pageName + Settings (ml-auto) with px-8 py-[18px] sticky header; Dashboard mode unchanged

  **Files:** `frontend/src/components/AppHeader.tsx`

  Read the current file fully before making any changes.

  ---

  ### Part A — Prop addition

  Add optional `pageName` prop:
  ```typescript
  interface AppHeaderProps {
    pageName?: string
  }
  ```

  ---

  ### Part B — Conditional rendering

  When `pageName` is provided, render the page-mode layout:
  ```
  [← Home link]  [AIstivus wordmark]  [pageName text]     [Settings link → right]
  ```

  When `pageName` is absent, render the existing Dashboard layout unchanged.

  Apply the header styles from the Design Foundation (Priority 4):
  - Back link: `← Home` — links to `/`; styled per P4 back-link pattern
  - Wordmark: links to `/`; same style as today
  - Page name: `text-sm text-text` — not a link
  - Settings link: `ml-auto` pushed right; same style as today's Settings link
  - No tagline in page mode

  ---

  ### Part C — Dashboard form unchanged

  When `pageName` is absent (Dashboard), the existing render is identical to today.
  No regressions to Dashboard.tsx.

---

## Priority 6 — Sidebar removal + AppHeader rollout (non-workspace pages)

- [x] **6. Remove `<Layout>` from 4 pages; apply AppHeader with pageName** — Evaluate, Settings, LLMUsage, JobSearchProfile extracted from Layout; each wrapped in `flex flex-col h-screen` with `<AppHeader pageName="...">` at top; inner content div changed from `h-full` to `flex-1`; test fixes for Settings/LLMUsage duplicate-text queries

  **Files:** `frontend/src/pages/Evaluate.tsx`, `frontend/src/pages/Settings.tsx`,
  `frontend/src/pages/LLMUsage.tsx`, `frontend/src/pages/JobSearchProfile.tsx`,
  `frontend/src/main.tsx` (if Layout wraps at route level — read first to confirm)

  For each page:
  1. Remove `<Layout>` wrapper (or remove Layout from route in main.tsx — wherever it lives)
  2. Add `<AppHeader pageName="[Name]" />` at the top of the page component
  3. Adjust top padding/margin of page content since the sidebar header is gone

  Page names:
  - Evaluate.tsx → `"Evaluate"`
  - Settings.tsx → `"Settings"`
  - LLMUsage.tsx → `"LLM Usage"`
  - JobSearchProfile.tsx → `"JS Profile"`

  Verify each page renders correctly after the Layout removal. The page content should fill
  the full viewport width (no sidebar column).

---

## Priority 7 — Jobs.tsx → standalone list

- [x] **7. Remove split-pane from Jobs.tsx; add AppHeader; rows navigate to workspace** — split-pane removed; `JobDetail` import dropped; `selected` prop removed from `JobRow`; row onClick navigates to `/jobs/${job.id}`; `<AppHeader pageName="Jobs" />` added; `useParams` removed

  **Files:** `frontend/src/pages/Jobs.tsx`

  Read the current file fully before making changes.

  ---

  ### Part A — Remove split-pane

  Remove the two-column flex layout. Remove the right panel div and the `<JobDetail>` import
  and render. Remove the `jobIdParam` / `selectedJobId` URL param read and `handleSelect` toggle
  logic.

  ---

  ### Part B — Navigation on row click

  `JobRow` onClick: `navigate('/jobs/${job.id}')` — always navigates, no toggle behavior.
  Remove the `selected` prop and selected state styling from `JobRow`.

  ---

  ### Part C — Apply AppHeader + layout

  Add `<AppHeader pageName="Jobs" />` at the top.
  Page becomes a full-width list with the header at top. List occupies the full width.
  Keep the count subtitle (`{jobs.length} jobs`).

  ---

  ### Part D — Preserve all columns

  All existing columns stay unchanged: company (30% width), title/location/remote stacked,
  5 score cells (Overall/Role/Scope/Culture/Comp). No simplification.

---

## Priority 8 — Applications.tsx → standalone list

- [x] **8. Remove split-pane from Applications.tsx; add AppHeader; rows navigate to workspace** — split-pane removed; `ApplicationSummary` import dropped; `selected` prop removed from `AppRow`; row onClick navigates to `/jobs/${app.job_id}?tab=application`; `<AppHeader pageName="Applications" />` added; `useParams` removed

  **Files:** `frontend/src/pages/Applications.tsx`

  Read the current file fully before making changes.

  ---

  ### Part A — Remove split-pane

  Remove the two-column flex layout. Remove the right panel div and the `<ApplicationSummary>`
  import and render. Remove the `appIdParam` / `selectedId` param read and `handleSelect` toggle.

  ---

  ### Part B — Navigation on row click

  `AppRow` onClick: `navigate('/jobs/${app.job_id}?tab=application')`.
  This requires `job_id` to be present on `ApplicationListItem`. Verify it is in the type and
  API response; add to both if missing.

  ---

  ### Part C — Apply AppHeader + layout

  Add `<AppHeader pageName="Applications" />` at the top.
  Keep the count subtitle (`{applications.length} active`).
  All existing columns unchanged: company, title/status, apply date/location.

---

## Priority 9 — Workspace shell: routing, sub-header, tab bar, 2-column skeleton

- [ ] **9. Rebuild JobDetail.tsx as full-page workspace shell**

  **Files:** `frontend/src/pages/JobDetail.tsx`, `frontend/src/main.tsx`

  Read both files fully before making changes. This priority builds the shell only — no tab
  content yet. Tab content areas render empty placeholder divs.

  ---

  ### Part A — Route change in `main.tsx`

  `/jobs/:jobId` route: change the element from the Jobs+JobDetail split-pane to a standalone
  `<JobDetailPage />` (rename the export of the rebuilt JobDetail.tsx to `JobDetailPage`).
  The `/jobs` route (list) remains unchanged.

  ---

  ### Part B — Query chain

  ```typescript
  const { jobId: jobIdParam } = useParams<{ jobId: string }>()
  const jobId = parseInt(jobIdParam ?? '0', 10)
  const { data: jobData, isLoading: jobLoading } = useJobDetail(jobId)
  const applicationId = jobData?.job.application_id ?? null
  const { data: appData, isLoading: appLoading } = useApplicationDetail(applicationId ?? 0, {
    enabled: applicationId !== null,
  })
  ```

  `useApplicationDetail` must accept an `enabled` option — add this if not already present.

  ---

  ### Part C — Tab state from URL

  ```typescript
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = (searchParams.get('tab') ?? 'job-details') as TabId

  type TabId = 'job-details' | 'application' | 'resume-cover' | 'interview' | 'application-log'

  function setTab(tab: TabId): void {
    setSearchParams({ tab }, { replace: true })
  }
  ```

  ---

  ### Part D — Sub-header component

  Build `WorkspaceSubHeader` as a component within this file (not a separate file — it is only
  used here):

  ```
  ┌─────────────────────────────────────────────────────────────────────────────┐
  │  [8.5]   STATUS          Senior Frontend Engineer              Remote       │
  │  [/ 10]  Applied         Acme Corp   📍 San Francisco                      │
  └─────────────────────────────────────────────────────────────────────────────┘
  ```

  Props: `job: Job`, `appStatus: ApplicationStatus | null`, `appLoading: boolean`

  Score section (left):
  - Big number: `font-serif text-4xl text-accent leading-none`
  - `/ 10`: `font-mono text-xs text-muted`
  - Shows `—` if `agg_score_overall` is null

  Status section:
  - Label row: `text-[10px] font-mono text-muted uppercase tracking-widest`
  - Value row: `<StatusBadge status={appStatus} />` + company name in `text-sm text-muted`
  - Shows `—` while `appLoading`

  Title section:
  - Row 1: `font-serif text-lg text-text` — job title
  - Row 2: `📍 {location} · {remote_type}` in `text-xs text-muted`

  Sub-header is sticky: `sticky top-[57px] z-10 bg-bg border-b border-surface2`
  (57px = AppHeader height; adjust if AppHeader height differs — read the rendered height).

  ---

  ### Part E — Tab bar

  Five tab buttons below the sub-header (but within the sticky area or directly below it —
  same sticky block):

  ```
  [JOB DETAILS]  [APPLICATION]  [RESUME/COVER]  [INTERVIEW]  [APPLICATION LOG]
  ```

  Active tab: `border-b-2 border-accent text-accent`
  Inactive: `border-b-2 border-transparent text-muted hover:text-text`
  Tab bar: `flex border-b border-surface2 px-6`

  ---

  ### Part F — 2-column layout skeleton

  For tabs `job-details`, `application`, `resume-cover`, `interview`:
  ```tsx
  <div className="flex flex-1 overflow-hidden">
    <div className="w-[280px] shrink-0 border-r border-surface2 overflow-y-auto p-4">
      {/* left column — tab-specific content (empty in this priority) */}
    </div>
    <div className="flex-1 overflow-y-auto p-6">
      {/* right column — tab-specific content (empty in this priority) */}
    </div>
  </div>
  ```

  For tab `application-log`:
  ```tsx
  <div className="flex-1 overflow-y-auto p-6">
    {/* full-width content (empty in this priority) */}
  </div>
  ```

  Loading state: if `jobLoading`, render `<div className="p-6 text-muted text-sm">Loading…</div>`
  Error state: if job not found, render appropriate error message.

---

## Priority 10 — JOB DETAILS tab

- [ ] **10. Build JOB DETAILS tab — left column + right column with 3 action sections**

  **Files:** `frontend/src/pages/JobDetail.tsx`

  Read the full current state of the file (from P9) before adding content.
  All modals from the old JobDetail.tsx (EditJobModal, EditDescriptionModal, EditRatingsModal,
  EditJobInfoModal, AddCompanyInfoModal, ImportModal) are preserved and re-used here.

  ---

  ### Left column

  **ACTIONS section** (top of left column):

  Three action buttons: EVALUATIONS, JOB DESCRIPTION, COMPANY INFO.
  State: `activeAction: 'evaluations' | 'job-description' | 'company-info'` — default `'evaluations'`.
  One button active at a time. Active styling: `w-full text-left px-3 py-2 text-sm font-mono
  bg-surface2 text-accent border-l-2 border-accent rounded-r`
  Inactive: `w-full text-left px-3 py-2 text-sm font-mono text-muted hover:text-text transition-colors`

  **HR divider** (`<hr className="border-surface2 my-4" />`)

  **SUMMARY section** (below HR):

  - Company name: `font-serif text-lg text-text mb-4`
  - Excitement label + `<StarRating>` component (existing) — inline edit on click
  - My Ratings: display values (Role, Scope, Culture, Comp, Overall) + Edit button → opens
    `EditRatingsModal` (existing component)
  - Job Info: location, remote, pay band, role keyword display + Edit button → opens
    `EditJobInfoModal` (existing component)

  Each sub-section has a `text-[10px] font-mono text-muted uppercase tracking-widest` header.

  ---

  ### Right column — EVALUATIONS view (default)

  **Aggregate score block** (top):
  Five score cells: Overall (from `job.agg_score_overall`), Role, Scope, Culture, Comp.
  Same `ScoreCell` pattern as Jobs.tsx list rows. Use `—` if null.
  Import External Eval button: secondary button style (P4 pattern) — opens existing `ImportModal`.

  **Evaluation history rows** (below agg block):
  Each evaluation row: collapsed header shows timestamp + model name + `score_overall` + `fit_type` badge.
  Clicking row header expands to show full eval details (strengths, gaps, recommendation, keywords,
  keyword_gaps, domain_match, role_type_match — same fields as existing `EvalCard` component).
  Expanded: also shows the LLM prompt (from `llm_call_log` via `llm_call_log_id`) with a
  Copy button. `prompt` field is already in the evaluation data if the `llm_call_log` is joined
  in the API — confirm the `useJobDetail` hook returns this; add to backend if missing.

  Zero state: "No evaluations yet. Run one from the Evaluate page." if `evaluations.length === 0`.

  ---

  ### Right column — JOB DESCRIPTION view

  Button row (top): Edit (opens `EditDescriptionModal`), Copy (copies description to clipboard),
  Export JD (copies description as plain text — same as Copy; label differentiates intent),
  Export Job (copies structured job summary: company, title, location, remote, pay band,
  description — as formatted text block for external use).

  Description text: `<pre className="text-xs text-text font-sans leading-relaxed whitespace-pre-wrap break-words">`

  Zero state: "No description yet." if `description_merged` is null.

  ---

  ### Right column — COMPANY INFO view

  **Add form** (always visible at top):
  Type selector (`<select>` with COMPANY_INFO_TYPES), notes textarea, URL input, Save button.
  Same fields as existing `AddCompanyInfoModal` — inline here, not in a modal.

  **Existing entries** (below form):
  Each entry: collapsed header shows `typeLabel + created timestamp`.
  Expanding shows notes text + clickable URL link.
  Zero state: "No company info yet." below the form if `company_log.length === 0`.

  On save: call `useAddCompanyLog` mutation; invalidate `['job', jobId]`.

---

## Priority 11 — APPLICATION tab

- [ ] **11. Build APPLICATION tab — left column + right column with 5 action sections**

  **Files:** `frontend/src/pages/JobDetail.tsx`

  Read the full current state of the file (from P10) before adding content.
  The `LessonCapturePanel` component from `ApplicationDetailPage.tsx` is copied/moved here.

  ---

  ### Left column

  **ACTIONS section** (top):
  Five action buttons: DETAILS, ADD EVENT, ADD APPLICATION NOTE, APPLICATION QUESTIONS, ADD LESSON.
  State: `activeAppAction: 'details' | 'add-event' | 'add-note' | 'questions' | 'lesson'` — default `'details'`.
  Same active/inactive styling as JOB DETAILS tab.

  **HR divider**

  **SUMMARY section** (below HR):
  - Company name: `font-serif text-lg text-text`
  - Job title: `text-sm text-muted`
  - Status badge: `<StatusBadge status={appStatus} />`

  ---

  ### Right column — DETAILS view (default)

  Fields (grid, same layout as existing ApplicationDetailPage):
  - **Apply URL**: sourced from `postings.find(p => p.source_url)?.source_url`; shown as
    clickable link if present, `—` if not
  - **I APPLIED! button**: shown only when `application.applied === 0`; calls
    `patch.mutate({ applied: 1, application_status: 'applied' })`; becomes "Applied ✓"
    (green, disabled) when `applied === 1`
  - **Status selector**: `<select>` with `STATUSES` (excludes `not-started`); onchange patches
    immediately
  - **Apply Date**: date input, onBlur save
  - **End Date**: date input, onBlur save
  - **Requested Salary**: text input, onBlur save
  - **Generate External Eval + Tailored Resume** button (renamed from "Generate Prompt"):
    calls `useGeneratePrompt` mutation; opens prompt modal on success (existing `PromptModal`
    component preserved with new title "External Eval + Tailored Resume Prompt")

  ---

  ### Right column — ADD EVENT view

  **Add form** (always visible):
  - Event type selector: `<select>` populated with the 7 new `application_log` system_type values
    (recruiter_outreach, phone_screen, onsite_interview, offer_received, rejection_received,
    withdrawal, application_communication) with human-readable labels
  - Notes textarea
  - URL input
  - Save button → calls `useAddLog` mutation (same hook as ADD APPLICATION NOTE — both write to
    `application_logs`; they differ only in the available type options)

  **Existing event entries** (below form):
  Expandable rows: collapsed shows type label + timestamp; expanded shows notes + URL.
  Zero state: "No events logged yet."

  ---

  ### Right column — ADD APPLICATION NOTE view

  **Add form** (always visible):
  - Note type selector: `<select>` with existing log types (recruiter_call, interview_feedback,
    compensation, repost_alert, general) — excludes the ADD EVENT types and `prompt`
  - Notes textarea
  - URL input
  - Save button → calls `useAddLog` mutation

  **Existing note entries** (below form):
  Expandable rows with delete button (confirm-on-second-click). Timestamp is editable
  (existing `TimestampModal` pattern from ApplicationDetailPage).
  Zero state: "No notes yet."

  ---

  ### Right column — APPLICATION QUESTIONS view

  **Add form** (always visible):
  - Question textarea (required): `placeholder="Paste the application question…"`
  - Response textarea: `placeholder="Your answer…"`
  - Save button → calls `useCreateApplicationQuestion` mutation
  - Validation: Save disabled if question is empty

  **Existing Q&A entries** (below form):
  Expandable rows: collapsed shows first 80 chars of question + created date.
  Expanded shows: full question, full response, Edit button (inline edit — replace row content
  with editable textareas + Save), Delete button (confirm-on-second-click).
  Zero state: "No application questions captured yet."

  ---

  ### Right column — ADD LESSON view

  `LessonCapturePanel` component moved here from `ApplicationDetailPage.tsx` unchanged.
  Props: `applicationId`, `jobTitle` (from `jobData.job.title`), `companyName`
  (from `jobData.job.company_name`), `onFinalized` (invalidates activity log query).

---

## Priority 12 — APPLICATION LOG tab

- [ ] **12. Build APPLICATION LOG tab — 1-column unified timeline**

  **Files:** `frontend/src/pages/JobDetail.tsx`

  ---

  ### Layout

  Full-width single column (no left column). Padding: `p-6`.
  Header: `font-serif text-accent text-xl mb-1` — "Application Log"
  Entry count subtitle: `{entries.length} entries` in `text-xs font-mono text-muted`

  ---

  ### Data source

  `useActivityLog(jobId)` hook (from P3). Displays `data.entries` sorted as returned by API
  (timestamp DESC, id ASC tiebreaker — already done server-side).

  Loading state: "Loading log…" centered.
  Error state: "Failed to load log." centered.
  Empty state: "No activity yet." if `entries.length === 0`.

  ---

  ### Entry row component (`ActivityLogRow`)

  Collapsed header (always visible):
  ```
  [timestamp]  [TYPE BADGE]  [activity_type]  [source text]  [Copy] [Delete?]  [▼]
  ```

  - Timestamp: `text-[10px] font-mono text-muted w-32 shrink-0`; editable (click → timestamp
    modal) only when `can_edit_timestamp === true`
  - Type badge: `text-[10px] font-mono px-1.5 py-0.5 rounded` with color per Design Decisions
    badge map
  - Activity type: `text-[10px] font-mono text-muted uppercase tracking-wider w-36 truncate`
  - Source: `text-[10px] font-mono text-muted flex-1`
  - Copy button: copies `text` field to clipboard
  - Delete button: shown only when `can_delete === true`; confirm-on-second-click pattern
  - Chevron: `▼` / `▲`

  Expanded content (below header, separated by `border-t border-surface2`):
  - Text content: `text-xs text-text leading-relaxed whitespace-pre-wrap font-mono`
  - URL: clickable link in `text-xs text-accent hover:underline`
  - "No content." in muted italic if both text and url are null

  Timestamp edit: reuse `TimestampModal` component (moved from ApplicationDetailPage).
  On save: call appropriate patch mutation based on `entry_type`.

---

## Priority 13 — RESUME/COVER + INTERVIEW stubs

- [ ] **13. Add stub content to RESUME/COVER and INTERVIEW tabs**

  **Files:** `frontend/src/pages/JobDetail.tsx`

  Both tabs use the 2-column layout skeleton from P9.

  ---

  ### Left column (both tabs)

  ```tsx
  <p className="text-[10px] font-mono text-muted uppercase tracking-widest">
    Nothing to configure yet.
  </p>
  ```

  ---

  ### RESUME/COVER right column

  ```tsx
  <div className="bg-surface border border-surface2 rounded-xl p-6 max-w-lg">
    <p className="font-serif text-accent text-lg mb-2">Resume & Cover Letter</p>
    <p className="text-sm text-muted leading-relaxed">
      Upload and manage your resume and cover letter documents.
      Connect to Typst for PDF compilation and tailored resume generation.
    </p>
    <p className="mt-4 text-xs font-mono text-muted/60">Coming in Phase 1.6.</p>
  </div>
  ```

  ---

  ### INTERVIEW right column

  ```tsx
  <div className="bg-surface border border-surface2 rounded-xl p-6 max-w-lg">
    <p className="font-serif text-accent text-lg mb-2">Interview Tracking</p>
    <p className="text-sm text-muted leading-relaxed">
      Track interview stages, scheduling, prep notes, and feedback from each round.
    </p>
    <p className="mt-4 text-xs font-mono text-muted/60">Coming soon.</p>
  </div>
  ```

---

## Priority 14 — Retire ApplicationDetailPage + ApplicationSummary + routes

- [ ] **14. Delete retired files; remove routes; clean up cross-references**

  **Files:** `frontend/src/pages/ApplicationDetailPage.tsx` (delete),
  `frontend/src/pages/ApplicationSummary.tsx` (delete),
  their test files (delete if they exist),
  `frontend/src/main.tsx` (remove routes + imports),
  `frontend/src/pages/JobDetail.tsx` (remove `AppStatusSection` "View Application →" link — now obsolete)

  ---

  ### Part A — Delete files

  Delete: `ApplicationDetailPage.tsx`, `ApplicationSummary.tsx`.
  Check for and delete: `ApplicationDetailPage.test.tsx`, `ApplicationSummary.test.tsx` if present.

  ---

  ### Part B — Update `main.tsx`

  Remove:
  - `import ApplicationDetailPage`
  - Route: `{ path: '/application-detail/:applicationId', element: <ApplicationDetailPage /> }`
  - Route: `{ path: '/applications/:applicationId', ... }` if it exists as a separate route

  Verify no remaining imports of the deleted files anywhere in `frontend/src/`.

  ---

  ### Part C — Remove stale cross-links

  In the rebuilt `JobDetail.tsx`, the old `AppStatusSection` had a `Link to="/application-detail/..."`.
  This should no longer exist (it was replaced by the APPLICATION tab). Verify and remove if any
  reference remains.

  In `Applications.tsx`, the old `ApplicationSummary` had a `Link to="/application-detail/..."`.
  This was removed in P8 along with the right pane. Verify no stale link remains.

---

## Priority 15 — Backend tests

- [ ] **15. Backend tests for new routes and schema**

  **Files:** `tests/routes/test_jobs.py` (update), new `tests/routes/test_application_questions.py`

  ---

  ### application_questions routes

  - `POST` happy path: question created, returns record with id
  - `POST` 404 when application_id not found
  - `GET` returns list; empty list when no questions
  - `PATCH` updates question and/or response
  - `PATCH` 404 when question_id not found
  - `DELETE` removes record; returns `{ deleted: true }`
  - `DELETE` 404 when question_id not found

  ---

  ### Activity log route

  - Returns entries from all 7 sources when data exists
  - "Job Created" entry appears before "Job Description" entry (same timestamp tiebreaker test)
  - 404 when job_id not found
  - Empty `entries` list when job has no activity

  ---

  ### Updated job detail route

  - `GET /api/v1/jobs/:id` now includes `application_id` in response
  - `application_id` matches the auto-created application for the job

  ---

  ### create_job audit records

  - After `create_job()`, `application_audit` contains "Job created" record with both
    `application_id` and `job_id` set
  - "Job description attached" record present when description was provided; absent when not

---

## Priority 16 — Frontend tests

- [ ] **16. Frontend tests for workspace, list pages, AppHeader**

  **Files:** `frontend/src/pages/JobDetail.test.tsx` (rewrite),
  `frontend/src/pages/Jobs.test.tsx` (update),
  `frontend/src/pages/Applications.test.tsx` (update),
  `frontend/src/components/AppHeader.test.tsx` (update or create)

  ---

  ### AppHeader

  - Renders Dashboard form when no `pageName` prop
  - Renders `← Home` link when `pageName` provided
  - Renders `pageName` text when prop provided
  - Settings link present in both modes

  ---

  ### Jobs.tsx (updated)

  - Renders list of jobs
  - Clicking a row navigates to `/jobs/:id` (not split-pane)
  - No right panel rendered

  ---

  ### Applications.tsx (updated)

  - Renders list of applications
  - Clicking a row navigates to `/jobs/:id?tab=application`
  - No right panel rendered

  ---

  ### JobDetail.tsx workspace (new tests)

  - Sub-header renders score, company, title, status
  - Sub-header shows `—` when `agg_score_overall` is null
  - Default tab is `job-details` when no `?tab=` param
  - Tab switches on click; URL param updates
  - Navigating to `?tab=application` activates APPLICATION tab
  - JOB DETAILS tab: EVALUATIONS action active by default
  - JOB DETAILS tab: clicking JOB DESCRIPTION switches right column content
  - APPLICATION tab: DETAILS action active by default
  - APPLICATION tab: I APPLIED! button shown when `applied === 0`; hidden when `applied === 1`
  - APPLICATION tab: APPLICATION QUESTIONS zero state shown when no questions exist
  - APPLICATION LOG tab: renders full-width (no left column)
  - RESUME/COVER tab: stub card renders
  - INTERVIEW tab: stub card renders

---

## Priority 17 — Visual consistency sweep

- [ ] **17. Light CSS pass — consistency and polish across all pages**

  **Files:** All page files modified in this phase; `tailwind.config.js` if token changes needed

  This priority makes NO structural or layout changes. It is limited to:

  - Verify all pages use the Design Foundation patterns from P4 consistently
  - Verify sub-header score display matches the HTML reference (large serif number, muted denom)
  - Verify section header labels (`text-[10px] font-mono text-muted uppercase tracking-widest`)
    are consistent across all left column sections
  - Verify button styles (primary/secondary/destructive) are consistent across all action areas
  - Verify spacing between sections feels balanced (no cramped or over-spaced areas)
  - Verify color-coded badges in APPLICATION LOG are visually distinct and legible

  If any visual issue requires a structural change (column width adjustment, layout change),
  stop and discuss before implementing — this priority is sweeps only.

---

## API Route Summary

| Method | Route | Description |
|---|---|---|
| GET | `/api/v1/applications/{id}/questions` | List application questions |
| POST | `/api/v1/applications/{id}/questions` | Create application question |
| PATCH | `/api/v1/applications/{id}/questions/{qid}` | Update question or response |
| DELETE | `/api/v1/applications/{id}/questions/{qid}` | Delete question |
| GET | `/api/v1/jobs/{id}/activity-log` | Unified activity timeline for job |
| GET | `/api/v1/jobs/{id}` | Extended to include `application_id` |

---

## Files Retired in Phase 1.5

| File | Action |
|---|---|
| `frontend/src/pages/ApplicationDetailPage.tsx` | Deleted |
| `frontend/src/pages/ApplicationSummary.tsx` | Deleted |
| `frontend/src/pages/ApplicationDetailPage.test.tsx` | Deleted (if exists) |
| `frontend/src/pages/ApplicationSummary.test.tsx` | Deleted (if exists) |
| Route `/application-detail/:applicationId` | Removed from `main.tsx` |
| Route `/applications/:applicationId` | Removed from `main.tsx` |

---

## Security Checklist

- [ ] All SQL in new `application_questions` functions uses parameterized statements
- [ ] `get_activity_log()` UNION query uses parameterized `job_id` — no string interpolation
- [ ] `application_id` validated against DB before any question CRUD operation (404 not 500)
- [ ] No user-controlled SQL in activity log query; all filters are `WHERE job_id = ?`
- [ ] Application questions `question` and `response` fields are stored as-supplied — no
      server-side transformation that could inadvertently expose data
- [ ] CORS unchanged — still `localhost:3000` / `localhost:8080` only
