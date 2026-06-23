# Pass 1 Example Prompt — DISCO Engineering Manager
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

Company: Disco
Title: Engineering Manager
Location: Remote, London
Pay Band: Not listed

---

## JOB DESCRIPTION

What is DISCO?

DISCO is the industry standard for managing, organising and sharing music and other media. We make music and media workflow fast, intuitive and simple, directly connecting people and their work to save time. Today we count UMG, Sony, Warner Music, Netflix, Amazon among our customers, and over 250,000 people interact with DISCO each month. Our customers are super passionate about our product.

About the role

As an Engineering Manager, you combine technical expertise with strong leadership to guide a team of product engineers in delivering impactful outcomes for DISCO and our customers. You contribute directly to technical design, implementation, and optimisation within your team's scope and across the engineering org, while also supporting engineers to grow their skills and careers. You know when to be hands-on in solving technical challenges and when to focus on strategy and people management. You work in close collaboration with your product and design peers to prioritise and deliver work that balances feature delivery with quality, performance and reliability, ensuring technical feasibility and customer value. You will also collaborate with technical leaders to drive engineering and architecture excellence, and work with our data and market facing teams in the UK to support our biggest enterprise customers. As a leader, you foster a high performance culture of ownership, technical excellence, and collaboration, while supporting team autonomy and aligning with broader engineering standards.

Responsibilities

- Product & Technical Leadership – Define and track OKRs in collaboration with Product and Design, ensuring alignment with strategic goals. Balance feature development with addressing technical debt and improving system health in a well structured Agile process. Guide thoughtful adoption of AI tooling to efficiently deliver secure, high quality engineering work at scale.
- Technical Oversight – Guide technical discovery, review designs and architecture decisions, and contribute to development when necessary to support the team's success.
- Team Development – Mentor and grow engineers of varying seniority through regular 1:1s, career development plans, and structured feedback. Foster a culture of engagement, ownership, and technical excellence.
- Cross-functional Collaboration – Work closely with Product and Design to ensure technical feasibility, maintain high-quality standards, and deliver impactful solutions.
- Engineering Standards & Best Practices – Help define and implement engineering standards across teams, ensuring consistency in quality, performance, and reliability.
- Operational Excellence – Monitor and maintain engineering health metrics (SLOs, error rates, cycle time, operational costs) to drive improvements in processes, system performance and reliability.
- Incident Management & On-call Processes – Oversee incident response, and post-mortems, ensuring effective resolution and long-term fixes for recurring issues.
- Continuous Improvement – Drive enhancements in development workflows, testing practices, CI/CD pipelines, and overall engineering efficiency.

Requirements

- Engineering Leadership Experience – Proven experience leading a team of engineers in a high-growth or complex product environment, with a focus on mentorship, team development, and fostering a strong engineering culture.
- Customer focus - Understand our customers deeply, engage in product strategy and focus on building great solutions that support our biggest customers.
- Scalability & System Design – Deep understanding of designing, building, and maintaining scalable web applications, APIs, and distributed systems, ideally in a SaaS or cloud-based environment.
- Technical Expertise – Strong knowledge of modern backend and frontend technologies, system performance optimisation, and architectural best practices for high-traffic applications.
- Balancing Business & Engineering Priorities – Ability to make strategic trade-offs between feature development, technical debt, and operational improvements, and to articulate a clear, data driven business case for decisions you make.
- Cross-functional Collaboration – Experience working closely with Product, Design, and other engineering teams to align on goals, manage dependencies, and deliver high-quality solutions.
- Operational Focus – Familiarity with monitoring, incident response, and maintaining service reliability at scale, including working with SLOs, observability platforms, and optimising for cost efficiency.
- Process & Best Practices – Knowledge of modern software development workflows, including CI/CD, testing strategies, and iterative improvement of engineering processes.
- Strong Communication & Influence – Ability to communicate complex technical concepts clearly and effectively to both technical and non-technical stakeholders.

Bonus Skills (Nice to Haves)

- We use React, Typescript, Python, and Postgres, experience with these, or similar, is a big plus.
- Experience working in a high-scale SaaS or cloud-based environment.
- Hands-on experience with modern DevOps practices, including CI/CD and cloud infrastructure.
- Familiarity with observability tools, monitoring, and error tracking.
- Passion for building a strong engineering culture focused on ownership, collaboration, and continuous improvement.

---

## EVALUATION INPUT (optional — paste if available)

If a prior evaluation was run for this role, paste the ATS keywords and keyword gaps here. The resume will use these to confirm coverage during generation.

ATS Keywords: engineering manager, product engineering, technical design, system health, agile process, AI tooling, technical debt, system design, backend, frontend, distributed systems, SaaS, cloud-based, engineering standards, performance optimisation, reliability, incident management, on-call processes, SLOs, error rates, cycle time, operational costs, cross-functional collaboration, CI/CD, observability, monitoring, error tracking, engineering culture, team development, leadership, product strategy, customer focus, scalability, system architecture, technical leadership, development workflows, testing strategies, engineering efficiency, React, TypeScript, Python, Postgres, DevOps, cloud infrastructure
Keyword Gaps: React, TypeScript, Python, Postgres, observability tools, monitoring, error tracking, high-scale SaaS, cloud-based environments, on-call processes

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
`// PASS1_resume_Disco_EngineeringManager.typ`
