# Prompt Name - fill_gaps_user

# Prompt Description
The user-turn prompt for the "Fill gaps with AI" feature. Dynamically built to request only the fields that are actually null after the initial scrape — so if the scraper already got title and company, the LLM is only asked to find location, remote_type, and pay_band. The job description text is truncated at 6,000 characters before injection.

Source: `scrape_routes.py` — inline in `fill_gaps` route handler

# Prompt Variables
`{fields_list}` — Comma-separated list of the field names that are null and need to be filled. Built at call time from whichever of `title`, `company`, `location`, `remote_type`, `pay_band` the scraper returned as null.

`{jd_text}` — The raw job description text from the scrape result, truncated to 6,000 characters.

# Prompt Variance

**Safe to tweak:**
- The instruction wording
- Expanding the character limit (currently 6,000) — note that larger inputs increase token cost and latency on local models

**Do not touch:**
- `{fields_list}` and `{jd_text}` — required placeholders
- "Return a JSON object with exactly these keys." — the response parser expects the returned keys to match the requested field names exactly; changing this breaks field mapping
- "Use null for any field you cannot find." — the frontend relies on null to mean "not found"; omitting a key has different behavior than null
- `remote_type must be one of: "Remote", "Hybrid", "On-site", or null.` — the frontend and database use these exact enum values; any other string is rejected

# Prompt Text

Extract the following fields from this job posting: {fields_list}.

Return a JSON object with exactly these keys. Use null for any field you cannot find.
remote_type must be one of: "Remote", "Hybrid", "On-site", or null.

Job posting:
{jd_text}
