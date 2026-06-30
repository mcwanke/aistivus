# AIstivus — Phase 2.5 Workorder
> Pass 1 Status: COMPLETE — 666 backend / 298 frontend passing
> Pass 2 Status: IN PROGRESS — Steps 1–6 complete (2026-06-29); Steps 7–10 next
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

> Status: IN PROGRESS — Steps 1–7 complete; Steps 8–10 next
> Test baseline at start: 666 backend / 298 frontend
> Test baseline after Steps 1–5: 671 backend / 298 frontend
> Test baseline after Step 6: all passing (2026-06-29)
> Test baseline after Step 7: 678 backend / 298 frontend (2026-06-29)

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

### Step 6 — Research Subpage + Backend Endpoints ✓ COMPLETE

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

#### Implementation notes
- `website_url` added to `jobs` table as delta migration; `update_job()` allowed set + `PatchJobRequest` updated
- Three endpoints added: `GET/POST /api/v1/jobs/{id}/research`, `POST /api/v1/jobs/{id}/generate-research-prompt`
- `generate-research-prompt` reads `website_url` from jobs row; falls back to "N/A" if missing
- `useGenerateResearchPrompt` added to `useJobs.ts` alongside other research hooks
- `website_url` displayed in Job Detail Summary (inline + Edit modal) and `JobInfoSection` display + Edit modal
- `Research` nav item inserted between `Application Details` and `Apply Workflow` in APPLY tab
- `ResearchSubpage` renders generate-prompt modal, import modal, and full structured research display

---

### Step 7 — Apply Workflow Redesign ✓ COMPLETE

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
- `frontend/src/types/api.ts` — 12 new Phase 2.5 fields added to `Evaluation` interface
- `frontend/src/components/ApplyWorkflow.tsx` — STEP 1/2/3 structure; ResearchImportModal added;
  composite averages computed client-side from `evaluations` prop; `aggScoreOverall` prop added
- `frontend/src/pages/JobDetail.tsx` — `aggScoreOverall` + `onNavigateToResearch` added to call
  site; orphaned local `PromptModal` removed
- `frontend/src/test/mocks/handlers.ts` — `website_url: null` added to `MOCK_JOB` and
  `MOCK_JOB_DETAIL.job` to satisfy updated `Job` type

#### Implementation notes
- Composite averages computed client-side from `evaluations.composite_*` fields (already
  returned by `SELECT e.*` in `get_evaluations_for_job()`); no backend change needed
- `agg_score_overall` passed as `aggScoreOverall` prop from parent `ApplicationRight` (has `job`)
- `ResearchImportModal` defined locally in `ApplyWorkflow.tsx`; imports `useImportResearch`
  from `@/hooks/useJobs`
- `useGenerateResearchPrompt` also imported from `@/hooks/useJobs`

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

---

## Phase 2.5 — Pass 3: Internal Eval + CreateJob Page

> Status: NOT STARTED
> Test baseline at start: 698 backend / 315 frontend (2026-06-29)

### Goal

Pass 3 delivers three things:
1. Fix the evaluation display in JobDetail to reflect the new 9-dim schema
2. Retire the Evaluate page as an eval entry point — replace with a focused "Create Job"
   intake page
3. Build the 4-prompt internal eval chain and wire it as an inline modal on Apply Workflow

---

### Pre-Work

- Read `memory/MEMORY.md` and check `memory/ERRORS.md` before starting
- Read `frontend/src/pages/JobDetail.tsx` (eval row section only — grep for
  `score_role_fit` to locate) before Step 1
- Read `frontend/src/pages/Evaluate.tsx` in full before Step 2
- Read `frontend/src/components/ApplyWorkflow.tsx` before Step 5
- Read `templates/prompts/eval_external.md` before Step 3 — the internal prompt output
  schema must match the external eval import schema exactly

---

### Step 1 — EvalRow Display Update

**Goal:** Fix the evaluation display in JobDetail to show the new 9-dim schema. Handle
mixed-schema eval rows (old evals alongside new evals).

#### 1.1 — Mixed-schema detection rule

The schema version of an eval is determined by `score_ats`:
- `score_ats IS NULL` → legacy eval → render old 4-dim layout
- `score_ats IS NOT NULL` → new eval → render 9-dim layout

This branching must be applied everywhere an eval is displayed.

#### 1.2 — New eval row header (new-schema branch)

Replace the old 4-pill header (`Role / Scope / Culture / Comp`) with the three composite
pills and the overall score:

```
SCREENABILITY    COMPANY FIT    CANDIDATE FIT    OVERALL
[X.X / 10]       [X.X / 10]     [X.X / 10]       [X.X / 10]
```

- Values: `composite_screenability`, `composite_company_fit`, `composite_candidate_fit`,
  `score_overall` — all are stored on the eval record
- Show `—` if any composite is null
- Old 4-pill header (`Role / Scope / Culture / Comp`) only renders for legacy evals

#### 1.3 — New eval expanded view (new-schema branch)

When the eval row is expanded, show the 9 individual dims grouped by block:

```
SCREENABILITY
  ATS          Recruiter Fast    Recruiter Deep
  [X/4]        [X/4]             [X/4]

COMPANY FIT
  Role Fit     Scope Fit         Culture Fit
  [X/5]        [X/5]             [X/5]

CANDIDATE FIT
  Role Appeal  Scope Appeal      Culture Compat
  [X/5]        [X/5]             [X/5]
```

If `score_reasons` is present (parsed JSON), show each dim's reason sentence below its
score in muted text.

#### 1.4 — Legacy eval expanded view (unchanged)

Legacy evals (score_ats IS NULL) continue to render the existing expanded view with
`score_role_fit / score_scope_fit / score_culture / score_comp`. No changes to legacy
display path.

#### 1.5 — Evaluate.tsx: ResultPanel cleanup

The `ResultPanel` in `Evaluate.tsx` still references old score fields
(`score_overall`, `score_role_fit`, `score_scope_fit`, `score_culture`, `score_comp`).
Since `Evaluate.tsx` is being redesigned in Step 2 and the result panel is removed
entirely, this cleanup happens as part of Step 2 — no separate action needed here.

#### Files touched
- `frontend/src/pages/JobDetail.tsx` — eval row header and expanded view; mixed-schema
  branch; old label strings removed
- `frontend/src/types/api.ts` — verify `Evaluation` interface has all 9 dim fields +
  3 composite fields + `score_reasons`; update if any are missing

---

### Step 2 — CreateJob Page

**Goal:** Replace the Evaluate page with a focused job intake page. Internal evaluation
moves to Apply Workflow (Step 5). The new page handles scraping, field entry, and job
creation only.

#### 2.1 — Page identity

| | Old | New |
|---|---|---|
| File | `frontend/src/pages/Evaluate.tsx` | `frontend/src/pages/CreateJob.tsx` |
| Route | `/evaluate` | `/createjob` |
| Nav label | Evaluate | Create Job |
| Page title (AppHeader) | Evaluate | Create Job |

Update `App.tsx` (or wherever routes are defined): change `/evaluate` route to
`/createjob`, pointing to `CreateJob`. Remove the old import of `Evaluate`.
Update the nav component to show "Create Job" at the new route.

#### 2.2 — Layout

Two-column layout. Left column is fixed-width (~300px), right column is flex-1.

**Left column:**
```
Model                      ← keep for Fill Gaps; label: MODEL
[model dropdown]

Import from URL
[url input field] [Import from URL btn]

[Partial scrape warning — if applicable]
[Fill gaps with AI btn — if applicable]
[Scrape error — if applicable]

─────────────────────────────────────────

[Create Job btn]  [Clear btn]
```

- Model selector stays — it is needed for the Fill Gaps AI call; use default model
  silently (no change to existing logic — just keep `selectedModelId` state)
- `Import from URL` button label: `Import from URL`
- `<hr>` between scrape section and Create Job button
- `Create Job` button: accent style (primary action)
- `Clear` button: muted style

**Right column:**
```
Company          Job Title
[input]          [input]

Location         Work Type
[input]          [select]

Apply URL        Pay Band
[input]          [input]

Job Description                    [char count]
[textarea — 14 rows]
```

All existing field inputs and labels move here unchanged. No functional changes to
the fields themselves.

#### 2.3 — Success state

On successful job creation, show a centered modal popup (not a navigation change):

```
┌─────────────────────────────────────────────┐
│                                             │
│   Job created successfully.                 │
│                                             │
│   [Go To Job]   [Create Another Job]        │
│                                             │
└─────────────────────────────────────────────┘
```

- `Go To Job` → `navigate('/jobs/{job_id}')`
- `Create Another Job` → close modal, call `handleClear()`
- Modal is blocking (dark overlay); user cannot dismiss by clicking outside

#### 2.4 — Duplicate detection

Keep the existing `DupModal`. Change the confirm button label from
`Evaluate Anyway` → `Create Anyway`. Behavior unchanged — creates the job on confirm.

#### 2.5 — What is removed

Remove entirely from the new file:
- `PanelState` type and all panel state (`panelState`, `result`, `errorMsg`)
- `elapsed`, `timerRef`, `countdown`, `startTimer`, `stopTimer`
- `evaluateMutation`, `fillGapsMutation` (fill gaps mutation stays — it's used by Fill Gaps)
- `submitEvaluation`, `handleEvaluate`
- `rerunJobId`, `pendingPayload` state
- Router state pre-population (`useEffect` that reads `rerunJobId` from router state)
- `RunningPanel`, `ResultPanel`, `PostActionWidget`, `ScorePill`, `fitTagClass`,
  `recTagClass`, `fmtElapsed`, `fmtCountdown` helpers
- `EvaluationFeedbackButton` import and usage
- `useEvaluateMutation` import

The right panel idle/running/result/error states are replaced by the form fields (2.2).

#### 2.6 — Re-Run Internal Eval button on ApplyWorkflow

Currently `Re-Run Internal Eval` in `ApplyWorkflow.tsx` uses `Link to="/evaluate"` with
router state for pre-population. After this step, that navigation target no longer exists.

Temporarily change the button to a no-op (disabled with label `Run Internal Eval`) in
this step. It is wired properly in Step 5 when the inline modal is built.

#### Files touched
- `frontend/src/pages/CreateJob.tsx` (new — replaces Evaluate.tsx)
- `frontend/src/pages/Evaluate.tsx` (deleted)
- `frontend/src/App.tsx` (or route file) — route changed, import updated
- Nav component — label and route updated
- `frontend/src/components/ApplyWorkflow.tsx` — Re-Run button → no-op stub

---

### Step 3 — Internal Eval Prompt Files

**Goal:** Write the 4 internal eval prompt files. These are server-side prompts targeting
the qwen2.5-7b model (or equivalent small local model). Output schema must match the
external eval import JSON exactly so the same `insert_evaluation` path handles both.

All 4 files use the existing prompt template format (`[[PROMPT_START]]`, `[[EDITABLE]]`,
`[[READONLY]]`, `[[PROMPT_END]]` markers). All inject `{jobsearch_context}` and
`{jd_clean}`. Prompts 3 and 4 additionally inject `{analysis_json}` from prompt 1
output and `{screenability_json}` from prompt 2 output.

#### 3.1 — eval_internal_1_analysis.md

**Key**: `eval_internal_1_analysis`
**Label**: Internal Eval — Step 1: Analysis
**Runtime vars**: `jobsearch_context`, `jd_clean`

**Task**: Classify the role. Output a small flat JSON only — no scoring.

**Output fields**:
```json
{
  "archetype": "<People Leader | Hybrid | Technical Specialist | Functional Leader>",
  "has_deal_breaker": <true | false>,
  "deal_breaker_description": "<one sentence or null>",
  "domain_match": "<Same domain | Adjacent domain | Different domain | Wrong domain entirely>",
  "role_type_match": "<Target match | Adjacent | Function mismatch | Seniority mismatch>"
}
```

No scoring. No research context needed. Small output — small models handle this reliably.

#### 3.2 — eval_internal_2_screenability.md

**Key**: `eval_internal_2_screenability`
**Label**: Internal Eval — Step 2: Screenability
**Runtime vars**: `jobsearch_context`, `jd_clean`, `analysis_json`

**Task**: Score the three screenability dimensions. Source material: JD + resume/jobsearch
context only. Do NOT use research context (ATS and recruiters don't have it).
Inject `{analysis_json}` from step 1 as committed context — do not re-derive archetype.

**Scale**: 1 (clear fail) | 2 (uncertain, lean negative) | 3 (uncertain, lean positive) |
4 (clear pass)

**Output fields** (flat JSON, integers only):
```json
{
  "score_ats": <1-4>,
  "score_recruiter_fast": <1-4>,
  "score_recruiter_deep": <1-4>,
  "score_reasons_screenability": {
    "score_ats": "<one sentence>",
    "score_recruiter_fast": "<one sentence>",
    "score_recruiter_deep": "<one sentence>"
  }
}
```

Score reasons nested here to keep them co-located with their scores. Assembled into the
final `score_reasons` object in step 4 output.

#### 3.3 — eval_internal_3_fit.md

**Key**: `eval_internal_3_fit`
**Label**: Internal Eval — Step 3: Fit Scoring
**Runtime vars**: `jobsearch_context`, `jd_clean`, `analysis_json`, `research_context`

**Task**: Score the six fit dimensions — three from the company's lens, three from the
candidate's lens. Inject `{analysis_json}` from step 1 as committed context.
Inject `{research_context}` — raw JSON from `job_research` table, or the string `null`
if no research exists. Use research only for fit scoring — not for screenability.

**Company lens scale (1–5)**: 1 = no match | 3 = moderate | 5 = excellent (company view)
**Candidate lens scale (1–5)**: 1 = no appeal | 3 = moderate | 5 = excellent (candidate view)

**Output fields** (flat JSON, integers only):
```json
{
  "score_role_fit": <1-5>,
  "score_scope_fit": <1-5>,
  "score_culture": <1-5>,
  "score_candidate_role": <1-5>,
  "score_candidate_scope": <1-5>,
  "score_candidate_culture": <1-5>,
  "score_reasons_fit": {
    "score_role_fit": "<one sentence>",
    "score_scope_fit": "<one sentence>",
    "score_culture": "<one sentence>",
    "score_candidate_role": "<one sentence>",
    "score_candidate_scope": "<one sentence>",
    "score_candidate_culture": "<one sentence>"
  },
  "research_confidence": "<high | medium | low | none>"
}
```

`research_confidence`: set to `none` if `{research_context}` is `null`; otherwise
assess based on available research depth.

#### 3.4 — eval_internal_4_synthesis.md

**Key**: `eval_internal_4_synthesis`
**Label**: Internal Eval — Step 4: Synthesis
**Runtime vars**: `jobsearch_context`, `jd_clean`, `analysis_json`, `screenability_json`,
`fit_json`

**Task**: Produce the qualitative summary and keyword extraction. All 9 scores are
already committed — this step narrates and extracts, not scores. Inject all prior
step outputs as read-only context.

**Output fields**:
```json
{
  "fit_type": "<Core Fit | Stretch | Mismatch>",
  "archetype": "<role archetype label>",
  "recommendation": "<Apply | Apply with modifications | Skip>",
  "log_entry": "<one-sentence verdict>",
  "keywords": "<comma-separated ATS keywords, 25-35 terms>",
  "keyword_gaps": "<comma-separated keywords from JD not in resume>",
  "interview_prep_notes": "<note 1|note 2|note 3>"
}
```

`archetype` here may be more descriptive than step 1's classification label —
step 1 gives the type, step 4 gives the full role archetype string.

#### 3.5 — DB seeding

Add all 4 prompt keys to the prompt seeding block in `database.py` `init_db()`.
Mark `eval_internal_*` keys with appropriate `runtime_vars` strings.
Add a migration `DELETE FROM prompt_templates WHERE key = 'eval_analysis'` and
`DELETE FROM prompt_templates WHERE key = 'eval_scoring'` to retire the old 2-prompt
keys. Files `eval_analysis.md` and `eval_scoring.md` can be deleted from
`templates/prompts/`.

#### Files touched
- `templates/prompts/eval_internal_1_analysis.md` (new)
- `templates/prompts/eval_internal_2_screenability.md` (new)
- `templates/prompts/eval_internal_3_fit.md` (new)
- `templates/prompts/eval_internal_4_synthesis.md` (new)
- `templates/prompts/eval_analysis.md` (deleted)
- `templates/prompts/eval_scoring.md` (deleted)
- `database.py` — seeding block updated; retirement migrations added

---

### Step 4 — Backend: Internal Eval Endpoint

**Goal:** Add `POST /api/v1/jobs/{id}/eval/internal` as an SSE streaming endpoint that
chains all 4 prompts sequentially, assembles the final JSON, and writes to the database
via the existing `insert_evaluation` path.

#### 4.1 — Endpoint contract

`POST /api/v1/jobs/{id}/eval/internal`

Request body:
```json
{ "llm_model_id": <int> }
```

Response: `text/event-stream` (SSE). Events emitted during processing:

```
data: {"event": "step_start", "step": 1, "total": 4, "label": "Analyzing role…"}
data: {"event": "step_complete", "step": 1}
data: {"event": "step_start", "step": 2, "total": 4, "label": "Scoring screenability…"}
data: {"event": "step_complete", "step": 2}
data: {"event": "step_start", "step": 3, "total": 4, "label": "Scoring fit…"}
data: {"event": "step_complete", "step": 3}
data: {"event": "step_start", "step": 4, "total": 4, "label": "Synthesizing…"}
data: {"event": "step_complete", "step": 4}
data: {"event": "done", "eval_id": <int>}
```

On any step failure:
```
data: {"event": "error", "step": <int>, "message": "<error text>"}
```

On parse failure (LLM returned unparseable JSON): follow existing parse failure contract
(attempt 1 → attempt 2 with stricter prompt → write null-score eval). Emit `done` with
`eval_id` regardless.

#### 4.2 — Step execution sequence

```
1. Load job record (jd_text, company_name, title, etc.)
2. Load research context (get_job_research_latest — raw_json or None → "null" string)
3. Load jobsearch_context (existing helper)
4. Load llm_model record from llm_models table
5. Emit step_start(1)
   → Build prompt 1 (eval_internal_1_analysis)
   → Call llm_client.complete()
   → Parse JSON → analysis_json
   → Log to llm_call_log
   → Emit step_complete(1)
6. Emit step_start(2)
   → Build prompt 2 (eval_internal_2_screenability), inject analysis_json
   → Call llm_client.complete()
   → Parse JSON → screenability_json
   → Log to llm_call_log
   → Emit step_complete(2)
7. Emit step_start(3)
   → Build prompt 3 (eval_internal_3_fit), inject analysis_json + research_context
   → Call llm_client.complete()
   → Parse JSON → fit_json
   → Log to llm_call_log
   → Emit step_complete(3)
8. Emit step_start(4)
   → Build prompt 4 (eval_internal_4_synthesis), inject all prior outputs
   → Call llm_client.complete()
   → Parse JSON → synthesis_json
   → Log to llm_call_log
   → Emit step_complete(4)
9. Assemble final eval dict:
   - All 9 dim scores from steps 2 + 3
   - score_reasons: merge screenability_json.score_reasons_screenability +
     fit_json.score_reasons_fit into single dict
   - fit_type, archetype, recommendation, log_entry, keywords, keyword_gaps,
     interview_prep_notes from step 4
   - research_confidence from step 3
   - domain_match, role_type_match from step 1 (stored for context; not primary schema)
10. Compute composites via compute_eval_composites()
11. Call insert_evaluation() — same path as external eval import
12. Emit done(eval_id)
```

#### 4.3 — Prompt variable injection

Use the existing `get_prompt()` / variable injection pattern already in use for other
prompts. Inject `{analysis_json}` etc. as serialized JSON strings.

Apply the standard JD injection sanitization:
```python
jd_clean = jd_text.replace("[JD_START]", "").replace("[JD_END]", "")
```

#### 4.4 — Error handling

- If any step's LLM call fails (network error, timeout): emit `error` event and stop.
  Do not write a partial eval.
- If step 1 or step 2 JSON parse fails on both attempts: emit `error` and stop.
  (Without step 1 analysis or step 2 scores, the eval is not writable.)
- If step 3 or step 4 parse fails: write what is available. Step 3 failure → write eval
  with fit scores NULL (composites NULL, score_overall NULL). Step 4 failure → write
  eval with synthesis fields NULL (keywords, recommendation etc. NULL). Always emit
  `done` with the eval_id after writing.

#### Files touched
- `main.py` — new endpoint + route map entry
- `evaluator.py` — `run_internal_eval()` function (or inline in main.py if small enough;
  prefer separate function given complexity)

---

### Step 5 — Frontend: Internal Eval Modal

**Goal:** Wire the `Run Internal Eval` button on Apply Workflow to trigger an inline
blocking modal that shows step progress while the 4-prompt chain runs, then closes and
refreshes the evaluations list on completion.

#### 5.1 — Trigger

In `ApplyWorkflow.tsx`, the `Run Internal Eval` button (currently a no-op stub from
Step 2) opens the `InternalEvalModal`. Pass `jobId` and the selected model id.

A model selector must be present on the Apply Workflow page or within the modal to
choose which local model to use. The simplest approach: add a small model dropdown
inline above the `Run Internal Eval` button in the STEP 2 block, defaulting to the
default model. Identify during implementation whether `useModels()` is already called
in a parent — avoid duplicate calls.

#### 5.2 — InternalEvalModal component

New component: `frontend/src/components/InternalEvalModal.tsx`

**Visual layout:**
```
┌────────────────────────────────────────────────────────┐
│                                                        │
│   Running Internal Evaluation                          │
│                                                        │
│   [spinner animation]                                  │
│                                                        │
│   Step 2 / 4  —  Scoring screenability…               │
│   ~21s remaining                                       │
│                                                        │
│                          [Cancel — not implemented]    │
└────────────────────────────────────────────────────────┘
```

- Blocking dark overlay; cannot be dismissed by clicking outside
- Step counter: `Step X / 4` — updates on each `step_start` SSE event
- Step label: the `label` field from the `step_start` event
- Time estimate: assume ~7s per step; count down from `(4 - completedSteps) * 7`
  starting from first step_start; label: `~Xs remaining` → `almost done…` when ≤ 0
- Spinner: reuse the existing animation from `RunningPanel` in Evaluate.tsx (copy it)
- Cancel button: present but does nothing in this pass — internal SSE cancel is complex;
  label it `Cancel` but disable it or make it a no-op with a tooltip "Cannot cancel
  in-progress evaluation"

**On `done` event:**
- Invalidate the evaluations query for this job (so Evaluations subpage refreshes)
- Close the modal
- No success toast needed — the Evaluations subpage already shows the new record

**On `error` event:**
- Show inline error message in the modal
- Enable a `Close` button to dismiss

#### 5.3 — SSE connection

Use a `fetch` + `ReadableStream` pattern (consistent with any existing SSE usage in the
app — check `useEvaluateMutation` or similar hooks for the pattern already in use).
Wire in a custom hook: `useRunInternalEval(jobId)` in the appropriate hooks file.

#### Files touched
- `frontend/src/components/InternalEvalModal.tsx` (new)
- `frontend/src/components/ApplyWorkflow.tsx` — model selector added; Run Internal Eval
  button wired; `InternalEvalModal` rendered conditionally
- `frontend/src/hooks/useEvaluate.ts` (or `useJobs.ts`) — `useRunInternalEval` hook
- `frontend/src/types/api.ts` — SSE event types if needed

---

### Step 6 — Tests

**Goal:** Keep the test suite green. Report: "Ready for a test run — please run
`./run_tests.sh` and paste the result." No test suite runs until all steps complete.

#### 6.1 — Backend (new)

- `test_evaluator.py` or new `tests/routes/test_internal_eval.py`:
  - Endpoint returns SSE events in correct order for a mock 4-step run
  - `done` event contains `eval_id`
  - `error` event emitted when step 1 LLM call fails
  - Assembled eval dict has all 9 dim fields + score_reasons merged correctly
  - `compute_eval_composites` called; `score_overall` present in written record

#### 6.2 — Frontend (new)

- `InternalEvalModal.test.tsx`:
  - Modal renders with step counter starting at 0/4 or 1/4
  - Step counter updates on SSE `step_start` event
  - Modal closes on SSE `done` event
  - Error message shown on SSE `error` event

#### 6.3 — Frontend (update)

- `ApplyWorkflow.test.tsx`: `Run Internal Eval` button present; clicking it opens modal
- `CreateJob.test.tsx` (replaces `Evaluate.test.tsx`):
  - Left column renders URL import field and Create Job button
  - Right column renders Company, Title, JD fields
  - Success modal renders on job creation
  - DupModal renders on duplicate detection
