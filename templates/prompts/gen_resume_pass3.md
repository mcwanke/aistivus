# gen_resume_pass3
# Header info. Do not modify!
key: gen_resume_pass3
label: Resume Generation — Pass 3 (Final)
temperature: 0.0
# description
Prompt generated for use in an external LLM session to apply a structured
correction list (JSON) from Pass 2 to a resume draft and produce the final,
ready-to-compile .typ file.

Pure execution — no evaluation, no judgment. Apply each correction exactly as
instructed and output the corrected .typ file.

Requires context files: jobsearch.md and resume_template.typ already in session.
Runtime variable injections: {company_name}, {title}, {jd_text},
{pass1_typ_text}, {correction_json}.

Editable sections: context, pre-execution verification, execution rules.
Read-only sections: job details, draft resume, correction list, output format.
---
[[PROMPT_START]]
[[EDITABLE]]
## CONTEXT

Your project files (jobsearch.md, resume_template.typ) are already in context.
You are applying a correction list to a resume draft to produce the final
version. This is a pure execution task — do not evaluate, judge, or suggest.

Apply each correction exactly as instructed and output the corrected .typ file.

**Do not change anything that is not in the correction list.**

---

## PRE-EXECUTION VERIFICATION

For each correction whose ADD value introduces content not already present in
the draft:

- **Supporting evidence exists in jobsearch.md:** Apply the correction.
- **Partial evidence exists:** Apply using only what jobsearch.md supports. Do not extend beyond it.
- **No supporting evidence exists:** Skip the correction. Note it after the .typ file — do not embed in the file.

---

## EXECUTION RULES

The correction list uses this JSON format per item:

```json
{
  "location": "<section/bullet/field identifier>",
  "remove": "<exact current text, or null if pure addition>",
  "add": "<exact replacement or insertion text, or null if pure removal>",
  "reason": "<one line explanation>"
}
```

### Finding locations

Use the REMOVE text as the primary anchor — find the exact REMOVE text in the
.typ file and apply the correction there.

- If REMOVE is null: use the LOCATION label to place the addition.
- If the REMOVE text cannot be found verbatim: skip the item and note it after
  the .typ file.

### Applying each correction

Apply corrections in the order listed. For each item:
1. Find the location using REMOVE text matching
2. Replace REMOVE with ADD exactly as written — do not reinterpret, improve, or
   expand beyond what ADD says
3. If ADD references a specific achievement or claim, source it from jobsearch.md
   only — do not fabricate

### What you must not change

- Template structure: section order, heading labels, Typst layout and grid syntax
- Formatting: font sizes, spacing, margins, column definitions, line heights
- Any content not referenced by a correction item — including bullets, prose,
  competencies, or sections not mentioned in the list
- The resume header block unless a correction item explicitly targets it

### Conflict handling

If two correction items contradict each other (one wants to add content the other
wants to remove at the same location), apply the item that appears earlier in
the list. Note the conflict after the .typ file — do not embed it in the file.

### Chronology verification

After applying all corrections, verify all experience entries appear in reverse
chronological order — most recent role first. If any entry is out of order,
correct it.

### Typst escape character rule — MANDATORY

Typst treats #, $, and @ as special syntax. In all content you write or modify:
- All # signs → \# (e.g. C\#)
- All $ signs → \$ (e.g. \$2M+)
- @ signs in content blocks → \@ (template header already escapes email)

This rule applies to any existing content you touch. If a correction causes you
to rewrite a line that contains an unescaped character, fix it.

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

## CORRECTION LIST (JSON)

{correction_json}

[[/READONLY]]
[[EDITABLE]]

## FINAL CHECKS BEFORE OUTPUTTING

Before outputting the .typ file:

1. ✅ All corrections applied in order
2. ✅ No REMOVE text searches failed (or noted if they did)
3. ✅ All experience entries in reverse chronological order
4. ✅ Typst special characters escaped correctly
5. ✅ Template structure unchanged (layout, spacing, grid, fonts)
6. ✅ No content fabricated — all additions sourced from jobsearch.md or existing text
7. ✅ No content changed outside the correction list

[[/EDITABLE]]
[[READONLY]]
## OUTPUT FORMAT

Output the .typ file as a downloadable artifact with typst language specification.
The first line must be: `// {resume_counter}_{company_name}.typ`

If any corrections were skipped or conflicts detected, add a single note line
after the artifact: `Note: [X items skipped, Y conflicts detected] — ask me for details if needed.`

If no issues, output the artifact only — nothing after it.

[[/READONLY]]
[[PROMPT_END]]
