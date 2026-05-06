"""
main.py
───────
FastAPI server for AIstivus.

Phase 0 routes:
  GET  /            → landing page (index.html)
  GET  /evaluate    → evaluate page (evaluate.html)
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
"""

import sys
from contextlib import asynccontextmanager
from pathlib import Path

import yaml
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from pydantic import BaseModel

import database
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


# ─────────────────────────────────────────────────────────────
# Request / Response models
# ─────────────────────────────────────────────────────────────

class EvaluateRequest(BaseModel):
    jd_text:      str
    company_name: str        = "Unknown Company"
    job_title:    str        = "Unknown Role"
    location:     str | None = None
    remote_type:  str | None = None
    apply_url:    str | None = None
    model:        str | None = None


class EvaluateResponse(BaseModel):
    success:       bool
    evaluation_id: int | None
    job_id:        int | None
    report_path:   str | None
    evaluation:    dict | None
    error:         str | None


class RerunRequest(BaseModel):
    job_id: int
    model:  str
    

# ─────────────────────────────────────────────────────────────
# Page routes — serve HTML files
# ─────────────────────────────────────────────────────────────

@app.get("/", response_class=FileResponse)
async def serve_index():
    """Landing page."""
    path = Path("index.html")
    if not path.exists():
        raise HTTPException(status_code=404, detail="index.html not found.")
    return FileResponse(path)


@app.get("/evaluate", response_class=FileResponse)
async def serve_evaluate():
    """Evaluation input page."""
    path = Path("evaluate.html")
    if not path.exists():
        raise HTTPException(status_code=404, detail="evaluate.html not found.")
    return FileResponse(path)


@app.get("/jobs", response_class=FileResponse)
async def serve_jobs():
    """Jobs and opportunities page."""
    path = Path("jobs.html")
    if not path.exists():
        raise HTTPException(status_code=404, detail="jobs.html not found.")
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

    result = await evaluator.evaluate_jd(
        jd_text=request.jd_text,
        company_name=request.company_name,
        job_title=request.job_title,
        location=request.location,
        remote_type=request.remote_type,
        apply_url=request.apply_url,
        model=request.model,
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


@app.get("/api/models")
async def list_models():
    """Return available Ollama models for the model picker UI."""
    base_url, _ = _get_ollama_config()
    health = await llm_client.check_ollama_health(base_url)
    if not health["reachable"]:
        raise HTTPException(status_code=503, detail="Ollama not reachable.")
    return JSONResponse({"models": health["models"]})


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
                       LIMIT 1) AS best_model
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

    # Determine provider from model name
    # Phase 0: Ollama only. Phase 1+ adds anthropic/openai routing here.
    base_url, _ = _get_ollama_config()
    provider     = llm_client.PROVIDER_OLLAMA

    result = await evaluator.evaluate_jd(
        jd_text=jd_text,
        company_name=dict(job).get("company_name", "Unknown Company"),
        job_title=dict(job).get("title", "Unknown Role"),
        location=dict(job).get("location"),
        remote_type=dict(job).get("remote_type"),
        model=request.model,
        provider=provider,
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
    path = Path("applications.html")
    if not path.exists():
        raise HTTPException(status_code=404, detail="applications.html not found.")
    return FileResponse(path)


@app.get("/applications/{application_id}", response_class=FileResponse)
async def serve_application_detail(application_id: int):
    """Application detail page."""
    path = Path("application_detail.html")
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
        score        = eval_row["score_overall"]
        fit_type     = eval_row["fit_type"] or "N/A"
        archetype    = eval_row["archetype"] or "N/A"
        recommendation = eval_row["recommendation"] or "N/A"
        model_used   = eval_row["model_used"] or "N/A"
        strengths    = eval_row["strengths"] or "N/A"
        gaps         = eval_row["gaps"] or "N/A"
        keywords     = eval_row["keywords"] or "N/A"
        score_display = f"{score}/10" if score is not None else "N/A"
    else:
        score_display = "N/A"
        fit_type = archetype = recommendation = model_used = "N/A"
        strengths = gaps = keywords = "N/A"

    prompt = f"""I am going to share my background context (jobsearch.md) after this message. Please wait for that before completing tasks 3 and 4.
You can complete tasks 1 and 2 immediately.

JOB DETAILS:
Company: {company_name}
Title: {title}
Location: {location}
Pay Band: {pay_band}

JOB DESCRIPTION:
{jd_text}

LOCAL AI EVALUATION RESULTS:
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

Keyword gaps (keywords from JD unlikely to appear in resume — tailoring targets):
(Not separately stored — review the ATS keywords above against your resume)

TASKS:
1. Review and validate the evaluation scoring above. Do you agree
   with the overall assessment? What would you change and why?

2. Assess overall fit for this role. What is your honest assessment
   of the candidate's likelihood of success in this role?

3. Based on the keywords, keyword gaps, and JD requirements, what
   specific changes should be made to a resume? Be prescriptive —
   give exact language where possible. Ensure as many ATS keywords
   as possible are represented while remaining accurate to the
   candidate's actual experience.

4. What are the 3-5 most important things to highlight for this
   specific role? What should be front and center?

Note: I will provide my full background context (jobsearch.md)
separately in this conversation."""

    log_id = database.add_application_log(
        application_id=application_id,
        note_type="prompt",
        note=prompt,
        url=None,
    )
    return JSONResponse({"success": True, "log_id": log_id, "prompt": prompt})





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