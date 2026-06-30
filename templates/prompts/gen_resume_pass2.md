# gen_resume_pass2
# Header info. Do not modify!
key: gen_resume_pass2
label: Resume Generation — Pass 2 (Feedback Loop)
temperature: 0.0
# description
Prompt generated for use in an external LLM session to evaluate a tailored
resume draft against the same scoring dimensions used in job evaluations, and
produce a structured correction list.

Requires context files: jobsearch.md and resume_template.typ already in session.
Runtime variable injections: {company_name}, {title}, {jd_text},
{keywords_text}, {keyword_gaps_text}, {line_count}, {target_lines},
{eval_scores_text}, {user_feedback}, {pass1_typ_text}.

Run this pass as many times as needed before proceeding to Pass 3.
Editable sections: scoring criteria, correction list format, user feedback instructions.
Read-only sections: job details, evaluation scores, line count data, draft resume.
---
[[PROMPT_START]]
[[EDITABLE]]
## CONTEXT

Your project files (jobsearch.md, resume_template.typ) are already in context.
You are evaluating a tailored resume draft for this role and producing a
structured correction list. Do not generate a new resume in this pass — only
evaluate and list corrections.

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

## RESUME LINE COUNT

Estimated body line count of the current draft: {line_count}
Target body line count: {target_lines}

A count above target means the resume is running long and bullets need
compression. A count below target means the resume needs expansion.

---

## USER FEEDBACK (if provided)

{user_feedback}

---

## DRAFT RESUME (.typ source)

{pass1_typ_text}

[[/READONLY]]
[[EDITABLE]]
## TASK: EVALUATE AND PRODUCE CORRECTION LIST

Review the draft resume above against the following dimensions. For each
dimension, identify specific corrections needed. Be concrete — name the
exact section, bullet, or sentence to change and what the change should be.

### Dimension 1 — ATS Signal

Does the resume contain the keyword and terminology signals an ATS would match
against this JD? Reference the ATS keywords and keyword gaps above.

- Flag any high-priority keywords from the list that are absent or buried.
- Suggest specific placements (which section, which bullet) for each missing keyword.
- Do not suggest fabricating claims — only surface keywords that can be added
  honestly based on jobsearch.md.

### Dimension 2 — Recruiter Fast-Pass (6-second scan)

Would a recruiter scanning for 6 seconds see the right signals for this role?

- Is the most recent title and company immediately visible and relevant?
- Does the summary lead with the right framing for this role type?
- Are the Key Impacts bullets front-loaded with the strongest signal?

### Dimension 3 — Recruiter Deep-Pass (full read)

Would a recruiter reading carefully see a coherent, credible narrative?

- Does the experience section tell a consistent story aligned with the JD?
- Are there any claims that would raise questions or require clarification?
- Are the Never rules from jobsearch.md applied consistently throughout?

### Dimension 4 — Candidate Fit (role)

Does the resume demonstrate the candidate can do this specific job?

- Are the most relevant skills and experiences prominently placed?
- Are there gaps between the JD requirements and what the resume surfaces?

### Dimension 5 — Candidate Fit (scope)

Does the resume demonstrate the candidate has operated at the right scope?

- Is the scope of past roles (team size, budget, org complexity) clearly visible?
- Does the framing match what this role requires?

### Dimension 6 — Candidate Fit (culture)

Does the resume signal alignment with the company's apparent culture and values?

- Reference the JD language around culture, values, or ways of working.
- Are there signals in the resume that reinforce or contradict this?

### Dimension 7 — Page Length

Is the resume at, above, or below the target line count?

- If above: list specific bullets to compress or cut, in priority order.
- If below: list specific sections to expand, in priority order.
- Do not suggest changing margins, font size, or template formatting.

---

## OUTPUT FORMAT

Output a structured correction list only. No prose summary before or after.

Use this format:

**CORRECTION LIST**

[DIMENSION: <name>]
- <specific correction — section/bullet/sentence + what to change>
- <specific correction>
...

[DIMENSION: <name>]
...

**SUMMARY**
- Total corrections: <N>
- Priority (must fix before Pass 3): <list the 3–5 highest-impact items>
- Optional (nice to have): <list any lower-priority items>
[[/EDITABLE]]
[[PROMPT_END]]
