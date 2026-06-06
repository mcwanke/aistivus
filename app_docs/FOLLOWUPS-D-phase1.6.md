# FOLLOWUPS-D — Pre-Docker Cleanup: Folder Restructure + Reports Retirement

Items identified before Phase 1.7 (Docker). Goals:
- Consolidate runtime data under two clearly-owned directories (`user_data/` + `app_data/`)
- Retire the unused `reports/` system cleanly (code + TS types + config)
- Rename `generated/` → `application_docs/` (folder + config key + code defaults)
- Commit starter Typst templates to the repo
- Fix template naming and documentation
- Clean up remaining root clutter

## Status

| # | Status | Title |
|---|--------|-------|
| D1 | [ ] | Retire reports/ — remove write code, serve endpoint, TS types |
| D2 | [ ] | Rename generated/ → application_docs/ — config key + code defaults |
| D3 | [ ] | Create user_data/ + app_data/; move remaining directories |
| D4 | [ ] | Python path defaults update (all affected files) |
| D5 | [ ] | config.yaml + CONFIG_TEMPLATE.yaml path updates |
| D6 | [ ] | .gitignore update |
| D7 | [ ] | Root cleanup: move typ_resumes/ → ignore/ |
| D8 | [ ] | templates/: rename COVER_LETTER_TEMPLATE.md → JOBSEARCH_COVER_TEMPLATE.md |
| D9 | [ ] | templates/typst/: add simple starter .typ files (resume + cover letter) |
| D10 | [ ] | templates/typst/README.md: review and update for accuracy |
| D11 | [ ] | CLAUDE.md + PROJECT_SPEC.md: update structure diagrams + phase notes |

Status markers: `[ ]` todo · `[x]` done · `[~]` deferred

---

## Already done (manual cleanup before this workorder)

- `pages/` and `static/` moved to `ignore/`
- `my_data/old_bak/`, `my_data/applications/`, `my_data/prompts/` moved to `ignore/`
- `CLAUDE.md.phase0`, `evaluations.html.deprecated`, root `node_modules/` deleted
- `reports/` deleted
- `ignore/` added to `.gitignore`

---

## Test Baseline (going in)

- Frontend: 224 passed / 6 pre-existing failures (Evaluate.test.tsx) — 230 total
- Backend: 578 passed / 0 errors

---

## Target Structure

```
aistivus/
│
├── templates/                        ← COMMITTED — ships with repo
│   ├── CONFIG_TEMPLATE.yaml
│   ├── JOBSEARCH_TEMPLATE.md
│   ├── JOBSEARCH_COVER_TEMPLATE.md   ← renamed from COVER_LETTER_TEMPLATE.md (D8)
│   ├── INBOX_TEMPLATE.md
│   └── typst/
│       ├── README.md                 ← reviewed/updated (D10)
│       ├── resume/
│       │   └── simple-resume.typ     ← new (D9)
│       └── cover-letter/
│           └── simple-cover-letter.typ ← new (D9)
│
├── user_data/                        ← GITIGNORED — user-authored; Docker volume
│   ├── config.yaml                   ← was: ./config.yaml
│   └── my_data/
│       ├── jobsearch.md
│       ├── jobsearch_cover.md
│       ├── teamworks_jd.md
│       └── resume_templates/
│           ├── resume_template.typ
│           └── cover_letter_template.typ
│
├── app_data/                         ← GITIGNORED — app-generated; Docker volume
│   ├── data/                         ← was: ./data/
│   ├── application_docs/             ← was: ./generated/
│   ├── logs/                         ← was: ./logs/
│   └── inbox/                        ← was: ./inbox/
│       ├── done/
│       └── failed/
│
├── ignore/                           ← GITIGNORED — local archive; never volume-mounted
│   └── [moved items — not read by app or plan]
│
└── memory/                           ← GITIGNORED — Claude tooling; stays at root
```

**Docker volume mounts (Phase 1.7):**
```yaml
volumes:
  - ./user_data:/app/user_data
  - ./app_data:/app/app_data
```

---

## Items

### D1 — Retire reports/

**Background:** `evaluator.py` writes markdown eval reports to `reports/` when running
the CLI evaluator. A `/report` backend serve endpoint exists. However the React
frontend never calls that endpoint — `report_path` is carried in TypeScript types and
passed through the `EvalCard` component (labeled "Legacy EvalCard" in the code) but
is never rendered or surfaced to the user anywhere.

The "Export Job" button in Job Actions writes to `inbox/done/`, not `reports/` — it
is a separate, unaffected feature. Its UI description text incorrectly says "reports/
folder" and is fixed here.

**`evaluator.py`:**
- Remove `_write_report()` function
- Remove `_write_report()` call inside `evaluate_job()` and `batch_evaluate()`
- Remove `report_path` key from result dicts returned by `evaluate_job()`
- Remove `reports_dir` resolution from config

**`main.py`:**
- Remove `GET /report` endpoint and its path-traversal protection block
- Remove `_find_report()` helper function
- Remove `reports_dir` creation in startup
- Remove `report_path` from job response assembly (two locations: single job fetch
  and job list fetch that call `_find_report()`)
- Fix Export Job UI description text (~line 2384): "reports/ folder" →
  "inbox/done/ folder"

**`frontend/src/types/api.ts`:**
- Remove `report_path: string | null` from `Evaluation` interface
- Remove `report_path: string | null` from the job detail evaluation array type

**`frontend/src/pages/JobDetail.tsx`:**
- Remove `report_path` from `EvalWithMeta` type alias
- Verify whether `EvalCard` (labeled "Legacy") is rendered anywhere; if not, remove
  it entirely; if it is still rendered somewhere, remove `report_path` from its prop
  type

**`frontend/src/test/mocks/handlers.ts`:**
- Remove `report_path: null` from evaluation mock objects

**`config.yaml` + `CONFIG_TEMPLATE.yaml`:**
- Remove `output.reports_dir` entry

**Scope:** Python (evaluator.py, main.py), TypeScript (types/api.ts, JobDetail.tsx,
test mocks), config files
**Tests affected:** Backend tests asserting `report_path` in job/evaluation responses —
drop that field. Frontend mock handlers — drop `report_path: null`.

---

### D2 — Rename generated/ → application_docs/

**Config key rename** in `config.yaml` and `CONFIG_TEMPLATE.yaml`:
`typst.generated_dir` → `typst.application_docs_dir`

**`main.py`:**
- Update startup `generated_dir` variable name → `application_docs_dir` and
  default path → `./app_data/application_docs`
- Update `app.state` attribute: `app.state.generated_dir` → `app.state.application_docs_dir`
- Update startup directory creation path

**`document_routes.py`:**
- Update all `getattr(request.app.state, "generated_dir", ...)` → `application_docs_dir`
- Update fallback path default: `Path("./generated")` → `Path("./app_data/application_docs")`

The folder move itself happens in D3 as part of the broader restructure.

**Scope:** Python (main.py, document_routes.py), config files
**Tests affected:** Backend tests for document routes that reference `generated_dir`
state attribute — update attribute name and any path string assertions.

---

### D3 — Create folder structure; move directories

**New directories to create:**
```
user_data/
user_data/my_data/
app_data/
```

**Moves:**
| From | To |
|---|---|
| `./config.yaml` | `./user_data/config.yaml` |
| `./my_data/jobsearch.md` | `./user_data/my_data/jobsearch.md` |
| `./my_data/jobsearch_cover.md` | `./user_data/my_data/jobsearch_cover.md` |
| `./my_data/teamworks_jd.md` | `./user_data/my_data/teamworks_jd.md` |
| `./my_data/resume_templates/` | `./user_data/my_data/resume_templates/` |
| `./data/` | `./app_data/data/` |
| `./generated/` | `./app_data/application_docs/` |
| `./logs/` | `./app_data/logs/` |
| `./inbox/` | `./app_data/inbox/` |

After moves: remove empty `./my_data/` shell.

**Execution dependency:** D3 must run AFTER D1+D2 code changes and D4 path defaults
are complete — the app will be broken between moving folders and updating code.
See Execution Order.

**Scope:** Shell (mkdir + mv + rm)
**Tests affected:** None directly — see Risk section.

---

### D4 — Python path defaults update

Fallback defaults used when a config key is absent. All must reflect the new paths.

**`database.py`:**
- `_load_config()`: `Path("config.yaml")` → `Path("user_data/config.yaml")`
- `get_db_path()` default: `"./data/jobs.db"` → `"./app_data/data/jobs.db"`
- `backup_dir` default: `"./data/backups"` → `"./app_data/data/backups"`

**`main.py`:**
- `application_docs_dir` startup default: `"./generated"` → `"./app_data/application_docs"`
  (see D2 for variable rename)

**`logger.py`:**
- `log_file` default: `"./logs/app.log"` → `"./app_data/logs/app.log"`

**`evaluate.py`:**
- `inbox_path` default: `"./inbox"` → `"./app_data/inbox"`
- `done_path` default: `"./inbox/done"` → `"./app_data/inbox/done"`
- `failed_path` default: `"./inbox/failed"` → `"./app_data/inbox/failed"`

**`evaluator.py`:**
- `done_path` default: `"./inbox/done"` → `"./app_data/inbox/done"`
- Remove `reports_dir` resolution (D1)

**Scope:** Python only — no frontend changes
**Tests affected:** See Risk section re: config loading path change in `database.py`.

---

### D5 — config.yaml + CONFIG_TEMPLATE.yaml updates

**`user_data/config.yaml`** (update internal path values after move in D3; edit before
the move while it is still at root, then move):

```yaml
# Remove:
output:
  reports_dir: ./reports

# Update paths:
database:
  db_path: ./app_data/data/jobs.db
  backup_dir: ./app_data/data/backups        # if present

typst:
  application_docs_dir: ./app_data/application_docs  # key renamed (D2)

logging:
  file: ./app_data/logs/app.log

inbox:
  path: ./app_data/inbox
  done_path: ./app_data/inbox/done
  failed_path: ./app_data/inbox/failed

evaluation:
  jobsearch_md_path: ./user_data/my_data/jobsearch.md
  resume_template_path: ./user_data/my_data/resume_templates/resume_template.typ
```

**`templates/CONFIG_TEMPLATE.yaml`:** Update all example paths to match new structure.
Remove `output.reports_dir`. Rename `typst.generated_dir` → `typst.application_docs_dir`.

**Scope:** Config files
**Tests affected:** None

---

### D6 — .gitignore update

Replace old individual entries with parent directory entries.

```
# Remove these individual entries (replaced by parent dirs):
data/
logs/
reports/
typ_resumes/
generated/
inbox/
my_data/
config.yaml
jobsearch.md
jobsearch.md.old
resume_template.typ

# Add (keep prompts.md entry as-is):
user_data/
app_data/
```

`ignore/` entry is already present — no change needed.

**Scope:** `.gitignore` only

---

### D7 — Move typ_resumes/ → ignore/

`typ_resumes/` contains pre-Phase-1.6 manually compiled resume files. Still sitting
at root. Move to `ignore/typ_resumes/`.

Remove `typ_resumes/` from `.gitignore` (covered by `ignore/` entry after D6).

**Scope:** Shell (mv)

---

### D8 — Rename COVER_LETTER_TEMPLATE.md → JOBSEARCH_COVER_TEMPLATE.md

`templates/COVER_LETTER_TEMPLATE.md` is a template for
`user_data/my_data/jobsearch_cover.md` — its own content says so. The name is
misleading. Rename to match the target filename and the naming convention of
the other templates in the folder.

File is currently untracked (never committed). Rename before first commit.

**Change:** File rename only. No content changes.
**Scope:** `templates/` directory

---

### D9 — Add starter Typst templates

`templates/typst/resume/` and `templates/typst/cover-letter/` are empty placeholder
directories. Add one simple, clean starter to each.

**Requirements for both:**
- Generic — no PII, placeholder content only
- Minimal Typst — no external package dependencies that require network access
- Compiles cleanly via the app's compile route
- Distinct from the user's personal customized templates

**Files to create:**
- `templates/typst/resume/simple-resume.typ`
- `templates/typst/cover-letter/simple-cover-letter.typ`

**Exploration step:** Test pulling a template from the Typst universe
(typst.app/universe), dropping it into `templates/typst/resume/`, and compiling it
via the app's compile route. If it works, note the workflow in D10 README update.
No app code changes expected — the template picker reads the directory at runtime.

**Scope:** New files in `templates/typst/`
**Tests affected:** None

---

### D10 — Review and update templates/typst/README.md

Verify the current README accurately reflects app behavior and manual usage after
the path changes in this workorder.

**Expected updates:**
- Manual `cp` example path: `generated/` → `app_data/application_docs/`
- Confirm template picker description matches current UI (RESUME/COVER tab →
  "New from template")
- Confirm "Adding your own templates" instructions are still accurate
- Add note about Typst universe templates if D9 exploration succeeds

**Scope:** `templates/typst/README.md` only

---

### D11 — CLAUDE.md + PROJECT_SPEC.md updates

**`CLAUDE.md`:**
- Target File Structure: replace current gitignored path list with `user_data/`,
  `app_data/`, `ignore/` tree; remove `reports/` and `generated/` entries
- Phase 1.7 checklist: update docker-compose volume mounts (6 entries → 2)
- Update `generated/` references → `app_data/application_docs/`

**`PROJECT_SPEC.md`:**
- Phase 1.7 deliverables: update docker-compose volume mounts
- File structure diagram: update gitignored paths
- Remove `output.reports_dir` config key reference; update `typst.generated_dir`
  → `typst.application_docs_dir`

**Scope:** Documentation only

---

## Risk: Backend Tests and Config Loading

`database.py` `_load_config()` changes from reading `Path("config.yaml")` to
`Path("user_data/config.yaml")`. If `user_data/config.yaml` doesn't exist (CI
environment, fresh clone, or test runner), the function returns an empty dict —
which is the current graceful behavior.

**Verify before declaring tests green:** Confirm `conftest.py` does not rely on
`config.yaml` being at root. If any test fixture calls `_load_config()` and expects
a real config, add a fixture that creates a minimal `user_data/config.yaml` for the
test run, or patches the path.

## Risk: EvalCard Legacy Component (D1)

`EvalCard` in `JobDetail.tsx` is labeled "Legacy EvalCard." Before removing
`report_path` from its signature, grep for any render call to `<EvalCard` in the
component tree. If unused: remove the component entirely as part of D1. If still
rendered: update the prop type only.

---

## Execution Order

```
1.  D1  — retire reports/ (code + TS — no folder moves yet)
2.  D2  — rename generated/ in code (config key + variable names)
3.  D4  — update all Python path defaults
4.  D5  — update config.yaml (while still at ./config.yaml, before move)
5.  D3  — create dirs; move all folders; remove my_data/ shell
6.  D6  — update .gitignore
7.  D7  — move typ_resumes/ → ignore/
8.  Run tests — verify baseline holds (see Risk section)
9.  Manual startup check
10. D8  — rename template file
11. D9  — add starter Typst templates
12. D10 — review/update typst README.md
13. D11 — update CLAUDE.md + PROJECT_SPEC.md
```

---

## Validation Plan

**Automated (run after step 9):**
- Backend: `pytest tests/ -v` — expect 578 passed / 0 errors
- Frontend: `cd frontend && npm test` — expect 224 passed / 6 pre-existing failures

**Manual startup check:**
- `uvicorn main:app --host 127.0.0.1 --port 8080`
- App boots without errors
- Log file appears at `app_data/logs/app.log`
- `app_data/application_docs/` created automatically on startup
- GET `/api/v1/health` → 200, `typst_available` correct

**Smoke test:**
- GET `/api/v1/jobs` → existing job data intact (DB at `app_data/data/`)
- GET `/api/v1/inbox/files` → reads from `app_data/inbox/`
- Open a job with documents → document list loads, paths resolve correctly
- Document compile → writes to `app_data/application_docs/`
- Template picker → lists starters from `templates/typst/resume/` and
  `templates/typst/cover-letter/`

---

## Notes for Phase 1.7

```yaml
# docker-compose.yml — two clean volume mounts
volumes:
  - ./user_data:/app/user_data
  - ./app_data:/app/app_data
```

`ignore/` is never volume-mounted. `templates/` is committed and baked into the image.

**Missing feature flagged during this work:** The "Process Inbox" action from the
Phase 0 HTML UI has not been implemented in React. Backend routes exist and work
(`GET /api/v1/inbox/files`, `POST /api/v1/inbox/process`). Phase 2 candidate.
