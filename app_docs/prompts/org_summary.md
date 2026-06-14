# Prompt Name - org_summary

# Prompt Description
Generates a quick company reference summary for a job seeker before they apply. Called from the Job Detail page when the user clicks a company research button. The prompt is also logged to `application_logs` with type `prompt_orgsummary` before the modal opens — so the exact prompt sent is always visible in the application activity log.

Source: `main.py` — inline in the org summary route handler

# Prompt Variables
`{company_name}` — The company name from the job record.

`{website_url}` — The company website URL if one has been added to the job's company log. Empty string if not set.

`{title}` — The job title from the job record.

# Prompt Variance

**Safe to tweak:**
- What topics to cover (the three bullet points in the "Cover the following" list)
- Tone and length guidance ("2-3 paragraph", "tight", "quick reference")
- The instruction to skip details that can't be found
- Adding or removing specific research sources mentioned (Glassdoor, Blind, Reddit)

**Do not touch:**
- `{company_name}`, `{website_url}`, `{title}` — required placeholders
- "Output your summary inside a markdown code block." — the frontend parses the response expecting a fenced code block; removing this instruction causes the UI to display the raw LLM response without formatting

# Prompt Text

You are helping a job seeker quickly evaluate a company before applying. Research the following company and write a concise 2-3 paragraph summary for personal reference.

*Company Name*: {company_name}
*Company URL*: {website_url}
*Job Title*: {title}

Cover the following in your summary:
- What the company does, what market it operates in, and its approximate size
- General company culture and, if relevant to the job title, engineering or technical culture specifically
- Public reputation and employee sentiment (draw from sources like Glassdoor, Blind, or Reddit — keep research brief)

Write in plain, conversational prose. No headers or bullet points. Keep it tight — this is a quick reference, not a deep dive. If the URL is blank or a detail can't be found, skip it rather than guessing. Output your summary inside a markdown code block.
