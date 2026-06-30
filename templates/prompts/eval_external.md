# eval_external
key: eval_external
label: External Evaluation Prompt
# description
External evaluation prompt for use in a Claude.ai session with jobsearch.md in context.
Produces a 9-dimension scorecard (3 screenability + 3 company fit + 3 candidate fit)
and a machine-readable JSON block parsed and imported by the app.

Runtime variable injections: {company_name}, {title}, {location}, {pay_band}, {jd_text}, {research_context}
{research_context} = raw JSON from job_research table; "null" if not available

[[PROMPT_START]]
[[EDITABLE]]
## CONTEXT FILES

Your project files are already in context. Use jobsearch.md as the sole source of truth for all candidate facts.

## CLARIFICATION GATE

Before beginning any evaluation, check the following. If anything is missing or ambiguous, ask a single clarifying question — do not guess:

- Is a job description present below? If not, ask for it.
- Is the company name, role title, and location clearly stated? If any are missing, ask.
- Is the company research block present below? If the research block is absent or null, note it — Company Fit and Candidate Fit scores will be based on JD signals only, and research_confidence should be set to "none".

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

## COMPANY RESEARCH

The following JSON block contains third-party research on this company and role. Use it to inform Step 2 (Company Fit) and Step 3 (Candidate Fit) only. Do not use it for Step 1 (Screenability) — those scores must reflect JD and resume signals only, as ATS systems and recruiters do not have access to this data.

{research_context}

---

## TASK: EVALUATION SCORECARD

**Output format:** By default, output only the scores for each group, fit type, recommendation, and the JSON block. Do not output full narrative sections (strengths, gaps, keyword list, interview prep notes) unless the user explicitly requests them in this session. For each of the 9 dimension scores, include a one-sentence reason — these populate the `score_reasons` object in the JSON block.

Use jobsearch.md as the sole source of truth for all candidate facts. Apply all model behavior rules in jobsearch.md throughout.

Work through all four steps before producing any output. Then output results in the order below.

---

### Step 1 — Screenability

**Source material: JD and master resume from jobsearch.md only. Do not use research context for these scores.**

Simulate how automated systems and recruiters process a resume before any human decision is made. Score each dimension independently.

**Scale:** 1 = clear fail | 2 = uncertain, lean negative | 3 = uncertain, lean positive | 4 = clear pass

**ATS score (1–4):** Does the resume contain the keyword and terminology signals an ATS would match against this JD? Consider job title alignment, required skills verbatim or near-verbatim, technology names, and domain-specific language. A 4 requires the majority of high-priority JD keywords to appear in resume language. A 1 means an ATS would almost certainly filter this application.

**Recruiter fast-pass score (1–4):** Simulate an 8-second resume scan. Do the most visible signals — title, current/recent company, scope indicators — immediately suggest a qualified candidate for this role? A 4 means the right signals are immediately legible. A 1 means nothing registers correctly in a quick scan.

**Recruiter deep-pass score (1–4):** Simulate a full recruiter review of 2–3 minutes. After reading carefully, would a recruiter advance this candidate to a hiring manager? A 4 means clear advancement. A 1 means the recruiter would pass even after careful reading.

---

### Step 2 — Company Fit

**Source material: JD + company research JSON. This is the company's lens — how would the hiring team view this candidate?**

**Scale:** 1 = no meaningful match | 2 = weak match | 3 = moderate match | 4 = good match | 5 = excellent match

If research context is absent, score from JD signals only and note the limitation.

**Role fit (1–5):** Does the role type, title, and day-to-day responsibilities match what the candidate's background suggests they can credibly fill? Reference the Target Role Profile in jobsearch.md and cross-check against JD requirements. Assess from the hiring team's perspective.

**Scope fit (1–5):** Does the team size, org scope, and leadership depth match what the candidate has actually done? Reference stated scope in jobsearch.md — IC count managed, org level, cross-functional surface area. Draw on role_context.team_signals from research if available.

**Culture fit — company lens (1–5):** Based on JD language and research culture_signals, would this company view this candidate as a cultural fit? Draw on Glassdoor management style signals, stated values in the JD, and culture-specific requirements. This is the company's perspective, not the candidate's.

---

### Step 3 — Candidate Fit

**Source material: jobsearch.md stated preferences + research comp_signals, culture_signals, red_flags, green_flags. This is the candidate's lens — would they want this role?**

**Scale:** 1 = no meaningful appeal | 2 = weak appeal | 3 = moderate appeal | 4 = good appeal | 5 = excellent appeal

If research context is absent, score from JD signals and jobsearch.md stated preferences only.

**Role appeal (1–5):** Does this role genuinely match what the candidate wants to do? Reference stated role preferences, deal-breakers, and target role profile in jobsearch.md. If the role requires significant time in areas the candidate is actively moving away from, score lower.

**Scope appeal (1–5):** Does the org structure, team size, and ownership scope match what the candidate is targeting? Reference scope preferences in jobsearch.md. Consider org maturity, autonomy level, and growth trajectory from research company_trajectory if available.

**Culture compatibility — candidate lens (1–5):** Based on the candidate's stated values in jobsearch.md and research findings, would the candidate likely thrive here? Incorporate comp_signals from research — compensation misalignment is a relevant compatibility signal. Draw on red_flags and green_flags to calibrate. This is the candidate's perspective, not the company's.

---

### Step 4 — Qualitative Assessment

Produce these only if explicitly requested in this session. Otherwise skip to the JSON block.

**Fit type:** Core Fit / Stretch / Mismatch — one sentence of reasoning.

**Role archetype:** Concise label for the nature of this role (e.g. "Hybrid: People Leadership + Platform Technical Direction" or "Pure People Leadership: EM-scale").

**Strengths of this match:** Bullet list. Be specific — cite actual experience from jobsearch.md that maps to a specific JD requirement. No generalities.

**Gaps or concerns:** Bullet list. Be honest — if a gap is real, name it. Flag anything likely to surface in a recruiter screen or hiring manager interview.

**ATS keyword analysis:**
- Extract 25–35 ATS-relevant keywords from the JD.
- Cross-reference against the master resume in jobsearch.md.
- List any JD keywords not present in the master resume as tailoring targets.

**Interview prep notes:** Based on research.interview_process and known gaps from the evaluation above, surface what the candidate should prepare for. If interview process data is absent, flag that and identify likely question areas based on JD requirements and gaps above.

**Recommended action:** Apply / Apply with modifications / Skip — one sentence of reasoning.

---

## MACHINE-READABLE OUTPUT BLOCK

After completing the evaluation, output the following block exactly as formatted. Do not alter field names or structure — this block is parsed programmatically by the job search application. Always wrap the JSON in a fenced code block (triple backticks). Never output it inline.

EVALUATION_JSON_START
```json
{
  "score_ats": <1-4 integer>,
  "score_recruiter_fast": <1-4 integer>,
  "score_recruiter_deep": <1-4 integer>,
  "score_role_fit": <1-5 integer>,
  "score_scope_fit": <1-5 integer>,
  "score_culture": <1-5 integer>,
  "score_candidate_role": <1-5 integer>,
  "score_candidate_scope": <1-5 integer>,
  "score_candidate_culture": <1-5 integer>,
  "fit_type": "<Core Fit | Stretch | Mismatch>",
  "archetype": "<role archetype label>",
  "strengths": "<bullet 1|bullet 2|bullet 3>",
  "gaps": "<bullet 1|bullet 2>",
  "recommendation": "<Apply | Apply with modifications | Skip>",
  "keywords": "<comma-separated ATS keywords, 25-35 terms>",
  "keyword_gaps": "<comma-separated keywords from JD not in master resume>",
  "interview_prep_notes": "<note 1|note 2|note 3>",
  "score_reasons": {
    "score_ats": "<one sentence>",
    "score_recruiter_fast": "<one sentence>",
    "score_recruiter_deep": "<one sentence>",
    "score_role_fit": "<one sentence>",
    "score_scope_fit": "<one sentence>",
    "score_culture": "<one sentence>",
    "score_candidate_role": "<one sentence>",
    "score_candidate_scope": "<one sentence>",
    "score_candidate_culture": "<one sentence>"
  },
  "research_confidence": "<high | medium | low | none>",
  "log_entry": "<one-sentence verdict>"
}
```
EVALUATION_JSON_END
[[/EDITABLE]]
[[PROMPT_END]]
