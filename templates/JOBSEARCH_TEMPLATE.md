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

  Standing model instructions are in Section [9]. Do not delete that section.
-->

---

## 1. Who I Am

**Name:** [FILL]
**Current status:** Actively job searching as of [FILL — month/year]
**Years of experience:** [FILL]
**Location / work preference:** [FILL — e.g. Remote-first, open to hybrid in [city]]
**Portfolio / online presence:** [FILL — e.g. yoursite.com | github.com/yourhandle]
**Experience level:** [New grad / Early career (1-5 yrs) / Mid-career / Senior / Career changer]

**Professional summary (2-3 sentences):**
[FILL — distill your bio here. What you've built, at what scale, how you lead.]

---

## 2. Career Narrative

[FILL — e.g. "I started as a backend engineer, moved into tech lead roles because
I found the organizational problems more interesting than the technical ones, and
have spent the last five years building and scaling engineering teams at growth-stage
companies. I'm now looking for a VP-level role where I can own both the engineering
org and the product roadmap."]

---

## 3. Career History (Reverse Chronological)

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

### Education — [Degree] @ [Institution]
- **Graduated:** [FILL]
- **Relevant coursework / focus areas:** [FILL]
- **Notable projects or thesis:** [FILL]

### Project — [Project Name]
- **Context:** [FILL — class project / side project / open source]
- **What you built:** [FILL]
- **Outcome / impact:** [FILL]
- **Tech / tools:** [FILL]

---

## 4. Skills & Strengths

**Technical:**
[FILL — e.g. Python, distributed systems, cloud infra, etc.]

**Leadership / Management:**
[FILL — e.g. hiring, performance management, roadmap ownership, cross-functional alignment]

**Domain expertise:**
[FILL — e.g. consumer mobile, SaaS platforms, IoT/hardware, fintech, etc.]

**Soft skills / differentiators:**
[FILL — what consistently comes up in feedback? What makes you distinct?]

---

## 5. Target Role Profile

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

**Interview process deal-breakers:**
[FILL — e.g. live coding screens, take-home coding assignments, technical design tests — list any interview stage that conflicts with your gaps or deal-breakers]

**Known stretch areas / documented gaps:**
[FILL — be honest here; the model uses this to flag roles where you'll be defending gaps]

---

## 6. Resume Master Copy

[FILL — paste full resume here]

---

## 7. Tailoring Rules

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

### Key Impacts selection logic

When selecting and ordering Key Impacts bullets for a tailored resume, apply this logic
based on signals present in the JD. All content must come from documented achievements
in this file — these are selection and ordering rules, not content.

- **People development / manager pipeline:** Include when the role involves developing
  managers or building leadership depth. Drop or compress for IC-heavy or technical roles
  where this is low signal.
- **AI tooling adoption:** Include for most roles. Compress if space is tight. Drop only
  if the JD has zero AI/tooling signal and a stronger bullet serves better.
- **Largest scale / growth metric:** Include for growth, consumer, acquisition, or
  product-scale roles. Use the strongest documented scale signal.
- **Regulated/compliance delivery:** Include for regulated, enterprise, government, or
  healthcare-adjacent roles.
- **Cloud/platform delivery:** Include for platform, SaaS, or cloud-infrastructure roles.
- **0-to-1 product launch:** Include for hardware, IoT, or build-from-scratch roles.
- **Distributed remote team leadership:** Include when the JD explicitly values distributed
  or async team management.
- **Operational excellence / incident response:** Include when the JD calls out reliability,
  observability, or engineering process rigor.

---

## 8. Insights & Lessons Learned

**What's resonating with recruiters/hiring managers:**
[AUTO]

**What's not landing:**
[AUTO]

**Interview feedback received:**
[AUTO]

**Positioning adjustments made over time:**
[AUTO]

---

## 9. Model Behavior Rules

### Evaluation behavior
- Evaluate every JD before generating any materials — do not skip straight to tailoring
- Ask one clarifying question if something about the role is ambiguous before proceeding
- If a role scores below 6/10, explain why before asking if I want to proceed

### Generation behavior
- When tailoring, show me the delta from the master resume — do not reprint the whole thing unless asked
- Flag any claims in tailored materials that could be challenged in an interview
- Keep cover letters to 4-6 paragraphs unless asked otherwise
- Do NOT generate resume or cover letter materials in the same response as a JD evaluation
- After delivering tailored resume changes, offer cover letter as optional next step — do not generate automatically
- Apply all Always and Never rules from Section 7 without exception — flag conflicts explicitly

### Resume generation behavior
- Resume header tagline: [FILL — e.g. use "Senior Engineering Manager" for EM-titled roles; use "Director of Engineering" for Director-titled roles. Infer from JD title. Default to X if ambiguous.]

### Interview process
- When a JD includes an interview process description, analyze each stage for conflicts
  with known gaps or deal-breakers from Section 5 — surface in the evaluation, not after
