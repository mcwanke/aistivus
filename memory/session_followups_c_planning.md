---
name: session-followups-c-planning
description: FOLLOWUPS-C full planning session — C1–C8 defined, C1+C8 now complete
metadata:
  type: project
---

## Worked on
Full discovery and definition session for FOLLOWUPS-C. C1 + C8 implemented 2026-06-05.

## Completed
- Test suite run confirmed clean: 216/551, no regressions from FOLLOWUPS-B
- FOLLOWUPS-C work document written: `app_docs/FOLLOWUPS-C-phase1.6.md` (C1–C8)
- Test baseline memory updated: `test_baseline_followups_c.md`
- Prompt logging rule written to memory: `feedback_prompt_logging_rule.md`
- **C1**: `handleChangeStatus` wrapped in try/catch so textarea clears on success path; errors still surface via React Query `isError`
- **C8**: 4 new system_types seeds (`prompt_eval`, `prompt_orgsummary`, `prompt_resume`, `prompt_cover`); `get_activity_log()` display labels updated; `generate-prompt` route now writes `prompt_eval`; new `POST /api/v1/jobs/{job_id}/generate-orgsummary-prompt` route; frontend button wired to backend; 8 new backend tests; mock handler added

## In Progress
Nothing — C1 and C8 done. C2/C3/C4–C7 ready.

## Decisions Made

**Prompt sub-typing (C8):**
- New system_types: `prompt_eval`, `prompt_orgsummary`, `prompt_resume`, `prompt_cover` — all under `application_log` type_name, all in `application_logs` table
- Generic `prompt` type kept in seed for legacy display; existing records migrated to `prompt_eval` via one-time UPDATE (SQL provided below)
- All externally-generated prompts must be backend-constructed and logged before the modal opens — see [[feedback-prompt-logging-rule]]

**One-time migration SQL (run once on existing DB):**
```sql
UPDATE application_logs
SET type_id = (SELECT id FROM system_types
               WHERE type_name = 'application_log'
               AND type_value = 'prompt_eval')
WHERE type_id = (SELECT id FROM system_types
                 WHERE type_name = 'application_log'
                 AND type_value = 'prompt');
```

**Generate External Summary (C8):**
- Now a backend route: `POST /api/v1/jobs/{job_id}/generate-orgsummary-prompt`
- Logs to `application_logs` using job's earliest `application_id` (same lookup as `get_activity_log()`)
- Frontend button in JobDetailsRight wired to `useGenerateOrgSummaryPrompt()` hook in `useJobs.ts`

**C6 — llm_call expanded view:**
- Frontend-only: add parallel `useLlmCallLog({ job_id })` query to APPLICATION LOG tab
- Look up matching entry by `raw_id`, render using existing `MetaSection`/`ExpandedRow` from `LLMUsage.tsx`
- No backend changes needed

**C7 — evaluation expanded view:**
- Two separate rows for internal evals: `llm_call` row (C6 handles it) + `evaluation` row (C7 handles it)
- External imports: only the `evaluation` row exists; C7 handles it
- Backend: extend `get_activity_log()` eval SELECT to include all evaluation fields
- Frontend: new evaluation card component styled like LLM Usage expanded row

**C2 — File Rename:**
- Textbox shows base name only (no extension); extension stripped before validation, re-attached on save
- 409 collision shown inline in modal — user adjusts without dismissing
- PDF/DRAFT files are independent; no cascading rename

## Next Session Priorities
1. **C2** — file rename (self-contained backend + frontend)
2. **C3** — generate resume/cover popups (prompt text needed from user; C8 seeds now in place)
3. **C4 + C5** — APPLICATION LOG row layout rework (can batch together)
4. **C6 + C7** — rich expanded views (can batch together)
