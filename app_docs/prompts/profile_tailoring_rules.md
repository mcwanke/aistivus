# Prompt Name - profile_tailoring_rules

# Prompt Description
One-shot action triggered by the "Generate Rules" button on the tailoring_rules section card in the Job Search Profile Builder. Reads sections 1–5 of jobsearch.md (Who I Am, Career Narrative, Career History, Skills & Strengths, Target Role Profile) and generates a set of tailoring rules the user should apply when customizing resumes and cover letters. Returns a proposed content block for the user to accept or discard.

Source: `profile_routes.py` — `generate_tailoring_rules` route handler

# Prompt Variables
`{sections_text}` — Sections 1–5 from jobsearch.md, formatted as:

```
### Who I Am
[content]

### Career Narrative
[content]

...
```

Empty sections are shown as `[empty]`.

# Prompt Variance

**Safe to tweak:**
- The output format — "Always:", "Never:", "Voice & Tone:" subsections with bullet points. This format is a convention, not parsed programmatically, so it can be changed freely.
- Which source sections are included — currently sections 1–5. Adding section 6 (Resume Master) or others is safe.
- The framing of what tailoring rules are for

**Do not touch:**
- `{sections_text}` — required placeholder
- "Return ONLY the section content — no headers like 'Tailoring Rules', no preamble." — the frontend renders the response directly as the proposed section content

# Prompt Text

**System:**
You are generating resume and cover letter tailoring rules for a specific person.
Based on their background and target roles, produce a set of Always/Never/Voice rules they should apply when tailoring materials.
Format: use 'Always:', 'Never:', and 'Voice & Tone:' subsections with bullet points.
Return ONLY the section content — no headers like 'Tailoring Rules', no preamble.

**User:**
Generate tailoring rules based on this person's profile:

---
{sections_text}
---

Write the complete Tailoring Rules section content:
