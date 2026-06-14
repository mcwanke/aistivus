# AIstivus — Phase 2.1 Workorder
> Status: In progress
> Last updated: 2026-06-14

---

## Pre-Work

Before starting any step:
- Check `memory/MEMORY.md` for the current test baseline
- Run tests only if no baseline exists
- Each step should end with a passing test run and an updated baseline in memory
- Steps 1–4 are independent and can be done in any order
- Step 5 must complete before Steps 6 and 7
- Step 6 must complete before Step 7

---

## Step 1 — Prompt Calibration Fixes ✅

**Goal:** Fix the scoring philosophy in both the internal evaluation prompt and the external
eval prompt. The current internal prompt contains two specific problems: a contradictory
instruction that suppresses critical scoring, and poorly differentiated band descriptions
that cause scores to cluster around 8–8.5. The external eval prompt has no scoring guidance
at all. Both are fixed here — no infrastructure changes.

### 1.1 Fix `SYSTEM_PROMPT_TEMPLATE` in `evaluator.py`

**Remove** the following line from the opening persona block:
```
A score of 10 should be extremely rare — reserved for roles that are an almost perfect match.
```

**Remove** the following line from the CRITICAL RULES section:
```
- When the candidate's background directly satisfies a JD requirement,
  do not flag it as a gap. Give benefit of the doubt when experience
  is plausibly applicable even if not explicitly stated in identical terms.
  A strong fit with minor gaps should score 8. Do not let the instruction
  to "be critical" suppress a genuinely high score when the fit is real.
```

**Replace** the existing scoring guidance block (the numbered 1–10 list) with:

```
Scoring guidance — apply this strictly:
1-2: Categorically wrong — function, domain, or level is fundamentally misaligned
     with what the candidate is targeting regardless of transferable experience.
3-4: Significant mismatch — major gaps or deal-breaker violations; a long-shot
     application that most hiring managers would filter out.
5:   Borderline — some fit exists but gaps are substantial enough that most
     hiring managers would pass. Do not apply unless circumstances are unusual.
6:   Viable application — qualifications meet the minimum threshold; the candidate
     would not be screened out, but is not a standout. Worth applying.
7:   Good fit — solid match, minor gaps only, competitive in the applicant pool.
8:   Strong fit — well-aligned across most dimensions, would be a strong candidate.
9:   Excellent fit — near-perfect match, very few concerns, likely to advance far.
10:  Exceptional — every stated requirement met, direct domain match, no meaningful
     gaps. 10 is achievable but requires genuine alignment on all dimensions.
```

No other changes to `evaluator.py` in this step.

### 1.2 Extract and fix the external eval prompt in `main.py`

The external eval prompt currently lives as an inline f-string inside the
`generate_prompt` route handler function. Extract it to a named module-level constant
before making any edits.

**Extract to constant** at the top of `main.py` (near other constants or imports):

```python
EXTERNAL_EVAL_PROMPT_TEMPLATE = """## CONTEXT FILES
...
"""
```

In the `generate_prompt` function, replace the inline f-string with:
```python
prompt = EXTERNAL_EVAL_PROMPT_TEMPLATE.format(
    company_name=company_name,
    title=title,
    location=location,
    pay_band=pay_band,
    jd_text=jd_text,
)
```

**Then add** the following scoring framework section to the template, replacing the
existing `**Overall score:** 1–10 composite with one-sentence verdict.` line:

```
**Overall score:** 1–10 composite with one-sentence verdict.

Scoring guidance — apply the same calibration used internally:
- 1–2: Categorically wrong — function, domain, or level fundamentally misaligned
- 3–4: Significant mismatch — major gaps or deal-breaker violations
- 5: Borderline — some fit but gaps make this a poor application choice
- 6: Viable — meets minimum threshold, not a standout candidate
- 7: Good fit — solid match, minor gaps, competitive
- 8: Strong fit — well-aligned, strong candidate
- 9: Excellent fit — near-perfect, very few concerns
- 10: Exceptional — every requirement met, direct domain match, no meaningful gaps
```

### Files touched
- `evaluator.py` — scoring band reframe, two removed instructions
- `main.py` — `EXTERNAL_EVAL_PROMPT_TEMPLATE` constant extracted; calibration guidance added

---

## Step 2 — Quick UX Wins + Re-Run Eval ✅

**Goal:** Four targeted improvements. Three are small frontend-only changes. The fourth
(Re-Run Internal Eval) adds a button to Job Details that navigates to the Evaluate page
with fields pre-populated and bypasses the existing duplicate-job detection.

### 2.1 Spinner on Fill With AI (N1)

In `frontend/src/pages/Evaluate.tsx`, the Fill With AI button already disables and
changes its text label when `fillGapsMutation.isPending`. Add a visual spinner icon
alongside the text when pending.

Add an animated SVG spinner (inline or via a shared component) that renders only when
`fillGapsMutation.isPending`. No other changes to this button or its behavior.

### 2.2 Search field on Jobs page (N2)

In `frontend/src/pages/Jobs.tsx`:

- Add `useState<string>('')` for the search term
- Add a text input as the **first element** in the existing filter bar row:
  ```
  [ 🔍 Search company or title... ] [ Remote: All ▼ ] [ Score: All ▼ ] ...
  ```
- Client-side filter: after React Query returns the jobs list, filter before rendering:
  ```typescript
  const filtered = jobs.filter(job =>
    job.company_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    job.title.toLowerCase().includes(searchTerm.toLowerCase())
  )
  ```
- No backend changes. No debounce required at this scale.

### 2.3 Add company name and title to Job Info edit modal (N3)

In `frontend/src/pages/JobDetail.tsx`, the existing Job Info edit modal currently
handles: location, remote_type, pay_band, role_keyword. Add company_name and title
fields to this same modal.

**Backend check required before implementing:** Verify that `PATCH /api/v1/jobs/{id}`
in `main.py` accepts and updates `company_name` and `title`. If the endpoint exists
but does not handle these fields, extend it. If the endpoint does not exist, create it.
The corresponding `database.py` update function must also be verified/extended.

The edit modal fields in order: Company Name, Job Title, Location, Remote Type,
Pay Band, Role Keyword. Validation: company_name and title are required fields —
do not allow blank values to be saved.

### 2.4 Re-Run Internal Eval button (Re-Run)

**Goal:** Allow re-evaluating an existing job from its Job Details page, useful for
testing prompt changes against previously imported jobs. Navigates to the Evaluate page
with all fields pre-populated; the Evaluate page handles the eval as normal.

#### 2.4.1 Add button to Job Details — Evaluations tab

In `frontend/src/pages/JobDetail.tsx`, add a **"Re-Run Internal Eval"** button to the
Evaluations tab header, positioned to the **left** of the existing "Import External Eval"
button.

On click, call `navigate('/evaluate', { state: { rerunJobId, company, title, location, workType, applyUrl, payBand, description } })`.

Populate the router state from the job record currently loaded in the component.
`description` = `job.description_merged`. `applyUrl` = sourced from job_postings if
available, empty string if not.

#### 2.4.2 Evaluate page — read router state on mount

In `frontend/src/pages/Evaluate.tsx`, on mount read `location.state` via
`useLocation()`. If `rerunJobId` is present in state:

- Pre-populate all 7 form fields from the state values
- Set a `rerunJobId` local state variable to the job ID
- **Suppress** the existing duplicate-job detection logic entirely (no warning shown,
  no modal, form behaves as if this is a new entry from the user's perspective)

#### 2.4.3 Evaluate endpoint — accept optional `rerun_job_id`

In `main.py`, update the evaluate endpoint to accept an optional `rerun_job_id` field
in the request body.

When `rerun_job_id` is provided:
- Fetch the existing job by ID (404 if not found)
- Skip the create-or-find dedup logic entirely
- Run the evaluation against the existing `job_id`
- `is_active` is already 1 for this job — no change needed

When `rerun_job_id` is NOT provided:
- Existing dedup logic applies (unchanged, except see Step 3 for auto-activate change)

#### 2.4.4 Post-eval behavior on re-run

After a re-run eval completes, the same post-action widget (Step 3) appears. "Go To Job"
navigates to the job the user came from. "Evaluate Again" does a full reset. No special
handling needed — the widget behavior is identical regardless of whether the eval was
a re-run or a new job.

### Files touched
- `frontend/src/pages/Evaluate.tsx` — spinner icon; router state read on mount; rerunJobId state; suppress dedup warning when rerunJobId set; rerun_job_id in API call
- `frontend/src/pages/Jobs.tsx` — search input + client-side filter
- `frontend/src/pages/JobDetail.tsx` — company_name + title in edit modal; Re-Run Internal Eval button with navigate
- `frontend/src/hooks/useEvaluate.ts` (or equivalent) — extend evaluate mutation payload to include optional `rerun_job_id`
- `main.py` — evaluate endpoint accepts optional `rerun_job_id`; PATCH /api/v1/jobs/{id} verified/extended for company_name + title
- `database.py` — update_job() function verified/extended for company_name + title

---

## Step 3 — Evaluate Page: Create Job Without Eval + Post-Action Widget ✅

**Goal:** Add a path to create a job in the system without running an AI evaluation
(for use when all AI instances are down). Remove the existing "Yes, build this job" /
"No, Skip Job" gate — all evaluated jobs now auto-activate. Replace post-eval navigation
with an inline widget offering two actions.

### 3.1 Auto-activate on evaluation (backend)

In `main.py`, the evaluate endpoint currently creates the job at `is_active = 0` and
relies on a separate frontend call to `POST /api/v1/jobs/{id}/activate` after the user
clicks "Yes, build this job". Change this so the evaluate endpoint sets `is_active = 1`
directly after creating the job — or calls `database.activate_job()` internally before
returning the evaluation result.

The `/api/v1/jobs/{id}/activate` endpoint can remain for other potential callers but
is no longer called from the Evaluate page.

### 3.2 New endpoint: `POST /api/v1/jobs/create`

New endpoint in `main.py` for creating a job without evaluation.

**Request body:**
```json
{
  "company_name": "string (required)",
  "title": "string (required)",
  "location": "string (optional)",
  "remote_type": "Remote | Hybrid | On-site | null",
  "apply_url": "string (optional)",
  "pay_band": "string (optional)",
  "description": "string (optional)"
}
```

**Behavior:**
- Calls `database.create_job()` with `is_active = 1`
- Creates matching `job_postings` record with `description_raw` and `source_url` if provided
- Writes `application_audit` records ("Job created", "Job description attached" if description present)
- Rate limiting: 10/min

**Response:**
```json
{ "success": true, "job_id": 123 }
```

### 3.3 Frontend — Evaluate page changes

In `frontend/src/pages/Evaluate.tsx`:

**Add "Create Job Without Eval" button** alongside the existing "Evaluate" button.
No model selector for this button. On click, calls the new `POST /api/v1/jobs/create`
endpoint with the current form field values.

**Remove** the "Yes, build this job" and "No, Skip Job" buttons entirely. These
no longer exist.

**Add post-action inline widget.** This widget appears after:
- An evaluation completes (regardless of scores)
- A "Create Job Without Eval" completes

The widget renders **above** the evaluation result area (or above the success message
for create-without-eval). It contains two buttons side by side:

- **Go To Job** → `navigate('/jobs/:jobId')`
- **Evaluate Again** → full page reset: clear all form fields, clear result state,
  clear any stored `rerunJobId`, widget disappears

The widget is inline (not a modal). It does not block reading the evaluation result below it.

### 3.4 Add frontend type and hook

In `frontend/src/types/api.ts`, add:
```typescript
interface CreateJobPayload {
  company_name: string
  title: string
  location?: string
  remote_type?: 'Remote' | 'Hybrid' | 'On-site' | null
  apply_url?: string
  pay_band?: string
  description?: string
}

interface CreateJobResult {
  success: boolean
  job_id: number
}
```

In `frontend/src/hooks/useEvaluate.ts` (or equivalent), add `useCreateJobMutation()`.

### 3.5 Write tests

**Backend:**
- `POST /api/v1/jobs/create`: job + application created at is_active = 1; job_postings record created when description provided; audit records written; returns job_id
- `POST /api/v1/jobs/create`: missing required fields → 422
- Evaluate endpoint: confirm job created at is_active = 1 (not 0)

**Frontend:**
- "Create Job Without Eval" button renders and calls correct endpoint
- Post-action widget appears after eval completes
- Post-action widget appears after create-without-eval completes
- "Evaluate Again" resets all form state and hides widget
- "Go To Job" navigates to correct route

### Files touched
- `main.py` — evaluate endpoint auto-activates; new `POST /api/v1/jobs/create` endpoint
- `database.py` — verify create_job() sets is_active param correctly; no schema change
- `frontend/src/pages/Evaluate.tsx` — "Create Job Without Eval" button; remove Yes/No buttons; post-action inline widget
- `frontend/src/types/api.ts` — CreateJobPayload, CreateJobResult
- `frontend/src/hooks/useEvaluate.ts` — useCreateJobMutation
- `tests/routes/` — new test file or additions for create-job endpoint

---

## Step 4 — Evaluation Feedback System ✅

**Goal:** Collect optional user reactions to evaluation results. Feedback is stored for
use by a future prompt review tool (Phase 2.2) and is not displayed back to the user
in this phase. The table design is extensible to other prompt types.

### 4.1 New `prompt_feedback` table (database.py)

Add to `init_db()` in `database.py`:

```sql
CREATE TABLE IF NOT EXISTS prompt_feedback (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    prompt_type      TEXT NOT NULL,
    evaluation_id    INTEGER,
    llm_call_log_id  INTEGER,
    agree            INTEGER,
    dimension        TEXT,
    feedback_text    TEXT,
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (evaluation_id) REFERENCES evaluations(id) ON DELETE SET NULL,
    FOREIGN KEY (llm_call_log_id) REFERENCES llm_call_log(id) ON DELETE SET NULL
)
```

**`prompt_type` values (initial):** `'evaluation_internal'` | `'evaluation_external'`

**`agree`:** `1` = agree, `0` = disagree

**`dimension`:** `'overall_score'` | `'role_fit'` | `'recommendation'` | `'strengths_gaps'` | `'general'` | `null`

Add DB function: `add_prompt_feedback(prompt_type, evaluation_id, llm_call_log_id, agree, dimension, feedback_text) -> int`

### 4.2 New API endpoint

In `main.py`, add:

```
POST /api/v1/prompt-feedback
```

**Request body:**
```json
{
  "prompt_type": "evaluation_internal",
  "evaluation_id": 42,
  "llm_call_log_id": 99,
  "agree": 1,
  "dimension": "overall_score",
  "feedback_text": "Score felt too high for this role"
}
```
All fields except `prompt_type` are optional. Rate limiting: 10/min.

**Response:** `{ "success": true, "id": 123 }`

### 4.3 Frontend — reusable feedback component

New component: `frontend/src/components/EvaluationFeedbackButton.tsx`

Props:
```typescript
interface EvaluationFeedbackButtonProps {
  promptType: 'evaluation_internal' | 'evaluation_external'
  evaluationId: number
  llmCallLogId?: number
}
```

**Renders:** A button labeled "Rate this evaluation" (or similar muted label).

**On click:** Opens a modal containing:
- **Agree / Disagree** toggle (two styled buttons, one selected at a time)
- **What was off?** dimension selector — shown only when Disagree is selected:
  `Overall Score` | `Role Fit` | `Recommendation` | `Strengths & Gaps` | `General`
- **Optional comment** textarea (max 200 chars, placeholder "Any specifics?")
- **Submit** button — calls `POST /api/v1/prompt-feedback`; closes modal on success
- **Cancel** button — closes modal, no submission

**After successful submit:** Button label changes to "Feedback submitted" and becomes
non-interactive. No toast or confirmation needed.

Add to `frontend/src/types/api.ts`:
```typescript
interface PromptFeedbackPayload {
  prompt_type: 'evaluation_internal' | 'evaluation_external'
  evaluation_id?: number
  llm_call_log_id?: number
  agree: 0 | 1
  dimension?: string
  feedback_text?: string
}
```

Add hook: `useSubmitPromptFeedback()` in `frontend/src/hooks/`.

### 4.4 Wire feedback button on Evaluate page

In `frontend/src/pages/Evaluate.tsx`, after an internal evaluation completes, render
the `EvaluationFeedbackButton` component at the **top** of the result area, above the
post-action widget (Go To Job / Evaluate Again).

Layout order (top to bottom) after eval completes:
1. `EvaluationFeedbackButton` (inline button, opens modal on click)
2. Post-action inline widget (Go To Job | Evaluate Again)
3. Evaluation result (scores, recommendation, etc.)

Pass `promptType="evaluation_internal"`, `evaluationId`, and `llmCallLogId` from the
evaluation response.

### 4.5 Wire feedback on Import External Eval

In `frontend/src/pages/JobDetail.tsx`, after the "Import External Eval" import succeeds
and the first modal closes, open a second modal:

```
Import successful.

Would you like to add feedback on this evaluation?

[ Cancel ]   [ Add Feedback ]
```

- **Cancel** → dismisses the second modal; returns to Evaluations tab
- **Add Feedback** → dismisses the second modal; opens the `EvaluationFeedbackButton`
  modal directly (same component, same fields)

Pass `promptType="evaluation_external"` and the `evaluationId` of the newly imported record.

### 4.6 Write tests

**Backend:**
- `POST /api/v1/prompt-feedback`: record created with correct fields
- `POST /api/v1/prompt-feedback`: evaluation_id and llm_call_log_id are both optional
- `database.py`: `add_prompt_feedback()` returns correct id

**Frontend:**
- Feedback button renders after eval completes
- Modal opens on click; agree/disagree toggles; dimension selector appears on disagree
- Submit calls correct API endpoint; button shows "Feedback submitted" after
- External eval second modal renders after import; Add Feedback opens feedback modal

### Files touched
- `database.py` — `prompt_feedback` table in `init_db()`; `add_prompt_feedback()` function
- `main.py` — `POST /api/v1/prompt-feedback` endpoint
- `frontend/src/components/EvaluationFeedbackButton.tsx` (new)
- `frontend/src/types/api.ts` — PromptFeedbackPayload
- `frontend/src/hooks/` — useSubmitPromptFeedback
- `frontend/src/pages/Evaluate.tsx` — feedback button wired after eval result
- `frontend/src/pages/JobDetail.tsx` — second modal after external eval import
- `tests/routes/` — prompt-feedback endpoint tests
- `frontend/src/components/EvaluationFeedbackButton.test.tsx` (new)

---

## Step 5 — Prompt Storage Foundation 🔲

**Goal:** Create the DB infrastructure for storing editable prompts with version history.
No UI in this step — data layer only. This step is a prerequisite for Steps 6 and 7.

### 5.1 New `prompts` table (database.py)

Add to `init_db()` in `database.py`:

```sql
CREATE TABLE IF NOT EXISTS prompts (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    prompt_key       TEXT NOT NULL,
    label            TEXT,
    version          INTEGER NOT NULL DEFAULT 1,
    segments_text    TEXT NOT NULL,
    preview_context  TEXT,
    saved_at         TEXT NOT NULL DEFAULT (datetime('now')),
    note             TEXT,
    is_active        INTEGER NOT NULL DEFAULT 0
)
```

**`prompt_key`:** stable identifier, e.g. `'evaluation_system'`, `'evaluation_user'`,
`'eval_analysis_system'`, `'eval_scoring_system'`, etc.

**`segments_text`:** the full prompt text with editable/readonly boundaries marked using
`[[EDITABLE]]` / `[[/EDITABLE]]` and `[[READONLY]]` / `[[/READONLY]]` tags. Tags are
stripped before the prompt is sent to the LLM. The double-bracket format avoids collision
with prompt content.

**`preview_context`:** JSON string mapping variable names to sample values, e.g.:
`{"jobsearch_context": "[Sample profile context...]", "company_name": "Acme Corp"}`.
Only populated on the `is_active = 1` row; NULL on historical rows.

**`label`:** Human-readable name for the editor dropdown. Only populated on the active row.

**`is_active`:** Only one row per `prompt_key` may have `is_active = 1`.
Enforced in the application layer (same pattern as `llm_models.default_flag`).

**`version`:** Sequential integer per `prompt_key`, managed in application layer via
`SELECT MAX(version) FROM prompts WHERE prompt_key = ?` + 1.

### 5.2 DB functions (database.py)

Add the following functions:

**`get_active_prompt(prompt_key: str) -> dict | None`**
Returns the active row for the given key (segments_text, preview_context, label, version).
Returns None if no record exists.

**`save_prompt(prompt_key: str, segments_text: str, note: str | None) -> int`**
1. `SELECT MAX(version)` for this key → next_version = max + 1 (or 1 if no rows)
2. `SELECT label, preview_context` from current active row (to carry forward)
3. `UPDATE prompts SET is_active = 0 WHERE prompt_key = ?` (deactivate current)
4. `INSERT` new row with is_active = 1, next_version, carried-forward label/preview_context
5. Returns new row id

**`get_prompt_history(prompt_key: str) -> list[dict]`**
Returns all rows for the key ordered by `version DESC`. Used by future review UI.

**`seed_prompt_if_missing(prompt_key: str, label: str, segments_text: str, preview_context: str | None) -> None`**
Checks if any row exists for the key. If not, inserts one with `is_active = 1, version = 1`.
If rows exist, does nothing. Called at startup.

### 5.3 Startup seeding (main.py)

In the FastAPI lifespan startup handler in `main.py`, call `seed_prompt_if_missing` for
each known prompt key. The segments_text for seeding is built by wrapping the existing
code-level constant in the appropriate tags.

No prompts are seeded in this step — seeding happens in Step 7 when the evaluation
prompts migrate. This step only establishes the infrastructure.

### 5.4 Utility: tag stripping function

Add a utility function (in `database.py` or a new `prompt_utils.py`):

```python
def assemble_prompt(segments_text: str) -> str:
    """Strip all [[EDITABLE/READONLY]] tags and return plain prompt text for LLM use."""
    import re
    return re.sub(r'\[\[/?(?:EDITABLE|READONLY)\]\]', '', segments_text).strip()
```

### 5.5 Write tests

**`tests/test_database.py`:**
- `seed_prompt_if_missing`: seeds when no rows exist; skips when rows exist
- `get_active_prompt`: returns active row; returns None for unknown key
- `save_prompt`: new row inserted at version N+1; old row deactivated; label/preview_context carried forward
- `get_prompt_history`: returns all rows ordered by version DESC
- `assemble_prompt`: tags stripped, content preserved

### Files touched
- `database.py` — `prompts` table in `init_db()`; four new DB functions; `assemble_prompt` utility (or `prompt_utils.py` new file)
- `main.py` — startup seeding call (no prompts seeded yet — that's Step 7)
- `tests/test_database.py` — new tests for all five functions

---

## Step 6 — Segmented Prompt Editor UI 🔲

**Goal:** Add a Prompts section to the Settings page where the user can view and edit
AI prompts through a two-column interface. Editable segments are text areas; locked
segments are muted read-only. The right column shows a fully assembled preview with
sample values substituted in. Saves create new version history records.

**Prerequisite:** Step 5 must be complete.

### 6.1 New API endpoints (main.py)

```
GET  /api/v1/prompts
GET  /api/v1/prompts/{key}
POST /api/v1/prompts/{key}/save
GET  /api/v1/prompts/{key}/preview
```

**`GET /api/v1/prompts`**
Returns list of available prompts:
```json
[{ "prompt_key": "evaluation_system", "label": "Evaluation — System", "version": 3 }]
```
Only returns prompts that have at least one record in the `prompts` table.

**`GET /api/v1/prompts/{key}`**
Returns the active prompt:
```json
{ "prompt_key": "...", "label": "...", "version": 3, "segments_text": "...", "preview_context": "..." }
```

**`POST /api/v1/prompts/{key}/save`**
Body: `{ "segments_text": "...", "note": "optional note" }`
Calls `database.save_prompt()`. Returns `{ "success": true, "version": 4 }`.

**`GET /api/v1/prompts/{key}/preview`**
Assembles the prompt using `assemble_prompt()`, then substitutes `preview_context`
variable values into the assembled text. Returns:
```json
{ "preview_text": "You are an expert career advisor...[full assembled prompt]" }
```

### 6.2 Frontend types and hooks

In `frontend/src/types/api.ts`, add:
```typescript
interface PromptRecord {
  prompt_key: string
  label: string
  version: number
  segments_text: string
  preview_context: string | null
}

interface PromptListItem {
  prompt_key: string
  label: string
  version: number
}

interface PromptSavePayload {
  segments_text: string
  note?: string
}

interface PromptPreviewResult {
  preview_text: string
}
```

Add hooks in `frontend/src/hooks/`:
- `usePrompts()` — GET /api/v1/prompts
- `usePrompt(key: string)` — GET /api/v1/prompts/{key}
- `useSavePrompt(key: string)` — POST mutation
- `usePromptPreview(key: string)` — GET /api/v1/prompts/{key}/preview

### 6.3 Prompt Editor component

New component: `frontend/src/components/PromptEditor.tsx`

**Layout:**

```
┌─ Header row ──────────────────────────────────────────────────────────┐
│  [ Prompt: Evaluation — System ▼ ]          v3          [ Save ]      │
├─ Left column (editable) ──────────────────┬─ Right column (preview) ──┤
│                                           │                           │
│  [[ READONLY segment — muted, no border ] │  Fully assembled prompt   │
│                                           │  with sample values       │
│  ┌─────────────────────────────────────┐  │  substituted in.          │
│  │ EDITABLE segment (textarea)         │  │                           │
│  │                                     │  │  Read-only.               │
│  └─────────────────────────────────────┘  │                           │
│                                           │                           │
│  [[ READONLY segment — muted ]           │                           │
│                                           │                           │
│  ┌─────────────────────────────────────┐  │                           │
│  │ EDITABLE segment (textarea)         │  │                           │
│  └─────────────────────────────────────┘  │                           │
└───────────────────────────────────────────┴───────────────────────────┘
```

**Segment parsing:**
Parse `segments_text` by splitting on `[[EDITABLE]]`, `[[/EDITABLE]]`, `[[READONLY]]`,
`[[/READONLY]]` tags. Each segment renders as either a `<textarea>` (editable) or a
styled muted `<div>`/`<pre>` (readonly).

**Save behavior:**
Reassemble `segments_text` from current textarea values + readonly content in correct order.
Call `useSavePrompt()` mutation. On success: show brief "Saved (v4)" confirmation inline
next to the Save button. No page reload.

**Preview pane:**
Fetches from `usePromptPreview(key)` whenever the selected prompt changes. Displays
`preview_text` in a read-only `<pre>` block. Auto-refreshes after a successful save.

**Default selection:** `evaluation_system` (or the first key returned by `usePrompts()`
if evaluation_system is not yet seeded — Step 7 seeds it).

### 6.4 Add Prompts section to Settings page

In `frontend/src/pages/Settings.tsx` (or equivalent Settings entry point):

Add a "Prompts" entry to the Settings left navigation. When selected, renders the
`PromptEditor` component in the main content area. The prompts editor occupies the
full width of the content area (the two-column layout is within the PromptEditor).

### 6.5 Write tests

**Backend:**
- GET /api/v1/prompts: returns list of seeded prompts
- GET /api/v1/prompts/{key}: returns active prompt; 404 for unknown key
- POST /api/v1/prompts/{key}/save: version increments; old row deactivated
- GET /api/v1/prompts/{key}/preview: tags stripped; preview_context substituted

**Frontend:**
- PromptEditor renders with dropdown and segments
- Editable segments render as textarea; readonly segments render as muted text
- Save button calls correct API
- Preview pane renders assembled text

### Files touched
- `main.py` — four new prompt API endpoints
- `frontend/src/components/PromptEditor.tsx` (new)
- `frontend/src/types/api.ts` — PromptRecord, PromptListItem, PromptSavePayload, PromptPreviewResult
- `frontend/src/hooks/` — usePrompts, usePrompt, useSavePrompt, usePromptPreview
- `frontend/src/pages/Settings.tsx` — Prompts section added to left nav; PromptEditor rendered
- `tests/routes/` — prompt API endpoint tests

---

## Step 7 — evaluation_system Migration + Multi-Prompt Split 🔲

**Goal:** Move the evaluation_system and evaluation_user prompts from code constants into
the `prompts` table. Split the evaluation pipeline in `evaluator.py` into two sequential
LLM calls — the first commits to role analysis before the second scores. Both calls'
outputs are merged into a single `evaluations` record so all downstream code (UI, API,
DB queries) is unchanged.

**Prerequisite:** Steps 5 and 6 must be complete. The `prompts` table must exist and
the editor must be functional before migrating the evaluation prompts into it.

### 7.1 Define the two sub-prompts

The current single-call evaluation (system + user) becomes four prompt entries in the
`prompts` table:

| prompt_key | Purpose |
|---|---|
| `eval_analysis_system` | Call 1 system: persona + context; instructs archetype/deal-breaker/domain analysis only |
| `eval_analysis_user` | Call 1 user: JD with injection markers; narrow JSON output schema |
| `eval_scoring_system` | Call 2 system: persona + context + instruction to use prior analysis |
| `eval_scoring_user` | Call 2 user: analysis JSON + JD; full evaluation JSON output schema |

**Call 1 output schema** (narrow — 5 fields):
```json
{
  "archetype": "People Leader | Hybrid | Technical Specialist | Functional Leader",
  "has_deal_breaker": true,
  "deal_breaker_description": "Role requires IC coding — excluded in target profile",
  "domain_match": "Same domain | Adjacent domain | Different domain | Wrong domain entirely",
  "role_type_match": "Target match | Adjacent | Function mismatch | Seniority mismatch"
}
```

**Call 2 system prompt** receives Call 1's committed output injected before the scoring
instructions, e.g.:
```
PRIOR ANALYSIS (committed — do not contradict):
{analysis_json}
```

This ensures Call 2 cannot override the archetype or deal-breaker determination.

The `SYSTEM_PROMPT_TEMPLATE` and `EVALUATION_USER_PROMPT` constants in `evaluator.py`
become the factory defaults used for seeding and are **not removed** — they serve as
the fallback if DB records are absent.

### 7.2 Schema migration: `analysis_json` column

In `database.py`, add a delta migration. The application should run this at startup if
the column does not exist:

```python
# In the startup migration block or init_db()
conn.execute("ALTER TABLE evaluations ADD COLUMN analysis_json TEXT")
```

Use `PRAGMA table_info(evaluations)` to check if the column already exists before
attempting the ALTER. Never drop and recreate.

### 7.3 Update `evaluator.py` — two-call pipeline

Add new function `evaluate_with_split(job_id, jd_text, jobsearch_context, model, provider, base_url, max_tokens)`.

**Pipeline:**

```
1. Fetch eval_analysis_system + eval_analysis_user from prompts table
   (fall back to code constants if DB records absent)

2. Assemble Call 1 prompt:
   - system: assemble_prompt(eval_analysis_system) + jobsearch_context injected
   - user: assemble_prompt(eval_analysis_user) with jd_clean injected

3. Call llm_client.complete() → Call 1
   - Write llm_call_log record (call_type='evaluation_analysis', job_id=job_id)
   - If parse fails → write NULL evaluations record; write application_log; return

4. Fetch eval_scoring_system + eval_scoring_user from prompts table

5. Assemble Call 2 prompt:
   - system: assemble_prompt(eval_scoring_system) with jobsearch_context + analysis_json injected
   - user: assemble_prompt(eval_scoring_user) with jd_clean + analysis_json injected

6. Call llm_client.complete() → Call 2
   - Write llm_call_log record (call_type='evaluation_scoring', job_id=job_id)
   - If parse fails → retry once with stricter JSON-only prompt (existing retry contract)
   - If retry also fails → write NULL evaluations record; write application_log; return

7. Merge outputs:
   - evaluations record = Call 2 scoring fields + analysis fields from Call 1
   - evaluations.analysis_json = JSON string of Call 1 output
   - evaluations.llm_call_log_id = Call 2's llm_call_log id

8. Recalculate agg_* fields on jobs table
9. Write application_log entry (type='prompt', llm_call_log_id = Call 2's id)
```

**Retry logic per call:**
- Call 1 failure: fail entire evaluation. Cannot score without committed analysis.
- Call 2 failure: retry once (existing contract). Both-fail: write NULL record.

**`llm_call_log` FK:**
`evaluations.llm_call_log_id` points to **Call 2**'s log record (the scoring call —
this is the primary output). Call 1's log record is traceable via `job_id` on
`llm_call_log` — no additional FK on `evaluations` needed.

### 7.4 Seed prompts at startup

In `main.py` lifespan startup, call `seed_prompt_if_missing` for each of the four
new prompt keys, using the code-level constants (appropriately split and tagged) as
the initial segments_text.

The original `SYSTEM_PROMPT_TEMPLATE` should be split into `eval_analysis_system`
and `eval_scoring_system`. The original `EVALUATION_USER_PROMPT` should be split into
`eval_analysis_user` and `eval_scoring_user`.

Tag the segments of each sub-prompt with `[[EDITABLE]]` / `[[READONLY]]` following
the same editability boundaries documented in `app_docs/prompts/evaluation_system.md`
and `app_docs/prompts/evaluation_user.md`.

Set appropriate `preview_context` for each prompt key.

### 7.5 Rewrite evaluator tests

`tests/test_evaluator.py` requires significant updates. All tests that mock a single
LLM call must be updated to mock two sequential calls.

**Test cases to cover:**
- Successful two-call evaluation: Call 1 returns valid analysis JSON; Call 2 returns valid scoring JSON; merged evaluations record written with all fields correct; analysis_json populated; llm_call_log_id points to Call 2
- Call 1 parse failure: NULL evaluations record written; Call 2 never called; llm_call_log record written for Call 1
- Call 2 parse failure on first attempt: retry triggered with stricter prompt; success on retry → valid record
- Call 2 parse failure on both attempts: NULL evaluations record written
- Fallback to code constants when DB has no prompt records for the eval keys

### Files touched
- `database.py` — `analysis_json` column migration; `seed_prompt_if_missing` calls for four new keys
- `evaluator.py` — `evaluate_with_split()` function; existing evaluate function updated to call it; original constants retained as seeding defaults
- `main.py` — startup seeding for four eval prompt keys
- `tests/test_evaluator.py` — significant rewrite for two-call mocking

---

## Deferred to Phase 2.2

- **Prompt review tool:** Send accumulated `prompt_feedback` records + current prompt
  to a cloud LLM; receive proposed edit diff; user accepts/rejects per segment. Requires
  feedback data accumulated from Step 4.
- **Remaining prompt migrations:** `fill_gaps_system`, `fill_gaps_user`, `org_summary`,
  `profile_chat` fragments, and others. Migrate one at a time following the Step 7 pattern.
- **Evaluate from Job Details (convenience routing):** Pre-fill Evaluate page from
  Job Details with existing job data. Deferred due to interaction with existing duplicate
  detection logic.
- **Prompt review/revert UI:** Version history dropdown and diff view in the prompt editor.
  Table infrastructure exists from Step 5; UI deferred.
