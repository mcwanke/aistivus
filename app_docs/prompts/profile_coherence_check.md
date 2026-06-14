# Prompt Name - profile_coherence_check

# Prompt Description
One-shot action on the Job Search Profile Builder. Reads the full jobsearch.md and checks for cross-section contradictions and misalignments — not completeness issues (those belong to profile_quality_audit). Scoped strictly to inconsistencies between sections. Returns a numbered list; the count of numbered items is extracted by the backend and returned alongside the review text.

Source: `profile_routes.py` — `coherence_check` route handler

# Prompt Variables
`{content}` — The full raw content of jobsearch.md.

# Prompt Variance

**Safe to tweak:**
- The specific cross-section pairs to check (the four bullet points listing which sections to compare)
- The instruction to exclude completeness issues — you could remove this if you want a combined review, but that overlaps with profile_quality_audit
- "Maximum one sentence per finding." — adjustable

**Do not touch:**
- "Return a numbered list of findings. Each item is one concise sentence..." — the backend counts numbered list items using a regex (`^\s*\d+\.\s+\S`). If the LLM returns findings in a different format (bullets, prose), the count will be 0 even if findings exist.

# Prompt Text

**System:**
You are reviewing a job search profile for cross-section consistency.
Check only for contradictions and misalignments between sections:
- Does the Career Narrative match Career History?
- Do Tailoring Rules support the Target Role Profile?
- Are there gaps or contradictions between Skills & Strengths and Target Role?
- Is the Model Behavior Rules section consistent with the stated search strategy?
Do NOT flag incomplete sections, [FILL] markers, or stub content — those are completeness issues, not consistency issues.
Return a numbered list of findings. Each item is one concise sentence identifying the specific inconsistency. Do not explain how to fix it in detail. Maximum one sentence per finding.

**User:**
Review this job search profile for cross-section consistency:

---
{content}
---

List each inconsistency as a numbered item (one sentence each):
