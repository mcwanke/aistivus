"""
main.py
───────
FastAPI server for AIstivus Phase 0.

Phase 0 routes:
  GET  /         → serves index.html
  POST /evaluate → evaluate a JD and return results
  GET  /health   → health check (Ollama + DB status)

Phase 1+: full route structure via backend/routes/
"""

import asyncio
import sys
from contextlib import asynccontextmanager
from pathlib import Path

import yaml
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
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
    Validate that Ollama is running and the configured model is available.
    Called on server startup — fails fast with a clear error message.
    Per CLAUDE.md: do not start the server if Ollama or model is unavailable.
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

    # Initialize database
    database.init_db()

    # Validate Ollama
    await _validate_startup()

    # Check for jobsearch.md
    jobsearch_path = Path("jobsearch.md")
    if not jobsearch_path.exists():
        print(
            "\n⚠️  jobsearch.md not found. "
            "Copy JOBSEARCH_TEMPLATE.md to jobsearch.md and fill it in "
            "before running evaluations."
        )
    else:
        print("  ✓ jobsearch.md found")

    print("─" * 40)
    print("✓ AIstivus ready\n")

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
# Per CLAUDE.md: allowed origins are localhost dev and prod ports only.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",   # Phase 1+ React dev server
        "http://localhost:8080",   # Phase 0 production build
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
    jd_text: str
    company_name: str = "Unknown Company"
    job_title: str = "Unknown Role"
    location: str | None = None
    remote_type: str | None = None
    source_url: str | None = None
    model: str | None = None


class EvaluateResponse(BaseModel):
    success: bool
    evaluation_id: int | None
    job_id: int | None
    report_path: str | None
    evaluation: dict | None
    error: str | None


# ─────────────────────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────────────────────

@app.get("/")
async def serve_index():
    """Serve the Phase 0 HTML paste interface."""
    index_path = Path("index.html")
    if not index_path.exists():
        raise HTTPException(
            status_code=404,
            detail="index.html not found. Make sure it's in the project root."
        )
    return FileResponse(index_path)


@app.get("/health")
async def health_check():
    """
    Health check endpoint.
    Returns Ollama status, model availability, and DB schema version.
    """
    base_url, model = _get_ollama_config()
    ollama_health = await llm_client.check_ollama_health(base_url)

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
        "status": "ok" if ollama_health["reachable"] and model_available else "degraded",
        "ollama": {
            "reachable": ollama_health["reachable"],
            "model": model,
            "model_available": model_available,
            "error": ollama_health.get("error"),
        },
        "database": {
            "schema_version": db_version,
        },
        "version": "0.1.0",
    })


@app.post("/evaluate", response_model=EvaluateResponse)
async def evaluate_endpoint(request: EvaluateRequest):
    """
    Evaluate a job description against jobsearch.md.

    Accepts JD text plus optional metadata (company, title, location, URL).
    Returns structured evaluation with scores, fit type, keywords, and
    the path to the generated markdown report.

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
    """
    Return all jobs with their latest evaluation scores.
    Phase 0 basic endpoint — full filtering and pagination in Phase 1.
    """
    jobs = database.get_all_jobs()
    return JSONResponse([dict(row) for row in jobs])


@app.get("/jobs/{job_id}")
async def get_job(job_id: int):
    """Return a single job with all its evaluations."""
    job = database.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found.")

    evaluations = database.get_evaluations_for_job(job_id)
    postings = database.get_postings_for_job(job_id)

    return JSONResponse({
        "job": dict(job),
        "evaluations": [dict(e) for e in evaluations],
        "postings": [dict(p) for p in postings],
    })


# ─────────────────────────────────────────────────────────────
# Entrypoint
# ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    config = _load_config()
    app_config = config.get("app", {})

    host = app_config.get("host", "127.0.0.1")
    port = app_config.get("port", 8080)

    print(f"Starting AIstivus on http://{host}:{port}")
    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=False,
    )