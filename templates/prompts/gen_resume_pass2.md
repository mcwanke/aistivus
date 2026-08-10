# gen_resume_pass2
# Header info. Do not modify!
key: gen_resume_pass2
label: Resume Generation — Pass 2 (Evaluation + Feedback Loop)
temperature: 0.0
# description
Prompt generated for use in an external LLM session to evaluate a tailored
resume draft through 10 structured lenses (ATS Keywords, Recruiter Fast/Deep,
HM Fast/Deep, Candidate Fit, Seniority Signal, Voice & Agency, Tailoring,
Gap/Risk Flags), produce a holistic success assessment (1-10), per-lens scores
(1-5), and a structured JSON correction list for Pass 3.

Requires context files: jobsearch.md and resume_template.typ already in session.
Runtime variable injections: {company_name}, {title}, {jd_text},
{keywords_text}, {keyword_gaps_text}, {eval_scores_text}, {research_text},
{user_feedback}, {pass1_typ_text}.

{research_text} is sourced from the job_research table (latest record for the
job) — falls back to a "not available" message if no research has been run.

Run this pass as many times as needed before proceeding to Pass 3.
This pass is repeatable — user feedback can drive iterative refinement.
Editable sections: holistic assessment, lens definitions, JSON correction rules.
Read-only sections: job details, evaluation scores, research data, draft resume, output format.
---
[[PROMPT_START]]
[[EDITABLE]]
## CONTEXT

Your project files (jobsearch.md, resume_template.typ) are already in context.
You are evaluating a tailored resume draft for this role. Do not generate a new
resume — only evaluate and produce corrections.

This pass produces five outputs for the user:
1. A holistic "Chance of Success" (1-10) assessment with brief reasoning
2. Ten individual lens scores (1-5 each) with 1-line explanations
3. An aggregate score (derived from the 10 lenses) with brief reasoning
4. A final recommendation (Submit / Rework / Stop)
5. A structured JSON corrections list for Pass 3 to consume

**On iterative loops:** Evaluate this resume independently. Do not let previous
scores bias your current assessment — generate your holistic, lens, and aggregate
scores fresh. After you have your new scores, you will see the evaluation trajectory
(recent iterations). Use that for context only:

- If your new scores are similar to previous ones, the resume is likely stable at
  that level.
- If your new scores are higher, progress is being made.
- **Plateau detection:** If the aggregate score has oscillated within a 0.2-point band
  for 2+ iterations, and one or more lens scores (bottleneck dimensions) remain stuck
  at 3-4 and haven't improved, the resume has likely reached its ceiling. Recommend
  SUBMIT instead of REWORK — further iterations will see diminishing or negative returns.
- When recommending REWORK: only do so if you believe the suggested corrections can
  materially improve the scores and move bottleneck lenses upward. Avoid rework for
  polish or marginal gains.
- When recommending SUBMIT: corrections are optional refinements, not must-dos.
  Focus on high-impact changes only; skip low-impact suggestions.

**On formatting patterns:** Bracket labels like `[Label] description` create scan
friction and slow recruiter eye-tracking. This pattern typically affects Recruiter
Fast/Deep lens scores. If you see it, flag removal as a high-priority refinement.

Work through the steps below in order. Do not skip steps.

[[/EDITABLE]]
[[READONLY]]
## JOB DETAILS

Company: {company_name}
Title: {title}

---

## JOB DESCRIPTION

{jd_text}

---

## EVALUATION SCORES (from prior AI evaluation of this role)

These scores reflect how the job was evaluated against the candidate profile.
Use them to prioritize which gaps in the resume most need to be addressed.

{eval_scores_text}

ATS Keywords identified: {keywords_text}
Keyword gaps (not currently in resume): {keyword_gaps_text}

---

## COMPANY RESEARCH (from prior research pass, if available)

Use this as the benchmark for the Candidate Fit and Tailoring lenses below.
Do not re-research the company — this data is already gathered.

{research_text}

---

## USER FEEDBACK (if provided)

{user_feedback}

---

## EVALUATION LOOP CONTEXT

Iteration: {loop_number}

{evaluation_trajectory}

---

## DRAFT RESUME (.typ source)

{pass1_typ_text}

[[/READONLY]]
[[EDITABLE]]
## STEP 1 — HOLISTIC "CHANCE OF SUCCESS" (1-10)

Before running detailed lens evaluation, assess the resume holistically. Ignore
lens-by-lens scoring for now — this is a high-level gut check.

Question: "If I were a hiring manager at this company, what's my realistic
chance this person makes it to a phone screen after I read this resume?"

Consider:
- Overall tailoring fit (not just technical fit)
- Does the narrative feel cohesive?
- Are there any obvious red flags or concerns?
- Does this person seem like they've done this job before?

Assign a 1-10 score and provide 1-3 line reasoning. This is your intuition
check before lens details.

---

## STEP 2 — JD SIGNAL EXTRACTION

Extract the specific, differentiating language from the job description. This is
not keyword extraction — it is phrase and framing extraction.

Identify:
- **Specific outcomes named**: concrete deliverables, metrics, or challenges
  the JD describes by name.
- **Specific ownership areas**: distinct responsibilities described separately.
- **Strategic framing**: language that signals how the company thinks about the
  role's purpose.
- **Named tools, practices, or terminology**: specifics beyond generic stack items.

For each signal, check if the resume has a counterpart: yes / partial / absent.

---

## STEP 3 — ATS KEYWORDS (1-5)

Role: You are an ATS system evaluating this resume.

Evaluate:
- Are the identified keywords present in the resume? Where are the gaps?
- Are keywords in the right locations (summary, key impacts, experience) or
  concentrated in only one section?
- Are any keyword gaps still unaddressed?
- Density: do keywords appear natural or over-stuffed?

Score 1-5 and provide 1-line reasoning.

---

## STEP 4 — RECRUITER FAST-PASS (1-5)

Role: You are an overworked recruiter scanning for ~6-8 seconds.

Evaluate:
- Is the most recent title and company immediately visible?
- Does the summary land immediately?
- Are the Key Impacts bullets front-loaded with the strongest signal?
- Is visual hierarchy clean?

Score 1-5 and provide 1-line reasoning.

---

## STEP 5 — RECRUITER DEEP-PASS (1-5)

Role: You are a recruiter reading carefully after the fast-pass.

Evaluate:
- Does the experience section tell a coherent story aligned with the JD?
- Are there claims that would raise questions or require clarification?
- Is the narrative credible without gaps or contradictions?

Score 1-5 and provide 1-line reasoning.

---

## STEP 6 — HIRING MANAGER FAST (Technical Fit) (1-5)

Role: You are a hiring manager doing a quick technical fit check.

Evaluate:
- Can this person do this job? Is the technical depth visible?
- Are the most relevant skills/experiences prominently placed?
- Are there critical technical gaps between JD requirements and resume signals?

Score 1-5 and provide 1-line reasoning.

---

## STEP 7 — HIRING MANAGER DEEP (Culture/Credibility) (1-5)

Role: You are a hiring manager reading carefully to assess culture fit and
whether you'd want to work with this person.

Evaluate:
- Does this person's framing and voice align with company values (per research)?
- Are there any credibility concerns or red flags?
- Would you be confident calling this person?

Score 1-5 and provide 1-line reasoning.

---

## STEP 8 — CANDIDATE FIT (Role/Scope/Culture) (1-5)

Evaluate three dimensions together:

**Role fit** — does the resume demonstrate the candidate can do this specific
job? Are relevant skills/experiences prominently placed?

**Scope fit** — does the resume demonstrate the candidate operated at the right
scope? Is team size, budget, or org complexity clearly visible?

**Culture fit** — using COMPANY RESEARCH as benchmark, does the candidate's
voice/framing match what the company signals?

Score 1-5 (overall across the three dimensions) and provide 1-line reasoning.

---

## STEP 9 — SENIORITY SIGNAL (1-5)

Evaluate: Does the resume appropriately signal the seniority level this *specific
role* requires?

- Does the scope of impact (team size, org influence, business outcomes) come
  through clearly at the right level for this role?
- Is leadership scope visible and prominent, or buried?

Score 1-5 and provide 1-line reasoning.

---

## STEP 10 — VOICE & AGENCY (1-5)

Evaluate: Does the resume use active, concrete language throughout?

Look for and flag:
- Theoretical voice: "experienced in", "skilled at", "able to" (describes potential, not proof)
- Passive framing: "was responsible for", "helped", "assisted", "contributed to" (obscures agency)
- Weak openings: bullets opening with generic verbs ("Managed", "Led") with no outcome in the first clause
- Missing outcome: activity with no result/metric/artifact

Score 1-5 and provide 1-line reasoning.

---

## STEP 11 — TAILORING (1-5)

Evaluate: Does this resume specifically address this job's unique ask, or does
it feel generic?

- Does it mirror JD language and priorities specific to this company/role?
- Are the tailored choices visible, or could this resume work for any similar role?
- Does it reference company-specific context (culture, product, values)?

Score 1-5 and provide 1-line reasoning.

---

## STEP 12 — GAP/RISK FLAG CHECK (1-5)

Evaluate: Are there employment gaps, role transitions, title changes, or other
elements that might trigger questions in an interview?

- Are there unexplained gaps (tenure, location, role type)?
- Do role transitions read as natural or concerning?
- Are any claims or framing choices likely to raise red flags?

Score 1-5 (where 5 = no concerns, 1 = significant red flags) and provide
1-line reasoning.

---

## STEP 13 — AGGREGATE CALCULATION

Calculate the average of the 10 lens scores (Steps 3-12). This is the aggregate.
Express as X/5.

Provide 1-3 line reasoning explaining which lenses drive the aggregate (e.g.,
"Strong across most lenses; Seniority Signal drags it down").

---

## STEP 14 — FINAL RECOMMENDATION

Based on the holistic 1-10 assessment, the 10 individual lens scores, and
aggregate, assign a final recommendation:

- **✅ Submit** — Resume is ready. Launch it.
- **⚠️ Rework** — Strong base, but specific fixes will improve odds. Iterate Pass 2/3.
- **🚩 Stop** — Major issues. Consider pausing this application or fundamental resume revision.

Output only the emoji + recommendation type. No explanation (the reasoning is already in the sections above).

---

## STEP 15 — JSON CORRECTIONS

Synthesize the 10 lens evaluations into a structured JSON correction list. This
will be consumed by Pass 3 — every item must be directly executable.

**If user feedback provided:** Treat it as a priority guide. If they gave
specific feedback on bullets, length, structure, etc., weight your corrections
to address those concerns first.

**Grounding check:** Before adding any correction that introduces content not
already in the .typ file, verify supporting evidence exists in jobsearch.md.
Classify as:
- **Addressable** — evidence exists; write the correction
- **Adjacent** — partial evidence exists; ADD text must stay within what jobsearch.md supports
- **True gap** — no evidence exists; do not write this correction

**No conditional instructions:** Do not generate "if X, add Y". If you cannot
confirm something from jobsearch.md, do not generate the item.

**Location-based deduplication:** If two lenses target the same location, merge
into one correction item. Never emit conflicting corrections for the same location.

**Conflict resolution order:** When lenses conflict, resolve in this order:
user feedback > grounding/fabrication safety > Recruiter Fast-Pass > all others.
Add a one-line resolution note to that item.

**No no-op items:** Do not generate corrections for things that are already
correct. REMOVE and ADD must never be identical.

**Rules for every item:**
- Must be directly executable with no further judgment
- No hedging ("consider", "could", "may want to") — pick one action
- Maximum 12 correction items. If more are warranted, merge or drop the lowest-impact ones.

**JSON structure per item:**
```json
{
  "location": "<section/bullet/field identifier>",
  "remove": "<exact current text, or null if pure addition>",
  "add": "<exact replacement or insertion text, or null if pure removal>",
  "reason": "<one line — why, which lens(es)>"
}
```

[[/EDITABLE]]
[[READONLY]]
## OUTPUT FORMAT

Output in this exact order:

1. **Markdown Assessment** (no backticks):

---

## CHANCE OF SUCCESS: X/10
<1-3 line explanation of the gut-check assessment>

## LENS SCORES:
- ATS Keywords: X/5 — <1-line explanation>
- Recruiter Fast-Pass: X/5 — <1-line explanation>
- Recruiter Deep-Pass: X/5 — <1-line explanation>
- HM Fast (technical fit): X/5 — <1-line explanation>
- HM Deep (culture): X/5 — <1-line explanation>
- Candidate Fit: X/5 — <1-line explanation>
- Seniority Signal: X/5 — <1-line explanation>
- Voice & Agency: X/5 — <1-line explanation>
- Tailoring: X/5 — <1-line explanation>
- Gap/Risk Flags: X/5 — <1-line explanation>

## AGGREGATE (from lenses): X.X/5
<1-3 line explanation of what drives the aggregate>

## RECOMMENDATION: [emoji] [Status]

Why: <1-2 sentences explaining why this recommendation and not the alternatives>

Target (if Rework): <1-2 sentences on what needs to improve to unlock the next score tier>

---

2. **Single JSON Block** (wrap the entire object in triple backticks):

```json
{
  "evaluations": {
    "holistic_assessment": <integer 1-10>,
    "score_ats": <integer 1-5>,
    "score_recruiter_fast": <integer 1-5>,
    "score_recruiter_deep": <integer 1-5>,
    "score_hiringmanager_fast": <integer 1-5>,
    "score_hiringmanager_deep": <integer 1-5>,
    "score_candidate_fit": <integer 1-5>,
    "score_seniority_signal": <integer 1-5>,
    "score_voice_agency": <integer 1-5>,
    "score_tailoring": <integer 1-5>,
    "score_gap_flags": <integer 1-5>,
    "lenses_aggregate": <float e.g. 3.2>,
    "recommendation": "<recommendation status, e.g., Submit / Rework / Stop>"
  },
  "corrections": [
    {
      "location": "<section/bullet/field>",
      "remove": "<exact current text or null>",
      "add": "<exact replacement or null>",
      "reason": "<one line>"
    }
  ]
}
```

[[/READONLY]]
[[PROMPT_END]]
