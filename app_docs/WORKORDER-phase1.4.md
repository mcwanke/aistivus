# AIstivus — Phase 1.3 Work Order: Typst / Document Management

## How to Use This File

Read `CLAUDE.md` and `PROJECT_SPEC.md` fully before doing anything.
This file defines what to build and in what order for Phase 1.3.

**Session startup prompt:**
> "Read CLAUDE.md and PROJECT_SPEC.md fully before doing anything. Today's task only:
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

## Phase 1.3 Goal

Enable users to associate Typst resume files with job applications, compile them
to PDF server-side, and view or download the results. Phase 1.3 is purely
**upload → compile → view** — no AI-assisted content generation (that is Phase 2).
The user brings their own customized `.typ` file; this phase provides the
infrastructure to manage, compile, and track those files per application.

### What's New in Phase 1.3
- Typst binary startup validation with graceful degradation
- Document upload, list, delete per application (`.typ` and `.pdf`)
- Server-side `typst compile` with replace-on-compile behavior
- PDF viewing in a new browser tab
- Application audit records for document actions
- Document section (4th tab) on ApplicationDetail page
- Document storage widget in Settings
- Two bundled Typst resume templates

### What's NOT in Phase 1.3
- AI-assisted resume generation from `jobsearch.md` content (Phase 2)
- In-app `.typ` editor (users edit in their own text editor)
- Per-application file count or size quotas
- Automatic disk cleanup (user manages via Settings disk usage display)
- Docker deployment (Phase 1.4)

---

## Design Decisions

### Compile behavior (Option A — naming convention)
`resume.typ` always compiles to `resume.pdf` in the same `generated/{app_id}/`
directory. When the compile route runs:
1. Derive the PDF path by replacing `.typ` extension with `.pdf`
2. Query `application_documents` for an existing record with that `file_path`
3. If found: delete the old file from disk and delete the DB record
4. Run `typst compile source.typ output.pdf` (30s timeout)
5. On success: create a new `application_documents` record for the PDF

This keeps disk usage bounded per source file and reflects the correct
"source → derivative" relationship. Users manage `.typ` files; compiled
PDFs follow automatically.

### Delete behavior
The delete route deletes both the DB record and the file from disk.
The frontend always shows a confirmation dialog before calling delete.
The audit log records every deletion.

### Document types
Three document types exist under `application_document` in `system_types`:
- `resume` — the primary tailored resume (`.typ` compilable or pre-built `.pdf`)
- `cover_letter` — cover letter for this application
- `application_info` — supporting documents: offer letters, rejection emails, JD PDFs, etc.

File format (`.typ` vs `.pdf`) is independent of type. A `resume` can be
a `.typ` file (user will compile it) or a `.pdf` (already compiled externally).
`application_info` files will typically always be `.pdf`.

### File storage
All files stored in `generated/{application_id}/` (relative to project root).
Filenames sanitized on upload: `[a-zA-Z0-9_-]` only (stem only; extension preserved),
max 64 characters for the stem. Spaces → `_`, other invalid chars → removed,
consecutive underscores collapsed. If sanitized name is empty: reject with 422.

### Upload limits
- `.typ` files: 5MB maximum
- `.pdf` files: 20MB maximum
- Other extensions: rejected with 422

### Duplicate filename handling
If a file with the same sanitized name already exists for this application,
return 409 with message: "A file named {name} already exists for this
application. Delete it first or rename your file."

### Typst availability
Checked once at startup. Stored as `app.state.typst_available` (bool).
If not found: compile button hidden in the frontend; compile route returns 503.
Binary path read from `config.yaml` under `typst.binary_path` (default: `typst`,
resolved via PATH). Health endpoint includes `typst_available` field.

### Disk usage visibility
`GET /api/v1/settings/documents-storage` walks `generated/` and returns
total size and file count. Called only when user opens the Settings page —
not on health check (keeps health fast).

---

## Priority 1 — Config Template
*No code changes. Must be done first — all Typst routes read from this config structure.*

- [ ] **1. Update `templates/CONFIG_TEMPLATE.yaml`**

  **Files:** `templates/CONFIG_TEMPLATE.yaml`

  - Remove `generated_dir` from the `output:` section (currently labeled "Phase 2+")
  - Add a new `typst:` section after `output:`:
    ```yaml
    # ─────────────────────────────────────
    # Typst document generation (Phase 1.3+)
    # Install Typst: brew install typst  (macOS)
    #                snap install typst  (Linux)
    # ─────────────────────────────────────
    typst:
      binary_path: typst          # command name (resolved via PATH) or full path
      generated_dir: ./generated  # compiled PDFs and uploaded .typ files
    ```
  - Leave `resume_template_path` under `output:` — that is user data, not Typst config
  - Do NOT touch any other section of the file

---

## Priority 2 — Database
*Minimal additions. Safe to run against existing DB.*

- [ ] **2. Add `application_info` system_type seed and missing document DB functions**

  **Files:** `database.py`

  **Part A — system_types seed**
  - In `init_db()`, find the `system_types` seed block
  - Add one new entry to the INSERT list:
    ```python
    ('application_document', 'application_info'),
    ```
  - This uses the same `INSERT OR IGNORE` pattern as existing seeds — safe
    to run against existing databases; new type will be inserted on next startup
  - Do NOT modify any other seed values

  **Part B — `get_document_by_id()`**
  - Add this function:
    ```python
    def get_document_by_id(doc_id: int) -> sqlite3.Row | None:
        """Return a single application_document record with type info, or None."""
    ```
  - Query: `SELECT ad.*, st.type_name, st.type_value FROM application_documents ad JOIN system_types st ON st.id = ad.type_id WHERE ad.id = ?`
  - Returns the row or `None` if not found

  **Part C — `get_document_by_file_path()`**
  - Add this function:
    ```python
    def get_document_by_file_path(application_id: int, file_path: str) -> sqlite3.Row | None:
        """Return a document record matching application_id + file_path, or None.
        Used by compile route to find an existing PDF before replacing it."""
    ```
  - Query: `SELECT * FROM application_documents WHERE application_id = ? AND file_path = ?`
  - Returns the row or `None`

  **Do NOT touch any other database functions.**

---

## Priority 3 — Startup Validation & Health Endpoint
*Adds Typst check to the existing startup sequence. Extends health response.*

- [ ] **3. Typst startup validation in `main.py`**

  **Files:** `main.py`

  **Part A — Read Typst config**
  - In the config loading section (where `config.yaml` is parsed), read:
    ```python
    typst_binary = cfg.get("typst", {}).get("binary_path", "typst")
    generated_dir = Path(cfg.get("typst", {}).get("generated_dir", "./generated"))
    ```

  **Part B — Create `generated/` on startup**
  - In the `lifespan` function, before the LLM availability check, ensure the
    `generated_dir` directory exists:
    ```python
    generated_dir.mkdir(parents=True, exist_ok=True)
    ```

  **Part C — Check Typst binary**
  - In the `lifespan` function, after the LLM availability check:
    ```python
    import subprocess
    try:
        result = subprocess.run(
            [typst_binary, "--version"],
            capture_output=True, timeout=5
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

  **Part D — Extend health endpoint response**
  - In `GET /api/v1/health`, add a `typst_available` field to the JSON response:
    ```python
    "typst_available": getattr(request.app.state, "typst_available", False),
    ```

  **Do NOT change any other startup logic or routes.**

---

## Priority 4 — Document Routes (Upload, List, Delete, Serve)
*New file `document_routes.py`. Registered in `main.py`.*

- [ ] **4. Create `document_routes.py` with upload, list, delete, and serve routes**

  **Files:** `document_routes.py` (new), `main.py`

  ---

  ### Path sanitization utility (internal, not a route)

  Add a module-level helper:
  ```python
  def _sanitize_filename(name: str) -> str:
      """Sanitize a filename stem to [a-zA-Z0-9_-] only, max 64 chars."""
      stem, ext = os.path.splitext(name)
      stem = re.sub(r'[^a-zA-Z0-9_-]', '_', stem)
      stem = re.sub(r'_+', '_', stem).strip('_')
      stem = stem[:64]
      return stem + ext if stem else ""
  ```

  ---

  ### `POST /api/v1/applications/{application_id}/documents` — Upload

  **Request:** `multipart/form-data`
  - `file`: the uploaded file
  - `doc_type`: one of `resume`, `cover_letter`, `application_info`

  **Validation (return 422 on any failure):**
  - Application must exist — `database.get_application(application_id)` — 404 if not found
  - File extension must be `.typ` or `.pdf` — 422 otherwise
  - File size: `.typ` ≤ 5MB, `.pdf` ≤ 20MB — 413 with message if exceeded
  - `doc_type` must be one of the three valid values — 422 otherwise
  - Sanitize the uploaded filename stem. If sanitized stem is empty — 422 with message
    "Filename contains no valid characters after sanitization."

  **Duplicate check:**
  - Construct the target path: `{generated_dir}/{application_id}/{sanitized_name}`
  - Call `database.get_document_by_file_path(application_id, str(target_path))`
  - If a record exists — return 409: "A file named {sanitized_name} already exists
    for this application. Delete it first or rename your file."

  **Write file:**
  - Create `{generated_dir}/{application_id}/` if it does not exist
  - Write file bytes to the target path
  - Look up `type_id` from `system_types` where `type_name = 'application_document'`
    and `type_value = doc_type`
  - Call `database.create_application_document(application_id, type_id, str(target_path))`
  - Call `database._audit_application(application_id,
      f"document_uploaded: {sanitized_name} ({doc_type})")`

  **Response:**
  ```json
  {
    "id": 7,
    "application_id": 42,
    "type_value": "resume",
    "file_path": "generated/42/resume_v2.typ",
    "filename": "resume_v2.typ",
    "created_at": "2026-05-17 14:23:00"
  }
  ```

  ---

  ### `GET /api/v1/applications/{application_id}/documents` — List

  - Application must exist — 404 if not
  - Call `database.get_application_documents(application_id)`
  - For each record, include:
    - All `application_documents` fields
    - `type_value` (resume / cover_letter / application_info)
    - `filename`: `os.path.basename(file_path)`
    - `extension`: `.typ` or `.pdf`
    - `file_exists`: `os.path.exists(file_path)` — surface broken links in UI
  - Return list (empty list if no documents)

  ---

  ### `DELETE /api/v1/applications/{application_id}/documents/{doc_id}` — Delete

  - Look up doc by `database.get_document_by_id(doc_id)` — 404 if not found
  - Verify `doc.application_id == application_id` — 404 if mismatch (no information leak)
  - Delete the file from disk if it exists: `os.remove(file_path)` wrapped in try/except
    (log warning if file not found on disk — record may be stale — continue with record delete)
  - Call `database.delete_application_document(doc_id)`
  - Call `database._audit_application(application_id,
      f"document_deleted: {filename} ({type_value})")`
  - Return `{ "success": true }`

  ---

  ### `GET /api/v1/documents/file/{doc_id}` — Serve file

  - Look up doc by `database.get_document_by_id(doc_id)` — 404 if not found
  - Resolve the file path and **validate it is within `generated_dir`**:
    ```python
    resolved = Path(doc["file_path"]).resolve()
    if not str(resolved).startswith(str(generated_dir.resolve())):
        raise HTTPException(status_code=403, detail="Access denied")
    ```
  - File must exist on disk — 404 if not
  - Set Content-Type and Content-Disposition based on extension:
    - `.pdf` → `application/pdf`, `Content-Disposition: inline; filename="..."`
    - `.typ` → `text/plain`, `Content-Disposition: attachment; filename="..."`
  - Return `FileResponse(resolved)`

  ---

  ### Register in `main.py`

  - Import `document_routes` and register with `app.include_router(document_routes.router, prefix="/api/v1")`
  - Update the route list comment at the top of `main.py` with all new routes
  - No other changes to `main.py`

---

## Priority 5 — Compile Route
*Added to `document_routes.py`. Depends on Priority 4 being complete.*

- [ ] **5. Add compile route to `document_routes.py`**

  **Files:** `document_routes.py`

  ### `POST /api/v1/applications/{application_id}/documents/{doc_id}/compile`

  **Pre-flight checks:**
  - Check `request.app.state.typst_available` — 503 if False:
    `"Typst binary not found. Install Typst to enable compilation."`
  - Look up doc by `database.get_document_by_id(doc_id)` — 404 if not found
  - Verify `doc.application_id == application_id` — 404 if mismatch
  - Verify file extension is `.typ` — 422 if not:
    `"Only .typ files can be compiled."`
  - Verify source file exists on disk — 404 if not

  **Derive PDF path (Option A naming convention):**
  ```python
  source_path = Path(doc["file_path"])
  pdf_path = source_path.with_suffix(".pdf")
  ```

  **Replace existing PDF if present:**
  - Call `database.get_document_by_file_path(application_id, str(pdf_path))`
  - If found:
    - Delete the file: `os.remove(pdf_path)` if it exists (wrapped in try/except)
    - Call `database.delete_application_document(existing_record["id"])`

  **Run compilation:**
  ```python
  import subprocess
  try:
      result = subprocess.run(
          [request.app.state.typst_binary, "compile",
           str(source_path), str(pdf_path)],
          capture_output=True,
          text=True,
          timeout=30
      )
  except subprocess.TimeoutExpired:
      raise HTTPException(status_code=504,
          detail="Compilation timed out after 30 seconds.")
  ```

  **On failure (non-zero exit code):**
  - Do NOT create any DB record
  - Return 400:
    ```json
    { "success": false, "error": "Compilation failed", "detail": "<stderr text>" }
    ```

  **On success:**
  - Look up `type_id` for `application_document / resume` — use the same `type_value`
    as the source `.typ` file (carry forward the doc_type)
  - Call `database.create_application_document(application_id, type_id, str(pdf_path))`
  - Call `database._audit_application(application_id,
      f"document_compiled: {pdf_path.name} from {source_path.name}")`
  - Return:
    ```json
    {
      "success": true,
      "pdf_doc_id": 8,
      "filename": "resume_v2.pdf",
      "file_path": "generated/42/resume_v2.pdf"
    }
    ```

---

## Priority 6 — Documents Storage Settings Endpoint
*New lightweight endpoint. No impact on existing routes.*

- [ ] **6. Add `GET /api/v1/settings/documents-storage` to `main.py`**

  **Files:** `main.py`

  - Walk `generated_dir` (from `app.state.generated_dir`):
    ```python
    total_bytes = 0
    file_count = 0
    for f in generated_dir.rglob("*"):
        if f.is_file():
            total_bytes += f.stat().st_size
            file_count += 1
    ```
  - If `generated_dir` does not exist: return zeros
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
  - `total_mb`: round to one decimal place
  - `typst_available` and `typst_binary` sourced from `app.state`
  - Update the route list comment at the top of `main.py`

---

## Priority 7 — Typst Templates
*Content task. No code. Can be done in any order relative to other items.*

- [ ] **7. Add two Typst resume templates to `templates/typst/`**

  **Files:** `templates/typst/` (new directory), two `.typ` files

  - Create `templates/typst/` directory
  - Add `templates/typst/README.md` with:
    - Brief explanation: these are starting templates to copy and customize
    - Instructions: copy to `my_data/resume_templates/`, edit, then upload to an application
    - Links to Typst Universe for more templates: `https://typst.app/universe`
    - Attribution for each template (name, author, license)

  **Template 1 — `modern-cv.typ`**
  - Source: `https://typst.app/universe/package/modern-cv/` (MIT license)
  - Fetch the latest `.typ` source from the Typst Universe page
  - Add a comment block at the top of the file:
    ```typ
    // Template: modern-cv
    // Source: https://typst.app/universe/package/modern-cv/
    // License: MIT
    // ─────────────────────────────────────────────────────
    // SETUP: Copy this file to my_data/resume_templates/ and customize.
    // Then upload to an application via the Documents tab.
    ```
  - Verify the template compiles cleanly with `typst compile modern-cv.typ` before committing
    (requires Typst installed locally)

  **Template 2 — `simple-technical-resume.typ`**
  - Source: `https://typst.app/universe/package/simple-technical-resume/` (MIT license)
  - Same comment block pattern with updated name and source URL
  - Verify compiles cleanly before committing

  **If either template cannot be fetched or does not compile cleanly:**
  - Note the issue and leave a placeholder `{name}.typ.placeholder` with the source URL
  - Do not commit a non-compiling template

---

## Priority 8 — TypeScript Interfaces
*Define all types before building any frontend component.*

- [ ] **8. Create `frontend/src/types/documents.ts`**

  **Files:** `frontend/src/types/documents.ts` (new)

  ```typescript
  export type DocumentTypeValue = 'resume' | 'cover_letter' | 'application_info';

  export interface ApplicationDocument {
    id: number;
    application_id: number;
    type_id: number;
    type_value: DocumentTypeValue;
    file_path: string;
    filename: string;
    extension: '.typ' | '.pdf';
    file_exists: boolean;
    created_at: string;
  }

  export interface DocumentUploadResult {
    id: number;
    application_id: number;
    type_value: DocumentTypeValue;
    file_path: string;
    filename: string;
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

  export interface DocumentsStorageInfo {
    generated_dir: string;
    total_bytes: number;
    total_mb: number;
    file_count: number;
    typst_available: boolean;
    typst_binary: string;
  }
  ```

  Also add `typst_available: boolean` to the health response type in
  `frontend/src/types/api.ts` (or wherever the health response interface is defined).

---

## Priority 9 — React Hooks
*All server state and mutation logic lives in hooks.*

- [ ] **9. Create `frontend/src/hooks/useDocuments.ts`**

  **Files:** `frontend/src/hooks/useDocuments.ts` (new)

  **`useApplicationDocuments(applicationId: number)`**
  - React Query: `GET /api/v1/applications/{id}/documents`
  - Returns `{ documents, isLoading, error }`
  - Stale time: 0 (documents change often during active workflow)

  **`useUploadDocument(applicationId: number)`**
  - Mutation: `POST /api/v1/applications/{id}/documents` (multipart/form-data)
  - On success: invalidate `['documents', applicationId]` and `['application', applicationId]`
    (audit list will have refreshed)
  - Returns mutation object with `uploadDocument(file: File, docType: DocumentTypeValue)`

  **`useDeleteDocument(applicationId: number)`**
  - Mutation: `DELETE /api/v1/applications/{id}/documents/{doc_id}`
  - On success: invalidate `['documents', applicationId]` and `['application', applicationId]`
  - Returns mutation object with `deleteDocument(docId: number)`

  **`useCompileDocument(applicationId: number)`**
  - Mutation: `POST /api/v1/applications/{id}/documents/{doc_id}/compile`
  - On success: invalidate `['documents', applicationId]`
  - Returns mutation object with `compileDocument(docId: number)`
  - Returns `CompileResult` — caller handles success vs error display

  **`useDocumentsStorage()`**
  - React Query: `GET /api/v1/settings/documents-storage`
  - Stale time: 30 seconds
  - Used only by Settings page

---

## Priority 10 — ApplicationDetail: Document Tab
*New tab added to the existing 3-tab left panel.*

- [ ] **10. Add Documents tab to `frontend/src/pages/ApplicationDetailPage.tsx`**

  **Files:** `frontend/src/pages/ApplicationDetailPage.tsx`

  **Tab bar update:**
  - Add `'documents'` to the `leftTab` state type:
    ```typescript
    const [leftTab, setLeftTab] = useState<'details' | 'add-log' | 'add-lesson' | 'documents'>('details')
    ```
  - Add "Documents" tab button to the existing tab bar row (4th tab)

  **Document tab content — `DocumentsPanel` component (defined in the same file):**

  *Props:* `applicationId: number`, `typstAvailable: boolean`

  *Document list:*
  - Use `useApplicationDocuments(applicationId)`
  - Loading state: spinner
  - Empty state: "No documents yet. Upload a .typ or .pdf file to get started."
  - For each document, show a row:
    ```
    resume_v2.typ    Resume    May 17    [Compile ↓]  [Delete]
    resume_v2.pdf    Resume    May 17    [Open PDF ↗] [Delete]
    cover_acme.pdf   Cover Letter  May 15  [Open PDF ↗] [Delete]
    offer_letter.pdf  App Info  May 20  [Open PDF ↗] [Delete]
    ```
  - **Compile button:** only shown for `.typ` files; hidden entirely if `typstAvailable` is false
    (not just disabled — no confusing grayed button with no explanation)
  - **Open PDF button:** only shown for `.pdf` files; calls
    `window.open('/api/v1/documents/file/{doc_id}', '_blank')`
  - **Delete button:** always shown; clicking opens an inline confirmation:
    "Delete {filename} from disk? This cannot be undone." with Confirm / Cancel
    Confirm calls `deleteDocument(doc_id)`
  - `file_exists: false` on a record: show filename in red/muted with a "⚠ File missing" badge;
    Delete button still shown (cleans up stale record)

  *Compile interaction:*
  - During compile: replace Compile button with a spinner + "Compiling…" label
  - On success: document list refreshes (query invalidated); new PDF row appears
  - On failure: show inline error below the row with the detail text from the response

  *Upload form:*
  - Below the document list, a compact upload form:
    ```
    Type: [Resume ▼]   [Choose file]   [Upload]
    ```
  - Type selector: dropdown with Resume / Cover Letter / Application Info
  - File picker: standard `<input type="file">` accepting `.typ,.pdf`
  - Upload button: disabled while uploading; shows "Uploading…" during flight
  - On success: form resets; document list refreshes
  - On error: show error message inline (duplicate filename 409, size 413, etc.)

  *Typst not available banner (shown at top of Documents tab when `typstAvailable` is false):*
  ```
  ⚠  Typst not found — compilation disabled.
     Install: brew install typst  (macOS) · snap install typst  (Linux)
     Restart the server after installing.
  ```

  **How `typstAvailable` reaches the component:**
  - The health query is already called by Dashboard and likely cached by React Query
  - Add `useHealthStatus()` hook usage in ApplicationDetailPage (or pass from parent if
    already available in scope) — read `typst_available` from the health response

  **Do NOT modify any other tab's content or the right column (log panel).**

---

## Priority 11 — Settings: Document Storage Widget
*New card in the existing Settings page.*

- [ ] **11. Add Document Storage card to `frontend/src/pages/Settings.tsx`**

  **Files:** `frontend/src/pages/Settings.tsx`

  - Use `useDocumentsStorage()` hook (defined in Priority 9)
  - Add a new "Document Storage" card in the Settings page. Placement: after the
    existing "My Data" section (or wherever fits the existing page flow — do not
    restructure other sections)

  **Card content:**
  ```
  Document Storage
  ────────────────────────────────────
  Typst:    Available  (typst)
            — or —
            Not found — compile disabled
            Install: brew install typst  (macOS)
                     snap install typst  (Linux)

  Generated files:   14 files · 21.0 MB
                     ./generated
  ```
  - `Typst: Available` shown in green accent color when available
  - `Not found` shown in red/muted
  - File count and size from `useDocumentsStorage()`
  - If `total_bytes === 0` and `file_count === 0`: "No generated files yet."
  - Loading state: skeleton/spinner while query in flight
  - Do NOT add a "purge files" button in Phase 1.3

  **Do NOT modify any other Settings section.**

---

## Priority 12 — Backend Tests
*Tests alongside the routes.*

- [ ] **12. Backend tests for document routes**

  **Files:** `tests/routes/test_documents.py` (new)

  Test coverage required:

  **Upload (`POST /api/v1/applications/{id}/documents`):**
  - Happy path: `.typ` upload → record created, file written to disk, audit entry created
  - Happy path: `.pdf` upload → same
  - Invalid extension (`.docx`) → 422
  - Invalid `doc_type` → 422
  - File too large (`.typ` > 5MB) → 413
  - Duplicate filename → 409
  - Application not found → 404
  - Sanitization: filename with spaces and special chars → sanitized correctly

  **List (`GET /api/v1/applications/{id}/documents`):**
  - Returns correct records for application
  - Returns empty list when no documents
  - `file_exists` is `false` when file not on disk

  **Delete (`DELETE /api/v1/applications/{id}/documents/{doc_id}`):**
  - Happy path: record deleted, file deleted from disk, audit entry created
  - File not on disk: record still deleted, warning logged, no error raised
  - Wrong application_id for doc → 404
  - Doc not found → 404

  **Serve (`GET /api/v1/documents/file/{doc_id}`):**
  - `.pdf` served with `application/pdf` and `inline` disposition
  - `.typ` served with `text/plain` and `attachment` disposition
  - Path traversal attempt rejected with 403
  - File not on disk → 404

  **Compile (`POST /api/v1/applications/{id}/documents/{doc_id}/compile`):**
  - Happy path (mock `subprocess.run` success): PDF record created, old PDF replaced,
    audit entry created, returns new doc id
  - Typst not available (`app.state.typst_available = False`) → 503
  - Source doc is `.pdf` not `.typ` → 422
  - Compile failure (mock non-zero returncode): 400 with stderr detail, no PDF record created
  - Compile timeout (mock `TimeoutExpired`): 504
  - Application/doc mismatch → 404

  **Documents storage (`GET /api/v1/settings/documents-storage`):**
  - Returns correct size and file count for populated directory
  - Returns zeros when directory is empty or missing

---

## Priority 13 — Frontend Tests
*Tests alongside the component changes.*

- [ ] **13. Frontend tests for Document tab on ApplicationDetailPage**

  **Files:** `frontend/src/pages/ApplicationDetailPage.test.tsx`
  (add to existing file — do not create a new test file)

  Add MSW handlers in `test/mocks/handlers.ts` for:
  - `GET /api/v1/applications/{id}/documents` → fixture with one `.typ` and one `.pdf`
  - `POST /api/v1/applications/{id}/documents` → success response
  - `DELETE /api/v1/applications/{id}/documents/{doc_id}` → `{ success: true }`
  - `POST /api/v1/applications/{id}/documents/{doc_id}/compile` → success response
  - `GET /api/v1/settings/documents-storage` → fixture data

  Test coverage required:
  - Documents tab renders when clicked (4th tab visible)
  - Document list renders filenames and type labels from fixture
  - Compile button shown for `.typ` file, not for `.pdf`
  - Open PDF button shown for `.pdf` file, not for `.typ`
  - Compile button absent when `typst_available: false` in health fixture
  - "Typst not found" banner shown when `typst_available: false`
  - Delete button click shows confirmation inline; cancelling does not call API
  - Delete confirm calls DELETE route and list refreshes
  - Upload form renders type selector and file input
  - Empty state renders when document list is empty

---

## Out of Scope for Phase 1.3 (Do Not Build)
- AI-assisted resume content generation from `jobsearch.md` (Phase 2)
- In-app `.typ` editor or viewer
- Per-application file count or size limits
- Automatic disk cleanup / retention policies
- "Purge generated files" button in Settings
- Docker deployment (Phase 1.4)
- Resume chunk library / `resume_info` table activation (Phase 2)

---

## API Route Summary

| Method | Route | Description |
|---|---|---|
| POST | `/api/v1/applications/{id}/documents` | Upload document |
| GET | `/api/v1/applications/{id}/documents` | List documents |
| DELETE | `/api/v1/applications/{id}/documents/{doc_id}` | Delete document + file |
| POST | `/api/v1/applications/{id}/documents/{doc_id}/compile` | Compile .typ → .pdf |
| GET | `/api/v1/documents/file/{doc_id}` | Serve file (inline PDF / download .typ) |
| GET | `/api/v1/settings/documents-storage` | Disk usage + Typst status |

## Security Checklist (verify before closing each backend item)
- [ ] All file paths validated within `generated_dir` before any read/write/serve
- [ ] No SQL string interpolation — parameterized queries only
- [ ] File extension validated before compile (`['.typ']` only)
- [ ] Filename sanitized on upload: `[a-zA-Z0-9_-]` stem only, max 64 chars
- [ ] Application ownership verified on every doc operation (doc.application_id check)
- [ ] Subprocess timeout enforced (30s) on every compile call
- [ ] stderr captured and returned as user-readable message; not raised as unhandled exception
- [ ] No API keys or PII in log output
