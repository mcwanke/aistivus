# gen_resume_pass1
# Header info. Do not modify!
key: gen_resume_pass1
label: Resume Generation — Pass 1 (Initial Draft)
temperature: 0.0
# description
Prompt generated for use in an external LLM session to produce a tailored
resume .typ file for a specific job application.

Uses a structured internal planning phase (per-section content planning →
line count estimation → adjustment) before generation to reliably hit the
92–103 body-line target. Evaluation scores and company research are used
during planning to set priorities before writing begins.

Requires context files: jobsearch.md (candidate facts, tailoring rules) and
resume_template.typ (Typst structural base). Runtime variable injections:
{company_name}, {title}, {location}, {pay_band}, {jd_text}, {keywords_text},
{keyword_gaps_text}, {eval_scores_text}, {research_text}.

Editable sections: context instructions, clarification gate, keyword gap
classification, task overview, tailoring rules, planning steps, output format.
Read-only sections: job details injection, job description injection,
evaluation input injection, evaluation scores injection, research injection.
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
  other. If the JD title is non-standard, proceed with your best classification
  and flag it in the output notes.
- If evaluation output (ATS keywords + keyword gaps) is not provided, note it
  and extract keywords directly from the JD during planning.

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

Use these scores to set planning priorities in Step 1. A low score in a
dimension means that dimension needs more deliberate attention in the draft.

{eval_scores_text}

---

## COMPANY RESEARCH

Use this to align summary framing, culture signals, and role context with
how the company describes itself. Do not re-research — this data is already
gathered.

{research_text}

[[/READONLY]]
[[EDITABLE]]
## KEYWORD GAP CLASSIFICATION

Before planning, classify each keyword gap from EVALUATION INPUT:

- **(a) Addressable** — evidence exists in jobsearch.md. Plan to include.
- **(b) Adjacent** — partial evidence exists. Note the bridge. Plan to frame
  accordingly.
- **(c) True gap** — no evidence in jobsearch.md. Do not include anywhere in
  the resume.

Carry this classification into Step 1. Never incorporate (c) gaps.

---

## TASK OVERVIEW

You are generating a tailored resume for a specific job application. Every
planning decision and every word written must serve three goals:

1. **Pass ATS screening** — the right keywords appear in the right density
   and locations so automated systems route this resume to human review.
2. **Signal a strong candidate to a recruiter** — within the first few seconds
   of scanning, the resume communicates that this person is qualified for this
   specific role.
3. **Demonstrate credible fit to a hiring manager** — the candidate's actual
   scope, achievements, and experience map visibly to what this JD requires.

The EVALUATION SCORES above tell you where the baseline assessment is weak —
use this to weight your planning decisions before writing begins. A low ATS
score means keyword placement must be aggressive from the start. A low scope
fit score means scope signals must be surfaced prominently. A low culture fit
score means the summary and framing must draw on COMPANY RESEARCH to mirror
the company's stated values.

All content must be grounded in jobsearch.md — not because it is a rule, but
because a resume that fabricates or overstates will fail in the interview
regardless of how well it screens.

---

## TAILORING RULES

Read and internalize before planning. These govern every decision in Steps 1–2.

### Header tagline

- Target role is EM or Senior EM: use "Senior Engineering Manager"
- Target role is Director, VP, or equivalent: use the Director framing from
  jobsearch.md
- Target role title doesn't map to either: use the JD title directly

### Summary

Apply all Always and Never rules from jobsearch.md Section 7. Lead with years
of experience and domain breadth. Mirror the JD's language for the role's core
responsibility. Draw on COMPANY RESEARCH to align framing with how the company
describes itself and the role's purpose. Close with a belief statement.

Hard limit: ≤ 4 sentences. Plan for ≤ 4 body lines. A recruiter's fast-pass
scan is ~6 seconds — a 5-sentence summary in monospace font is not readable
in that window. If you cannot say it in 4 sentences, cut the weakest one.

### Key Impacts (6–8 bullets)

Select and order by relevance to this JD from achievements in jobsearch.md.
Prioritize bullets where the signal directly mirrors a JD responsibility or
required qualification. Apply this selection logic:

- **People development / manager pipeline:** Include when the role involves
  developing managers or building leadership depth. Drop for IC-heavy or
  technical roles where this is low signal.
- **AI tooling adoption:** Include for most roles. Compress if space is tight.
  Drop only if the JD has zero AI/tooling signal and a stronger bullet serves
  better.
- **Largest scale / growth metric:** Include for growth, consumer, acquisition,
  or product-scale roles. Use the candidate's strongest documented scale signal.
- **Regulated/compliance delivery:** Include for regulated, enterprise,
  government, or healthcare-adjacent roles.
- **Cloud/platform delivery:** Include for platform, SaaS, or
  cloud-infrastructure roles.
- **0-to-1 product launch:** Include for hardware, IoT, or
  build-from-scratch roles.
- **Distributed remote team leadership:** Include when the JD explicitly values
  distributed or async team management.
- **Operational excellence / incident response:** Include when the JD calls out
  reliability, observability, or engineering process rigor.

### Core Competencies

Two columns as defined in the template. Prioritize competencies that mirror JD
language directly. Source from jobsearch.md skills section.

### Experience — most recent role(s)

Always include. Tailor intro paragraph and bullets to emphasize what is most
relevant to this JD. Compress or expand sub-sections based on their relevance —
what this specific JD asks for determines how much space each sub-section gets.

Use exactly the three Plex sub-sections defined in jobsearch.md under "Plex
sub-section structure" — including the correct flex label for the third
sub-section based on the JD signals described there. Do not invent, rename,
or add sub-sections.

### Experience — earlier roles

Frame based on relevance. Compress as tenure recedes. For roles where
early-career IC work is low signal for this JD: single sentence, no bullets.
For roles where early-career domain experience is directly relevant: 1–2 bullets
surfacing the specific signal. Apply all Never rules from jobsearch.md —
honesty framing on contributed-to vs. led is especially important for early roles.

### Bullet construction rule

Every bullet must lead with a concrete outcome, scale signal, or named artifact —
not a verb phrase. Structure: outcome or scale first → action that produced it →
method or tool last (or omit). No numbers buried in dependent clauses. If the
first 4–5 words could appear on any resume for any company, rewrite it.

---

## STEP 1 — SECTION PLANNING

*Internal planning only — do not output this step.*

With the tailoring rules, task overview, evaluation scores, and company research
fully in context, work through each section of the resume template in order.
For each section, decide its content and structure for this specific role.
Use the evaluation scores to weight your decisions — weak dimensions need
more deliberate coverage, not just the default treatment.

**For each prose block** (summary, role intro paragraphs):
- How many sentences does this block need for this role?
- What is the core claim of each sentence?
- Is each sentence grounded in jobsearch.md? If not, remove it from the plan.
- Target ≤ 100 characters per sentence to stay at 1 line. Sentences over 100
  characters will wrap and cost an extra line.

**For each bullet section** (key impacts, experience sub-sections):
- How many bullets does this section need for this role?
- For each planned bullet, confirm two things before committing to it:
  1. **Leading outcome:** What concrete outcome, scale signal, or named artifact
     opens this bullet? If you cannot identify one, do not plan this bullet.
  2. **Source:** What section, role, or achievement in jobsearch.md supports
     this claim? If no source exists, do not plan this bullet.
- Target ≤ 97 characters per bullet to stay at 1 line. Bullets over 97
  characters will wrap and cost an extra line.

---

## STEP 2 — LINE COUNT ESTIMATION AND ADJUSTMENT

*Internal planning only — do not output this step.*

Using your section plan from Step 1, estimate each section's body content line
contribution. Body content lines are prose sentences and bullets only — exclude
section headers, the resume header block, blank separator lines, and template
structure lines.

**Estimation rules:**
- Prose sentence ≤ 100 chars = 1 line. Prose sentence > 100 chars = 2 lines.
- Bullet ≤ 97 chars = 1 line. Bullet > 97 chars = 2 lines.
- Competency grid: ceil(item_count / 2) lines for the whole grid.

Sum the per-section estimates. **Target total: 82–90 lines.**

If outside the target range, adjust specific sections — not the overall
bullet:prose ratio. The ratio is determined by what this role needs.

- **Over 90:** Compress oldest roles first. Do not cut from the most recent
  role unless no other option exists; note why if you do.
- **Under 82:** Expand the most relevant sub-section of the most recent role —
  add bullets sourced from jobsearch.md or extend an intro paragraph. Do not
  fabricate. If you cannot reach 82 without fabrication, note it.

Revise your section plan until the estimate lands in 82–90. This is the plan
Step 3 executes.

---

## STEP 3 — GENERATE

*Output begins here — output the .typ file only, per the output format below.*

Using resume_template.typ as the exact structural base, generate the complete
.typ file following your adjusted plan from Steps 1 and 2.

Before outputting, verify all experience entries appear in reverse chronological
order — most recent role first. Correct any that are out of order.

If a planned element doesn't work as written during generation (a bullet loses
its leading outcome, a sentence runs long), adjust locally and note the change
after the file.

[[/EDITABLE]]
[[READONLY]]
## OUTPUT FORMAT

Output the raw .typ file content only. Nothing before it. The first line must be:
`// PASS1_resume_{company_name}_{title}.typ`

Permitted plain text additions after the .typ file (never inside it as Typst
comments):
- A note for each planned bullet dropped during planning and which section it
  was planned for
- A note for each (c) true gap keyword excluded
- A note if you deviated from your Step 2 plan during generation and why
- A single sentence if 82–90 lines could not be reached without fabrication

[[/READONLY]]
[[PROMPT_END]]
