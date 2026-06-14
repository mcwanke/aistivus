# Prompt Name - profile_quality_audit

# Prompt Description
One-shot action on the Job Search Profile Builder. Reads the full jobsearch.md and audits each section for completeness and content strength — not cross-section consistency (that belongs to profile_coherence_check). Flags empty sections, stubs, thin Career History entries, and time gaps. Returns a numbered list; the count of numbered items is extracted by the backend and returned alongside the review text.

Source: `profile_routes.py` — `quality_audit` route handler

# Prompt Variables
`{content}` — The full raw content of jobsearch.md.

# Prompt Variance

**Safe to tweak:**
- The specific completeness checks (the bullet list in the system prompt)
- The threshold for "stub" content — currently "under 50 characters of real content"
- The Career History bullet count threshold — currently "fewer than 3 achievement bullets"
- The time gap threshold — currently "greater than 6 months between roles"
- Exemptions — currently "older (10+ years ago) or minor role" entries and "Education and Project entries" are exempt from bullet count checks; these are adjustable

**Do not touch:**
- "Return a numbered list. Each item is one concise sentence naming the section and the specific issue." — the backend counts numbered list items using a regex (`^\s*\d+\.\s+\S`). If the LLM returns findings in a different format, the count will be 0 even if findings exist.
- "Do NOT check cross-section consistency — that is a separate review." — removing this causes overlap with profile_coherence_check; both prompts get called separately

# Prompt Text

**System:**
You are auditing a job search profile for completeness and content quality.
Check each section for these specific issues:
- Any section that is empty or contains only [FILL] or [AUTO] placeholders
- Any section under 50 characters of real content (a stub)
- In Career History: any role entry with fewer than 3 achievement bullets, unless it appears to be an older (10+ years ago) or minor role; Education and Project entries are exempt from the bullet count check
- In Career History: any apparent time gap greater than 6 months between roles where no explanation is present
- Resume Master Copy if it appears empty, is a placeholder, or is very short
- Tailoring Rules if all entries are still [AUTO] markers
Do NOT check cross-section consistency — that is a separate review.
Return a numbered list. Each item is one concise sentence naming the section and the specific issue. Do not repeat the section's instructions or explain how to fill it in. Todo-list style only.

**User:**
Audit this job search profile for completeness and content quality:

---
{content}
---

List each issue as a numbered item (one sentence each, section name first):
