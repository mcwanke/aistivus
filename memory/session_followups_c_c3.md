---
name: session-followups-c-c3
description: FOLLOWUPS-C C3 complete — Generate Resume + Cover Letter prompts
metadata:
  type: project
---

## Worked on
FOLLOWUPS-C item C3 — RESUME/COVER Generate Resume + Generate Cover Letter popups (2026-06-05)

## Completed
- `generate_prompt` route in `main.py` updated to use new eval-only prompt text (removed combined eval+resume prompt; no more local eval score injection; new prompt is clean eval-only with clarification gate, scoring framework, machine-readable JSON block including `keyword_gaps`, and STOP instruction)
- `POST /api/v1/applications/{id}/generate-resume-prompt` route added to `main.py` — pulls job details + latest eval keywords/keyword_gaps (fallback to "Not provided — will extract from JD"), logs as `prompt_resume`, returns `{ prompt }`
- `POST /api/v1/applications/{id}/generate-cover-prompt` route added to `main.py` — pulls job details + website URL from company log (fallback to "Not available — provide the company URL before proceeding"), logs as `prompt_cover`, returns `{ prompt }`
- Route index at top of `main.py` updated with both new routes
- `useGenerateResumePrompt` and `useGenerateCoverPrompt` hooks added to `frontend/src/hooks/useApplications.ts`
- `useGenerateResumePrompt` and `useGenerateCoverPrompt` imported into `JobDetail.tsx`
- `ResumeCoverTab` component updated: added state (`resumePromptText`, `coverPromptText`), added mutation instances, added handler functions, replaced stubbed `handleComingSoon` buttons with live wired buttons (loading state, error display), added two `PromptModal` renders at component base
- 11 new backend tests in `tests/routes/test_applications.py`: 1 on `TestGeneratePrompt` (verifies no LOCAL_AI_EVALUATION_RESULTS, has keyword_gaps), 5 on `TestGenerateResumePrompt`, 5 on `TestGenerateCoverPrompt`
- FOLLOWUPS-C doc updated: C3 marked `[x]`
- Memory baseline updated: Backend 577/0, Frontend 216/6

## Decisions Made
- New eval prompt: removed local eval score injection. External AI does its own fresh evaluation — injecting prior scores was redundant and created noise.
- Resume prompt: `keyword_gaps` field populated from `evaluations.keyword_gaps` if a prior eval exists; falls back gracefully.
- Cover prompt: website URL pulled from `job_company_log` website entry (same lookup as orgsummary route). Falls back with a message prompting the user to supply it.
- Prompt text sourced from `app_docs/build_prompts/` markdown files (user-authored during session).
- PromptModal title: "Generate Resume Prompt" / "Generate Cover Letter Prompt" (matches pattern of existing "External Eval + Tailored Resume Prompt" modal, now updated to just "Generate External Eval + Tailored Resume Prompt" by the PromptModal default).

## Next Session Priorities
1. **C4 + C5** — APPLICATION LOG row layout rework + audit text surfacing (batch together, frontend-only)
2. **C6 + C7** — Rich expanded views for llm_call + evaluation rows (batch together)
