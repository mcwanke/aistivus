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
- data/ directory is created automatically on first run.

Schema version: 0.1
"""

import hashlib
import json
import shutil
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

import yaml

# ─────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────

def _load_config() -> dict:
    """Load config.yaml if it exists; return defaults otherwise."""
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

def get_connection() -> sqlite3.Connection:
    """
    Open and return a database connection.
    - Sets row_factory for dict-style row access
    - Enables WAL mode for better concurrent read performance
    - Enables foreign key enforcement
    - Creates data/ directory if it does not exist
    """
    db_path = _get_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


# ─────────────────────────────────────────────────────────────
# Schema
# ─────────────────────────────────────────────────────────────

SCHEMA = """
CREATE TABLE IF NOT EXISTS projects (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    description TEXT,
    is_active   INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS companies (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,
    website     TEXT,
    careerpage  TEXT,
    culturepage TEXT,
    industry    TEXT,
    size        TEXT,
    notes       TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS jobs (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id          INTEGER NOT NULL REFERENCES companies(id),
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
    project_id          INTEGER REFERENCES projects(id),
    UNIQUE (company_id, title, role_keyword)
);

CREATE TABLE IF NOT EXISTS job_postings (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id                      INTEGER NOT NULL REFERENCES jobs(id),
    source_board                TEXT NOT NULL,
    apply_url                   TEXT,
    description_raw             TEXT,
    date_posted                 TEXT,
    date_scraped                TEXT NOT NULL DEFAULT (datetime('now')),
    is_repost                   INTEGER NOT NULL DEFAULT 0,
    days_since_prior_posting    INTEGER,
    repost_url_changed          INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS evaluations (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id          INTEGER NOT NULL REFERENCES jobs(id),
    model_used      TEXT,
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
    log_entry       TEXT,
    prompt_hash     TEXT,
    raw_response    TEXT,
    keywords        TEXT,
    domain_match    TEXT,
    evaluated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS applications (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id              INTEGER NOT NULL REFERENCES jobs(id),
    apply_date          TEXT,
    end_date            TEXT,
    cv_link             TEXT,
    cover_link          TEXT,
    application_status  TEXT NOT NULL DEFAULT 'draft',
    excitement_level    INTEGER CHECK(excitement_level BETWEEN 1 AND 5),
    project_id          INTEGER REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS application_notes (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id  INTEGER NOT NULL REFERENCES applications(id),
    note_type       TEXT,
    note            TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS llm_call_log (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp                   TEXT NOT NULL DEFAULT (datetime('now')),
    provider                    TEXT,
    model                       TEXT,
    call_type                   TEXT,
    prompt_tokens_estimated     INTEGER,
    prompt_tokens_actual        INTEGER,
    completion_tokens_actual    INTEGER,
    total_tokens_actual         INTEGER,
    latency_ms                  INTEGER,
    success                     INTEGER NOT NULL DEFAULT 1,
    error_message               TEXT,
    job_id                      INTEGER REFERENCES jobs(id),
    search_run_id               INTEGER
);

CREATE TABLE IF NOT EXISTS jobsearch_versions (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    content  TEXT NOT NULL,
    saved_at TEXT NOT NULL DEFAULT (datetime('now')),
    note     TEXT
);

CREATE TABLE IF NOT EXISTS resume_info (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    chunk_name          TEXT,
    chunk_text          TEXT NOT NULL,
    chunk_type          TEXT NOT NULL,
    tags                TEXT,
    source_resume       TEXT,
    source_resume_name  TEXT,
    is_active           INTEGER NOT NULL DEFAULT 1,
    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS generated_docs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id  INTEGER NOT NULL REFERENCES applications(id),
    doc_type        TEXT NOT NULL,
    chunks_used     TEXT,
    file_link       TEXT,
    model_used      TEXT,
    generated_at    TEXT NOT NULL DEFAULT (datetime('now')),
    project_id      INTEGER REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS search_runs (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    run_at                  TEXT NOT NULL DEFAULT (datetime('now')),
    config_snapshot         TEXT,
    jobs_found              INTEGER DEFAULT 0,
    jobs_evaluated          INTEGER DEFAULT 0,
    jobs_above_threshold    INTEGER DEFAULT 0,
    jobs_failed             INTEGER DEFAULT 0,
    error_summary           TEXT,
    run_source              TEXT,
    project_id              INTEGER REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS search_run_errors (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    search_run_id   INTEGER NOT NULL REFERENCES search_runs(id),
    source_board    TEXT,
    source_url      TEXT,
    error_type      TEXT,
    error_message   TEXT,
    timestamp       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS application_audit (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id  INTEGER NOT NULL REFERENCES applications(id),
    timestamp       TEXT NOT NULL DEFAULT (datetime('now')),
    event           TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS job_posting_audit (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    job_posting_id  INTEGER NOT NULL REFERENCES job_postings(id),
    timestamp       TEXT NOT NULL DEFAULT (datetime('now')),
    event           TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_sessions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
    title       TEXT,
    job_id      INTEGER REFERENCES jobs(id),
    project_id  INTEGER REFERENCES projects(id)
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

CREATE TABLE IF NOT EXISTS schema_versions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    version     TEXT NOT NULL,
    applied_at  TEXT NOT NULL DEFAULT (datetime('now')),
    description TEXT,
    checksum    TEXT
);

CREATE TABLE IF NOT EXISTS schema_migrations (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    from_version    TEXT NOT NULL,
    to_version      TEXT NOT NULL,
    migration_sql   TEXT NOT NULL,
    rollback_sql    TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
"""

CURRENT_SCHEMA_VERSION = "0.1"


def init_db() -> None:
    """
    Initialize the database.
    - Creates data/ directory if needed
    - Creates all tables (idempotent — safe to run multiple times)
    - Records schema version if not already recorded
    - Runs startup checks
    """
    with get_connection() as conn:
        conn.executescript(SCHEMA)

        existing = conn.execute(
            "SELECT id FROM schema_versions WHERE version = ?",
            (CURRENT_SCHEMA_VERSION,)
        ).fetchone()
        if not existing:
            conn.execute(
                "INSERT INTO schema_versions (version, description) VALUES (?, ?)",
                (
                    CURRENT_SCHEMA_VERSION,
                    "Initial schema — all tables created at Phase 0 init"
                )
            )

    print(f"✓ Database initialized at {_get_db_path().resolve()}")
    print(f"✓ Schema version: {CURRENT_SCHEMA_VERSION}")

    _check_jobsearch_staleness()


def get_schema_version() -> str:
    """Return the current schema version recorded in the database."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT version FROM schema_versions ORDER BY applied_at DESC LIMIT 1"
        ).fetchone()
        return row["version"] if row else "unknown"


def _check_jobsearch_staleness() -> None:
    """
    Warn if jobsearch.md has been modified outside the app.
    Disk is authoritative — DB snapshots are for history and rollback only.
    """
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
            "⚠️  jobsearch.md was modified outside the app. "
            "Consider saving a version snapshot in Settings."
        )


# ─────────────────────────────────────────────────────────────
# Companies
# ─────────────────────────────────────────────────────────────

def upsert_company(name: str, **kwargs) -> int:
    """
    Insert a new company or return the existing company's id.
    Updates provided fields if company already exists.

    Returns:
        company id (int)
    """
    fields = ["website", "careerpage", "culturepage", "industry", "size", "notes"]
    with get_connection() as conn:
        existing = conn.execute(
            "SELECT id FROM companies WHERE name = ?", (name,)
        ).fetchone()

        if existing:
            updates = {k: v for k, v in kwargs.items() if k in fields and v is not None}
            if updates:
                set_clause = ", ".join(f"{k} = ?" for k in updates)
                conn.execute(
                    f"UPDATE companies SET {set_clause} WHERE id = ?",
                    (*updates.values(), existing["id"])
                )
            return existing["id"]

        conn.execute(
            """INSERT INTO companies
               (name, website, careerpage, culturepage, industry, size, notes)
               VALUES
               (:name, :website, :careerpage, :culturepage, :industry, :size, :notes)""",
            {"name": name, **{f: kwargs.get(f) for f in fields}}
        )
        return conn.execute("SELECT last_insert_rowid()").fetchone()[0]


def get_company(company_id: int) -> sqlite3.Row | None:
    """Return a company record by id, or None."""
    with get_connection() as conn:
        return conn.execute(
            "SELECT * FROM companies WHERE id = ?", (company_id,)
        ).fetchone()


def get_all_companies() -> list[sqlite3.Row]:
    """Return all companies ordered by name."""
    with get_connection() as conn:
        return conn.execute(
            "SELECT * FROM companies ORDER BY name"
        ).fetchall()


# ─────────────────────────────────────────────────────────────
# Jobs
# ─────────────────────────────────────────────────────────────

def upsert_job(
    company_id: int,
    title: str,
    role_keyword: str | None = None,
    **kwargs
) -> tuple[int, bool]:
    """
    Insert a new job or return the existing job's id.
    UNIQUE key: (company_id, title, role_keyword)

    Returns:
        (job_id, created) where created=True means a new row was inserted
    """
    fields = ["location", "remote_type", "description_merged", "pay_band"]
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

    with get_connection() as conn:
        existing = conn.execute(
            """SELECT id FROM jobs
               WHERE company_id = ? AND title = ? AND role_keyword IS ?""",
            (company_id, title, role_keyword)
        ).fetchone()

        if existing:
            updates = {k: v for k, v in kwargs.items() if k in fields and v is not None}
            updates["last_seen_date"] = now
            set_clause = ", ".join(f"{k} = ?" for k in updates)
            conn.execute(
                f"""UPDATE jobs
                    SET {set_clause}, posting_count = posting_count + 1
                    WHERE id = ?""",
                (*updates.values(), existing["id"])
            )
            return existing["id"], False

        conn.execute(
            """INSERT INTO jobs
               (company_id, title, role_keyword, location, remote_type,
                description_merged, pay_band, first_seen_date, last_seen_date)
               VALUES
               (:company_id, :title, :role_keyword, :location, :remote_type,
                :description_merged, :pay_band, :now, :now)""",
            {
                "company_id": company_id,
                "title": title,
                "role_keyword": role_keyword,
                "now": now,
                **{f: kwargs.get(f) for f in fields}
            }
        )
        job_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        return job_id, True


def get_job(job_id: int) -> sqlite3.Row | None:
    """Return a job with its company name, or None."""
    with get_connection() as conn:
        return conn.execute(
            """SELECT j.*, c.name AS company_name
               FROM jobs j
               JOIN companies c ON c.id = j.company_id
               WHERE j.id = ?""",
            (job_id,)
        ).fetchone()


def get_all_jobs(above_threshold: float | None = None) -> list[sqlite3.Row]:
    """
    Return all jobs with company name and latest evaluation score.
    Optionally filter to jobs scoring at or above threshold.
    """
    with get_connection() as conn:
        query = """
            SELECT j.*, c.name AS company_name,
                   e.score_overall, e.fit_type, e.archetype, e.evaluated_at
            FROM jobs j
            JOIN companies c ON c.id = j.company_id
            LEFT JOIN evaluations e ON e.id = (
                SELECT id FROM evaluations
                WHERE job_id = j.id
                ORDER BY evaluated_at DESC
                LIMIT 1
            )
        """
        if above_threshold is not None:
            query += " WHERE e.score_overall >= ?"
            query += " ORDER BY e.score_overall DESC, j.last_seen_date DESC"
            return conn.execute(query, (above_threshold,)).fetchall()

        query += " ORDER BY j.last_seen_date DESC"
        return conn.execute(query).fetchall()


def get_jobs_pending_evaluation() -> list[sqlite3.Row]:
    """Return jobs that have no evaluation record yet."""
    with get_connection() as conn:
        return conn.execute(
            """SELECT j.*, c.name AS company_name
               FROM jobs j
               JOIN companies c ON c.id = j.company_id
               WHERE j.id NOT IN (SELECT DISTINCT job_id FROM evaluations)
               ORDER BY j.last_seen_date DESC"""
        ).fetchall()


def update_job_dedup_status(job_id: int, status: str) -> None:
    """
    Update a job's dedup_status.
    Valid values: clean | suspected_duplicate | confirmed_distinct
    """
    with get_connection() as conn:
        conn.execute(
            "UPDATE jobs SET dedup_status = ? WHERE id = ?",
            (status, job_id)
        )


# ─────────────────────────────────────────────────────────────
# Job Postings
# ─────────────────────────────────────────────────────────────

def insert_job_posting(job_id: int, source_board: str, **kwargs) -> int:
    """
    Insert a new job posting record.
    Always inserts — job_postings accumulates all sources.
    1:many with jobs is intentional by design.

    Returns:
        job_posting id (int)
    """
    fields = [
        "apply_url", "description_raw", "date_posted",
        "is_repost", "days_since_prior_posting", "repost_url_changed"
    ]
    with get_connection() as conn:
        conn.execute(
            """INSERT INTO job_postings
               (job_id, source_board, apply_url, description_raw, date_posted,
                is_repost, days_since_prior_posting, repost_url_changed)
               VALUES
               (:job_id, :source_board, :apply_url, :description_raw, :date_posted,
                :is_repost, :days_since_prior_posting, :repost_url_changed)""",
            {
                "job_id": job_id,
                "source_board": source_board,
                **{
                    f: kwargs.get(f, 0 if f in ["is_repost", "repost_url_changed"] else None)
                    for f in fields
                }
            }
        )
        posting_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        _audit_job_posting(posting_id, f"Scraped from {source_board}", conn=conn)
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
    conn: sqlite3.Connection | None = None
) -> None:
    """Append an audit event for a job posting. Audit tables are append-only."""
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

def insert_evaluation(job_id: int, **kwargs) -> int:
    """
    Insert an evaluation record.
    All score fields are nullable — a failed evaluation is recorded with
    score_overall = NULL and raw_response preserved.
    Never silently drop a failed evaluation.

    Returns:
        evaluation id (int)
    """
    fields = [
        "model_used", "score_overall", "score_role_fit", "score_scope_fit",
        "score_culture", "score_comp", "fit_type", "archetype",
        "strengths", "gaps", "recommendation", "log_entry",
        "prompt_hash", "raw_response", "keywords"
    ]
    with get_connection() as conn:
        conn.execute(
            f"""INSERT INTO evaluations
               (job_id, {', '.join(fields)})
               VALUES
               (:job_id, {', '.join(f':{f}' for f in fields)})""",
            {"job_id": job_id, **{f: kwargs.get(f) for f in fields}}
        )
        return conn.execute("SELECT last_insert_rowid()").fetchone()[0]


def get_evaluations_for_job(job_id: int) -> list[sqlite3.Row]:
    """Return all evaluations for a job, newest first."""
    with get_connection() as conn:
        return conn.execute(
            "SELECT * FROM evaluations WHERE job_id = ? ORDER BY evaluated_at DESC",
            (job_id,)
        ).fetchall()


def get_latest_evaluation(job_id: int) -> sqlite3.Row | None:
    """Return the most recent evaluation for a job, or None."""
    with get_connection() as conn:
        return conn.execute(
            """SELECT * FROM evaluations
               WHERE job_id = ?
               ORDER BY evaluated_at DESC
               LIMIT 1""",
            (job_id,)
        ).fetchone()


def get_evaluations_above_threshold(threshold: float = 6.0) -> list[sqlite3.Row]:
    """Return jobs whose latest evaluation score meets or exceeds threshold."""
    with get_connection() as conn:
        return conn.execute(
            """SELECT e.*, j.title, j.location, j.remote_type,
                      c.name AS company_name
               FROM evaluations e
               JOIN jobs j ON j.id = e.job_id
               JOIN companies c ON c.id = j.company_id
               WHERE e.score_overall >= ?
                 AND e.id = (
                     SELECT id FROM evaluations
                     WHERE job_id = e.job_id
                     ORDER BY evaluated_at DESC
                     LIMIT 1
                 )
               ORDER BY e.score_overall DESC""",
            (threshold,)
        ).fetchall()


# ─────────────────────────────────────────────────────────────
# Applications
# ─────────────────────────────────────────────────────────────

def insert_application(job_id: int, **kwargs) -> int:
    """
    Create a new application record. Writes an audit event on creation.

    Returns:
        application id (int)
    """
    fields = [
        "apply_date", "end_date", "cv_link", "cover_link",
        "application_status", "excitement_level"
    ]
    with get_connection() as conn:
        conn.execute(
            f"""INSERT INTO applications
               (job_id, {', '.join(fields)})
               VALUES
               (:job_id, {', '.join(f':{f}' for f in fields)})""",
            {"job_id": job_id, **{f: kwargs.get(f) for f in fields}}
        )
        app_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        _audit_application(app_id, "Application created", conn=conn)
        return app_id


def update_application_status(application_id: int, status: str) -> None:
    """
    Update application status and write audit event.
    Status is not enforced as a state machine — any value accepted.
    Audit trail is the source of truth.
    """
    with get_connection() as conn:
        conn.execute(
            "UPDATE applications SET application_status = ? WHERE id = ?",
            (status, application_id)
        )
        _audit_application(
            application_id,
            f"Status updated to: {status}",
            conn=conn
        )


def add_application_note(application_id: int, note_type: str, note: str) -> int:
    """
    Add a timestamped note to an application.
    note_type valid values: recruiter_call | interview_feedback |
                            compensation | general | repost_alert

    Returns:
        note id (int)
    """
    with get_connection() as conn:
        conn.execute(
            """INSERT INTO application_notes (application_id, note_type, note)
               VALUES (?, ?, ?)""",
            (application_id, note_type, note)
        )
        return conn.execute("SELECT last_insert_rowid()").fetchone()[0]


def get_application_notes(application_id: int) -> list[sqlite3.Row]:
    """Return all notes for an application, oldest first."""
    with get_connection() as conn:
        return conn.execute(
            """SELECT * FROM application_notes
               WHERE application_id = ?
               ORDER BY created_at""",
            (application_id,)
        ).fetchall()


def get_application_audit(application_id: int) -> list[sqlite3.Row]:
    """Return full audit trail for an application."""
    with get_connection() as conn:
        return conn.execute(
            """SELECT * FROM application_audit
               WHERE application_id = ?
               ORDER BY timestamp""",
            (application_id,)
        ).fetchall()


def _audit_application(
    application_id: int,
    event: str,
    conn: sqlite3.Connection | None = None
) -> None:
    """Append an audit event for an application. Audit tables are append-only."""
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


# ─────────────────────────────────────────────────────────────
# jobsearch.md version history
# ─────────────────────────────────────────────────────────────

def save_jobsearch_version(content: str, note: str | None = None) -> int:
    """
    Save a full-text snapshot of jobsearch.md.
    Called by Settings UI on every save.
    Disk is authoritative — this table is for history and rollback.

    Returns:
        version id (int)
    """
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO jobsearch_versions (content, note) VALUES (?, ?)",
            (content, note)
        )
        return conn.execute("SELECT last_insert_rowid()").fetchone()[0]


def get_jobsearch_versions(limit: int = 20) -> list[sqlite3.Row]:
    """Return recent jobsearch.md versions, newest first."""
    with get_connection() as conn:
        return conn.execute(
            """SELECT id, saved_at, note FROM jobsearch_versions
               ORDER BY saved_at DESC LIMIT ?""",
            (limit,)
        ).fetchall()


def get_jobsearch_version_content(version_id: int) -> str | None:
    """Return the full content of a specific jobsearch.md version."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT content FROM jobsearch_versions WHERE id = ?",
            (version_id,)
        ).fetchone()
        return row["content"] if row else None


# ─────────────────────────────────────────────────────────────
# Resume info (Phase 2)
# ─────────────────────────────────────────────────────────────

def insert_resume_chunk(chunk_text: str, chunk_type: str, **kwargs) -> int:
    """
    Insert a resume content chunk into the library.
    chunk_type valid values: summary | key_impact | bullet | skill | competency
    source_resume should be SHA-256 hash of source file content.

    IMPORTANT: resume_info records are NEVER hard-deleted.
    Use deactivate_resume_chunk() to remove from active use.

    Returns:
        chunk id (int)
    """
    fields = ["chunk_name", "tags", "source_resume", "source_resume_name"]
    with get_connection() as conn:
        conn.execute(
            f"""INSERT INTO resume_info
               (chunk_text, chunk_type, {', '.join(fields)})
               VALUES
               (:chunk_text, :chunk_type, {', '.join(f':{f}' for f in fields)})""",
            {
                "chunk_text": chunk_text,
                "chunk_type": chunk_type,
                **{f: kwargs.get(f) for f in fields}
            }
        )
        return conn.execute("SELECT last_insert_rowid()").fetchone()[0]


def deactivate_resume_chunks_by_source(source_resume_hash: str) -> int:
    """
    Deactivate all chunks from a source file (matched by content hash).
    Used during re-ingestion — prior chunks deactivated, new chunks created.
    Never hard-deletes.

    Returns:
        number of chunks deactivated (int)
    """
    with get_connection() as conn:
        conn.execute(
            "UPDATE resume_info SET is_active = 0 WHERE source_resume = ?",
            (source_resume_hash,)
        )
        return conn.execute("SELECT changes()").fetchone()[0]


def deactivate_resume_chunk(chunk_id: int) -> None:
    """Deactivate a single resume chunk. Never hard-deletes."""
    with get_connection() as conn:
        conn.execute(
            "UPDATE resume_info SET is_active = 0 WHERE id = ?",
            (chunk_id,)
        )


def get_chunks_by_tags(
    tags: list[str],
    chunk_type: str | None = None
) -> list[sqlite3.Row]:
    """
    Return active resume chunks matching any of the provided tags.
    Used by the generation pipeline to find relevant content.
    """
    with get_connection() as conn:
        conditions = ["is_active = 1"]
        params: list = []

        if tags:
            tag_clauses = " OR ".join("tags LIKE ?" for _ in tags)
            conditions.append(f"({tag_clauses})")
            params.extend(f"%{tag}%" for tag in tags)

        if chunk_type:
            conditions.append("chunk_type = ?")
            params.append(chunk_type)

        where = " AND ".join(conditions)
        return conn.execute(
            f"SELECT * FROM resume_info WHERE {where} ORDER BY created_at DESC",
            params
        ).fetchall()


# ─────────────────────────────────────────────────────────────
# Export / Import / Backup
# ─────────────────────────────────────────────────────────────

EXPORT_FORMAT_VERSION = "0.1"

# All tables in export order — includes stub tables as empty arrays
_ALL_TABLES = [
    "projects", "companies", "jobs", "job_postings",
    "evaluations", "applications", "application_notes",
    "application_audit", "job_posting_audit",
    "llm_call_log", "jobsearch_versions",
    "resume_info", "generated_docs",
    "search_runs", "search_run_errors",
    "chat_sessions", "chat_messages",
    "schema_versions", "schema_migrations"
]


def export_db(output_path: str | Path | None = None) -> dict:
    """
    Export all database tables to a structured dictionary.
    Includes jobsearch.md content as a first-class artifact.
    All tables included — stub tables exported as empty arrays.

    Export format:
        schema_version, export_format_version, exported_at,
        jobsearch_md, tables

    Note: Compatibility rules for cross-version imports are a stub in v0.1.
    They will be documented in MIGRATION_GUIDE.md as versions accumulate.

    Returns:
        Export dictionary (also written to file if output_path provided)
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
        "tables": {}
    }

    with get_connection() as conn:
        for table in _ALL_TABLES:
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
        print(f"✓ Export written to {out}")

    return export_data


def backup_db() -> Path:
    """
    Create a timestamped backup of the raw SQLite database file.
    Always run this before applying migrations.

    Returns:
        Path to the backup file
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

    print(f"✓ Database backed up to {backup_path}")
    return backup_path


# ─────────────────────────────────────────────────────────────
# File integrity
# ─────────────────────────────────────────────────────────────

def check_file_integrity() -> list[dict]:
    """
    Validate all stored file paths in generated_docs and applications.
    Returns list of broken links for display in the Settings UI.

    Returns:
        List of dicts: table, record_id, field, path
    """
    broken: list[dict] = []

    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, file_link FROM generated_docs WHERE file_link IS NOT NULL"
        ).fetchall()
        for row in rows:
            if not Path(row["file_link"]).exists():
                broken.append({
                    "table": "generated_docs",
                    "record_id": row["id"],
                    "field": "file_link",
                    "path": row["file_link"]
                })

        rows = conn.execute(
            "SELECT id, cv_link, cover_link FROM applications"
        ).fetchall()
        for row in rows:
            for field in ["cv_link", "cover_link"]:
                if row[field] and not Path(row[field]).exists():
                    broken.append({
                        "table": "applications",
                        "record_id": row["id"],
                        "field": field,
                        "path": row[field]
                    })

    return broken


# ─────────────────────────────────────────────────────────────
# Utilities
# ─────────────────────────────────────────────────────────────

def compute_sha256(content: str) -> str:
    """
    Compute SHA-256 hash of a string.
    Used for prompt_hash in evaluations and source_resume in resume_info.
    Never use MD5.
    """
    return hashlib.sha256(content.encode()).hexdigest()


# ─────────────────────────────────────────────────────────────
# Entrypoint — run directly to initialize the database
# ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    init_db()
    print("\nAll tables created successfully.")
    print(f"Database location: {_get_db_path().resolve()}")