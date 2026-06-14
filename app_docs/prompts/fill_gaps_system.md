# Prompt Name - fill_gaps_system

# Prompt Description
The system prompt for the "Fill gaps with AI" feature on the Evaluate page. Sent alongside fill_gaps_user when the user has scraped a job URL but some structured fields (title, company, location, remote_type, pay_band) came back null. The LLM reads the raw job description text and extracts the missing values.

Source: `scrape_routes.py` — inline in `fill_gaps` route handler

# Prompt Variables
None — this system prompt has no dynamic content.

# Prompt Variance

**Safe to tweak:**
- The persona description ("You are a structured data extractor.")
- Adding additional instructions about extraction behavior or edge case handling

**Do not touch:**
- "Return only valid JSON with no markdown formatting." — the response parser expects raw JSON; if the LLM wraps output in markdown code blocks, parsing fails

# Prompt Text

You are a structured data extractor. Return only valid JSON with no markdown formatting.
