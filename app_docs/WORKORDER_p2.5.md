# AIstivus — Phase 2.5 Workorder
> Pass 1 Status: COMPLETE — 666 backend / 298 frontend passing
> Pass 2 Status: IN PROGRESS — Steps 1–5 complete (2026-06-29); Steps 6–10 next
> Last updated: 2026-06-29

---

## Goal

Phase 2.5 delivers a major rework of the job detail UI and the introduction of a structured
multi-prompt application workflow. Work is split into two passes:

**Pass 1 (this workorder): UI Restructure + Stub**
- Rename and reorganize the job detail tab/subpage structure
- Introduce the Apply Workflow subpage as the central hub for application actions
- Rework the App Details Summary page
- Move Evaluations and split Resume/Cover into their own subpages under the APPLY tab
- Retire the RESUME / COVER tab
- Settings and Jobs page improvements
- All new workflow buttons are no-ops in this pass — wired in Pass 2

**Pass 2 (deferred): Backend + Button Wiring**
- New evaluation scoring schema (9 dimensions, 3 composites) — backend + DB migration
- Internal eval prompt redesign to match new schema
- External eval prompt promotion from draft to production
- Company research prompt promotion from draft to production
- Pass 1 / Pass 2 / Pass 3 resume generation backend wiring
- Cover letter workflow design and implementation

**Motivation:** The current job detail view mixes application tracking, evaluation, and
document generation across tabs with no clear workflow structure. The goal is to surface
a clear sequence — research → evaluate → decide → generate — so the user has a single
place to drive an application from first look to submitted materials.

---

## Pre-Work

- Read `memory/MEMORY.md` before starting
- Check `memory/ERRORS.md` before suggesting approaches
- Read current `JobDetail.tsx` in full before Step 1 — the tab/subpage structure is complex
  and the implementer must understand it before restructuring
- Identify the current filter state location in the Jobs page before Step 7
- Test baseline at design time: 660 backend / 282 frontend

---

## Target Structure (reference throughout all steps)

When Phase 2.5 Pass 1 is complete, the job detail tabbed view should look like this:

```
TAB: JOB DETAILS
  LEFTNAV: Job Details Summary     (no changes)
  LEFTNAV: Job Description         (no changes)
  LEFTNAV: Company Info            (no changes)
  LEFTNAV: Job Actions             (no changes)

TAB: APPLY                         (renamed from APPLICATION)
  LEFTNAV: Application Details     (renamed from App Details Summary; reworked)
  LEFTNAV: Apply Workflow          (new subpage)
  LEFTNAV: Evaluations             (moved from JOB DETAILS tab)
  LEFTNAV: Resume                  (split from RESUME / COVER tab)
  LEFTNAV: Cover Letter            (split from RESUME / COVER tab)
  LEFTNAV: Add App Note/Comms      (no changes)
  LEFTNAV: Application Questions   (no changes)
  LEFTNAV: Add Lesson              (no changes)

TAB: RESUME / COVER               (removed — content migrated above)

TAB: INTERVIEW                    (no changes)
TAB: APPLICATION LOG              (no changes)
```

---

## Step 1 — Navigation Restructure ✓ COMPLETE

**Goal:** Establish the new tab and subpage shell. No content changes yet — this step
moves and renames structural elements only. All subsequent steps fill in content.

### 1.1 Rename APPLICATION tab → APPLY

Find the tab label for the APPLICATION tab in `JobDetail.tsx` (or whatever component
owns tab rendering) and rename it to `APPLY`.

### 1.2 Remove RESUME / COVER tab

Remove the RESUME / COVER tab from the tab list. Its content is not deleted here — it
is migrated in Steps 4 and 5.

### 1.3 Update APPLY tab subpage list

Under the APPLY tab, establish the full subpage list per the target structure above:
- `Application Details` (rename of existing `App Details Summary`)
- `Apply Workflow` (new — empty shell for now, filled in Step 5)
- `Evaluations` (placeholder — moved in Step 3)
- `Resume` (placeholder — split in Step 4)
- `Cover Letter` (placeholder — split in Step 4)
- `Add App Note/Comms` (no changes, preserve existing)
- `Application Questions` (no changes, preserve existing)
- `Add Lesson` (no changes, preserve existing)

### 1.4 Remove Change Application Status subpage

Remove `Change Application Status` from the JOB DETAILS or APPLY subpage list —
its functionality moves into Application Details in Step 2.

### Files touched
- `frontend/src/pages/JobDetail.tsx` (or equivalent tab/subpage router component —
  identify during implementation)

### Implementation notes
- `TabId` type: `'job-details' | 'apply' | 'interview' | 'application-log'`
- `AppAction` type: 8 items including new `apply-workflow`, `resume`, `cover-letter` stubs
- RESUME/COVER tab removed from tab list and all rendering branches
- 19 DocRow tests removed from `JobDetail.test.tsx` — will be rewritten in Pass 2

---

## Step 2 — Application Details Rework ✓ COMPLETE

**Goal:** Condense the existing App Details Summary into a cleaner row layout and absorb
the Change Application Status functionality into the same page. Rename the subpage to
`Application Details`.

### 2.1 Row layout

Replace the existing field layout with the following row structure:

```
Row 1:
| STATUS (label)      APPLY BUTTON      APPLY URL (label)         |
| [status value]      [I APPLIED! btn]  [url value — clickable]   |

Row 2:
| APPLY DATE (label)    REQUESTED SALARY (label)    END DATE (label)    SAVE  |
| [date edit field]     [text input]                [date edit field]   [btn] |

Row 3:
| CHANGE STATUS (label)   |
| [status dropdown]       |

Row 4:
| REASON FOR CHANGE (OPTIONAL) (label)   |
| [text input]                           |

Row 5:
| SAVE   |
| [btn]  |
```

**Row 1 notes:**
- STATUS label and value are display-only (read current status)
- APPLY button: shows `I APPLIED!` before application recorded; shows disabled
  `APPLIED ✓` state after. Existing behavior — preserve it.
- APPLY URL: clickable link. Existing behavior — preserve it.

**Row 2 notes:**
- Apply date, requested salary, end date — existing fields, just repositioned
- Row 2 SAVE writes apply date, requested salary, and end date only

**Row 3–5 notes:**
- This is the former Change Application Status functionality, now inline
- Row 3 SAVE (row 5) is **disabled** until the dropdown shows a status different
  from the current status. Enable it only when a change is pending.
- When row 5 SAVE is clicked, apply the status change (with reason if provided),
  then reset the dropdown back to the new current status and re-disable the button.

### 2.2 Remove Change Application Status subpage content

The standalone Change Application Status subpage component can be deleted once its
functionality is confirmed working inline. Do not delete it until the inline version
is verified.

### Files touched
- `frontend/src/pages/JobDetail.tsx` (or the Application Details subpage component)
- Change Application Status subpage component — delete after verification

### Implementation notes
- Merged `details` + `change-status` into single `application-details` view inline in `ApplicationRight`
- 5-row layout implemented with controlled state: `applyDate`, `endDate`, `requestedSalary`, `detailsSaved`
- Status change: `selectedStatus` + `statusReason` state; Save disabled until `statusChanged` computed value is true
- Old `change-status` subpage removed from `AppAction` type and nav list

---

## Step 3 — Move Evaluations Subpage ✓ COMPLETE

**Goal:** Move the Evaluations subpage from JOB DETAILS to APPLY. Remove the three
action buttons from this subpage — they move to the Apply Workflow page in Step 5.

### 3.1 Move subpage

Relocate the Evaluations subpage from the JOB DETAILS tab to the APPLY tab, per the
target structure. The subpage content (scores, eval rows, pagination if any) moves
as-is — do not change any data display or row layout.

### 3.2 Remove action buttons from Evaluations subpage

Remove these three buttons from the Evaluations subpage view:
- `Re-Run Internal Eval`
- `Generate External Eval`
- `Import External Eval`

These buttons are not deleted — they appear on the Apply Workflow page (Step 5)
with their existing wired handlers.

### Files touched
- `frontend/src/pages/JobDetail.tsx` (subpage routing)
- Evaluations subpage component (identify during implementation)

### Implementation notes
- Evaluations subpage rendering moved from `JobDetailsRight` into `ApplicationRight`
- `evaluations: EvalWithMeta[]` prop added to `ApplicationRightProps`
- Three action buttons (Re-Run Internal Eval, Generate External Eval, Import External Eval) removed from Evaluations view
- Handlers (`navigate`, `generatePrompt`, `importMutation`) remain at page level — will be wired to Apply Workflow in Step 5
- `JobDetailsAction` type and nav list: `evaluations` removed

---

## Step 4 — Resume / Cover Split ✓ COMPLETE

**Goal:** Split the existing RESUME / COVER tab content into two separate subpages
(`Resume` and `Cover Letter`) under the APPLY tab. Remove the GENERATE and
NEW FROM TEMPLATE sections from both. Keep UPLOAD in both.

### 4.1 Resume subpage

Copy the RESUME / COVER page structure into a Resume subpage. Make these changes:
- Remove the `GENERATE` label and both generate prompt buttons
- Remove the `NEW FROM TEMPLATE` label and both template buttons
- Remove the file type dropdown from UPLOAD (no longer needed — this page is resume-only)
- Show only resume-type files in the file list (filter out cover letter files)
- Remove the `resume` type label prefix from file rows (it's redundant on a resume-only page)

### 4.2 Cover Letter subpage

Copy the same structure into a Cover Letter subpage. Make these changes:
- Same removals as 4.1 (GENERATE, NEW FROM TEMPLATE, file type dropdown)
- Show only cover letter-type files in the file list
- Remove the `cover` type label prefix from file rows

### 4.3 Clean up

Once both subpages are verified, the original RESUME / COVER tab component can be
removed. The tab itself was removed in Step 1.

### Files touched
- `frontend/src/pages/JobDetail.tsx` — removed `DocRow`, `ResumeCoverTab`, document hook imports, `useGenerateResumePrompt`/`useGenerateCoverPrompt`; added `ResumeSubpage`/`CoverLetterSubpage` imports; updated `ApplicationRightProps`
- `frontend/src/components/DocRow.tsx` (new — extracted from JobDetail; type badge removed)
- `frontend/src/components/ResumeSubpage.tsx` (new — upload + resume-filtered doc list)
- `frontend/src/components/CoverLetterSubpage.tsx` (new — upload + cover-filtered doc list)
- `frontend/src/types/api.ts` — added `EvalWithMeta` named export
- Original `ResumeCoverTab` component deleted; `DocRow` moved to its own file

---

## Step 5 — Apply Workflow Subpage ✓ COMPLETE

**Goal:** Build the Apply Workflow subpage. This is the central hub for the application
workflow. Eval action buttons are wired to their existing handlers. All Pass 1/2/3
buttons are no-ops in this pass.

### 5.1 Evaluations summary block

```
EVALUATIONS
COUNT        SCREENABILITY    COMPANY FIT    CANDIDATE FIT
[X evals]    [stub: —]        [stub: —]      [stub: —]
[Re-Run Internal Eval btn] [Generate External Eval btn] [Import External Eval btn]

Review Evaluations →   (link to Evaluations subpage)
─────────────────────────────────────────────────────
```

- Score labels and composite names: `SCREENABILITY`, `COMPANY FIT`, `CANDIDATE FIT`
  (new 9-dim structure). Display `—` for values in this pass — wired in Pass 2.
- Eval count: can read from existing evaluations data if available; otherwise `—`
- The three action buttons (`Re-Run Internal Eval`, `Generate External Eval`,
  `Import External Eval`) keep their existing wired handlers from the Evaluations subpage.
- `Review Evaluations →` navigates to the Evaluations subpage within APPLY.

### 5.2 Resume generation block

```
─────────────────────────────────────────────────────
RESUME GENERATION

Pass 1    [Generate First Pass .typ Prompt]
UPLOAD .TYP RESUME    [BROWSE btn]  [filename or "No file selected"]  [UPLOAD btn]
          [Pass 1 description: "Generate the initial tailored resume draft"]
Review Resumes →   (link to Resume subpage)

Pass 2    [Generate Recruiter Review Pass Prompt]
IMPORT REVIEW PASS FEEDBACK [IMPORT btn]  ADD FEEDBACK [ADD FEEDBACK btn]  REVIEW FEEDBACK [REVIEW FEEDBACK btn]
          [Pass 2 description: "Evaluate the draft resume and generate a correction list"]

Pass 3    [Generate Final Pass .typ Prompt]
          [Pass 3 description: "Apply corrections and produce the final resume"]
─────────────────────────────────────────────────────
```

**No-op buttons (do nothing on click, this pass):**
- `Generate First Pass .typ Prompt`
- `Generate Recruiter Review Pass Prompt`
- `Generate Final Pass .typ Prompt`
- `IMPORT` (Pass 2 feedback import)
- `ADD FEEDBACK`
- `REVIEW FEEDBACK`

**Wired (existing functionality, moved from Resume/Cover):**
- `BROWSE` and `UPLOAD` — reuse existing upload handler

**`REVIEW FEEDBACK` button:** Disabled by default. Will be enabled in Pass 2 when
feedback data exists for the job. For now: always disabled.

**`Review Resumes →`:** Navigates to the Resume subpage within APPLY.

### Files touched
- `frontend/src/pages/JobDetail.tsx` — wired `ApplyWorkflow` stub; added `typstAvailable`, `onImportEval`, `onSelectAction` to `ApplicationRightProps`
- `frontend/src/components/ApplyWorkflow.tsx` (new) — eval block + resume generation block; `Re-Run` as Link to /evaluate; `Generate External Eval` calls `useGeneratePrompt` with local PromptModal; `Import External Eval` calls `onImportEval` prop

---

## Step 6 — Settings Changes ✓ COMPLETE

**Goal:** Move the TYPST block in Settings from the Storage subpage to the System Info
subpage. Add a read-only fonts list block to System Info.

### 6.1 Move TYPST block

In the Settings page, locate the TYPST block (currently under the Storage subpage).
Move it to the System Info subpage. Content and functionality do not change.

### 6.2 Add fonts list block

In the System Info subpage, add a new read-only display block after the TYPST block:

```
AVAILABLE TYPST FONTS
[font name 1]
[font name 2]
...
```

This block lists all fonts found in the user fonts folder at startup. It is display-only —
no actions. If no fonts are found, show "No fonts found in fonts folder."

The font list data must come from a backend endpoint. Either:
- Add a field to the existing system info endpoint (preferred if one exists), or
- Add a new `GET /api/v1/system/fonts` endpoint that returns `{ fonts: string[] }`

Identify the appropriate backend hook during implementation. The backend font discovery
logic reads the user fonts directory (path from config) and returns a list of font names.

### Implementation notes
- TYPST block moved to `InfoSection`; sources `typst_available`/`typst_binary` from existing `useDocumentsStorage` hook — no endpoint change needed
- `GET /api/v1/system/fonts` added to `main.py`; reads `app.state.typst_fonts_dir`, returns sorted non-hidden filenames
- `SystemFontsResponse` added to `frontend/src/types/api.ts`
- `useSystemFonts` added to `frontend/src/hooks/useSettings.ts`
- `DocumentStorageSection` (Storage tab) now shows Generated files only

### Files touched
- `main.py` — new `GET /api/v1/system/fonts` endpoint; route map updated
- `frontend/src/types/api.ts` — `SystemFontsResponse` added
- `frontend/src/hooks/useSettings.ts` — `useSystemFonts` added
- `frontend/src/pages/Settings.tsx` — `InfoSection` updated (TYPST + fonts blocks); `DocumentStorageSection` TYPST block removed

---

## Step 7 — Persistent Filters on Jobs Page ✓ COMPLETE

**Goal:** Filter state on the Jobs page survives navigation within the app session.
Default filter matches the current default behavior.

### 7.1 Lift filter state

Currently the Jobs page filter state is local to the Jobs page component. Lift it to
a parent component or React context so it survives when the user navigates away and
returns within the same session.

Identify the current filter state location before implementing. The right lift point
is the nearest ancestor that persists across route changes — likely the app root or
a layout component.

### 7.2 Default filter state

```
Not Applied  → selected (ON)
Applied      → selected (ON)
In Process   → selected (ON)
Closed Out   → deselected (OFF)
```

This matches the current default. The lifted state initializes with these values and
persists any user changes for the duration of the session. Opening a new browser tab
resets to default.

### Files touched
- `frontend/src/pages/Jobs.tsx`

### Implementation notes
- Module-level singleton vars `_sort`, `_filters`, `_search` persist state within the same browser tab/session
- `useState` initializes from these vars; handlers write back before calling state setter
- No localStorage (forbidden by CLAUDE.md); no shared Layout component to lift to
- New tab or page refresh resets to defaults — matches spec

---

## Step 8 — Tests ✓ COMPLETE

**Goal:** Keep the test suite green after restructuring. No new backend tests are
needed for this pass (no new backend logic). Frontend tests for moved or renamed
components will need updating.

### 8.1 Frontend

After each step, check for broken frontend tests caused by:
- Renamed or moved components
- Removed buttons that tests were asserting on
- Subpage navigation changes

Update test files to reflect new component names and locations. Do not delete tests
for functionality that still exists — only remove tests for deleted functionality
(e.g., the Change Application Status standalone subpage, the RESUME/COVER tab).

### 8.2 Backend

The fonts endpoint added in Step 6 should have a basic test:
- `test_system_fonts_returns_list` — assert response is a list (empty or populated)

### Files touched
- Any frontend test files affected by Steps 1–7
- `tests/routes/` — new test file for fonts endpoint (Step 6)

---

## Deferred to Pass 3

- **Internal eval prompt redesign** — in-app LLM call prompt needs full rewrite to produce
  9-dim JSON output; separate design session required before implementation
- **Resume generation** — 3-pass approach needs redesign; dedicated design session required
  before any implementation; Apply Workflow Pass 1/2/3 buttons remain no-ops in Pass 2
- **Cover letter workflow** — design + implementation; not yet designed
- **Pass 2/3 resume prompt drafts** — blocked on resume design session

---

## Phase 2.5 — Pass 2: Scoring Redesign + Research + External Eval

> Status: IN PROGRESS — Steps 1–5 complete; Steps 6–10 next
> Test baseline at start: 666 backend / 298 frontend
> Test baseline after Steps 1–5: 671 backend / 298 frontend

### Goal

Pass 2 delivers the new 9-dimension evaluation schema, the company research workflow,
external evaluation prompt promotion, and the scoring framework with user-configurable
weights. The Apply Workflow page is fully wired for research and evaluation steps.

Internal eval prompt redesign, resume generation, and cover letter are deferred to Pass 3.

---

### Pre-Work

- Read `memory/MEMORY.md` and check `memory/ERRORS.md` before starting
- Read `database.py` `init_db()` in full before Step 1 — understand existing `evaluations`
  and `jobs` table structure before writing any ALTER TABLE statements
- Read `evaluator.py` in full before Step 9 — understand the current parse/write/log flow
- Read `frontend/src/pages/Settings.tsx` before Step 8 — identify existing subpages;
  determine whether "App Settings" subpage already exists
- Read `frontend/src/components/ApplyWorkflow.tsx` before Step 7
- Verify `jobs` table has `website_url`, `location`, `pay_band` columns (confirmed in
  design session; double-check before wiring variable injection in Steps 4/5)
- Test baseline at start: 666 backend / 298 frontend

---

### Step 1 — DB Migration ✓ COMPLETE

**Goal:** Add new columns to `evaluations`, create `job_research` table, create `app_settings`
table. All changes are delta migrations — no drops, no recreates.

#### 1.1 — `evaluations` table: new columns

```sql
ALTER TABLE evaluations ADD COLUMN score_ats INTEGER;
ALTER TABLE evaluations ADD COLUMN score_recruiter_fast INTEGER;
ALTER TABLE evaluations ADD COLUMN score_recruiter_deep INTEGER;
ALTER TABLE evaluations ADD COLUMN score_candidate_role INTEGER;
ALTER TABLE evaluations ADD COLUMN score_candidate_scope INTEGER;
ALTER TABLE evaluations ADD COLUMN score_candidate_culture INTEGER;
ALTER TABLE evaluations ADD COLUMN interview_prep_notes TEXT;
ALTER TABLE evaluations ADD COLUMN score_reasons TEXT;        -- JSON blob
ALTER TABLE evaluations ADD COLUMN research_confidence TEXT;  -- 'high'|'medium'|'low'|'none'
ALTER TABLE evaluations ADD COLUMN composite_screenability REAL;
ALTER TABLE evaluations ADD COLUMN composite_company_fit REAL;
ALTER TABLE evaluations ADD COLUMN composite_candidate_fit REAL;
```

**Retained, not dropped:** `score_comp`, `domain_match`, `role_type_match` — legacy data only;
no longer populated for new-schema evals.

**Reused with shifted meaning:** `score_role_fit`, `score_scope_fit`, `score_culture` — column
names unchanged; now explicitly the company-lens view (was blended in prior schema).

#### 1.2 — `job_research` table

```sql
CREATE TABLE IF NOT EXISTS job_research (
    id                       INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id                   INTEGER NOT NULL REFERENCES jobs(id),
    raw_json                 TEXT,     -- full JSON blob; injected as {research_context} in eval prompt
    research_summary         TEXT,
    company_overview         TEXT,
    company_stage            TEXT,     -- 'public|private-series-X|private-early|bootstrap|nonprofit|unknown'
    company_size_actual      TEXT,
    company_trajectory       TEXT,     -- 'growing|stable|declining|unclear'
    company_culture_overview TEXT,
    culture_signals          TEXT,     -- JSON blob
    comp_signals             TEXT,     -- JSON blob
    role_context             TEXT,     -- JSON blob
    interview_process        TEXT,
    red_flags                TEXT,     -- JSON array
    green_flags              TEXT,     -- JSON array
    research_confidence      TEXT,     -- 'high'|'medium'|'low'
    research_notes           TEXT,
    imported_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

No unique constraint on `job_id` — multiple records per job allowed (user may re-run research
later). Always read most recent by `imported_at DESC`.

#### 1.3 — `app_settings` table

```sql
CREATE TABLE IF NOT EXISTS app_settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

Seed defaults on `init_db()` — INSERT only if key does not already exist:
```
eval_weight_screenability  →  '0.40'
eval_weight_company_fit    →  '0.30'
eval_weight_candidate_fit  →  '0.30'
```

#### Files touched
- `database.py` — `init_db()`: ALTER TABLE statements, new table DDL, `app_settings` seed

---

### Step 2 — Scoring Framework Backend ✓ COMPLETE

**Goal:** Backend helpers for composite computation, `score_overall` derivation, weight
management, legacy migration, and recalc. All live in `database.py`.

#### 2.1 — Composite and overall formulas

```
composite_screenability  = avg(score_ats, score_recruiter_fast, score_recruiter_deep) / 4.0 * 10.0
composite_company_fit    = avg(score_role_fit, score_scope_fit, score_culture) / 5.0 * 10.0
composite_candidate_fit  = avg(score_candidate_role, score_candidate_scope, score_candidate_culture) / 5.0 * 10.0

score_overall = w_screen * composite_screenability
              + w_company * composite_company_fit
              + w_candidate * composite_candidate_fit
```

All composites are 0.0–10.0. `score_overall` is 0.0–10.0. `score_overall` is backend-computed
on every eval write — never taken from LLM output.

#### 2.2 — New `database.py` helpers

- `get_eval_weights(conn) -> dict` — reads `eval_weight_*` from `app_settings`; returns
  `{'screenability': float, 'company_fit': float, 'candidate_fit': float}`
- `set_eval_weights(conn, screenability: float, company_fit: float, candidate_fit: float)` —
  validates that the three values sum to 1.0 (±0.001 float tolerance); raises `ValueError` if
  not; writes to `app_settings`
- `compute_eval_composites(scores: dict, weights: dict) -> dict` — takes raw 9 dim score
  integers + weights dict; returns `{'composite_screenability', 'composite_company_fit',
  'composite_candidate_fit', 'score_overall'}`; all 9 input scores must be non-NULL
- `migrate_legacy_evaluations(conn) -> int` — for evaluations WHERE `score_ats IS NULL`
  AND `score_role_fit IS NOT NULL`: sets `composite_screenability = 5.0`,
  `composite_candidate_fit = 5.0`; computes `composite_company_fit` from existing
  `score_role_fit / score_scope_fit / score_culture`; computes `score_overall` from current
  weights; writes back to each record; returns count updated
- `recalc_eval_scores(conn) -> int` — for evaluations WHERE `score_ats IS NOT NULL`:
  recomputes all composites + `score_overall` from stored raw dim scores and current weights;
  then recalculates `jobs.agg_score_overall` for each affected job; returns count updated

#### 2.3 — Post-eval write sequence (external eval import)

After parsing eval JSON in `evaluator.py`:
1. Call `get_eval_weights(conn)` to read current weights
2. Call `compute_eval_composites(scores, weights)` with parsed 9 dim scores
3. Write all 9 dims + 3 composites + `score_overall` to `evaluations`
4. Write `llm_call_log` record (unchanged)
5. Recalculate `jobs.agg_score_overall` (existing logic; no change needed)

#### Files touched
- `database.py` — new helper functions

---

### Step 3 — gen_orgsummary Retirement ✓ COMPLETE

**Goal:** Remove the old org summary prompt from templates, DB seeding, and all UI references.

#### 3.1 — Backend

- Delete `templates/prompts/gen_orgsummary.md`
- In `database.py` `init_db()`: remove `gen_orgsummary` from the prompt seeding block
- In `database.py` migration: execute `DELETE FROM prompt_templates WHERE key = 'gen_orgsummary'`
  on startup (guard with `IF EXISTS` check — safe to run repeatedly)

#### 3.2 — Frontend

- Search all frontend files for references to the string `gen_orgsummary`
- Remove any button, hook call, modal reference, or route that generates this prompt
- Do not guess at location — search first, then remove

#### Files touched
- `templates/prompts/gen_orgsummary.md` — deleted
- `database.py` — seeding block removal + one-time DELETE migration
- Frontend files referencing `gen_orgsummary` (identify by search during implementation)

---

### Step 4 — gen_research Promotion ✓ COMPLETE

**Goal:** Promote research prompt draft to production template; seed into DB.

#### 4.1 — File promotion

Copy `app_docs/prompt_design2/research_prompt_draft.md` → `templates/prompts/gen_research.md`.
Do not delete the draft source file.

#### 4.2 — DB seeding

Add to prompt seeding block in `database.py` `init_db()`:
```python
{'key': 'gen_research', 'label': 'Company Research Prompt',
 'runtime_vars': 'company_name,website_url,title,jd_text'}
```

#### 4.3 — Runtime variable injection mapping

When generating the research prompt for a job:
- `{company_name}` → `jobs.company_name`
- `{website_url}` → `jobs.website_url`
- `{title}` → `jobs.title`
- `{jd_text}` → `jobs.jd_text`

#### Files touched
- `templates/prompts/gen_research.md` (new — copy of draft)
- `database.py` — seeding block

---

### Step 5 — eval_single_draft Promotion ✓ COMPLETE

**Goal:** Replace the existing `eval_external.md` with the new `eval_single_draft.md` content.

#### 5.1 — File promotion

Replace the contents of `templates/prompts/eval_external.md` with the contents of
`app_docs/prompt_design2/eval_single_draft.md`. Do not rename the file — the key stays
`eval_external`. Do not delete the draft source.

#### 5.2 — DB seeding update

Update the `eval_external` record's `runtime_vars` in `database.py` seeding:
```
runtime_vars: 'company_name,title,location,pay_band,jd_text,research_context'
```

#### 5.3 — research_context injection

When generating the external eval prompt for a job:
- If a `job_research` record exists for this job: inject `raw_json` as `{research_context}`
- If no research record exists: inject the string `null` as `{research_context}`

The eval prompt's clarification gate handles the `null` case — it notes that scores will be
based on JD signals only and sets `research_confidence` to `'none'`.

#### Files touched
- `templates/prompts/eval_external.md` — contents replaced
- `database.py` — seeding block (`runtime_vars` update)

---

### Step 6 — Research Subpage + Backend Endpoints

**Goal:** Add the Research subpage to the APPLY tab; wire backend import/fetch endpoints.

#### 6.1 — Backend endpoints

`POST /api/v1/jobs/{job_id}/research`
- Request body: `{ "raw_json": "<JSON string>" }`
- Parse `raw_json` into individual fields
- Validate: `research_summary` and `research_confidence` must be present; return 400 if missing
- Insert full record to `job_research` table via `insert_job_research()`
- Return: stored research record

`GET /api/v1/jobs/{job_id}/research`
- Returns most recent `job_research` record for the job (`ORDER BY imported_at DESC LIMIT 1`)
- Returns `null` (200) if no record exists

#### 6.2 — Types

Add to `frontend/src/types/api.ts`:
```typescript
export interface JobResearch {
  id: number;
  jobId: number;
  rawJson: string;
  researchSummary: string | null;
  companyOverview: string | null;
  companyStage: string | null;
  companySizeActual: string | null;
  companyTrajectory: string | null;
  companyCultureOverview: string | null;
  cultureSignals: Record<string, unknown> | null;
  compSignals: Record<string, unknown> | null;
  roleContext: Record<string, unknown> | null;
  interviewProcess: string | null;
  redFlags: string[];
  greenFlags: string[];
  researchConfidence: 'high' | 'medium' | 'low';
  researchNotes: string | null;
  importedAt: string;
}
```

Field name convention (camelCase) follows the existing project pattern — match the
field mapping approach used in other types in `api.ts`.

#### 6.3 — Hooks

Add to the appropriate hooks file:
- `useJobResearch(jobId: number)` — GET query; returns `JobResearch | null`; handles
  loading, error, and empty states
- `useImportResearch(jobId: number)` — mutation for POST; invalidates `useJobResearch`
  on success

#### 6.4 — ResearchSubpage component

New `frontend/src/components/ResearchSubpage.tsx`:

**When research exists:**
- `RESEARCH CONFIDENCE` badge (high / medium / low; color-coded)
- `LAST RESEARCHED` timestamp
- `SUMMARY` — `research_summary` prose block
- `COMPANY` — overview, stage, size, trajectory
- `CULTURE` — `company_culture_overview` + key `culture_signals` fields
- `COMPENSATION` — `comp_signals.estimated_band` + notes
- `ROLE CONTEXT` — `role_context` fields
- `INTERVIEW PROCESS` — prose block
- `RED FLAGS` — list
- `GREEN FLAGS` — list

**When no research exists:**
- "No research data yet. Generate a research prompt from the Apply Workflow tab and paste
  the results here."

**Import modal (always accessible):**
- Textarea for pasting the LLM JSON output
- Parse + Import button
- Inline error display if parse fails (missing required fields)

**Generate prompt action:**
- Button or link that generates the `gen_research` prompt for this job
- Follows the existing generate-prompt pattern used elsewhere in the app

#### 6.5 — APPLY leftnav update

In `JobDetail.tsx`, add `Research` to the APPLY tab nav list between `Application Details`
and `Apply Workflow`.

#### Files touched
- `main.py` — two new endpoints + route map
- `database.py` — `insert_job_research()`, `get_job_research_latest()` helpers
- `frontend/src/types/api.ts` — `JobResearch` interface
- `frontend/src/hooks/` — `useJobResearch`, `useImportResearch` (add to appropriate file)
- `frontend/src/components/ResearchSubpage.tsx` (new)
- `frontend/src/pages/JobDetail.tsx` — APPLY leftnav updated

---

### Step 7 — Apply Workflow Redesign

**Goal:** Add STEP 1/2/3 structure; wire Research block; wire real composite + overall scores
into the eval block.

#### 7.1 — STEP 1 — RESEARCH block (new, above existing eval block)

```
STEP 1 — RESEARCH
This is an external prompt — it requires internet access. Do this first to gather
information about the company before running evaluations. This data is inserted
into following prompts, so don't skip it.

[Generate Research Prompt]   [Import Research Results]   [View Research →]
─────────────────────────────────────────────────────────────────────────────
```

- `Generate Research Prompt` → existing generate-prompt pattern with key `gen_research`
- `Import Research Results` → paste JSON modal (same import flow as ResearchSubpage)
- `View Research →` → navigates to Research subpage within APPLY

#### 7.2 — STEP 2 — EVALUATE block (update existing)

Add STEP label + description. Replace `—` stubs with real computed values:

```
STEP 2 — EVALUATE
Run the evaluation after completing research. Scores reflect how well you match
this role from both the company's and your own perspective. Research context is
automatically included when available.

COUNT        SCREENABILITY    COMPANY FIT    CANDIDATE FIT    OVERALL
[X evals]    [X.X / 10]       [X.X / 10]     [X.X / 10]       [X.X]

[Re-Run Internal Eval]   [Generate External Eval]   [Import External Eval]

Review Evaluations →
─────────────────────────────────────────────────────────────────────────────
```

- COUNT: number of evaluations for this job
- Composite scores: average of `composite_*` across all evaluations for this job
- OVERALL: `agg_score_overall` from jobs table
- Show `—` for all scores if no evaluations exist

Data source: extend the existing job detail endpoint to return composite averages, or
identify the right query pattern during implementation. Prefer extending the existing
endpoint over adding a new one.

#### 7.3 — STEP 3 — RESUME GENERATION block (relabel only)

Add STEP label and description above the existing block. No functional changes:

```
STEP 3 — RESUME GENERATION
Generate tailored application materials after you've decided to pursue this role.
─────────────────────────────────────────────────────────────────────────────
[existing Pass 1/2/3 no-op buttons unchanged]
```

#### Files touched
- `frontend/src/components/ApplyWorkflow.tsx` — STEP 1 block added; STEP 2 wired + labeled;
  STEP 3 labeled
- `frontend/src/pages/JobDetail.tsx` — APPLY leftnav Research entry; ApplyWorkflow prop
  updates for composite score data
- `main.py` or existing route — extend job detail response to include composite averages
  (identify during implementation)

---

### Step 8 — App Settings: Evaluation Section

**Goal:** Add evaluation weights UI, legacy migration button, and recalc button to Settings.

#### 8.1 — Locate or create App Settings subpage

Check `Settings.tsx` during implementation:
- If "App Settings" subpage already exists: add the evaluation section to it
- If it does not exist: add "App Settings" to the Settings leftnav and create the subpage

#### 8.2 — Weights block

```
EVALUATION SCORING WEIGHTS
Weights control how the three composite scores contribute to the overall score.
Values must sum to 100%.

SCREENABILITY        COMPANY FIT          CANDIDATE FIT
[___] %              [___] %              [___] %

Total: XX%                                [Save Weights]
```

- Three integer percent inputs
- `Total: XX%` shown inline — updates as user edits; turns red if not 100
- `Save Weights` disabled until total = 100 exactly
- On save: convert integers to decimals (÷ 100), call `POST /api/v1/settings/eval-weights`
- On load: `GET /api/v1/settings/eval-weights` populates fields (returns percentages × 100)

#### 8.3 — Evaluation data block

```
─────────────────────────────────────────────────────────────────────────────
EVALUATION DATA

[Migrate Legacy Evaluations]
Converts pre-2.5 evaluation scores to the 3-composite format. Run once after
upgrading. Migrated evaluations receive SCREENABILITY = 5.0 and CANDIDATE FIT = 5.0
as neutral defaults. Company Fit is derived from existing role / scope / culture scores.

[Recalculate All Evaluation Scores]
Recomputes composite scores and overall score for all new-schema evaluations using
current weights. Run after saving new weights.
```

- Both buttons return a count inline after operation completes:
  "Migrated 34 evaluations." / "Updated 47 evaluations."
- `Recalculate` operates only on evals WHERE `score_ats IS NOT NULL` (new schema only)
- `Migrate` operates only on evals WHERE `score_ats IS NULL AND score_role_fit IS NOT NULL`
  (legacy evals with old dim data)

#### 8.4 — Backend endpoints

- `GET /api/v1/settings/eval-weights` — returns `{screenability, company_fit, candidate_fit}`
  as integers (stored decimals × 100)
- `POST /api/v1/settings/eval-weights` — body: `{screenability, company_fit, candidate_fit}`
  as integers; validates sum = 100; converts to decimals before calling `set_eval_weights()`
- `POST /api/v1/evaluations/migrate-legacy` — calls `migrate_legacy_evaluations()`; returns
  `{"updated": int}`
- `POST /api/v1/evaluations/recalc-scores` — calls `recalc_eval_scores()`; returns
  `{"updated": int}`

#### Files touched
- `frontend/src/types/api.ts` — `EvalWeights` interface
- `frontend/src/hooks/useSettings.ts` — `useEvalWeights`, `useSaveEvalWeights`,
  `useMigrateLegacy`, `useRecalcScores`
- `frontend/src/pages/Settings.tsx` — App Settings subpage + evaluation section
- `main.py` — four new endpoints + route map
- `database.py` — `get_eval_weights()`, `set_eval_weights()`, `migrate_legacy_evaluations()`,
  `recalc_eval_scores()`

---

### Step 9 — evaluator.py Updates (External Eval Import)

**Goal:** Update the external eval import parser to handle the new 9-dim schema and compute
composites on every eval write.

#### 9.1 — Parse target update

Remove from parse targets: `score_comp`, `domain_match`, `role_type_match`

Add to parse targets: `score_ats`, `score_recruiter_fast`, `score_recruiter_deep`,
`score_candidate_role`, `score_candidate_scope`, `score_candidate_culture`,
`interview_prep_notes`, `score_reasons`, `research_confidence`

`score_overall` is no longer a parse target — it is always backend-computed.

#### 9.2 — Post-parse composite computation

After successful parse, before DB write:
1. Call `get_eval_weights(conn)` for current weights
2. Call `compute_eval_composites(scores, weights)` to get composites + `score_overall`
3. Include all composites in the DB write

#### 9.3 — Parse failure contract (field list updated, behavior unchanged)

On second parse failure: write evaluation with all 9 dim score fields NULL, all composite
fields NULL, `score_overall` NULL. `raw_response` preserved in `llm_call_log`. Behavior
is unchanged — only the field list changes.

#### 9.4 — Mixed-schema eval display

Eval rows must detect schema version and render accordingly:
- `score_ats IS NULL` → legacy eval → render old 4-dim layout
  (score_role_fit / score_scope_fit / score_culture / score_comp)
- `score_ats IS NOT NULL` → new eval → render 9-dim layout grouped by
  SCREENABILITY / COMPANY FIT / CANDIDATE FIT with composite scores

This branching applies to the eval row component and any eval detail view.
Identify the component during implementation; update to support both render paths.

#### Files touched
- `evaluator.py` — parse targets, post-parse composite computation, DB write fields
- Frontend eval row component (identify during implementation) — mixed-schema render branch

---

### Step 10 — Tests

**Goal:** Keep the test suite green. No test suite runs until all steps complete.
Report: "Ready for a test run — please run `./run_tests.sh` and paste the result."

#### 10.1 — Backend (new)

- `test_database.py`: `compute_eval_composites()` with known inputs verifying math;
  `migrate_legacy_evaluations()` count and field values; `recalc_eval_scores()` count;
  `get_eval_weights()` / `set_eval_weights()` including sum-validation failure
- `tests/routes/test_research.py` (new file): GET returns null when empty; POST stores and
  returns record; GET returns most recent after multiple imports; POST returns 400 on missing
  required fields
- `tests/routes/test_settings.py` (new or update): weights GET/POST; POST returns error if
  sum ≠ 100; migrate endpoint returns count; recalc endpoint returns count

#### 10.2 — Backend (update)

- `test_evaluator.py`: update for new parse field set; composite computation in import flow;
  parse failure contract with new field list

#### 10.3 — Frontend (new)

- `ResearchSubpage.test.tsx`: renders empty state message; renders research data fields;
  import modal opens; import error shown on bad JSON
- `Settings.test.tsx` (new or update): weights inputs render; Save disabled until sum = 100;
  migrate + recalc buttons present and call correct mutations

#### 10.4 — Frontend (update)

- `ApplyWorkflow.test.tsx`: STEP 1 block visible; STEP 2 shows composite score labels;
  STEP 3 label present
- Eval row test (identify during implementation): new-schema branch renders 9-dim layout;
  legacy branch renders 4-dim layout
