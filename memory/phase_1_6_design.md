---
name: phase-1-6-design
description: Phase 1.6 Document Management design decisions — folder structure, naming, finalize flow, template picker, DB changes
metadata:
  type: project
---

Phase 1.6 work order fully designed and written to `app_docs/WORKORDER-phase1.6.md`. No code started.

**Why:** Design session to lock decisions before implementation — supersedes the old Phase 1.3 work order content in that file.

**Key decisions:**

- **Folder structure:** `generated/{app_id}_{company_name}/` — created at job/application creation time (non-fatal if fails; upload route also creates as safety net)
- **Compile output:** always `DRAFT_{base_name}.pdf` — e.g. `resume_v2.typ` → `DRAFT_resume_v2.pdf`
- **Finalize output:** `{my_name}_{company}_{title}.pdf` — name sourced from `**Name:**` field in Section 1 of `jobsearch.md`; falls back to `{company}_{title}.pdf` if not found
- **Duplicate filenames:** silent `_x` rename (never reject, never silently overwrite)
- **DB delta:** `is_final INTEGER NOT NULL DEFAULT 0` added to `application_documents` via ALTER TABLE in `init_db()` (try/except OperationalError pattern)
- **One final per type:** `set_document_final()` clears prior finals of same `(application_id, type_id)` before setting new one
- **In-browser editor:** plain `<textarea>` only — validate non-empty, no null bytes, ≤5MB; syntax errors surface at compile time
- **Template picker:** `templates/typst/resume/` and `templates/typst/cover-letter/` subdirectories; adding templates is manual filesystem operation only
- **`application_info` type:** dropped from Phase 1.6
- **Upload position:** above document list in UI
- **Open vs Download:** same serve route, `?download=true` switches to attachment disposition
- **Compile loading state:** button text → "Compiling…" + disabled only; no spinner overlay

**13 priorities in work order:** Config → DB → Startup+Job hook → Core CRUD+Templates → Compile+Finalize → Storage endpoint → Typst templates → TS types → React hooks → RESUME/COVER tab → Settings card → Backend tests → Frontend tests

**How to apply:** Start at Priority 1 next session. Use the session startup prompt in the work order header.
