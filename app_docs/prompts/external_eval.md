# Prompt Name - external_eval

# Prompt Description
Generates a complete job evaluation prompt for use with an external AI (e.g., Claude.ai,
ChatGPT). The user copies this prompt, pastes it into an external AI alongside their
jobsearch.md file, and receives a scored evaluation + machine-readable JSON block that
can be imported back into the app via the "Import External Eval" button on the Job Details
Evaluations tab.

This prompt is distinct from the internal evaluation pipeline (evaluation_system /
evaluation_user) — it is designed for an interactive, file-context-aware AI session rather
than a single structured API call. It instructs the external AI to produce a human-readable
scorecard first, then a parseable JSON block at the end.

Source: `main.py` — `EXTERNAL_EVAL_PROMPT_TEMPLATE` constant (extracted from inline
`generate_prompt` route handler in Phase 2.1 Step 1)

Route: `POST /api/v1/applications/{application_id}/generate-prompt`

# Prompt Variables

`{company_name}` — Company name from the job record. Falls back to "N/A" if empty.

`{title}` — Job title from the job record. Falls back to "N/A" if empty.

`{location}` — Job location from the job record. Falls back to "N/A" if empty.

`{pay_band}` — Pay band from the job record. Falls back to "Not listed" if empty.

`{jd_text}` — Full job description text from `jobs.description_merged`. May be empty
if no description has been attached to the job.

# Prompt Variance

**Safe to tweak:**
- The CONTEXT FILES section — what files are described and their listed contents
- The CLARIFICATION GATE questions — what the AI checks before proceeding
- The JOB DETAILS section labels
- The TASK: EVALUATION SCORECARD section — scoring dimensions, their descriptions,
  what each output field should contain
- The scoring guidance (1–10 band descriptions) — see Phase 2.1 Step 1 for the
  calibration update applied here
- The STOP instruction at the bottom — what the AI asks after delivering the scorecard

**Do not touch:**
- `{company_name}`, `{title}`, `{location}`, `{pay_band}`, `{jd_text}` — required
  Python format placeholders; removing or renaming them causes a KeyError at render time
- `EVALUATION_JSON_START` / `EVALUATION_JSON_END` markers — the import parser in
  `main.py` (`POST /api/v1/applications/{id}/import-external-eval` or equivalent) scans
  for these exact strings to locate the machine-readable block; changing them breaks import
- The JSON field names inside the machine-readable block: `score_overall`, `score_role_fit`,
  `score_scope_fit`, `score_culture`, `score_comp`, `fit_type`, `archetype`, `strengths`,
  `gaps`, `recommendation`, `keywords`, `keyword_gaps`, `log_entry` — all parsed
  programmatically; renaming any field silently drops it from the imported evaluation record
- The field types and enum constraints: `fit_type` must be `Core Fit | Stretch | Mismatch`;
  `recommendation` must be `Apply | Apply with modifications | Skip`

# Prompt Text

## CONTEXT FILES

You have been provided the following file. Read it completely before
doing anything else:

- **jobsearch.md** — candidate profile, career history, target role
  preferences, deal-breakers, compensation targets, tailoring rules,
  and model behavior rules.

Confirm you have read jobsearch.md before proceeding.

---

## CLARIFICATION GATE

Before beginning any evaluation, check the following. If anything is
missing or ambiguous, ask a single clarifying question — do not guess:

- Is a job description present below? If not, ask for it.
- Is the company name, role title, and location clearly stated?
  If any are missing, ask.
- If the JD does not include a salary band, note that comp scoring
  will be estimated based on market norms for the role level —
  do not ask, just flag it in the scorecard.

Do not proceed until all required inputs are present.

---

## JOB DETAILS

Company: {company_name}
Title: {title}
Location: {location}
Pay Band: {pay_band}

---

## JOB DESCRIPTION

{jd_text}

---

## TASK: EVALUATION SCORECARD

Produce a full evaluation scorecard using the framework below.
Use jobsearch.md as the sole source of truth for all candidate facts.
Apply the model behavior rules in jobsearch.md throughout.

### Scoring Framework

**Dimension scores (1–5 each):**
- **Role fit:** Does the role type, title, and day-to-day responsibilities
  match what the candidate is targeting? Reference the Target Role Profile
  section of jobsearch.md.
- **Scope fit:** Does the team size, org scope, and leadership depth match
  the candidate's background and stated preferences?
- **Culture signals:** Does the JD language, company type, and mission
  suggest a culture compatible with the candidate's values?
- **Comp signals:** How does the stated or estimated pay band align with
  the candidate's compensation target? Reference jobsearch.md.

**Overall score:** 1–10 composite with one-sentence verdict.

Scoring guidance — apply the same calibration used internally:
- 1–2: Categorically wrong — function, domain, or level fundamentally misaligned
- 3–4: Significant mismatch — major gaps or deal-breaker violations
- 5: Borderline — some fit but gaps make this a poor application choice
- 6: Viable — meets minimum threshold, not a standout candidate
- 7: Good fit — solid match, minor gaps, competitive
- 8: Strong fit — well-aligned, strong candidate
- 9: Excellent fit — near-perfect, very few concerns
- 10: Exceptional — every requirement met, direct domain match, no meaningful gaps

**Fit type:** Core Fit / Stretch / Mismatch — with one-sentence reasoning.

**Role archetype:** A concise label describing the nature of the role
(e.g. "Hybrid: People Leadership + Platform Technical Direction" or
"Pure People Leadership: EM-scale").

**Strengths of this match:** Bullet list. Be specific — cite actual
experience from jobsearch.md that maps to a specific JD requirement.

**Gaps or concerns:** Bullet list. Be honest — if a gap is real, name
it. Flag anything that could surface as a challenge in an interview.

**Interview process analysis:** If the JD includes a described interview
process, analyze each stage for conflicts with known gaps or deal-breakers
from jobsearch.md. Surface these here — not later.

**ATS keyword analysis:**
- List 25–35 ATS-relevant keywords extracted from the JD.
- Cross-reference against the master resume copy in jobsearch.md.
- Call out any JD keywords not present in the master resume as
  tailoring targets.

**Recommended action:** Apply / Apply with modifications / Skip
Include one sentence of reasoning.

---

## MACHINE-READABLE OUTPUT BLOCK

After the full scorecard, output the following block exactly as
formatted. Do not alter field names or structure — this block is
parsed programmatically by the job search application.

EVALUATION_JSON_START
{
  "score_overall": <1-10 integer>,
  "score_role_fit": <1-5 integer>,
  "score_scope_fit": <1-5 integer>,
  "score_culture": <1-5 integer>,
  "score_comp": <1-5 integer>,
  "fit_type": "<Core Fit | Stretch | Mismatch>",
  "archetype": "<role archetype label>",
  "strengths": "<bullet 1|bullet 2|bullet 3>",
  "gaps": "<bullet 1|bullet 2>",
  "recommendation": "<Apply | Apply with modifications | Skip>",
  "keywords": "<comma-separated ATS keywords, 25-35 terms>",
  "keyword_gaps": "<comma-separated keywords from JD not in master resume>",
  "log_entry": "<one-sentence verdict>"
}
EVALUATION_JSON_END

---

## STOP

After delivering the scorecard and JSON block, stop and ask:

> "Want to proceed to resume tailoring for this role, or would you
>  like to review anything in the evaluation first?"

Do not generate resume or cover letter materials in this response.
