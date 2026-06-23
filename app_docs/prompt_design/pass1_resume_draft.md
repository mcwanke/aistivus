# pass1_resume_draft
key: pass1_resume_draft
label: Resume Generation — Pass 1 (First Draft)
# description
Generates a complete, tailored .typ resume file as a first-pass draft for a specific
job application. Outputs only the raw .typ file content, ready to save and compile.

Requires context files loaded into the session: jobsearch.md (candidate facts, tailoring
rules) and resume_template.typ (Typst structural base). Runtime variable injections:
{company_name}, {title}, {location}, {pay_band}, {jd_text}, {keywords_text},
{keyword_gaps_text}.

Editable sections: context file instructions, clarification gate, tailoring priorities,
page fill rule, bullet and escape rules, output format.
Read-only sections: job details injection, job description injection, evaluation input injection.
---
[[PROMPT_START]]
[[EDITABLE]]
## CONTEXT FILES

Your project files are already in context. Use jobsearch.md as the sole source of truth for all candidate facts.

## CLARIFICATION GATE

Before generating anything, verify the following. If anything is missing or ambiguous, ask a single clarifying question — do not guess or assume:

- Is a job description present below? If not, ask for it.
- Is a company name and role title present? If not, ask.
- If evaluation output (ATS keywords + keyword gaps) from a prior evaluation is not provided, note that you will extract keywords directly from the JD and flag any gaps you identify.
- If the role type or seniority level is ambiguous, ask before proceeding — this affects summary framing, which content to emphasize, and which tailoring rules apply.

Do not generate the resume until all required inputs are confirmed.

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

## EVALUATION INPUT (optional — paste if available)

If a prior evaluation was run for this role, paste the ATS keywords and keyword gaps here. The resume will use these to confirm coverage during generation.

ATS Keywords: {keywords_text}
Keyword Gaps: {keyword_gaps_text}

[[/READONLY]]
[[EDITABLE]]
## TASK: GENERATE TAILORED RESUME

Using **resume_template.typ** as the exact structural and formatting base, generate a complete, ready-to-compile .typ file tailored to this role. Use jobsearch.md as the sole source of truth for all candidate facts.

### Tailoring priorities (apply in order)

**1. Summary**
Apply all Always and Never rules from jobsearch.md Section 7 — these govern summary construction, framing, and voice. Lead with years of experience and domain breadth. Mirror the JD's language for the role's core responsibility. Close with a belief statement.

**2. Key Impacts (6–8 bullets)**
Select and order by relevance to this JD from achievements documented in jobsearch.md. Prioritize bullets where the signal directly mirrors a responsibility or qualification stated in the JD. Apply the Key Impacts selection logic from jobsearch.md Section 7.

**3. Core Competencies**
Two columns as defined in the template. Prioritize competencies that mirror JD language directly. Source from jobsearch.md skills section.

**4. Experience — most recent role(s)**
Always include. Tailor intro paragraph and bullets to emphasize what is most relevant to this JD. Compress or expand sub-sections based on relevance, but preserve the structure defined in the template.

**5. Experience — earlier roles**
Include and frame based on role type. Compress as tenure recedes. For roles where early-career IC work is low signal: single sentence, no bullets. For roles where early-career domain experience is directly relevant: 1–2 bullets surfacing the specific signal. Apply all Never rules from jobsearch.md — honesty framing on contributed-to vs. led is especially important for early IC work.

### Page fill rule

Target output is 2 full pages when compiled. If content is running short, expand to fill — prioritize adding bullets to the most relevant sub-section of the most recent role, then expand prose. If you cannot reach 2 pages without fabrication, append a single sentence after the .typ file content noting this.

### Bullet construction rule

Every bullet must lead with a concrete outcome, scale signal, or named artifact — not a verb phrase any manager could claim. Structure: **outcome or scale first → action that produced it → method or tool last (or omit)**. No numbers buried in dependent clauses. If the first 4–5 words of a bullet could appear on any resume for any company, rewrite it.

### Escape character rule — MANDATORY

Typst treats #, $, and @ as special syntax. Every instance of these characters in prose text and bullet content must be escaped:
- All # signs → \# (e.g. C\#)
- All $ signs → \$ (e.g. \$2M+, \$1.5M)
- @ signs in content blocks → \@ (the template header already escapes the email address — do not double-escape it; check all other content blocks for @ and escape any found)

Unescaped #, $, or @ in content will cause a compile error. This rule applies to every content block without exception.

### Header tagline rule

Use the resume header tagline as specified in jobsearch.md.

---
[[/EDITABLE]]
[[READONLY]]

## OUTPUT FORMAT

Output the raw .typ file content only — nothing before it, nothing after it. No prose, no section commentary, no explanation. The output should be ready to save directly as a .typ file and compile without modification. The only permitted addition is a single sentence appended after the file content if you cannot reach 2 pages without fabrication.

The first line of the .typ file must be a Typst comment with the suggested save filename using the company name and title below. Replace spaces with underscores and remove all special characters (commas, slashes, etc.):
`// PASS1_resume_{company_name}_{title}.typ`
[[/READONLY]]
[[PROMPT_END]]
