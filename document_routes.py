"""
document_routes.py
──────────────────
Document management routes for AIstivus — Phase 1.6.
All routes registered under /api/v1/ prefix via app.include_router in main.py.
"""

import os
import re
import shutil
import subprocess
from pathlib import Path

import yaml
from fastapi import APIRouter, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

import database
from logger import get_logger

log = get_logger(__name__)

router = APIRouter()


# ─────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────

def _load_config() -> dict:
    config_path = Path("config.yaml")
    if config_path.exists():
        with open(config_path) as f:
            return yaml.safe_load(f) or {}
    return {}


# ─────────────────────────────────────────────────────────────
# Path / filename helpers (also imported by main.py)
# ─────────────────────────────────────────────────────────────

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
    """Sanitize one component of the final PDF filename.
    Lowercase, [a-zA-Z0-9_-] only, max 30 chars."""
    s = re.sub(r'[^a-zA-Z0-9_-]', '_', s.lower().strip())
    s = re.sub(r'_+', '_', s).strip('_')
    return s[:30]


def _get_candidate_name(jobsearch_path: str) -> str | None:
    """Extract the **Name:** field from Section 1 of jobsearch.md.
    Returns None if the file is missing, the field is absent, or still [FILL]."""
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


def _validate_within_generated(file_path: str, generated_dir: Path) -> Path:
    """Resolve path and verify it is within generated_dir. Raises 403 if not."""
    resolved = Path(file_path).resolve()
    if not str(resolved).startswith(str(generated_dir.resolve())):
        raise HTTPException(status_code=403, detail="Access denied.")
    return resolved


# ─────────────────────────────────────────────────────────────
# Request models
# ─────────────────────────────────────────────────────────────

class SaveContentRequest(BaseModel):
    content: str


class CopyTemplateRequest(BaseModel):
    template_filename: str
    category: str  # "resume" | "cover_letter"


class RenameDocumentRequest(BaseModel):
    new_name: str  # base name only, no extension


# ─────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────

_VALID_DOC_TYPES = frozenset({"resume", "cover_letter"})
_VALID_EXTENSIONS = frozenset({".typ", ".pdf"})
_MAX_TYP_BYTES = 5 * 1024 * 1024    # 5 MB
_MAX_PDF_BYTES = 20 * 1024 * 1024   # 20 MB


# ─────────────────────────────────────────────────────────────
# Upload
# ─────────────────────────────────────────────────────────────

@router.post("/applications/{application_id}/documents", status_code=201)
async def upload_document(
    request: Request,
    application_id: int,
    file: UploadFile = File(...),
    doc_type: str = Form(...),
):
    """Upload a .typ or .pdf document and associate it with an application."""
    app_row = database.get_application(application_id)
    if not app_row:
        raise HTTPException(status_code=404, detail=f"Application {application_id} not found.")

    if doc_type not in _VALID_DOC_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"doc_type must be one of: {', '.join(sorted(_VALID_DOC_TYPES))}",
        )

    _, ext = os.path.splitext(file.filename or "")
    ext = ext.lower()
    if ext not in _VALID_EXTENSIONS:
        raise HTTPException(status_code=422, detail="Only .typ and .pdf files are accepted.")

    content = await file.read()
    size_limit = _MAX_TYP_BYTES if ext == ".typ" else _MAX_PDF_BYTES
    if len(content) > size_limit:
        mb = size_limit // (1024 * 1024)
        raise HTTPException(
            status_code=413,
            detail=f"{ext} files must be {mb} MB or smaller.",
        )

    sanitized = _sanitize_filename(file.filename or "")
    if not sanitized:
        raise HTTPException(
            status_code=422,
            detail="Filename contains no valid characters after sanitization.",
        )

    generated_dir: Path = getattr(request.app.state, "generated_dir", Path("./generated"))
    app_dict = dict(app_row)
    job = database.get_job(app_dict["job_id"])
    company_name = dict(job)["company_name"] if job else "unknown"

    folder = _get_application_folder(generated_dir, application_id, company_name)
    folder.mkdir(parents=True, exist_ok=True)

    target_path = _unique_path(folder, sanitized)
    target_path.write_bytes(content)

    type_id = database.get_system_type_id("application_document", doc_type)
    if type_id is None:
        raise HTTPException(status_code=500, detail="system_types not seeded correctly.")

    doc_id = database.insert_application_document(application_id, type_id, str(target_path))
    database._audit_application(
        application_id, f"document_uploaded: {target_path.name} ({doc_type})"
    )
    log.info("document_uploaded", extra={"application_id": application_id, "doc_filename": target_path.name})

    doc = dict(database.get_document_by_id(doc_id))
    return JSONResponse({
        "id": doc["id"],
        "application_id": doc["application_id"],
        "type_value": doc["type_value"],
        "file_path": doc["file_path"],
        "filename": os.path.basename(doc["file_path"]),
        "is_final": doc.get("is_final", 0),
        "created_at": doc["created_at"],
    }, status_code=201)


# ─────────────────────────────────────────────────────────────
# List
# ─────────────────────────────────────────────────────────────

@router.get("/applications/{application_id}/documents")
async def list_documents(request: Request, application_id: int):
    """List all documents for an application with computed file metadata."""
    if not database.get_application(application_id):
        raise HTTPException(status_code=404, detail=f"Application {application_id} not found.")

    rows = database.get_application_documents(application_id)
    result = []
    for row in rows:
        d = dict(row)
        filename = os.path.basename(d["file_path"])
        _, ext = os.path.splitext(filename)
        d["filename"] = filename
        d["extension"] = ext.lower()
        d["file_exists"] = os.path.exists(d["file_path"])
        result.append(d)
    return JSONResponse(result)


# ─────────────────────────────────────────────────────────────
# Delete
# ─────────────────────────────────────────────────────────────

@router.delete("/applications/{application_id}/documents/{doc_id}")
async def delete_document(request: Request, application_id: int, doc_id: int):
    """Delete a document record and its file from disk."""
    doc = database.get_document_by_id(doc_id)
    if not doc or dict(doc)["application_id"] != application_id:
        raise HTTPException(status_code=404, detail=f"Document {doc_id} not found.")

    doc_dict = dict(doc)
    file_path = doc_dict["file_path"]
    filename = os.path.basename(file_path)
    type_value = doc_dict["type_value"]

    try:
        os.remove(file_path)
    except FileNotFoundError:
        log.warning("document_file_missing_on_delete", extra={"file_path": file_path})
    except OSError as e:
        log.warning("document_file_delete_error", extra={"file_path": file_path, "error": str(e)})

    database.delete_application_document(doc_id)
    database._audit_application(
        application_id, f"document_deleted: {filename} ({type_value})"
    )
    log.info("document_deleted", extra={"doc_id": doc_id, "doc_filename": filename})
    return JSONResponse({"success": True})


# ─────────────────────────────────────────────────────────────
# Rename
# ─────────────────────────────────────────────────────────────

_RENAME_PATTERN = re.compile(r'^[a-zA-Z0-9_-]{1,64}$')

@router.patch("/applications/{application_id}/documents/{document_id}/rename")
async def rename_document(
    request: Request,
    application_id: int,
    document_id: int,
    body: RenameDocumentRequest,
):
    """Rename a document file. new_name is the base filename without extension."""
    doc = database.get_document_by_id(document_id)
    if not doc or dict(doc)["application_id"] != application_id:
        raise HTTPException(status_code=404, detail=f"Document {document_id} not found.")

    new_name = body.new_name.strip()
    if not _RENAME_PATTERN.match(new_name):
        raise HTTPException(
            status_code=422,
            detail="Name must be 1–64 characters: letters, digits, underscores, hyphens only.",
        )

    doc_dict = dict(doc)
    old_path = Path(doc_dict["file_path"])
    ext = old_path.suffix  # preserves original extension (.typ or .pdf)
    new_filename = new_name + ext
    new_path = old_path.parent / new_filename

    generated_dir: Path = getattr(request.app.state, "generated_dir", Path("./generated"))
    _validate_within_generated(str(new_path), generated_dir)

    if new_path.exists() and new_path != old_path:
        raise HTTPException(status_code=409, detail=f"A file named '{new_filename}' already exists.")

    if new_path != old_path:
        try:
            old_path.rename(new_path)
        except OSError as e:
            raise HTTPException(status_code=500, detail=f"File rename failed: {e}") from e

    database.rename_application_document(document_id, str(new_path))
    database._audit_application(
        application_id, f"document_renamed: {old_path.name} → {new_filename}"
    )
    log.info("document_renamed", extra={"doc_id": document_id, "old": old_path.name, "new": new_filename})

    updated = dict(database.get_document_by_id(document_id))
    return JSONResponse({
        "id": updated["id"],
        "application_id": updated["application_id"],
        "type_value": updated["type_value"],
        "file_path": updated["file_path"],
        "filename": os.path.basename(updated["file_path"]),
        "is_final": updated.get("is_final", 0),
        "created_at": updated["created_at"],
    })


# ─────────────────────────────────────────────────────────────
# Serve file
# ─────────────────────────────────────────────────────────────

@router.get("/documents/file/{doc_id}")
async def serve_document(
    request: Request,
    doc_id: int,
    download: bool = Query(False),
):
    """Serve a document file. Default: inline (open in browser). ?download=true: attachment."""
    doc = database.get_document_by_id(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document {doc_id} not found.")

    doc_dict = dict(doc)
    generated_dir: Path = getattr(request.app.state, "generated_dir", Path("./generated"))
    resolved = _validate_within_generated(doc_dict["file_path"], generated_dir)

    if not resolved.exists():
        raise HTTPException(status_code=404, detail="File not found on disk.")

    filename = resolved.name
    _, ext = os.path.splitext(filename)
    ext = ext.lower()

    if ext == ".pdf":
        media_type = "application/pdf"
        disposition = "attachment" if download else "inline"
    else:
        media_type = "text/plain"
        disposition = "attachment"

    return FileResponse(
        str(resolved),
        media_type=media_type,
        filename=filename,
        content_disposition_type=disposition,
    )


# ─────────────────────────────────────────────────────────────
# Get .typ content
# ─────────────────────────────────────────────────────────────

@router.get("/applications/{application_id}/documents/{doc_id}/content")
async def get_document_content(request: Request, application_id: int, doc_id: int):
    """Return the text content of a .typ file."""
    doc = database.get_document_by_id(doc_id)
    if not doc or dict(doc)["application_id"] != application_id:
        raise HTTPException(status_code=404, detail=f"Document {doc_id} not found.")

    doc_dict = dict(doc)
    _, ext = os.path.splitext(doc_dict["file_path"])
    if ext.lower() != ".typ":
        raise HTTPException(
            status_code=422, detail="Content endpoint is for .typ files only."
        )

    generated_dir: Path = getattr(request.app.state, "generated_dir", Path("./generated"))
    resolved = _validate_within_generated(doc_dict["file_path"], generated_dir)

    if not resolved.exists():
        raise HTTPException(status_code=404, detail="File not found on disk.")

    content = resolved.read_text(encoding="utf-8")
    return JSONResponse({"content": content, "filename": resolved.name})


# ─────────────────────────────────────────────────────────────
# Save .typ content
# ─────────────────────────────────────────────────────────────

@router.put("/applications/{application_id}/documents/{doc_id}/content")
async def save_document_content(
    request: Request,
    application_id: int,
    doc_id: int,
    body: SaveContentRequest,
):
    """Overwrite a .typ file with new content."""
    doc = database.get_document_by_id(doc_id)
    if not doc or dict(doc)["application_id"] != application_id:
        raise HTTPException(status_code=404, detail=f"Document {doc_id} not found.")

    doc_dict = dict(doc)
    _, ext = os.path.splitext(doc_dict["file_path"])
    if ext.lower() != ".typ":
        raise HTTPException(
            status_code=422, detail="Content endpoint is for .typ files only."
        )

    if not body.content:
        raise HTTPException(status_code=422, detail="content must not be empty.")

    if "\x00" in body.content:
        raise HTTPException(status_code=422, detail="content must not contain null bytes.")

    if len(body.content.encode("utf-8")) > _MAX_TYP_BYTES:
        raise HTTPException(status_code=413, detail=".typ content must be 5 MB or smaller.")

    generated_dir: Path = getattr(request.app.state, "generated_dir", Path("./generated"))
    resolved = _validate_within_generated(doc_dict["file_path"], generated_dir)

    resolved.write_text(body.content, encoding="utf-8")
    database._audit_application(application_id, f"document_edited: {resolved.name}")
    log.info("document_edited", extra={"doc_id": doc_id, "doc_filename": resolved.name})
    return JSONResponse({"success": True})


# ─────────────────────────────────────────────────────────────
# List templates
# ─────────────────────────────────────────────────────────────

@router.get("/templates/typst")
async def list_typst_templates(request: Request):
    """List available Typst templates grouped by category."""
    templates_base = Path("templates/typst")
    category_dirs = {
        "resume": templates_base / "resume",
        "cover_letter": templates_base / "cover-letter",
    }

    result: dict[str, list] = {"resume": [], "cover_letter": []}

    for category, dir_path in category_dirs.items():
        if not dir_path.exists():
            continue
        for f in sorted(dir_path.iterdir()):
            if f.is_file() and f.suffix == ".typ":
                display = re.sub(r'[-_]', ' ', f.stem).title()
                result[category].append({
                    "filename": f.name,
                    "display_name": display,
                    "category": category,
                })

    return JSONResponse(result)


# ─────────────────────────────────────────────────────────────
# Copy from template
# ─────────────────────────────────────────────────────────────

@router.post("/applications/{application_id}/documents/from-template", status_code=201)
async def copy_template(
    request: Request,
    application_id: int,
    body: CopyTemplateRequest,
):
    """Copy a bundled Typst template into an application folder."""
    app_row = database.get_application(application_id)
    if not app_row:
        raise HTTPException(status_code=404, detail=f"Application {application_id} not found.")

    if body.category not in _VALID_DOC_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"category must be one of: {', '.join(sorted(_VALID_DOC_TYPES))}",
        )

    if "/" in body.template_filename or "\\" in body.template_filename:
        raise HTTPException(status_code=422, detail="Invalid template filename.")

    category_dir = "resume" if body.category == "resume" else "cover-letter"
    template_path = Path("templates/typst") / category_dir / body.template_filename

    # Validate template is within templates/typst/
    templates_root = Path("templates/typst").resolve()
    if not str(template_path.resolve()).startswith(str(templates_root)):
        raise HTTPException(status_code=403, detail="Access denied.")

    if not template_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Template '{body.template_filename}' not found.",
        )

    generated_dir: Path = getattr(request.app.state, "generated_dir", Path("./generated"))
    app_dict = dict(app_row)
    job = database.get_job(app_dict["job_id"])
    company_name = dict(job)["company_name"] if job else "unknown"

    folder = _get_application_folder(generated_dir, application_id, company_name)
    folder.mkdir(parents=True, exist_ok=True)

    default_name = (
        "resume_draft.typ" if body.category == "resume" else "cover_letter_draft.typ"
    )
    dest_path = _unique_path(folder, default_name)
    shutil.copy2(str(template_path), str(dest_path))

    type_id = database.get_system_type_id("application_document", body.category)
    if type_id is None:
        raise HTTPException(status_code=500, detail="system_types not seeded correctly.")

    doc_id = database.insert_application_document(application_id, type_id, str(dest_path))
    database._audit_application(
        application_id,
        f"document_from_template: {body.template_filename} → {dest_path.name}",
    )
    log.info(
        "template_copied",
        extra={
            "application_id": application_id,
            "template": body.template_filename,
            "dest": dest_path.name,
        },
    )

    doc = dict(database.get_document_by_id(doc_id))
    return JSONResponse({
        "id": doc["id"],
        "application_id": doc["application_id"],
        "type_value": doc["type_value"],
        "file_path": doc["file_path"],
        "filename": os.path.basename(doc["file_path"]),
        "is_final": doc.get("is_final", 0),
        "created_at": doc["created_at"],
    }, status_code=201)


# ─────────────────────────────────────────────────────────────
# Compile .typ → DRAFT .pdf  (Priority 5)
# ─────────────────────────────────────────────────────────────

@router.post("/applications/{application_id}/documents/{doc_id}/compile")
async def compile_document(request: Request, application_id: int, doc_id: int):
    """Compile a .typ file to DRAFT_{base}.pdf via the Typst binary."""
    if not getattr(request.app.state, "typst_available", False):
        raise HTTPException(
            status_code=503,
            detail="Typst binary not found. Install Typst to enable compilation.",
        )

    doc = database.get_document_by_id(doc_id)
    if not doc or dict(doc)["application_id"] != application_id:
        raise HTTPException(status_code=404, detail=f"Document {doc_id} not found.")

    doc_dict = dict(doc)
    _, ext = os.path.splitext(doc_dict["file_path"])
    if ext.lower() != ".typ":
        raise HTTPException(
            status_code=422, detail="Only .typ files can be compiled."
        )

    generated_dir: Path = getattr(request.app.state, "generated_dir", Path("./generated"))
    source_path = _validate_within_generated(doc_dict["file_path"], generated_dir)

    if not source_path.exists():
        raise HTTPException(status_code=404, detail="Source .typ file not found on disk.")

    pdf_name = f"DRAFT_{source_path.stem}.pdf"
    pdf_path = source_path.parent / pdf_name

    # Replace existing DRAFT PDF record + file if present
    existing = database.get_document_by_file_path(application_id, str(pdf_path))
    if existing:
        try:
            os.remove(str(pdf_path))
        except FileNotFoundError:
            pass
        database.delete_application_document(dict(existing)["id"])

    typst_binary: str = getattr(request.app.state, "typst_binary", "typst")
    try:
        result = subprocess.run(
            [typst_binary, "compile", str(source_path), str(pdf_path)],
            capture_output=True,
            text=True,
            timeout=30,
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(
            status_code=504, detail="Compilation timed out after 30 seconds."
        )

    if result.returncode != 0:
        return JSONResponse(
            {
                "success": False,
                "error": "Compilation failed",
                "detail": result.stderr,
            },
            status_code=400,
        )

    new_id = database.insert_application_document(
        application_id, doc_dict["type_id"], str(pdf_path)
    )
    database._audit_application(
        application_id, f"document_compiled: {pdf_name} from {source_path.name}"
    )
    log.info(
        "document_compiled",
        extra={"application_id": application_id, "pdf": pdf_name},
    )

    return JSONResponse({
        "success": True,
        "pdf_doc_id": new_id,
        "filename": pdf_name,
        "file_path": str(pdf_path),
    })


# ─────────────────────────────────────────────────────────────
# Finalize DRAFT → named PDF  (Priority 5)
# ─────────────────────────────────────────────────────────────

@router.post("/applications/{application_id}/documents/{doc_id}/finalize")
async def finalize_document(request: Request, application_id: int, doc_id: int):
    """Copy a DRAFT PDF to a structured final filename and mark it as final."""
    doc = database.get_document_by_id(doc_id)
    if not doc or dict(doc)["application_id"] != application_id:
        raise HTTPException(status_code=404, detail=f"Document {doc_id} not found.")

    doc_dict = dict(doc)
    _, ext = os.path.splitext(doc_dict["file_path"])
    if ext.lower() != ".pdf":
        raise HTTPException(
            status_code=422, detail="Only compiled PDF files can be finalized."
        )

    filename = os.path.basename(doc_dict["file_path"])
    if not filename.startswith("DRAFT_"):
        raise HTTPException(
            status_code=422,
            detail="Only DRAFT files can be finalized. Compile a .typ file first.",
        )

    generated_dir: Path = getattr(request.app.state, "generated_dir", Path("./generated"))
    source_path = _validate_within_generated(doc_dict["file_path"], generated_dir)

    if not source_path.exists():
        raise HTTPException(status_code=404, detail="DRAFT file not found on disk.")

    # Build the final filename
    application = database.get_application(application_id)
    job = database.get_job(dict(application)["job_id"])
    job_dict = dict(job)
    company = _sanitize_for_final_filename(job_dict["company_name"])
    title = _sanitize_for_final_filename(job_dict["title"])

    cfg = _load_config()
    jobsearch_path = cfg.get("evaluation", {}).get("jobsearch_md_path", "./jobsearch.md")
    raw_name = _get_candidate_name(jobsearch_path)
    if raw_name:
        name = _sanitize_for_final_filename(raw_name)
        final_name = f"{name}_{company}_{title}.pdf"
    else:
        log.warning(
            "candidate_name_not_found",
            extra={"fallback": f"{company}_{title}.pdf"},
        )
        final_name = f"{company}_{title}.pdf"

    final_path = _unique_path(source_path.parent, final_name)
    shutil.copy2(str(source_path), str(final_path))

    new_id = database.insert_application_document(
        application_id, doc_dict["type_id"], str(final_path)
    )
    database.set_document_final(new_id, application_id, doc_dict["type_id"])
    database._audit_application(
        application_id,
        f"document_finalized: {final_path.name} (from {source_path.name})",
    )
    log.info(
        "document_finalized",
        extra={"application_id": application_id, "final": final_path.name},
    )

    return JSONResponse({
        "success": True,
        "final_doc_id": new_id,
        "filename": final_path.name,
        "file_path": str(final_path),
    })
