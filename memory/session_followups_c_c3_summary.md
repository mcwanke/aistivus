---
name: session-followups-c-c3-summary
description: End-of-session summary for FOLLOWUPS-C C3 (2026-06-05)
metadata:
  type: project
---

## Worked on
FOLLOWUPS-C item C3 — Generate Resume + Cover Letter prompts

## Completed
- Reviewed three user-authored prompt files (`app_docs/build_prompts/prompt_external_eval.md`, `prompt_resume.md`, `prompt_cover_letter.md`) for intent, dynamic field clarity, and company summary inclusion
- Updated `generate_prompt` route in `main.py`: eval-only prompt, removed combined eval+resume prompt, removed local eval score injection, added `keyword_gaps` to JSON output block
- Added `POST /api/v1/applications/{id}/generate-resume-prompt` — job details + optional eval keywords/keyword_gaps (fallback graceful), logs as `prompt_resume`
- Added `POST /api/v1/applications/{id}/generate-cover-prompt` — job details + website URL from company log (fallback with user instruction), logs as `prompt_cover`
- Added `useGenerateResumePrompt` and `useGenerateCoverPrompt` hooks to `useApplications.ts`
- Wired both buttons in `ResumeCoverTab` (`JobDetail.tsx`): live calls, loading states, error display, PromptModal on success
- 11 new backend tests; 577 backend / 216 frontend passing, zero regressions
- FOLLOWUPS-C doc: C3 marked `[x]`

## Decisions Made
- Eval prompt no longer injects prior local eval scores — external AI evaluates fresh from jobsearch.md + JD
- Resume prompt pulls `keyword_gaps` from latest eval if one exists; falls back to "Not provided — will extract from JD"
- Cover prompt pulls website URL from company log (same lookup as orgsummary route); falls back with message prompting user to supply it
- Prompt text sourced verbatim from user-authored markdown files in `app_docs/build_prompts/`

## Next Session Priorities
1. **C4 + C5** — APPLICATION LOG row layout rework + audit text surfacing (batch together, frontend-only)
2. **C6 + C7** — Rich expanded views for llm_call + evaluation rows (batch together)
