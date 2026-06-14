# Prompt Name - evaluation_user

# Prompt Description
The user-turn prompt sent alongside evaluation_system on every evaluation call. Contains the job description to evaluate (delimited by injection-mitigation markers) and defines the exact JSON output schema the response parser expects. This is a structural prompt — the parser in `evaluator.py` depends on the field names and types defined here.

Source: `evaluator.py` — `EVALUATION_USER_PROMPT`

# Prompt Variables
`{jd_clean}` — The job description text, pre-sanitized to strip `[JD_START]` and `[JD_END]` occurrences before injection.

# Prompt Variance

**Safe to tweak:**
- The opening instruction line ("Evaluate this job description and return a JSON object.")
- Inline score range hints in the comments — e.g. `<float 1-10 — mismatches score 1-3…>`
- The descriptions of what each field should contain (e.g. "bullet-point list of…")

**Do not touch:**
- `{jd_clean}` — required placeholder
- `[JD_START]` / `[JD_END]` markers — required for prompt injection mitigation; stripping them here and in the system prompt is the security boundary
- The JSON field names: `score_overall`, `score_role_fit`, `score_scope_fit`, `score_culture`, `score_comp`, `fit_type`, `archetype`, `strengths`, `gaps`, `recommendation`, `log_entry`, `keywords`, `domain_match`, `role_type_match`, `keyword_gaps` — every field name is read directly by the parser; renaming any of them silently drops that field from the database record
- The field types and enum constraints — e.g. `fit_type` must be `Core Fit | Stretch | Mismatch`; `archetype` must be one of the four listed values; the parser validates these

# Prompt Text

Evaluate this job description and return a JSON object.

[JD_START]
{jd_clean}
[JD_END]

Return ONLY this JSON structure with no additional text:

{
  "score_overall": <float 1-10 — mismatches score 1-3, average fits 5-7, strong fits 8-10>,
  "score_role_fit": <float 1-5>,
  "score_scope_fit": <float 1-5>,
  "score_culture": <float 1-5>,
  "score_comp": <float 1-5>,
  "fit_type": "<Core Fit | Stretch | Mismatch>",
  "archetype": "<People Leader | Hybrid | Technical Specialist | Functional Leader>",
  "strengths": "<bullet-point list of genuine match strengths>",
  "gaps": "<bullet-point list of real gaps or concerns — be specific and honest>",
  "recommendation": "<Apply | Apply with modifications | Skip>",
  "log_entry": "<one-line summary: Company | Role | Score | Fit Type | Recommendation>",
  "keywords": "<comma-separated list of 25-35 important ATS keywords from this JD>",
  "domain_match": "<Same domain | Adjacent domain | Different domain | Wrong domain entirely>",
  "role_type_match": "<Target match | Adjacent | Function mismatch | Seniority mismatch>",
  "keyword_gaps": "<comma-separated list of JD keywords unlikely to appear in a typical resume for this background — the tailoring targets>"
}
