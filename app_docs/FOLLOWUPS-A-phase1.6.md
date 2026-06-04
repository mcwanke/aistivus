# FOLLOWUPS-A — Phase 1.6 Polish

Items identified after Phase 1.6 completion. Goal: get the app to "fully usable" state before Phase 1.7 (Docker migration).

## Status

| # | Status | Title |
|---|--------|-------|
| A1 | [x] | Add "Skipped" application status |
| A2 | [x] | Move "Generate External Eval" button to Job Details tab |
| A3 | [x] | RESUME/COVER tab: add GENERATE section (stubbed) + UPLOAD label |
| A4 | [x] | "I Applied!" sets Apply Date to today |
| A5 | [x] | JOB DETAILS left nav rework + Job Details content section |
| A6 | [x] | JOB DETAILS: new ACTIONS section at bottom |
| A7 | [x] | Company Info add-form layout fix |
| A8 | [x] | Company Info entry list: COMPANY INFO header label |
| A9 | [x] | Company Summary feature (backend + frontend) |
| A10 | [x] | Edit Description + Edit Summary modal: increase size |

Status markers: `[ ]` todo · `[x]` done · `[~]` deferred

---

## Test Baseline (going in)

- Frontend: 216 passed / 6 pre-existing failures (Evaluate.test.tsx) — 222 total
- Backend: 543 passed / 0 errors

## Test Baseline (after A1–A4)

- Frontend: 216 passed / 6 pre-existing failures (Evaluate.test.tsx) — 222 total
- Backend: 545 passed / 0 errors (+2 new tests for A4 apply_date behavior)

## Test Baseline (after A5–A8)

- Frontend: 216 passed / 6 pre-existing failures (Evaluate.test.tsx) — 222 total
- Backend: 545 passed / 0 errors (no backend changes)

## Test Baseline (after A9–A10)

- Frontend: 216 passed / 6 pre-existing failures (Evaluate.test.tsx) — 222 total
- Backend: 550 passed / 0 errors (+5 new tests: 2 DB + 3 route)

---

## Items

### A1 — Add "Skipped" application status

**Where:** Application status values — backend validation list + frontend status selector dropdown  
**Change:** Add `skipped` as a valid `application_status` value. Semantically: "I evaluated this role and chose not to pursue it" — distinct from `withdrawn` (which implies you were already in process). Position in the status ordering should be confirmed at execution time (suggest: between `draft` and `rejected`).  
**Backend:** Wherever the valid status list is defined/validated in routes or database helpers  
**Frontend:** Status selector in Application tab Details section  
**Tests affected:** Any test that asserts the complete set of valid status values

---

### A2 — Move "Generate External Eval" button to Job Details tab

**Where:** Currently in Application subtab. Move to Job Details tab.  
**Change:** The current "Generate External Eval + Tailored Resume" combined button is being split into three separate buttons (full AI generation deferred to FOLLOWUPS-B). For this item: move the "Generate External Eval" portion to the Job Details tab, placed next to the existing "Import External Eval" button. The tailored resume generation is removed from this button; it will be re-introduced as a stub in A3.  
**Tests affected:** Update any test that asserts the Application tab has a generate-eval button; add test coverage for the Job Details placement

---

### A3 — RESUME/COVER tab: add GENERATE section (stubbed) + UPLOAD label

**Where:** RESUME/COVER tab in JobDetail  
**Change (UPLOAD label):** The existing upload section has no section header. Add "UPLOAD" as a label above it, matching the style of other section labels in the tab.  
**Change (GENERATE section):** Add a new "GENERATE" section above the UPLOAD section. Contains two buttons:
- "Generate Resume" — stub only (no action yet; disabled or shows "coming soon" toast)
- "Generate Cover Letter" — stub only (no action yet; disabled or shows "coming soon" toast)

Full AI generation workflows for these buttons are scoped to FOLLOWUPS-B.  
**Tests affected:** Likely minor — update any test asserting the RESUME/COVER tab structure

---

### A4 — "I Applied!" sets Apply Date to today

**Where:** Application tab — "I Applied!" button handler  
**Change:** When the user clicks "I Applied!", in addition to the existing status update, also set `apply_date` to today's date (ISO format: `YYYY-MM-DD`) if `apply_date` is currently null. Do not overwrite an existing `apply_date`.  
**Backend:** The route handling the applied flag update should also patch `apply_date`  
**Tests affected:** Update the test for the I Applied route to assert `apply_date` is set

---

### A5 — JOB DETAILS left nav rework + Job Details content section

**Where:** JOB DETAILS tab — `JobDetailsLeft` component and its corresponding right-column content renderer  
**Changes:**

1. **Rename header:** "ACTIONS" → "JOB INFO" (text change only)

2. **Add new first nav option:** `job-details` with label "Job Details". Nav order becomes:
   - Job Details ← new
   - Evaluations
   - Job Description
   - Company Info

3. **Job Details content section:** Move the job metadata currently displayed at the bottom of the left column (Company Name, Excitement Level, My Ratings, Job Info fields) into the main content area shown when "Job Details" is selected. This is the default-selected view when the JOB DETAILS tab opens.

4. **Application subtab rename:** Rename the first option in `ApplicationLeft` from "Details" → "App Details" for consistency across tabs.

**Type change:** `JobDetailsAction` union type gains `'job-details'` as a valid value.  
**Tests affected:** Any test asserting the JOB DETAILS nav items or the APPLICATION subtab nav label

---

### A6 — JOB DETAILS: new ACTIONS section at bottom

**Where:** JOB DETAILS tab — bottom of the left nav / left column  
**Change:** Add a new "ACTIONS" section below the nav items (visually separated). Contains:
- **Export Job** button — moved from its current location in the Job Description section
- Descriptive text beneath the button: *"Exports main job data to the reports/ folder. Use this to save a copy or import into a new instance."*

More action buttons will be added here in future follow-ups.  
**Tests affected:** Update any test that asserts the Export Job button location; no new tests needed for the visual restructuring

---

### A7 — Company Info add-form layout fix

**Where:** `CompanyInfoInlineForm` component  
**Change:** Redesign the form layout. Current layout is awkward (Type + Notes on row 1, URL + Save on row 2). New layout:
- **Row 1:** `[Type — ~30% width]` `[URL — ~60% width]`
- **Row 2:** `[Notes textarea, 3–4 lines, ~70% width]` `[Save button — ~20% width, right-aligned]`

Notes gets textarea treatment (not a single-line input) since it is the primary content field.  
**Tests affected:** None (pure UI)

---

### A8 — Company Info entry list: COMPANY INFO header label

**Where:** Company Info right-column view — the entry list below the add form  
**Change:** Add a "COMPANY INFO" section label above the entry list (same 10px mono uppercase style as other section labels). This is distinct from the "ADD COMPANY INFO" label on the form above it. When the list is empty, the label still appears with the "No company info yet." placeholder below it.  
**Tests affected:** None (pure UI)

---

### A9 — Company Summary feature

**Scope:** New section in the Company Info view allowing a single free-text company summary per job, stored in `job_company_log` as `type_value = 'summary'`.

**Backend changes:**

1. **`database.py`** — Add `('company_info', 'summary')` to the `system_types` seed values in `init_db()`. Apply as a delta INSERT (do not re-run full init): `INSERT OR IGNORE INTO system_types (type_name, type_value) VALUES ('company_info', 'summary')`.

2. **`database.py`** — Add `upsert_company_summary(job_id: int, text: str) -> None`. Pattern: SELECT for existing `type_value='summary'` record for this `job_id` → UPDATE `log` if found, INSERT new record if not. Never `INSERT OR REPLACE`.

3. **Route** — Add `PUT /api/v1/jobs/{job_id}/company-summary` accepting `{ "text": str }`. Calls `upsert_company_summary()`. Returns 200 on success.

**Frontend changes:**

1. **New "COMPANY SUMMARY" section** — appears at the top of the Company Info right-column view, above the "ADD COMPANY INFO" form. Shows:
   - Summary text (read-only display) or "No summary yet." placeholder in muted italic
   - "Edit Summary" button → opens Edit Summary modal (see A10)
   - "Generate External Summary" button → opens a popup/modal displaying a copyable prompt

2. **Generate External Summary popup** — follows the same pattern as "Generate External Eval" (displays a formatted, copyable prompt block). **Note: The exact prompt copy is to be provided by the user during implementation of this item.** Placeholder copy until then: *"[Prompt copy TBD — research company name, what they do, employee count, culture from website + Reddit/Glassdoor]"*

3. **Entry list:** Summary entries are NOT filtered from the `CompanyLogRow` list — they appear in both the dedicated summary section and the entry list below it.

**Tests affected:** New backend tests for `upsert_company_summary` and the PUT route; frontend: minor update to Company Info test coverage

---

### A10 — Edit Description + Edit Summary modal: increase size

**Where:** `EditDescriptionModal` component + new Edit Summary modal (A9)  
**Change:** Both modals are currently `max-w-2xl` with a `h-64` textarea. Increase to approximately `max-w-4xl` and `h-[32rem]`. Exact Tailwind values confirmed at execution time — target is roughly double the current visible area.  
**Edit Summary modal:** Same structure as `EditDescriptionModal` (textarea + Save/Cancel buttons), built at the same larger size.  
**Tests affected:** None (pure UI sizing)
