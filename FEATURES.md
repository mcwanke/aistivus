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