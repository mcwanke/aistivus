# AIstivus — Feature Backlog
> Running list of ideas, enhancements, and future features.
> Items here are NOT scheduled — they are captured for consideration.
> Scheduled work lives in PROJECT_SPEC.md phase plans.
> Last updated: 2026-05-04

---

## How to Use This File

- Add ideas here as they come up during development or usage
- Tag each item with a rough phase: `[P0]`, `[P1]`, `[P2]`, `[P3]`, `[P4]`
- Move items to PROJECT_SPEC.md when they get scheduled
- Never delete items — mark completed ones with ✅

---

## UI / UX Enhancements

- [ ] **Export evaluation to clipboard** `[P1]` — one click copies structured evaluation result for pasting elsewhere
- [ ] **Sort and search on evaluations list** `[P1]` — filter by score range, date, fit type, model used
- [ ] **Keyboard shortcut reference** `[P1]` — visible shortcut hints in the UI (Cmd+Enter already works)
- [ ] **Pagination on evaluations list** `[P1]` — once 20+ evaluations exist, needs pagination
- [ ] **Dark/light mode toggle** `[P4]` — per PROJECT_SPEC.md Phase 4
- [ ] **Toast notifications** `[P1]` — success/error feedback instead of inline state only
- [ ] **Drag and drop JD files** `[P1]` — drag a .txt or .md file onto the evaluate page instead of pasting
- [ ] **Print-friendly evaluation report** `[P2]` — CSS print styles for clean paper output

---

## Evaluation Enhancements

- [ ] **Evaluation confidence indicator** `[P1]` — flag when a model returned low-confidence output (e.g. all scores clustered at 5)
- [ ] **Score history chart** `[P2]` — sparkline of scores over time per job as evaluations accumulate
- [ ] **Cross-model score normalization note** `[P1]` — UI caveat when comparing evaluations from different models
- [ ] **Evaluation templates** `[P3]` — save and reuse custom evaluation prompts for different role types
- [ ] **Batch re-evaluate** `[P2]` — select multiple jobs and re-run evaluations with a new model in one action
- [ ] **Evaluation diff view** `[P2]` — side-by-side comparison of two evaluations for the same job

---

## Job / Company Management

- [ ] **Company notes and flags** `[P1]` — mark companies as excluded, flagged, or preferred
- [ ] **Duplicate job review queue** `[P1]` — surface suspected_duplicate jobs for manual resolution
- [ ] **Job status tracking without applying** `[P1]` — "watching", "saved", "not interested" states before application
- [ ] **Pay band manual entry UI** `[P1]` — inline edit for pay_band when scraper couldn't extract it
- [ ] **Company career/culture page quick links** `[P1]` — one-click open from job detail

---

## Application Workflow

- [ ] **Application timeline view** `[P1]` — visual timeline of status changes per application
- [ ] **Recruiter contact tracking** `[P1]` — name, email, LinkedIn URL per application
- [ ] **Interview prep notes** `[P2]` — structured notes section per interview round
- [ ] **Offer comparison tool** `[P2]` — side-by-side offer comparison with compensation calculator
- [ ] **Application deadline reminders** `[P2]` — flag roles with known closing dates
- [ ] **Interview prep questions** `[P1.2+]` — from Job Search Profile page or ApplicationDetail:
  generate practice questions based on profile gaps + JD evaluation gaps.
  "Based on your profile and the gaps in this evaluation, here are the 5 questions
  you should prepare for." Reuses profile chat infrastructure; no new backend work.
  Scheduled as near-term addition after Phase 1.2 profile builder is stable.

---

## Resume & Document Generation

- [ ] **Resume chunk usage analytics** `[P2]` — which chunks are pulled most often, which never get used
- [ ] **Resume version history** `[P2]` — track which version of a resume was sent for each application
- [ ] **Cover letter templates** `[P2]` — starting templates by role type that get tailored
- [ ] **Resume keyword gap analysis** `[P2]` — compare extracted JD keywords against resume chunks in library
- [ ] **ATS score estimator** `[P3]` — estimate how well a tailored resume would score against the JD keywords

---

## Discovery & Scraping

- [ ] **RSS feed support** `[P3]` — alternative to jobspy if boards change scraping behavior
- [ ] **Manual company watch list** `[P3]` — monitor specific company career pages for new postings
- [ ] **Indeed direct API** `[P3]` — fallback if jobspy Indeed support degrades
- [ ] **Scrape scheduling** `[P3]` — run scrapes on a schedule (daily, weekly) — requires careful cost controls
- [ ] **Repost notification email** `[P3]` — optional email alert when a tracked role is reposted

---

## Data & Export

- [ ] **CSV export of evaluations** `[P1]` — download all evaluations as a spreadsheet
- [ ] **Notion sync** `[P2]` — push application status updates to a Notion database
- [ ] **Search history analytics** `[P3]` — what terms have been searched, which boards return best results
- [ ] **LLM cost dashboard** `[P1]` — monthly spend by provider, cost per evaluation, projections

---

## Infrastructure & Developer Experience

- [ ] **Hot reload in development** `[P1]` — `uvicorn --reload` flag for faster iteration
- [ ] **Database browser link** `[P1]` — link to open DB in TablePlus or similar from Settings
- [ ] **Health check dashboard** `[P1]` — expanded health page showing all system components
- [ ] **Config validation on startup** `[P1]` — validate config.yaml structure and warn on unknown keys
- [ ] **Docker compose for local dev** `[P4]` — per PROJECT_SPEC.md Phase 4
- [ ] **Auto-backup on startup** `[P2]` — optional daily backup of jobs.db on first run of the day
- [ ] **Auto-cleanup /inbox/done/ folder** `[P1]` — configurable retention period
  (default 30 days) for processed inbox files; action available in Settings UI

---

## Phase 4 / Open Source

- [ ] **Onboarding wizard** `[P4]` — first-run guided setup flow
- [ ] **Multi-project support** `[P4]` — isolate multiple job searches per PROJECT_SPEC.md
- [ ] **Community prompt library** `[P4]` — share and import evaluation prompt templates
- [ ] **Contributor documentation** `[P4]` — detailed CONTRIBUTING.md with PR process

---

## Far Future / SaaS Concepts

- [ ] **JD Generator for companies** `[Future]` — function to generate consistently
  formatted job descriptions for a given role. Positions AIstivus as a B2B SaaS tool
  for companies wanting consistent, high-quality JD formatting at scale.
  Pivot/addition from the candidate-facing tool to a hiring-side tool.

---

*This is a living document. Add freely, schedule carefully.*



## New Pre phase1.7 items

- [ ] I want to add the first web scraper. The goal of this function will be to add a button on the Evaluate page that pops up a modal that accepts a URL. Then the app will attempt to scrape the content on the URL and fill out as much of the info in the fields on the Evaluate page as possible, the user will be responsible for checking the information before initiating an evaluation. We won't need searching here since this function assumes the user has already found the job posting page.

- [ ] I want to add a "learning" function to the app. This should have specific functional goals. Here is a rough initial set of goals:
  - review jobs applied to for lack of interaction to look for potentially ghosted roles and flag the roles to check out to the user
  - build out a local "memory" for either a local or remote AI to build context over time and make the app better for this user over time
  - have a "job review" function that can review all available data and context about a job and provide feedback to the user, suggest changes to personal docs (like jobsearch.md), and add context to memory. I can see this being used after a rejection letter is received for a role with a goal to see if there is anything in the application documents (resume, communications, etc) that we could handle/update/learn from to make the next application submission better
  - we tried to build something like this in the APPLICATION -> Add Lesson subpage previously. We could keep this area as a localized chat/learning for this particular job/application and then add a general one that has the capability to scan over all jobs/applications/info in the system

- [ ] I want to expand the functionality in the profile section. Right now it is focused only on editing the jobsearch.md. What I would like to do here is to use a tabbed sub-nav like we have on the jobs page (JOB DETAIL, APPLICATION, etc). here each tab will represent one of the main user info files, which right now consist of jobsearch.md, jobsearch_cover.md, and we might as well build out subpages for the resume_template.typ and cover_letter_template.typ files. I will provide the functions and intent for each of these subpages when we are defining the workorders to build them out. 