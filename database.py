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

Schema version: 1.7
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
    config_path = Path("user_data/config.yaml")
    if config_path.exists():
        with open(config_path) as f:
            return yaml.safe_load(f) or {}
    return {}


def _get_db_path() -> Path:
    config = _load_config()
    return Path(config.get("database", {}).get("db_path", "./app_data/data/jobs.db"))


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
    server_type TEXT NOT NULL DEFAULT 'ollama',
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

CREATE TABLE IF NOT EXISTS application_questions (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL REFERENCES applications(id),
    question       TEXT NOT NULL,
    response       TEXT,
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (application_id) REFERENCES applications(id)
);

CREATE TABLE IF NOT EXISTS application_audit (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL REFERENCES applications(id),
    job_id         INTEGER,
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

CREATE TABLE IF NOT EXISTS prompts (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    prompt_key       TEXT NOT NULL,
    label            TEXT,
    version          INTEGER NOT NULL DEFAULT 1,
    segments_text    TEXT NOT NULL,
    preview_context  TEXT,
    saved_at         TEXT NOT NULL DEFAULT (datetime('now')),
    note             TEXT,
    is_active        INTEGER NOT NULL DEFAULT 0,
    temperature      REAL NOT NULL DEFAULT 0.0
);

CREATE TABLE IF NOT EXISTS prompt_usage (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    prompt_key      TEXT NOT NULL,
    prompt_version  INTEGER NOT NULL,
    prompt_text     TEXT NOT NULL,
    prompt_hash     TEXT NOT NULL,
    source          TEXT NOT NULL DEFAULT 'internal',
    job_id          INTEGER,
    generated_at    TEXT NOT NULL DEFAULT (datetime('now')),
    agree           INTEGER,
    dimension       TEXT,
    feedback_text   TEXT,
    is_consumed     INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (job_id) REFERENCES jobs(id)
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

-- ─────────────────────────────────────────
-- Company research — ACTIVE PHASE 2.5
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_research (
    id                       INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id                   INTEGER NOT NULL REFERENCES jobs(id),
    raw_json                 TEXT,
    research_summary         TEXT,
    company_overview         TEXT,
    company_stage            TEXT,
    company_size_actual      TEXT,
    company_trajectory       TEXT,
    company_culture_overview TEXT,
    culture_signals          TEXT,
    comp_signals             TEXT,
    role_context             TEXT,
    interview_process        TEXT,
    red_flags                TEXT,
    green_flags              TEXT,
    research_confidence      TEXT,
    research_notes           TEXT,
    imported_at              TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_jobs_company_name       ON jobs(company_name);
CREATE INDEX IF NOT EXISTS idx_evaluations_job_id      ON evaluations(job_id);
CREATE INDEX IF NOT EXISTS idx_applications_job_id     ON applications(job_id);
CREATE INDEX IF NOT EXISTS idx_llm_call_log_job_id     ON llm_call_log(job_id);
CREATE INDEX IF NOT EXISTS idx_app_logs_app_id         ON application_logs(application_id);
CREATE INDEX IF NOT EXISTS idx_job_company_log_job_id  ON job_company_log(job_id);
CREATE INDEX IF NOT EXISTS idx_llm_models_server_id    ON llm_models(server_id);
CREATE INDEX IF NOT EXISTS idx_job_research_job_id     ON job_research(job_id);
"""

CURRENT_SCHEMA_VERSION = "2.5"

_APP_SETTINGS_SEED: list[tuple[str, str]] = [
    ("allow_audit_timestamp_edit", "0"),
    ("eval_weight_screenability", "0.40"),
    ("eval_weight_company_fit", "0.30"),
    ("eval_weight_candidate_fit", "0.30"),
]

_SYSTEM_TYPES_SEED: list[tuple[str, str]] = [
    ("application_log", "compensation"),
    ("application_log", "general"),
    ("application_log", "prompt"),
    ("application_log", "prompt_eval"),
    ("application_log", "prompt_resume"),
    ("application_log", "prompt_cover"),
    ("application_log", "lesson_learned"),
    ("application_log", "recruiter_outreach"),
    ("application_log", "phone_screen"),
    ("application_log", "onsite_interview"),
    ("application_log", "offer_received"),
    ("application_log", "rejection_received"),
    ("application_log", "withdrawal"),
    ("application_log", "application_communication"),
    ("application_log", "status_change"),
    ("application_log", "feedback"),
    ("application_log", "email_comms"),
    ("application_log", "phone_comms"),
    ("application_log", "offer"),
    ("application_log", "rejection"),
    ("company_info", "website"),
    ("company_info", "careerpage"),
    ("company_info", "culturepage"),
    ("company_info", "industry"),
    ("company_info", "size"),
    ("company_info", "notes"),
    ("company_info", "person"),
    ("company_info", "summary"),
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

        try:
            conn.execute(
                "ALTER TABLE application_documents ADD COLUMN is_final INTEGER NOT NULL DEFAULT 0"
            )
        except sqlite3.OperationalError:
            pass  # column already exists

        try:
            conn.execute(
                "ALTER TABLE llm_call_log ADD COLUMN prompt_usage_id INTEGER"
            )
        except sqlite3.OperationalError:
            pass  # column already exists

        # Backfill prompt_usage from existing llm_call_log evaluation rows.
        # Guard: only runs if the prompt column still exists (idempotent across restarts).
        col_names = {row["name"] for row in conn.execute("PRAGMA table_info(llm_call_log)").fetchall()}
        if "prompt" in col_names:
            eval_rows = conn.execute(
                """SELECT id, prompt, prompt_hash, job_id FROM llm_call_log
                   WHERE call_type = 'evaluation'
                     AND prompt_usage_id IS NULL
                     AND prompt IS NOT NULL"""
            ).fetchall()
            for row in eval_rows:
                ph = row["prompt_hash"] or hashlib.sha256(row["prompt"].encode()).hexdigest()
                conn.execute(
                    """INSERT INTO prompt_usage
                       (prompt_key, prompt_version, prompt_text, prompt_hash, source, job_id)
                       VALUES ('eval_internal', 1, ?, ?, 'internal', ?)""",
                    (row["prompt"], ph, row["job_id"])
                )
                usage_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
                conn.execute(
                    "UPDATE llm_call_log SET prompt_usage_id = ? WHERE id = ?",
                    (usage_id, row["id"])
                )

        try:
            conn.execute("ALTER TABLE llm_call_log DROP COLUMN prompt")
        except sqlite3.OperationalError:
            pass  # column already dropped

        try:
            conn.execute("ALTER TABLE llm_call_log DROP COLUMN prompt_hash")
        except sqlite3.OperationalError:
            pass  # column already dropped

        try:
            conn.execute("ALTER TABLE evaluations ADD COLUMN analysis_json TEXT")
        except sqlite3.OperationalError:
            pass  # column already exists

        # Phase 2.5 — 9-dim scoring columns
        for _col in (
            "ALTER TABLE evaluations ADD COLUMN score_ats INTEGER",
            "ALTER TABLE evaluations ADD COLUMN score_recruiter_fast INTEGER",
            "ALTER TABLE evaluations ADD COLUMN score_recruiter_deep INTEGER",
            "ALTER TABLE evaluations ADD COLUMN score_candidate_role INTEGER",
            "ALTER TABLE evaluations ADD COLUMN score_candidate_scope INTEGER",
            "ALTER TABLE evaluations ADD COLUMN score_candidate_culture INTEGER",
            "ALTER TABLE evaluations ADD COLUMN interview_prep_notes TEXT",
            "ALTER TABLE evaluations ADD COLUMN score_reasons TEXT",
            "ALTER TABLE evaluations ADD COLUMN research_confidence TEXT",
            "ALTER TABLE evaluations ADD COLUMN composite_screenability REAL",
            "ALTER TABLE evaluations ADD COLUMN composite_company_fit REAL",
            "ALTER TABLE evaluations ADD COLUMN composite_candidate_fit REAL",
        ):
            try:
                conn.execute(_col)
            except sqlite3.OperationalError:
                pass  # column already exists

        # Phase 2.5 — delete retired prompt keys
        conn.execute("DELETE FROM prompts WHERE prompt_key = 'gen_orgsummary'")
        conn.execute("DELETE FROM prompts WHERE prompt_key IN ('eval_analysis', 'eval_scoring')")

        try:
            conn.execute("ALTER TABLE jobs ADD COLUMN website_url TEXT")
        except sqlite3.OperationalError:
            pass  # column already exists

        try:
            conn.execute(
                "ALTER TABLE prompts ADD COLUMN temperature REAL NOT NULL DEFAULT 0.0"
            )
        except sqlite3.OperationalError:
            pass  # column already exists

        conn.execute(
            "UPDATE llm_servers SET server_type = 'ollama' WHERE server_type = 'local'"
        )

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
                (CURRENT_SCHEMA_VERSION, "Schema v2.5 — evaluations 9-dim columns; job_research table; eval weight app_settings seeds; gen_orgsummary retired")
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

def save_jobsearch_version(content: str, note: str | None = None) -> int:
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


def model_has_evaluations(model_id: int) -> bool:
    """Return True if any evaluation references this model."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT 1 FROM evaluations WHERE llm_model_id = ? LIMIT 1",
            (model_id,)
        ).fetchone()
        return row is not None


def delete_llm_model(model_id: int) -> bool:
    """
    Delete an LLM model. Returns True if deleted, False if not found.
    Caller must check model_has_evaluations() first; FK will block if evaluations exist.
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
            "INSERT INTO llm_servers (server_name, endpoint, server_type) VALUES (?, ?, 'ollama')",
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

        conn.execute(
            "INSERT INTO application_audit (application_id, job_id, event) VALUES (?, ?, ?)",
            (app_id, job_id, f"Job created — {company_name} — {title}")
        )
        description_merged = insert_params.get("description_merged")
        if description_merged:
            conn.execute(
                "INSERT INTO application_audit (application_id, job_id, event) VALUES (?, ?, ?)",
                (app_id, job_id, "Job description attached")
            )

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


def get_eval_counts() -> dict[int, int]:
    """Return a mapping of job_id → evaluation count for all jobs."""
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT job_id, COUNT(*) FROM evaluations GROUP BY job_id"
        ).fetchall()
    return {row[0]: row[1] for row in rows}


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
        "website_url",
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


def upsert_company_summary(job_id: int, text: str) -> None:
    """
    Insert or update the single 'summary' company log entry for a job.
    Uses explicit SELECT + INSERT/UPDATE — never INSERT OR REPLACE.
    """
    with get_connection() as conn:
        type_row = conn.execute(
            "SELECT id FROM system_types WHERE type_name = 'company_info' AND type_value = 'summary'"
        ).fetchone()
        if not type_row:
            raise ValueError("system_types seed missing: company_info/summary")
        type_id = type_row["id"]

        existing = conn.execute(
            """SELECT jcl.id FROM job_company_log jcl
               WHERE jcl.job_id = ? AND jcl.type_id = ?""",
            (job_id, type_id)
        ).fetchone()

        if existing:
            conn.execute(
                "UPDATE job_company_log SET log = ? WHERE id = ?",
                (text, existing["id"])
            )
        else:
            conn.execute(
                "INSERT INTO job_company_log (job_id, type_id, log) VALUES (?, ?, ?)",
                (job_id, type_id, text)
            )


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
        "score_ats", "score_recruiter_fast", "score_recruiter_deep",
        "score_candidate_role", "score_candidate_scope", "score_candidate_culture",
        "composite_screenability", "composite_company_fit", "composite_candidate_fit",
    ]
    text_fields = [
        "fit_type", "archetype", "strengths", "gaps", "recommendation",
        "keywords", "domain_match", "role_type_match", "keyword_gaps",
        "interview_prep_notes", "score_reasons", "research_confidence",
    ]
    all_fields = score_fields + text_fields + ["llm_call_log_id", "analysis_json"]

    with get_connection() as conn:
        conn.execute(
            """INSERT INTO evaluations
               (job_id, llm_model_id, score_overall, score_role_fit, score_scope_fit,
                score_culture, score_comp,
                score_ats, score_recruiter_fast, score_recruiter_deep,
                score_candidate_role, score_candidate_scope, score_candidate_culture,
                composite_screenability, composite_company_fit, composite_candidate_fit,
                fit_type, archetype, strengths, gaps,
                recommendation, keywords, domain_match, role_type_match, keyword_gaps,
                interview_prep_notes, score_reasons, research_confidence,
                llm_call_log_id, analysis_json)
               VALUES
               (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                job_id, llm_model_id,
                *(kwargs.get(f) for f in all_fields)
            )
        )
        eval_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        _update_job_agg_scores(job_id, conn)
        return eval_id


def get_evaluations_for_job(job_id: int) -> list[sqlite3.Row]:
    """Return all evaluations for a job with model name, prompt metadata, newest first."""
    with get_connection() as conn:
        return conn.execute(
            """SELECT e.*, m.model AS model_name,
                      pu.prompt_version AS prompt_version,
                      CASE WHEN e.llm_call_log_id IS NULL THEN 'external' ELSE 'local' END AS eval_source,
                      p.temperature AS temperature
               FROM evaluations e
               JOIN llm_models m ON m.id = e.llm_model_id
               LEFT JOIN llm_call_log l  ON l.id  = e.llm_call_log_id
               LEFT JOIN prompt_usage pu ON pu.id = l.prompt_usage_id
               LEFT JOIN prompts p       ON p.prompt_key = pu.prompt_key
                                        AND p.version    = pu.prompt_version
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
    prompt_usage_id: int | None = None,
) -> int:
    """
    Insert an LLM call log record. Returns the new log id.
    Prompt text is stored in prompt_usage (linked via prompt_usage_id), not here.
    """
    with get_connection() as conn:
        conn.execute(
            """INSERT INTO llm_call_log
               (llm_model_id, call_type, raw_response,
                prompt_tokens_estimated, prompt_tokens_actual,
                completion_tokens_actual, total_tokens_actual,
                latency_ms, call_time, success, error_message,
                job_id, search_run_id, prompt_usage_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                llm_model_id, call_type, raw_response,
                prompt_tokens_estimated, prompt_tokens_actual,
                completion_tokens_actual, total_tokens_actual,
                latency_ms, call_time, success, error_message,
                job_id, search_run_id, prompt_usage_id,
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


def get_earliest_application_for_job(job_id: int) -> int | None:
    """Return the id of the earliest application for a job, or None."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT id FROM applications WHERE job_id = ? ORDER BY id ASC LIMIT 1",
            (job_id,)
        ).fetchone()
    return row["id"] if row else None


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


def get_document_by_id(doc_id: int) -> sqlite3.Row | None:
    """Return a single application_document with type info joined, or None."""
    with get_connection() as conn:
        return conn.execute(
            """SELECT ad.*, st.type_name, st.type_value
               FROM application_documents ad
               JOIN system_types st ON st.id = ad.type_id
               WHERE ad.id = ?""",
            (doc_id,)
        ).fetchone()


def get_document_by_file_path(application_id: int, file_path: str) -> sqlite3.Row | None:
    """Return a document matching application_id + file_path, or None.
    Used by compile route to find an existing DRAFT PDF before replacing it."""
    with get_connection() as conn:
        return conn.execute(
            "SELECT * FROM application_documents WHERE application_id = ? AND file_path = ?",
            (application_id, file_path)
        ).fetchone()


def set_document_final(doc_id: int, application_id: int, type_id: int) -> None:
    """Mark doc_id as final; clear is_final on all other docs of same type for this application.
    Enforces the one-final-per-type-per-application constraint."""
    with get_connection() as conn:
        conn.execute(
            "UPDATE application_documents SET is_final = 0 WHERE application_id = ? AND type_id = ? AND id != ?",
            (application_id, type_id, doc_id)
        )
        conn.execute(
            "UPDATE application_documents SET is_final = 1 WHERE id = ?",
            (doc_id,)
        )


def rename_application_document(doc_id: int, new_file_path: str) -> None:
    """Update the file_path for a document record. Caller is responsible for
    the actual filesystem rename and collision checks."""
    with get_connection() as conn:
        conn.execute(
            "UPDATE application_documents SET file_path = ? WHERE id = ?",
            (new_file_path, doc_id)
        )


# ─────────────────────────────────────────────────────────────
# Application Questions
# ─────────────────────────────────────────────────────────────

def get_application_questions(application_id: int) -> list[sqlite3.Row]:
    """Return all Q&A entries for an application, newest first."""
    with get_connection() as conn:
        return conn.execute(
            """SELECT * FROM application_questions
               WHERE application_id = ?
               ORDER BY created_at DESC""",
            (application_id,)
        ).fetchall()


def create_application_question(
    application_id: int, question: str, response: str | None
) -> int:
    """Insert a new application question record. Returns the new id."""
    with get_connection() as conn:
        conn.execute(
            """INSERT INTO application_questions (application_id, question, response)
               VALUES (?, ?, ?)""",
            (application_id, question, response)
        )
        return conn.execute("SELECT last_insert_rowid()").fetchone()[0]


def update_application_question(
    question_id: int,
    question: str | None = None,
    response: str | None = None,
) -> bool:
    """Update question and/or response on an existing record. Returns False if not found."""
    updates: dict[str, str | None] = {}
    if question is not None:
        updates["question"] = question
    if response is not None:
        updates["response"] = response
    if not updates:
        return True
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    with get_connection() as conn:
        cursor = conn.execute(
            f"UPDATE application_questions SET {set_clause} WHERE id = ?",
            (*updates.values(), question_id)
        )
        return cursor.rowcount > 0


def delete_application_question(question_id: int) -> bool:
    """Delete an application question record. Returns True if deleted, False if not found."""
    with get_connection() as conn:
        conn.execute("DELETE FROM application_questions WHERE id = ?", (question_id,))
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
        jobs_applied_to = conn.execute(
            "SELECT COUNT(*) FROM applications WHERE applied = 1"
        ).fetchone()[0]
        applications_in_process = conn.execute(
            "SELECT COUNT(*) FROM applications"
            " WHERE application_status IN ('applied', 'screening', 'interview', 'offer')"
        ).fetchone()[0]
    return {
        "jobs": jobs,
        "evaluations": evals,
        "applications": apps,
        "llm_calls": llm_calls,
        "jobs_applied_to": jobs_applied_to,
        "applications_in_process": applications_in_process,
    }


# ─────────────────────────────────────────────────────────────
# Unified Activity Log
# ─────────────────────────────────────────────────────────────

def get_activity_log(job_id: int) -> list[dict]:
    """
    Return a merged, timestamp-sorted activity log for a job across all 7 data sources.
    Each entry is a plain dict with keys: entry_type, timestamp, activity_type, source,
    text, url, raw_id, can_delete, can_edit_timestamp.
    Sorted by timestamp DESC, then id ASC as tiebreaker.
    """
    with get_connection() as conn:
        # Resolve the application_id for this job (takes the earliest application)
        app_row = conn.execute(
            "SELECT id FROM applications WHERE job_id = ? ORDER BY id ASC LIMIT 1",
            (job_id,)
        ).fetchone()
        app_id = app_row["id"] if app_row else None

        results: list[dict] = []

        # 1. Evaluations
        evals = conn.execute(
            """SELECT e.id, e.evaluated_at AS ts, e.score_overall, e.fit_type,
                      e.recommendation, m.model AS model_name,
                      e.score_role_fit, e.score_scope_fit, e.score_culture, e.score_comp,
                      e.archetype, e.strengths, e.gaps, e.keywords, e.keyword_gaps,
                      e.domain_match, e.role_type_match
               FROM evaluations e
               JOIN llm_models m ON m.id = e.llm_model_id
               WHERE e.job_id = ?""",
            (job_id,)
        ).fetchall()
        for row in evals:
            score_str = f"{row['score_overall']:.1f}/10" if row["score_overall"] is not None else "—/10"
            parts = [f"Score: {score_str}"]
            if row["fit_type"]:
                parts.append(row["fit_type"])
            if row["recommendation"]:
                parts.append(row["recommendation"])
            results.append({
                "entry_type": "evaluation",
                "timestamp": row["ts"],
                "activity_type": "EVALUATION",
                "source": row["model_name"] or "",
                "text": " · ".join(parts),
                "url": None,
                "raw_id": row["id"],
                "can_delete": False,
                "can_edit_timestamp": False,
                "eval_data": {
                    "score_overall":    row["score_overall"],
                    "score_role_fit":   row["score_role_fit"],
                    "score_scope_fit":  row["score_scope_fit"],
                    "score_culture":    row["score_culture"],
                    "score_comp":       row["score_comp"],
                    "fit_type":         row["fit_type"],
                    "archetype":        row["archetype"],
                    "recommendation":   row["recommendation"],
                    "strengths":        row["strengths"],
                    "gaps":             row["gaps"],
                    "keywords":         row["keywords"],
                    "keyword_gaps":     row["keyword_gaps"],
                    "domain_match":     row["domain_match"],
                    "role_type_match":  row["role_type_match"],
                },
            })

        # 2. LLM call log entries for this job
        llm_rows = conn.execute(
            """SELECT l.id, l.timestamp AS ts, l.call_type,
                      m.model AS model_name,
                      pu.prompt_text AS prompt_text
               FROM llm_call_log l
               LEFT JOIN llm_models m ON m.id = l.llm_model_id
               LEFT JOIN prompt_usage pu ON pu.id = l.prompt_usage_id
               WHERE l.job_id = ?""",
            (job_id,)
        ).fetchall()
        for row in llm_rows:
            results.append({
                "entry_type": "llm_call",
                "timestamp": row["ts"],
                "activity_type": (row["call_type"] or "LLM CALL").upper(),
                "source": row["model_name"] or "",
                "text": row["prompt_text"],
                "url": None,
                "raw_id": row["id"],
                "can_delete": False,
                "can_edit_timestamp": False,
            })

        # 3. Application logs (via application_id)
        if app_id is not None:
            log_rows = conn.execute(
                """SELECT al.id, al.log_timestamp AS ts, al.log, al.url,
                          st.type_value
                   FROM application_logs al
                   JOIN system_types st ON st.id = al.type_id
                   WHERE al.application_id = ?""",
                (app_id,)
            ).fetchall()
            _PROMPT_LABELS = {
                "prompt_eval":       "EVAL PROMPT",
                "prompt_orgsummary": "ORG SUMMARY PROMPT",
                "prompt_resume":     "RESUME PROMPT",
                "prompt_cover":      "COVER PROMPT",
            }
            for row in log_rows:
                tv = row["type_value"] or ""
                activity_label = _PROMPT_LABELS.get(tv) or (tv or "LOG").upper().replace("_", " ")
                results.append({
                    "entry_type": "application_log",
                    "timestamp": row["ts"],
                    "activity_type": activity_label,
                    "source": "",
                    "text": row["log"],
                    "url": row["url"],
                    "raw_id": row["id"],
                    "can_delete": True,
                    "can_edit_timestamp": True,
                })

        # 4. Application audit — by job_id or matching application_id
        if app_id is not None:
            audit_rows = conn.execute(
                """SELECT id, timestamp AS ts, event
                   FROM application_audit
                   WHERE job_id = ? OR application_id = ?
                   ORDER BY id ASC""",
                (job_id, app_id)
            ).fetchall()
        else:
            audit_rows = conn.execute(
                """SELECT id, timestamp AS ts, event
                   FROM application_audit
                   WHERE job_id = ?
                   ORDER BY id ASC""",
                (job_id,)
            ).fetchall()
        for row in audit_rows:
            results.append({
                "entry_type": "audit",
                "timestamp": row["ts"],
                "activity_type": "AUDIT",
                "source": "",
                "text": row["event"],
                "url": None,
                "raw_id": row["id"],
                "can_delete": False,
                "can_edit_timestamp": False,
            })

        # 5. Company log entries
        company_rows = conn.execute(
            """SELECT jcl.id, jcl.log_timestamp AS ts, jcl.log, jcl.url,
                      st.type_value
               FROM job_company_log jcl
               JOIN system_types st ON st.id = jcl.type_id
               WHERE jcl.job_id = ?""",
            (job_id,)
        ).fetchall()
        for row in company_rows:
            results.append({
                "entry_type": "company_log",
                "timestamp": row["ts"],
                "activity_type": (row["type_value"] or "COMPANY INFO").upper().replace("_", " "),
                "source": "Company Info",
                "text": row["log"],
                "url": row["url"],
                "raw_id": row["id"],
                "can_delete": True,
                "can_edit_timestamp": False,
            })

        # 6. Job postings
        posting_rows = conn.execute(
            """SELECT id, date_scraped AS ts, source_board, source_url, description_raw
               FROM job_postings WHERE job_id = ?""",
            (job_id,)
        ).fetchall()
        for row in posting_rows:
            results.append({
                "entry_type": "job_posting",
                "timestamp": row["ts"],
                "activity_type": "JOB POSTING",
                "source": row["source_board"] or "",
                "text": row["description_raw"],
                "url": row["source_url"],
                "raw_id": row["id"],
                "can_delete": False,
                "can_edit_timestamp": False,
            })

        # 7. Application questions (via application_id)
        if app_id is not None:
            question_rows = conn.execute(
                """SELECT id, created_at AS ts, question, response
                   FROM application_questions WHERE application_id = ?""",
                (app_id,)
            ).fetchall()
            for row in question_rows:
                preview = (row["question"] or "")[:80]
                results.append({
                    "entry_type": "application_question",
                    "timestamp": row["ts"],
                    "activity_type": "APP QUESTION",
                    "source": "",
                    "text": f"Q: {preview}\nA: {row['response'] or '—'}",
                    "url": None,
                    "raw_id": row["id"],
                    "can_delete": True,
                    "can_edit_timestamp": False,
                })

    # Sort: timestamp DESC, raw_id ASC tiebreaker (guarantees "Job Created" before
    # "Job Description" when they share a timestamp — they have sequential IDs).
    # Achieved by sorting (timestamp, -raw_id) descending.
    results.sort(key=lambda e: (e["timestamp"] or "", -(e["raw_id"] or 0)), reverse=True)

    return results


# ─────────────────────────────────────────────────────────────
# Prompts
# ─────────────────────────────────────────────────────────────

def assemble_prompt(segments_text: str) -> str:
    """Strip [[EDITABLE]], [[/EDITABLE]], [[READONLY]], [[/READONLY]] tags."""
    return re.sub(r'\[\[/?(?:EDITABLE|READONLY)\]\]', '', segments_text).strip()


def get_active_prompt(prompt_key: str) -> dict | None:
    """Return the active prompt row for a key as a dict, or None."""
    with get_connection() as conn:
        row = conn.execute(
            """SELECT id, prompt_key, label, version, segments_text,
                      preview_context, saved_at, note, temperature
               FROM prompts
               WHERE prompt_key = ? AND is_active = 1""",
            (prompt_key,)
        ).fetchone()
        return dict(row) if row else None


def save_prompt(
    prompt_key: str,
    segments_text: str,
    note: str | None = None,
    temperature: float = 0.0,
) -> int:
    """
    Save a new version of a prompt.
    Deactivates the current active row; carries forward label and preview_context.
    Returns the new row id.
    """
    with get_connection() as conn:
        max_row = conn.execute(
            "SELECT MAX(version) AS max_v FROM prompts WHERE prompt_key = ?",
            (prompt_key,)
        ).fetchone()
        next_version = (max_row["max_v"] or 0) + 1

        current = conn.execute(
            "SELECT label, preview_context FROM prompts WHERE prompt_key = ? AND is_active = 1",
            (prompt_key,)
        ).fetchone()
        label = current["label"] if current else None
        preview_context = current["preview_context"] if current else None

        conn.execute(
            "UPDATE prompts SET is_active = 0 WHERE prompt_key = ?",
            (prompt_key,)
        )
        conn.execute(
            """INSERT INTO prompts
               (prompt_key, label, version, segments_text, preview_context, note, is_active, temperature)
               VALUES (?, ?, ?, ?, ?, ?, 1, ?)""",
            (prompt_key, label, next_version, segments_text, preview_context, note, temperature)
        )
        return conn.execute("SELECT last_insert_rowid()").fetchone()[0]


def get_prompt_history(prompt_key: str) -> list[dict]:
    """Return all prompt rows for a key ordered by version DESC."""
    with get_connection() as conn:
        rows = conn.execute(
            """SELECT id, prompt_key, label, version, segments_text,
                      preview_context, saved_at, note, is_active
               FROM prompts
               WHERE prompt_key = ?
               ORDER BY version DESC""",
            (prompt_key,)
        ).fetchall()
        return [dict(row) for row in rows]


def seed_prompt_if_missing(
    prompt_key: str,
    label: str,
    segments_text: str,
    preview_context: str | None = None,
    temperature: float = 0.0,
) -> None:
    """Insert a prompt at version=1, is_active=1 if no rows exist for the key."""
    with get_connection() as conn:
        existing = conn.execute(
            "SELECT id FROM prompts WHERE prompt_key = ?",
            (prompt_key,)
        ).fetchone()
        if existing:
            return
        conn.execute(
            """INSERT INTO prompts
               (prompt_key, label, version, segments_text, preview_context, is_active, temperature)
               VALUES (?, ?, 1, ?, ?, 1, ?)""",
            (prompt_key, label, segments_text, preview_context, temperature)
        )


# ─────────────────────────────────────────────────────────────
# Prompt Usage
# ─────────────────────────────────────────────────────────────

def create_prompt_usage(
    prompt_key: str,
    prompt_version: int,
    prompt_text: str,
    prompt_hash: str,
    source: str,
    job_id: int | None = None,
) -> int:
    """Insert a prompt_usage row and return the new id."""
    with get_connection() as conn:
        conn.execute(
            """INSERT INTO prompt_usage
               (prompt_key, prompt_version, prompt_text, prompt_hash, source, job_id)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (prompt_key, prompt_version, prompt_text, prompt_hash, source, job_id)
        )
        return conn.execute("SELECT last_insert_rowid()").fetchone()[0]


def update_prompt_feedback(
    prompt_usage_id: int,
    agree: int,
    dimension: str | None = None,
    feedback_text: str | None = None,
) -> None:
    """Overwrite agree/dimension/feedback_text on an existing prompt_usage row in place."""
    with get_connection() as conn:
        conn.execute(
            """UPDATE prompt_usage
               SET agree = ?, dimension = ?, feedback_text = ?
               WHERE id = ?""",
            (agree, dimension, feedback_text, prompt_usage_id)
        )


def get_prompt_usage(prompt_usage_id: int) -> dict | None:
    """Return a single prompt_usage row by id as a dict, or None."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM prompt_usage WHERE id = ?",
            (prompt_usage_id,)
        ).fetchone()
        return dict(row) if row else None


def get_unprocessed_feedback(prompt_key: str) -> list[dict]:
    """Return prompt_usage rows for a key where feedback exists and has not been consumed."""
    with get_connection() as conn:
        rows = conn.execute(
            """SELECT * FROM prompt_usage
               WHERE prompt_key = ? AND agree IS NOT NULL AND is_consumed = 0""",
            (prompt_key,)
        ).fetchall()
        return [dict(row) for row in rows]


def mark_feedback_consumed(ids: list[int]) -> None:
    """Set is_consumed = 1 for all given prompt_usage ids."""
    if not ids:
        return
    placeholders = ",".join("?" * len(ids))
    with get_connection() as conn:
        conn.execute(
            f"UPDATE prompt_usage SET is_consumed = 1 WHERE id IN ({placeholders})",
            ids
        )


def get_all_active_prompts() -> list[dict]:
    """Return one row per prompt key where is_active = 1, ordered by prompt_key."""
    with get_connection() as conn:
        rows = conn.execute(
            """SELECT prompt_key, label, version
               FROM prompts
               WHERE is_active = 1
               ORDER BY prompt_key""",
        ).fetchall()
        return [dict(row) for row in rows]


# ─────────────────────────────────────────────────────────────
# Utilities
# ─────────────────────────────────────────────────────────────

def compute_sha256(content: str) -> str:
    """SHA-256 hash of a string. Used for prompt_hash and source_resume. Never use MD5."""
    return hashlib.sha256(content.encode()).hexdigest()


_EXPORT_TABLES = [
    "system_types", "llm_servers", "llm_models", "jobs", "job_company_log", "job_postings",
    "evaluations", "llm_call_log", "applications", "application_logs",
    "application_documents", "application_questions", "application_audit", "job_posting_audit",
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
        config.get("database", {}).get("backup_dir", "./app_data/data/backups")
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
# Eval Scoring — Phase 2.5
# ─────────────────────────────────────────────────────────────

def get_eval_weights(conn: sqlite3.Connection) -> dict:
    """Return eval composite weights from app_settings as floats."""
    rows = conn.execute(
        "SELECT key, value FROM app_settings WHERE key LIKE 'eval_weight_%'"
    ).fetchall()
    weights = {r["key"].replace("eval_weight_", ""): float(r["value"]) for r in rows}
    return {
        "screenability": weights.get("screenability", 0.40),
        "company_fit": weights.get("company_fit", 0.30),
        "candidate_fit": weights.get("candidate_fit", 0.30),
    }


def set_eval_weights(
    conn: sqlite3.Connection,
    screenability: float,
    company_fit: float,
    candidate_fit: float,
) -> None:
    """Write eval weights to app_settings. Raises ValueError if they don't sum to 1.0."""
    total = screenability + company_fit + candidate_fit
    if abs(total - 1.0) > 0.001:
        raise ValueError(f"Weights must sum to 1.0; got {total:.4f}")
    for key, value in (
        ("eval_weight_screenability", screenability),
        ("eval_weight_company_fit", company_fit),
        ("eval_weight_candidate_fit", candidate_fit),
    ):
        existing = conn.execute(
            "SELECT id FROM app_settings WHERE key = ?", (key,)
        ).fetchone()
        if existing:
            conn.execute("UPDATE app_settings SET value = ? WHERE key = ?", (str(value), key))
        else:
            conn.execute(
                "INSERT INTO app_settings (key, value) VALUES (?, ?)", (key, str(value))
            )


def compute_eval_composites(scores: dict, weights: dict) -> dict:
    """
    Compute the three composite scores and score_overall from raw 9-dim integer scores.

    Screenability dims are 1–4; fit dims are 1–5.
    All three composites are normalized to 0.0–10.0.
    Returns None for score_overall if any composite is None.
    """
    def _avg_normalized(vals: list, scale: int) -> float | None:
        if any(v is None for v in vals):
            return None
        return (sum(vals) / len(vals)) / scale * 10.0

    comp_screen = _avg_normalized(
        [scores.get("score_ats"), scores.get("score_recruiter_fast"), scores.get("score_recruiter_deep")],
        4,
    )
    comp_company = _avg_normalized(
        [scores.get("score_role_fit"), scores.get("score_scope_fit"), scores.get("score_culture")],
        5,
    )
    comp_candidate = _avg_normalized(
        [scores.get("score_candidate_role"), scores.get("score_candidate_scope"), scores.get("score_candidate_culture")],
        5,
    )

    if comp_screen is not None and comp_company is not None and comp_candidate is not None:
        overall = (
            weights["screenability"] * comp_screen
            + weights["company_fit"] * comp_company
            + weights["candidate_fit"] * comp_candidate
        )
    else:
        overall = None

    return {
        "composite_screenability": comp_screen,
        "composite_company_fit": comp_company,
        "composite_candidate_fit": comp_candidate,
        "score_overall": overall,
    }


def migrate_legacy_evaluations(conn: sqlite3.Connection) -> int:
    """
    Migrate pre-2.5 evaluations to the 3-composite format.
    Targets evals where score_ats IS NULL AND score_role_fit IS NOT NULL.
    Returns count of rows updated.
    """
    weights = get_eval_weights(conn)
    rows = conn.execute(
        """SELECT id, score_role_fit, score_scope_fit, score_culture
           FROM evaluations
           WHERE score_ats IS NULL AND score_role_fit IS NOT NULL"""
    ).fetchall()

    updated = 0
    for row in rows:
        scores = {
            "score_ats": None,
            "score_recruiter_fast": None,
            "score_recruiter_deep": None,
            "score_role_fit": row["score_role_fit"],
            "score_scope_fit": row["score_scope_fit"],
            "score_culture": row["score_culture"],
            "score_candidate_role": None,
            "score_candidate_scope": None,
            "score_candidate_culture": None,
        }
        comp_company = compute_eval_composites(scores, weights)["composite_company_fit"]
        comp_screen = 5.0
        comp_candidate = 5.0
        overall = (
            weights["screenability"] * comp_screen
            + weights["company_fit"] * (comp_company or 5.0)
            + weights["candidate_fit"] * comp_candidate
        )
        conn.execute(
            """UPDATE evaluations
               SET composite_screenability = ?,
                   composite_company_fit = ?,
                   composite_candidate_fit = ?,
                   score_overall = ?
               WHERE id = ?""",
            (comp_screen, comp_company, comp_candidate, overall, row["id"]),
        )
        updated += 1
    return updated


def recalc_eval_scores(conn: sqlite3.Connection) -> int:
    """
    Recompute composites + score_overall for all new-schema evals (score_ats IS NOT NULL)
    using current weights. Also recalculates jobs.agg_score_overall for affected jobs.
    Returns count of evals updated.
    """
    weights = get_eval_weights(conn)
    rows = conn.execute(
        """SELECT id, job_id,
                  score_ats, score_recruiter_fast, score_recruiter_deep,
                  score_role_fit, score_scope_fit, score_culture,
                  score_candidate_role, score_candidate_scope, score_candidate_culture
           FROM evaluations
           WHERE score_ats IS NOT NULL"""
    ).fetchall()

    updated = 0
    affected_jobs: set[int] = set()
    for row in rows:
        composites = compute_eval_composites(dict(row), weights)
        conn.execute(
            """UPDATE evaluations
               SET composite_screenability = ?,
                   composite_company_fit = ?,
                   composite_candidate_fit = ?,
                   score_overall = ?
               WHERE id = ?""",
            (
                composites["composite_screenability"],
                composites["composite_company_fit"],
                composites["composite_candidate_fit"],
                composites["score_overall"],
                row["id"],
            ),
        )
        affected_jobs.add(row["job_id"])
        updated += 1

    for job_id in affected_jobs:
        agg = conn.execute(
            "SELECT AVG(score_overall) AS avg FROM evaluations WHERE job_id = ?",
            (job_id,),
        ).fetchone()
        conn.execute(
            "UPDATE jobs SET agg_score_overall = ? WHERE id = ?",
            (agg["avg"], job_id),
        )

    return updated


# ─────────────────────────────────────────────────────────────
# Job Research — Phase 2.5
# ─────────────────────────────────────────────────────────────

def insert_job_research(
    job_id: int,
    raw_json: str,
    research_summary: str | None = None,
    company_overview: str | None = None,
    company_stage: str | None = None,
    company_size_actual: str | None = None,
    company_trajectory: str | None = None,
    company_culture_overview: str | None = None,
    culture_signals: str | None = None,
    comp_signals: str | None = None,
    role_context: str | None = None,
    interview_process: str | None = None,
    red_flags: str | None = None,
    green_flags: str | None = None,
    research_confidence: str | None = None,
    research_notes: str | None = None,
) -> int:
    """Insert a job_research record and return the new id."""
    with get_connection() as conn:
        conn.execute(
            """INSERT INTO job_research
               (job_id, raw_json, research_summary, company_overview, company_stage,
                company_size_actual, company_trajectory, company_culture_overview,
                culture_signals, comp_signals, role_context, interview_process,
                red_flags, green_flags, research_confidence, research_notes)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (job_id, raw_json, research_summary, company_overview, company_stage,
             company_size_actual, company_trajectory, company_culture_overview,
             culture_signals, comp_signals, role_context, interview_process,
             red_flags, green_flags, research_confidence, research_notes),
        )
        return conn.execute("SELECT last_insert_rowid()").fetchone()[0]


def get_job_research_latest(job_id: int) -> dict | None:
    """Return the most recent job_research record for a job, or None."""
    with get_connection() as conn:
        row = conn.execute(
            """SELECT * FROM job_research
               WHERE job_id = ?
               ORDER BY imported_at DESC, id DESC
               LIMIT 1""",
            (job_id,),
        ).fetchone()
        return dict(row) if row else None


# ─────────────────────────────────────────────────────────────
# Entrypoint — run directly to initialize the database
# ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    init_db()
    print(f"\nDatabase location: {_get_db_path().resolve()}")
