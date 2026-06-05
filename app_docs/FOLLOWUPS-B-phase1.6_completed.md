# FOLLOWUPS-B — Phase 1.6 Polish

Items identified after FOLLOWUPS-A completion. Goal: APPLICATION tab rework, JOB DETAILS nav refinement, and small bug/tweak items before Phase 1.7 (Docker).

## Status

| # | Status | Title |
|---|--------|-------|
| B1 | [x] | Bug: Excitement Level stars not clickable |
| B2 | [x] | Company Summary: button rename + prompt tweak |
| B3 | [x] | JOB DETAILS: "Job Actions" nav subpage |
| B4 | [x] | APPLICATION subtab: left nav cleanup |
| B5 | [x] | "Change Application Status" section (was "Add Event") |
| B6 | [x] | App Detail Summary: status field → read-only text |
| B7 | [x] | "Add Application Note" → "Add App Note/Comms" + new types |
| B8 | [x] | Remove deprecated type options from UI |

Status markers: `[ ]` todo · `[x]` done · `[~]` deferred

---

## Test Baseline (going in)

- Frontend: 216 passed / 6 pre-existing failures (Evaluate.test.tsx) — 222 total
- Backend: 550 passed / 0 errors

---

## Items

### B1 — Bug: Excitement Level stars not clickable

**Where:** JOB DETAILS tab — Job Details content pane (the section where Excitement Level stars were moved during A5)
**What broke:** The A5 rework moved excitement level from the left column into the main content pane. The star rating interaction (click to set 1–5) is no longer working.
**Change:** Restore click handler on the Excitement Level star rating. Stars should be editable in the Job Details content pane the same way they were before A5.
**Scope:** Frontend only
**Tests affected:** None — pure interaction bug fix

---

### B2 — Company Summary: button rename + prompt tweak

**Where:** Company Info right-column view — "COMPANY SUMMARY" section (added in A9)

Two small changes, one item:

**B2a — Button rename:**
- "Generate External Summary" → "Generate External Summary Prompt"
- Text change only, no behavior change

**B2b — Prompt text addition:**
- Append the following sentence to the end of the existing external summary prompt:
  > *"Output your summary inside a markdown code block."*

**Scope:** Frontend only — button label and prompt string constant
**Tests affected:** None

---

### B3 — JOB DETAILS: "Job Actions" nav subpage

**Where:** JOB DETAILS tab — left nav, ACTIONS section (added in A6)

**Current state (A6 result):** ACTIONS is a visual section header at the bottom of the left nav with the Export Job button and its descriptive text displayed directly inside that section area.

**Change:** Convert to a nav + content pane pattern:
- The "ACTIONS" section header label stays as-is (no text change)
- Add "Job Actions" as a clickable nav item under it — same interaction pattern as "Job Details", "Evaluations", "Job Description", "Company Info"
- The Export Job button and its descriptive text move out of the section area and into the right-column content pane that appears when "Job Actions" is selected
- Nothing is displayed directly in the ACTIONS section area — it is a header only

**Content pane — Job Actions:**
- Export Job button
- Descriptive text below button: *"Exports main job data to the reports/ folder. Use this to save a copy or import into a new instance."*
- More action buttons will be added here in future FOLLOWUPS items

**Final left nav structure:**
```
JOB INFO
  Job Details
  Evaluations
  Job Description
  Company Info
ACTIONS
  Job Actions     ← new
```

**Type change:** `JobDetailsAction` union type gains `'job-actions'` as a valid value
**Tests affected:** Update any test asserting the JOB DETAILS nav items or the Export Job button location

---

### B4 — APPLICATION subtab: left nav cleanup

**Where:** APPLICATION tab — `ApplicationLeft` component (or equivalent left nav)

**Changes (nav display only, no content pane changes):**

1. **Rename section header:** "ACTIONS" → "APPLICATION INFO"
2. **Remove metadata display:** Company name, job title, and application status are currently shown as text beneath the nav items. Remove this display entirely.

**Scope:** Frontend only
**Tests affected:** Any test asserting the APPLICATION tab nav section header text or the presence of the metadata display

---

### B5 — "Change Application Status" section *(was "Add Event")*

**Where:** APPLICATION tab — the "Add Event" nav item and its content pane

**Change — Nav and UI:**
- Rename nav item: "Add Event" → "Change Application Status"
- Content pane redesign:
  - Top: current application status displayed as read-only labeled text (e.g., "Current status: Applied")
  - Status selector dropdown — all valid status values: `not-started`, `draft`, `applied`, `screening`, `interview`, `offer`, `rejected`, `ghosted`, `withdrawn`, `skipped`. User may select any value; no guardrails.
  - Note textarea below the selector — label: "Reason for change (optional)"
  - Save button

**Change — Data model (on Save):**
1. PATCH `application_status` on the application record (use existing status update route)
2. POST to `application_logs` with `type_id` = `status_change` type, `log` = note text. If note is blank, write a default log entry (e.g., "Status changed to [new status]"). Both writes always occur.

These two records are not formally linked, but shared timestamps allow loose correlation if ever needed.

**Backend:**
- Add `('application_log', 'status_change')` to the `system_types` seed in `init_db()` as a delta INSERT: `INSERT OR IGNORE INTO system_types (type_name, type_value) VALUES ('application_log', 'status_change')`
- Confirm the existing `application_logs` POST route accepts any valid `type_id` — no new route should be needed

**Tests affected:**
- Update test(s) asserting "Add Event" nav label
- New backend test: status change writes a `status_change` log entry
- Existing PATCH status test unchanged

---

### B6 — App Detail Summary: status field → read-only text

**Where:** APPLICATION tab — "App Details" content pane (first nav item), the status field in the summary section

**Change:** The status field is currently an interactive dropdown. Change it to a read-only text display. Status changes now happen exclusively through "Change Application Status" (B5). This pane still shows the current status value — it is just no longer editable here.

**Scope:** Frontend only
**Tests affected:** Any test asserting the status field is a dropdown or interactive element in the App Details pane

---

### B7 — "Add Application Note" → "Add App Note/Comms" + new types

**Where:** APPLICATION tab — "Add Application Note" nav item and its content pane; also `database.py` `init_db()` system_types seed

**Change — Nav:**
- Rename nav item: "Add Application Note" → "Add App Note/Comms"

**Change — Note type options in the form:**

| UI Label | system_types `type_value` | Action |
|---|---|---|
| General | `general` | Keep (existing) |
| Compensation | `compensation` | Keep (existing) |
| Feedback | `feedback` | **New** — add to seed |
| Email Comms | `email_comms` | **New** — add to seed |
| Phone Comms | `phone_comms` | **New** — add to seed |
| Offer | `offer` | **New** — add to seed |
| Rejection | `rejection` | **New** — add to seed |

**system_types seed changes in `init_db()`:**
- **Add** (delta INSERT, `INSERT OR IGNORE`): `feedback`, `email_comms`, `phone_comms`, `offer`, `rejection` (all under `application_log`)
- **Remove from seed:** `recruiter_call`, `repost_alert`, `interview_feedback`. Per schema wipe policy, these are simply removed from `init_db()` — no migration needed. On a clean install they will never be created. `interview_feedback` is being retired from the APPLICATION tab intentionally; it will be re-introduced in the INTERVIEW subpage in a future FOLLOWUPS batch.
- **Keep in seed (unchanged):** `general`, `compensation`, `prompt`, `lesson_learned`

**Tests affected:**
- Frontend: update test asserting the note type selector options
- Backend: update seed test if one exists that asserts the complete list of `application_log` types

---

### B8 — Remove deprecated type options from UI

**Where:** APPLICATION tab — "Add App Note/Comms" content pane (B7); "Change Application Status" content pane (B5)

**Change:** Any type options currently visible in the Add Event or Add Application Note forms that are not in the new lists defined in B5 and B7 are removed from the UI. Examples: Phone Screen, On-site Interview, and any other legacy event types not carried forward.

Per CLAUDE.md schema rules, `system_types` records are only deleted if no referencing records exist — and since schema wipe policy is active, removal from `init_db()` (handled in B7) is sufficient. No additional cleanup logic is needed.

**Note:** Removed interview-related options (Phone Screen, On-site Interview, etc.) will be re-introduced in the INTERVIEW subtab in a future FOLLOWUPS batch.

**Scope:** Frontend form option lists only (backend seed handled in B7)
**Tests affected:** Update any test asserting the complete list of selectable type options in these forms
