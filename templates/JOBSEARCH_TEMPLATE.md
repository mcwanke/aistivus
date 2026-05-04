# Job Search Context
<!--
  HOW TO USE THIS FILE
  ────────────────────
  Copy this file to jobsearch.md in the project root and fill it in.
  This file is gitignored — your personal data stays on your machine.

  This file is the AI's primary context document. It is loaded into
  every evaluation and generation prompt. Keep it accurate and concise.

  Section markers:
  [FILL]     = requires your input
  [AUTO]     = generate from existing Claude conversation threads
  [EVOLVING] = update regularly as your search progresses

  Size guidance: target under 500 lines. Every line costs tokens on
  every prompt. The system will warn you if it gets too large.

  Application tracking has moved to the database — no need to maintain
  a manual log here. Use the Evaluations and Applications pages in the
  web interface instead.
-->

---

## 1. Who I Am
<!-- One tight paragraph. Background, seniority level, defining strengths. -->

**Name:** [FILL]
**Current status:** Actively job searching as of [FILL — month/year]
**Years of experience:** [FILL]
**Location / work preference:** [FILL — e.g. Remote-first, open to hybrid in [city]]
**Portfolio / online presence:** [FILL — e.g. yoursite.com | github.com/yourhandle]

**Professional summary (2-3 sentences):**
[FILL — distill your bio here. What you've built, at what scale, how you lead.]

---

## 2. Career History (Reverse Chronological)
<!-- Enough detail for the model to map your experience to a JD. Be specific. -->

### [FILL — Most Recent Role Title] @ [Company]
- **Dates:** [FILL]
- **Team size / scope:** [FILL]
- **Key achievements:** [FILL — 3-5 bullets, metric-driven where possible]
- **Tech / tools:** [FILL]

### [FILL — Previous Role] @ [Company]
- **Dates:** [FILL]
- **Team size / scope:** [FILL]
- **Key achievements:** [FILL]
- **Tech / tools:** [FILL]

<!-- Repeat as needed. Go back ~10-15 years max. -->

---

## 3. Skills & Strengths

**Technical:**
[FILL — e.g. Python, distributed systems, cloud infra, etc.]

**Leadership / Management:**
[FILL — e.g. hiring, performance management, roadmap ownership, cross-functional alignment]

**Domain expertise:**
[FILL — e.g. consumer mobile, SaaS platforms, IoT/hardware, fintech, etc.]

**Soft skills / differentiators:**
[FILL — what consistently comes up in feedback? What makes you distinct?]

---

## 4. Target Role Profile

**Titles I'm targeting:**
[FILL — e.g. Engineering Manager, Director of Engineering, Staff Engineer]

**Titles I'm open to:**
[FILL — stretch roles or lateral moves worth considering]

**Titles I'm NOT interested in:**
[FILL — helps the model flag mismatches quickly]

**Industries I prefer:**
[FILL]

**Industries I'll consider:**
[FILL]

**Industries I want to avoid:**
[FILL]

**Company size preference:**
[FILL — e.g. Series B–D startup, or established company <5000 employees]

**Compensation target:**
[FILL — base range, equity expectations, total comp floor]

**Must-haves in a role:**
[FILL — e.g. engineering influence over product, no on-call, autonomy]

**Deal-breakers:**
[FILL — e.g. return-to-office mandate, no-equity, pure IC with no growth path]

**Known stretch areas / documented gaps:**
[FILL — be honest here; the model uses this to flag roles where you'll be defending gaps]

---

## 5. Resume Master Copy
<!--
  Paste your full resume text here in plain text or markdown.
  This is the source of truth the model tailors FROM.
  Update this section whenever you update your actual resume.
-->

[FILL — paste full resume here]

---

## 6. Tailoring Rules
<!--
  Rules the model must follow when generating tailored resumes or cover letters.
  Generate initial content from existing Claude threads, update as you learn
  what works and what doesn't.
-->

**Always:**
- [AUTO — e.g. Lead with people impact before technical detail]
- [AUTO — e.g. Use "led" not "managed" — avoid passive verb choices]
- [AUTO — e.g. Mirror the JD's language for the role's core responsibility]

**Never:**
- [AUTO — e.g. Don't omit hardware/embedded work — it's a differentiator]
- [AUTO — e.g. Don't use "responsible for" — replace with action verbs]
- [AUTO — e.g. Don't inflate scope claims beyond what's defensible in an interview]

**Cover letter voice:**
[AUTO — e.g. Warm, direct, specific. No hollow openers like "I am excited to apply..."]

---

## 7. JD Evaluation Framework
<!--
  When a JD is pasted, the model evaluates it against this framework.
  Scores and output format are used to generate the structured evaluation.
-->

### Scoring criteria (rate each 1-5):
- **Role fit** — Does the title/level match my target profile?
- **Scope fit** — Is the team size, ownership, and complexity a match?
- **Culture signals** — Does the JD language suggest a place I'd thrive?
- **Comp signals** — Any listed range? Does it likely meet my floor?

### Role archetype classifier:
Classify as one of: People Leader / Hybrid / Technical Specialist / Functional Leader.
Flag if the archetype conflicts with my target profile.

### Fit type:
Classify as one of: Core Fit / Stretch / Mismatch.
One sentence explaining which and why.

### Output format for JD evaluation:
1. **Overall score** (1-10) and one-sentence verdict
2. **Fit type** — Core Fit / Stretch / Mismatch with reasoning
3. **Role archetype**
4. **Strengths of this match** (bullets)
5. **Gaps or concerns** (bullets)
6. **Recommended action:** Apply / Apply with modifications / Skip
7. **Keywords** — 25-35 comma-separated keywords and phrases from the JD relevant to ATS matching and resume tailoring

---

## 8. Insights & Lessons Learned
<!--
  What's working. What isn't. Patterns across applications. [EVOLVING]
  Generate initial content from existing Claude threads.
  Update regularly as your search progresses.
-->

**What's resonating with recruiters/hiring managers:**
[AUTO]

**What's not landing:**
[AUTO]

**Interview feedback received:**
[AUTO]

**Positioning adjustments made over time:**
[AUTO]

---

## 9. Session Instructions
<!--
  Standing instructions for the model in every session.
  These are followed automatically — you don't need to repeat them.
-->

- Evaluate every JD before generating any materials — do not skip straight to tailoring
- Ask one clarifying question if something about the role is ambiguous before proceeding
- When tailoring, show me the delta from the master resume — don't reprint the whole thing unless asked
- Flag any claims in tailored materials that could be challenged in an interview
- Keep cover letters under 250 words unless asked otherwise
- If a role scores below 6/10, explain why before asking if I want to proceed
- Do NOT generate resume or cover letter materials in the same response as a JD evaluation — wait for explicit instruction to proceed