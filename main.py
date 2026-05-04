"""
main.py
───────
FastAPI server for AIstivus.

Phase 0 routes:
  GET  /            → landing page (index.html)
  GET  /evaluate    → evaluate page (evaluate.html)
  GET  /evaluations → evaluations history page (evaluations.html)
  POST /evaluate    → run evaluation, return JSON result
  GET  /health      → health check (Ollama + DB status)
  GET  /report      → render a markdown report as HTML
  GET  /stats       → summary counts for landing page
  GET  /jobs        → all jobs with latest scores
  GET  /jobs/{id}   → single job with evaluations and postings
  GET  /api/evaluations      → all evaluations with job+company data
  GET  /api/evaluations/{id} → single evaluation detail
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
    allow_methods=["GET", "POST"],
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
    source_url:   str | None = None
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


@app.get("/evaluations", response_class=FileResponse)
async def serve_evaluations():
    """Evaluations history page."""
    path = Path("evaluations.html")
    if not path.exists():
        raise HTTPException(status_code=404, detail="evaluations.html not found.")
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

    return JSONResponse({
        "jobs":        jobs,
        "evaluations": evals,
        "companies":   companies,
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
        source_url=request.source_url,
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

    return JSONResponse({
        "job":         dict(job),
        "evaluations": [dict(e) for e in evaluations],
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


class RerunRequest(BaseModel):
    job_id: int
    model:  str


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