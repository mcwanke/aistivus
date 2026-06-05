# Resume Generation Prompt
<!-- ============================================================
     HOW TO USE
     ──────────
     Load alongside: jobsearch.md + resume_template.typ
     Input: Job details + (optional) prior evaluation output
     Output: Complete, ready-to-compile .typ resume file
     Do NOT evaluate the role in this prompt — evaluation is separate.

     This prompt contains no candidate-specific facts.
     All personal data, career history, employer names, metrics,
     tailoring rules, and style preferences live in jobsearch.md
     and resume_template.typ — the sole sources of truth.
     ============================================================ -->

---

## CONTEXT FILES

You have been provided the following files. Read both completely before
doing anything else:

- **jobsearch.md** — candidate profile, career history, tailoring rules
  (Always/Never), and model behavior rules. Every factual claim in the
  resume must be sourced from here.
- **resume_template.typ** — the structural and formatting base. Populate
  every [CONTENT: ...] block. Do not modify any formatting, font, color,
  layout, or helper function code — structure is fixed.

Confirm you have read both files before proceeding.

---

## CLARIFICATION GATE

Before generating anything, verify the following. If anything is
missing or ambiguous, ask a single clarifying question — do not guess
or assume:

- Is a job description present below? If not, ask for it.
- Is a company name and role title present? If not, ask.
- If evaluation output (ATS keywords + keyword gaps) from a prior
  evaluation is not provided, note that you will extract keywords
  directly from the JD and flag any gaps you identify.
- If the role type or seniority level is ambiguous, ask before
  proceeding — this affects summary framing, which content to
  emphasize, and which tailoring rules apply.

Do not generate the resume until all required inputs are confirmed.

---

## JOB DETAILS

Company: [COMPANY NAME]
Title: [ROLE TITLE]
Location: [LOCATION / REMOTE]
Pay Band: [SALARY RANGE or "Not listed"]

---

## JOB DESCRIPTION

[PASTE FULL JOB DESCRIPTION HERE]

---

## EVALUATION INPUT (optional — paste if available)

If a prior evaluation was run for this role, paste the ATS keywords
and keyword gaps here. The resume will confirm coverage against these
and flag any gaps that cannot be addressed without fabrication.

ATS Keywords: [PASTE or "Not provided — will extract from JD"]
Keyword Gaps: [PASTE or "Not provided — will extract from JD"]

---

## TASK: GENERATE TAILORED RESUME

Using **resume_template.typ** as the exact structural and formatting
base, generate a complete, ready-to-compile .typ file tailored to
this role.

### Rules — non-negotiable

- Use **jobsearch.md as the sole source of truth** for all facts.
  Never fabricate, inflate, or soften claims beyond what is documented.
- Apply **all Always and Never rules from the tailoring rules section
  of jobsearch.md** without exception. If a rule conflicts with a
  tailoring decision, apply the rule and flag the conflict — do not
  silently override.
- Do **not** modify any Typst formatting code — only populate
  [CONTENT: ...] blocks.
- **Target output: 2 pages when compiled.** If content runs long,
  compress experience bullets — do not adjust margins or font size.

### Tailoring priorities

Apply these in order based on the role type inferred from the JD.
All content must be drawn from jobsearch.md — these are selection
and ordering instructions, not content.

1. **Summary:** Lead with years of experience and domain breadth.
   Mirror the JD's language for the role's core responsibility.
   Close with a belief statement. Apply all style rules from the
   Never section of jobsearch.md (e.g. sentence construction rules).

2. **Key Impacts:** 6–8 bullets selected and ordered by relevance
   to this specific JD. Use the candidate's documented achievements
   from jobsearch.md. Apply the following selection logic:

   - **People development / manager pipeline:** Include when the role
     involves developing managers or building leadership depth. Drop
     or compress for IC-heavy or technical roles where this is low signal.
   - **AI tooling adoption:** Include for most roles. Compress if space
     is tight. Drop only if the JD has zero AI/tooling signal and a
     stronger bullet serves better.
   - **Largest scale / growth metric:** Include for growth, consumer,
     acquisition, or product-scale roles. Use the candidate's strongest
     documented scale signal from jobsearch.md.
   - **Regulated/compliance delivery:** Include for regulated, enterprise,
     government, or healthcare-adjacent roles.
   - **Cloud/platform delivery:** Include for platform, SaaS, or
     cloud-infrastructure roles.
   - **0-to-1 product launch:** Include for hardware, IoT, or
     build-from-scratch roles.
   - **Distributed remote team leadership:** Include when the JD
     explicitly values distributed or async team management.
   - **Operational excellence / incident response:** Include when the
     JD calls out reliability, observability, or engineering process rigor.

3. **Core Competencies:** Two columns as defined in the template.
   Prioritize competencies that mirror JD language directly.
   Source from jobsearch.md skills and strengths sections.

4. **Experience — most recent role(s):** Always include. Tailor the
   intro paragraph and bullets to emphasize what is most relevant to
   this JD. The template defines the sub-section structure — follow it.
   Compress or expand sub-sections based on relevance, but preserve
   the structure defined in the template.

5. **Experience — earlier roles:** Include and frame based on role type
   using the tailoring guidance in jobsearch.md. Earlier roles should
   compress as tenure recedes — preserve the most relevant signal and
   drop lower-signal detail to protect page budget.

   - For roles where early-career IC work is low signal: default to a
     single sentence with no bullets.
   - For roles where early-career domain experience is directly relevant
     (e.g. data platform, embedded systems, enterprise data): expand to
     1–2 bullets surfacing the specific signal. Source from jobsearch.md.
   - Apply all Never rules from jobsearch.md to early-career entries —
     honesty framing on contributed-to vs. led is especially important
     for early IC work.

### Keyword coverage check

After completing the resume, output a brief keyword coverage note:

> **Keyword Coverage:**
> - Covered: [keywords confirmed present in the resume]
> - Gaps remaining: [JD keywords not addressable without fabrication,
>   with a one-sentence note on why]

### Flagging rule

If any bullet in the tailored resume could be challenged in an
interview based on the Never rules in jobsearch.md, flag it inline:
`// ⚠ FLAG: [reason]`

---

## OUTPUT FORMAT

Deliver the complete .typ file content. Do not include explanatory
prose before or after — just the file, ready to compile.