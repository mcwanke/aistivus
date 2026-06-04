---
name: phase-1-6-followups-a
description: Phase 1.6 FOLLOWUPS-A — 10 items defined, ready for execution. Key design decisions logged here.
metadata:
  type: project
---

Phase 1.6 FOLLOWUPS-A planning complete. Workorder at `app_docs/FOLLOWUPS-A-phase1.6.md`.

**Why:** Getting app to "fully usable" state before Phase 1.7 Docker migration.

## Items Ready for Execution (A1–A10)

- **A1** — Add "Skipped" application status (backend + frontend)
- **A2** — Move "Generate External Eval" button to Job Details tab
- **A3** — RESUME/COVER: GENERATE section (stubbed) + UPLOAD label
- **A4** — "I Applied!" sets Apply Date to today (bug fix)
- **A5** — JOB DETAILS left nav rework + new Job Details content section
- **A6** — JOB DETAILS: new ACTIONS section at bottom (move Export Job)
- **A7** — Company Info add-form layout fix (Type+URL row 1, Notes textarea row 2)
- **A8** — Company Info entry list: COMPANY INFO header label
- **A9** — Company Summary feature (backend + frontend)
- **A10** — Edit Description + Edit Summary modal size increase

## Key Decisions

- **Generate Resume/Cover (A3):** UI stubs only — full AI generation deferred to FOLLOWUPS-B
- **Application subtab combine/reorder (original item 5):** Fully deferred — needs more design thinking before writing
- **Company Summary storage (A9):** Stored as `type_value='summary'` in `job_company_log` (not a new column). Uniqueness enforced via `upsert_company_summary(job_id, text)` in application layer — SELECT → UPDATE if exists, INSERT if not.
- **A9 delta migration:** `INSERT OR IGNORE INTO system_types (type_name, type_value) VALUES ('company_info', 'summary')` — safe for live data
- **Generate External Summary prompt (A9):** Exact copy to be provided by user during A9 implementation; placeholder in workorder
- **TanStack DevTools button:** Deferred — acceptable in local dev build, will be hidden post-Docker migration
- **JOB DETAILS nav naming:** First option = "Job Details" (not "Job Info"); Application subtab first option renamed "Details" → "App Details"
- **Modal sizing (A10):** `max-w-2xl / h-64` → approximately `max-w-4xl / h-[32rem]`; exact values confirmed at execution

## How to apply

Check this memory before starting any FOLLOWUPS-A item to avoid re-litigating design decisions.
