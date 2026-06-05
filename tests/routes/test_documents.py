"""
tests/routes/test_documents.py
Integration tests for document management routes.

Routes covered:
  POST   /api/v1/applications/{id}/documents
  GET    /api/v1/applications/{id}/documents
  DELETE /api/v1/applications/{id}/documents/{doc_id}
  PATCH  /api/v1/applications/{id}/documents/{doc_id}/rename
  GET    /api/v1/documents/file/{doc_id}
  GET    /api/v1/applications/{id}/documents/{doc_id}/content
  PUT    /api/v1/applications/{id}/documents/{doc_id}/content
  POST   /api/v1/applications/{id}/documents/{doc_id}/compile
  POST   /api/v1/applications/{id}/documents/{doc_id}/finalize
  POST   /api/v1/applications/{id}/documents/from-template
  GET    /api/v1/templates/typst
  GET    /api/v1/settings/documents-storage
"""

import subprocess
from pathlib import Path
from unittest.mock import MagicMock

import pytest
import database


# ─────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────

@pytest.fixture
def doc_client(seeded_client, tmp_path):
    """seeded_client with app.state pointing to a fresh temp generated_dir."""
    from main import app
    generated_dir = tmp_path / "generated"
    generated_dir.mkdir()
    orig_generated_dir = getattr(app.state, "generated_dir", None)
    orig_typst_available = getattr(app.state, "typst_available", False)
    orig_typst_binary = getattr(app.state, "typst_binary", "typst")
    app.state.generated_dir = generated_dir
    app.state.typst_available = True
    app.state.typst_binary = "typst"
    yield {**seeded_client, "generated_dir": generated_dir}
    app.state.generated_dir = orig_generated_dir
    app.state.typst_available = orig_typst_available
    app.state.typst_binary = orig_typst_binary


@pytest.fixture
def jobsearch_with_name(tmp_path, monkeypatch):
    """Create a jobsearch.md with **Name:** set; patch document_routes to use it."""
    import document_routes
    path = tmp_path / "jobsearch.md"
    path.write_text("# Job Search Profile\n\n**Name:** Jane Doe\n")
    monkeypatch.setattr(
        document_routes,
        "_load_config",
        lambda: {"evaluation": {"jobsearch_md_path": str(path)}},
    )
    return path


@pytest.fixture
def template_dirs(tmp_path, monkeypatch):
    """Change CWD to tmp_path and create a minimal template directory structure."""
    resume_dir = tmp_path / "templates" / "typst" / "resume"
    cover_dir = tmp_path / "templates" / "typst" / "cover-letter"
    resume_dir.mkdir(parents=True)
    cover_dir.mkdir(parents=True)
    (resume_dir / "modern-cv.typ").write_text("#resume template")
    (cover_dir / "basic-cover.typ").write_text("#cover letter template")
    monkeypatch.chdir(tmp_path)
    return {"resume_dir": resume_dir, "cover_dir": cover_dir}


# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────

def _upload(client, app_id, filename, content, doc_type="resume", content_type="text/plain"):
    return client.post(
        f"/api/v1/applications/{app_id}/documents",
        files={"file": (filename, content, content_type)},
        data={"doc_type": doc_type},
    )


def _insert_draft_pdf(app_id: int, folder: Path, name: str = "DRAFT_resume.pdf") -> tuple[int, Path]:
    """Write a stub DRAFT pdf file and insert a DB record. Returns (doc_id, path)."""
    path = folder / name
    path.write_bytes(b"%PDF-1.4 stub")
    type_id = database.get_system_type_id("application_document", "resume")
    doc_id = database.insert_application_document(app_id, type_id, str(path))
    return doc_id, path


def _make_app_folder(doc_client, name: str = "DRAFT_resume.pdf") -> tuple[int, Path]:
    """Create the application folder and a DRAFT pdf inside it. Returns (doc_id, path)."""
    app_id = doc_client["app_id"]
    generated_dir = doc_client["generated_dir"]
    job = database.get_job(doc_client["job_id"])
    from document_routes import _get_application_folder
    folder = _get_application_folder(generated_dir, app_id, dict(job)["company_name"])
    folder.mkdir(parents=True, exist_ok=True)
    return _insert_draft_pdf(app_id, folder, name)


# ─────────────────────────────────────────────────────────────
# POST /api/v1/applications/{id}/documents — Upload
# ─────────────────────────────────────────────────────────────

class TestUploadDocument:
    def test_upload_typ_happy_path(self, doc_client):
        c, app_id = doc_client["client"], doc_client["app_id"]
        resp = _upload(c, app_id, "resume.typ", b"#hello world")
        assert resp.status_code == 201
        data = resp.json()
        assert data["application_id"] == app_id
        assert data["type_value"] == "resume"
        assert data["filename"] == "resume.typ"
        assert data["is_final"] == 0
        assert Path(data["file_path"]).exists()

    def test_upload_pdf_happy_path(self, doc_client):
        c, app_id = doc_client["client"], doc_client["app_id"]
        resp = _upload(c, app_id, "portfolio.pdf", b"%PDF-1.4 stub", content_type="application/pdf")
        assert resp.status_code == 201
        assert resp.json()["filename"] == "portfolio.pdf"

    def test_invalid_extension_returns_422(self, doc_client):
        c, app_id = doc_client["client"], doc_client["app_id"]
        resp = _upload(c, app_id, "resume.docx", b"content")
        assert resp.status_code == 422

    def test_invalid_doc_type_returns_422(self, doc_client):
        c, app_id = doc_client["client"], doc_client["app_id"]
        resp = _upload(c, app_id, "resume.typ", b"content", doc_type="application_info")
        assert resp.status_code == 422

    def test_typ_over_5mb_returns_413(self, doc_client):
        c, app_id = doc_client["client"], doc_client["app_id"]
        resp = _upload(c, app_id, "big.typ", b"x" * (5 * 1024 * 1024 + 1))
        assert resp.status_code == 413

    def test_pdf_over_20mb_returns_413(self, doc_client):
        c, app_id = doc_client["client"], doc_client["app_id"]
        resp = _upload(
            c, app_id, "big.pdf", b"x" * (20 * 1024 * 1024 + 1), content_type="application/pdf"
        )
        assert resp.status_code == 413

    def test_app_not_found_returns_404(self, doc_client):
        resp = _upload(doc_client["client"], 9999, "resume.typ", b"content")
        assert resp.status_code == 404

    def test_filename_with_spaces_and_special_chars_sanitized(self, doc_client):
        c, app_id = doc_client["client"], doc_client["app_id"]
        resp = _upload(c, app_id, "My Resume (Final).typ", b"content")
        assert resp.status_code == 201
        filename = resp.json()["filename"]
        stem = Path(filename).stem
        assert " " not in filename
        assert all(ch.isalnum() or ch in "_-" for ch in stem)

    def test_duplicate_filename_silently_renamed_to_2(self, doc_client):
        c, app_id = doc_client["client"], doc_client["app_id"]
        _upload(c, app_id, "resume.typ", b"v1")
        resp = _upload(c, app_id, "resume.typ", b"v2")
        assert resp.status_code == 201
        assert resp.json()["filename"] == "resume_2.typ"

    def test_third_duplicate_renamed_to_3(self, doc_client):
        c, app_id = doc_client["client"], doc_client["app_id"]
        _upload(c, app_id, "resume.typ", b"v1")
        _upload(c, app_id, "resume.typ", b"v2")
        resp = _upload(c, app_id, "resume.typ", b"v3")
        assert resp.status_code == 201
        assert resp.json()["filename"] == "resume_3.typ"

    def test_upload_creates_audit_entry(self, doc_client):
        c, app_id = doc_client["client"], doc_client["app_id"]
        _upload(c, app_id, "resume.typ", b"content")
        audits = database.get_application_audit(app_id)
        assert any("document_uploaded" in a["event"] for a in audits)


# ─────────────────────────────────────────────────────────────
# GET /api/v1/applications/{id}/documents — List
# ─────────────────────────────────────────────────────────────

class TestListDocuments:
    def test_returns_empty_list_when_no_documents(self, doc_client):
        resp = doc_client["client"].get(f"/api/v1/applications/{doc_client['app_id']}/documents")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_returns_expected_fields(self, doc_client):
        c, app_id = doc_client["client"], doc_client["app_id"]
        _upload(c, app_id, "resume.typ", b"content")
        resp = c.get(f"/api/v1/applications/{app_id}/documents")
        assert resp.status_code == 200
        docs = resp.json()
        assert len(docs) == 1
        d = docs[0]
        assert d["type_value"] == "resume"
        assert d["filename"] == "resume.typ"
        assert d["extension"] == ".typ"
        assert d["file_exists"] is True
        assert d["is_final"] == 0

    def test_file_exists_false_when_file_missing_on_disk(self, doc_client):
        c, app_id = doc_client["client"], doc_client["app_id"]
        upload = _upload(c, app_id, "resume.typ", b"content").json()
        Path(upload["file_path"]).unlink()
        resp = c.get(f"/api/v1/applications/{app_id}/documents")
        assert resp.json()[0]["file_exists"] is False

    def test_app_not_found_returns_404(self, doc_client):
        resp = doc_client["client"].get("/api/v1/applications/9999/documents")
        assert resp.status_code == 404


# ─────────────────────────────────────────────────────────────
# DELETE /api/v1/applications/{id}/documents/{doc_id}
# ─────────────────────────────────────────────────────────────

class TestDeleteDocument:
    def test_happy_path_deletes_record_and_file(self, doc_client):
        c, app_id = doc_client["client"], doc_client["app_id"]
        upload = _upload(c, app_id, "resume.typ", b"content").json()
        resp = c.delete(f"/api/v1/applications/{app_id}/documents/{upload['id']}")
        assert resp.status_code == 200
        assert resp.json()["success"] is True
        assert not Path(upload["file_path"]).exists()
        assert database.get_document_by_id(upload["id"]) is None

    def test_file_missing_on_disk_still_deletes_record(self, doc_client):
        c, app_id = doc_client["client"], doc_client["app_id"]
        upload = _upload(c, app_id, "resume.typ", b"content").json()
        Path(upload["file_path"]).unlink()
        resp = c.delete(f"/api/v1/applications/{app_id}/documents/{upload['id']}")
        assert resp.status_code == 200
        assert database.get_document_by_id(upload["id"]) is None

    def test_wrong_app_id_returns_404(self, doc_client):
        c, app_id = doc_client["client"], doc_client["app_id"]
        upload = _upload(c, app_id, "resume.typ", b"content").json()
        resp = c.delete(f"/api/v1/applications/9999/documents/{upload['id']}")
        assert resp.status_code == 404

    def test_doc_not_found_returns_404(self, doc_client):
        resp = doc_client["client"].delete(
            f"/api/v1/applications/{doc_client['app_id']}/documents/9999"
        )
        assert resp.status_code == 404

    def test_delete_creates_audit_entry(self, doc_client):
        c, app_id = doc_client["client"], doc_client["app_id"]
        upload = _upload(c, app_id, "resume.typ", b"content").json()
        c.delete(f"/api/v1/applications/{app_id}/documents/{upload['id']}")
        audits = database.get_application_audit(app_id)
        assert any("document_deleted" in a["event"] for a in audits)


# ─────────────────────────────────────────────────────────────
# GET /api/v1/documents/file/{doc_id} — Serve
# ─────────────────────────────────────────────────────────────

class TestServeDocument:
    def test_pdf_served_inline_by_default(self, doc_client):
        c, app_id = doc_client["client"], doc_client["app_id"]
        upload = _upload(
            c, app_id, "portfolio.pdf", b"%PDF-1.4 stub", content_type="application/pdf"
        ).json()
        resp = c.get(f"/api/v1/documents/file/{upload['id']}")
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/pdf"
        assert "inline" in resp.headers.get("content-disposition", "")

    def test_pdf_served_as_attachment_with_download_param(self, doc_client):
        c, app_id = doc_client["client"], doc_client["app_id"]
        upload = _upload(
            c, app_id, "portfolio.pdf", b"%PDF-1.4 stub", content_type="application/pdf"
        ).json()
        resp = c.get(f"/api/v1/documents/file/{upload['id']}?download=true")
        assert resp.status_code == 200
        assert "attachment" in resp.headers.get("content-disposition", "")

    def test_typ_served_as_text_attachment(self, doc_client):
        c, app_id = doc_client["client"], doc_client["app_id"]
        upload = _upload(c, app_id, "resume.typ", b"#hello").json()
        resp = c.get(f"/api/v1/documents/file/{upload['id']}")
        assert resp.status_code == 200
        assert "text/plain" in resp.headers["content-type"]
        assert "attachment" in resp.headers.get("content-disposition", "")

    def test_path_traversal_returns_403(self, doc_client):
        app_id = doc_client["app_id"]
        type_id = database.get_system_type_id("application_document", "resume")
        doc_id = database.insert_application_document(app_id, type_id, "/etc/passwd")
        resp = doc_client["client"].get(f"/api/v1/documents/file/{doc_id}")
        assert resp.status_code == 403

    def test_file_not_on_disk_returns_404(self, doc_client):
        c, app_id = doc_client["client"], doc_client["app_id"]
        upload = _upload(c, app_id, "resume.typ", b"content").json()
        Path(upload["file_path"]).unlink()
        resp = c.get(f"/api/v1/documents/file/{upload['id']}")
        assert resp.status_code == 404


# ─────────────────────────────────────────────────────────────
# GET/PUT content — .typ inline editor
# ─────────────────────────────────────────────────────────────

class TestDocumentContent:
    def test_get_typ_content(self, doc_client):
        c, app_id = doc_client["client"], doc_client["app_id"]
        upload = _upload(c, app_id, "resume.typ", b"#hello world").json()
        resp = c.get(f"/api/v1/applications/{app_id}/documents/{upload['id']}/content")
        assert resp.status_code == 200
        data = resp.json()
        assert data["content"] == "#hello world"
        assert data["filename"] == "resume.typ"

    def test_get_pdf_returns_422(self, doc_client):
        c, app_id = doc_client["client"], doc_client["app_id"]
        upload = _upload(
            c, app_id, "portfolio.pdf", b"%PDF-1.4", content_type="application/pdf"
        ).json()
        resp = c.get(f"/api/v1/applications/{app_id}/documents/{upload['id']}/content")
        assert resp.status_code == 422

    def test_put_saves_content(self, doc_client):
        c, app_id = doc_client["client"], doc_client["app_id"]
        upload = _upload(c, app_id, "resume.typ", b"#original").json()
        resp = c.put(
            f"/api/v1/applications/{app_id}/documents/{upload['id']}/content",
            json={"content": "#updated content"},
        )
        assert resp.status_code == 200
        assert resp.json()["success"] is True
        assert Path(upload["file_path"]).read_text() == "#updated content"

    def test_put_creates_audit_entry(self, doc_client):
        c, app_id = doc_client["client"], doc_client["app_id"]
        upload = _upload(c, app_id, "resume.typ", b"#original").json()
        c.put(
            f"/api/v1/applications/{app_id}/documents/{upload['id']}/content",
            json={"content": "#updated"},
        )
        audits = database.get_application_audit(app_id)
        assert any("document_edited" in a["event"] for a in audits)

    def test_put_empty_content_returns_422(self, doc_client):
        c, app_id = doc_client["client"], doc_client["app_id"]
        upload = _upload(c, app_id, "resume.typ", b"#hello").json()
        resp = c.put(
            f"/api/v1/applications/{app_id}/documents/{upload['id']}/content",
            json={"content": ""},
        )
        assert resp.status_code == 422

    def test_put_null_byte_returns_422(self, doc_client):
        c, app_id = doc_client["client"], doc_client["app_id"]
        upload = _upload(c, app_id, "resume.typ", b"#hello").json()
        resp = c.put(
            f"/api/v1/applications/{app_id}/documents/{upload['id']}/content",
            json={"content": "valid\x00content"},
        )
        assert resp.status_code == 422

    def test_put_over_5mb_returns_413(self, doc_client):
        c, app_id = doc_client["client"], doc_client["app_id"]
        upload = _upload(c, app_id, "resume.typ", b"#hello").json()
        resp = c.put(
            f"/api/v1/applications/{app_id}/documents/{upload['id']}/content",
            json={"content": "x" * (5 * 1024 * 1024 + 1)},
        )
        assert resp.status_code == 413


# ─────────────────────────────────────────────────────────────
# POST /api/v1/applications/{id}/documents/{doc_id}/compile
# ─────────────────────────────────────────────────────────────

class TestCompileDocument:
    def _mock_success(self, monkeypatch):
        import document_routes
        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stderr = ""

        def fake_run(cmd, **kwargs):
            Path(cmd[3]).write_bytes(b"%PDF-1.4 stub")
            return mock_result

        monkeypatch.setattr(document_routes.subprocess, "run", fake_run)

    def test_compile_success(self, doc_client, monkeypatch):
        self._mock_success(monkeypatch)
        c, app_id = doc_client["client"], doc_client["app_id"]
        upload = _upload(c, app_id, "resume.typ", b"#hello").json()
        resp = c.post(f"/api/v1/applications/{app_id}/documents/{upload['id']}/compile")
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["filename"].startswith("DRAFT_")
        assert data["pdf_doc_id"] is not None

    def test_compile_creates_audit_entry(self, doc_client, monkeypatch):
        self._mock_success(monkeypatch)
        c, app_id = doc_client["client"], doc_client["app_id"]
        upload = _upload(c, app_id, "resume.typ", b"#hello").json()
        c.post(f"/api/v1/applications/{app_id}/documents/{upload['id']}/compile")
        audits = database.get_application_audit(app_id)
        assert any("document_compiled" in a["event"] for a in audits)

    def test_typst_unavailable_returns_503(self, doc_client, monkeypatch):
        from main import app
        monkeypatch.setattr(app.state, "typst_available", False)
        c, app_id = doc_client["client"], doc_client["app_id"]
        upload = _upload(c, app_id, "resume.typ", b"#hello").json()
        resp = c.post(f"/api/v1/applications/{app_id}/documents/{upload['id']}/compile")
        assert resp.status_code == 503

    def test_compile_pdf_source_returns_422(self, doc_client):
        c, app_id = doc_client["client"], doc_client["app_id"]
        upload = _upload(
            c, app_id, "portfolio.pdf", b"%PDF-1.4", content_type="application/pdf"
        ).json()
        resp = c.post(f"/api/v1/applications/{app_id}/documents/{upload['id']}/compile")
        assert resp.status_code == 422

    def test_compile_failure_returns_400_with_stderr(self, doc_client, monkeypatch):
        import document_routes
        mock_result = MagicMock()
        mock_result.returncode = 1
        mock_result.stderr = "error: unknown variable `foo`"
        monkeypatch.setattr(document_routes.subprocess, "run", lambda *a, **kw: mock_result)

        c, app_id = doc_client["client"], doc_client["app_id"]
        upload = _upload(c, app_id, "resume.typ", b"#hello").json()
        resp = c.post(f"/api/v1/applications/{app_id}/documents/{upload['id']}/compile")
        assert resp.status_code == 400
        data = resp.json()
        assert data["success"] is False
        assert "unknown variable" in data["detail"]

    def test_compile_timeout_returns_504(self, doc_client, monkeypatch):
        import document_routes

        def raise_timeout(*a, **kw):
            raise subprocess.TimeoutExpired(cmd=["typst"], timeout=30)

        monkeypatch.setattr(document_routes.subprocess, "run", raise_timeout)
        c, app_id = doc_client["client"], doc_client["app_id"]
        upload = _upload(c, app_id, "resume.typ", b"#hello").json()
        resp = c.post(f"/api/v1/applications/{app_id}/documents/{upload['id']}/compile")
        assert resp.status_code == 504

    def test_doc_app_mismatch_returns_404(self, doc_client):
        c, app_id = doc_client["client"], doc_client["app_id"]
        upload = _upload(c, app_id, "resume.typ", b"#hello").json()
        resp = c.post(f"/api/v1/applications/9999/documents/{upload['id']}/compile")
        assert resp.status_code == 404

    def test_recompile_replaces_existing_draft(self, doc_client, monkeypatch):
        self._mock_success(monkeypatch)
        c, app_id = doc_client["client"], doc_client["app_id"]
        upload = _upload(c, app_id, "resume.typ", b"#hello").json()

        resp1 = c.post(f"/api/v1/applications/{app_id}/documents/{upload['id']}/compile")
        draft_id_1 = resp1.json()["pdf_doc_id"]

        resp2 = c.post(f"/api/v1/applications/{app_id}/documents/{upload['id']}/compile")
        draft_id_2 = resp2.json()["pdf_doc_id"]

        assert database.get_document_by_id(draft_id_1) is None
        assert draft_id_2 != draft_id_1


# ─────────────────────────────────────────────────────────────
# POST /api/v1/applications/{id}/documents/{doc_id}/finalize
# ─────────────────────────────────────────────────────────────

class TestFinalizeDocument:
    def test_finalize_happy_path(self, doc_client, jobsearch_with_name):
        c, app_id = doc_client["client"], doc_client["app_id"]
        doc_id, _ = _make_app_folder(doc_client)
        resp = c.post(f"/api/v1/applications/{app_id}/documents/{doc_id}/finalize")
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert "jane_doe" in data["filename"]
        assert data["filename"].endswith(".pdf")
        assert not data["filename"].startswith("DRAFT_")
        assert Path(data["file_path"]).exists()

    def test_finalize_sets_is_final_flag(self, doc_client, jobsearch_with_name):
        c, app_id = doc_client["client"], doc_client["app_id"]
        doc_id, _ = _make_app_folder(doc_client)
        resp = c.post(f"/api/v1/applications/{app_id}/documents/{doc_id}/finalize")
        final_id = resp.json()["final_doc_id"]
        assert dict(database.get_document_by_id(final_id))["is_final"] == 1

    def test_finalize_clears_prior_final_of_same_type(self, doc_client, jobsearch_with_name):
        c, app_id = doc_client["client"], doc_client["app_id"]
        doc_id_1, _ = _make_app_folder(doc_client, "DRAFT_resume_v1.pdf")
        resp1 = c.post(f"/api/v1/applications/{app_id}/documents/{doc_id_1}/finalize")
        final_id_1 = resp1.json()["final_doc_id"]

        doc_id_2, _ = _make_app_folder(doc_client, "DRAFT_resume_v2.pdf")
        resp2 = c.post(f"/api/v1/applications/{app_id}/documents/{doc_id_2}/finalize")
        final_id_2 = resp2.json()["final_doc_id"]

        assert dict(database.get_document_by_id(final_id_1))["is_final"] == 0
        assert dict(database.get_document_by_id(final_id_2))["is_final"] == 1

    def test_finalize_typ_source_returns_422(self, doc_client):
        c, app_id = doc_client["client"], doc_client["app_id"]
        upload = _upload(c, app_id, "resume.typ", b"#hello").json()
        resp = c.post(f"/api/v1/applications/{app_id}/documents/{upload['id']}/finalize")
        assert resp.status_code == 422

    def test_finalize_non_draft_pdf_returns_422(self, doc_client):
        c, app_id = doc_client["client"], doc_client["app_id"]
        upload = _upload(
            c, app_id, "portfolio.pdf", b"%PDF-1.4", content_type="application/pdf"
        ).json()
        resp = c.post(f"/api/v1/applications/{app_id}/documents/{upload['id']}/finalize")
        assert resp.status_code == 422

    def test_finalize_name_not_found_falls_back_to_company_title(self, doc_client, monkeypatch):
        import document_routes
        monkeypatch.setattr(
            document_routes,
            "_load_config",
            lambda: {"evaluation": {"jobsearch_md_path": "/nonexistent/jobsearch.md"}},
        )
        c, app_id = doc_client["client"], doc_client["app_id"]
        doc_id, _ = _make_app_folder(doc_client)
        resp = c.post(f"/api/v1/applications/{app_id}/documents/{doc_id}/finalize")
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["filename"].endswith(".pdf")
        assert not data["filename"].startswith("DRAFT_")

    def test_finalize_duplicate_filename_silently_renamed(self, doc_client, jobsearch_with_name):
        c, app_id = doc_client["client"], doc_client["app_id"]
        doc_id_1, _ = _make_app_folder(doc_client, "DRAFT_resume_v1.pdf")
        resp1 = c.post(f"/api/v1/applications/{app_id}/documents/{doc_id_1}/finalize")
        final_name_1 = resp1.json()["filename"]

        doc_id_2, _ = _make_app_folder(doc_client, "DRAFT_resume_v2.pdf")
        resp2 = c.post(f"/api/v1/applications/{app_id}/documents/{doc_id_2}/finalize")
        final_name_2 = resp2.json()["filename"]

        assert final_name_1 != final_name_2
        assert "_2" in final_name_2

    def test_finalize_creates_audit_entry(self, doc_client, jobsearch_with_name):
        c, app_id = doc_client["client"], doc_client["app_id"]
        doc_id, _ = _make_app_folder(doc_client)
        c.post(f"/api/v1/applications/{app_id}/documents/{doc_id}/finalize")
        audits = database.get_application_audit(app_id)
        assert any("document_finalized" in a["event"] for a in audits)


# ─────────────────────────────────────────────────────────────
# GET /api/v1/templates/typst  +  POST from-template
# ─────────────────────────────────────────────────────────────

class TestTemplateRoutes:
    def test_list_returns_templates_by_category(self, doc_client, template_dirs):
        resp = doc_client["client"].get("/api/v1/templates/typst")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["resume"]) >= 1
        assert data["resume"][0]["filename"] == "modern-cv.typ"
        assert data["resume"][0]["category"] == "resume"
        assert len(data["cover_letter"]) >= 1
        assert data["cover_letter"][0]["filename"] == "basic-cover.typ"

    def test_list_returns_empty_when_dirs_missing(self, doc_client, monkeypatch, tmp_path):
        empty = tmp_path / "empty_cwd"
        empty.mkdir()
        monkeypatch.chdir(empty)
        resp = doc_client["client"].get("/api/v1/templates/typst")
        assert resp.status_code == 200
        data = resp.json()
        assert data["resume"] == []
        assert data["cover_letter"] == []

    def test_copy_template_happy_path(self, doc_client, template_dirs):
        c, app_id = doc_client["client"], doc_client["app_id"]
        resp = c.post(
            f"/api/v1/applications/{app_id}/documents/from-template",
            json={"template_filename": "modern-cv.typ", "category": "resume"},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["filename"] == "resume_draft.typ"
        assert data["type_value"] == "resume"
        assert Path(data["file_path"]).exists()

    def test_copy_template_creates_audit_entry(self, doc_client, template_dirs):
        c, app_id = doc_client["client"], doc_client["app_id"]
        c.post(
            f"/api/v1/applications/{app_id}/documents/from-template",
            json={"template_filename": "modern-cv.typ", "category": "resume"},
        )
        audits = database.get_application_audit(app_id)
        assert any("document_from_template" in a["event"] for a in audits)

    def test_copy_template_filename_with_slash_returns_422(self, doc_client, template_dirs):
        c, app_id = doc_client["client"], doc_client["app_id"]
        resp = c.post(
            f"/api/v1/applications/{app_id}/documents/from-template",
            json={"template_filename": "../evil.typ", "category": "resume"},
        )
        assert resp.status_code == 422

    def test_copy_template_not_found_returns_404(self, doc_client, template_dirs):
        c, app_id = doc_client["client"], doc_client["app_id"]
        resp = c.post(
            f"/api/v1/applications/{app_id}/documents/from-template",
            json={"template_filename": "nonexistent.typ", "category": "resume"},
        )
        assert resp.status_code == 404

    def test_copy_cover_letter_default_name(self, doc_client, template_dirs):
        c, app_id = doc_client["client"], doc_client["app_id"]
        resp = c.post(
            f"/api/v1/applications/{app_id}/documents/from-template",
            json={"template_filename": "basic-cover.typ", "category": "cover_letter"},
        )
        assert resp.status_code == 201
        assert resp.json()["filename"] == "cover_letter_draft.typ"


# ─────────────────────────────────────────────────────────────
# GET /api/v1/settings/documents-storage
# ─────────────────────────────────────────────────────────────

class TestRenameDocument:
    def test_rename_happy_path(self, doc_client):
        c, app_id = doc_client["client"], doc_client["app_id"]
        resp = _upload(c, app_id, "original_name.typ", b"#set page()")
        doc_id = resp.json()["id"]

        r = c.patch(
            f"/api/v1/applications/{app_id}/documents/{doc_id}/rename",
            json={"new_name": "renamed_file"},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["filename"] == "renamed_file.typ"
        assert data["id"] == doc_id

    def test_rename_updates_db_record(self, doc_client):
        c, app_id = doc_client["client"], doc_client["app_id"]
        resp = _upload(c, app_id, "old_name.typ", b"#set page()")
        doc_id = resp.json()["id"]

        c.patch(
            f"/api/v1/applications/{app_id}/documents/{doc_id}/rename",
            json={"new_name": "new_name"},
        )
        doc = database.get_document_by_id(doc_id)
        assert dict(doc)["file_path"].endswith("new_name.typ")

    def test_rename_collision_returns_409(self, doc_client):
        c, app_id = doc_client["client"], doc_client["app_id"]
        _upload(c, app_id, "taken_name.typ", b"#set page()")
        resp2 = _upload(c, app_id, "other_name.typ", b"#set page()")
        doc2_id = resp2.json()["id"]

        r = c.patch(
            f"/api/v1/applications/{app_id}/documents/{doc2_id}/rename",
            json={"new_name": "taken_name"},
        )
        assert r.status_code == 409

    def test_rename_invalid_name_returns_422(self, doc_client):
        c, app_id = doc_client["client"], doc_client["app_id"]
        resp = _upload(c, app_id, "valid_name.typ", b"#set page()")
        doc_id = resp.json()["id"]

        for bad_name in ["bad name", "bad/name", "a" * 65, ""]:
            r = c.patch(
                f"/api/v1/applications/{app_id}/documents/{doc_id}/rename",
                json={"new_name": bad_name},
            )
            assert r.status_code == 422, f"Expected 422 for name={bad_name!r}"

    def test_rename_not_found_returns_404(self, doc_client):
        c, app_id = doc_client["client"], doc_client["app_id"]
        r = c.patch(
            f"/api/v1/applications/{app_id}/documents/99999/rename",
            json={"new_name": "anything"},
        )
        assert r.status_code == 404

    def test_rename_wrong_application_returns_404(self, doc_client):
        c, app_id = doc_client["client"], doc_client["app_id"]
        resp = _upload(c, app_id, "myfile.typ", b"#set page()")
        doc_id = resp.json()["id"]

        r = c.patch(
            f"/api/v1/applications/99999/documents/{doc_id}/rename",
            json={"new_name": "newname"},
        )
        assert r.status_code == 404

    def test_rename_creates_audit_entry(self, doc_client):
        c, app_id = doc_client["client"], doc_client["app_id"]
        resp = _upload(c, app_id, "audit_test.typ", b"#set page()")
        doc_id = resp.json()["id"]

        c.patch(
            f"/api/v1/applications/{app_id}/documents/{doc_id}/rename",
            json={"new_name": "audited_rename"},
        )
        audits = database.get_application_audit(app_id)
        assert any("document_renamed" in a["event"] for a in audits)


class TestDocumentsStorage:
    def test_returns_correct_count_and_size(self, doc_client):
        c, app_id = doc_client["client"], doc_client["app_id"]
        _upload(c, app_id, "resume.typ", b"hello world")
        resp = c.get("/api/v1/settings/documents-storage")
        assert resp.status_code == 200
        data = resp.json()
        assert data["file_count"] >= 1
        assert data["total_bytes"] > 0
        assert data["typst_available"] is True
        assert "generated_dir" in data

    def test_returns_zeros_when_generated_dir_missing(self, doc_client, monkeypatch):
        from main import app
        missing_dir = doc_client["generated_dir"].parent / "nonexistent_generated"
        monkeypatch.setattr(app.state, "generated_dir", missing_dir)
        resp = doc_client["client"].get("/api/v1/settings/documents-storage")
        assert resp.status_code == 200
        data = resp.json()
        assert data["file_count"] == 0
        assert data["total_bytes"] == 0
