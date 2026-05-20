"""
database.py
───────────
Full schema definition and all database read/write helpers for AIstivus.

Rules (from CLAUDE.md):
- This is the ONLY file that contains SQL.
- All queries use parameterized statements — no string interpolation.
- get_connection() is the only way to open a database connection.
- Upsert = explicit SELECT + INSERT/UPDATE. Never INSERT OR REPLACE.
- Audit tables are append-only. Never DELETE or UPDATE them.
- resume_info records are never hard-deleted. Deactivate only.
- system_types records are never edited. Add or delete only.
- llm_models.default_flag: only one record may have default_flag = 1.
- data/ directory is created automatically on first run.

Schema version: 1.0
"""

import hashlib
import json
import re
import shutil
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Generator

import yaml

# ─────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────

def _load_config() -> dict:
    """Load config.yaml if it exists; return empty dict otherwise."""
    config_path = Path("config.yaml")
    if config_path.exists():
        with open(config_path) as f:
            return yaml.safe_load(f) or {}
    return {}


def _get_db_path() -> Path:
    config = _load_config()
    return Path(config.get("database", {}).get("db_path", "./data/jobs.db"))


# ─────────────────────────────────────────────────────────────
# Connection
# ─────────────────────────────────────────────────────────────

@contextmanager
def get_connection() -> Generator[sqlite3.Connection, None, None]:
    """
    Context manager that opens a database connection, yields it, and closes it.
    - Commits on clean exit; rolls back on exception
    - Sets row_factory for dict-style row access
    - Enables WAL mode for better concurrent read performance
    - Enables foreign key enforcement
    - Creates data/ directory if it does not exist
    """
    db_path = _get_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# Schema v1.0
# ─────────────────────────────────────────────────────────────

SCHEMA = """
CREATE TABLE IF NOT EXISTS system_types (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    type_name   TEXT NOT NULL,
    type_value  TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (type_name, type_value)
);

CREATE TABLE IF NOT EXISTS llm_servers (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    server_name TEXT NOT NULL,
    endpoint    TEXT,
    server_type TEXT NOT NULL DEFAULT 'local',
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS llm_models (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    model               TEXT NOT NULL,
    server_id           INTEGER NOT NULL,
    estimated_eval_time INTEGER,
    available           INTEGER NOT NULL DEFAULT 0,
    default_flag        INTEGER NOT NULL DEFAULT 0,
    model_weight        INTEGER NOT NULL DEFAULT 1,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (server_id) REFERENCES llm_servers(id)
);

CREATE TABLE IF NOT EXISTS jobs (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    company_name        TEXT NOT NULL,
    title               TEXT NOT NULL,
    location            TEXT,
    remote_type         TEXT,
    description_merged  TEXT,
    pay_band            TEXT,
    role_keyword        TEXT,
    dedup_status        TEXT NOT NULL DEFAULT 'clean',
    first_seen_date     TEXT,
    last_seen_date      TEXT,
    posting_count       INTEGER NOT NULL DEFAULT 1,
    is_repost           INTEGER NOT NULL DEFAULT 0,
    agg_role_fit        REAL,
    agg_scope_fit       REAL,
    agg_culture         REAL,
    agg_comp            REAL,
    agg_score_overall   REAL,
    my_role_fit         REAL,
    my_scope_fit        REAL,
    my_culture          REAL,
    my_comp             REAL,
    my_score_overall    REAL,
    excitement_level    TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    project_id          INTEGER,
    is_active           INTEGER NOT NULL DEFAULT 0,
    UNIQUE (company_name, title, role_keyword)
);

CREATE TABLE IF NOT EXISTS job_company_log (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id        INTEGER NOT NULL REFERENCES jobs(id),
    type_id       INTEGER NOT NULL REFERENCES system_types(id),
    log           TEXT,
    url           TEXT,
    log_timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS job_postings (
    id                       INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id                   INTEGER NOT NULL REFERENCES jobs(id),
    source_board             TEXT,
    source_url               TEXT,
    description_raw          TEXT,
    date_posted              TEXT,
    date_scraped             TEXT NOT NULL DEFAULT (datetime('now')),
    is_repost                INTEGER NOT NULL DEFAULT 0,
    days_since_prior_posting INTEGER,
    repost_url_changed       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS evaluations (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id          INTEGER NOT NULL REFERENCES jobs(id),
    llm_model_id    INTEGER NOT NULL REFERENCES llm_models(id),
    score_overall   REAL,
    score_role_fit  REAL,
    score_scope_fit REAL,
    score_culture   REAL,
    score_comp      REAL,
    fit_type        TEXT,
    archetype       TEXT,
    strengths       TEXT,
    gaps            TEXT,
    recommendation  TEXT,
    keywords        TEXT,
    domain_match    TEXT,
    role_type_match TEXT,
    keyword_gaps    TEXT,
    llm_call_log_id INTEGER,
    evaluated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS llm_call_log (
    id                       INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp                TEXT NOT NULL DEFAULT (datetime('now')),
    llm_model_id             INTEGER,
    call_type                TEXT,
    prompt                   TEXT,
    prompt_hash              TEXT,
    raw_response             TEXT,
    prompt_tokens_estimated  INTEGER,
    prompt_tokens_actual     INTEGER,
    completion_tokens_actual INTEGER,
    total_tokens_actual      INTEGER,
    latency_ms               INTEGER,
    call_time                INTEGER,
    success                  INTEGER NOT NULL DEFAULT 1,
    error_message            TEXT,
    job_id                   INTEGER,
    search_run_id            INTEGER
);

CREATE TABLE IF NOT EXISTS applications (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id             INTEGER NOT NULL REFERENCES jobs(id),
    apply_date         TEXT,
    end_date           TEXT,
    requested_salary   TEXT,
    application_status TEXT NOT NULL DEFAULT 'not-started',
    applied            INTEGER NOT NULL DEFAULT 0,
    project_id         INTEGER
);

CREATE TABLE IF NOT EXISTS application_logs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id  INTEGER NOT NULL REFERENCES applications(id),
    type_id         INTEGER NOT NULL REFERENCES system_types(id),
    log             TEXT,
    url             TEXT,
    log_timestamp   TEXT NOT NULL DEFAULT (datetime('now')),
    llm_call_log_id INTEGER
);

CREATE TABLE IF NOT EXISTS application_documents (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL REFERENCES applications(id),
    type_id        INTEGER NOT NULL REFERENCES system_types(id),
    file_path      TEXT NOT NULL,
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS application_audit (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL REFERENCES applications(id),
    timestamp      TEXT NOT NULL DEFAULT (datetime('now')),
    event          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS job_posting_audit (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    job_posting_id INTEGER NOT NULL REFERENCES job_postings(id),
    timestamp      TEXT NOT NULL DEFAULT (datetime('now')),
    event          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jobsearch_versions (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    content  TEXT NOT NULL,
    saved_at TEXT NOT NULL DEFAULT (datetime('now')),
    note     TEXT
);

CREATE TABLE IF NOT EXISTS app_settings (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    key        TEXT NOT NULL UNIQUE,
    value      TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS resume_info (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    chunk_name         TEXT,
    chunk_text         TEXT NOT NULL,
    chunk_type         TEXT NOT NULL,
    tags               TEXT,
    source_resume      TEXT,
    source_resume_name TEXT,
    is_active          INTEGER NOT NULL DEFAULT 1,
    created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS search_runs (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    run_at               TEXT NOT NULL DEFAULT (datetime('now')),
    config_snapshot      TEXT,
    jobs_found           INTEGER NOT NULL DEFAULT 0,
    jobs_evaluated       INTEGER NOT NULL DEFAULT 0,
    jobs_above_threshold INTEGER NOT NULL DEFAULT 0,
    jobs_failed          INTEGER NOT NULL DEFAULT 0,
    error_summary        TEXT,
    run_source           TEXT,
    project_id           INTEGER
);

CREATE TABLE IF NOT EXISTS search_run_errors (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    search_run_id INTEGER NOT NULL REFERENCES search_runs(id),
    source_board  TEXT,
    source_url    TEXT,
    error_type    TEXT,
    error_message TEXT,
    timestamp     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS chat_sessions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    title      TEXT,
    job_id     INTEGER,
    project_id INTEGER
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  INTEGER NOT NULL REFERENCES chat_sessions(id),
    role        TEXT NOT NULL,
    content     TEXT NOT NULL,
    timestamp   TEXT NOT NULL DEFAULT (datetime('now')),
    tokens_used INTEGER,
    model_used  TEXT
);

CREATE TABLE IF NOT EXISTS projects (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    description TEXT,
    is_active   INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS schema_versions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    version     TEXT NOT NULL,
    applied_at  TEXT NOT NULL DEFAULT (datetime('now')),
    description TEXT,
    checksum    TEXT
);

CREATE TABLE IF NOT EXISTS schema_migrations (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    from_version  TEXT NOT NULL,
    to_version    TEXT NOT NULL,
    migration_sql TEXT NOT NULL,
    rollback_sql  TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_jobs_company_name       ON jobs(company_name);
CREATE INDEX IF NOT EXISTS idx_evaluations_job_id      ON evaluations(job_id);
CREATE INDEX IF NOT EXISTS idx_applications_job_id     ON applications(job_id);
CREATE INDEX IF NOT EXISTS idx_llm_call_log_job_id     ON llm_call_log(job_id);
CREATE INDEX IF NOT EXISTS idx_app_logs_app_id         ON application_logs(application_id);
CREATE INDEX IF NOT EXISTS idx_job_company_log_job_id  ON job_company_log(job_id);
CREATE INDEX IF NOT EXISTS idx_llm_models_server_id    ON llm_models(server_id);
"""

CURRENT_SCHEMA_VERSION = "1.3"

_APP_SETTINGS_SEED: list[tuple[str, str]] = [
    ("allow_audit_timestamp_edit", "0"),
]

_SYSTEM_TYPES_SEED: list[tuple[str, str]] = [
    ("application_log", "recruiter_call"),
    ("application_log", "interview_feedback"),
    ("application_log", "compensation"),
    ("application_log", "general"),
    ("application_log", "repost_alert"),
    ("application_log", "prompt"),
    ("application_log", "lesson_learned"),
    ("company_info", "website"),
    ("company_info", "careerpage"),
    ("company_info", "culturepage"),
    ("company_info", "industry"),
    ("company_info", "size"),
    ("company_info", "notes"),
    ("application_document", "resume"),
    ("application_document", "cover_letter"),
]


def init_db() -> None:
    """
    Initialize the database — idempotent, safe to call on every startup.
    - Creates all tables and indexes
    - Seeds system_types if not already seeded
    - Records schema version
    - Auto-seeds llm_models from config.yaml if table is empty
    """
    with get_connection() as conn:
        conn.executescript(SCHEMA)

        for type_name, type_value in _SYSTEM_TYPES_SEED:
            existing = conn.execute(
                "SELECT id FROM system_types WHERE type_name = ? AND type_value = ?",
                (type_name, type_value)
            ).fetchone()
            if not existing:
                conn.execute(
                    "INSERT INTO system_types (type_name, type_value) VALUES (?, ?)",
                    (type_name, type_value)
                )

        for key, value in _APP_SETTINGS_SEED:
            existing = conn.execute(
                "SELECT id FROM app_settings WHERE key = ?", (key,)
            ).fetchone()
            if not existing:
                conn.execute(
                    "INSERT INTO app_settings (key, value) VALUES (?, ?)",
                    (key, value)
                )

        existing_version = conn.execute(
            "SELECT id FROM schema_versions WHERE version = ?",
            (CURRENT_SCHEMA_VERSION,)
        ).fetchone()
        if not existing_version:
            conn.execute(
                "INSERT INTO schema_versions (version, description) VALUES (?, ?)",
                (CURRENT_SCHEMA_VERSION, "Schema v1.3 — llm_servers table; llm_models.server_id FK replaces endpoint")
            )

    seed_llm_models_from_config()
    _check_jobsearch_staleness()

    print(f"Database initialized at {_get_db_path().resolve()}")
    print(f"Schema version: {CURRENT_SCHEMA_VERSION}")


def get_schema_version() -> str:
    """Return the current schema version recorded in the database."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT version FROM schema_versions ORDER BY applied_at DESC LIMIT 1"
        ).fetchone()
        return row["version"] if row else "unknown"


def _check_jobsearch_staleness() -> None:
    """Warn if jobsearch.md has been modified outside the app since last save."""
    jobsearch_path = Path("jobsearch.md")
    if not jobsearch_path.exists():
        return

    with get_connection() as conn:
        latest = conn.execute(
            "SELECT saved_at FROM jobsearch_versions ORDER BY saved_at DESC LIMIT 1"
        ).fetchone()

    if not latest:
        return

    file_mtime = datetime.fromtimestamp(
        jobsearch_path.stat().st_mtime, tz=timezone.utc
    ).strftime("%Y-%m-%d %H:%M:%S")

    if file_mtime > latest["saved_at"]:
        print(
            "Warning: jobsearch.md was modified outside the app. "
            "Consider saving a version snapshot in Settings."
        )


# ─────────────────────────────────────────────────────────────
# Jobsearch Versions
# ─────────────────────────────────────────────────────────────

def save_jobsearch_version(content: str, note: str) -> int:
    """Insert a snapshot of jobsearch.md content. Returns the new version id."""
    with get_connection() as conn:
        cursor = conn.execute(
            "INSERT INTO jobsearch_versions (content, note) VALUES (?, ?)",
            (content, note),
        )
        return cursor.lastrowid


def get_jobsearch_versions(limit: int = 30) -> list[dict]:
    """Return recent version metadata (no content) ordered newest first."""
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, saved_at, note FROM jobsearch_versions "
            "ORDER BY saved_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
        return [dict(row) for row in rows]


def get_jobsearch_version_by_id(version_id: int) -> dict | None:
    """Return a single version row including full content, or None if not found."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT id, content, saved_at, note FROM jobsearch_versions WHERE id = ?",
            (version_id,),
        ).fetchone()
        return dict(row) if row else None


# ─────────────────────────────────────────────────────────────
# System Types
# ─────────────────────────────────────────────────────────────

def get_all_system_types(type_name: str | None = None) -> list[sqlite3.Row]:
    """Return system_types, optionally filtered to a single type_name category."""
    with get_connection() as conn:
        if type_name:
            return conn.execute(
                "SELECT * FROM system_types WHERE type_name = ? ORDER BY type_value",
                (type_name,)
            ).fetchall()
        return conn.execute(
            "SELECT * FROM system_types ORDER BY type_name, type_value"
        ).fetchall()


def get_system_type_id(type_name: str, type_value: str) -> int | None:
    """Return the id for a specific (type_name, type_value) pair, or None."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT id FROM system_types WHERE type_name = ? AND type_value = ?",
            (type_name, type_value)
        ).fetchone()
        return row["id"] if row else None


def add_system_type(type_name: str, type_value: str) -> int:
    """
    Add a new system_type. Raises ValueError if the pair already exists.
    Returns the new id.
    """
    with get_connection() as conn:
        existing = conn.execute(
            "SELECT id FROM system_types WHERE type_name = ? AND type_value = ?",
            (type_name, type_value)
        ).fetchone()
        if existing:
            raise ValueError(
                f"system_type ({type_name!r}, {type_value!r}) already exists"
            )
        conn.execute(
            "INSERT INTO system_types (type_name, type_value) VALUES (?, ?)",
            (type_name, type_value)
        )
        return conn.execute("SELECT last_insert_rowid()").fetchone()[0]


def delete_system_type(type_id: int) -> bool:
    """
    Delete a system_type by id. Blocked if any records reference this type_id.
    Returns True if deleted, False if blocked by references.
    """
    with get_connection() as conn:
        ref_count = (
            conn.execute(
                "SELECT COUNT(*) FROM job_company_log WHERE type_id = ?", (type_id,)
            ).fetchone()[0]
            + conn.execute(
                "SELECT COUNT(*) FROM application_logs WHERE type_id = ?", (type_id,)
            ).fetchone()[0]
            + conn.execute(
                "SELECT COUNT(*) FROM application_documents WHERE type_id = ?", (type_id,)
            ).fetchone()[0]
        )
        if ref_count > 0:
            return False
        conn.execute("DELETE FROM system_types WHERE id = ?", (type_id,))
        return conn.total_changes > 0


# ─────────────────────────────────────────────────────────────
# LLM Servers
# ─────────────────────────────────────────────────────────────

def get_all_servers() -> list[sqlite3.Row]:
    """Return all llm_servers rows, ordered by server_name."""
    with get_connection() as conn:
        return conn.execute(
            "SELECT * FROM llm_servers ORDER BY server_name"
        ).fetchall()


def get_server_by_id(server_id: int) -> sqlite3.Row | None:
    """Return a single llm_servers row, or None."""
    with get_connection() as conn:
        return conn.execute(
            "SELECT * FROM llm_servers WHERE id = ?", (server_id,)
        ).fetchone()


def create_server(server_name: str, endpoint: str | None, server_type: str) -> int:
    """Insert a new llm_servers record. Returns new id."""
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO llm_servers (server_name, endpoint, server_type) VALUES (?, ?, ?)",
            (server_name, endpoint, server_type),
        )
        return conn.execute("SELECT last_insert_rowid()").fetchone()[0]


def update_server(server_id: int, server_name: str, endpoint: str | None) -> None:
    """Update server_name and endpoint for an existing server. server_type is immutable."""
    with get_connection() as conn:
        conn.execute(
            "UPDATE llm_servers SET server_name = ?, endpoint = ? WHERE id = ?",
            (server_name, endpoint, server_id),
        )


def delete_server(server_id: int) -> None:
    """Delete a server. Caller must verify no models reference it first."""
    with get_connection() as conn:
        conn.execute("DELETE FROM llm_servers WHERE id = ?", (server_id,))


def get_model_count_for_server(server_id: int) -> int:
    """Return count of llm_models rows with this server_id."""
    with get_connection() as conn:
        return conn.execute(
            "SELECT COUNT(*) FROM llm_models WHERE server_id = ?", (server_id,)
        ).fetchone()[0]


# ─────────────────────────────────────────────────────────────
# LLM Models
# ─────────────────────────────────────────────────────────────

_LLM_MODEL_JOIN = """
    SELECT lm.*, ls.server_name, ls.endpoint, ls.server_type
    FROM llm_models lm
    JOIN llm_servers ls ON ls.id = lm.server_id
"""


def get_all_llm_models() -> list[sqlite3.Row]:
    """Return all LLM model records with server info, ordered by server name then model name."""
    with get_connection() as conn:
        return conn.execute(
            f"{_LLM_MODEL_JOIN} ORDER BY ls.server_name, lm.model"
        ).fetchall()


def get_llm_model(model_id: int) -> sqlite3.Row | None:
    """Return a single LLM model record with server info by id, or None."""
    with get_connection() as conn:
        return conn.execute(
            f"{_LLM_MODEL_JOIN} WHERE lm.id = ?", (model_id,)
        ).fetchone()


def get_default_llm_model() -> sqlite3.Row | None:
    """Return the model with default_flag = 1 with server info, or None."""
    with get_connection() as conn:
        return conn.execute(
            f"{_LLM_MODEL_JOIN} WHERE lm.default_flag = 1 LIMIT 1"
        ).fetchone()


def insert_llm_model(model: str, server_id: int, **kwargs) -> int:
    """
    Insert a new LLM model record.
    If default_flag=1, clears default_flag on all existing records first.
    Returns the new model id.
    """
    allowed = {"estimated_eval_time", "available", "default_flag", "model_weight"}
    params = {k: v for k, v in kwargs.items() if k in allowed}
    default_flag = params.get("default_flag", 0)

    with get_connection() as conn:
        if default_flag == 1:
            conn.execute("UPDATE llm_models SET default_flag = 0")

        conn.execute(
            """INSERT INTO llm_models
               (model, server_id, estimated_eval_time, available, default_flag, model_weight)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                model,
                server_id,
                params.get("estimated_eval_time"),
                params.get("available", 0),
                default_flag,
                params.get("model_weight", 1),
            )
        )
        return conn.execute("SELECT last_insert_rowid()").fetchone()[0]


def update_llm_model(model_id: int, **kwargs) -> bool:
    """
    Update LLM model fields. If setting default_flag=1, clears all others first.
    Returns True if a row was updated, False if model not found.
    """
    allowed = {"model", "estimated_eval_time", "available", "default_flag", "model_weight"}
    updates = {k: v for k, v in kwargs.items() if k in allowed}
    if not updates:
        return False

    with get_connection() as conn:
        existing = conn.execute(
            "SELECT id FROM llm_models WHERE id = ?", (model_id,)
        ).fetchone()
        if not existing:
            return False

        if updates.get("default_flag") == 1:
            conn.execute("UPDATE llm_models SET default_flag = 0")

        set_clause = ", ".join(f"{k} = ?" for k in updates)
        conn.execute(
            f"UPDATE llm_models SET {set_clause} WHERE id = ?",
            (*updates.values(), model_id)
        )
        return True


def set_llm_model_default(model_id: int) -> None:
    """
    Set a model as the default. Clears default_flag on all other records.
    Raises ValueError if the model does not exist.
    """
    with get_connection() as conn:
        existing = conn.execute(
            "SELECT id FROM llm_models WHERE id = ?", (model_id,)
        ).fetchone()
        if not existing:
            raise ValueError(f"LLM model id={model_id} not found")
        conn.execute("UPDATE llm_models SET default_flag = 0")
        conn.execute(
            "UPDATE llm_models SET default_flag = 1 WHERE id = ?", (model_id,)
        )


def set_llm_model_available(model_id: int, available: int) -> None:
    """Update the available flag (0 or 1) for an LLM model."""
    with get_connection() as conn:
        conn.execute(
            "UPDATE llm_models SET available = ? WHERE id = ?",
            (available, model_id)
        )


def delete_llm_model(model_id: int) -> bool:
    """
    Delete an LLM model. Returns True if deleted, False if not found.
    Note: blocked by FK if evaluations reference this model.
    """
    with get_connection() as conn:
        conn.execute("DELETE FROM llm_models WHERE id = ?", (model_id,))
        return conn.total_changes > 0


def get_recent_model_latencies(model_id: int, limit: int = 10) -> list[int]:
    """Return the last N successful call latencies (ms) for a model, newest first."""
    with get_connection() as conn:
        rows = conn.execute(
            """SELECT latency_ms FROM llm_call_log
               WHERE llm_model_id = ? AND success = 1 AND latency_ms IS NOT NULL
               ORDER BY timestamp DESC LIMIT ?""",
            (model_id, limit),
        ).fetchall()
    return [row["latency_ms"] for row in rows]


def update_model_eval_time(model_id: int, estimated_seconds: int) -> None:
    """Update estimated_eval_time for a model based on recent call latencies."""
    with get_connection() as conn:
        conn.execute(
            "UPDATE llm_models SET estimated_eval_time = ? WHERE id = ?",
            (estimated_seconds, model_id),
        )


def seed_llm_models_from_config() -> bool:
    """
    Auto-seed llm_servers and llm_models from config.yaml if both tables are empty.
    Reads ollama.base_url and ollama.default_model from config.
    Creates the server record first, then the model pointing to it.
    Returns True if seeded, False otherwise.
    """
    config = _load_config()
    ollama_cfg = config.get("ollama", {})
    base_url = ollama_cfg.get("base_url")
    default_model = ollama_cfg.get("default_model")

    if not base_url or not default_model:
        return False

    with get_connection() as conn:
        server_count = conn.execute("SELECT COUNT(*) FROM llm_servers").fetchone()[0]
        model_count = conn.execute("SELECT COUNT(*) FROM llm_models").fetchone()[0]
        if server_count > 0 or model_count > 0:
            return False

        conn.execute(
            "INSERT INTO llm_servers (server_name, endpoint, server_type) VALUES (?, ?, 'local')",
            ("Local Ollama", base_url),
        )
        server_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

        conn.execute(
            "INSERT INTO llm_models (model, server_id, default_flag, available) VALUES (?, ?, 1, 0)",
            (default_model, server_id),
        )

    print("Auto-seeded default server and model from config.yaml — manage in Settings.")
    return True


# ─────────────────────────────────────────────────────────────
# Jobs
# ─────────────────────────────────────────────────────────────

def upsert_job(
    company_name: str,
    title: str,
    role_keyword: str | None = None,
    **kwargs
) -> tuple[int, bool]:
    """
    Insert a new job or return the existing job's id.
    Dedup key: (company_name, title, role_keyword) — company_name matched case-insensitively.
    When a new job is created, a 'not-started' application is auto-created atomically.

    Returns:
        (job_id, created) — created=True means a new row was inserted
    """
    allowed = [
        "location", "remote_type", "description_merged", "pay_band",
        "first_seen_date", "last_seen_date", "excitement_level",
        "my_role_fit", "my_scope_fit", "my_culture", "my_comp", "my_score_overall",
    ]
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

    with get_connection() as conn:
        existing = conn.execute(
            """SELECT id FROM jobs
               WHERE LOWER(company_name) = LOWER(?)
                 AND title = ?
                 AND role_keyword IS ?""",
            (company_name, title, role_keyword)
        ).fetchone()

        if existing:
            updates = {k: v for k, v in kwargs.items() if k in allowed and v is not None}
            updates["last_seen_date"] = now
            set_clause = ", ".join(f"{k} = ?" for k in updates)
            conn.execute(
                f"UPDATE jobs SET {set_clause}, posting_count = posting_count + 1 WHERE id = ?",
                (*updates.values(), existing["id"])
            )
            return existing["id"], False

        insert_params = {f: kwargs.get(f) for f in allowed}
        insert_params["company_name"] = company_name
        insert_params["title"] = title
        insert_params["role_keyword"] = role_keyword
        insert_params["first_seen_date"] = insert_params.get("first_seen_date") or now
        insert_params["last_seen_date"] = insert_params.get("last_seen_date") or now

        insert_params["is_active"] = 0
        conn.execute(
            """INSERT INTO jobs
               (company_name, title, role_keyword, location, remote_type,
                description_merged, pay_band, first_seen_date, last_seen_date,
                excitement_level, my_role_fit, my_scope_fit, my_culture, my_comp,
                my_score_overall, is_active)
               VALUES
               (:company_name, :title, :role_keyword, :location, :remote_type,
                :description_merged, :pay_band, :first_seen_date, :last_seen_date,
                :excitement_level, :my_role_fit, :my_scope_fit, :my_culture, :my_comp,
                :my_score_overall, :is_active)""",
            insert_params
        )
        job_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

        conn.execute(
            "INSERT INTO applications (job_id, application_status) VALUES (?, 'not-started')",
            (job_id,)
        )
        app_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        _audit_application(app_id, "Application auto-created with job", conn=conn)

        return job_id, True


def get_job(job_id: int) -> sqlite3.Row | None:
    """Return a job row with its current application status, or None."""
    with get_connection() as conn:
        return conn.execute(
            """SELECT j.*,
                      a.id AS application_id,
                      a.application_status
               FROM jobs j
               LEFT JOIN applications a ON a.id = (
                   SELECT id FROM applications WHERE job_id = j.id
                   ORDER BY
                       CASE application_status
                           WHEN 'not-started' THEN 0 ELSE 1
                       END DESC,
                       id DESC
                   LIMIT 1
               )
               WHERE j.id = ?""",
            (job_id,)
        ).fetchone()


def get_all_jobs(include_inactive: bool = False) -> list[sqlite3.Row]:
    """Return jobs with their current application status, newest first.

    By default, only active jobs (is_active = 1) are returned. Pass
    include_inactive=True to return all jobs regardless of activation state.
    """
    where = "" if include_inactive else "WHERE j.is_active = 1"
    with get_connection() as conn:
        return conn.execute(
            f"""SELECT j.*,
                      a.id AS application_id,
                      a.application_status
               FROM jobs j
               LEFT JOIN applications a ON a.id = (
                   SELECT id FROM applications WHERE job_id = j.id
                   ORDER BY
                       CASE application_status
                           WHEN 'not-started' THEN 0 ELSE 1
                       END DESC,
                       id DESC
                   LIMIT 1
               )
               {where}
               ORDER BY j.last_seen_date DESC, j.created_at DESC"""
        ).fetchall()


def activate_job(job_id: int) -> None:
    """Set is_active = 1 for a job. Caller verifies job exists before calling."""
    with get_connection() as conn:
        conn.execute(
            "UPDATE jobs SET is_active = 1 WHERE id = ?",
            (job_id,)
        )


def get_jobs_pending_evaluation() -> list[sqlite3.Row]:
    """Return jobs that have no evaluation record yet, newest first."""
    with get_connection() as conn:
        return conn.execute(
            """SELECT * FROM jobs
               WHERE id NOT IN (SELECT DISTINCT job_id FROM evaluations)
               ORDER BY last_seen_date DESC"""
        ).fetchall()


def update_job(job_id: int, **kwargs) -> bool:
    """
    Update job fields. Returns True if the row was updated, False if not found.
    Allowed fields: company_name, title, location, remote_type, description_merged,
    pay_band, role_keyword, excitement_level, my_role_fit, my_scope_fit, my_culture,
    my_comp, my_score_overall, dedup_status, is_repost.
    """
    allowed = {
        "company_name", "title", "location", "remote_type", "description_merged",
        "pay_band", "role_keyword", "excitement_level", "my_role_fit", "my_scope_fit",
        "my_culture", "my_comp", "my_score_overall", "dedup_status", "is_repost",
    }
    updates = {k: v for k, v in kwargs.items() if k in allowed}
    if not updates:
        return False

    with get_connection() as conn:
        existing = conn.execute(
            "SELECT id FROM jobs WHERE id = ?", (job_id,)
        ).fetchone()
        if not existing:
            return False

        set_clause = ", ".join(f"{k} = ?" for k in updates)
        conn.execute(
            f"UPDATE jobs SET {set_clause} WHERE id = ?",
            (*updates.values(), job_id)
        )
        return True


def _update_job_agg_scores(job_id: int, conn: sqlite3.Connection) -> None:
    """
    Recalculate and update jobs.agg_* from all non-failed evaluations for this job.
    Skipped if all evaluations for this job have NULL score_overall.
    Must be called with an open connection (runs within the caller's transaction).
    """
    row = conn.execute(
        """SELECT
               AVG(score_role_fit)  AS role_fit,
               AVG(score_scope_fit) AS scope_fit,
               AVG(score_culture)   AS culture,
               AVG(score_comp)      AS comp,
               AVG(score_overall)   AS overall
           FROM evaluations
           WHERE job_id = ? AND score_overall IS NOT NULL""",
        (job_id,)
    ).fetchone()

    if row["overall"] is None:
        return

    conn.execute(
        """UPDATE jobs SET
               agg_role_fit      = ?,
               agg_scope_fit     = ?,
               agg_culture       = ?,
               agg_comp          = ?,
               agg_score_overall = ?
           WHERE id = ?""",
        (row["role_fit"], row["scope_fit"], row["culture"],
         row["comp"], row["overall"], job_id)
    )


def find_similar_jobs(company_name: str, title: str) -> list[dict]:
    """
    Find jobs matching company name and title (case-insensitive on company_name).
    Used for duplicate detection before evaluation.
    """
    with get_connection() as conn:
        rows = conn.execute(
            """SELECT j.id, j.company_name, j.title, j.first_seen_date,
                      COUNT(e.id) AS eval_count,
                      MAX(e.score_overall) AS latest_score
               FROM jobs j
               LEFT JOIN evaluations e ON e.job_id = j.id
               WHERE LOWER(j.company_name) = LOWER(?) AND j.title = ?
               GROUP BY j.id""",
            (company_name, title)
        ).fetchall()
        return [dict(r) for r in rows]


# ─────────────────────────────────────────────────────────────
# Job Company Log
# ─────────────────────────────────────────────────────────────

def add_job_company_log(
    job_id: int,
    type_id: int,
    log: str | None = None,
    url: str | None = None,
) -> int:
    """
    Add a company detail entry for a job.
    type_id must reference a system_types record with type_name = 'company_info'.
    Returns the new log id.
    """
    with get_connection() as conn:
        conn.execute(
            """INSERT INTO job_company_log (job_id, type_id, log, url)
               VALUES (?, ?, ?, ?)""",
            (job_id, type_id, log, url)
        )
        return conn.execute("SELECT last_insert_rowid()").fetchone()[0]


def get_job_company_log(
    job_id: int,
    type_name: str | None = None
) -> list[sqlite3.Row]:
    """
    Return company log entries for a job, optionally filtered by type_name.
    Joins system_types to expose type_name and type_value on each row.
    """
    with get_connection() as conn:
        if type_name:
            return conn.execute(
                """SELECT jcl.*, st.type_name, st.type_value
                   FROM job_company_log jcl
                   JOIN system_types st ON st.id = jcl.type_id
                   WHERE jcl.job_id = ? AND st.type_name = ?
                   ORDER BY jcl.log_timestamp""",
                (job_id, type_name)
            ).fetchall()
        return conn.execute(
            """SELECT jcl.*, st.type_name, st.type_value
               FROM job_company_log jcl
               JOIN system_types st ON st.id = jcl.type_id
               WHERE jcl.job_id = ?
               ORDER BY jcl.log_timestamp""",
            (job_id,)
        ).fetchall()


# ─────────────────────────────────────────────────────────────
# Job Postings
# ─────────────────────────────────────────────────────────────

def insert_job_posting(job_id: int, **kwargs) -> int:
    """
    Insert a new job posting record. Always inserts — job_postings accumulates all sources.
    Returns the new posting id.
    """
    allowed = [
        "source_board", "source_url", "description_raw", "date_posted",
        "is_repost", "days_since_prior_posting", "repost_url_changed",
    ]
    with get_connection() as conn:
        conn.execute(
            """INSERT INTO job_postings
               (job_id, source_board, source_url, description_raw, date_posted,
                is_repost, days_since_prior_posting, repost_url_changed)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                job_id,
                kwargs.get("source_board"),
                kwargs.get("source_url"),
                kwargs.get("description_raw"),
                kwargs.get("date_posted"),
                kwargs.get("is_repost", 0),
                kwargs.get("days_since_prior_posting"),
                kwargs.get("repost_url_changed", 0),
            )
        )
        posting_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        _audit_job_posting(
            posting_id,
            f"Scraped from {kwargs.get('source_board', 'unknown')}",
            conn=conn
        )
        return posting_id


def get_postings_for_job(job_id: int) -> list[sqlite3.Row]:
    """Return all postings for a job, newest first."""
    with get_connection() as conn:
        return conn.execute(
            "SELECT * FROM job_postings WHERE job_id = ? ORDER BY date_scraped DESC",
            (job_id,)
        ).fetchall()


def _audit_job_posting(
    posting_id: int,
    event: str,
    conn: sqlite3.Connection | None = None,
) -> None:
    """Append an audit event for a job posting. Audit table is append-only."""
    def _run(c: sqlite3.Connection) -> None:
        c.execute(
            "INSERT INTO job_posting_audit (job_posting_id, event) VALUES (?, ?)",
            (posting_id, event)
        )

    if conn:
        _run(conn)
    else:
        with get_connection() as c:
            _run(c)


# ─────────────────────────────────────────────────────────────
# Evaluations
# ─────────────────────────────────────────────────────────────

def insert_evaluation(job_id: int, llm_model_id: int, **kwargs) -> int:
    """
    Insert an evaluation record and recalculate jobs.agg_* scores.
    All score fields are nullable — a failed evaluation is recorded with
    score fields NULL and raw_response preserved in llm_call_log.
    Never silently drops a failed evaluation.

    Returns:
        evaluation id (int)
    """
    score_fields = [
        "score_overall", "score_role_fit", "score_scope_fit",
        "score_culture", "score_comp",
    ]
    text_fields = [
        "fit_type", "archetype", "strengths", "gaps", "recommendation",
        "keywords", "domain_match", "role_type_match", "keyword_gaps",
    ]
    all_fields = score_fields + text_fields + ["llm_call_log_id"]

    with get_connection() as conn:
        conn.execute(
            """INSERT INTO evaluations
               (job_id, llm_model_id, score_overall, score_role_fit, score_scope_fit,
                score_culture, score_comp, fit_type, archetype, strengths, gaps,
                recommendation, keywords, domain_match, role_type_match, keyword_gaps,
                llm_call_log_id)
               VALUES
               (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                job_id, llm_model_id,
                *(kwargs.get(f) for f in all_fields)
            )
        )
        eval_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        _update_job_agg_scores(job_id, conn)
        return eval_id


def get_evaluations_for_job(job_id: int) -> list[sqlite3.Row]:
    """Return all evaluations for a job with model name, newest first."""
    with get_connection() as conn:
        return conn.execute(
            """SELECT e.*, m.model AS model_name
               FROM evaluations e
               JOIN llm_models m ON m.id = e.llm_model_id
               WHERE e.job_id = ?
               ORDER BY e.evaluated_at DESC, e.id DESC""",
            (job_id,)
        ).fetchall()


def get_latest_evaluation(job_id: int) -> sqlite3.Row | None:
    """Return the most recent evaluation for a job, or None."""
    with get_connection() as conn:
        return conn.execute(
            """SELECT e.*, m.model AS model_name
               FROM evaluations e
               JOIN llm_models m ON m.id = e.llm_model_id
               WHERE e.job_id = ?
               ORDER BY e.evaluated_at DESC, e.id DESC
               LIMIT 1""",
            (job_id,)
        ).fetchone()


# ─────────────────────────────────────────────────────────────
# LLM Call Log
# ─────────────────────────────────────────────────────────────

def insert_llm_call_log(
    llm_model_id: int | None,
    call_type: str,
    *,
    prompt: str | None = None,
    prompt_hash: str | None = None,
    raw_response: str | None = None,
    prompt_tokens_estimated: int | None = None,
    prompt_tokens_actual: int | None = None,
    completion_tokens_actual: int | None = None,
    total_tokens_actual: int | None = None,
    latency_ms: int | None = None,
    call_time: int | None = None,
    success: int = 1,
    error_message: str | None = None,
    job_id: int | None = None,
    search_run_id: int | None = None,
) -> int:
    """
    Insert an LLM call log record. Returns the new log id.
    Never log API keys or PII — only prompt text and raw responses.
    """
    with get_connection() as conn:
        conn.execute(
            """INSERT INTO llm_call_log
               (llm_model_id, call_type, prompt, prompt_hash, raw_response,
                prompt_tokens_estimated, prompt_tokens_actual,
                completion_tokens_actual, total_tokens_actual,
                latency_ms, call_time, success, error_message,
                job_id, search_run_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                llm_model_id, call_type, prompt, prompt_hash, raw_response,
                prompt_tokens_estimated, prompt_tokens_actual,
                completion_tokens_actual, total_tokens_actual,
                latency_ms, call_time, success, error_message,
                job_id, search_run_id,
            )
        )
        return conn.execute("SELECT last_insert_rowid()").fetchone()[0]


def get_llm_call_log(
    limit: int = 100,
    job_id: int | None = None,
    call_type: str | None = None,
) -> list[sqlite3.Row]:
    """Return LLM call log entries, newest first. Optionally filtered by job_id or call_type."""
    with get_connection() as conn:
        conditions: list[str] = []
        params: list = []

        if job_id is not None:
            conditions.append("l.job_id = ?")
            params.append(job_id)
        if call_type is not None:
            conditions.append("l.call_type = ?")
            params.append(call_type)

        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        params.append(limit)

        return conn.execute(
            f"""SELECT l.*, m.model AS model_name,
                       j.company_name AS job_company_name, j.title AS job_title
                FROM llm_call_log l
                LEFT JOIN llm_models m ON m.id = l.llm_model_id
                LEFT JOIN jobs j ON j.id = l.job_id
                {where}
                ORDER BY l.timestamp DESC, l.id DESC
                LIMIT ?""",
            params
        ).fetchall()


def get_llm_call_log_entry(log_id: int) -> sqlite3.Row | None:
    """Return a single LLM call log entry by id, or None."""
    with get_connection() as conn:
        return conn.execute(
            """SELECT l.*, m.model AS model_name,
                      j.company_name AS job_company_name, j.title AS job_title
               FROM llm_call_log l
               LEFT JOIN llm_models m ON m.id = l.llm_model_id
               LEFT JOIN jobs j ON j.id = l.job_id
               WHERE l.id = ?""",
            (log_id,)
        ).fetchone()


# ─────────────────────────────────────────────────────────────
# Applications
# ─────────────────────────────────────────────────────────────

def get_application(application_id: int) -> sqlite3.Row | None:
    """Return a single application with job info, or None."""
    with get_connection() as conn:
        return conn.execute(
            """SELECT a.*, j.company_name, j.title, j.location, j.remote_type
               FROM applications a
               JOIN jobs j ON j.id = a.job_id
               WHERE a.id = ?""",
            (application_id,)
        ).fetchone()


def get_application_for_job(job_id: int) -> sqlite3.Row | None:
    """
    Return the active application for a job (most recently updated non-not-started,
    falling back to the not-started record). Returns None if no application exists.
    """
    with get_connection() as conn:
        active = conn.execute(
            """SELECT * FROM applications
               WHERE job_id = ? AND application_status != 'not-started'
               ORDER BY id DESC LIMIT 1""",
            (job_id,)
        ).fetchone()
        if active:
            return active
        return conn.execute(
            "SELECT * FROM applications WHERE job_id = ? ORDER BY id DESC LIMIT 1",
            (job_id,)
        ).fetchone()


def get_all_applications(exclude_not_started: bool = True) -> list[sqlite3.Row]:
    """Return applications with job info, newest first. Excludes not-started by default."""
    with get_connection() as conn:
        if exclude_not_started:
            return conn.execute(
                """SELECT a.*, j.company_name, j.title, j.location, j.remote_type,
                          j.agg_score_overall, j.excitement_level
                   FROM applications a
                   JOIN jobs j ON j.id = a.job_id
                   WHERE a.application_status != 'not-started'
                   ORDER BY a.apply_date DESC, a.id DESC"""
            ).fetchall()
        return conn.execute(
            """SELECT a.*, j.company_name, j.title, j.location, j.remote_type,
                      j.agg_score_overall, j.excitement_level
               FROM applications a
               JOIN jobs j ON j.id = a.job_id
               ORDER BY a.apply_date DESC, a.id DESC"""
        ).fetchall()


def update_application_status(application_id: int, status: str) -> None:
    """Update application status and write an audit event."""
    with get_connection() as conn:
        conn.execute(
            "UPDATE applications SET application_status = ? WHERE id = ?",
            (status, application_id)
        )
        _audit_application(application_id, f"Status updated to: {status}", conn=conn)


def update_application(application_id: int, **kwargs) -> bool:
    """
    Update application fields (apply_date, end_date, requested_salary, applied).
    For status changes use update_application_status (writes audit trail).
    Returns True if updated, False if not found.
    """
    allowed = {"apply_date", "end_date", "requested_salary", "applied"}
    updates = {k: v for k, v in kwargs.items() if k in allowed}
    if not updates:
        return False

    with get_connection() as conn:
        existing = conn.execute(
            "SELECT id FROM applications WHERE id = ?", (application_id,)
        ).fetchone()
        if not existing:
            return False

        set_clause = ", ".join(f"{k} = ?" for k in updates)
        conn.execute(
            f"UPDATE applications SET {set_clause} WHERE id = ?",
            (*updates.values(), application_id)
        )
        return True


# ─────────────────────────────────────────────────────────────
# Application Logs
# ─────────────────────────────────────────────────────────────

def add_application_log(
    application_id: int,
    type_id: int,
    *,
    log: str | None = None,
    url: str | None = None,
    log_timestamp: str | None = None,
    llm_call_log_id: int | None = None,
) -> int:
    """
    Add a timestamped log entry to an application.
    type_id must reference a system_types record with type_name = 'application_log'.
    Returns the new log id.
    """
    with get_connection() as conn:
        conn.execute(
            """INSERT INTO application_logs
               (application_id, type_id, log, url, log_timestamp, llm_call_log_id)
               VALUES (?, ?, ?, ?, COALESCE(?, datetime('now')), ?)""",
            (application_id, type_id, log, url, log_timestamp, llm_call_log_id)
        )
        return conn.execute("SELECT last_insert_rowid()").fetchone()[0]


def get_application_logs(application_id: int) -> list[sqlite3.Row]:
    """Return all log entries for an application with type info, oldest first."""
    with get_connection() as conn:
        return conn.execute(
            """SELECT al.*, st.type_name, st.type_value
               FROM application_logs al
               JOIN system_types st ON st.id = al.type_id
               WHERE al.application_id = ?
               ORDER BY al.log_timestamp""",
            (application_id,)
        ).fetchall()


def get_application_logs_for_insights(type_values: list[str]) -> list[sqlite3.Row]:
    """
    Return all application_logs matching any of the given type_values, newest first.
    Joins to jobs to include company_name and title for prompt context.
    Used by the synthesize-insights profile route.
    """
    if not type_values:
        return []
    placeholders = ",".join("?" * len(type_values))
    with get_connection() as conn:
        return conn.execute(
            f"""SELECT al.*, st.type_value, j.company_name, j.title
                FROM application_logs al
                JOIN system_types st ON st.id = al.type_id
                JOIN applications ap ON ap.id = al.application_id
                JOIN jobs j ON j.id = ap.job_id
                WHERE st.type_name = 'application_log'
                  AND st.type_value IN ({placeholders})
                ORDER BY al.log_timestamp DESC""",
            type_values,
        ).fetchall()


def delete_application_log(log_id: int) -> bool:
    """Delete a single application log entry. Returns True if deleted, False if not found."""
    with get_connection() as conn:
        conn.execute("DELETE FROM application_logs WHERE id = ?", (log_id,))
        return conn.total_changes > 0


# ─────────────────────────────────────────────────────────────
# Application Documents
# ─────────────────────────────────────────────────────────────

def insert_application_document(
    application_id: int,
    type_id: int,
    file_path: str,
) -> int:
    """
    Insert an application document record.
    type_id must reference system_types (type_name = 'application_document').
    file_path is stored as-is — caller is responsible for sanitization.
    Returns the new document id.
    """
    with get_connection() as conn:
        conn.execute(
            """INSERT INTO application_documents (application_id, type_id, file_path)
               VALUES (?, ?, ?)""",
            (application_id, type_id, file_path)
        )
        return conn.execute("SELECT last_insert_rowid()").fetchone()[0]


def get_application_documents(application_id: int) -> list[sqlite3.Row]:
    """Return all document records for an application with type info."""
    with get_connection() as conn:
        return conn.execute(
            """SELECT ad.*, st.type_name, st.type_value
               FROM application_documents ad
               JOIN system_types st ON st.id = ad.type_id
               WHERE ad.application_id = ?
               ORDER BY ad.created_at""",
            (application_id,)
        ).fetchall()


def delete_application_document(doc_id: int) -> bool:
    """Delete an application document record. Returns True if deleted, False if not found."""
    with get_connection() as conn:
        conn.execute("DELETE FROM application_documents WHERE id = ?", (doc_id,))
        return conn.total_changes > 0


# ─────────────────────────────────────────────────────────────
# Application Audit (append-only)
# ─────────────────────────────────────────────────────────────

def _audit_application(
    application_id: int,
    event: str,
    conn: sqlite3.Connection | None = None,
) -> None:
    """Append an audit event for an application. This table is NEVER updated or deleted."""
    def _run(c: sqlite3.Connection) -> None:
        c.execute(
            "INSERT INTO application_audit (application_id, event) VALUES (?, ?)",
            (application_id, event)
        )

    if conn:
        _run(conn)
    else:
        with get_connection() as c:
            _run(c)


def get_application_audit(application_id: int) -> list[sqlite3.Row]:
    """Return the full audit trail for an application, oldest first."""
    with get_connection() as conn:
        return conn.execute(
            """SELECT * FROM application_audit
               WHERE application_id = ?
               ORDER BY timestamp""",
            (application_id,)
        ).fetchall()


def update_log_timestamp(log_id: int, timestamp: str) -> bool:
    """Update the log_timestamp on an application_logs entry. Returns False if not found."""
    with get_connection() as conn:
        cursor = conn.execute(
            "UPDATE application_logs SET log_timestamp = ? WHERE id = ?",
            (timestamp, log_id),
        )
        return cursor.rowcount > 0


def update_audit_timestamp(audit_id: int, timestamp: str) -> bool:
    """
    Update the timestamp on an application_audit entry.
    Only called when the allow_audit_timestamp_edit setting is enabled.
    Returns False if not found.
    """
    with get_connection() as conn:
        cursor = conn.execute(
            "UPDATE application_audit SET timestamp = ? WHERE id = ?",
            (timestamp, audit_id),
        )
        return cursor.rowcount > 0


# ─────────────────────────────────────────────────────────────
# jobsearch.md version history
# ─────────────────────────────────────────────────────────────

# ─────────────────────────────────────────────────────────────
# App settings
# ─────────────────────────────────────────────────────────────

def get_app_setting(key: str) -> str | None:
    """Return the value for a single app_settings key, or None if not found."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT value FROM app_settings WHERE key = ?", (key,)
        ).fetchone()
        return row["value"] if row else None


def set_app_setting(key: str, value: str) -> None:
    """Upsert a single app_settings record."""
    with get_connection() as conn:
        existing = conn.execute(
            "SELECT id FROM app_settings WHERE key = ?", (key,)
        ).fetchone()
        if existing:
            conn.execute(
                "UPDATE app_settings SET value = ? WHERE key = ?", (value, key)
            )
        else:
            conn.execute(
                "INSERT INTO app_settings (key, value) VALUES (?, ?)", (key, value)
            )


def get_all_app_settings() -> list[dict]:
    """Return all app_settings rows as plain dicts."""
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, key, value, created_at FROM app_settings ORDER BY key"
        ).fetchall()
        return [dict(r) for r in rows]


# ─────────────────────────────────────────────────────────────
# Evaluation queries — list + single-record
# ─────────────────────────────────────────────────────────────

def get_all_evaluations(limit: int = 500) -> list[sqlite3.Row]:
    """
    Return all evaluations with job title, company_name, location, remote_type.
    Sorted newest first. Used by GET /api/v1/evaluations.
    """
    with get_connection() as conn:
        return conn.execute(
            """SELECT e.*,
                      j.title,
                      j.company_name,
                      j.location,
                      j.remote_type,
                      m.model AS model_name
               FROM evaluations e
               JOIN jobs j       ON j.id = e.job_id
               JOIN llm_models m ON m.id = e.llm_model_id
               ORDER BY e.evaluated_at DESC, e.id DESC
               LIMIT ?""",
            (limit,)
        ).fetchall()


def get_evaluation(eval_id: int) -> sqlite3.Row | None:
    """
    Return a single evaluation with job and model info, or None.
    Used by GET /api/v1/evaluations/{id}.
    """
    with get_connection() as conn:
        return conn.execute(
            """SELECT e.*,
                      j.title,
                      j.company_name,
                      j.location,
                      j.remote_type,
                      j.pay_band,
                      m.model AS model_name
               FROM evaluations e
               JOIN jobs j       ON j.id = e.job_id
               JOIN llm_models m ON m.id = e.llm_model_id
               WHERE e.id = ?""",
            (eval_id,)
        ).fetchone()


# ─────────────────────────────────────────────────────────────
# Dashboard stats
# ─────────────────────────────────────────────────────────────

def get_stats() -> dict:
    """Return summary counts for the dashboard."""
    with get_connection() as conn:
        jobs = conn.execute("SELECT COUNT(*) FROM jobs WHERE is_active = 1").fetchone()[0]
        evals = conn.execute("SELECT COUNT(*) FROM evaluations").fetchone()[0]
        apps = conn.execute(
            "SELECT COUNT(*) FROM applications WHERE application_status != 'not-started'"
        ).fetchone()[0]
        llm_calls = conn.execute("SELECT COUNT(*) FROM llm_call_log").fetchone()[0]
    return {
        "jobs": jobs,
        "evaluations": evals,
        "applications": apps,
        "llm_calls": llm_calls,
    }


# ─────────────────────────────────────────────────────────────
# Utilities
# ─────────────────────────────────────────────────────────────

def compute_sha256(content: str) -> str:
    """SHA-256 hash of a string. Used for prompt_hash and source_resume. Never use MD5."""
    return hashlib.sha256(content.encode()).hexdigest()


_EXPORT_TABLES = [
    "system_types", "llm_servers", "llm_models", "jobs", "job_company_log", "job_postings",
    "evaluations", "llm_call_log", "applications", "application_logs",
    "application_documents", "application_audit", "job_posting_audit",
    "jobsearch_versions", "resume_info", "search_runs", "search_run_errors",
    "chat_sessions", "chat_messages", "projects",
    "schema_versions", "schema_migrations",
]

EXPORT_FORMAT_VERSION = "1.0"


def export_db(output_path: str | Path | None = None) -> dict:
    """
    Export all database tables to a structured dictionary.
    Includes jobsearch.md content as a first-class artifact.
    Returns the export dict; also writes to file if output_path is provided.
    """
    jobsearch_content = None
    jobsearch_path = Path("jobsearch.md")
    if jobsearch_path.exists():
        jobsearch_content = jobsearch_path.read_text()

    export_data: dict = {
        "schema_version": get_schema_version(),
        "export_format_version": EXPORT_FORMAT_VERSION,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "jobsearch_md": jobsearch_content,
        "tables": {},
    }

    with get_connection() as conn:
        for table in _EXPORT_TABLES:
            try:
                rows = conn.execute(f"SELECT * FROM {table}").fetchall()
                export_data["tables"][table] = [dict(row) for row in rows]
            except sqlite3.OperationalError:
                export_data["tables"][table] = []

    if output_path:
        out = Path(output_path)
        out.parent.mkdir(parents=True, exist_ok=True)
        with open(out, "w") as f:
            json.dump(export_data, f, indent=2, default=str)
        print(f"Export written to {out}")

    return export_data


def backup_db() -> Path:
    """
    Create a timestamped backup of the raw SQLite database file.
    Returns the path to the backup file.
    """
    db_path = _get_db_path()
    config = _load_config()
    backup_dir = Path(
        config.get("database", {}).get("backup_dir", "./data/backups")
    )
    backup_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup_path = backup_dir / f"jobs_{timestamp}.db"
    shutil.copy2(db_path, backup_path)

    print(f"Database backed up to {backup_path}")
    return backup_path


def check_file_integrity() -> list[dict]:
    """
    Validate all stored file paths in application_documents.
    Returns a list of broken-link records for display in Settings UI.
    """
    broken: list[dict] = []
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, file_path FROM application_documents"
        ).fetchall()
        for row in rows:
            if not Path(row["file_path"]).exists():
                broken.append({
                    "table": "application_documents",
                    "record_id": row["id"],
                    "field": "file_path",
                    "path": row["file_path"],
                })
    return broken


# ─────────────────────────────────────────────────────────────
# Job Search Profile Utilities
# ─────────────────────────────────────────────────────────────

# Keys are lowercase partial matches against section header text.
# Values are the stable section IDs used in API routes and frontend state.
SECTION_ID_MAP: dict[str, str] = {
    "who i am": "who_i_am",
    "career narrative": "career_narrative",
    "career history": "career_history",
    "skills": "skills_strengths",
    "target role": "target_role",
    "resume master": "resume_master",
    "tailoring rules": "tailoring_rules",
    "insights": "insights_lessons",
    "model behavior": "model_behavior",
}

_KNOWN_SECTION_IDS: frozenset[str] = frozenset(SECTION_ID_MAP.values())


def _header_to_section_id(header_line: str) -> str | None:
    """Map a '## N. Section Name' header to a section ID, or None if unrecognized."""
    text = re.sub(r"^##\s+\d+\.\s*", "", header_line).strip().lower()
    for key, section_id in SECTION_ID_MAP.items():
        if key in text:
            return section_id
    return None


def parse_jobsearch_sections(content: str) -> dict[str, str]:
    """
    Parse jobsearch.md content into a dict keyed by section ID.

    All 9 known section IDs are present in the result; missing sections get "".
    Values contain all body text under the ## header — the header line is excluded.
    Handles both old and new section numbering via partial-match on header text.
    """
    result: dict[str, str] = {sid: "" for sid in _KNOWN_SECTION_IDS}
    parts = re.split(r"(?m)^(?=## )", content)
    for part in parts:
        if not part.startswith("## "):
            continue
        header_line, _, body = part.partition("\n")
        section_id = _header_to_section_id(header_line)
        if section_id:
            result[section_id] = body
    return result


def rebuild_jobsearch_from_sections(
    sections: dict[str, str], original_content: str
) -> str:
    """
    Rebuild jobsearch.md by replacing section bodies for IDs present in `sections`.

    Preserves the original ## header lines, any preamble before the first ## header,
    section separators (---), and bodies for sections not present in `sections`.
    """
    parts = re.split(r"(?m)^(?=## )", original_content)
    rebuilt: list[str] = []
    for part in parts:
        if not part.startswith("## "):
            rebuilt.append(part)
            continue
        header_line, _, old_body = part.partition("\n")
        section_id = _header_to_section_id(header_line)
        if section_id and section_id in sections:
            new_body = sections[section_id]
            if new_body and not new_body.endswith("\n"):
                new_body += "\n"
            rebuilt.append(header_line + "\n" + new_body)
        else:
            rebuilt.append(part)
    return "".join(rebuilt)


def is_section_complete(section_content: str) -> bool:
    """Returns True if section has no [FILL] markers and has substantive content (>50 chars)."""
    stripped = section_content.strip()
    return "[FILL" not in stripped and len(stripped) > 50


# ─────────────────────────────────────────────────────────────
# Entrypoint — run directly to initialize the database
# ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    init_db()
    print(f"\nDatabase location: {_get_db_path().resolve()}")
