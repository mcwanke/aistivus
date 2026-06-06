# FOLLOWUPS-E — Python Source Reorganization: backend/ folder

Deferred from FOLLOWUPS-D discussion. Goal: move all Python source files into a
`backend/` directory to mirror the existing `frontend/` structure and give the repo
a cleaner symmetry at the root level.

**Prerequisite:** FOLLOWUPS-D must be complete with a green test baseline before
starting this work. The path restructure and reports retirement in FOLLOWUPS-D
produce a stable foundation to reorganize from.

## Status

**DEFERRED — 2026-06-06**

All items deferred. See Decision below.

| # | Status | Title |
|---|--------|-------|
| E1 | [~] | Move Python source files → backend/ |
| E2 | [~] | Update pytest + conftest.py for new import paths |
| E3 | [~] | Update uvicorn startup command |
| E4 | [~] | Update CLAUDE.md + PROJECT_SPEC.md |

Status markers: `[ ]` todo · `[x]` done · `[~]` deferred

---

## Decision

Deferred after evaluating the runtime import problem and Docker impact.

**The problem:** After moving files to `backend/`, bare module imports (`import database`,
`from evaluator import ...`) break at runtime because `backend/` is not on `sys.path`
when running `uvicorn backend.main:app` from the project root. Fixes require either:
- `PYTHONPATH=backend` in every launch context (uvicorn command, Dockerfile ENV, CI), or
- Converting all inter-module imports to relative package style (`from . import database`)
  throughout every Python file — significant code change with no functional benefit.

**Why deferred:** The cosmetic benefit (symmetric `backend/` + `frontend/` at root) does
not justify the permanent complexity added to the startup command, Dockerfile, and every
deployment context. Python source files at the project root is conventional and all tooling
works cleanly today.

**Revisit:** After Phase 1.7 Docker is complete and working, this restructure could be
done cleanly — moving files and updating the Dockerfile CMD + ENV in one pass.

---

## Test Baseline (going in)

Not recorded — work deferred before starting.

---

## Target Structure

```
aistivus/
├── backend/                  ← new; all Python source
│   ├── main.py
│   ├── database.py
│   ├── evaluator.py
│   ├── evaluate.py
│   ├── llm_client.py
│   ├── logger.py
│   ├── env_utils.py
│   ├── profile_routes.py
│   ├── document_routes.py
│   └── tests/                ← moved from root tests/
│       ├── conftest.py
│       ├── test_database.py
│       ├── test_evaluator.py
│       ├── test_llm_client.py
│       └── routes/
├── frontend/                 ← unchanged
├── templates/                ← unchanged
├── user_data/                ← unchanged
├── app_data/                 ← unchanged
├── ignore/                   ← unchanged
├── requirements.txt          ← stays at root (pip convention)
├── pytest.ini                ← stays at root (or updated testpaths)
└── ...
```

---

## Items

### E1 — Move Python source files → backend/

**Files to move:**
- `main.py`
- `database.py`
- `evaluator.py`
- `evaluate.py`
- `llm_client.py`
- `logger.py`
- `env_utils.py`
- `profile_routes.py`
- `document_routes.py`
- `tests/` (entire directory)

**Files that stay at root:**
- `requirements.txt` — pip convention; Docker COPY expects it at root
- `pytest.ini` — can stay at root with updated `testpaths`
- `CLAUDE.md`, `PROJECT_SPEC.md`, `README.md`, etc.

**`__pycache__/`** at root: delete. A new one will be created under `backend/`
on first run.

**Scope:** Shell (mkdir backend/ + mv)

---

### E2 — Update pytest + conftest.py for new import paths

This is the highest-risk item in this workorder.

**The problem:** Tests currently import Python modules by bare name:
```python
import database
from evaluator import evaluate_job
```
After the move, `database.py` is at `backend/database.py`. pytest runs from the
project root and won't find it unless `backend/` is on the Python path.

**Approach options (decide at implementation time):**

**Option A — `sys.path` in conftest.py (minimal change):**
Add to `tests/conftest.py` (now at `backend/tests/conftest.py`):
```python
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))
```
This adds `backend/` to sys.path, making bare imports work unchanged. No import
statement changes needed anywhere.

**Option B — `pythonpath` in pytest.ini:**
```ini
[pytest]
testpaths = backend/tests
pythonpath = backend
```
Same effect as Option A but configuration-driven rather than code-driven.

**Option C — Package `backend/` with `__init__.py` + relative imports:**
Add `backend/__init__.py` and change all imports to `from backend.database import ...`.
Most invasive — touches every test file and every cross-module import in the source.
Not recommended.

**Recommendation:** Option B. One config change, no code changes, explicit and
discoverable.

**After choosing approach:** Run full test suite. Fix any remaining import failures
one at a time.

**Scope:** `pytest.ini` (or `backend/tests/conftest.py`), possibly test files if
any have hardcoded path assumptions

---

### E3 — Update uvicorn startup command

**Before:** `uvicorn main:app --host 127.0.0.1 --port 8080`
**After:** `uvicorn backend.main:app --host 127.0.0.1 --port 8080`

Run from the project root (not from inside `backend/`). All relative path defaults
(e.g., `./app_data/data/jobs.db`) continue to resolve from the working directory
where uvicorn is launched — no path default changes needed.

**Update everywhere this command appears:**
- `README.md`
- `CLAUDE.md`
- `PROJECT_SPEC.md`
- Any shell scripts or Makefile if added
- `Dockerfile` (Phase 1.7 CMD instruction)

**`evaluate.py` CLI:** Also run from root:
**Before:** `python evaluate.py`
**After:** `python backend/evaluate.py` (or `python -m backend.evaluate` if packaged)

**Scope:** Documentation + future Dockerfile CMD

---

### E4 — Update CLAUDE.md + PROJECT_SPEC.md

- Target File Structure: update to show `backend/` directory with Python files
- Startup command references: update to `uvicorn backend.main:app`
- CLI evaluator reference: update to `python backend/evaluate.py`
- Any diagram or description referencing Python files at root

**Scope:** Documentation only

---

## Risk: Working Directory and Relative Paths

All Python path defaults (e.g., `./app_data/data/jobs.db`, `./user_data/config.yaml`)
are relative to the **working directory where the process starts**, not the location
of the Python file. Since uvicorn runs from the project root, all paths continue to
resolve correctly. This is the same behavior as today.

**Verify:** After E1, start the app with `uvicorn backend.main:app` from the project
root and confirm:
- Config loads from `user_data/config.yaml`
- DB opens at `app_data/data/jobs.db`
- Logs write to `app_data/logs/app.log`

---

## Execution Order

```
1. E1 — move files (shell)
2. E2 — fix pytest imports; run tests; iterate until green
3. E3 — update startup command in docs
4. E4 — update CLAUDE.md + PROJECT_SPEC.md
5. Manual startup check (uvicorn backend.main:app from root)
6. Smoke test
```

---

## Validation Plan

**Automated:**
- Backend: `pytest tests/ -v` (path updated per E2) — match FOLLOWUPS-D baseline
- Frontend: `cd frontend && npm test` — unchanged, expect same result as FOLLOWUPS-D

**Manual startup:**
- `uvicorn backend.main:app --host 127.0.0.1 --port 8080`
- App boots, logs appear, DB accessible
- GET `/api/v1/health` → 200

**Smoke test:** Same as FOLLOWUPS-D smoke test — jobs, inbox, documents, compile.
