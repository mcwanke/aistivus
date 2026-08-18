# eval_external_cli
# Header info. Do not modify!
key: eval_external_cli
label: External Evaluation Prompt (CLI/API)
temperature: 0.0
# description
External evaluation prompt optimized for Claude CLI/API usage (no project context).
Includes candidate profile (sections 1-5 of jobsearch.md) inline.
Produces a 9-dimension scorecard and machine-readable JSON block.

Runtime variable injections: {company_name}, {title}, {location}, {pay_band}, {jd_text}, {research_context}, {jobsearch_sections_1_5}
{research_context} = raw JSON from job_research table; "null" if not available
{jobsearch_sections_1_5} = sections 1-5 from jobsearch.md (Who I Am through Target Role Profile)

[[PROMPT_START]]
[[EDITABLE]]
## CANDIDATE PROFILE

The following sections contain the candidate's background, narrative, and target role profile. Use this as the sole source of truth for all candidate facts.

{jobsearch_sections_1_5}

---

## CLARIFICATION GATE

Before beginning any evaluation, check the following. If anything is missing or ambiguous, proceed with what you have:

- Is a job description present below? If not, note the limitation.
- Is the company name, role title, and location clearly stated?
- Is the company research block present below? If the research block is absent or null, note it — Company Fit and Candidate Fit scores will be based on JD signals only, and research_confidence should be set to "none".

Proceed with evaluation using available inputs.

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

Use the candidate profile above as the sole source of truth for all candidate facts. Apply all model behavior rules stated in the candidate profile throughout.

Work through all four steps before producing any output. Then output results in the order below.

---

### Step 1 — Screenability

**Source material: JD and candidate skills/experience from the profile above. Do not use research context for these scores.**

Simulate how automated systems and recruiters process a resume before any human decision is made. Score each dimension independently.

**ATS score (1–5):** How well would this candidate's experience and background fit against the job description from an ATS standpoint?

Use this scale:
- **1 — Hard fail:** Direct keyword matching would fail AND adjacent keyword/scope matching would also fail
- **2 — Probably fail:** Direct keyword matching would mostly fail, but adjacent keyword/scope matching might pass
- **3 — Probably pass:** Enough direct keyword matching + adjacent keyword/scope matching to get through, but wouldn't rank high even with a pass
- **4 — Definitely pass:** Possibly some direct keyword matching issues, but overall direct + adjacent keyword/scope is strong; ranking would be middle of the pack
- **5 — Definitely pass:** Both direct keyword and/or adjacent scope is a match; ranking would be high

**Recruiter fast-pass score (1–5):** If this career history were distilled to a resume, would enough signals grab a recruiter's attention to stop and re-read in detail?

Use this scale:
- **1 — Hard fail:** Nothing would stop them; they'd move on immediately
- **2 — Probably fail:** Unlikely to grab attention; they'd probably skip it
- **3 — Possible:** Unclear signal; they might pause and re-read, or might move on
- **4 — Good signal:** Would likely stop and re-read in detail
- **5 — Excellent signal:** Would definitely stop and re-read; would probably pass along directly to hiring manager for review

**Recruiter deep-pass score (1–5):** After reading your jobsearch context in detail, would the recruiter advance this to a hiring manager, and where would they prioritize it in the stack?

Use this scale:
- **1 — Hard fail:** After detailed review, wondered why they did a deep scan here
- **2 — Probably fail:** After detailed review, unlikely to advance to HM
- **3 — Possible:** Might advance to HM, but no prioritization in the stack
- **4 — Good:** Would advance to HM, top of stack
- **5 — Excellent:** Would advance to HM immediately; skipping the stack

---

### Step 2 — Company Fit

**Source material: JD + company research JSON. This is the company's lens — how would the hiring team view this candidate?**

If research context is absent, score from JD signals only and note the limitation.

**Role fit (1–5):** Can the candidate do the work needed for this role?

Use this scale:
- **1 — Hard fail:** Candidate lacks capability for this role's core work
- **2 — Probably fail:** Candidate has significant gaps for this role's requirements
- **3 — Possible:** Candidate could do this work but has some gaps
- **4 — Good:** Candidate can clearly do this role's core work
- **5 — Excellent:** Candidate has strong capability in this role's domain

**Scope fit (1–5):** Can the candidate operate in this environment?

Use this scale:
- **1 — Hard fail:** Candidate couldn't operate effectively at this level/complexity
- **2 — Probably fail:** Candidate would struggle in this environment
- **3 — Possible:** Candidate could operate in this environment but would need adjustment
- **4 — Good:** Candidate can operate well in this environment
- **5 — Excellent:** Candidate is well-suited to operate in this environment

**Culture fit — company lens (1–5):** From the company's perspective, would this candidate fit their culture?

Use this scale:
- **1 — Hard fail:** Company would see this as a culture mismatch
- **2 — Probably fail:** Company would likely see culture concerns or hesitation
- **3 — Acceptable:** Company would see no culture red flags; candidate fits adequately
- **4 — Good:** Company would see clear alignment between candidate and their culture
- **5 — Strong:** Company would see the candidate as someone who would strengthen their culture

---

### Step 3 — Candidate Fit

**Source material: candidate stated preferences + research comp_signals, culture_signals, red_flags, green_flags. This is the candidate's lens — would they want this role?**

If research context is absent, score from JD signals and candidate stated preferences only.

**Role appeal (1–5):** Does the org structure, team size, technology, and role ownership scope match what you have experience with?

Use this scale:
- **1 — Hard fail:** No alignment with your experience; significantly different from what you've done
- **2 — Probably fail:** Limited alignment; mismatched on key dimensions
- **3 — Possible:** Some alignment with experience, but gaps on several fronts
- **4 — Good:** Good alignment with your experience across these dimensions
- **5 — Excellent:** Strong alignment; matches your experience in org structure, team size, tech, and scope

**Scope appeal (1–5):** Does the org makeup and operating methodology match what you have experience with?

Use this scale:
- **1 — Hard fail:** Operating style completely foreign to your experience
- **2 — Probably fail:** Methodology misaligned with what you've worked in
- **3 — Possible:** Some familiar elements, but different from your experience
- **4 — Good:** Org makeup and methodology align with your experience
- **5 — Excellent:** Operating methodology matches your experience; you'd work naturally here

**Culture compatibility — candidate lens (1–5):** Based on your stated values and company research, would you enjoy working here?

Use this scale:
- **1 — Hard fail:** No; culture conflicts with your values
- **2 — Probably fail:** Unlikely; significant value misalignment
- **3 — Possible:** You could work here, but culture isn't ideal for you
- **4 — Good:** Yes; culture aligns with your values
- **5 — Excellent:** Yes; culture resonates strongly with your values

---

## MACHINE-READABLE OUTPUT BLOCK

After completing the evaluation, output the following block exactly as formatted. Do not alter field names or structure — this block is parsed programmatically by the job search application. Always wrap the JSON in a fenced code block (triple backticks). Never output it inline.

```json
{
  "score_ats": <1-5 integer>,
  "score_recruiter_fast": <1-5 integer>,
  "score_recruiter_deep": <1-5 integer>,
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
  "keyword_gaps": "<comma-separated keywords from JD not in candidate profile>",
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

⚠️ CRITICAL: Output ONLY the JSON block above. Do not include narrative, explanation, summary, or any text outside the JSON block. The application parses this programmatically — extraneous text will cause import failures.

[[/EDITABLE]]
[[PROMPT_END]]
