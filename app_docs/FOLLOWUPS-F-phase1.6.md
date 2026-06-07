# FOLLOWUPS-F — Pre-Docker Polish: Tests, Security, Docs, and Planning

Final cleanup pass before Phase 1.7 (Docker). Goals:
- Bring `WORKORDER_phase1.6_followups.md` up to date with completed/deferred status
- Eliminate the 6 pre-existing frontend test failures
- Write the Phase 1.7 Docker workorder
- Complete a security review pass
- Update `README.md` for the post-Docker state
- Minimize and clean `CLAUDE.md` + `PROJECT_SPEC.md`
- Create a personal migration plan for Docker cutover
- Scope out CI/CD and macro-level architecture reviews for follow-on sessions

## Status

| # | Status | Title |
|---|--------|-------|
| F1 | [ ] | `WORKORDER_phase1.6_followups.md` — mark completed/deferred items |
| F2 | [ ] | Fix 6 pre-existing failing frontend tests (`Evaluate.test.tsx`) |
| F3 | [ ] | Write `WORKORDER_phase1.7.md` |
| F4a | [ ] | Security pass — review codebase + write findings to `ignore/SECURITY_NOTES.md` |
| F4b | [ ] | Security pass — evaluate findings + address open items (own session, after F4a) |
| F5 | [ ] | Update `README.md` for post-phase-1.7 state |
| F6 | [ ] | `CLAUDE.md` + `PROJECT_SPEC.md` — cleanup + minimize |
| F7 | [ ] | Create `ignore/MIGRATION_PLAN.md` |
| F8 | [ ] | CI/CD discussion (own session — see session prompt below) |
| F9 | [ ] | Macro-level architecture review (own session — see session prompt below) |

Status markers: `[ ]` todo · `[x]` done · `[~]` deferred

---

## Test Baseline (going in)

- Frontend: 224 passed / 6 pre-existing failures (`Evaluate.test.tsx`) — 230 total
- Backend: 578 passed / 0 errors

---

## Items

### F1 — `WORKORDER_phase1.6_followups.md`: mark completed/deferred items

FOLLOWUPS-A and FOLLOWUPS-B items are already marked `[X]` inline. FOLLOWUPS-C items
were never updated in the workorder. FOLLOWUPS-D and FOLLOWUPS-E have their own
completed/deferred docs but the workorder section headings were never annotated.

**What to update:**
- All FOLLOWUPS-C items → `[x]` (all complete; see session memory files for C1–C8)
- FOLLOWUPS-D section → note: complete; see `FOLLOWUPS-D-phase1.6_completed.md`
- FOLLOWUPS-E section → note: deferred; see `FOLLOWUPS-E-phase1.6_completed.md`
- The "FOLLOWUPS-E to infinity" / FOLLOWUPS-F block → note: tracked in this doc

**Scope:** `app_docs/WORKORDER_phase1.6_followups.md` only
**Tests affected:** None

---

### F2 — Fix 6 pre-existing failing frontend tests

All 6 failures are in `frontend/src/pages/Evaluate.test.tsx`. Present since at least
the FOLLOWUPS-C baseline; not introduced by any recent work.

**Approach:**
1. Run `cd frontend && npm test -- --reporter=verbose` to capture current failure output
2. Diagnose root cause for each failure (likely stale MSW mock shapes, type drift from
   schema changes, or API response field mismatches)
3. Fix each failure; confirm 224 currently-passing tests remain green

**Target baseline after F2:** 230 passed / 0 failures (frontend); 578 / 0 (backend)

**Scope:** `frontend/src/pages/Evaluate.test.tsx`; possibly `frontend/src/test/mocks/handlers.ts`
**Tests affected:** These tests are the target — all others must remain green

---

### F3 — Write `WORKORDER_phase1.7.md`

Phase 1.7 goal: single Docker container running the full app (FastAPI + compiled React),
with volume mounts for user and app-generated data. Discussion complete during FOLLOWUPS-F
planning session — write the workorder directly.

**Key decisions (confirmed):**
- Multi-stage Dockerfile: Node stage runs `npm run build` → Python stage serves
  `frontend/dist/` via FastAPI `StaticFiles`; no Vite dev server in production
- Typst binary baked into the image at build time (exact install method — `apt` vs.
  direct download — decided during workorder authoring)
- `docker-compose.yml` volume mounts: `./user_data:/app/user_data` and
  `./app_data:/app/app_data`
- Anthropic API key: `env_file: .env` in docker-compose
- `config.yaml` lives at `user_data/config.yaml` (established in FOLLOWUPS-D);
  volume-mounted, not baked into image
- `main.py` needs: mount `frontend/dist/` as `StaticFiles`; add SPA catch-all route
  returning `index.html` for all non-API paths so React Router works
- No first-run wizard — out of scope for 1.7
- Single exposed port: 8080

**What the workorder covers:**
- Dockerfile (multi-stage, base images, Node build, Python serve, Typst install)
- `docker-compose.yml` (service definition, ports, volumes, env_file, host binding)
- `.dockerignore`
- `main.py` changes (StaticFiles mount + SPA catch-all)
- Validation plan (build, run, smoke test)

**Scope:** New file `app_docs/WORKORDER_phase1.7.md`
**Tests affected:** None (workorder only)

---

### F4a — Security pass: review + findings doc

Full codebase read pass focused on security. Output is a written findings document.
No code changes in this item.

**Threat model:** A user clones the repo and runs it in a public-facing Docker container
with no reverse proxy. Not the intended deployment, but the app should not be trivially
exploitable if it happens.

**Areas to review:**
- Prompt injection — LLM evaluation pipeline, profile chat, any user-supplied text
  reaching a prompt
- SQL injection — parameterized query usage throughout `database.py`
- Path traversal — document upload/serve routes, filename sanitization in
  `document_routes.py`
- CORS policy — origins list in `main.py`
- API key handling — settings routes, `.env` loading, log content
- File upload validation — type checking, size limits, filename sanitization
- Rate limiting — `slowapi` configuration, which routes are covered
- Secrets in committed files — `.gitignore` coverage, template files, test fixtures

**Output:** `ignore/SECURITY_NOTES.md`, findings organized by severity
(High / Medium / Low / Info)

**Scope:** `main.py`, `database.py`, `evaluator.py`, `document_routes.py`,
`profile_routes.py`, `llm_client.py`, frontend API call patterns
**Tests affected:** None (review only)

---

### F4b — Security pass: evaluate findings + address open items

Separate session after F4a output is reviewed and approved.

**Approach:**
1. Review `ignore/SECURITY_NOTES.md` together — agree on scope for this session
2. Address High and Medium items; defer Low/Info unless trivial
3. Run full test suite after any code changes

**Scope:** Dependent on F4a findings
**Tests affected:** Potentially any — scope determined at session start

---

### F5 — Update `README.md`

Rewrite `README.md` targeting Phase 1.7 completion. Committed now — the app has not
been shared publicly and Docker is the intended deployment target going forward.

**Target content:**
- What AIstivus is (2–3 sentences)
- Prerequisites: Docker + docker-compose; optional Typst for local dev; optional Ollama
  for local LLM
- Quick start: clone → copy config → `docker-compose up` → open `localhost:8080`
- First-run setup: copy `templates/CONFIG_TEMPLATE.yaml` → `user_data/config.yaml`;
  copy `templates/JOBSEARCH_TEMPLATE.md` → `user_data/my_data/jobsearch.md`
- Anthropic API key setup (`.env` file)
- Volume mount explanation (`user_data/` = user-authored; `app_data/` = app-generated)
- Local dev setup (for contributors): Python + Node, `uvicorn` + `npm run dev`
- Brief project structure
- Phase status / what's working

**Scope:** `README.md` (root)
**Tests affected:** None

---

### F6 — `CLAUDE.md` + `PROJECT_SPEC.md` cleanup

Both files carry accumulated completed-phase checklists, retired decisions, and stale
references. Minimize token footprint while keeping them accurate and actionable for
future sessions.

**`CLAUDE.md`:**
- Update Current Phase section: mark Phase 1.6 complete, Phase 1.7 as active
- Remove or collapse checklist details for phases prior to 1.6
- Verify Target File Structure matches actual current structure
- Remove any remaining references to retired paths (`reports/`, `generated/`, old
  config keys)

**`PROJECT_SPEC.md`:**
- Mark phases 1.0–1.6 complete in Section 17
- Remove or collapse deliverable detail for completed phases (canonical record is in
  workorder docs)
- Update config spec (Section 16) to match current `CONFIG_TEMPLATE.yaml`
- Update file structure diagram (Section 18) to match current layout
- Spot-check schema section (Section 6) against `database.py` for obvious drift

**Risk:** Both files are loaded at every session start — do not remove anything still
load-bearing for understanding current architecture or non-obvious rules. When in
doubt, keep it.

**Scope:** `CLAUDE.md`, `PROJECT_SPEC.md`
**Tests affected:** None

---

### F7 — Create `ignore/MIGRATION_PLAN.md`

Personal document — gitignored, never committed. How to migrate from the current
local dev setup to the Docker instance when Phase 1.7 ships.

**Content outline:**
- Pre-migration checklist (stop running app, confirm data locations)
- Back up: `user_data/`, `app_data/` (especially `app_data/data/jobs.db`)
- Docker setup steps (clone/pull, build image, configure `.env`)
- Restore data: copy `user_data/` and `app_data/` into place before first boot
- Review `user_data/config.yaml` paths before first Docker boot
- First-run verification: health check, spot-check jobs and documents, compile a doc
- Rollback plan: revert to `uvicorn` if Docker has issues
- Notes on Anthropic key (`.env` setup)

**Scope:** New file `ignore/MIGRATION_PLAN.md`
**Tests affected:** None

---

### F8 — CI/CD discussion (dedicated session)

Requires its own Claude Code session. Create stub doc `ignore/DISCUSSION_CI_CD.md`
at the start of that session to capture output.

**Session prompt:**

> We have a locally-hosted personal job search app called AIstivus. Stack: FastAPI
> (Python) + React/TypeScript/Vite + SQLite, deployed via Docker. Tests: pytest
> (backend, 578 passing) + Vitest (frontend, 230 total). Source control on GitHub.
> Runs on a single local machine; single developer.
>
> I want to understand:
> 1. How should new features/fixes flow from my laptop to the running Docker instance?
>    Walk me through the workflow end to end.
> 2. What does a CI/CD pipeline look like for this project? What tooling (GitHub
>    Actions, etc.), what does it check, and how does it gate merges?
> 3. How do I practice good CI/CD discipline on a solo personal project? What habits
>    matter vs. what is overkill at this scale?
> 4. How does Docker image versioning/tagging work here — do I build a new image on
>    every change, use tags, latest, etc.?
>
> Reason through each question, surface tradeoffs, and make concrete recommendations.
> No code yet — understand concepts and proposed workflow first. Capture findings in
> `ignore/DISCUSSION_CI_CD.md`.

---

### F9 — Macro-level architecture review (dedicated session)

Requires its own Claude Code session. Create stub doc `ignore/DISCUSSION_MACRO_REVIEW.md`
at the start of that session to capture output.

**Session prompt:**

> We have a locally-hosted personal job search app called AIstivus, currently at Phase
> 1.6 complete (Document Management). Stack: FastAPI + React/TypeScript/Vite + SQLite
> + Typst, deploying to Docker in Phase 1.7. Evolved through 7 phases of iterative
> development by a solo developer. The codebase is functional and in daily personal use.
>
> Read these files before answering: `main.py`, `database.py`, `evaluator.py`,
> `document_routes.py`, `profile_routes.py`, `llm_client.py`, `CLAUDE.md`,
> `PROJECT_SPEC.md`.
>
> I want a senior-level review across three lenses. Be specific — reference actual
> code and files, not generic principles.
>
> 1. **Senior software engineer lens:** Overall architecture and code quality. What is
>    in good shape? What has accumulated debt? What would you refactor if you were
>    taking ownership? Is a version 2.0 bump warranted when Docker ships, and what
>    would that signal to a future contributor?
>
> 2. **Senior security engineer lens:** Threat model for a user who clones and hosts
>    this publicly in Docker with no reverse proxy. Realistic risks, not theoretical
>    ones. What should be hardened now?
>
> 3. **Senior backend engineer lens:** API design, database patterns, performance.
>    Structural choices that will cause pain as features are added. What to change now
>    vs. later.
>
> Capture findings in `ignore/DISCUSSION_MACRO_REVIEW.md`.

---

## Execution Order

```
1.  F1  — WORKORDER cleanup (doc only, fast)
2.  F2  — Fix 6 failing frontend tests
3.  F3  — Write WORKORDER_phase1.7.md
4.  F5  — Update README.md
5.  F6  — CLAUDE.md + PROJECT_SPEC.md cleanup
6.  F7  — Create ignore/MIGRATION_PLAN.md
7.  F4a — Security pass: review + write SECURITY_NOTES.md
            ↓ review findings together
8.  F4b — Security pass: address open items (own session)
9.  F8  — CI/CD discussion (own session)
10. F9  — Macro review (own session)
```

F4b, F8, and F9 are each their own sessions. F1–F7 (minus F4b) can be completed in order.

---

## Validation Plan

**After F2:**
- `cd frontend && npm test` → 230 passed / 0 failures
- `pytest tests/ -v` → 578 passed / 0 errors (confirm no regressions)

**After F4b (when applicable):**
- Full test suite: frontend 230 / 0, backend 578 / 0
- Manual smoke test of any routes touched by security fixes

**No automated validation for F1, F3, F5, F6, F7, F8, F9** — doc and discussion items.
