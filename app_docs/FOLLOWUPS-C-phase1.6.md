# FOLLOWUPS-C — Phase 1.6 Polish

Items identified after FOLLOWUPS-B completion. Focus areas: RESUME/COVER tab
workflows, APPLICATION LOG rework, and prompt sub-typing/logging audit.

## Status

| # | Status | Title |
|---|--------|-------|
| C1 | [x] | Bug: Change Application Status Save doesn't clear Reason field |
| C2 | [x] | RESUME/COVER: File Rename |
| C3 | [ ] | RESUME/COVER: Generate Resume + Generate Cover Letter popups |
| C4 | [ ] | APPLICATION LOG: Row layout rework |
| C5 | [ ] | APPLICATION LOG: Show audit event text in rolled-up row |
| C6 | [ ] | APPLICATION LOG: Rich expanded view for llm_call entries |
| C7 | [ ] | APPLICATION LOG: Structured evaluation expanded view |
| C8 | [x] | Prompt sub-typing + logging audit |

Status markers: `[ ]` todo · `[x]` done · `[~]` deferred

---

## Test Baseline (going in)

- Frontend: 216 passed / 6 pre-existing failures (Evaluate.test.tsx) — 222 total
- Backend: 551 passed / 0 errors

---

## Items

### C1 — Bug: Change Application Status Save doesn't clear Reason field

**Where:** APPLICATION tab → Change Application Status content pane

**What broke:** After a successful save, the Reason for change textarea retains
its previous content. The user has to manually clear it.

**Change:** On successful save, clear the note textarea. The status selector
stays on the newly saved status (reflecting current application state).

**Scope:** Frontend only
**Tests affected:** Update any test asserting post-save form state

---

### C2 — RESUME/COVER: File Rename

**Where:** RESUME/COVER tab — file list rows (both RESUME and COVER sections)

**Change — Frontend:**
- Add a "Rename" button to each file row in the document list
- Clicking it opens an inline textbox pre-populated with the base filename
  only — no extension. Example: `document_a_1234.pdf` → textbox shows
  `document_a_1234`
- The textbox has a Save and Cancel button
- On Save: validate input (same rules as upload: `[a-zA-Z0-9_-]`, max 64
  chars), re-append the original extension, send PATCH to backend
- On conflict (409 from backend): show an inline error in the textbox area
  so the user can adjust the name without dismissing the UI
- On success: refresh the file list

**Change — Backend:**
- New route: `PATCH /api/v1/applications/{application_id}/documents/{document_id}/rename`
- Body: `{ "new_name": "document_b_89" }` (base name, no extension)
- Backend strips and re-attaches original extension before renaming
- Validates new name against `[a-zA-Z0-9_-]`, max 64 chars
- Checks for filename collision in the same directory before acting;
  returns 409 if conflict found
- Renames file on disk and updates `file_path` in `application_documents`
- Only `file_path` (and derived display name) changes — `type_id`,
  `is_final`, `created_at` unchanged
- PDF/DRAFT files are independent — no cascading rename

**New DB function:** `rename_application_document(document_id, new_path)`

**Tests affected:** New backend tests for rename route (success, collision,
invalid name, not found)

---

### C3 — RESUME/COVER: Generate Resume + Generate Cover Letter popups

**Where:** RESUME/COVER tab — GENERATE section, "Generate Resume" and
"Generate Cover Letter" buttons (already stubbed in A3)

**Change — Behavior:**
Both buttons show a popup modal with the generated prompt text and a copy
button — same interaction pattern as the "Generate External Eval" button on
the Evaluations page. No AI call is made from the app.

**Change — Backend (two new routes):**
- `POST /api/v1/applications/{application_id}/generate-resume-prompt`
- `POST /api/v1/applications/{application_id}/generate-cover-prompt`

Each route:
1. Constructs the prompt server-side using job + application data
2. Logs it to `application_logs` with the appropriate type
   (`prompt_resume` or `prompt_cover` — see C8)
3. Returns `{ "prompt": "..." }`

Prompt text for both routes is TBD — will be provided at implementation time.

**Scope:** Frontend (wire up modal to backend call) + Backend (two new routes)
**Tests affected:** New backend tests for both generate routes

---

### C4 — APPLICATION LOG: Row layout rework

**Where:** APPLICATION LOG tab — `ActivityLogRow` component

**Change — Rolled-up header layout:**

| Column | Width | Content |
|--------|-------|---------|
| Timestamp | 20% | Plain display text (non-interactive) |
| Type badge | 15% | Existing entry_type badge |
| Info | 50% | `entry.source` or summary text (see C5 for audit entries) |
| Actions | 10% | Copy button only (if content exists) |
| Toggle | 5% | ▼ / ▲ |

- Clicking anywhere on the header row (except Copy and Toggle buttons)
  toggles the row open/closed
- Copy and Toggle remain independent stopPropagation buttons
- Delete button is removed from the rolled-up header entirely (moves to
  unrolled view — see below)

**Change — Unrolled row layout:**

| Column | Width | Content |
|--------|-------|---------|
| Reserved | 20% | Edit Timestamp button (if `can_edit_timestamp`); otherwise empty |
| Info | 65% | Existing expanded content (text, url, structured views per C6/C7) |
| Actions | 10% | Delete button (with confirm-on-first-click behavior, same as today) |
| Reserved | 5% | Empty |

**Note on widths:** These are targets. Adjust during implementation if
anything looks off on real data.

**Tests affected:** Update tests asserting header row structure, button
placement, or click behavior on ActivityLogRow

---

### C5 — APPLICATION LOG: Show audit event text in rolled-up row

**Where:** APPLICATION LOG tab — `ActivityLogRow`, audit entry type

**What's wrong:** For `entry_type === 'audit'`, the `info (50%)` column in
the rolled-up header is blank. The audit event text (e.g. "Status updated
to: rejected") is already in `entry.text` — it's fetched by
`get_activity_log()` and present in the response — but it's only shown in
the expanded view.

**Change:** Surface `entry.text` in the `info (50%)` column of the rolled-up
header for audit entries. Truncate with ellipsis if it overflows.

**Scope:** Frontend only — no backend change needed
**Tests affected:** Update any test asserting the rolled-up content of audit rows

---

### C6 — APPLICATION LOG: Rich expanded view for `llm_call` entries

**Where:** APPLICATION LOG tab — `ActivityLogRow`, `llm_call` entry type

**Current state:** Expanded view shows only the prompt text.

**Change:** When a `llm_call` row is expanded, show the full LLM
Usage-style view: prompt + raw response + tokens + latency.

**Approach (frontend only, no backend changes):**
- On the APPLICATION LOG tab, alongside the existing `useActivityLog` query,
  add a parallel `useLlmCallLog({ job_id })` call (hook already exists in
  `useLLMUsage.ts`)
- For any `entry_type === 'llm_call'` row that is expanded, look up the
  matching `LlmCallLogEntry` by `entry.raw_id`
- Render using the existing `MetaSection` and `ExpandedRow` components from
  `LLMUsage.tsx`, or extract them into a shared component if needed

**Tests affected:** Update tests asserting expanded content of llm_call rows

---

### C7 — APPLICATION LOG: Structured evaluation expanded view

**Where:** APPLICATION LOG tab — `ActivityLogRow`, `evaluation` entry type

**Current state:** Expanded view is effectively empty — the one-line summary
(score · fit type · recommendation) from the rolled-up row isn't repeated or
expanded further.

**Change:** When an `evaluation` row is expanded, render a structured
evaluation card showing all parsed evaluation fields.

**Fields to display:** `score_overall`, `score_role_fit`, `score_scope_fit`,
`score_culture`, `score_comp`, `fit_type`, `archetype`, `recommendation`,
`strengths`, `gaps`, `keywords`, `keyword_gaps`, `domain_match`,
`role_type_match`

**Applies to both:**
- Internal evaluations (run through the app) — the `evaluation` row and the
  `llm_call` row are separate entries; C7 covers the `evaluation` row,
  C6 covers the `llm_call` row
- External imports — only the `evaluation` row exists; C7 covers it

**Backend:** Extend the evaluation SELECT in `get_activity_log()` to include
all evaluation fields listed above (currently only fetches `score_overall`,
`fit_type`, `recommendation`, `model_name`). Surface the additional fields
in the response — either as optional fields on `ActivityLogEntry` or as a
structured `eval_data` object. Decision at implementation time.

**Frontend:** New evaluation card component for the expanded view. Style to
match the LLM Usage expanded row aesthetic — clean sections, mono labels,
consistent spacing.

**Tests affected:** New tests for evaluation expanded view rendering;
update backend test for `get_activity_log()` field coverage

---

### C8 — Prompt sub-typing + logging audit

**Where:** `database.py` `init_db()` system_types seed; `main.py`
generate-prompt route; new Generate External Summary backend route; frontend
Company Info section

**Problem:** All externally-generated prompts currently write to
`application_logs` with `type_value = 'prompt'`, making them
indistinguishable in the activity log. Generate External Summary is not
logged at all (frontend-only string construction).

**Change — New system_types seeds (delta INSERT, `INSERT OR IGNORE`):**

All under `type_name = 'application_log'`:
- `prompt_eval` — replaces `prompt` for Generate External Eval
- `prompt_orgsummary` — Generate External Summary (new)
- `prompt_resume` — Generate Resume (C3)
- `prompt_cover` — Generate Cover Letter (C3)

Keep `prompt` in the seed — existing records reference it; it will remain
as a valid legacy type.

**Change — Data migration (one-time, runs as part of C8 deploy):**
All existing `application_logs` records with `type_value = 'prompt'` are
external eval prompts. Update them to use the new `prompt_eval` type_id:
```sql
UPDATE application_logs
SET type_id = (SELECT id FROM system_types
               WHERE type_name = 'application_log'
               AND type_value = 'prompt_eval')
WHERE type_id = (SELECT id FROM system_types
                 WHERE type_name = 'application_log'
                 AND type_value = 'prompt');
```
This runs once; no automation needed after.

**Change — Generate External Eval route:**
Update `POST /api/v1/applications/{application_id}/generate-prompt` to write
`prompt_eval` instead of `prompt`. No other behavior change.

**Change — Generate External Summary (new backend route):**
Currently the Company Info → Company Summary section constructs the prompt
entirely in the frontend and never logs it.

New route: `POST /api/v1/jobs/{job_id}/generate-orgsummary-prompt`
1. Constructs the org summary prompt server-side from job/company data
2. Resolves the `application_id` for this job (earliest application, same
   lookup pattern as `get_activity_log()`)
3. Logs to `application_logs` with `prompt_orgsummary` type
4. Returns `{ "prompt": "..." }`

Frontend: wire the "Generate External Summary Prompt" button to this new
route instead of constructing the prompt client-side.

**Change — Activity log display labels:**
Update `activity_type` display strings in `get_activity_log()` for prompt
subtypes to be human-readable in the rolled-up row:

| type_value | Display label |
|---|---|
| `prompt_eval` | EVAL PROMPT |
| `prompt_orgsummary` | ORG SUMMARY PROMPT |
| `prompt_resume` | RESUME PROMPT |
| `prompt_cover` | COVER PROMPT |
| `prompt` (legacy) | PROMPT |

**Tests affected:**
- Backend: new system_types seed test asserting all prompt sub-types present
- Backend: test that generate-prompt route writes `prompt_eval`
- Backend: new test for generate-orgsummary-prompt route
- Frontend: update any test asserting prompt type labels in the activity log
