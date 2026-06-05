# Job Evaluation Prompt
<!-- ============================================================
     HOW TO USE
     ──────────
     Load alongside: jobsearch.md
     Output: Evaluation scorecard + machine-readable JSON block
     Do NOT use this prompt for resume or cover letter generation.

     This prompt contains no candidate-specific facts.
     All personal data, career history, rules, and preferences
     live in jobsearch.md — the sole source of truth.
     ============================================================ -->

---

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

Company: [COMPANY NAME]
Title: [ROLE TITLE]
Location: [LOCATION / REMOTE]
Pay Band: [SALARY RANGE or "Not listed"]

---

## JOB DESCRIPTION

[PASTE FULL JOB DESCRIPTION HERE]

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