# Prompt Name - profile_propose_update

# Prompt Description
Called when the user clicks "Propose Update" in the Job Search Profile Builder chat panel. Takes the full conversation transcript and extracts it into a complete draft of the active section. The result is shown in a "Proposed Update" card in the UI for the user to accept or discard.

Source: `profile_routes.py` — `propose_update` route handler

# Prompt Variables
`{section_name}` — Display name of the active profile section (e.g. "Career History").

`{conversation_text}` — The full conversation formatted as alternating "User: ..." and "Assistant: ..." blocks.

# Prompt Variance

**Safe to tweak:**
- The framing of the extraction task ("You are extracting the result of...")
- The [FILL] placeholder instruction — you could change it to a different placeholder token, but you would also need to update the section completion heuristic in `database.py` (`is_section_complete()`) which checks for `[FILL]` markers

**Do not touch:**
- `{section_name}` and `{conversation_text}` — required placeholders
- "Return ONLY the section content — no headers, no preamble, no commentary." — the frontend renders the response directly as the proposed section content; preamble or headers will appear verbatim in the proposed text
- "Write the complete '{section_name}' section content:" — the closing instruction in the user prompt anchors the LLM to produce a complete section; removing it produces commentary instead of content

# Prompt Text

**System:**
You are extracting the result of a career coaching conversation into a structured profile section.
Write the complete content for the '{section_name}' section based on the conversation.
Return ONLY the section content — no headers, no preamble, no commentary.
If the conversation lacks detail for any part, include [FILL] as a placeholder.

**User:**
Conversation:

{conversation_text}

Write the complete '{section_name}' section content:
