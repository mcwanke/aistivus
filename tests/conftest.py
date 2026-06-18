"""
Shared pytest fixtures for AIstivus tests.

Each test that declares `tmp_db` gets a fresh, fully-initialized SQLite database
in a temp directory. _get_db_path and _load_config are monkeypatched so tests
never touch the real database or config.yaml.
"""

import pytest
import database


@pytest.fixture
def tmp_db(tmp_path, monkeypatch):
    """Fresh initialized database for each test. Returns the Path to the db file."""
    test_db = tmp_path / "test.db"
    monkeypatch.setattr(database, "_get_db_path", lambda: test_db)
    monkeypatch.setattr(database, "_load_config", lambda: {})
    database.init_db()
    return test_db


@pytest.fixture
def model_id(tmp_db):
    """Insert a test LLM server and model; return the model id."""
    server_id = database.create_server("Local Ollama", "http://localhost:11434", "ollama")
    return database.insert_llm_model(
        "test-model",
        server_id,
        default_flag=1,
        available=1,
    )


@pytest.fixture
def job_id(tmp_db):
    """Insert a test job and return its id."""
    jid, _ = database.upsert_job(
        "Acme Corp",
        "Software Engineer",
        "python",
        location="Remote",
        remote_type="Remote",
    )
    return jid


@pytest.fixture
def app_id(job_id, tmp_db):
    """Return the auto-created application id for the test job."""
    app = database.get_application_for_job(job_id)
    assert app is not None
    return app["id"]
