# eval_external
key: eval_external
label: External Evaluation Prompt
# description
Prompt generated for use in an external LLM session (e.g. Claude.ai, ChatGPT).
The user pastes this into their preferred model alongside their jobsearch.md file.
Contains variable injections for job details ({company_name}, {title}, {location},
{pay_band}, {jd_text}) and a machine-readable JSON output block parsed by the app.

Editable sections: context file instructions, clarification gate, scoring framework,
scorecard task instructions, stop block.
Read-only sections: job details injection, job description injection, and
EVALUATION_JSON_START...EVALUATION_JSON_END block (field names parsed by the app).
---
[[EDITABLE]]
## CONTEXT FILES

You have been provided the following file. Read it completely before
doing anything else:

- **jobsearch.md** — candidate profile, career history, target role
  preferences, deal-breakers, compensation targets, tailoring rules,
  and model behavior rules.

Confirm you have read jobsearch.md before proceeding.
[[/EDITABLE]]

---

[[EDITABLE]]
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
[[/EDITABLE]]

---

[[READONLY]]
## JOB DETAILS

Company: {company_name}
Title: {title}
Location: {location}
Pay Band: {pay_band}

---

## JOB DESCRIPTION

{jd_text}

---
[[/READONLY]]

[[EDITABLE]]
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
[[/EDITABLE]]
[[READONLY]]

EVALUATION_JSON_START
{{
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
}}
EVALUATION_JSON_END
[[/READONLY]]

---

[[EDITABLE]]
## STOP

After delivering the scorecard and JSON block, stop and ask:

> "Want to proceed to resume tailoring for this role, or would you
>  like to review anything in the evaluation first?"

Do not generate resume or cover letter materials in this response.
[[/EDITABLE]]
