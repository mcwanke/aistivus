# gen_resume_pass2
# Header info. Do not modify!
key: gen_resume_pass2
label: Resume Generation — Pass 2 (Feedback Loop)
temperature: 0.0
# description
Prompt generated for use in an external LLM session to evaluate a tailored
resume draft against eight evaluation lenses (ATS, recruiter fast-pass,
recruiter deep-pass, candidate fit x3, seniority signal, voice & agency,
page length) and produce a structured, directly-executable correction list.

Requires context files: jobsearch.md and resume_template.typ already in session.
Runtime variable injections: {company_name}, {title}, {jd_text},
{keywords_text}, {keyword_gaps_text}, {line_count}, {target_lines},
{eval_scores_text}, {research_text}, {user_feedback}, {pass1_typ_text}.

{research_text} is sourced from the job_research table (latest record for the
job) — falls back to a "not available" message if no research has been run.

Run this pass as many times as needed before proceeding to Pass 3.
Editable sections: task steps, evaluation lens definitions, correction list rules.
Read-only sections: job details, evaluation scores, research data, line count
data, user feedback, draft resume, output format.
---
[[PROMPT_START]]
[[EDITABLE]]
## CONTEXT

Your project files (jobsearch.md, resume_template.typ) are already in context.
You are evaluating a tailored resume draft for this role and producing a
structured correction list. Do not generate a new resume in this pass — only
evaluate and list corrections.

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

Use this as the benchmark for the Candidate Fit — Culture lens below. Do not
re-research the company — this data is already gathered and stored.

{research_text}

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
## STEP 1 — JD SIGNAL EXTRACTION

Before running any evaluation lens, extract the specific, differentiating
language from the job description. This is not keyword extraction — it is
phrase and framing extraction.

Begin by reviewing the keyword gaps above. Note which gaps are still
unaddressed in the .typ file. Carry these forward — do not re-derive what has
already been identified.

Identify:
- **Specific outcomes named**: concrete deliverables, metrics, or challenges
  the JD describes by name. These are phrases written deliberately to
  describe what success looks like — not generic role expectations.
- **Specific ownership areas**: distinct responsibilities described as
  separate things. If the JD names more than one distinct surface, platform,
  or team function, list them separately.
- **Strategic framing**: language that signals how the company thinks about
  the role's purpose. Positioning signals that resonate strongly if mirrored
  and are invisible to a generic evaluation.
- **Named tools, practices, or terminology**: specifics beyond generic stack
  items — proprietary system names, specific workflow terms, named
  methodologies, named product surfaces.

For each extracted signal, check whether the resume has a counterpart and
mark it: yes / partial / absent. This step is the foundation for Steps 2–8.

## STEP 2 — ATS SIGNAL

Role: You are an ATS system. Will this resume pass automated keyword
scanning and reach human review?

Evaluate:
- Are the keywords from the list above present? Where are the gaps?
- Are keywords in the right density and locations (summary, key impacts,
  experience) or buried in only one section?
- Are any keyword gaps from above still unaddressed?
- Do not suggest fabricating claims — only surface keywords that can be
  added honestly based on jobsearch.md.

Output: verdict (pass / fail / uncertain), missing keywords with suggested
placement for each.

## STEP 3 — RECRUITER FAST-PASS (6-second scan)

Role: You are an overworked recruiter scanning for ~6-8 seconds. Will this
resume pass your smell test?

Evaluate:
- Is the most recent title and company immediately visible and relevant?
- Does the summary land immediately — can you tell in one sentence what this
  person does?
- Are the Key Impacts bullets front-loaded with the strongest signal?
- Is the visual hierarchy clean — does the eye land on the right things first?

Output: verdict (pass / fail), specific fail reasons if applicable.

## STEP 4 — RECRUITER DEEP-PASS (full read)

Role: You are a recruiter reading carefully after the fast-pass. Is the
narrative coherent and credible?

Evaluate:
- Does the experience section tell a consistent story aligned with the JD?
- Are there any claims that would raise questions or require clarification?
- Are the Never rules from jobsearch.md applied consistently throughout?

Output: verdict (pass / fail), notes.

## STEP 5 — CANDIDATE FIT (role, scope, culture)

Evaluate three sub-dimensions:

**Role fit** — does the resume demonstrate the candidate can do this specific
job? Are the most relevant skills/experiences prominently placed? Are there
gaps between JD requirements and what the resume surfaces?

**Scope fit** — does the resume demonstrate the candidate operated at the
right scope? Is team size, budget, or org complexity clearly visible? Does
the framing match what this role requires?

**Culture fit** — using the COMPANY RESEARCH block above as the benchmark
(not a fresh research pass), does the candidate's voice and framing match
what the company signals in their culture and values? Any red flags?

Output: one verdict (pass / fail / uncertain) per sub-dimension, with gaps
listed separately for role, scope, and culture.

## STEP 6 — SENIORITY SIGNAL

Evaluate whether the resume reads unambiguously at the level this role
requires.

- Does the scope of impact (team size, org influence, business outcomes)
  come through clearly as leadership-level, or could this be mistaken for a
  strong individual contributor resume?
- Is leadership scope visible and prominent, or buried in prose/dependent
  clauses where a quick scan would miss it?

Output: verdict (clear / ambiguous / reads-as-IC), notes.

## STEP 7 — VOICE & AGENCY

Recruiters and hiring managers respond poorly to theoretical or passive
framing. Evaluate whether the resume uses active, concrete language
throughout.

Look for and flag:
- Theoretical voice: "experienced in", "skilled at", "able to", "knowledge
  of", "familiar with" — these describe potential, not proof
- Passive framing: "was responsible for", "helped with", "assisted",
  "supported", "involved in", "contributed to" — these obscure agency
- Weak openings: bullets opening with a verb any manager could claim
  ("Managed", "Led", "Worked on") with no outcome or scale in the first clause
- Missing outcome: activity described with no result, metric, scale signal,
  or named artifact
- Buried outcome: a result exists but appears in a trailing clause rather
  than leading the bullet

Output: verdict (clean / has-issues), flagged bullets by opening words with
issue type noted.

## STEP 8 — PAGE LENGTH

Is the resume at, above, or below the target line count (see RESUME LINE
COUNT above)?

- If above target: list specific bullets to compress or cut, in priority order.
- If below target: list specific sections to expand, in priority order.
- Do not suggest changing margins, font size, or template formatting.
- If user feedback above states a specific gap estimate, treat it as
  directionally correct and reconcile against the computed line count rather
  than overriding it — do not assume the user is wrong.

**Line estimation math:** the line counter wraps bullet text at 97 characters
per line and prose text at 100 characters per line (each wrapped line = 1
body line; competency grid items are ceil(item_count / 2) for the whole
grid). Use this to roughly estimate the line delta of each REMOVE/ADD pair
(e.g., a 210-character bullet replaced with a 260-character bullet adds
roughly 1 line).

**Required net LINECHANGE target:** before writing any correction items,
calculate the delta needed to bring the resume to the lower bound of the
target range (e.g., if current is 79 and target is 93–102, required net
LINECHANGE = +14). State this as "Required net LINECHANGE: <value>" before
Step 9. Every expansion or cut decision in Step 9 must be made with this
target in mind from the start — not checked retroactively.

## STEP 9 — CORRECTION LIST SYNTHESIS

Synthesize Steps 2–8 into a single, flat, directly-executable correction
list. A downstream prompt will apply this list with no further judgment —
every item must be an instruction, not an observation.

**Grounding check (required before adding any new content):**
Before writing any item that adds content not already present in the .typ
file, verify supporting evidence exists in jobsearch.md. Classify as:
- **Addressable** — evidence exists; write the correction
- **Adjacent** — partial evidence exists; the ADD text must stay within what
  the evidence actually supports
- **True gap** — no evidence exists; do not write a correction for it, list
  it under a final "Not addressed — no supporting evidence" note instead

Do not generate conditional instructions ("if Kevin did X, add Y"). If you
cannot confirm something from jobsearch.md, do not generate the item.

Every item whose ADD value introduces content not already present verbatim
in the .typ file (i.e. ADD is not NONE and is not a reordering/trim of
existing text) must name the specific jobsearch.md fact, section, or line
that supports it in the REASON — not just the JD gap it closes. A REASON
that only explains why the addition is needed without citing where it comes
from is incomplete and must not be included.

**Location-based deduplication:**
Before finalizing, group every flagged item from Steps 2–8 by location (same
bullet, same sentence, same field). If two or more lenses target the same
location, merge them into a single correction item — never emit separate,
conflicting items for the same location.

**Keyword repetition cap:**
After drafting all items, scan the full set of ADD values for repeated
insertion of the same keyword or phrase (e.g. "product-led growth",
"self-serve", "instrumentation") across multiple locations. The ATS lens
will often justify inserting the same gap-keyword in several places —
that is expected at the per-lens stage, but the synthesized list must not
carry more than 2 insertions of any single keyword/phrase across the whole
correction list. If more than 2 locations would otherwise insert the same
term, keep it only in the 2 highest-impact locations (prioritize: summary,
then Key Impacts, then one experience bullet) and drop the rest — revert
those locations' ADD value to not include the term, or drop the item
entirely if the term was its only purpose.

Before output, build the KEYWORD FREQUENCY CHECK list required in the output
format below by literally counting occurrences of each distinct ATS/JD
keyword across all final ADD values. If any count exceeds 2, the correction
list above is not finished — go back and remove the excess occurrences first.
The check list you output must show counts of 2 or fewer for every keyword.

**Conflict resolution order:**
When merged items conflict (one lens wants to add/keep something another
wants to cut), resolve in this order: user feedback > grounding/fabrication
safety > Recruiter Fast-Pass > all other lenses. When a higher-precedence
lens overrides a lower one, add a one-line resolution note to that item
explaining the override. Do not leave a conflict unresolved or emit both
versions.

**No no-op items:**
If a lens confirms something is already correct, or a conflict resolves in
favor of keeping the current text unchanged, do not generate a correction
item for it. REMOVE and ADD must never be identical. A confirmation is not a
correction — leave it out of the list entirely.

**LINECHANGE verification:**
Before finalizing, confirm the sum of all LINECHANGE values lands within 3
lines of the required net target from Step 8. If it falls short and the
12-item cap is not yet reached, add expansion items targeting the
lowest-signal sections with prose-only paragraphs and no bullets (typically
earlier-career roles). If the cap is already exhausted, note the remaining
gap in LINE CHANGE TOTAL.

**Rules for every item:**
- Must be directly executable with no further judgment — write instructions,
  not observations or suggestions.
- No hedging language ("consider", "could", "or", "may want to") — pick one
  action.
- Maximum 12 correction items. If more are warranted, merge or drop the
  lowest-impact ones — do not split into priority/optional tiers.

[[/EDITABLE]]
[[READONLY]]
## OUTPUT FORMAT

Output the correction list only. No prose summary before or after. No
markdown code fences.

Use this exact format per item:

**CORRECTION LIST**

[LOCATION: <section/bullet/field identifier>]
REMOVE: <exact current text, or NONE if this is a pure addition>
ADD: <exact replacement or insertion text, or NONE if this is a pure removal>
LINECHANGE: <signed integer estimate, e.g. +1, -1, 0 — see Step 8 line math>
REASON: <one line max — why, and which lens(es) drove this>

[LOCATION: <next item>]
...

**NOT ADDRESSED**
- <signal or keyword, and why no correction was written — no supporting
  evidence in jobsearch.md>

**KEYWORD FREQUENCY CHECK**
- <keyword/phrase>: <count> (must be 2 or fewer)
...

**LINE CHANGE TOTAL**
- Sum of all LINECHANGE values: <signed integer>
- Resulting estimate: <current line_count> + <sum> = <new total>

[[/READONLY]]
[[PROMPT_END]]
