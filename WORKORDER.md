# AIstivus — Phase 0.2 Work Order

## How to Use This File

This file is the task tracker for Phase 0.2 changes.
`CLAUDE.md` is the rules and context document — read that first.
This file defines what to build and in what order.

**Session startup prompt for Claude Code:**
> "Read CLAUDE.md and WORKORDER.md fully before doing anything.
> Find the first unchecked item in WORKORDER.md.
> Tell me what files you plan to touch and what changes you plan to make.
> Do not write any code until I approve your plan."

**Rules:**
- Complete ONE item at a time
- After each item, stop and wait for explicit approval before proceeding
- When an item is complete, mark it `[x]` and note what was changed
- If an item requires a decision, ask before implementing
- Never refactor code that isn't part of the current item
- Never touch files not listed in the item's scope

---

## Priority 1 — Scoring Fix
*Do this first. Affects all future evaluations.*

- [x] **1. Fix evaluation scoring — add anchoring and keyword gaps**
  - File: `evaluator.py`
  - Changes:
    - Add scoring guidance to `SYSTEM_PROMPT_TEMPLATE` (1=poor fit through 10=exceptional, most roles should score 5-7, be critical)
    - Add `keyword_gaps` field to `EVALUATION_USER_PROMPT` JSON structure
    - Update tasks section of prompt to reference keyword gaps and prescriptive resume language
    - Update score_overall JSON comment to reinforce critical scoring
  - Do NOT touch any other files

---

## Priority 2 — Schema Changes
*All schema changes done together. DB will be wiped after this group is complete.*
*No migrations needed — DB is in active development, wipe and restart is acceptable until v1.0.*

- [x] **2. Rename `source_url` → `apply_url` in `job_postings` schema**
  - File: `database.py` only
  - Change the column name in the `job_postings` CREATE TABLE statement
  - Do NOT update any other files yet — routes and UI come later in items 8-9

- [x] **3. Rename `application_notes` → `application_logs` in schema**
  - File: `database.py` only
  - Rename the table in the CREATE TABLE statement
  - Rename all references within `database.py` (function names, docstrings, queries)
  - Do NOT update routes or UI yet

- [x] **4. Remove `cv_link` and `cover_link` from `applications` table**
  - File: `database.py` only
  - Remove columns from CREATE TABLE statement
  - Remove from `insert_application()` fields list
  - Remove from any helper functions that reference them
  - Do NOT update routes or UI yet

- [x] **5. Add `url` (nullable) to `application_logs` table**
  - File: `database.py` only
  - Add `url TEXT` column to the renamed `application_logs` CREATE TABLE statement
  - Add `url` to `add_application_note()` / `add_application_log()` function signature

- [x] **6. Add `timestamp` (user-adjustable) to `application_logs` table**
  - File: `database.py` only
  - Add `timestamp TEXT` column — defaults to `datetime('now')` but user-editable
  - Distinct from `created_at` which is system-set and immutable
  - `created_at` = when the record was inserted (never changes)
  - `timestamp` = when the event occurred (user can adjust for backfilling)
  - Update add/get functions accordingly

- [x] **7. Add `requested_salary` (nullable) to `jobs` table**
  - File: `database.py` only
  - Add `requested_salary TEXT` column to `jobs` CREATE TABLE statement
  - Add to `upsert_job()` fields list
  - Lives on `jobs` table alongside `pay_band` (same table, same rationale)
  - `pay_band` = company's listed range from JD
  - `requested_salary` = what you entered in "what is your requested salary?" application fields

- [x] **⚠️ WIPE DATABASE after all Priority 2 items are complete**
  - Run: `rm data/jobs.db`
  - Run: `python3 main.py` to verify clean startup with new schema
  - Confirm all tables created correctly before proceeding to Priority 3

---

## Priority 3 — Backend Route Updates
*Update all routes to match schema changes from Priority 2.*

- [x] **8. Update all `source_url` → `apply_url` references in routes**
  - Files: `main.py`, `evaluator.py`, `evaluate.py`
  - Find every reference to `source_url` and rename to `apply_url`
  - Update Pydantic models if needed
  - Update docstrings

- x] **9. Update all `application_notes` → `application_logs` references in routes**
  - Files: `main.py`
  - Rename routes: `/api/applications/{id}/notes` → `/api/applications/{id}/logs`
  - Update all function names, variable names, docstrings
  - Update `AddNoteRequest` → `AddLogRequest`
  - Add `url` and `timestamp` fields to `AddLogRequest` Pydantic model
    - `url`: optional string, default None
    - `timestamp`: optional string (ISO datetime), default None (backend fills with now())

- [x] **10. Remove `cv_link` and `cover_link` from application routes**
  - File: `main.py`
  - Remove from `CreateApplicationRequest` model
  - Remove from `UpdateApplicationRequest` model
  - Remove from create and update route handlers

- [x] **11. Apply date behavior — confirm default to today**
  - File: `main.py`
  - `apply_date` defaults to today's date on application creation
  - Should NOT be nullable — always has a value
  - Confirm this is already working correctly, no change needed if so

- [x] **12. Add `POST /api/applications/{id}/generate-prompt` route**
  - File: `main.py`
  - Fetches: job details, full JD text, latest evaluation results, keywords, keyword_gaps
  - Builds prompt using this structure:
    ```
    I am going to share my background context (jobsearch.md) after this
    message. Please wait for that before completing tasks 3 and 4.
    You can complete tasks 1 and 2 immediately.

    JOB DETAILS:
    Company: [company_name]
    Title: [job_title]
    Location: [location]
    Pay Band: [pay_band if available]
    Requested Salary: [requested_salary if available]

    JOB DESCRIPTION:
    [full JD text]

    LOCAL AI EVALUATION RESULTS:
    Overall Score: [score]/10
    Fit Type: [fit_type]
    Role Archetype: [archetype]
    Recommendation: [recommendation]
    Model Used: [model_used]

    Strengths identified:
    [strengths]

    Gaps identified:
    [gaps]

    ATS Keywords extracted:
    [keywords]

    Keyword gaps (keywords from JD unlikely to appear in resume — tailoring targets):
    [keyword_gaps]

    TASKS:
    1. Review and validate the evaluation scoring above. Do you agree
       with the overall assessment? What would you change and why?

    2. Assess overall fit for this role. What is your honest assessment
       of the candidate's likelihood of success in this role?

    3. Based on the keywords, keyword gaps, and JD requirements, what
       specific changes should be made to a resume? Be prescriptive —
       give exact language where possible. Ensure as many ATS keywords
       as possible are represented while remaining accurate to the
       candidate's actual experience.

    4. What are the 3-5 most important things to highlight for this
       specific role? What should be front and center?

    Note: I will provide my full background context (jobsearch.md)
    separately in this conversation.
    ```
  - Stores generated prompt as a new `application_logs` entry:
    - `log_type`: `prompt`
    - `note`: full prompt text
    - `url`: null
    - `timestamp`: now
  - Returns: `{ success: true, log_id: int, prompt: string }`

- [x] **13. Add `requested_salary` to job-related routes**
  - File: `main.py`
  - Add to `RerunRequest` or wherever job fields are updated
  - Surface in `/api/jobs-with-evaluations` and `/jobs/{id}` responses

---

## Priority 4 — Jobs Page Restructure
*Biggest UI change. Port report viewer first before removing evaluations page.*

- [x] **14. Port report viewer modal from `evaluations.html` to `jobs.html`**
  - File: `jobs.html`
  - Copy the report modal HTML, CSS, and JS from `evaluations.html`
  - Add "View report" button to eval cards in the jobs detail panel
  - Test that markdown reports render correctly in the modal
  - Do NOT delete `evaluations.html` yet

- [x] **15. Remove `evaluations.html` and its route**
  - Files: `main.py`, `evaluations.html`, `index.html`
  - Delete `evaluations.html` from the repo
  - Remove `GET /evaluations` route from `main.py`
  - Remove Evaluations nav card from `index.html`
  - No redirect needed — just remove

- [x] **16. Restructure `jobs.html` right panel layout**
  - File: `jobs.html`
  - Move action buttons (Re-evaluate, Create/View Application) from bottom of detail panel
    to inline section directly below the job title — between title and evaluation scores
  - Add `apply_url` as prominent "Apply →" clickable link in this inline section
  - Right panel sidebar should show: evaluation info only (scores, fit type, strengths, gaps, keywords)
  - Buttons shown inline: Re-evaluate | Apply → (apply_url link) | Start Application or View Application

- [ ] **17. Add application status badge to job list rows**
  - File: `jobs.html`
  - Update `/api/jobs-with-evaluations` endpoint in `main.py` to include application
    status and id via subquery (one SQL addition, not a per-row call)
  - Render a small status badge in the job row if application exists
  - Examples: `● Applied`, `● Interview`, `● Offer`
  - No badge shown if no application exists

---

## Priority 5 — Application Pages Rebuild

- [ ] **18. Update `application_detail.html` — remove CV/Cover link fields**
  - File: `application_detail.html`
  - Remove CV Link and Cover Letter Link input fields and their save buttons
  - Remove associated `saveLink()` JS function
  - Remove associated display links

- [ ] **19. Add "Generate Prompt" button to `application_detail.html`**
  - File: `application_detail.html`
  - Add button in the Status & Details section where CV/Cover links were
  - On click: calls `POST /api/applications/{id}/generate-prompt`
  - On success: refreshes the timeline (prompt appears as a log entry)
  - Show loading state during generation ("Generating prompt...")
  - The prompt log entry in the timeline should have a "Copy" button

- [ ] **20. Update log entry form in `application_detail.html`**
  - File: `application_detail.html`
  - Add `url` input field (optional, placeholder "https://...")
  - Add `timestamp` datetime-local input field (defaults to now, user-editable)
  - Remove `compensation` from log type dropdown
  - Update fetch call to send `url` and `timestamp` fields
  - Update `AddNoteRequest` references to `AddLogRequest`

- [ ] **21. Combine logs + audit into single timeline**
  - File: `application_detail.html`
  - Remove separate Notes section and separate Audit Trail section
  - Add single "Timeline" section
  - On load, fetch both `/api/applications/{id}/logs` and `/api/applications/{id}/audit`
    (or combine in a single new endpoint — ask before implementing)
  - Merge and sort by `timestamp` (logs) and `timestamp` (audit) descending
  - Audit entries rendered differently from log entries — system events vs user entries
  - Audit entries are NOT editable
  - Log entries show type badge, optional URL as clickable link, Copy button if type is `prompt`

- [ ] **22. UI polish on `applications.html`**
  - File: `applications.html`
  - Make company name larger and more prominent in table rows
  - Add "best of N" label next to eval score when multiple evaluations exist
    (requires eval count in the applications list API response)

---

## Priority 6 — Evaluate Page

- [ ] **23. Add `apply_url` field to `evaluate.html`**
  - File: `evaluate.html`
  - Add URL input field in the metadata fields section
  - Label: "Apply URL" or "Job Posting URL"
  - Maps to `apply_url` in `job_postings` table
  - Pass to `POST /evaluate` endpoint
  - Update `EvaluateRequest` Pydantic model to accept `apply_url`
  - Update `evaluator.py` to pass `apply_url` to `insert_job_posting()`

---

## Priority 7 — Cleanup

- [ ] **24. Update `CLAUDE.md` schema section**
  - File: `CLAUDE.md`
  - Update `job_postings` table — `source_url` → `apply_url`
  - Update `application_notes` → `application_logs` with new columns
  - Update `applications` table — remove `cv_link`, `cover_link`
  - Update `jobs` table — add `requested_salary`
  - Update valid `log_type` values — remove `compensation`, add `prompt`, `url`

- [ ] **25. Update landing page hero text**
  - File: `index.html`
  - Change "Phase 0 — Survival Mode" to "Phase 0.2 — Working Basic Job Tracker"

- [ ] **26. Final commit**
  - Commit message: "Phase 0.2 complete — application tracking, scoring fix, schema cleanup"
  - Wipe DB one final time: `rm data/jobs.db`
  - Restart: `python3 main.py`
  - Verify clean startup

---

## Completed Items
*(moved here when done)*

- [x] **Priority 1, Item 1** — Score anchoring added to evaluator.py.
  Added scoring guide to SYSTEM_PROMPT_TEMPLATE. Added keyword_gaps field
  to JSON structure. Updated tasks section with prescriptive language.

---

*This file is updated as work progresses.*
*When all items are complete, archive this file as WORKORDER_0.2_COMPLETE.md*