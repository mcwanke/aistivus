# gen_resume_pass1
# Header info. Do not modify!
key: gen_resume_pass1
label: Resume Generation — Pass 1 (Initial Draft)
temperature: 0.0
# description
Prompt generated for use in an external LLM session to produce a tailored
resume .typ file for a specific job application.

Uses a lightweight planning approach (content planning by section, outcome-driven
bullets, keyword placement strategy) targeting approximately 2 pages. No rigid
constraints — the goal is a strong draft that Pass 2 can refine.

Requires context files: jobsearch.md (candidate facts, tailoring rules) and
resume_template.typ (Typst structural base). Runtime variable injections:
{company_name}, {title}, {location}, {pay_band}, {jd_text}, {keywords_text},
{keyword_gaps_text}, {eval_scores_text}, {research_text}.

Editable sections: context instructions, clarification gate, tailoring rules,
planning guidance, output format notes.
Read-only sections: job details, job description, evaluation input, research, Typst rules.
---
[[PROMPT_START]]
[[EDITABLE]]
## CONTEXT FILES

Your project files (jobsearch.md, resume_template.typ) are already in context.
Use jobsearch.md as the sole source of truth for all candidate facts. Use
resume_template.typ as the exact structural base — do not alter its layout,
grid definitions, fonts, spacing, or section order.

## CLARIFICATION GATE

Before proceeding, verify the following. If anything is missing, ask a single
clarifying question — do not guess:

- Is a job description present below? If not, ask for it.
- Is a company name and role title present? If not, ask.
- What is the target role type? Classify as: EM/Senior EM, Director/VP, or
  other. If the JD title is non-standard, proceed with your best classification.
- If evaluation output (ATS keywords) is not provided, note it and extract
  keywords directly from the JD during planning.

Do not begin planning until all required inputs are confirmed.

[[/EDITABLE]]
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

## EVALUATION INPUT

ATS Keywords: {keywords_text}
Keyword Gaps: {keyword_gaps_text}

---

## EVALUATION SCORES (from prior AI evaluation of this role)

Use these scores to weight your content decisions. A low score in a dimension
means that dimension needs deliberate attention in the draft.

{eval_scores_text}

---

## COMPANY RESEARCH

Use this to align summary framing, culture signals, and role context with how
the company describes itself. Do not re-research — this data is already gathered.

{research_text}

[[/READONLY]]
[[EDITABLE]]
## TAILORING RULES

Read and internalize before planning. These govern every decision.

### Header tagline

Refer to the header tagline guidance in jobsearch.md. Apply it to this role.
If no explicit guidance exists, use the JD title directly.

### Summary

Apply the summary guidance from jobsearch.md. Lead with years of experience and
domain breadth. Mirror the JD's language for the role's core responsibility.
Draw on COMPANY RESEARCH to align framing with the company's stated values.

Hard limit: ≤ 4 sentences. A recruiter's fast-pass scan is ~6 seconds. If you
cannot say it in 4 sentences, cut the weakest one.

### Key Impacts

Select achievements from jobsearch.md ordered by relevance to this JD.
**Every bullet must lead with a concrete outcome, scale signal, or named artifact
— not a verb phrase.** Structure: outcome first → action that produced it → method/tool
last (or omit).

Prioritize bullets where the signal directly mirrors a JD responsibility. Refer
to jobsearch.md achievement categories for guidance on which to prioritize.

### Core Competencies

Source from the competencies section in jobsearch.md. Prioritize competencies
that mirror JD language directly.

### Experience

Tailor experience sections to emphasize what is most relevant to this JD. Use
the experience sub-section structure defined in jobsearch.md as your template.
Compress or expand sub-sections based on their relevance to this role.

For earlier roles, frame based on relevance to this JD. Compress as tenure recedes.
Apply all guidance from jobsearch.md on honesty and framing.

### Bullet construction rule — CRITICAL

**Every bullet must lead with outcome, scale signal, or named artifact.** Not a verb.

Examples of STRONG openings:
- "Built a customer acquisition pipeline that added $2M ARR"
- "Led the migration of 300K users to a new platform"
- "Reduced incident response time from 4 hours to 45 minutes"
- "Architected the observability platform used by 50+ teams"

Examples of WEAK openings (do not use):
- "Managed a team of engineers" (no outcome in opening)
- "Worked on product strategy" (no scale or artifact)
- "Responsible for infrastructure" (passive, no result)
- "Experienced in cloud architecture" (theoretical, not proof)

Do not start a bullet with: Managed, Led, Worked on, Responsible for,
Experienced in, Helped, Assisted, Supported, Involved in, Contributed to.

If the first 4-5 words could appear on any resume for any company, rewrite it.

---

## STEP 1 — SECTION PLANNING (LIGHTWEIGHT)

With the tailoring rules and evaluation scores in context, work through each
section of the resume template in order. For each section, decide its content
and structure for this specific role.

**For each prose block** (summary, role intro paragraphs):
- What is the core claim of each sentence?
- Is each sentence grounded in jobsearch.md? If not, remove it.
- Does it mirror or directly address something in the JD or COMPANY RESEARCH?

**For each bullet section** (key impacts, experience sub-sections):
- How many bullets does this section need for this role?
- For each planned bullet:
  1. **Leading outcome:** What concrete outcome, scale signal, or named artifact opens this bullet?
  2. **Source:** What section, role, or achievement in jobsearch.md supports this?
  3. **JD alignment:** Does this bullet address a specific JD requirement or desired signal?
  
- If you cannot identify a leading outcome and source, do not plan this bullet.

**Evaluation scores:** Use weak dimensions to weight your emphasis. A low scope
fit score means scope signals need to be surfaced prominently.

---

## STEP 2 — VOICE & AGENCY REVIEW

Before generation, scan your planned bullets and prose for weak patterns:

- **Theoretical voice:** "experienced in", "skilled at", "able to", "knowledge of"
- **Passive framing:** "was responsible for", "helped with", "assisted", "supported", "involved in"
- **Weak openings:** Verbs with no outcome in the first clause
- **Missing outcome:** Activity described with no result/metric/artifact

Rewrite any flagged bullets to lead with outcome, not verb.

---

## STEP 3 — SENIORITY SIGNAL REVIEW

Before generation, ensure scope is visible and prominent:

- Are team size, budget, org complexity, or named outcomes visible early in each relevant bullet?
- Is leadership scope buried in dependent clauses, or front-and-center?

Rewrite any bullets where scope is buried or unclear.

---

## STEP 4 — ATS KEYWORD PLACEMENT STRATEGY

Before generation, plan where to place priority ATS keywords:

1. **Summary** — Incorporate 2-3 highest-priority keywords naturally into the opening sentences.
2. **Key Impacts** — Front-load relevant keywords into the first 2-3 bullets.
3. **Experience intro** — Reference key keywords in the intro paragraph for the most recent role.
4. **Spread, not concentrate** — Keywords should appear across multiple sections, not all in one.

Do not over-stuff. Keywords should read naturally, not as a checklist.

---

## STEP 5 — GENERATE

Using resume_template.typ as the exact structural base, generate the complete
.typ file following your plan from Steps 1-4.

### Output checklist before finishing:
- ✅ All experience entries in reverse chronological order
- ✅ No Typst syntax errors (all special characters escaped)
- ✅ No fabricated claims — everything grounded in jobsearch.md
- ✅ No modified template structure (section order, layout, spacing unchanged)

### Typst escape character rule — MANDATORY

Typst treats #, $, and @ as special syntax. In all content you write:
- All # signs → \# (e.g. C\#)
- All $ signs → \$ (e.g. \$2M+)
- @ signs in content → \@ (the template header already escapes email)

### Coherence check

Before outputting, verify the experience narrative is chronologically consistent
and supports the tailored claim. A recruiter should see a clear story, not
contradictions.

If a planned element doesn't work during generation (a bullet loses its outcome,
a sentence runs long), adjust locally. Do not force it to fit.

### Target page length

Target approximately 2 pages of content. Do not count lines or obsess over exact
length — the goal is a strong draft. If the natural flow lands at 1.8 pages or
2.3 pages, that is fine. Pass 2 will provide feedback if refinement is needed.

[[/EDITABLE]]
[[READONLY]]
## OUTPUT FORMAT

Output the raw .typ file content only. Nothing before it. The first line must be:
`// {resume_counter}_{company_name}.typ`

No reasoning, notes, or explanation — output only the .typ file.

If you deviated from your plan during generation for a good reason (a bullet
lost its outcome despite effort, a sentence naturally ran long), you may add a
single note after the .typ file explaining the deviation. Otherwise, no notes.

[[/READONLY]]
[[PROMPT_END]]
