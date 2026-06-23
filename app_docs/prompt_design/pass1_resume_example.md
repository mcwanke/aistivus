# Pass 1 Example Prompt — Reddit Engineering Manager, Safety
# Copy everything below the horizontal rule into a fresh AI session.
# Before pasting: load jobsearch.md and resume_template.typ into the session as context files.
---

## CONTEXT FILES

Your project files are already in context. Use jobsearch.md as the sole source of truth for all candidate facts.

## CLARIFICATION GATE

Before generating anything, verify the following. If anything is missing or ambiguous, ask a single clarifying question — do not guess or assume:

- Is a job description present below? If not, ask for it.
- Is a company name and role title present? If not, ask.
- If evaluation output (ATS keywords + keyword gaps) from a prior evaluation is not provided, note that you will extract keywords directly from the JD and flag any gaps you identify.
- If the role type or seniority level is ambiguous, ask before proceeding — this affects summary framing, which content to emphasize, and which tailoring rules apply.

Do not generate the resume until all required inputs are confirmed.

## JOB DETAILS

Company: Reddit
Title: Engineering Manager, Safety
Location: Remote - United States
Pay Band: $217,000 - $303,900 USD

---

## JOB DESCRIPTION

Engineering Manager, Safety
Remote - United States
Reddit is a community of communities. It's built on shared interests, passion, and trust, and is home to the most open and authentic conversations on the internet. Every day, Reddit users submit, vote, and comment on the topics they care most about. With 100,000+ active communities and approximately 126 million daily active unique visitors, Reddit is one of the internet's largest sources of information. For more information, visit www.redditinc.com.

Reddit is continuing to grow our teams with the best talent. This role is completely remote friendly within the United States. If you happen to live close to one of our physical office locations (San Francisco, Los Angeles, New York City & Chicago) our doors are open for you to come into the office as often as you'd like.

At Reddit, we work hard to earn our users' trust every day as we pursue our vision to create a welcoming experience where anyone in the world feels a sense of belonging. We're looking for a high-autonomy Engineering Manager to own the strategy, development, and scaling of Reddit's Safety Experience Team. In this role, you will lead a high-impact engineering team dedicated to protecting our users and moderators from bad actors and malicious behavior.

You will have full ownership over building the next generation of scalable safety tooling and automated defense systems that empower our global moderator community and equip our internal admin teams to safeguard the platform at scale. If you are an ambitious leader who thrives in ambiguous spaces, loves giving engineers a high degree of autonomy, and is excited by the massive leverage of securing one of the most popular websites in the world using AI, then you've found the right place.

Responsibilities:

- Lead a high-impact team of 13 engineers enabling automated AI training and human-in-the-loop workflows at the core of Reddit's safety strategy
- Own the user-facing tools used by moderators to define and automatically enforce the rules in their communities
- Own the centralized platform used by admins to train AI models for content and behavior detection at scale, process reports and appeals, and investigate suspicious users and activity
- Partner cross-functionally with Product, Data Science, ML, and Operations to define and execute an AI-first platform strategy capable of supporting a 10x surge in scale while slashing incident response from days to seconds

Required Qualifications:

- Track record of directly managing and scaling larger engineering teams (10+ ICs) across full-stack and backend systems architectures
- Deep technical competence in full-stack engineering or architecture, with solid experience in large-scale distributed systems
- Able to set a roadmap for a team and its members, and deliver results with a strong customer and business focus
- Desire to coach a team, regularly gathering and providing feedback to your team and fostering a healthy team culture
- Customer focused and self-directed, innovative, biased towards action in fast-paced environments
- Familiarity with or strong interest in AI/ML engineering practices, specifically around serving, prompt engineering, or productionizing LLM/classical workflows at scale

---

## EVALUATION INPUT (optional — paste if available)

If a prior evaluation was run for this role, paste the ATS keywords and keyword gaps here. The resume will use these to confirm coverage during generation.

ATS Keywords: Engineering Manager, Safety, full-stack, backend, distributed systems, AI, ML, safety systems, roadmap, psychological safety, customer focus, prompt engineering, productionizing LLM/classical workflows
Keyword Gaps: AI, ML, prompt engineering, productionizing LLM/classical workflows

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

## OUTPUT FORMAT

Output the raw .typ file content only — nothing before it, nothing after it. No prose, no section commentary, no explanation. The output should be ready to save directly as a .typ file and compile without modification. The only permitted addition is a single sentence appended after the file content if you cannot reach 2 pages without fabrication.

The first line of the .typ file must be a Typst comment with the suggested save filename:
`// PASS1_resume_Reddit_EngineeringManager_Safety.typ`
