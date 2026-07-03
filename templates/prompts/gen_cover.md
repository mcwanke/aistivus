# gen_cover
# Header info. Do not modify!
key: gen_cover
label: Cover Letter Generation Prompt
temperature: 0.0
# description
Prompt generated for use in an external LLM session to produce a tailored
cover letter .typ file for a specific job application.

Requires context files: jobsearch.md (candidate facts, tailoring rules),
jobsearch_cover.md (voice, Always/Never rules, reusable blocks, hook guidance),
and cover_letter_template.typ (Typst structural base). Runtime variable
injections: {company_name}, {title}, {website_display}, {jd_text},
{research_text}.

Editable sections: context file instructions, hard stop rule, clarification
gate, research review step, pre-draft checklist step, proposal step,
generation step rules and architecture, output format (includes
conditional post-delivery note). Read-only sections: job details
injection, job description injection, research data injection.
---
[[PROMPT_START]]
[[EDITABLE]]
## CONTEXT FILES

You have been provided the following files. Read all completely before
doing anything else:

- **jobsearch.md** — candidate profile, career history, and tailoring
  rules. The master factual source of truth for all claims.
- **jobsearch_cover.md** — cover letter voice, Always/Never rules,
  reusable content blocks, hook guidance, and generation instructions.
  Apply the Voice & Rules section and Pre-Draft Checklist without
  exception.
- **cover_letter_template.typ** — the structural and formatting base.
  Populate every [CONTENT: ...] block. Do not modify any formatting,
  font, color, layout, or helper function code.

Confirm you have read all three files before proceeding.

## ⛔ HARD STOP RULE

**Do not write a single word of the cover letter until the user has
confirmed the salutation, tone descriptor, and hook.** Propose first.
Write second. Always.

## CLARIFICATION GATE

Before doing anything else, verify the following. If anything is
missing, ask a single clarifying question — do not guess or assume:

- Is a job description present below? If not, ask for it.
- Is a company name and role title present?
- Is research data present below? If it says "not available," a generic
  letter is worse than no letter — ask the user to run Research for this
  job first, or paste relevant About/Mission/Culture content directly.
- Is any personal hook seed, scratchpad note, or context about this
  company provided? If not, note that you will propose a hook based
  on the research below — the user can accept, override, or request
  alternatives.
- If jobsearch_cover.md defines any scope framing rules that apply to
  this role type (e.g. a specific intent statement for certain
  seniority levels), flag whether it should be included and ask for
  confirmation.

Do not begin the proposal until all required inputs are present.

[[/EDITABLE]]
[[READONLY]]
## JOB DETAILS

Company: {company_name}
Role Title: {title}
Company Website: {website_display}
Hook Seed (optional):

---

## JOB DESCRIPTION

{jd_text}

---

## COMPANY RESEARCH (pre-gathered — do not re-research)

{research_text}

[[/READONLY]]
[[EDITABLE]]
## STEP 1 — REVIEW RESEARCH

Review the company research above. Note specific language, themes, and
values worth mirroring in the letter. This research has already been
gathered — do not fetch the company website or browse the web.

## STEP 2 — PRE-DRAFT CHECKLIST

Before proposing anything, run the Pre-Draft Checklist from the
Pre-Draft Checklist section of jobsearch_cover.md. Complete every
item — do not skip or summarize.

## STEP 3 — PROPOSAL (wait for confirmation before drafting)

After completing research and the checklist, propose the following.
Ask the user to confirm, adjust, or override before writing the letter:

**SALUTATION:** Suggested salutation with a one-sentence rationale.
  Apply the salutation guidance from jobsearch_cover.md — personable
  is the default bias unless the context calls for formal. Explain
  the choice.

**TONE:** One-word tone descriptor with a one-sentence rationale
  based on your company culture read. Reference the tone guidance in
  jobsearch_cover.md.

**HOOK:** A 2–3 sentence description of the opening angle you propose,
  grounded specifically in your company research. Explain why this hook
  is specific to this company and could not appear in any other letter.
  Reference the hook guidance and hook bank in jobsearch_cover.md for
  principles — do not reuse archived hooks verbatim.

**GAP FLAG:** If a meaningful gap exists between the candidate's
  background and this role, name it and ask whether to include the
  optional gap acknowledgment block defined in jobsearch_cover.md.

Then ask:
> "Want to proceed with these, or would you like to adjust anything
>  before I draft?"

**Do not write the letter until the user replies with confirmation.**

## STEP 4 — GENERATE COVER LETTER

After confirmation, generate the complete cover letter using
**cover_letter_template.typ** as the exact structural and formatting
base. Populate every [CONTENT: ...] block.

### Rules — non-negotiable

- Use **jobsearch.md and jobsearch_cover.md as the sole sources of
  truth** for all facts, voice, and reusable block content.
- Apply **all Always and Never rules from jobsearch_cover.md** and
  **jobsearch.md** without exception.
- Do **not** modify any Typst formatting code — only populate
  [CONTENT: ...] blocks.
- **Target: one page.** One page is the constraint — word count is a
  byproduct. If the draft runs long, tighten the body before
  delivering. Do not ask the user to cut it. Do not adjust margins
  or font size to compensate.
- The closing block defined in the template is fixed — do not modify it.

### Letter architecture

Follow the letter architecture defined in jobsearch_cover.md. Apply
the block selection and ordering guidance from the Generation
Instructions section — including which blocks are defaults, which are
conditional, and when to lead with a domain opener vs. the engineering
pillar directly.

### Flagging rule

If any claim in the letter could be challenged in an interview based
on the Never rules in jobsearch.md, do not flag it inline in the file —
the .typ output must contain no comments, callouts, or annotations of
any kind. Instead, list flagged claims in your chat response after
delivering the file.

### JD/org grounding rule

At least one sentence outside the hook — in a pillar paragraph or the
closing — must reference something specific from the JD or the
research above (a stated responsibility, team structure, or priority).
A letter that is only specific in the hook and generic everywhere
after reads as a strong opener bolted onto a form letter.

### Final check before delivering

Verify the company-specific closing line has been updated for this
company — this is the most common copy-paste error. Do not deliver
without confirming it.

## OUTPUT FORMAT

Deliver the complete .typ file content. No comments, callouts, or
annotations inside the file — it is never read as a document, only
compiled. No explanatory prose before or after, with one exception:
if a block in Section 4 of jobsearch_cover.md had a notably strong
variation in this letter, append one line after the file:
"Block [X] had a strong variation worth archiving — update
jobsearch_cover.md?" The user confirms before any update is written.
[[/EDITABLE]]
[[PROMPT_END]]
