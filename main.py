"""
main.py
───────
FastAPI server for AIstivus.

Phase 0 routes:
  GET  /            → landing page (pages/index.html)
  GET  /evaluate    → evaluate page (pages/evaluate.html)
  POST /evaluate    → run evaluation, return JSON result
  GET  /health      → health check (Ollama + DB status)
  GET  /report      → render a markdown report as HTML
  GET  /stats       → summary counts for landing page
  GET  /jobs        → all jobs with latest scores
  GET  /jobs/{id}   → single job with evaluations and postings
  GET  /api/evaluations      → all evaluations with job+company data
  GET  /api/evaluations/{id} → single evaluation detail
  GET  /applications            → applications list page
  GET  /applications/{id}       → application detail page
  POST /api/applications        → create application from job
  GET  /api/applications        → all applications with job+company data
  GET  /api/applications/{id}   → single application with all related data
  PATCH /api/applications/{id}  → update application fields
  POST /api/applications/{id}/logs → add log entry to application
  GET  /api/jobs/{id}/application   → check if job has application
  GET  /settings              → settings page (pages/settings.html)
  GET  /api/settings          → return all settings as dict
  PATCH /api/settings         → update one or more settings keys
  GET  /api/inbox/files       → list pending files in inbox/
  POST /api/inbox/process     → process selected inbox files by filename
"""

import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

import yaml
from dotenv import load_dotenv

load_dotenv()
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import database
import evaluate
import evaluator
import llm_client


# ─────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────

def _load_config() -> dict:
    config_path = Path("config.yaml")
    if config_path.exists():
        with open(config_path) as f:
            return yaml.safe_load(f) or {}
    return {}


def _get_ollama_config() -> tuple[str, str]:
    config = _load_config()
    ollama = config.get("ollama", {})
    return (
        ollama.get("base_url", "http://localhost:11434"),
        ollama.get("default_model", "qwen2.5-coder:14b"),
    )


# ─────────────────────────────────────────────────────────────
# Startup validation
# ─────────────────────────────────────────────────────────────

async def _validate_startup() -> None:
    """
    Validate Ollama is running and the configured model is available.
    Fails fast with a clear error message if not.
    """
    base_url, model = _get_ollama_config()

    print(f"  Checking Ollama at {base_url}...")
    health = await llm_client.check_ollama_health(base_url)

    if not health["reachable"]:
        print(f"\n✗ Startup failed: {health['error']}")
        print("  Fix: run 'brew services start ollama' then try again.")
        sys.exit(1)

    if not llm_client.model_is_available(model, health["models"]):
        print(f"\n✗ Startup failed: model '{model}' not found in Ollama.")
        print(f"  Available models: {health['models']}")
        print(f"  Fix: run 'ollama pull {model}' then try again.")
        sys.exit(1)

    print(f"  ✓ Ollama reachable — model '{model}' available")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown logic."""
    print("\nAIstivus — starting up...")
    print("─" * 40)

    database.init_db()
    await _validate_startup()

    jobsearch_path = Path("jobsearch.md")
    if not jobsearch_path.exists():
        print(
            "\n⚠️  jobsearch.md not found. "
            "Copy JOBSEARCH_TEMPLATE.md to jobsearch.md and fill it in."
        )
    else:
        print("  ✓ jobsearch.md found")

    print("─" * 40)
    print("✓ AIstivus ready")
    print(f"  Open http://127.0.0.1:8080 in your browser\n")

    yield

    print("\nAIstivus — shutting down.")


# ─────────────────────────────────────────────────────────────
# App setup
# ─────────────────────────────────────────────────────────────

app = FastAPI(
    title="AIstivus",
    description="AI Job Search Helper for the Rest of Us",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS — localhost only. Never wildcard.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["Content-Type"],
)

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")



# ─────────────────────────────────────────────────────────────
# Request / Response models
# ─────────────────────────────────────────────────────────────

class EvaluateRequest(BaseModel):
    jd_text:       str
    company_name:  str        = "Unknown Company"
    job_title:     str        = "Unknown Role"
    location:      str | None = None
    remote_type:   str | None = None
    apply_url:     str | None = None
    llm_model_id:  int | None = None
    force:         bool       = False


class EvaluateResponse(BaseModel):
    success:            bool
    evaluation_id:      int | None
    job_id:             int | None
    report_path:        str | None
    evaluation:         dict | None
    error:              str | None
    duplicate_detected: bool            = False
    existing_jobs:      list | None     = None


class RerunRequest(BaseModel):
    job_id:       int
    llm_model_id: int | None = None


# ─────────────────────────────────────────────────────────────
# Page routes — serve HTML files
# ─────────────────────────────────────────────────────────────

@app.get("/", response_class=FileResponse)
async def serve_index():
    """Landing page."""
    path = Path("pages/index.html")
    if not path.exists():
        raise HTTPException(status_code=404, detail="index.html not found.")
    return FileResponse(path)


@app.get("/evaluate", response_class=FileResponse)
async def serve_evaluate():
    """Evaluation input page."""
    path = Path("pages/evaluate.html")
    if not path.exists():
        raise HTTPException(status_code=404, detail="evaluate.html not found.")
    return FileResponse(path)


@app.get("/jobs", response_class=FileResponse)
async def serve_jobs():
    """Jobs and opportunities page."""
    path = Path("pages/jobs.html")
    if not path.exists():
        raise HTTPException(status_code=404, detail="jobs.html not found.")
    return FileResponse(path)


@app.get("/settings", response_class=FileResponse)
async def serve_settings():
    """Settings page."""
    path = Path("pages/settings.html")
    if not path.exists():
        raise HTTPException(status_code=404, detail="settings.html not found.")
    return FileResponse(path)


# ─────────────────────────────────────────────────────────────
# Report viewer
# ─────────────────────────────────────────────────────────────

@app.get("/report", response_class=HTMLResponse)
async def view_report(path: str = Query(..., description="Path to the markdown report file")):
    """
    Read a markdown report file and return it rendered as HTML.
    Uses marked.js on the client side (evaluations.html).
    This endpoint returns the raw markdown — the browser renders it.

    Security: path is validated to be within the /reports/ directory.
    """
    report_path = Path(path).resolve()
    reports_dir = Path("reports").resolve()

    # Validate path is within /reports/ — prevent path traversal
    try:
        report_path.relative_to(reports_dir)
    except ValueError:
        raise HTTPException(
            status_code=403,
            detail="Access denied — report path must be within the reports directory."
        )

    if not report_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Report not found: {path}"
        )

    if not report_path.suffix == ".md":
        raise HTTPException(
            status_code=400,
            detail="Only .md report files are served."
        )

    # Return raw markdown — client uses marked.js to render
    content = report_path.read_text()
    return HTMLResponse(content=content, media_type="text/plain")


# ─────────────────────────────────────────────────────────────
# API routes
# ─────────────────────────────────────────────────────────────

@app.get("/health")
async def health_check():
    """Health check — Ollama status, model availability, DB version."""
    base_url, model = _get_ollama_config()
    ollama_health   = await llm_client.check_ollama_health(base_url)

    model_available = (
        llm_client.model_is_available(model, ollama_health.get("models", []))
        if ollama_health["reachable"]
        else False
    )

    db_version = "unknown"
    try:
        db_version = database.get_schema_version()
    except Exception:
        pass

    return JSONResponse({
        "status":   "ok" if ollama_health["reachable"] and model_available else "degraded",
        "ollama":   {
            "reachable":       ollama_health["reachable"],
            "model":           model,
            "model_available": model_available,
            "error":           ollama_health.get("error"),
        },
        "database": {"schema_version": db_version},
        "version":  "0.1.0",
    })


@app.get("/stats")
async def stats():
    """Summary counts for the landing page dashboard."""
    with database.get_connection() as conn:
        jobs        = conn.execute("SELECT COUNT(*) FROM jobs").fetchone()[0]
        evals       = conn.execute("SELECT COUNT(*) FROM evaluations").fetchone()[0]
        companies   = conn.execute("SELECT COUNT(*) FROM companies").fetchone()[0]
        apps        = conn.execute("SELECT COUNT(*) FROM applications").fetchone()[0]

    return JSONResponse({
        "jobs":        jobs,
        "evaluations": evals,
        "companies":   companies,
        "applications": apps
    })


@app.post("/evaluate", response_model=EvaluateResponse)
async def evaluate_endpoint(request: EvaluateRequest):
    """
    Evaluate a job description against jobsearch.md.

    Note: Phase 0 is synchronous — this request blocks until evaluation
    completes. This is intentional for single-user local use.
    Long-running async pattern added in Phase 1.
    """
    if not request.jd_text.strip():
        raise HTTPException(status_code=400, detail="jd_text cannot be empty.")

    if not request.force:
        existing = database.find_existing_job(request.company_name, request.job_title)
        if existing:
            return EvaluateResponse(
                success=False,
                duplicate_detected=True,
                existing_jobs=existing,
                evaluation_id=None,
                job_id=None,
                report_path=None,
                evaluation=None,
                error=None,
            )

    result = await evaluator.evaluate_jd(
        jd_text=request.jd_text,
        company_name=request.company_name,
        job_title=request.job_title,
        location=request.location,
        remote_type=request.remote_type,
        apply_url=request.apply_url,
        llm_model_id=request.llm_model_id,
    )

    return EvaluateResponse(**result)


@app.get("/jobs")
async def list_jobs():
    """All jobs with latest evaluation scores."""
    jobs = database.get_all_jobs()
    return JSONResponse([dict(row) for row in jobs])


@app.get("/jobs/{job_id}")
async def get_job(job_id: int):
    """Single job with all evaluations and postings."""
    job = database.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found.")

    evaluations = database.get_evaluations_for_job(job_id)
    postings    = database.get_postings_for_job(job_id)

    job_dict = dict(job)
    evals_out = []
    for e in evaluations:
        d = dict(e)
        d["report_path"] = _find_report(
            company_name=job_dict.get("company_name", ""),
            job_title=job_dict.get("title", ""),
            evaluated_at=d.get("evaluated_at", ""),
        )
        evals_out.append(d)

    return JSONResponse({
        "job":         job_dict,
        "evaluations": evals_out,
        "postings":    [dict(p) for p in postings],
    })


ANTHROPIC_MODELS = [
    {"id": "claude-haiku-4-5-20251001", "label": "Claude Haiku — Fast, low cost",         "provider": "anthropic"},
    {"id": "claude-sonnet-4-6",         "label": "Claude Sonnet — Balanced (recommended)", "provider": "anthropic"},
    {"id": "claude-opus-4-6",           "label": "Claude Opus — Most capable",             "provider": "anthropic"},
]


@app.get("/api/models")
async def list_models():
    """Return available Ollama and Anthropic models for the model picker UI."""
    base_url, default_model = _get_ollama_config()
    health = await llm_client.check_ollama_health(base_url)

    models: list[dict] = []
    if health["reachable"]:
        models.extend(
            {"id": name, "label": name, "provider": "ollama"}
            for name in health["models"]
        )

    if llm_client.check_anthropic_configured():
        models.extend(ANTHROPIC_MODELS)

    return JSONResponse({"models": models, "default": default_model})


@app.get("/api/jobs-with-evaluations")
async def list_jobs_with_evaluations():
    """
    Return all jobs with their best evaluation score and total evaluation count.
    Used by jobs.html for the jobs list with scoring summary.
    """
    with database.get_connection() as conn:
        rows = conn.execute(
            """SELECT j.*,
                      c.name AS company_name,
                      COUNT(e.id) AS evaluation_count,
                      MAX(e.score_overall) AS best_score,
                      (SELECT fit_type FROM evaluations
                       WHERE job_id = j.id
                       ORDER BY score_overall DESC NULLS LAST, evaluated_at DESC
                       LIMIT 1) AS best_fit_type,
                      (SELECT model_used FROM evaluations
                       WHERE job_id = j.id
                       ORDER BY score_overall DESC NULLS LAST, evaluated_at DESC
                       LIMIT 1) AS best_model,
                      (SELECT apply_url FROM job_postings
                       WHERE job_id = j.id
                       ORDER BY date_scraped DESC
                       LIMIT 1) AS apply_url,
                      (SELECT id FROM applications
                       WHERE job_id = j.id
                         AND application_status NOT IN ('rejected', 'withdrawn', 'ghosted')
                       LIMIT 1) AS application_id,
                      (SELECT application_status FROM applications
                       WHERE job_id = j.id
                         AND application_status NOT IN ('rejected', 'withdrawn', 'ghosted')
                       LIMIT 1) AS application_status
               FROM jobs j
               JOIN companies c ON c.id = j.company_id
               LEFT JOIN evaluations e ON e.job_id = j.id
               GROUP BY j.id

               ORDER BY best_score DESC NULLS LAST, j.last_seen_date DESC"""
        ).fetchall()

    result = []
    for row in rows:
        d = dict(row)
        # Attach best_evaluation as a nested object for the frontend
        d["best_evaluation"] = {
            "score_overall": d.pop("best_score"),
            "fit_type":      d.pop("best_fit_type"),
            "model_used":    d.pop("best_model"),
        } if d.get("evaluation_count", 0) > 0 else None
        if "best_score" in d: d.pop("best_score", None)
        result.append(d)

    return JSONResponse(result)


@app.get("/api/evaluations")
async def list_evaluations():
    """
    All evaluations joined with job and company data.
    Sorted by evaluated_at descending (newest first).
    """
    with database.get_connection() as conn:
        rows = conn.execute(
            """SELECT e.*,
                      j.title,
                      j.location,
                      j.remote_type,
                      c.name AS company_name
               FROM evaluations e
               JOIN jobs j      ON j.id = e.job_id
               JOIN companies c ON c.id = j.company_id
               ORDER BY e.evaluated_at DESC"""
        ).fetchall()

    return JSONResponse([dict(row) for row in rows])


@app.get("/api/evaluations/{evaluation_id}")
async def get_evaluation(evaluation_id: int):
    """
    Single evaluation with full detail including job and company data.
    Also includes report_path derived from the reports directory.
    """
    with database.get_connection() as conn:
        row = conn.execute(
            """SELECT e.*,
                      j.title,
                      j.location,
                      j.remote_type,
                      j.pay_band,
                      c.name AS company_name
               FROM evaluations e
               JOIN jobs j      ON j.id = e.job_id
               JOIN companies c ON c.id = j.company_id
               WHERE e.id = ?""",
            (evaluation_id,)
        ).fetchone()

    if not row:
        raise HTTPException(
            status_code=404,
            detail=f"Evaluation {evaluation_id} not found."
        )

    data = dict(row)

    # Find the report file for this evaluation if it exists
    # Report files are named: YYYYMMDD_Company_Role.md
    # We look for the most recent matching file in /reports/
    report_path = _find_report(
        company_name=data.get("company_name", ""),
        job_title=data.get("title", ""),
        evaluated_at=data.get("evaluated_at", ""),
    )
    data["report_path"] = report_path

    return JSONResponse(data)


class ImportEvaluationRequest(BaseModel):
    job_id: int
    model_used: str
    score_overall: int | None = None
    score_role_fit: int | None = None
    score_scope_fit: int | None = None
    score_culture: int | None = None
    score_comp: int | None = None
    fit_type: str | None = None
    archetype: str | None = None
    strengths: str | None = None
    gaps: str | None = None
    recommendation: str | None = None
    keywords: str | None = None
    log_entry: str | None = None
    raw_response: str | None = None


@app.post("/api/evaluations/import")
async def import_evaluation(request: ImportEvaluationRequest):
    """
    Import a manually-produced evaluation (e.g. from a Claude session).
    Creates a new evaluation record identical in structure to a pipeline evaluation.
    All score fields are nullable — partial imports are accepted.
    """
    import hashlib, json
    job = database.get_job(request.job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {request.job_id} not found.")

    prompt_hash = hashlib.sha256(
        json.dumps({"source": "manual_import", "model": request.model_used}).encode()
    ).hexdigest()

    eval_id = database.insert_evaluation(
        job_id=request.job_id,
        model_used=request.model_used,
        score_overall=request.score_overall,
        score_role_fit=request.score_role_fit,
        score_scope_fit=request.score_scope_fit,
        score_culture=request.score_culture,
        score_comp=request.score_comp,
        fit_type=request.fit_type,
        archetype=request.archetype,
        strengths=request.strengths,
        gaps=request.gaps,
        recommendation=request.recommendation,
        keywords=request.keywords,
        log_entry=request.log_entry,
        prompt_hash=prompt_hash,
        raw_response=request.raw_response,
    )
    return JSONResponse({"success": True, "evaluation_id": eval_id})

class CreateApplicationRequest(BaseModel):
    job_id: int
    excitement_level: int | None = None

class UpdateApplicationRequest(BaseModel):
    excitement_level: int | None = None
    application_status: str | None = None
    apply_date: str | None = None
    end_date: str | None = None

class AddLogRequest(BaseModel):
    note_type: str
    note: str
    url: str | None = None
    timestamp: str | None = None

class UpdateSettingsRequest(BaseModel):
    settings: dict[str, str]

class ProcessInboxRequest(BaseModel):
    filenames: list[str]


@app.post("/api/evaluations/rerun")
async def rerun_evaluation(request: RerunRequest):
    """
    Re-evaluate an existing job with a specified model.
    Creates a new evaluation record — does not overwrite existing ones.
    Multiple evaluations per job are expected and supported.
    """
    job = database.get_job(request.job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {request.job_id} not found.")

    # Get the best available description for this job
    postings = database.get_postings_for_job(request.job_id)
    jd_text  = dict(job).get("description_merged") or ""
    if not jd_text and postings:
        jd_text = dict(postings[0]).get("description_raw") or ""

    if not jd_text.strip():
        raise HTTPException(
            status_code=400,
            detail="No job description available for this job. "
                   "The JD text may not have been stored."
        )

    result = await evaluator.evaluate_jd(
        jd_text=jd_text,
        company_name=dict(job).get("company_name", "Unknown Company"),
        job_title=dict(job).get("title", "Unknown Role"),
        location=dict(job).get("location"),
        remote_type=dict(job).get("remote_type"),
        llm_model_id=request.llm_model_id,
    )

    return JSONResponse(result)


def _find_report(company_name: str, job_title: str, evaluated_at: str) -> str | None:
    """
    Find the most likely report file for a given evaluation.
    Matches on date prefix from evaluated_at timestamp.
    """
    reports_dir = Path("reports")
    if not reports_dir.exists():
        return None

    # Extract date from evaluated_at (format: YYYY-MM-DD HH:MM:SS or ISO)
    date_prefix = ""
    if evaluated_at:
        date_prefix = evaluated_at[:10].replace("-", "")  # YYYYMMDD

    # Look for files starting with the date prefix
    candidates = list(reports_dir.glob(f"{date_prefix}_*.md")) if date_prefix else []

    if not candidates:
        # Fall back: return most recent report file
        all_reports = sorted(reports_dir.glob("*.md"), reverse=True)
        return str(all_reports[0]) if all_reports else None

    # Return most recent matching file
    candidates.sort(reverse=True)
    return str(candidates[0])


@app.get("/applications", response_class=FileResponse)
async def serve_applications():
    """Applications list page."""
    path = Path("pages/applications.html")
    if not path.exists():
        raise HTTPException(status_code=404, detail="applications.html not found.")
    return FileResponse(path)


@app.get("/applications/{application_id}", response_class=FileResponse)
async def serve_application_detail(application_id: int):
    """Application detail page."""
    path = Path("pages/application_detail.html")
    if not path.exists():
        raise HTTPException(status_code=404, detail="application_detail.html not found.")
    return FileResponse(path)


@app.post("/api/applications")
async def create_application(request: CreateApplicationRequest):
    """
    Create a new application from a job.
    Returns 409 if an application already exists for this job.
    """
    # Check for existing application
    with database.get_connection() as conn:
        existing = conn.execute(
            "SELECT id FROM applications WHERE job_id = ?",
            (request.job_id,)
        ).fetchone()
        if existing:
            raise HTTPException(
                status_code=409,
                detail=f"Application already exists for job {request.job_id}. "
                       f"Application ID: {existing['id']}"
            )

    from datetime import datetime, timezone
    app_id = database.insert_application(
        job_id=request.job_id,
        application_status="draft",
        excitement_level=request.excitement_level,
        apply_date=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
    )
    return JSONResponse({"success": True, "application_id": app_id})


@app.get("/api/applications")
async def list_applications():
    """
    All applications joined with job, company, and latest evaluation data.
    Sorted by apply_date descending.
    """
    with database.get_connection() as conn:
        rows = conn.execute(
            """SELECT a.*,
                      j.title, j.location, j.remote_type, j.pay_band,
                      c.name AS company_name,
                      e.score_overall, e.fit_type, e.recommendation
               FROM applications a
               JOIN jobs j      ON j.id = a.job_id
               JOIN companies c ON c.id = j.company_id
               LEFT JOIN evaluations e ON e.id = (
                   SELECT id FROM evaluations
                   WHERE job_id = a.job_id
                   ORDER BY score_overall DESC NULLS LAST, evaluated_at DESC
                   LIMIT 1
               )
               ORDER BY a.apply_date DESC"""
        ).fetchall()
    return JSONResponse([dict(row) for row in rows])


@app.get("/api/applications/{application_id}")
async def get_application(application_id: int):
    """
    Single application with all related data:
    job, company, all evaluations, logs, audit trail.
    """
    with database.get_connection() as conn:
        app_row = conn.execute(
            """SELECT a.*,
                      j.title, j.location, j.remote_type, j.pay_band,
                      j.description_merged, j.role_keyword,
                      c.name AS company_name
               FROM applications a
               JOIN jobs j      ON j.id = a.job_id
               JOIN companies c ON c.id = j.company_id
               WHERE a.id = ?""",
            (application_id,)
        ).fetchone()

        if not app_row:
            raise HTTPException(
                status_code=404,
                detail=f"Application {application_id} not found."
            )

        logs = conn.execute(
            """SELECT * FROM application_logs
               WHERE application_id = ?
               ORDER BY created_at DESC""",
            (application_id,)
        ).fetchall()

        audit = conn.execute(
            """SELECT * FROM application_audit
               WHERE application_id = ?
               ORDER BY timestamp DESC""",
            (application_id,)
        ).fetchall()

        evaluations = conn.execute(
            """SELECT * FROM evaluations
               WHERE job_id = ?
               ORDER BY score_overall DESC NULLS LAST, evaluated_at DESC""",
            (dict(app_row)["job_id"],)
        ).fetchall()

        postings = conn.execute(
            """SELECT * FROM job_postings
               WHERE job_id = ?
               ORDER BY date_scraped DESC""",
            (dict(app_row)["job_id"],)
        ).fetchall()

    return JSONResponse({
        "application": dict(app_row),
        "logs":        [dict(n) for n in logs],
        "audit":       [dict(a) for a in audit],
        "evaluations": [dict(e) for e in evaluations],
        "postings":    [dict(p) for p in postings],
    })


@app.patch("/api/applications/{application_id}")
async def update_application(application_id: int, request: UpdateApplicationRequest):
    """Update application fields. Writes audit event on status change."""
    with database.get_connection() as conn:
        existing = conn.execute(
            "SELECT * FROM applications WHERE id = ?",
            (application_id,)
        ).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Application not found.")

        updates = {
            k: v for k, v in request.model_dump().items()
            if v is not None
        }
        if not updates:
            return JSONResponse({"success": True, "message": "Nothing to update."})

        set_clause = ", ".join(f"{k} = ?" for k in updates)
        conn.execute(
            f"UPDATE applications SET {set_clause} WHERE id = ?",
            (*updates.values(), application_id)
        )

        # Write audit event for status changes
        if "application_status" in updates:
            old_status = dict(existing)["application_status"]
            new_status = updates["application_status"]
            if old_status != new_status:
                database._audit_application(
                    application_id,
                    f"Status changed: {old_status} → {new_status}",
                    conn=conn
                )

    return JSONResponse({"success": True})


@app.post("/api/applications/{application_id}/logs")
async def add_log(application_id: int, request: AddLogRequest):
    """
    Add a timestamped log entry to an application.
    Log entries are append-only — no editing after creation.
    Valid note_type values: recruiter_call, interview_feedback,
    compensation, general, repost_alert, application_question
    """
    valid_types = {
        "recruiter_call", "interview_feedback", "compensation",
        "general", "repost_alert", "application_question"
    }
    if request.note_type not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid note_type. Valid values: {', '.join(sorted(valid_types))}"
        )

    log_id = database.add_application_log(
        application_id=application_id,
        note_type=request.note_type,
        note=request.note,
        url=request.url,
        timestamp=request.timestamp,
    )
    return JSONResponse({"success": True, "log_id": log_id})


@app.delete("/api/applications/{application_id}/logs/{note_id}")
async def delete_log(application_id: int, note_id: int):
    """
    Delete a single log entry by id.
    Audit entries cannot be deleted — this only affects application_logs.
    """
    deleted = database.delete_application_note(note_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Log entry {note_id} not found.")
    return JSONResponse({"success": True})

class UpdateLogTimestampRequest(BaseModel):
    timestamp: str


@app.patch("/api/applications/{application_id}/logs/{note_id}/timestamp")
async def update_log_timestamp(application_id: int, note_id: int, request: UpdateLogTimestampRequest):
    """Update the displayed timestamp of a non-audit log entry."""
    updated = database.update_application_log_timestamp(note_id, request.timestamp)
    if not updated:
        raise HTTPException(status_code=404, detail=f"Log entry {note_id} not found.")
    return JSONResponse({"success": True})


@app.patch("/api/applications/{application_id}/audit/{audit_id}/timestamp")
async def update_application_audit_timestamp(application_id: int, audit_id: int, request: UpdateLogTimestampRequest):
    """Update the display timestamp of an audit entry. created_at is preserved."""
    updated = database.update_application_audit_timestamp(audit_id, request.timestamp)
    if not updated:
        raise HTTPException(status_code=404, detail=f"Audit entry {audit_id} not found.")
    return JSONResponse({"success": True})


@app.post("/api/applications/{application_id}/generate-prompt")
async def generate_prompt(application_id: int):
    """
    Build a structured AI prompt for this application and store it as a log entry.
    Fetches job details, full JD text, and the latest evaluation.
    Returns the generated prompt and its log id.
    """
    with database.get_connection() as conn:
        app_row = conn.execute(
            "SELECT * FROM applications WHERE id = ?",
            (application_id,)
        ).fetchone()

    if not app_row:
        raise HTTPException(
            status_code=404,
            detail=f"Application {application_id} not found."
        )

    job = database.get_job(app_row["job_id"])
    if not job:
        raise HTTPException(
            status_code=404,
            detail=f"Job {app_row['job_id']} not found."
        )

    eval_row = database.get_latest_evaluation(app_row["job_id"])

    company_name   = job["company_name"] or "N/A"
    title          = job["title"] or "N/A"
    location       = job["location"] or "N/A"
    pay_band       = job["pay_band"] or "Not listed"
    jd_text        = job["description_merged"] or ""

    if eval_row:
        score          = eval_row["score_overall"]
        fit_type       = eval_row["fit_type"] or "N/A"
        archetype      = eval_row["archetype"] or "N/A"
        recommendation = eval_row["recommendation"] or "N/A"
        model_used     = eval_row["model_used"] or "N/A"
        strengths      = eval_row["strengths"] or "N/A"
        gaps           = eval_row["gaps"] or "N/A"
        keywords       = eval_row["keywords"] or "N/A"
        score_display  = f"{score}/10" if score is not None else "N/A"

        def _fmt(v):
            return f"{v}/5" if v is not None else "N/A"

        score_role_fit_display = _fmt(eval_row["score_role_fit"])
        score_scope_display    = _fmt(eval_row["score_scope_fit"])
        score_culture_display  = _fmt(eval_row["score_culture"])
        score_comp_display     = _fmt(eval_row["score_comp"])
    else:
        score_display = "N/A"
        fit_type = archetype = recommendation = model_used = "N/A"
        strengths = gaps = keywords = "N/A"
        score_role_fit_display = score_scope_display = "N/A"
        score_culture_display  = score_comp_display  = "N/A"

    prompt = f"""Read this information and the attached jobsearch.md file before starting.
When evaluating, apply the Section 7 framework exactly as written.
When tailoring, apply all Section 6 Always and Never rules without exception.
Treat Section 9 session instructions as active constraints throughout this session.


JOB DETAILS:
Company: {company_name}
Title: {title}
Location: {location}
Pay Band: {pay_band}

JOB DESCRIPTION:
{jd_text}

LOCAL AI EVALUATION RESULTS:
Dimension Scores: Role fit: {score_role_fit_display} | Scope fit: {score_scope_display} | Culture: {score_culture_display} | Comp: {score_comp_display}
Overall Score: {score_display}
Fit Type: {fit_type}
Role Archetype: {archetype}
Recommendation: {recommendation}
Model Used: {model_used}

Strengths identified:
{strengths}

Gaps identified:
{gaps}

ATS Keywords extracted:
{keywords}

Keyword gaps (tailoring targets):
Identify any keywords or phrases from the JD above that appear in
neither the ATS keywords list above nor the master resume in Section 5
of the attached jobsearch.md. List these separately as tailoring targets
when producing resume changes.

TASKS:
1. Produce a full evaluation scorecard using the Section 7 framework
   in the attached jobsearch.md. Include:
   - Dimension scores (1-5 each): Role fit / Scope fit / Culture
     signals / Comp signals
   - Overall score (1-10) and one-sentence verdict
   - Fit type: Core Fit / Stretch / Mismatch with reasoning
   - Role archetype
   - Strengths of this match (bullets)
   - Gaps or concerns (bullets)
   - Interview process analysis: if the JD above includes interview
     stages, flag any stage that conflicts with known gaps or
     deal-breakers from Section 4 of the attached jobsearch.md
   - Recommended action: Apply / Apply with modifications / Skip
   Use the local evaluation above as a reference, not as ground truth.

2. Assess overall fit for this role. What is your honest assessment
   of the candidate's likelihood of success?

3. Stop and ask if I want to proceed with the next phase or not.

If I want to proceed then complete the following tasks:
   
1. Using the attached resume_template.typ as the exact structural
and formatting base, generate a complete, ready-to-compile
.typ file tailored to this role. Populate every [CONTENT: ...]
block using jobsearch.md as the sole source of truth for facts.
Apply all Always and Never rules from Section 6 without
exception — flag any conflicts explicitly. Flag any tailored
claim that could be challenged in an interview. Do not modify
any formatting, font, color, spacing, or layout code in the
template — only replace [CONTENT: ...] comments with real
content. Target output: 2 pages when compiled. If the content 
does not naturally fill page 2, add additional bullets drawn 
from jobsearch.md to the experience sections most relevant to 
this specific role or expand text on existing bullets — focus 
and priority are to add meaningful additional context for this 
application.

2. After you deliver the evaluation scorecard and before asking whether
   to proceed, output the following block exactly — no prose before or
   after it on those lines:

EVALUATION_JSON_START
{{
  "score_overall": <1-10 integer>,
  "score_role_fit": <1-5 integer>,
  "score_scope_fit": <1-5 integer>,
  "score_culture": <1-5 integer>,
  "score_comp": <1-5 integer>,
  "fit_type": "<Core Fit | Stretch | Mismatch>",
  "archetype": "<role archetype label>",
  "strengths": "<bullet 1|bullet 2|bullet 3>",
  "gaps": "<bullet 1|bullet 2>",
  "recommendation": "<Apply | Apply with modifications | Skip>",
  "keywords": "<comma-separated ATS keywords, 25-35 terms>",
  "log_entry": "<one-sentence verdict>"
}}
EVALUATION_JSON_END

Pipe-separate multiple strengths and gaps bullets within their string values.
Do not add trailing commas. Output valid JSON only between the sentinel lines.

"""

    log_id = database.add_application_log(
        application_id=application_id,
        note_type="prompt",
        note=prompt,
        url=None,
    )
    return JSONResponse({"success": True, "log_id": log_id, "prompt": prompt})





@app.get("/api/settings")
async def get_settings():
    """Return all user settings as a flat dict, plus server-side booleans."""
    data = database.get_all_settings()
    data["anthropic_api_key_configured"] = bool(os.environ.get("ANTHROPIC_API_KEY"))
    return JSONResponse(data)


@app.patch("/api/settings")
async def update_settings(request: UpdateSettingsRequest):
    """Update one or more settings keys. Creates keys that do not exist."""
    for key, value in request.settings.items():
        database.set_setting(key, value)
    return JSONResponse({"success": True})


@app.get("/api/jobs/{job_id}/application")
async def get_job_application(job_id: int):
    """
    Check if a job has an existing application.
    Returns application id and status if found, null if not.
    Used by jobs.html to determine whether to show
    'Create Application' or 'View Application' button.
    """
    with database.get_connection() as conn:
        row = conn.execute(
            """SELECT a.id, a.application_status, a.excitement_level,
                      a.apply_date
               FROM applications a
               WHERE a.job_id = ?
               LIMIT 1""",
            (job_id,)
        ).fetchone()

    if row:
        return JSONResponse({"exists": True, "application": dict(row)})
    return JSONResponse({"exists": False, "application": None})


# ─────────────────────────────────────────────────────────────
# Inbox routes
# ─────────────────────────────────────────────────────────────

@app.get("/api/inbox/files")
async def list_inbox_files():
    """List pending .md/.txt files in inbox/ root."""
    inbox_dir, _, _ = evaluate._get_inbox_paths()
    inbox_dir.mkdir(parents=True, exist_ok=True)
    pending = sorted([
        f.name for f in inbox_dir.iterdir()
        if f.is_file() and f.suffix in {".md", ".txt"}
        and f.parent == inbox_dir
    ])
    return JSONResponse({"pending": pending})


@app.post("/api/inbox/process")
async def process_inbox(request: ProcessInboxRequest):
    """
    Process selected inbox files by filename.
    Filenames must be bare names (no path components) of files in inbox/.
    """
    if not request.filenames:
        raise HTTPException(status_code=400, detail="No filenames provided.")
    for name in request.filenames:
        if "/" in name or "\\" in name or name.startswith("."):
            raise HTTPException(status_code=400, detail=f"Invalid filename: {name}")
    try:
        result = await evaluate.process_inbox_files(filenames=request.filenames)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return JSONResponse(result)


# ─────────────────────────────────────────────────────────────
# Entrypoint
# ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    config     = _load_config()
    app_config = config.get("app", {})
    host       = app_config.get("host", "127.0.0.1")
    port       = app_config.get("port", 8080)

    print(f"Starting AIstivus on http://{host}:{port}")
    uvicorn.run("main:app", host=host, port=port, reload=False)