# AIstivus — Phase 2.5 Workorder
> Status: IN PROGRESS — Pass 1 Steps 1/2/3/4/5/6/7 complete; Step 8 pending
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

## Step 8 — Tests

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

## Deferred to Pass 2

- **New evaluation schema backend** — 9-dimension scoring, 3 composites, DB migration,
  updated `evaluations` table columns; `agg_*` fields recalculated per new composites
- **Internal eval prompt redesign** — must match new 9-dim output schema
- **External eval prompt promotion** — `eval_single_draft.md` → `templates/prompts/`;
  add `[[EDITABLE]]`/`[[READONLY]]` markup; seed into DB
- **Research prompt promotion** — `research_prompt_draft.md` → `templates/prompts/`;
  `job_research` DB table; import endpoint
- **Apply Workflow button wiring** — Pass 1, Pass 2, Pass 3 generation prompts;
  Pass 2 import/feedback DB storage; line count integration
- **Eval score display on Workflow page** — real composite values once backend exists
- **Cover letter workflow** — not yet designed
- **Pass 2 and Pass 3 prompt drafts** — v2 versions not yet written
- **Composite score formula** — discussed but not formally locked
