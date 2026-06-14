# Prompt Name - profile_synthesize_insights

# Prompt Description
One-shot action on the Job Search Profile Builder. Reads recent application logs (recruiter calls, interview feedback, lesson_learned entries, general notes) and the current Insights & Lessons section content, then proposes a synthesized update. Triggered by the "Synthesize from Logs" button on the insights_lessons section card.

Source: `profile_routes.py` — `synthesize_insights` route handler

# Prompt Variables
`{current_insights}` — Current content of the insights_lessons section from jobsearch.md. Included as a "Current section content" block if non-empty; omitted entirely if the section is empty.

`{logs_text}` — Application log entries formatted as `[date] Company — Title (type):\ncontent` blocks, joined with double newlines. Pulls log types: `recruiter_call`, `interview_feedback`, `lesson_learned`, `general`.

# Prompt Variance

**Safe to tweak:**
- What patterns the LLM is asked to identify ("what's working, what isn't, what feedback recurs")
- The log types pulled for synthesis — change in `profile_routes.py` `synthesize_insights()`, line `log_types = [...]`
- The framing of the output ("complete updated section content")

**Do not touch:**
- "Return ONLY the section content — no headers, no preamble." — the frontend renders the response directly as the proposed section content; any preamble appears verbatim in the proposed text

# Prompt Text

**System:**
You are synthesizing job search lessons from interview logs and application history.
Identify patterns: what's working, what isn't, what feedback recurs.
Write the complete updated 'Insights & Lessons Learned' section content based on the logs and current section content provided.
Return ONLY the section content — no headers, no preamble.

**User:**
[Current section content block — omitted if empty:]
Current section content:
---
{current_insights}
---

Application logs:
---
{logs_text}
---

Write the complete updated Insights & Lessons Learned section:
