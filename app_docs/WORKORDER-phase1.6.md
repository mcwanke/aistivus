# AIstivus — Phase 1.6 Work Order: Document Management

## How to Use This File

Read `CLAUDE.md`, `PROJECT_SPEC.md`, and `memory/MEMORY.md` fully before doing anything.
This file defines what to build and in what order for Phase 1.6.

**Session startup prompt:**
> "Read CLAUDE.md, PROJECT_SPEC.md, and memory/MEMORY.md fully before doing anything. Today's task only:
> [paste the single item block below]
> Tell me what files you plan to touch and what changes you plan to make.
> Do not write any code until I approve your plan."

**Rules:**
- Complete ONE item at a time
- After each item, stop and wait for explicit approval
- Mark completed items `[x]` with a one-line note
- Never touch files not listed in the item's scope
- Never refactor code outside the current item's scope

---

## Phase 1.6 Goal

Enable users to associate Typst resume and cover letter files with job applications,
compile them to PDF server-side, manage versions, and finalize a submission-ready PDF
with a structured filename. Phase 1.6 is **upload → edit → compile → finalize → download** —
no AI-assisted content generation (that is Phase 2). The user brings their own `.typ` files
or uses bundled templates; this phase provides the infrastructure to manage, edit, compile,
and track those files per application.

### What's New in Phase 1.6
- Typst binary startup validation with graceful degradation
- Application document folder created at job/application creation time
- Document upload, list, delete per application (`.typ` and `.pdf`)
- Inline plain textarea editor for `.typ` files (quick edits without leaving the app)
- Template picker: copy bundled resume/cover letter templates to an application
- Server-side `typst compile` producing `DRAFT_{base_name}.pdf`
- Finalize action: generates `{my_name}_{company}_{title}.pdf` from a DRAFT; marks as final (one per type per application)
- Open (inline browser view) + Download (save to disk) for PDF files
- Application audit records for all document actions
- RESUME/COVER tab content on the JobDetail workspace
- Document Storage card in Settings

### What's NOT in Phase 1.6
- `application_info` document type — misc job research docs are a separate future feature
- AI-assisted resume content generation from `jobsearch.md` (Phase 2)
- In-app template management UI — adding new templates is a manual filesystem operation
- Per-application file count or size quotas
- Automatic disk cleanup / retention policies
- Docker deployment (Phase 1.7)

---

## Design Decisions

### Folder structure
All files for an application live in:
```
generated/{application_id}_{sanitized_company_name}/
```
`sanitized_company_name`: lowercase, `[a-zA-Z0-9_-]` only, max 40 chars, spaces and invalid
chars replaced with `_`, consecutive underscores collapsed, leading/trailing underscores stripped.

Example: application 42 at "Procter & Gamble" → `generated/42_procter_gamble/`

The `application_id` prefix guarantees uniqueness even if two company names sanitize identically.

The folder is created when the job (and its auto-created application record) is first inserted.
If folder creation fails at job creation time: log a warning — it must NOT fail the job creation
request. The upload and template-copy routes also create the folder if missing (safety net).

### Naming conventions
- **Upload**: sanitize filename stem to lowercase `[a-zA-Z0-9_-]` only, max 64 chars, extension
  preserved. Spaces → `_`, other invalid chars removed, consecutive underscores collapsed.
- **Compile output**: always `DRAFT_{base_name}.pdf`. Example: `resume_v2.typ` → `DRAFT_resume_v2.pdf`.
  On recompile, the existing DRAFT PDF record + file is replaced.
- **Final output**: `{my_name}_{company}_{title}.pdf` — each component sanitized (lowercase,
  `[a-zA-Z0-9_-]`, max 30 chars). `my_name` is sourced from the `**Name:**` field in Section 1
  of `jobsearch.md`. If not found: falls back to `{company}_{title}.pdf` and logs a warning.
- **Template copies**: default name is `resume_draft.typ` (resume) or `cover_letter_draft.typ`
  (cover letter). Silent rename applied if name already exists.

### Duplicate filename handling (silent rename)
If the target filename already exists for this application, append `_2` before the extension.
If `_2` exists, try `_3`, and so on until a free name is found. Never reject; never silently overwrite.

### `is_final` flag
`application_documents` gets a new column via delta migration: `is_final INTEGER NOT NULL DEFAULT 0`.
Only one document per `(application_id, type_id)` pair may have `is_final = 1`. When finalizing,
the backend clears `is_final` on any prior final of the same type for the same application before
setting the new one. Enforced in the application layer.

### Finalize flow
- Finalize is an explicit action on a DRAFT PDF (identified by `DRAFT_` filename prefix)
- The DRAFT PDF is **copied** (not moved) to the final filename — DRAFT remains intact
- A new `application_documents` record is created for the final PDF with `is_final = 1`
- One final per document type per application (prior final of same type has `is_final` cleared)

### Inline `.typ` editor
A plain `<textarea>` opened inline in the document row. Save triggers a `PUT` route.
Validation on save: non-empty, no null bytes, ≤ 5MB. Typst syntax errors only surface at compile time.

### Template picker
Templates live in:
- `templates/typst/resume/` — resume templates
- `templates/typst/cover-letter/` — cover letter templates

The picker lists templates by category. Selecting one copies it to the application folder with the
default name (silent `_x` rename if that name already exists), creates a DB record, and the file
appears in the document list immediately. Adding new templates is a manual process (drop a `.typ`
file into the appropriate subdirectory); no in-app upload of templates.

### Delete behavior
Deletes the DB record and the file from disk. If the file is missing on disk: log a warning and
delete the record anyway. **No chaining** — deleting a `.typ` does not affect the compiled DRAFT
PDF. Frontend shows a confirmation before calling delete.

### Open vs Download
`GET /api/v1/documents/file/{doc_id}` serves PDFs inline by default (Open in browser tab).
A `?download=true` query param switches to `Content-Disposition: attachment` (Download to disk).

### Compile loading state
Minimal: Compile button text changes to "Compiling…" and is disabled during the request.
No spinner overlay. Typst is fast; a simple button state is enough.

### Compile error surfacing
On compile failure: route returns 400 with `{ "success": false, "error": "Compilation failed", "detail": "<stderr text>" }`.
UI displays the `detail` text inline below the document row.

### Typst availability
Checked once at startup. Stored as `app.state.typst_available` (bool). If not found:
Compile button hidden entirely in the UI (not just disabled), compile route returns 503,
banner shown at top of the RESUME/COVER tab and in the Settings card.
Binary path read from `config.yaml` under `typst.binary_path` (default: `typst`, resolved via PATH).

### Document types (Phase 1.6 only)
Two types in `system_types`:
- `application_document / resume`
- `application_document / cover_letter`

`application_info` is NOT added in Phase 1.6.

---

## Priority 1 — Config Template
*No code changes. Must be done first — all Typst routes read from this config structure.*

- [ ] **1. Update `templates/CONFIG_TEMPLATE.yaml`**

  **Files:** `templates/CONFIG_TEMPLATE.yaml`

  - Remove `generated_dir` from the `output:` section if present
  - Add a new `typst:` section after `output:`:
    ```yaml
    # ─────────────────────────────────────────────────────
    # Typst document generation (Phase 1.6+)
    # Install: brew install typst  (macOS)
    #          snap install typst  (Linux)
    # ─────────────────────────────────────────────────────
    typst:
      binary_path: typst          # command name (resolved via PATH) or full path
      generated_dir: ./generated  # compiled PDFs and uploaded .typ files
    ```
  - Do NOT touch any other section of the file

---

## Priority 2 — Database: Schema Delta + Functions
*Delta migration only — never wipes or recreates existing data.*

- [ ] **2. Update `database.py`**

  **Files:** `database.py`

  **Part A — Schema delta: `is_final` column**

  In `init_db()`, after the `application_documents` `CREATE TABLE IF NOT EXISTS` statement, add:
  ```python
  # Phase 1.6 delta: add is_final column if not already present
  try:
      conn.execute(
          "ALTER TABLE application_documents ADD COLUMN is_final INTEGER NOT NULL DEFAULT 0"
      )
  except sqlite3.OperationalError:
      pass  # column already exists — safe to ignore
  ```

  **Part B — `get_document_by_id()`**
  ```python
  def get_document_by_id(doc_id: int) -> sqlite3.Row | None:
      """Return a single application_document with type info joined, or None."""
  ```
  Query:
  ```sql
  SELECT ad.*, st.type_name, st.type_value
  FROM application_documents ad
  JOIN system_types st ON st.id = ad.type_id
  WHERE ad.id = ?
  ```

  **Part C — `get_document_by_file_path()`**
  ```python
  def get_document_by_file_path(application_id: int, file_path: str) -> sqlite3.Row | None:
      """Return a document record matching application_id + file_path, or None.
      Used by compile route to find an existing DRAFT PDF before replacing it."""
  ```
  Query:
  ```sql
  SELECT * FROM application_documents WHERE application_id = ? AND file_path = ?
  ```

  **Part D — `set_document_final()`**
  ```python
  def set_document_final(doc_id: int, application_id: int, type_id: int) -> None:
      """Mark doc_id as final; clear is_final on all other docs of same type for this application.
      Enforces the one-final-per-type-per-application constraint."""
  ```
  Two statements in one connection:
  ```sql
  UPDATE application_documents SET is_final = 0 WHERE application_id = ? AND type_id = ? AND id != ?
  UPDATE application_documents SET is_final = 1 WHERE id = ?
  ```

  **Do NOT touch any other database functions.**

---

## Priority 3 — Startup Validation + Job Creation Hook
*Adds Typst check to startup. Hooks folder creation into the job creation route.*

- [ ] **3. Update `main.py`**

  **Files:** `main.py`

  **Part A — Read Typst config**

  In the config loading section (where `config.yaml` is parsed), add:
  ```python
  typst_binary = cfg.get("typst", {}).get("binary_path", "typst")
  generated_dir = Path(cfg.get("typst", {}).get("generated_dir", "./generated"))
  ```

  **Part B — Create `generated/` on startup**

  In the `lifespan` function, early in the startup sequence:
  ```python
  generated_dir.mkdir(parents=True, exist_ok=True)
  ```

  **Part C — Check Typst binary**

  In the `lifespan` function, after the LLM availability check:
  ```python
  try:
      result = subprocess.run(
          [typst_binary, "--version"],
          capture_output=True,
          timeout=5
      )
      typst_available = result.returncode == 0
  except (FileNotFoundError, subprocess.TimeoutExpired):
      typst_available = False

  app.state.typst_available = typst_available
  app.state.typst_binary = typst_binary
  app.state.generated_dir = generated_dir

  if typst_available:
      log.info("typst_available", extra={"binary": typst_binary})
  else:
      log.warning("typst_not_found", extra={
          "binary": typst_binary,
          "hint": "document compilation disabled; install typst to enable"
      })
  ```

  **Part D — Extend health endpoint**

  In `GET /api/v1/health`, add to the response dict:
  ```python
  "typst_available": getattr(request.app.state, "typst_available", False),
  ```

  **Part E — Create application folder on job creation**

  In the `POST /api/v1/jobs` route handler, after the job and application records are created
  (after `database.create_job()` returns both IDs):
  ```python
  try:
      from document_routes import _get_application_folder
      app_folder = _get_application_folder(
          request.app.state.generated_dir,
          application_id,       # the auto-created application's id
          job_data["company_name"]
      )
      app_folder.mkdir(parents=True, exist_ok=True)
  except Exception as e:
      log.warning("application_folder_create_failed", extra={"error": str(e)})
      # Non-fatal — upload route creates the folder if missing
  ```

  **Do NOT change any other routes or startup logic.**

---

## Priority 4 — Document Routes: Core CRUD + Template Routes
*New file `document_routes.py`. Registered in `main.py`.*

- [ ] **4. Create `document_routes.py`**

  **Files:** `document_routes.py` (new), `main.py` (register router + import)

  ---

  ### Module-level helpers (not routes)

  ```python
  import os, re, shutil
  from pathlib import Path

  def _get_application_folder(generated_dir: Path, application_id: int, company_name: str) -> Path:
      """Compute the document storage folder for an application."""
      sanitized = re.sub(r'[^a-zA-Z0-9_-]', '_', company_name.lower())
      sanitized = re.sub(r'_+', '_', sanitized).strip('_')[:40]
      return generated_dir / f"{application_id}_{sanitized}"

  def _sanitize_filename(name: str) -> str:
      """Sanitize a filename to lowercase [a-zA-Z0-9_-] stem, max 64 chars, extension preserved.
      Returns empty string if no valid characters remain in the stem."""
      stem, ext = os.path.splitext(name)
      stem = re.sub(r'[^a-zA-Z0-9_-]', '_', stem.lower())
      stem = re.sub(r'_+', '_', stem).strip('_')[:64]
      return stem + ext if stem else ""

  def _unique_path(folder: Path, filename: str) -> Path:
      """Return a path that does not yet exist, appending _2, _3, etc. to stem if needed."""
      target = folder / filename
      if not target.exists():
          return target
      stem, ext = os.path.splitext(filename)
      counter = 2
      while True:
          candidate = folder / f"{stem}_{counter}{ext}"
          if not candidate.exists():
              return candidate
          counter += 1

  def _sanitize_for_final_filename(s: str) -> str:
      """Sanitize a single component for use in the final PDF filename.
      Lowercase, [a-zA-Z0-9_-] only, max 30 chars."""
      s = re.sub(r'[^a-zA-Z0-9_-]', '_', s.lower().strip())
      s = re.sub(r'_+', '_', s).strip('_')
      return s[:30]

  def _get_candidate_name(jobsearch_path: str) -> str | None:
      """Extract the value of **Name:** from Section 1 of jobsearch.md.
      Returns None if the file is missing or the field is not found / still [FILL]."""
      try:
          text = Path(jobsearch_path).read_text(encoding="utf-8")
      except (FileNotFoundError, OSError):
          return None
      for line in text.splitlines():
          if line.strip().startswith("**Name:**"):
              value = line.split("**Name:**", 1)[1].strip()
              if value and value != "[FILL]":
                  return value
      return None
  ```

  ---

  ### `POST /api/v1/applications/{application_id}/documents` — Upload

  **Request:** `multipart/form-data`
  - `file`: uploaded file
  - `doc_type`: `resume` | `cover_letter`

  **Validation:**
  - Application must exist (`database.get_application(application_id)`) — 404 if not
  - Extension must be `.typ` or `.pdf` — 422 otherwise
  - Size: `.typ` ≤ 5 MB, `.pdf` ≤ 20 MB — 413 if exceeded
  - `doc_type` must be `resume` or `cover_letter` — 422 otherwise
  - Sanitize the filename. If sanitized stem is empty — 422: `"Filename contains no valid characters after sanitization."`

  **Write:**
  - Resolve folder via `_get_application_folder(...)`. Create with `mkdir(parents=True, exist_ok=True)`.
  - Resolve target path via `_unique_path(folder, sanitized_filename)` (silent rename if collision)
  - Write file bytes to the target path
  - Look up `type_id` from `system_types` where `type_name = 'application_document'` and `type_value = doc_type`
  - `database.create_application_document(application_id, type_id, str(target_path))`
  - Audit: `f"document_uploaded: {target_path.name} ({doc_type})"`

  **Response:**
  ```json
  {
    "id": 7,
    "application_id": 42,
    "type_value": "resume",
    "file_path": "generated/42_acme_corp/resume_v2.typ",
    "filename": "resume_v2.typ",
    "is_final": 0,
    "created_at": "2026-06-02 14:23:00"
  }
  ```

  ---

  ### `GET /api/v1/applications/{application_id}/documents` — List

  - Application must exist — 404 if not
  - `database.get_application_documents(application_id)`
  - For each record, compute and include:
    - `type_value` (from joined `system_types`)
    - `filename`: `os.path.basename(file_path)`
    - `extension`: `.typ` or `.pdf`
    - `file_exists`: `os.path.exists(file_path)`
    - `is_final`
  - Return list (empty list if no documents — not 404)

  ---

  ### `DELETE /api/v1/applications/{application_id}/documents/{doc_id}` — Delete

  - Look up by `database.get_document_by_id(doc_id)` — 404 if not found
  - Verify `doc["application_id"] == application_id` — 404 if mismatch (no information leak)
  - Delete file from disk: `os.remove(file_path)` in try/except. If missing: log warning, continue.
  - `database.delete_application_document(doc_id)`
  - Audit: `f"document_deleted: {filename} ({type_value})"`
  - Return `{ "success": true }`

  ---

  ### `GET /api/v1/documents/file/{doc_id}` — Serve file

  - Look up by `database.get_document_by_id(doc_id)` — 404 if not found
  - Validate path is within `generated_dir`:
    ```python
    resolved = Path(doc["file_path"]).resolve()
    if not str(resolved).startswith(str(request.app.state.generated_dir.resolve())):
        raise HTTPException(status_code=403, detail="Access denied")
    ```
  - File must exist on disk — 404 if not
  - Query param `?download=true` → `Content-Disposition: attachment; filename="..."`
  - Default → `Content-Disposition: inline; filename="..."`
  - `.pdf` → `application/pdf`; `.typ` → `text/plain`
  - Return `FileResponse(resolved, ...)`

  ---

  ### `GET /api/v1/applications/{application_id}/documents/{doc_id}/content` — Get .typ content

  - Look up doc, verify ownership — 404 if not found or mismatch
  - Extension must be `.typ` — 422: `"Content endpoint is for .typ files only."`
  - Validate path within `generated_dir` (same check as serve route)
  - File must exist — 404 if not
  - Return: `{ "content": "<file text>", "filename": "resume_v2.typ" }`

  ---

  ### `PUT /api/v1/applications/{application_id}/documents/{doc_id}/content` — Save .typ content

  **Request body:** `{ "content": "..." }`

  **Validation:**
  - Look up doc, verify ownership — 404
  - Extension must be `.typ` — 422
  - Content must be non-empty — 422
  - Content must not contain null bytes — 422
  - Encoded size must be ≤ 5 MB — 413
  - Validate path within `generated_dir`

  **Write:**
  - Write content to file (overwrite in place)
  - Audit: `f"document_edited: {filename}"`
  - Return `{ "success": true }`

  ---

  ### `GET /api/v1/templates/typst` — List available templates

  - Walk `templates/typst/resume/` and `templates/typst/cover-letter/`
  - For each `.typ` file found, produce:
    ```python
    {
      "filename": "modern-cv.typ",
      "display_name": "Modern Cv",   # stem, underscores/hyphens → spaces, title-cased
      "category": "resume"
    }
    ```
  - If a directory doesn't exist: return empty list for that category — do not 404
  - Return:
    ```json
    {
      "resume": [...],
      "cover_letter": [...]
    }
    ```

  ---

  ### `POST /api/v1/applications/{application_id}/documents/from-template` — Copy template

  **Request body:** `{ "template_filename": "modern-cv.typ", "category": "resume" }`

  **Validation:**
  - Application must exist — 404
  - `category` must be `resume` or `cover_letter` — 422
  - `template_filename` must not contain any path separator character (`/`, `\`) — 422: `"Invalid template filename."`
  - Resolve template path: `templates/typst/{category_dir}/{template_filename}`
    - `resume` → `templates/typst/resume/`
    - `cover_letter` → `templates/typst/cover-letter/`
  - Validate resolved template path is within `templates/typst/` — 403 if not
  - Template file must exist — 404

  **Copy:**
  - Default dest filename: `resume_draft.typ` (resume) or `cover_letter_draft.typ` (cover letter)
  - Resolve application folder; create if missing
  - Resolve unique dest path via `_unique_path`
  - `shutil.copy2(template_path, dest_path)`
  - Look up `type_id` for `doc_type`
  - `database.create_application_document(application_id, type_id, str(dest_path))`
  - Audit: `f"document_from_template: {template_filename} → {dest_path.name}"`
  - Return same shape as upload response

  ---

  ### Register in `main.py`

  - `app.include_router(document_routes.router, prefix="/api/v1")`
  - Update route list comment at the top of `main.py` with all new routes
  - No other changes to `main.py` beyond what is in Priority 3

---

## Priority 5 — Compile + Finalize Routes
*Added to `document_routes.py`. Depends on Priority 4 being complete.*

- [ ] **5. Add compile and finalize routes to `document_routes.py`**

  **Files:** `document_routes.py`

  ---

  ### `POST /api/v1/applications/{application_id}/documents/{doc_id}/compile`

  **Pre-flight checks:**
  - `request.app.state.typst_available` must be True — 503: `"Typst binary not found. Install Typst to enable compilation."`
  - Look up doc by `database.get_document_by_id(doc_id)` — 404 if not found
  - Verify `doc["application_id"] == application_id` — 404 if mismatch
  - Extension must be `.typ` — 422: `"Only .typ files can be compiled."`
  - Source file must exist on disk — 404 if not
  - Validate source path within `generated_dir`

  **Derive DRAFT PDF path:**
  ```python
  source_path = Path(doc["file_path"])
  pdf_name = f"DRAFT_{source_path.stem}.pdf"
  pdf_path = source_path.parent / pdf_name
  ```

  **Replace existing DRAFT PDF if present:**
  - `database.get_document_by_file_path(application_id, str(pdf_path))`
  - If found: `os.remove(pdf_path)` if it exists (wrapped in try/except), then
    `database.delete_application_document(existing["id"])`

  **Run compilation:**
  ```python
  try:
      result = subprocess.run(
          [request.app.state.typst_binary, "compile",
           str(source_path), str(pdf_path)],
          capture_output=True,
          text=True,
          timeout=30
      )
  except subprocess.TimeoutExpired:
      raise HTTPException(status_code=504, detail="Compilation timed out after 30 seconds.")
  ```

  **On failure (non-zero exit code):**
  - Do NOT create any DB record
  - Return 400:
    ```json
    { "success": false, "error": "Compilation failed", "detail": "<result.stderr>" }
    ```

  **On success:**
  - Create new `application_documents` record (same `type_id` as the source `.typ` file, `is_final = 0`)
  - Audit: `f"document_compiled: {pdf_name} from {source_path.name}"`
  - Return:
    ```json
    { "success": true, "pdf_doc_id": 8, "filename": "DRAFT_resume_v2.pdf", "file_path": "..." }
    ```

  ---

  ### `POST /api/v1/applications/{application_id}/documents/{doc_id}/finalize`

  **Pre-flight checks:**
  - Look up doc by `database.get_document_by_id(doc_id)` — 404 if not found
  - Verify ownership — 404 if mismatch
  - Extension must be `.pdf` — 422: `"Only compiled PDF files can be finalized."`
  - Filename must start with `DRAFT_` — 422: `"Only DRAFT files can be finalized. Compile a .typ file first."`
  - File must exist on disk — 404 if not
  - Validate path within `generated_dir`

  **Build final filename:**
  ```python
  application = database.get_application(application_id)
  job = database.get_job(application["job_id"])
  company = _sanitize_for_final_filename(job["company_name"])
  title = _sanitize_for_final_filename(job["title"])

  jobsearch_path = cfg.get("evaluation", {}).get("jobsearch_md_path", "./jobsearch.md")
  raw_name = _get_candidate_name(jobsearch_path)
  if raw_name:
      name = _sanitize_for_final_filename(raw_name)
      final_name = f"{name}_{company}_{title}.pdf"
  else:
      log.warning("candidate_name_not_found", extra={"fallback": f"{company}_{title}.pdf"})
      final_name = f"{company}_{title}.pdf"

  source_path = Path(doc["file_path"])
  final_path = _unique_path(source_path.parent, final_name)
  ```

  **Copy + DB:**
  - `shutil.copy2(source_path, final_path)`
  - `new_id = database.create_application_document(application_id, doc["type_id"], str(final_path))`
  - `database.set_document_final(new_id, application_id, doc["type_id"])`
  - Audit: `f"document_finalized: {final_path.name} (from {source_path.name})"`

  **Response:**
  ```json
  { "success": true, "final_doc_id": 9, "filename": "jane_doe_acme_corp_senior_engineer.pdf", "file_path": "..." }
  ```

---

## Priority 6 — Documents Storage Endpoint
*New lightweight endpoint. No impact on existing routes.*

- [ ] **6. Add `GET /api/v1/settings/documents-storage` to `main.py`**

  **Files:** `main.py`

  - Walk `app.state.generated_dir` using `rglob("*")`; count files and sum sizes
  - If directory does not exist: return zeros for all numeric fields
  - Return:
    ```json
    {
      "generated_dir": "./generated",
      "total_bytes": 22020096,
      "total_mb": 21.0,
      "file_count": 14,
      "typst_available": true,
      "typst_binary": "typst"
    }
    ```
  - `total_mb`: `round(total_bytes / 1048576, 1)`
  - `typst_available` and `typst_binary` from `app.state`
  - Update route list comment at the top of `main.py`

---

## Priority 7 — Typst Templates
*Content task. No Python or TypeScript code. Can be done in any order relative to other items.*

- [ ] **7. Add bundled Typst templates to `templates/typst/`**

  **Files:** `templates/typst/resume/`, `templates/typst/cover-letter/` (new directories + files)

  - Create both subdirectories
  - Add `templates/typst/README.md` explaining:
    - Purpose: starter templates to copy and customize
    - How to add your own: drop a `.typ` file into the appropriate subdirectory
    - No in-app template upload — filesystem only
    - Attribution and license for each bundled template
    - Link to Typst Universe for more: `https://typst.app/universe`

  - At minimum: one resume template and one cover letter template
  - Add an attribution comment block at the top of each template:
    ```typ
    // Template: {name}
    // Source: {url}
    // License: MIT
    // ─────────────────────────────────────────
    // SETUP: Customize this file, then upload via the Documents tab on any application.
    ```
  - Verify each template compiles cleanly with `typst compile {file}` before committing
  - If a template cannot be sourced or does not compile cleanly: leave a `{name}.placeholder`
    file with the source URL — do not commit a non-compiling template

---

## Priority 8 — TypeScript Interfaces
*Define all types before building any React component.*

- [ ] **8. Create `frontend/src/types/documents.ts`**

  **Files:** `frontend/src/types/documents.ts` (new)

  ```typescript
  export type DocumentTypeValue = 'resume' | 'cover_letter';

  export interface ApplicationDocument {
    id: number;
    application_id: number;
    type_id: number;
    type_value: DocumentTypeValue;
    file_path: string;
    filename: string;
    extension: '.typ' | '.pdf';
    file_exists: boolean;
    is_final: number;  // 0 | 1
    created_at: string;
  }

  export interface DocumentUploadResult {
    id: number;
    application_id: number;
    type_value: DocumentTypeValue;
    file_path: string;
    filename: string;
    is_final: number;
    created_at: string;
  }

  export interface CompileResult {
    success: boolean;
    pdf_doc_id?: number;
    filename?: string;
    file_path?: string;
    error?: string;
    detail?: string;
  }

  export interface FinalizeResult {
    success: boolean;
    final_doc_id?: number;
    filename?: string;
    file_path?: string;
  }

  export interface TypstTemplate {
    filename: string;
    display_name: string;
    category: 'resume' | 'cover_letter';
  }

  export interface TypstTemplateList {
    resume: TypstTemplate[];
    cover_letter: TypstTemplate[];
  }

  export interface DocumentsStorageInfo {
    generated_dir: string;
    total_bytes: number;
    total_mb: number;
    file_count: number;
    typst_available: boolean;
    typst_binary: string;
  }
  ```

  Also add `typst_available: boolean` to the health response type, wherever it is currently defined.

---

## Priority 9 — React Hooks
*All server state and mutation logic lives in hooks.*

- [ ] **9. Create `frontend/src/hooks/useDocuments.ts`**

  **Files:** `frontend/src/hooks/useDocuments.ts` (new)

  **`useApplicationDocuments(applicationId: number)`**
  - `GET /api/v1/applications/{id}/documents`
  - Stale time: 0 (documents change frequently during active workflow)
  - Returns `{ documents, isLoading, error }`

  **`useUploadDocument(applicationId: number)`**
  - Mutation: `POST /api/v1/applications/{id}/documents` (multipart/form-data)
  - On success: invalidate `['documents', applicationId]`

  **`useDeleteDocument(applicationId: number)`**
  - Mutation: `DELETE .../documents/{doc_id}`
  - On success: invalidate `['documents', applicationId]`

  **`useCompileDocument(applicationId: number)`**
  - Mutation: `POST .../documents/{doc_id}/compile`
  - On success: invalidate `['documents', applicationId]`
  - Returns `CompileResult` — caller is responsible for success/error display

  **`useFinalizeDocument(applicationId: number)`**
  - Mutation: `POST .../documents/{doc_id}/finalize`
  - On success: invalidate `['documents', applicationId]`
  - Returns `FinalizeResult`

  **`useDocumentContent(applicationId: number, docId: number | null)`**
  - `GET /api/v1/applications/{app_id}/documents/{doc_id}/content`
  - Only fetches when `docId` is non-null (enabled flag)
  - Returns `{ content, filename, isLoading, error }`

  **`useSaveDocumentContent(applicationId: number)`**
  - Mutation: `PUT .../documents/{doc_id}/content`
  - On success: invalidate `['document-content', docId]`

  **`useTypstTemplates()`**
  - `GET /api/v1/templates/typst`
  - Stale time: 60 seconds
  - Returns `{ templates: TypstTemplateList, isLoading, error }`

  **`useCopyTemplate(applicationId: number)`**
  - Mutation: `POST /api/v1/applications/{id}/documents/from-template`
  - On success: invalidate `['documents', applicationId]`

  **`useDocumentsStorage()`**
  - `GET /api/v1/settings/documents-storage`
  - Stale time: 30 seconds
  - Used only by the Settings page

---

## Priority 10 — RESUME/COVER Tab (JobDetail)
*Fills the currently-empty RESUME/COVER tab on the job workspace.*

- [ ] **10. Build the RESUME/COVER tab content**

  **Files:** Read the current JobDetail implementation before touching anything.
  Only modify files directly responsible for the RESUME/COVER tab content.

  The tab contains three sections, top to bottom:

  ---

  **Section A — Typst unavailable banner**

  Shown only when `typst_available: false` from the health endpoint:
  ```
  ⚠  Typst not found — compilation disabled.
     Install: brew install typst  (macOS) · snap install typst  (Linux)
     Restart the server after installing.
  ```

  ---

  **Section B — Upload + Template picker**

  *Template picker (above upload form):*
  - "New from template" UI — a dropdown or inline button group
  - Lists resume and cover letter templates from `useTypstTemplates()`
  - Organized by category (resume / cover letter)
  - Selecting a template calls `useCopyTemplate`; document list refreshes on success
  - If `useTypstTemplates()` returns empty for both categories: hide this section entirely

  *Upload form:*
  ```
  Type: [Resume ▼]    [Choose file .typ / .pdf]    [Upload]
  ```
  - Type selector: Resume | Cover Letter
  - File picker: accepts `.typ,.pdf`
  - Upload button: shows "Uploading…" + disabled during request
  - Inline error on failure (size, extension, sanitization)
  - On success: form resets, document list refreshes

  ---

  **Section C — Document list**

  Empty state: "No documents yet. Upload a file or start from a template above."

  Each document row shows: filename, type badge, date. Buttons depend on file type and status:

  | File | Buttons shown |
  |---|---|
  | `.typ` file | Edit · Compile (hidden if Typst unavailable) · Delete |
  | `.pdf` with `DRAFT_` prefix | Finalize · Open · Download · Delete |
  | `.pdf` with `is_final = 1` | `[Final]` badge · Open · Download · Delete |
  | other `.pdf` (uploaded directly) | Open · Download · Delete |
  | any with `file_exists: false` | filename in muted/red · `⚠ File missing` badge · Delete |

  **Edit interaction:**
  - Edit button opens an inline textarea directly below the row (not a modal)
  - Textarea content pre-filled from `useDocumentContent`; show loading state while fetching
  - Save button: calls `useSaveDocumentContent`; closes editor on success; shows error inline on failure
  - Cancel button: discards changes, closes editor without saving
  - Validate non-empty + size before calling Save; show inline error if invalid

  **Compile interaction:**
  - Compile button text changes to "Compiling…" + disabled during request
  - On success: list refreshes; new DRAFT PDF row appears
  - On failure: `detail` text from response shown inline below the row

  **Finalize interaction:**
  - Finalize button triggers `useFinalizeDocument`
  - On success: list refreshes; new final PDF row appears with `[Final]` badge
  - Prior final of same type loses its badge (cleared server-side; list refresh surfaces this)

  **Delete interaction:**
  - Click Delete → inline confirmation: "Delete {filename}? This cannot be undone." + Confirm / Cancel
  - Cancel: dismisses with no API call
  - Confirm: calls `useDeleteDocument`; list refreshes on success
  - No chaining: deleting a `.typ` does not mention or offer to delete its compiled PDF

  **Open / Download:**
  - Open → `window.open('/api/v1/documents/file/{doc_id}', '_blank')`
  - Download → `window.open('/api/v1/documents/file/{doc_id}?download=true', '_blank')`

  **`typst_available` source:**
  - Read from the health query (`useHealthStatus()` or equivalent already in scope)
  - Do not make a separate health request if one is already cached by React Query

---

## Priority 11 — Settings: Document Storage Card
*New card on the existing Settings page.*

- [ ] **11. Add Document Storage card to `frontend/src/pages/Settings.tsx`**

  **Files:** `frontend/src/pages/Settings.tsx`

  - Use `useDocumentsStorage()` hook
  - Add a "Document Storage" card after the existing data sections
  - Do not restructure other sections of the page

  **Card content:**
  ```
  Document Storage
  ────────────────────────────────────────────
  Typst:    ● Available  (typst)
            — or —
            ✗ Not found — compile disabled
              Install: brew install typst  (macOS)
                       snap install typst  (Linux)
                       Restart the server after installing.

  Generated files:   14 files · 21.0 MB
                     ./generated
  ```
  - "Available" in green accent color
  - "Not found" in red/muted
  - If `file_count === 0` and `total_bytes === 0`: "No generated files yet."
  - Loading: skeleton or spinner while query in flight
  - No "purge" button in Phase 1.6

---

## Priority 12 — Backend Tests

- [ ] **12. Backend tests for document routes**

  **Files:** `tests/routes/test_documents.py` (new)

  **Upload:**
  - Happy path `.typ` → record created, file written to disk, audit entry
  - Happy path `.pdf` → same
  - Invalid extension (`.docx`) → 422
  - Invalid `doc_type` → 422
  - `.typ` > 5 MB → 413
  - `.pdf` > 20 MB → 413
  - Application not found → 404
  - Filename with spaces and special chars → sanitized correctly
  - Duplicate filename → silently renamed with `_2` suffix; second duplicate → `_3`

  **List:**
  - Returns correct records; includes `type_value`, `filename`, `extension`, `file_exists`, `is_final`
  - Returns empty list when no documents
  - `file_exists: false` when file not on disk

  **Delete:**
  - Happy path: record deleted, file deleted, audit entry created
  - File missing on disk: record still deleted, warning logged, no error raised
  - Wrong `application_id` for doc → 404
  - Doc not found → 404

  **Serve (`GET /api/v1/documents/file/{doc_id}`):**
  - `.pdf` → `application/pdf`, inline disposition
  - `.pdf` with `?download=true` → attachment disposition
  - `.typ` → `text/plain`, attachment
  - Path traversal attempt → 403
  - File not on disk → 404

  **Content GET/PUT:**
  - GET returns content for `.typ` file
  - GET returns 422 for `.pdf`
  - PUT saves content; audit entry created
  - PUT with empty content → 422
  - PUT with null byte in content → 422
  - PUT with content > 5 MB → 413

  **Compile:**
  - Happy path (mocked `subprocess.run` success): DRAFT PDF record created, existing DRAFT replaced, audit entry, returns `pdf_doc_id`
  - `typst_available = False` → 503
  - Source is `.pdf` → 422
  - Compile failure (mocked non-zero returncode) → 400 with `stderr` in `detail`
  - Compile timeout (mocked `TimeoutExpired`) → 504
  - Application/doc mismatch → 404

  **Finalize:**
  - Happy path: final PDF created with correct filename, `is_final = 1` set, prior final of same type cleared, audit entry
  - Source is `.typ` → 422
  - Source is a non-DRAFT `.pdf` (no `DRAFT_` prefix) → 422
  - Candidate name missing from `jobsearch.md` → falls back to `{company}_{title}.pdf`, no error raised
  - Prior final of different type not affected by finalize of this type
  - Duplicate final filename → silently renamed with `_2`

  **Template routes:**
  - List returns templates grouped by category
  - List returns empty lists (not 404) when directories don't exist
  - Copy template → record created, file in application folder
  - Template filename containing `/` → 422
  - Template not found → 404

  **Documents storage:**
  - Returns correct size and file count for a populated directory
  - Returns zeros when directory is missing

---

## Priority 13 — Frontend Tests

- [ ] **13. Frontend tests for RESUME/COVER tab**

  **Files:** Read the current JobDetail test file before touching anything.
  Add tests to the existing test file — do not create a new file unless none exists.

  Add MSW handlers for all new routes. Test coverage required:

  - RESUME/COVER tab renders when clicked
  - Document list renders filename, type badge, date from fixture
  - `.typ` row shows Edit and Compile; no Open/Download/Finalize
  - `DRAFT_` PDF row shows Finalize, Open, Download; no Compile
  - Final PDF row shows `[Final]` badge, Open, Download; no Compile or Finalize
  - Non-DRAFT uploaded PDF shows Open and Download; no Compile or Finalize
  - Compile button hidden (not just disabled) when `typst_available: false` in health fixture
  - Typst unavailable banner shown when `typst_available: false`
  - Compile button shows "Compiling…" during request
  - Compile error text shown inline on failure
  - Finalize success refreshes the list; new final row with `[Final]` badge appears
  - Delete button click shows inline confirmation; Cancel does not call DELETE
  - Delete Confirm calls DELETE and list refreshes
  - Edit button opens inline textarea pre-filled with content
  - Save calls PUT; editor closes on success
  - Cancel closes editor without saving
  - Upload form renders type selector and file picker
  - Template picker renders when templates exist; hidden when both categories empty
  - Selecting a template calls the copy endpoint and list refreshes
  - Empty state shown when document list is empty
  - `file_exists: false` shows "⚠ File missing" badge and muted filename

---

## API Route Summary

| Method | Route | Description |
|---|---|---|
| POST | `/api/v1/applications/{id}/documents` | Upload document |
| GET | `/api/v1/applications/{id}/documents` | List documents |
| DELETE | `/api/v1/applications/{id}/documents/{doc_id}` | Delete document + file |
| GET | `/api/v1/applications/{id}/documents/{doc_id}/content` | Get .typ file text |
| PUT | `/api/v1/applications/{id}/documents/{doc_id}/content` | Save .typ file text |
| POST | `/api/v1/applications/{id}/documents/{doc_id}/compile` | Compile .typ → DRAFT .pdf |
| POST | `/api/v1/applications/{id}/documents/{doc_id}/finalize` | Generate final named PDF |
| POST | `/api/v1/applications/{id}/documents/from-template` | Copy template to application |
| GET | `/api/v1/documents/file/{doc_id}` | Serve file (inline or ?download=true) |
| GET | `/api/v1/templates/typst` | List available Typst templates |
| GET | `/api/v1/settings/documents-storage` | Disk usage + Typst status |

---

## Security Checklist
*(Verify before closing each backend priority)*

- [ ] All file paths validated within `generated_dir` before any read/write/delete/serve
- [ ] Template paths validated within `templates/typst/` before any copy
- [ ] Template filename validated as filename-only (no `/` or `\`) before path construction
- [ ] No SQL string interpolation — parameterized queries only
- [ ] Extension validated before compile (`.typ` only) and finalize (`.pdf` only)
- [ ] Filename sanitized on upload: lowercase `[a-zA-Z0-9_-]` stem, max 64 chars
- [ ] Application ownership verified on every document operation (`doc["application_id"]` check)
- [ ] Subprocess timeout enforced (30 s) on every compile call
- [ ] `stderr` captured and returned as user-readable message — never raised as unhandled exception
- [ ] `?download=true` does not bypass path validation
- [ ] No API keys or PII in log output
