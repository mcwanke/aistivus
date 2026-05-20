"""
tests/routes/conftest.py
────────────────────────
Shared fixtures for route integration tests.

Each test that uses `client` gets:
  - A fresh in-memory SQLite database (via tmp_path)
  - Startup model-availability check skipped (no live Ollama needed)
  - Logger file handler suppressed (no logs/ dir created during tests)
  - A FastAPI TestClient that runs the real lifespan

Each test that uses `seeded_client` additionally gets:
  - One LLM model in the DB (test-model, default)
  - One job with its auto-created not-started application
"""

import pytest
from fastapi.testclient import TestClient

import database
import logger as logger_module


@pytest.fixture
def client(tmp_path, monkeypatch):
    """TestClient with a fresh test DB and mocked startup validation."""
    # Redirect DB to a temp file
    monkeypatch.setattr(database, "_get_db_path", lambda: tmp_path / "test.db")
    monkeypatch.setattr(database, "_load_config", lambda: {})

    # Suppress log file creation — tests run without a logs/ dir
    monkeypatch.setattr(logger_module, "_configure_root_logger", lambda: None)

    # Skip live model availability check (no Ollama in CI)
    import main as main_module
    async def _noop_update(app_state=None):
        pass
    monkeypatch.setattr(main_module, "_update_model_availability", _noop_update)
    monkeypatch.setattr(main_module, "_load_config", lambda: {})

    from main import app
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c


@pytest.fixture
def seeded_client(client, tmp_path, monkeypatch):
    """client with a test model and a test job pre-inserted."""
    server_id = database.create_server("Local Ollama", "http://localhost:11434", "local")
    model_id = database.insert_llm_model(
        "test-model",
        server_id,
        default_flag=1,
        available=1,
    )
    job_id, _ = database.upsert_job(
        "Test Corp",
        "Software Engineer",
        "backend",
        location="Remote",
        remote_type="Remote",
        description_merged="We need a backend engineer.",
    )
    app_row = database.get_application_for_job(job_id)
    return {
        "client": client,
        "model_id": model_id,
        "job_id": job_id,
        "app_id": app_row["id"],
    }


@pytest.fixture
def jobsearch_file(tmp_path, monkeypatch):
    """Write a minimal jobsearch.md and patch evaluator to find it."""
    import evaluator
    path = tmp_path / "jobsearch.md"
    path.write_text(
        "# Job Search Context\n## Target Role Profile\nSoftware engineer roles.\n"
    )
    monkeypatch.setattr(evaluator, "_get_jobsearch_path", lambda: path)
    return path
