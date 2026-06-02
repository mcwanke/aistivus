---
name: phase-1-6-progress
description: Phase 1.6 implementation progress — what's done, what's next, key decisions made during coding
metadata:
  type: project
---

Phase 1.6 Document Management — work in progress. Work order at `app_docs/WORKORDER-phase1.6.md`.

**Why:** Enabling upload → edit → compile → finalize → download for Typst resume/cover letter files per application.

## Completed

**Batch A (Priorities 1–2):**
- `templates/CONFIG_TEMPLATE.yaml`: removed `generated_dir` from `output:`, added `typst:` section (`binary_path`, `generated_dir`)
- `database.py`: `is_final` ALTER TABLE delta in `init_db()` (try/except pattern); added `get_document_by_id()`, `get_document_by_file_path()`, `set_document_final()` after `delete_application_document`

**Batch B (Priorities 3 + 6):**
- `main.py`: added `import subprocess`
- `main.py` `lifespan()`: loads config, reads `typst.binary_path` / `typst.generated_dir`, creates `generated/` dir on startup, checks Typst binary via `subprocess.run([typst_binary, "--version"])`, stores `app.state.typst_available / typst_binary / generated_dir`
- `main.py` `health_check()`: added `typst_available` field to response (reads from `app.state`)
- `main.py` `evaluate_endpoint()`: added post-evaluation folder creation hook — lazy `from document_routes import _get_application_folder` inside try/except (non-fatal; will silently fail until Batch C creates that file)
- `main.py`: added `GET /api/v1/settings/documents-storage` endpoint (disk usage + Typst status)
- Route comment at top of `main.py` updated

## Key Decisions Made During Coding

- Work order references `create_application_document()` in document_routes — existing function is `insert_application_document()`. Will use existing name in Batch C, no rename needed.
- Work order's Priority 3 Part E said to hook folder creation into `POST /api/v1/jobs`, but that route does not exist — job creation flows through `POST /api/v1/evaluate` → `evaluator.evaluate_jd()`. Hook placed in `evaluate_endpoint()` instead. Inbox processing path relies on the upload route's safety-net folder creation.
- Typst binary templates already exist in repo — no new templates needed for Batch D (Priority 7 skipped; user will provide templates).

## In Progress / Next

- **Batch C** — Priorities 4+5: new `document_routes.py` (all CRUD + template + compile + finalize routes), registered in `main.py`
- **Batch D** — Priority 7: SKIPPED — templates already exist; user will add any new ones manually
- **Batch E** — Priorities 8+9: `frontend/src/types/documents.ts` + `frontend/src/hooks/useDocuments.ts`
- **Batch F** — Priorities 10+11: RESUME/COVER tab in JobDetail + Document Storage card in Settings
- **Batch G** — Priority 12: backend tests (`tests/routes/test_documents.py`)
- **Batch H** — Priority 13: frontend tests for RESUME/COVER tab

## Test Baseline (unchanged this session)

Frontend: 195 passed / 6 pre-existing Evaluate.test.tsx failures (201 total)
Backend: 486 passed / 0 errors

**How to apply:** Start at Batch C next session. Check this file for progress before starting.
