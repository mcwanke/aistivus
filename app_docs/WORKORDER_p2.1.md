# AIstivus — Phase 2.1 Workorder
> Status: In progress
> Last updated: 2026-06-14

---

## Pre-Work

Before starting any step:
- Check `memory/MEMORY.md` for the current test baseline
- Run tests only if no baseline exists
- Each step should end with a passing test run and an updated baseline in memory

**Step order and dependencies:**
- Steps 1–4: complete ✅
- Immediate Fixes (Issue 1 + 2): complete ✅
- Step 5a must complete before Step 5b
- Step 5b must complete before Step 6
- Step 6 builds on the `prompts` table and `prompt_generation.py` from Step 5a

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

> **Note:** The `prompt_feedback` table created in this step is being superseded by the
> `prompt_usage` table in Step 5a. The `EvaluationFeedbackButton` component and UI wiring
> are preserved but will be updated in Step 5a to reference `prompt_usage_id` instead of
> `evaluation_id`/`llm_call_log_id`. The `prompt_feedback` table has not been deployed to
> production and will be cleanly replaced in Step 5a.

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

## Immediate Fixes — Issue 1 + Issue 2 🔲

**Do these before Step 5a. Both are independent of the schema changes.**

### Issue 1 — Overall score missing from Evaluate results

`ResultPanel` in `Evaluate.tsx` renders the four sub-scores (Role, Scope, Culture, Comp)
but does not render `score_overall`, even though it is present in `result.evaluation`.

**Fix:** Add a prominent `score_overall` display above the sub-score grid. It should be
visually distinct — larger or more prominent than the sub-scores — since it is the primary
signal the user looks at first. Sub-scores remain in their current 4-column grid below.

`score_overall` is on a /10 scale. Display as `{score}/10`. If null, display `—`.

No backend changes. No type changes. The field already exists in `EvaluateResponse`.

### Issue 2 — "Rate this evaluation" trigger needs polish

The trigger button in `EvaluationFeedbackButton.tsx` is styled as plain muted text
(`text-xs font-mono text-muted/60`). In `Evaluate.tsx` it sits in a bare `<div>`
above the result panel with no visual container.

**Fix:** Convert the trigger into a small, bordered card-style widget. Requirements:
- Bordered container (not a floating card — keep it subtle, inline with the result flow)
- One short explanation line: something like "Help improve future evaluations by rating
  this result." Muted, small font.
- The trigger button itself is a real button with visible border and hover state — not
  styled text
- "Feedback submitted" state: the card stays visible but the button is replaced by a
  muted confirmation message, so the widget doesn't disappear and cause layout shift

Position: directly above the Post-Action widget (Go To Job | Evaluate Again), which is
itself above the full result panel. The visual order from top to bottom remains:
1. Feedback widget (Issue 2 fix)
2. Post-action widget
3. Full evaluation result

No changes to the modal interior. No backend changes.

### Files touched
- `frontend/src/pages/Evaluate.tsx` — score_overall added to ResultPanel
- `frontend/src/components/EvaluationFeedbackButton.tsx` — trigger restyled as bordered widget

---

## Step 5a — Schema Foundation + prompt_generation.py 🔲

**Goal:** Replace the ad-hoc `prompt_feedback` table with a proper three-layer prompt
data architecture: `prompts` (versioned templates) → `prompt_usage` (per-call instances
with inline feedback) → `llm_call_log` (execution metadata). Centralise all managed
prompt construction in a single `prompt_generation.py` module. This is the foundation
for the feedback loop (Step 5b) and the multi-prompt split (Step 6).

**Prerequisite:** Immediate Fixes must be complete (feedback button UI will be updated
in this step to use the new `prompt_usage_id`).

### 5a.1 New `prompts` table

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

**`prompt_key`:** stable identifier, e.g. `'eval_scoring_system'`, `'eval_scoring_user'`,
`'external_eval'`. Keys for the two-call split (`eval_analysis_system`, etc.) are added
in Step 6.

**`segments_text`:** full prompt text with `[[EDITABLE]]` / `[[/EDITABLE]]` and
`[[READONLY]]` / `[[/READONLY]]` tag markers. Tags are stripped before the prompt is
sent to the LLM. Double-bracket format avoids collision with prompt content.

**`preview_context`:** JSON string mapping variable names to sample values. Only
populated on the `is_active = 1` row; NULL on historical rows.

**`label`:** human-readable name for the editor dropdown. Only populated on the active row.

**`is_active`:** only one row per `prompt_key` may have `is_active = 1`. Enforced in
the application layer (same pattern as `llm_models.default_flag`).

**`version`:** sequential integer per `prompt_key`, managed in the application layer via
`SELECT MAX(version) FROM prompts WHERE prompt_key = ?` + 1.

### 5a.2 Seed known prompt keys into `prompts` at startup

At startup (before migration), seed the following prompt keys if not already present.
The `segments_text` for each is built by wrapping the existing code-level constants
with appropriate `[[EDITABLE]]` / `[[READONLY]]` tags.

| prompt_key | Source constant | File |
|---|---|---|
| `eval_scoring_system` | `SYSTEM_PROMPT_TEMPLATE` | `evaluator.py` |
| `eval_scoring_user` | `EVALUATION_USER_PROMPT` | `evaluator.py` |
| `external_eval` | `EXTERNAL_EVAL_PROMPT_TEMPLATE` | `main.py` |

Keys for the two-call split (`eval_analysis_system`, `eval_analysis_user`,
`eval_scoring_system` revised, `eval_scoring_user` revised) are seeded in Step 6.
The existing single-call constants remain active and functional until Step 6.

### 5a.3 New `prompt_usage` table

Add to `init_db()` in `database.py`:

```sql
CREATE TABLE IF NOT EXISTS prompt_usage (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    prompt_key      TEXT NOT NULL,
    prompt_version  INTEGER NOT NULL,
    prompt_text     TEXT NOT NULL,
    prompt_hash     TEXT NOT NULL,
    source          TEXT NOT NULL DEFAULT 'internal',
    job_id          INTEGER,
    generated_at    TEXT NOT NULL DEFAULT (datetime('now')),
    agree           INTEGER,
    dimension       TEXT,
    feedback_text   TEXT,
    is_consumed     INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (job_id) REFERENCES jobs(id)
)
```

**`source`:** `'internal'` (LLM called by the app) | `'external'` (prompt generated for
copy/paste; no corresponding LLM call on our side).

**`agree`:** NULL until user provides feedback; `1` = agree, `0` = disagree.

**`dimension`:** NULL unless `agree = 0`. Values: `'overall_score'` | `'role_fit'` |
`'recommendation'` | `'strengths_gaps'` | `'general'`.

**`is_consumed`:** `0` = not yet processed by the feedback loop tool; `1` = processed.
Set by the feedback loop trigger in Step 5b. Never set by the user directly.

There is no `UNIQUE` constraint on `prompt_key` in this table — multiple usage records
per prompt key are expected (one per call). Feedback is per usage instance (one agree/
disagree per row). To revise feedback, the row is updated in place; no history is kept.

### 5a.4 Drop `prompt_feedback` table; replace with `prompt_usage`

**Safe to drop:** `prompt_feedback` was introduced in Step 4 but has not been deployed
to the production instance. No real data exists that needs preservation.

In `init_db()`, replace the `prompt_feedback` CREATE TABLE statement with the new
`prompt_usage` CREATE TABLE statement from 5a.3.

Remove the `add_prompt_feedback()` DB function entirely.

### 5a.5 Migrate `llm_call_log` — add FK column

```sql
ALTER TABLE llm_call_log ADD COLUMN prompt_usage_id INTEGER
```

This column is NULL for all existing rows until the migration in 5a.6 backfills it.

### 5a.6 Data migration — backfill `prompt_usage` from `llm_call_log`

Run this migration at startup (once, guarded by checking whether any `prompt_usage`
rows already exist for these records).

**Evaluation call migration:**
```sql
SELECT id, prompt, prompt_hash, job_id FROM llm_call_log
WHERE call_type = 'evaluation' AND prompt IS NOT NULL
```

For each row:
1. INSERT into `prompt_usage`: `prompt_key = 'eval_scoring_system'`, `prompt_version = 1`,
   `prompt_text = row.prompt`, `prompt_hash = row.prompt_hash`, `source = 'internal'`,
   `job_id = row.job_id`
2. UPDATE `llm_call_log SET prompt_usage_id = <new_id> WHERE id = row.id`

**Unmanaged call types** (`generation`, `fill_gaps`, `chat`, etc.): skip. Their
`prompt_usage_id` remains NULL. Their `prompt` and `prompt_hash` data is lost when
those columns are dropped in 5a.7 — this is accepted, as these are not managed prompts.

### 5a.7 Drop deprecated columns from `llm_call_log`

After the migration in 5a.6 is confirmed complete:

```sql
ALTER TABLE llm_call_log DROP COLUMN prompt
ALTER TABLE llm_call_log DROP COLUMN prompt_hash
```

SQLite 3.35+ supports `ALTER TABLE DROP COLUMN`. Confirm no index exists on these
columns before dropping (check `PRAGMA index_list(llm_call_log)`). If an index exists,
it must be dropped first.

These columns must not be referenced in any other table FK or any active index.

### 5a.8 DB functions (database.py)

**Prompts table functions:**

`get_active_prompt(prompt_key: str) -> dict | None`
Returns the active row for the given key (`segments_text`, `preview_context`, `label`,
`version`). Returns `None` if no record exists.

`save_prompt(prompt_key: str, segments_text: str, note: str | None) -> int`
1. `SELECT MAX(version)` for this key → next_version = max + 1 (or 1 if no rows)
2. `SELECT label, preview_context` from current active row (to carry forward)
3. `UPDATE prompts SET is_active = 0 WHERE prompt_key = ?` (deactivate current)
4. INSERT new row with `is_active = 1`, next_version, carried-forward label/preview_context
5. Returns new row id

`get_prompt_history(prompt_key: str) -> list[dict]`
Returns all rows for the key ordered by `version DESC`.

`seed_prompt_if_missing(prompt_key: str, label: str, segments_text: str, preview_context: str | None) -> None`
Checks if any row exists for the key. If not, inserts one with `is_active = 1, version = 1`.
If rows exist, does nothing.

**`assemble_prompt(segments_text: str) -> str`** (utility — `database.py` or `prompt_utils.py`)
Strips all `[[EDITABLE]]`, `[[/EDITABLE]]`, `[[READONLY]]`, `[[/READONLY]]` tags and
returns plain prompt text suitable for LLM use.

```python
import re
return re.sub(r'\[\[/?(?:EDITABLE|READONLY)\]\]', '', segments_text).strip()
```

**Prompt usage functions:**

`create_prompt_usage(prompt_key: str, prompt_version: int, prompt_text: str, prompt_hash: str, source: str, job_id: int | None) -> int`
Inserts a `prompt_usage` row; returns the new `id`.

`update_prompt_feedback(prompt_usage_id: int, agree: int, dimension: str | None, feedback_text: str | None) -> None`
Updates `agree`, `dimension`, `feedback_text` on an existing `prompt_usage` row.
Overwrites in place — no history kept.

`get_prompt_usage(prompt_usage_id: int) -> dict | None`
Returns a single `prompt_usage` row by id. Used to pre-populate feedback UI.

`get_unprocessed_feedback(prompt_key: str) -> list[dict]`
Returns all `prompt_usage` rows for a given `prompt_key` where `agree IS NOT NULL`
and `is_consumed = 0`. Used by the feedback loop trigger.

`mark_feedback_consumed(ids: list[int]) -> None`
Sets `is_consumed = 1` for all given `prompt_usage` ids.

### 5a.9 New `prompt_generation.py`

Single entry point for all managed prompt construction. Only operates on prompts that
exist in the `prompts` table. Unmanaged prompts (fill-gaps, scraping, chat) do not go
through this module.

```python
async def get_prompt(
    prompt_key: str,
    context: dict,
    job_id: int | None = None,
    source: str = 'internal',
) -> dict:
    """
    Look up active prompt for key, assemble full text, substitute context variables,
    write prompt_usage record.

    Returns:
        { 'prompt_text': str, 'prompt_usage_id': int }

    Raises:
        ValueError if no active prompt exists for prompt_key.
    """
```

**Internals:**
1. Call `database.get_active_prompt(prompt_key)` — raise `ValueError` if None
2. Call `database.assemble_prompt(row['segments_text'])` — strip tags
3. Substitute context variables into assembled text (standard `.format(**context)` or
   equivalent; document which keys are expected per prompt_key)
4. Compute `prompt_hash = hashlib.sha256(assembled_text.encode()).hexdigest()`
5. Call `database.create_prompt_usage(prompt_key, row['version'], assembled_text,
   prompt_hash, source, job_id)` → get `prompt_usage_id`
6. Return `{ 'prompt_text': assembled_text, 'prompt_usage_id': prompt_usage_id }`

### 5a.10 Update `evaluator.py`

Replace inline prompt construction with calls to `prompt_generation.get_prompt()`.

Before calling `llm_client.complete()`, call:
```python
result = await prompt_generation.get_prompt(
    'eval_scoring_system',
    context={'jobsearch_context': jobsearch_md},
    job_id=job_id,
    source='internal',
)
prompt_text = result['prompt_text']
prompt_usage_id = result['prompt_usage_id']
```

Pass `prompt_usage_id` through to the `llm_call_log` write (new column from 5a.5).

The original `SYSTEM_PROMPT_TEMPLATE` constant is **retained** as the seeding fallback
(used by `seed_prompt_if_missing` at startup). It is not removed.

### 5a.11 Update external eval route in `main.py`

The `generate_prompt` route handler currently assembles the external eval prompt inline.
Replace with a call to `prompt_generation.get_prompt('external_eval', context, job_id,
source='external')`.

**Add `prompt_usage_id` to the external eval JSON response structure.** The generated
prompt instructs the external LLM to include this field in its JSON response unchanged:

```
IMPORTANT: Your response must be valid JSON matching this exact structure.
Include the prompt_usage_id field exactly as provided — do not modify it.

{
  "prompt_usage_id": {prompt_usage_id},
  "score_overall": ...,
  ...
}
```

**Update the import route** to read `prompt_usage_id` from the pasted JSON. When
present, call `database.get_prompt_usage(prompt_usage_id)` to verify it exists, then
associate the imported evaluation with that usage record (store `prompt_usage_id` on
the evaluation or link as needed).

### 5a.12 Update `EvaluationFeedbackButton`

**Props change:**
```typescript
// Remove:
evaluationId: number
llmCallLogId?: number

// Add:
promptUsageId: number
```

**Payload change in `PromptFeedbackPayload` (types/api.ts):**
```typescript
// Remove: evaluation_id, llm_call_log_id
// Add:
prompt_usage_id: number
```

**Endpoint change:** The component now calls `POST /api/v1/prompt-usage/{id}/feedback`
(new endpoint in 5a.13) instead of `POST /api/v1/prompt-feedback`.

**Old `POST /api/v1/prompt-feedback` endpoint:** Can be removed once the component
is updated and `prompt_feedback` table is dropped.

Update call sites in `Evaluate.tsx` and `JobDetail.tsx` to pass `promptUsageId` from
the evaluation response. The `EvaluateResponse` type gains `prompt_usage_id: number | null`.

### 5a.13 New API endpoints for `prompt_usage`

```
POST /api/v1/prompt-usage/{id}/feedback
```
Body: `{ "agree": 0 | 1, "dimension"?: string, "feedback_text"?: string }`
Calls `database.update_prompt_feedback()`. Rate limiting: 10/min.
Response: `{ "success": true }`

```
GET /api/v1/prompt-usage/{id}
```
Returns a single prompt_usage row. Used to pre-populate feedback UI.

Remove: `POST /api/v1/prompt-feedback` (replaced by above).

### 5a.14 Write tests

**Backend (`test_database.py`):**
- `seed_prompt_if_missing`: seeds when no rows exist; skips when rows exist
- `get_active_prompt`: returns active row; returns None for unknown key
- `save_prompt`: new row at version N+1; old row deactivated; label/preview_context carried forward
- `get_prompt_history`: rows ordered by version DESC
- `assemble_prompt`: tags stripped, content preserved
- `create_prompt_usage`: row inserted, id returned
- `update_prompt_feedback`: agree/dimension/feedback_text updated in place; is_consumed unchanged
- `get_unprocessed_feedback`: returns only rows where agree IS NOT NULL and is_consumed = 0
- `mark_feedback_consumed`: sets is_consumed = 1 for specified ids

**Backend (routes):**
- `POST /api/v1/prompt-usage/{id}/feedback`: updates record; 404 for unknown id
- `GET /api/v1/prompt-usage/{id}`: returns correct row; 404 for unknown id
- Evaluate endpoint response: includes `prompt_usage_id`

**`test_evaluator.py`:**
- Evaluation call creates `prompt_usage` record via `prompt_generation`
- `llm_call_log` record includes `prompt_usage_id`
- `SYSTEM_PROMPT_TEMPLATE` fallback used when no `prompts` DB record exists

**Frontend:**
- `EvaluationFeedbackButton` updated tests: new `promptUsageId` prop; calls new endpoint
- `useSubmitPromptFeedback` hook updated

### Files touched
- `database.py` — `prompts` table; `prompt_usage` table; drop `prompt_feedback`; `add_prompt_usage_id` ALTER; 9 new DB functions; remove `add_prompt_feedback`; `assemble_prompt` utility
- `main.py` — remove `POST /api/v1/prompt-feedback`; new `POST /api/v1/prompt-usage/{id}/feedback`; new `GET /api/v1/prompt-usage/{id}`; update evaluate endpoint response; update external eval route + import route; startup seeding for 3 prompt keys
- `evaluator.py` — replace inline prompt construction with `prompt_generation.get_prompt()`; pass `prompt_usage_id` to call log write
- `prompt_generation.py` (new) — `get_prompt()` async function
- `frontend/src/types/api.ts` — update `PromptFeedbackPayload`; add `prompt_usage_id` to `EvaluateResponse`; remove old payload fields
- `frontend/src/components/EvaluationFeedbackButton.tsx` — props updated; endpoint updated
- `frontend/src/hooks/useEvaluate.ts` — update `useSubmitPromptFeedback` to call new endpoint
- `frontend/src/pages/Evaluate.tsx` — pass `promptUsageId` to feedback button
- `frontend/src/pages/JobDetail.tsx` — pass `promptUsageId` to feedback button in external eval flow
- `frontend/src/components/EvaluationFeedbackButton.test.tsx` — updated tests
- `tests/test_database.py` — new tests for all new DB functions
- `tests/routes/` — new/updated tests for prompt-usage endpoints

---

## Step 5b — Prompt Editor UI + Feedback Loop Trigger 🔲

**Goal:** Surface the `prompts` table in the Settings UI so the user can view and edit
AI prompts through a segmented editor. Add a feedback loop trigger button that gathers
unprocessed feedback for a prompt, sends it to a cloud LLM with the prompt text, returns
improvement suggestions, and marks feedback as consumed.

**Prerequisite:** Step 5a complete.

### 5b.1 New API endpoints for prompt management

```
GET  /api/v1/prompts
GET  /api/v1/prompts/{key}
POST /api/v1/prompts/{key}/save
GET  /api/v1/prompts/{key}/preview
POST /api/v1/prompts/{key}/feedback-loop
```

**`GET /api/v1/prompts`**
Returns list of all prompt keys that have at least one record:
```json
[{ "prompt_key": "eval_scoring_system", "label": "Evaluation — Scoring", "version": 3 }]
```

**`GET /api/v1/prompts/{key}`**
Returns the active prompt:
```json
{
  "prompt_key": "...", "label": "...", "version": 3,
  "segments_text": "...", "preview_context": "..."
}
```
404 if key not found.

**`POST /api/v1/prompts/{key}/save`**
Body: `{ "segments_text": "...", "note": "optional note" }`
Calls `database.save_prompt()`. Returns `{ "success": true, "version": 4 }`.

**`GET /api/v1/prompts/{key}/preview`**
Assembles the prompt via `assemble_prompt()`, substitutes `preview_context` sample values.
Returns `{ "preview_text": "..." }`.

**`POST /api/v1/prompts/{key}/feedback-loop`**
Feedback loop trigger. Full flow:
1. Call `database.get_unprocessed_feedback(prompt_key)` — collect all rows where
   `agree IS NOT NULL` and `is_consumed = 0`
2. If no rows found: return `{ "success": false, "reason": "no_feedback" }`
3. Fetch active prompt text via `database.get_active_prompt(prompt_key)` + `assemble_prompt()`
4. Build a prompt for the cloud LLM:
   - System: explain the task (reviewing prompt feedback to suggest improvements)
   - User: [current prompt text] + [list of feedback records: agree/dimension/feedback_text]
5. Send to cloud LLM via `llm_client.complete()` (provider/model from default `llm_models`
   record with preference for the highest-capability available model)
6. Call `database.mark_feedback_consumed(ids)` — mark all collected rows as consumed
7. Return `{ "success": true, "suggestions": "<LLM response text>", "feedback_count": N }`

Rate limiting on feedback-loop endpoint: 2/min (this is an expensive call).

### 5b.2 Frontend types and hooks

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

interface FeedbackLoopResult {
  success: boolean
  suggestions?: string
  feedback_count?: number
  reason?: string
}
```

Add hooks in `frontend/src/hooks/`:
- `usePrompts()` — GET /api/v1/prompts
- `usePrompt(key: string)` — GET /api/v1/prompts/{key}
- `useSavePrompt(key: string)` — POST mutation
- `usePromptPreview(key: string)` — GET /api/v1/prompts/{key}/preview
- `useFeedbackLoop(key: string)` — POST mutation for feedback loop trigger

### 5b.3 PromptEditor component

New component: `frontend/src/components/PromptEditor.tsx`

**Layout:**

```
┌─ Header row ──────────────────────────────────────────────────────────┐
│  [ Prompt: Evaluation — Scoring ▼ ]    v3    [ Run Feedback Loop ]  [ Save ]  │
├─ Left column (editor) ────────────────┬─ Right column (preview) ──────┤
│                                       │                               │
│  [[ READONLY segment — muted ]        │  Fully assembled prompt       │
│                                       │  with sample values           │
│  ┌───────────────────────────────┐    │  substituted in.              │
│  │ EDITABLE segment (textarea)   │    │                               │
│  └───────────────────────────────┘    │  Read-only.                   │
│                                       │                               │
│  [[ READONLY segment — muted ]        │                               │
│                                       │                               │
│  ┌───────────────────────────────┐    │                               │
│  │ EDITABLE segment (textarea)   │    │                               │
│  └───────────────────────────────┘    │                               │
│                                       │                               │
│  [Feedback loop suggestions panel]    │                               │
└───────────────────────────────────────┴───────────────────────────────┘
```

**Segment parsing:**
Parse `segments_text` by splitting on `[[EDITABLE]]`, `[[/EDITABLE]]`, `[[READONLY]]`,
`[[/READONLY]]` tags. Each segment renders as either a `<textarea>` (editable, full
width, auto-height) or a muted `<div>` (readonly). Order of segments preserved.

**Save behavior:**
Reassemble `segments_text` from current values in correct order. Call `useSavePrompt()`.
On success: inline "Saved (v4)" confirmation next to the Save button. No page reload.
Preview pane auto-refreshes after successful save.

**Preview pane:**
Fetches from `usePromptPreview(key)` whenever the selected prompt changes. Displays
`preview_text` in a read-only `<pre>` block with the same monospace font used elsewhere.

**Feedback Loop button:**
Calls `useFeedbackLoop(key)` mutation. While pending: button shows spinner + "Running…".
On success: if `feedback_count = 0`, show "No unprocessed feedback for this prompt."
Otherwise: show `suggestions` text in an expandable panel below the editor (not a modal).
The suggestions panel has a "Dismiss" button to hide it. The panel is not editable —
it's a read-only suggestion the user can refer to while editing segments.

**Default selection:** First key returned by `usePrompts()`. After Step 6 seeds the
eval prompts, `eval_scoring_system` will be the primary entry.

### 5b.4 Add Prompts section to Settings

In `frontend/src/pages/Settings.tsx`, add "Prompts" to the Settings navigation.
When selected, renders `PromptEditor` in the main content area at full width.

### 5b.5 Write tests

**Backend:**
- `GET /api/v1/prompts`: returns seeded prompts list
- `GET /api/v1/prompts/{key}`: returns active prompt; 404 for unknown key
- `POST /api/v1/prompts/{key}/save`: version increments; old row deactivated
- `GET /api/v1/prompts/{key}/preview`: tags stripped; preview_context substituted
- `POST /api/v1/prompts/{key}/feedback-loop`: returns `no_feedback` when none unprocessed; calls LLM and marks consumed when feedback exists (mock LLM)

**Frontend:**
- PromptEditor renders with dropdown and correct segments
- Editable segments render as textarea; readonly segments render as muted text
- Save button calls correct API; confirmation message appears
- Preview pane renders assembled text
- Feedback loop button calls endpoint; suggestions panel renders on success

### Files touched
- `main.py` — five new prompt API endpoints; feedback loop handler
- `frontend/src/components/PromptEditor.tsx` (new)
- `frontend/src/types/api.ts` — new types
- `frontend/src/hooks/` — usePrompts, usePrompt, useSavePrompt, usePromptPreview, useFeedbackLoop
- `frontend/src/pages/Settings.tsx` — Prompts section + PromptEditor
- `tests/routes/` — prompt API endpoint tests

---

## Step 6 — Multi-Prompt Split 🔲

**Goal:** Move the evaluation prompts from code constants into the `prompts` table. Split
the single evaluation LLM call in `evaluator.py` into two sequential calls — the first
commits to role analysis; the second scores using those committed outputs. Both calls'
results are merged into a single `evaluations` record so all downstream code is unchanged.

**Prerequisite:** Step 5b must be complete. The `prompts` table and `prompt_generation.py`
must be operational before migrating the evaluation prompts into them.

### 6.1 Define the four sub-prompt keys

| prompt_key | Purpose |
|---|---|
| `eval_analysis_system` | Call 1 system: persona + context; archetype/deal-breaker/domain analysis only |
| `eval_analysis_user` | Call 1 user: sanitised JD with injection markers; narrow JSON output schema |
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
instructions:
```
PRIOR ANALYSIS (committed — do not contradict):
{analysis_json}
```

This ensures Call 2 cannot override the archetype or deal-breaker determination.

### 6.2 Schema migration: `analysis_json` column

```python
conn.execute("ALTER TABLE evaluations ADD COLUMN analysis_json TEXT")
```

Use `PRAGMA table_info(evaluations)` to check if the column already exists before
attempting the ALTER. Guard this in the startup migration block — never in `init_db()`.

### 6.3 Update `evaluator.py` — two-call pipeline

Add `evaluate_with_split(job_id, jd_text, jobsearch_context, model, provider, base_url, max_tokens)`.

**Pipeline:**
```
1. Call prompt_generation.get_prompt('eval_analysis_system', context, job_id)
   Call prompt_generation.get_prompt('eval_analysis_user', context, job_id)

2. Call llm_client.complete() → Call 1
   Write llm_call_log (call_type='evaluation_analysis', prompt_usage_id from step 1)
   If parse fails → write NULL evaluations record; write application_log; return

3. Call prompt_generation.get_prompt('eval_scoring_system', context + {analysis_json}, job_id)
   Call prompt_generation.get_prompt('eval_scoring_user', context + {analysis_json}, job_id)

4. Call llm_client.complete() → Call 2
   Write llm_call_log (call_type='evaluation_scoring', prompt_usage_id from step 3)
   If parse fails → retry once with stricter JSON-only prompt (existing retry contract)
   Both fail → write NULL evaluations record; return

5. Merge outputs:
   - evaluations fields = Call 2 scoring + analysis fields from Call 1
   - evaluations.analysis_json = JSON string of Call 1 output
   - evaluations.llm_call_log_id = Call 2's llm_call_log id

6. Recalculate agg_* on jobs
7. Write application_log (type='prompt', llm_call_log_id = Call 2's id)
```

**Failure contract:**
- Call 1 failure: fail entire evaluation. Cannot score without committed analysis.
- Call 2 failure: retry once (existing contract). Both fail → write NULL record.

**`llm_call_log` FK:** `evaluations.llm_call_log_id` points to Call 2. Call 1 traceable
via `job_id` on `llm_call_log`. No additional FK on `evaluations`.

The original `SYSTEM_PROMPT_TEMPLATE` constant is **retained** as the seeding fallback
and is not removed. It is superseded operationally by the DB-driven prompts.

### 6.4 Seed the four new prompt keys at startup

In `main.py` lifespan startup, call `seed_prompt_if_missing` for each of the four
keys listed in 6.1. The `segments_text` for each is derived by splitting the existing
`SYSTEM_PROMPT_TEMPLATE` and `EVALUATION_USER_PROMPT` constants appropriately and
wrapping segments with `[[EDITABLE]]` / `[[READONLY]]` tags.

The older single-call keys (`eval_scoring_system`, `eval_scoring_user`) seeded in Step 5a
remain in the `prompts` table as inactive historical records — they are no longer used
by the evaluation pipeline once Step 6 is complete.

### 6.5 Rewrite evaluator tests

`tests/test_evaluator.py` requires significant updates. All tests mocking a single LLM
call must be updated to mock two sequential calls.

**Test cases to cover:**
- Successful two-call evaluation: Call 1 returns valid analysis JSON; Call 2 returns
  valid scoring JSON; merged `evaluations` record written; `analysis_json` populated;
  `llm_call_log_id` points to Call 2
- Call 1 parse failure: NULL record written; Call 2 never called
- Call 2 parse failure on first attempt: retry triggered; success on retry → valid record
- Call 2 parse failure on both attempts: NULL record written
- Fallback to code constants when `prompts` table has no records for the eval keys

### Files touched
- `database.py` — `analysis_json` column delta migration (startup guard)
- `evaluator.py` — `evaluate_with_split()` function; main evaluate path updated to call it; original constants retained
- `main.py` — startup seeding for four new eval prompt keys
- `tests/test_evaluator.py` — significant rewrite for two-call mocking

---

## Deferred to Phase 2.2

- **Prompt review UI:** Version history dropdown and diff view in the prompt editor.
  Table infrastructure exists from Step 5a; UI deferred.
- **Feedback display to user:** Viewing existing feedback on past evaluations. Deferred
  pending the multi-prompt architecture being stable (evaluation rows may link to multiple
  prompt_usage records after Step 6, changing the display logic).
- **Remaining prompt migrations:** `fill_gaps_system`, `fill_gaps_user`, `org_summary`,
  and other currently-unmanaged prompts. Migrate one at a time following the Step 6 pattern.
- **Profile chat prompts:** Profile section chat uses fragment-based prompts per section.
  Excluded from the managed-prompt system — chat prompts are not stored, versioned, or
  run through `prompt_generation.py`.
