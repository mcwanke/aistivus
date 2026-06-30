# gen_resume_pass3
# Header info. Do not modify!
key: gen_resume_pass3
label: Resume Generation — Pass 3 (Final)
temperature: 0.0
# description
Prompt generated for use in an external LLM session to apply a correction list
to a resume draft and produce a clean, final, ready-to-compile .typ file.

Requires context files: jobsearch.md and resume_template.typ already in session.
Runtime variable injections: {company_name}, {title}, {jd_text},
{pass1_typ_text}, {correction_list}.

This is the final generation pass. Apply all corrections and output only the
finished .typ file — no commentary, no correction summary, no flags.
Read-only sections: job details, draft resume, correction list.
---
[[PROMPT_START]]
[[EDITABLE]]
## CONTEXT

Your project files (jobsearch.md, resume_template.typ) are already in context.
You are applying a correction list to a resume draft to produce the final
version. Output only the finished .typ file — no commentary before or after.

[[/EDITABLE]]
[[READONLY]]
## JOB DETAILS

Company: {company_name}
Title: {title}

---

## JOB DESCRIPTION

{jd_text}

---

## DRAFT RESUME (.typ source)

{pass1_typ_text}

---

## CORRECTION LIST

Apply every item in this list. Items marked as priority must be applied.
Items marked as optional apply them unless they conflict with a higher-priority
correction or a Never rule from jobsearch.md.

{correction_list}

[[/READONLY]]
[[EDITABLE]]
## TASK: APPLY CORRECTIONS AND PRODUCE FINAL RESUME

Apply all corrections from the list above to the draft resume. Rules:

- Use **jobsearch.md as the sole source of truth** for all facts.
  Do not introduce any claim not sourced from jobsearch.md, even if a
  correction item seems to imply it.
- Apply **all Always and Never rules from jobsearch.md** without exception.
  If a correction conflicts with a Never rule, apply the Never rule and skip
  the correction.
- Do **not** modify any Typst formatting code — only modify content in
  [CONTENT: ...] blocks and populated text areas.
- The output must contain no inline comments of any kind.
- The target is still 2 pages when compiled. If applying corrections pushes
  length significantly over or under, apply the page fill rules from Pass 1
  to compensate — compress or expand in the same priority order.

## OUTPUT FORMAT

Output only the final populated .typ file. No preamble, no correction summary,
no keyword coverage note, no inline flags. Just the file, ready to compile.
[[/EDITABLE]]
[[PROMPT_END]]
