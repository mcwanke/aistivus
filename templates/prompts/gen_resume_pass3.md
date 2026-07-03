# gen_resume_pass3
# Header info. Do not modify!
key: gen_resume_pass3
label: Resume Generation — Pass 3 (Final)
temperature: 0.0
# description
Prompt generated for use in an external LLM session to apply a correction list
from Pass 2 to a resume draft and produce a clean, final, ready-to-compile
.typ file.

Pure execution — no evaluation, no judgment, no content invented beyond what
the correction list explicitly instructs and jobsearch.md supports.

Requires context files: jobsearch.md and resume_template.typ already in session.
Runtime variable injections: {company_name}, {title}, {jd_text},
{pass1_typ_text}, {correction_list}, {line_count}, {target_lines}.

Editable sections: context, pre-execution verification, execution rules.
Read-only sections: job details, line count, draft resume, correction list,
output format.
---
[[PROMPT_START]]
[[EDITABLE]]
## CONTEXT

Your project files (jobsearch.md, resume_template.typ) are already in context.
You are applying a correction list to a resume draft to produce the final
version. This is a pure execution task — do not evaluate, judge, or suggest.
Apply each correction exactly as instructed and output the corrected .typ file.

Do not change anything that is not in the correction list.

[[/EDITABLE]]
[[READONLY]]
## JOB DETAILS

Company: {company_name}
Title: {title}

---

## JOB DESCRIPTION

{jd_text}

---

## RESUME LINE COUNT

Current body line count: {line_count}
Target body line count: {target_lines}

This is provided as a reference for the line fill fallback rule only.

---

## DRAFT RESUME (.typ source)

{pass1_typ_text}

---

## CORRECTION LIST

{correction_list}

[[/READONLY]]
[[EDITABLE]]
## PRE-EXECUTION VERIFICATION

Before applying any correction item whose ADD value introduces content not
already present in the draft, verify that supporting evidence exists in
jobsearch.md.

- If no evidence exists: skip the item. Note it after the .typ file — do not
  embed the note in the .typ file.
- If partial evidence exists: apply using only what jobsearch.md supports.
  Do not extend beyond it.

## EXECUTION RULES

The correction list uses this format per item:

[LOCATION: <section/bullet/field identifier>]
REMOVE: <exact current text, or NONE if pure addition>
ADD: <exact replacement or insertion text, or NONE if pure removal>
LINECHANGE: <signed integer estimate>
REASON: <one line>

**Finding locations:** Use the REMOVE text as the primary anchor — find the
exact REMOVE text in the .typ file and apply the correction there. If REMOVE
is NONE, use the LOCATION label to place the addition. If the REMOVE text
cannot be found verbatim, skip the item and note it after the .typ file.

Apply corrections in the order listed. For each item:
- Find the location using REMOVE text matching
- Replace REMOVE with ADD exactly as written — do not reinterpret, improve,
  or expand beyond what ADD says
- If ADD references a specific achievement or claim that requires sourcing
  candidate facts, source from jobsearch.md only — do not fabricate

### What you must not change

- Template structure: section order, heading labels, Typst layout and grid
  syntax
- Formatting: font sizes, spacing, margins, column definitions, line heights
- Any content not referenced by a correction item — including bullets, prose,
  competencies, or sections not mentioned in the correction list
- The resume header block unless a correction item explicitly targets it

### Conflict handling

If two correction items contradict each other (one wants to add content the
other wants to remove at the same location), apply the item that appears
earlier in the list. Note the conflict after the .typ file — do not embed
the note in the .typ file.

### Line fill fallback

After applying all corrections, compare the resulting content against the
target range. If still outside the target range and no correction item
addressed the gap:
- If short: add bullets to the most relevant sub-section of the most recent
  role, sourcing content from jobsearch.md. Do not fabricate.
- If long: tighten prose in the oldest role(s) first. Do not cut from the
  most recent role unless no other option exists.

Only apply the fallback if the correction list did not already close the gap.

### Chronology verification

After applying all corrections, verify all experience entries appear in
reverse chronological order — most recent role first. If any entry is out
of order, correct it.

### Escape character rule — MANDATORY

Typst treats #, $, and @ as special syntax. In all content you write or
modify:
- All # signs → \# (e.g. C\#)
- All $ signs → \$ (e.g. \$2M+, \$1.5M)
- @ signs in content blocks → \@ (the template header already escapes the
  email address — do not double-escape it)

This rule applies to any existing content you touch. If a correction causes
you to rewrite a line that contains an unescaped character, fix it.

[[/EDITABLE]]
[[READONLY]]
## OUTPUT FORMAT

Output the raw .typ file content only — nothing before it. The first line
must be:
`// PASS3_resume_{company_name}_{title}.typ`

Permitted plain text additions after the .typ file only (never inside it):
- A skipped-correction note for each item skipped due to missing evidence
  in jobsearch.md, or because REMOVE text could not be found verbatim
- A conflict note if the conflict handling rule applied
- A single sentence if the line fill fallback was applied and the target
  range still could not be reached without fabrication

[[/READONLY]]
[[PROMPT_END]]
