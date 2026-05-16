"""
main.py
───────
FastAPI server for AIstivus — Phase 1.0.

All API routes are prefixed /api/v1/.
Page-serving routes (HTML) keep their short paths until Phase 1.1.

API routes:
  GET  /api/v1/health
  GET  /api/v1/stats
  POST /api/v1/evaluate
  POST /api/v1/evaluations/rerun
  POST /api/v1/evaluations/import
  GET  /api/v1/evaluations
  GET  /api/v1/evaluations/{id}
  GET  /api/v1/jobs
  GET  /api/v1/jobs/{id}
  PATCH /api/v1/jobs/{id}
  GET  /api/v1/jobs/{id}/application
  GET  /api/v1/models
  POST /api/v1/models
  PATCH /api/v1/models/{id}
  POST /api/v1/models/{id}/set-default
  DELETE /api/v1/models/{id}
  POST /api/v1/applications
  GET  /api/v1/applications
  GET  /api/v1/applications/{id}
  PATCH /api/v1/applications/{id}
  POST /api/v1/applications/{id}/logs
  DELETE /api/v1/applications/{id}/logs/{log_id}
  PATCH /api/v1/applications/{id}/logs/{log_id}/timestamp
  PATCH /api/v1/applications/{id}/audit/{audit_id}/timestamp
  POST /api/v1/applications/{id}/generate-prompt
  POST /api/v1/applications/{id}/lesson-chat
  GET  /api/v1/llm-call-log
  GET  /api/v1/system-types
  POST /api/v1/system-types
  DELETE /api/v1/system-types/{id}
  GET  /api/v1/settings
  PATCH /api/v1/settings
  GET  /api/v1/settings/app
  PATCH /api/v1/settings/app/{key}
  GET  /api/v1/settings/jobsearch
  PUT  /api/v1/settings/jobsearch
  GET  /api/v1/settings/jobsearch/versions
  GET  /api/v1/settings/jobsearch/versions/{id}
  GET  /api/v1/inbox/files
  POST /api/v1/inbox/process
  GET  /api/v1/profile/health
  GET  /api/v1/profile/sections
  PATCH /api/v1/profile/sections/{section_id}
  GET  /api/v1/profile/versions
  GET  /api/v1/profile/versions/{version_id}
  POST /api/v1/profile/restore/{version_id}
  POST /api/v1/profile/chat
  POST /api/v1/profile/propose-update
  POST /api/v1/profile/synthesize-insights
  POST /api/v1/profile/coherence-check
  POST /api/v1/profile/generate-tailoring-rules

SPA catch-all (Phase 1.1+):
  GET  /{full_path}  → serves frontend/dist/index.html (React Router handles routing)
  GET  /report       → serves raw markdown from /reports/ (path-traversal protected)
"""

import os
import re
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import AsyncGenerator

import yaml
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

import database
import evaluate
import evaluator
import llm_client
import profile_routes
from logger import get_logger

load_dotenv()

log = get_logger(__name__)

# ─────────────────────────────────────────────────────────────
# Rate limiter
# ─────────────────────────────────────────────────────────────

limiter = Limiter(key_func=get_remote_address)

# ─────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────

def _load_config() -> dict:
    config_path = Path("config.yaml")
    if config_path.exists():
        with open(config_path) as f:
            return yaml.safe_load(f) or {}
    return {}


# ─────────────────────────────────────────────────────────────
# Startup helpers
# ─────────────────────────────────────────────────────────────

async def _update_model_availability() -> None:
    """
    Re-check availability of every llm_models record and update the available flag.
    Failures are logged; the app continues regardless — usable for browsing.
    """
    models = database.get_all_llm_models()
    if not models:
        log.warning("no_models_configured", extra={"hint": "add a model in Settings"})
        return

    available_count = 0
    for row in models:
        model_dict = dict(row)
        endpoint = model_dict["endpoint"]
        model_name = model_dict["model"]
        model_id = model_dict["id"]

        try:
            if "anthropic.com" in endpoint:
                is_available = llm_client.check_anthropic_configured()
            else:
                health = await llm_client.check_ollama_health(endpoint)
                is_available = (
                    health.get("reachable", False)
                    and llm_client.model_is_available(model_name, health.get("models", []))
                )
            database.set_llm_model_available(model_id, 1 if is_available else 0)
            if is_available:
                available_count += 1
        except Exception as exc:
            log.warning(
                "model_availability_check_failed",
                extra={"model": model_name, "error": str(exc)},
            )
            database.set_llm_model_available(model_id, 0)

    if available_count == 0:
        log.error(
            "no_models_available",
            extra={"hint": "evaluation will be unavailable; app still usable for browsing"},
        )
    else:
        log.info("models_available", extra={"count": available_count})


# ─────────────────────────────────────────────────────────────
# Lifespan
# ─────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("aistivus_starting")

    database.init_db()
    await _update_model_availability()

    jobsearch_path = Path("jobsearch.md")
    if not jobsearch_path.exists():
        log.warning(
            "jobsearch_md_missing",
            extra={"hint": "copy JOBSEARCH_TEMPLATE.md to jobsearch.md"},
        )

    log.info("aistivus_ready", extra={"url": "http://127.0.0.1:8080"})
    yield
    log.info("aistivus_shutdown")


# ─────────────────────────────────────────────────────────────
# App setup
# ─────────────────────────────────────────────────────────────

app = FastAPI(
    title="AIstivus",
    description="AI Job Search Helper for the Rest of Us",
    version="1.0.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

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
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE"],
    allow_headers=["Content-Type"],
)

app.include_router(profile_routes.router, prefix="/api/v1")

_frontend_assets = Path("frontend/dist/assets")
if _frontend_assets.exists():
    app.mount("/assets", StaticFiles(directory=str(_frontend_assets)), name="frontend-assets")


# ─────────────────────────────────────────────────────────────
# Request / Response models
# ─────────────────────────────────────────────────────────────

class EvaluateRequest(BaseModel):
    jd_text: str
    company_name: str = "Unknown Company"
    job_title: str = "Unknown Role"
    location: str | None = None
    remote_type: str | None = None
    apply_url: str | None = None
    pay_band: str | None = None
    llm_model_id: int | None = None
    force: bool = False


class EvaluateResponse(BaseModel):
    success: bool
    evaluation_id: int | None
    job_id: int | None
    report_path: str | None
    evaluation: dict | None
    error: str | None
    duplicate_detected: bool = False
    existing_jobs: list | None = None


class RerunRequest(BaseModel):
    job_id: int
    llm_model_id: int | None = None


class ImportEvaluationRequest(BaseModel):
    job_id: int
    llm_model_id: int | None = None
    score_overall: float | None = None
    score_role_fit: float | None = None
    score_scope_fit: float | None = None
    score_culture: float | None = None
    score_comp: float | None = None
    fit_type: str | None = None
    archetype: str | None = None
    strengths: str | None = None
    gaps: str | None = None
    recommendation: str | None = None
    keywords: str | None = None
    domain_match: str | None = None
    role_type_match: str | None = None
    keyword_gaps: str | None = None


class CreateApplicationRequest(BaseModel):
    job_id: int


class PatchJobRequest(BaseModel):
    company_name: str | None = None
    title: str | None = None
    location: str | None = None
    remote_type: str | None = None
    description_merged: str | None = None
    pay_band: str | None = None
    role_keyword: str | None = None
    excitement_level: str | None = None
    my_role_fit: float | None = None
    my_scope_fit: float | None = None
    my_culture: float | None = None
    my_comp: float | None = None
    my_score_overall: float | None = None


class AddCompanyLogRequest(BaseModel):
    type_value: str
    log: str | None = None
    url: str | None = None


class UpdateApplicationRequest(BaseModel):
    application_status: str | None = None
    apply_date: str | None = None
    end_date: str | None = None
    requested_salary: str | None = None
    applied: int | None = None


class AddLogRequest(BaseModel):
    type_value: str           # matches system_types.type_value (e.g. "recruiter_call")
    log: str
    url: str | None = None
    log_timestamp: str | None = None


class LessonChatMessage(BaseModel):
    role: str   # "user" | "assistant"
    content: str


class LessonChatRequest(BaseModel):
    messages: list[LessonChatMessage]
    finalize: bool = False


class UpdateAppSettingRequest(BaseModel):
    value: str


class UpdateTimestampRequest(BaseModel):
    timestamp: str


class UpdateSettingsRequest(BaseModel):
    settings: dict[str, str]


class ProcessInboxRequest(BaseModel):
    filenames: list[str]


class CreateModelRequest(BaseModel):
    model: str
    endpoint: str
    model_weight: int = 1
    estimated_eval_time: int | None = None
    enabled: int = 1


class UpdateModelRequest(BaseModel):
    model: str | None = None
    endpoint: str | None = None
    model_weight: int | None = None
    estimated_eval_time: int | None = None
    enabled: int | None = None


class CreateSystemTypeRequest(BaseModel):
    type_name: str
    type_value: str


class SaveJobsearchRequest(BaseModel):
    content: str


class SaveResumeTemplateRequest(BaseModel):
    content: str


# Valid application status values per spec
_VALID_STATUSES = frozenset({
    "not-started", "draft", "applied", "screening", "interview",
    "offer", "rejected", "ghosted", "withdrawn",
})


async def _lesson_sse_generator(
    prompt: str,
    system: str,
    model: str,
    provider: str,
    base_url: str,
    llm_model_id: int,
    job_id: int | None = None,
) -> AsyncGenerator[str, None]:
    """SSE generator for lesson-chat streaming. Logs the call when the stream ends."""
    start_ms = int(time.time() * 1000)
    accumulated: list[str] = []
    had_error = False

    try:
        async for token in llm_client.complete_stream(
            prompt=prompt,
            system=system,
            model=model,
            provider=provider,
            base_url=base_url,
        ):
            if token == "[STREAM_ERROR]":
                had_error = True
                break
            accumulated.append(token)
            yield f"data: {token}\n\n"
    except Exception as exc:
        log.warning("lesson_chat_stream_error", extra={"error": str(exc)})
        had_error = True

    if had_error:
        yield "data: [STREAM_ERROR]\n\n"
    else:
        yield "data: [DONE]\n\n"

    latency_ms = int(time.time() * 1000) - start_ms
    try:
        database.insert_llm_call_log(
            llm_model_id=llm_model_id,
            call_type="chat",
            prompt=prompt,
            raw_response="".join(accumulated) if accumulated else None,
            latency_ms=latency_ms,
            success=0 if had_error else 1,
            job_id=job_id,
        )
    except Exception as log_exc:
        log.warning("lesson_chat_log_error", extra={"error": str(log_exc)})



@app.get("/report", response_class=HTMLResponse, include_in_schema=False)
async def view_report(path: str = Query(..., description="Path to the markdown report file")):
    """Return raw markdown from /reports/ — path traversal protected."""
    report_path = Path(path).resolve()
    reports_dir = Path("reports").resolve()
    try:
        report_path.relative_to(reports_dir)
    except ValueError:
        raise HTTPException(status_code=403, detail="Access denied.")
    if not report_path.exists():
        raise HTTPException(status_code=404, detail=f"Report not found: {path}")
    if report_path.suffix != ".md":
        raise HTTPException(status_code=400, detail="Only .md files are served.")
    return HTMLResponse(content=report_path.read_text(), media_type="text/plain")



# ─────────────────────────────────────────────────────────────
# Health
# ─────────────────────────────────────────────────────────────

@app.get("/api/v1/health")
@limiter.limit("60/minute")
async def health_check(request: Request):
    """Health check — DB schema version, model availability, Anthropic key presence."""
    models = database.get_all_llm_models()
    models_out = [
        {
            "id": dict(m)["id"],
            "model": dict(m)["model"],
            "endpoint": dict(m)["endpoint"],
            "available": bool(dict(m)["available"]),
            "default_flag": bool(dict(m)["default_flag"]),
        }
        for m in models
    ]
    any_available = any(m["available"] for m in models_out)

    db_version = "unknown"
    try:
        db_version = database.get_schema_version()
    except Exception:
        pass

    return JSONResponse({
        "status": "ok" if any_available else "degraded",
        "database": {"schema_version": db_version},
        "models": models_out,
        "anthropic_configured": bool(os.environ.get("ANTHROPIC_API_KEY")),
        "version": "1.0.0",
    })


# ─────────────────────────────────────────────────────────────
# Stats
# ─────────────────────────────────────────────────────────────

@app.get("/api/v1/stats")
@limiter.limit("60/minute")
async def stats(request: Request):
    """Summary counts for the dashboard."""
    return JSONResponse(database.get_stats())


# ─────────────────────────────────────────────────────────────
# Evaluate
# ─────────────────────────────────────────────────────────────

@app.post("/api/v1/evaluate", response_model=EvaluateResponse)
@limiter.limit("10/minute")
async def evaluate_endpoint(request: Request, body: EvaluateRequest):
    """
    Evaluate a job description against jobsearch.md.
    Synchronous in Phase 1.0 — single-user local use.
    """
    if not body.jd_text.strip():
        raise HTTPException(status_code=400, detail="jd_text cannot be empty.")

    if not body.force:
        existing = database.find_similar_jobs(body.company_name, body.job_title)
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

    log.info(
        "evaluate_request",
        extra={"company": body.company_name, "title": body.job_title},
    )

    result = await evaluator.evaluate_jd(
        jd_text=body.jd_text,
        company_name=body.company_name,
        job_title=body.job_title,
        location=body.location,
        remote_type=body.remote_type,
        apply_url=body.apply_url,
        pay_band=body.pay_band,
        llm_model_id=body.llm_model_id,
    )

    log.info(
        "evaluate_complete",
        extra={
            "job_id": result.get("job_id"),
            "success": result.get("success"),
        },
    )
    return EvaluateResponse(**result)


@app.post("/api/v1/evaluations/rerun")
@limiter.limit("10/minute")
async def rerun_evaluation(request: Request, body: RerunRequest):
    """Re-evaluate an existing job. Creates a new evaluation record."""
    job = database.get_job(body.job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {body.job_id} not found.")

    job_dict = dict(job)
    jd_text = job_dict.get("description_merged") or ""
    if not jd_text:
        postings = database.get_postings_for_job(body.job_id)
        if postings:
            jd_text = dict(postings[0]).get("description_raw") or ""

    if not jd_text.strip():
        raise HTTPException(
            status_code=400,
            detail="No job description stored for this job.",
        )

    result = await evaluator.evaluate_jd(
        jd_text=jd_text,
        company_name=job_dict.get("company_name", "Unknown Company"),
        job_title=job_dict.get("title", "Unknown Role"),
        location=job_dict.get("location"),
        remote_type=job_dict.get("remote_type"),
        llm_model_id=body.llm_model_id,
    )
    return JSONResponse(result)


@app.post("/api/v1/evaluations/import")
@limiter.limit("20/minute")
async def import_evaluation(request: Request, body: ImportEvaluationRequest):
    """
    Import a manually-produced evaluation (e.g. from a Claude session).
    Uses the default model if llm_model_id is not specified.
    """
    job = database.get_job(body.job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {body.job_id} not found.")

    if body.llm_model_id is not None:
        model_row = database.get_llm_model(body.llm_model_id)
        if not model_row:
            raise HTTPException(
                status_code=404,
                detail=f"LLM model {body.llm_model_id} not found.",
            )
        model_id = body.llm_model_id
    else:
        default = database.get_default_llm_model()
        if not default:
            raise HTTPException(
                status_code=400,
                detail="No default LLM model configured — provide llm_model_id.",
            )
        model_id = dict(default)["id"]

    eval_id = database.insert_evaluation(
        job_id=body.job_id,
        llm_model_id=model_id,
        score_overall=body.score_overall,
        score_role_fit=body.score_role_fit,
        score_scope_fit=body.score_scope_fit,
        score_culture=body.score_culture,
        score_comp=body.score_comp,
        fit_type=body.fit_type,
        archetype=body.archetype,
        strengths=body.strengths,
        gaps=body.gaps,
        recommendation=body.recommendation,
        keywords=body.keywords,
        domain_match=body.domain_match,
        role_type_match=body.role_type_match,
        keyword_gaps=body.keyword_gaps,
    )
    log.info("evaluation_imported", extra={"eval_id": eval_id, "job_id": body.job_id})
    return JSONResponse({"success": True, "evaluation_id": eval_id})


# ─────────────────────────────────────────────────────────────
# Evaluations list + detail
# ─────────────────────────────────────────────────────────────

@app.get("/api/v1/evaluations")
@limiter.limit("60/minute")
async def list_evaluations(request: Request, limit: int = Query(500, ge=1, le=2000)):
    """All evaluations with job title and company, newest first."""
    rows = database.get_all_evaluations(limit=limit)
    return JSONResponse([dict(r) for r in rows])


@app.get("/api/v1/evaluations/{evaluation_id}")
@limiter.limit("60/minute")
async def get_evaluation(request: Request, evaluation_id: int):
    """Single evaluation with full job and model info."""
    row = database.get_evaluation(evaluation_id)
    if not row:
        raise HTTPException(
            status_code=404, detail=f"Evaluation {evaluation_id} not found."
        )
    data = dict(row)
    data["report_path"] = _find_report(
        company_name=data.get("company_name", ""),
        job_title=data.get("title", ""),
        evaluated_at=data.get("evaluated_at", ""),
    )
    return JSONResponse(data)


# ─────────────────────────────────────────────────────────────
# Jobs
# ─────────────────────────────────────────────────────────────

@app.get("/api/v1/jobs")
@limiter.limit("60/minute")
async def list_jobs(request: Request):
    """All jobs with current application status and aggregated scores."""
    jobs = database.get_all_jobs()
    return JSONResponse([dict(j) for j in jobs])


@app.get("/api/v1/jobs/{job_id}")
@limiter.limit("60/minute")
async def get_job(request: Request, job_id: int):
    """Single job with all evaluations and postings."""
    job = database.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found.")

    evaluations = database.get_evaluations_for_job(job_id)
    postings = database.get_postings_for_job(job_id)
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

    company_log = database.get_job_company_log(job_id)

    return JSONResponse({
        "job": job_dict,
        "evaluations": evals_out,
        "postings": [dict(p) for p in postings],
        "company_log": [dict(e) for e in company_log],
    })


@app.patch("/api/v1/jobs/{job_id}")
@limiter.limit("30/minute")
async def patch_job(request: Request, job_id: int, body: PatchJobRequest):
    """Update editable job fields (details, description, my ratings)."""
    job = database.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found.")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if updates:
        database.update_job(job_id, **updates)
    return JSONResponse({"success": True})


@app.post("/api/v1/jobs/{job_id}/company-log")
@limiter.limit("30/minute")
async def add_job_company_log_entry(request: Request, job_id: int, body: AddCompanyLogRequest):
    """Add a company info log entry for a job."""
    job = database.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found.")
    type_id = database.get_system_type_id("company_info", body.type_value)
    if not type_id:
        raise HTTPException(status_code=400, detail=f"Unknown company_info type: {body.type_value}")
    log_id = database.add_job_company_log(job_id, type_id, body.log, body.url)
    return JSONResponse({"success": True, "id": log_id})


@app.get("/api/v1/jobs/{job_id}/application")
@limiter.limit("60/minute")
async def get_job_application(request: Request, job_id: int):
    """Check whether a job has an active application and return its status."""
    app_row = database.get_application_for_job(job_id)
    if app_row:
        return JSONResponse({"exists": True, "application": dict(app_row)})
    return JSONResponse({"exists": False, "application": None})


# ─────────────────────────────────────────────────────────────
# Models
# ─────────────────────────────────────────────────────────────

@app.get("/api/v1/models")
@limiter.limit("60/minute")
async def list_models(request: Request):
    """Return all configured LLM models with availability status."""
    models = database.get_all_llm_models()
    return JSONResponse({"models": [dict(m) for m in models]})


@app.post("/api/v1/models")
@limiter.limit("30/minute")
async def create_model(request: Request, body: CreateModelRequest):
    """Add a new LLM model. Endpoint is optional for external/manual models."""
    model_id = database.insert_llm_model(
        model=body.model,
        endpoint=body.endpoint,
        model_weight=body.model_weight,
        estimated_eval_time=body.estimated_eval_time,
        enabled=body.enabled,
    )
    log.info("model_created", extra={"model_id": model_id, "model": body.model})
    return JSONResponse({"success": True, "model_id": model_id})


@app.patch("/api/v1/models/{model_id}")
@limiter.limit("30/minute")
async def update_model(request: Request, model_id: int, body: UpdateModelRequest):
    """Update mutable fields on a model record."""
    row = database.get_llm_model(model_id)
    if not row:
        raise HTTPException(status_code=404, detail=f"Model {model_id} not found.")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update.")
    database.update_llm_model(model_id, **updates)
    log.info("model_updated", extra={"model_id": model_id})
    return JSONResponse({"success": True})


@app.post("/api/v1/models/{model_id}/set-default")
@limiter.limit("30/minute")
async def set_default_model(request: Request, model_id: int):
    """Set this model as the default. Clears default_flag on all others."""
    row = database.get_llm_model(model_id)
    if not row:
        raise HTTPException(status_code=404, detail=f"Model {model_id} not found.")
    database.set_llm_model_default(model_id)
    log.info("model_default_set", extra={"model_id": model_id})
    return JSONResponse({"success": True})


@app.delete("/api/v1/models/{model_id}")
@limiter.limit("30/minute")
async def delete_model(request: Request, model_id: int):
    """Delete a model. Blocked if it is the only configured default."""
    row = database.get_llm_model(model_id)
    if not row:
        raise HTTPException(status_code=404, detail=f"Model {model_id} not found.")
    model_dict = dict(row)
    if model_dict["default_flag"] == 1:
        all_models = database.get_all_llm_models()
        if len(all_models) == 1:
            raise HTTPException(
                status_code=409,
                detail="Cannot delete the only configured model.",
            )
    deleted = database.delete_llm_model(model_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Model {model_id} not found.")
    log.info("model_deleted", extra={"model_id": model_id})
    return JSONResponse({"success": True})


@app.post("/api/v1/models/check-availability")
@limiter.limit("10/minute")
async def check_model_availability(request: Request):
    """Re-run the availability check for all configured models."""
    await _update_model_availability()
    models = database.get_all_llm_models()
    available_count = sum(1 for m in models if dict(m)["available"] == 1)
    log.info("model_availability_checked", extra={"available": available_count})
    return JSONResponse({"checked": len(models), "available": available_count})


# ─────────────────────────────────────────────────────────────
# Applications
# ─────────────────────────────────────────────────────────────

@app.post("/api/v1/applications")
@limiter.limit("30/minute")
async def create_application(request: Request, body: CreateApplicationRequest):
    """
    Activate the not-started application for a job (transitions it to 'draft').
    Returns 404 if the job has no application, 409 if already active.
    """
    app_row = database.get_application_for_job(body.job_id)
    if not app_row:
        raise HTTPException(
            status_code=404, detail=f"Job {body.job_id} not found or has no application."
        )
    app_dict = dict(app_row)
    if app_dict["application_status"] != "not-started":
        raise HTTPException(
            status_code=409,
            detail=(
                f"Application already active "
                f"(id={app_dict['id']}, status={app_dict['application_status']})."
            ),
        )

    database.update_application_status(app_dict["id"], "draft")
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    database.update_application(app_dict["id"], apply_date=today)

    log.info("application_created", extra={"application_id": app_dict["id"]})
    return JSONResponse({"success": True, "application_id": app_dict["id"]})


@app.get("/api/v1/applications")
@limiter.limit("60/minute")
async def list_applications(request: Request):
    """All active applications (excludes not-started) with job info."""
    rows = database.get_all_applications(exclude_not_started=True)
    return JSONResponse([dict(r) for r in rows])


@app.get("/api/v1/applications/{application_id}")
@limiter.limit("60/minute")
async def get_application(request: Request, application_id: int):
    """Single application with logs, audit trail, evaluations, and postings."""
    app_row = database.get_application(application_id)
    if not app_row:
        raise HTTPException(
            status_code=404, detail=f"Application {application_id} not found."
        )
    app_dict = dict(app_row)
    job_id = app_dict["job_id"]

    job = database.get_job(job_id)
    logs = database.get_application_logs(application_id)
    audit = database.get_application_audit(application_id)
    evaluations = database.get_evaluations_for_job(job_id)
    postings = database.get_postings_for_job(job_id)

    return JSONResponse({
        "application": app_dict,
        "job": dict(job) if job else None,
        "logs": [dict(l) for l in logs],
        "audit": [dict(a) for a in audit],
        "evaluations": [dict(e) for e in evaluations],
        "postings": [dict(p) for p in postings],
    })


@app.patch("/api/v1/applications/{application_id}")
@limiter.limit("30/minute")
async def update_application(
    request: Request, application_id: int, body: UpdateApplicationRequest
):
    """Update application fields. Status changes write an audit event."""
    app_row = database.get_application(application_id)
    if not app_row:
        raise HTTPException(status_code=404, detail="Application not found.")

    if body.application_status is not None:
        if body.application_status not in _VALID_STATUSES:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Invalid status '{body.application_status}'. "
                    f"Valid: {', '.join(sorted(_VALID_STATUSES))}"
                ),
            )
        database.update_application_status(application_id, body.application_status)

    field_updates = {
        k: v for k, v in body.model_dump().items()
        if k != "application_status" and v is not None
    }
    if field_updates:
        database.update_application(application_id, **field_updates)

    return JSONResponse({"success": True})


@app.post("/api/v1/applications/{application_id}/logs")
@limiter.limit("30/minute")
async def add_log(request: Request, application_id: int, body: AddLogRequest):
    """Add a timestamped log entry to an application. Append-only."""
    app_row = database.get_application(application_id)
    if not app_row:
        raise HTTPException(
            status_code=404, detail=f"Application {application_id} not found."
        )

    type_id = database.get_system_type_id("application_log", body.type_value)
    if type_id is None:
        valid = [
            dict(t)["type_value"]
            for t in database.get_all_system_types("application_log")
        ]
        raise HTTPException(
            status_code=400,
            detail=f"Invalid type_value. Valid: {', '.join(sorted(valid))}",
        )

    log_id = database.add_application_log(
        application_id=application_id,
        type_id=type_id,
        log=body.log,
        url=body.url,
        log_timestamp=body.log_timestamp,
    )
    return JSONResponse({"success": True, "log_id": log_id})


@app.delete("/api/v1/applications/{application_id}/logs/{log_id}")
@limiter.limit("30/minute")
async def delete_log(request: Request, application_id: int, log_id: int):
    """Delete a single application log entry."""
    deleted = database.delete_application_log(log_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Log entry {log_id} not found.")
    return JSONResponse({"success": True})


@app.patch("/api/v1/applications/{application_id}/logs/{log_id}/timestamp")
@limiter.limit("30/minute")
async def update_log_timestamp(
    request: Request, application_id: int, log_id: int, body: UpdateTimestampRequest
):
    """Update the timestamp on a user-created application log entry."""
    if not body.timestamp.strip():
        raise HTTPException(status_code=400, detail="timestamp must not be empty.")
    updated = database.update_log_timestamp(log_id, body.timestamp)
    if not updated:
        raise HTTPException(status_code=404, detail=f"Log entry {log_id} not found.")
    return JSONResponse({"success": True})


@app.patch("/api/v1/applications/{application_id}/audit/{audit_id}/timestamp")
@limiter.limit("30/minute")
async def update_audit_timestamp(
    request: Request, application_id: int, audit_id: int, body: UpdateTimestampRequest
):
    """Update the timestamp on an audit entry. Requires allow_audit_timestamp_edit = 1."""
    setting = database.get_app_setting("allow_audit_timestamp_edit")
    if setting != "1":
        raise HTTPException(
            status_code=403,
            detail="Audit timestamp editing is disabled. Enable it in Settings.",
        )
    if not body.timestamp.strip():
        raise HTTPException(status_code=400, detail="timestamp must not be empty.")
    updated = database.update_audit_timestamp(audit_id, body.timestamp)
    if not updated:
        raise HTTPException(status_code=404, detail=f"Audit entry {audit_id} not found.")
    return JSONResponse({"success": True})


@app.post("/api/v1/applications/{application_id}/generate-prompt")
@limiter.limit("10/minute")
async def generate_prompt(request: Request, application_id: int):
    """
    Build a structured AI prompt for this application and store it as a log entry.
    Returns the generated prompt text and its log id.
    """
    app_row = database.get_application(application_id)
    if not app_row:
        raise HTTPException(
            status_code=404, detail=f"Application {application_id} not found."
        )
    app_dict = dict(app_row)

    job = database.get_job(app_dict["job_id"])
    if not job:
        raise HTTPException(
            status_code=404, detail=f"Job {app_dict['job_id']} not found."
        )
    job_dict = dict(job)
    eval_row = database.get_latest_evaluation(app_dict["job_id"])

    company_name = job_dict.get("company_name") or "N/A"
    title = job_dict.get("title") or "N/A"
    location = job_dict.get("location") or "N/A"
    pay_band = job_dict.get("pay_band") or "Not listed"
    jd_text = job_dict.get("description_merged") or ""

    def _fmt_sub(v: object) -> str:
        return f"{v}/5" if v is not None else "N/A"

    if eval_row:
        e = dict(eval_row)
        score_display = f"{e.get('score_overall')}/10" if e.get("score_overall") is not None else "N/A"
        fit_type = e.get("fit_type") or "N/A"
        archetype = e.get("archetype") or "N/A"
        recommendation = e.get("recommendation") or "N/A"
        model_label = e.get("model_name") or "N/A"
        strengths = e.get("strengths") or "N/A"
        gaps = e.get("gaps") or "N/A"
        keywords = e.get("keywords") or "N/A"
        score_role_fit_display = _fmt_sub(e.get("score_role_fit"))
        score_scope_display = _fmt_sub(e.get("score_scope_fit"))
        score_culture_display = _fmt_sub(e.get("score_culture"))
        score_comp_display = _fmt_sub(e.get("score_comp"))
    else:
        score_display = fit_type = archetype = recommendation = model_label = "N/A"
        strengths = gaps = keywords = "N/A"
        score_role_fit_display = score_scope_display = "N/A"
        score_culture_display = score_comp_display = "N/A"

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
Model Used: {model_label}

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
exception. Target output: 2 pages when compiled.

2. After you deliver the evaluation scorecard and before asking whether
   to proceed, output the following block exactly:

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
"""

    prompt_type_id = database.get_system_type_id("application_log", "prompt")
    if prompt_type_id is None:
        raise HTTPException(status_code=500, detail="system_types not seeded correctly.")

    log_id = database.add_application_log(
        application_id=application_id,
        type_id=prompt_type_id,
        log=prompt,
    )
    return JSONResponse({"success": True, "log_id": log_id, "prompt": prompt})


@app.post("/api/v1/applications/{application_id}/lesson-chat")
@limiter.limit("20/minute")
async def lesson_chat(
    request: Request, application_id: int, body: LessonChatRequest
):
    """
    Lesson reflection chat for an application.
    finalize=false: SSE streaming — coach asks about the application experience.
    finalize=true:  Non-streaming — synthesize conversation into a lesson log entry
                    and a proposed Insights & Lessons addition. Writes the log entry
                    to application_logs (lesson_learned type); does NOT auto-write
                    to jobsearch.md.
    """
    app_row = database.get_application(application_id)
    if not app_row:
        raise HTTPException(
            status_code=404, detail=f"Application {application_id} not found."
        )
    app_dict = dict(app_row)

    default_model = database.get_default_llm_model()
    if not default_model:
        raise HTTPException(
            status_code=503, detail="No LLM model configured — add one in Settings."
        )
    model_info = dict(default_model)
    endpoint = model_info.get("endpoint", "")
    provider = "anthropic" if "anthropic.com" in endpoint else "ollama"

    job = database.get_job(app_dict["job_id"])
    job_dict = dict(job) if job else {}
    company_name = job_dict.get("company_name") or "Unknown company"
    title = job_dict.get("title") or "Unknown role"
    status = app_dict.get("application_status") or "unknown"

    if not body.finalize:
        # ── Streaming path ──
        if not body.messages:
            raise HTTPException(status_code=400, detail="messages must not be empty.")

        system = (
            "You are helping the user reflect on a specific job application.\n"
            "Ask about what happened in the process, what they learned, and what "
            "they would do differently. Be empathetic and specific. Ask one follow-up "
            "question at a time.\n"
            f"Application context: {company_name} — {title} (status: {status})."
        )
        prompt = "\n\n".join(
            f"{'User' if m.role == 'user' else 'Assistant'}: {m.content}"
            for m in body.messages
        )

        return StreamingResponse(
            _lesson_sse_generator(
                prompt=prompt,
                system=system,
                model=model_info["model"],
                provider=provider,
                base_url=endpoint,
                llm_model_id=model_info["id"],
                job_id=app_dict["job_id"],
            ),
            media_type="text/event-stream",
        )

    else:
        # ── Finalize path — synthesize and write log entry ──
        if not body.messages:
            raise HTTPException(status_code=400, detail="messages must not be empty.")

        conversation_text = "\n\n".join(
            f"{'User' if m.role == 'user' else 'Assistant'}: {m.content}"
            for m in body.messages
        )

        system = (
            "You are synthesizing a job application reflection conversation into two outputs.\n"
            "Respond ONLY with valid JSON in exactly this format:\n"
            '{"log_entry": "...", "insights_addition": "..."}\n\n'
            "log_entry: A concise 2-4 sentence lesson learned from this application. "
            "Write in first person, specific and honest.\n"
            "insights_addition: A formatted entry suitable for adding to an "
            "'Insights & Lessons Learned' section. Include the company/role context, "
            "what happened, and what to do differently next time."
        )
        finalize_prompt = (
            f"Application: {company_name} — {title} (status: {status})\n\n"
            f"Reflection conversation:\n---\n{conversation_text}\n---\n\n"
            "Synthesize the lesson learned:"
        )

        start_ms = int(time.time() * 1000)
        result = await llm_client.complete(
            prompt=finalize_prompt,
            system=system,
            model=model_info["model"],
            provider=provider,
            base_url=endpoint,
        )
        latency_ms = int(time.time() * 1000) - start_ms

        llm_log_id = database.insert_llm_call_log(
            llm_model_id=model_info["id"],
            call_type="chat",
            prompt=finalize_prompt,
            raw_response=result.get("content"),
            latency_ms=latency_ms,
            success=1 if result.get("success") else 0,
            error_message=result.get("error"),
            job_id=app_dict["job_id"],
        )

        if not result.get("success"):
            raise HTTPException(
                status_code=502, detail=f"LLM call failed: {result.get('error')}"
            )

        raw = result["content"] or ""
        try:
            import json as _json
            parsed_out = _json.loads(raw)
            log_entry = parsed_out.get("log_entry", raw)
            insights_addition = parsed_out.get("insights_addition", raw)
        except Exception:
            log_entry = raw
            insights_addition = raw

        lesson_type_id = database.get_system_type_id("application_log", "lesson_learned")
        if lesson_type_id is None:
            raise HTTPException(
                status_code=500, detail="system_types not seeded correctly (lesson_learned missing)."
            )
        database.add_application_log(
            application_id=application_id,
            type_id=lesson_type_id,
            log=log_entry,
            llm_call_log_id=llm_log_id,
        )

        return JSONResponse({
            "log_entry": log_entry,
            "insights_addition": insights_addition,
            "application_id": application_id,
        })


# ─────────────────────────────────────────────────────────────
# LLM call log
# ─────────────────────────────────────────────────────────────

@app.get("/api/v1/llm-call-log")
@limiter.limit("60/minute")
async def get_llm_call_log(
    request: Request,
    job_id: int | None = Query(None),
    call_type: str | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
):
    """LLM call log — metadata only. Prompt and raw response included for debug use."""
    rows = database.get_llm_call_log(limit=limit, job_id=job_id, call_type=call_type)
    return JSONResponse([dict(r) for r in rows])


# ─────────────────────────────────────────────────────────────
# System types
# ─────────────────────────────────────────────────────────────

@app.get("/api/v1/system-types")
@limiter.limit("60/minute")
async def list_system_types(
    request: Request,
    type_name: str | None = Query(None),
):
    """Return system_types, optionally filtered by type_name."""
    rows = database.get_all_system_types(type_name=type_name)
    return JSONResponse([dict(r) for r in rows])


@app.post("/api/v1/system-types")
@limiter.limit("30/minute")
async def create_system_type(request: Request, body: CreateSystemTypeRequest):
    """Add a new system type entry. type_name + type_value must be unique."""
    existing = database.get_system_type_id(body.type_name, body.type_value)
    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail=f"system_type ({body.type_name}, {body.type_value}) already exists.",
        )
    type_id = database.add_system_type(body.type_name, body.type_value)
    log.info("system_type_created", extra={"type_id": type_id})
    return JSONResponse({"success": True, "type_id": type_id})


@app.delete("/api/v1/system-types/{type_id}")
@limiter.limit("30/minute")
async def delete_system_type(request: Request, type_id: int):
    """Delete a system type. Blocked if any record references this type_id."""
    deleted = database.delete_system_type(type_id)
    if not deleted:
        raise HTTPException(
            status_code=409,
            detail="Cannot delete: type is in use or does not exist.",
        )
    log.info("system_type_deleted", extra={"type_id": type_id})
    return JSONResponse({"success": True})


# ─────────────────────────────────────────────────────────────
# Settings
# ─────────────────────────────────────────────────────────────

@app.get("/api/v1/settings")
@limiter.limit("30/minute")
async def get_settings(request: Request):
    """Return runtime settings. API key values are never echoed — boolean presence only."""
    config = _load_config()
    return JSONResponse({
        "app_version": "1.0.0",
        "schema_version": database.get_schema_version(),
        "anthropic_api_key_configured": bool(os.environ.get("ANTHROPIC_API_KEY")),
        "server": config.get("server", {}),
        "logging": {k: v for k, v in config.get("logging", {}).items()},
        "database": {
            k: v for k, v in config.get("database", {}).items()
            if k != "db_path"  # omit local path details
        },
    })


@app.patch("/api/v1/settings")
@limiter.limit("10/minute")
async def update_settings(request: Request, body: UpdateSettingsRequest):
    """
    Settings stub — Phase 1.0. Model management goes through /api/v1/models.
    Returns success without modifying anything (full settings UI in Phase 1.1).
    """
    log.info("settings_patch_called", extra={"keys": list(body.settings.keys())})
    return JSONResponse({"success": True})


@app.get("/api/v1/settings/jobsearch")
@limiter.limit("30/minute")
async def get_jobsearch(request: Request):
    """Return the current content of jobsearch.md from disk."""
    config = _load_config()
    path = Path(config.get("evaluation", {}).get("jobsearch_md_path", "my_data/jobsearch.md"))
    bak = Path(str(path) + ".bak")
    if not path.exists():
        return JSONResponse({"content": "", "has_backup": bak.exists()})
    return JSONResponse({"content": path.read_text(encoding="utf-8"), "has_backup": bak.exists()})


@app.put("/api/v1/settings/jobsearch")
@limiter.limit("10/minute")
async def save_jobsearch(request: Request, body: SaveJobsearchRequest):
    """Write content to jobsearch.md, backing up the previous version first."""
    config = _load_config()
    path = Path(config.get("evaluation", {}).get("jobsearch_md_path", "my_data/jobsearch.md"))
    bak = Path(str(path) + ".bak")
    if path.exists():
        bak.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body.content, encoding="utf-8")
    log.info("jobsearch_saved", extra={"bytes": len(body.content)})
    return JSONResponse({"success": True})


@app.get("/api/v1/settings/jobsearch/backup")
@limiter.limit("30/minute")
async def get_jobsearch_backup(request: Request):
    """Return the content of the jobsearch.md backup file (.bak), if it exists."""
    config = _load_config()
    path = Path(config.get("evaluation", {}).get("jobsearch_md_path", "my_data/jobsearch.md"))
    bak = Path(str(path) + ".bak")
    if not bak.exists():
        raise HTTPException(status_code=404, detail="No backup file found.")
    return JSONResponse({"content": bak.read_text(encoding="utf-8")})


@app.get("/api/v1/settings/resume-template")
@limiter.limit("30/minute")
async def get_resume_template(request: Request):
    """Return the current content of the resume template from disk."""
    config = _load_config()
    path = Path(config.get("evaluation", {}).get("resume_template_path", "my_data/resume_templates/resume_template.typ"))
    bak = Path(str(path) + ".bak")
    if not path.exists():
        return JSONResponse({"content": "", "has_backup": bak.exists()})
    return JSONResponse({"content": path.read_text(encoding="utf-8"), "has_backup": bak.exists()})


@app.put("/api/v1/settings/resume-template")
@limiter.limit("10/minute")
async def save_resume_template(request: Request, body: SaveResumeTemplateRequest):
    """Write content to the resume template file, backing up the previous version first."""
    config = _load_config()
    path = Path(config.get("evaluation", {}).get("resume_template_path", "my_data/resume_templates/resume_template.typ"))
    bak = Path(str(path) + ".bak")
    if path.exists():
        bak.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body.content, encoding="utf-8")
    log.info("resume_template_saved", extra={"bytes": len(body.content)})
    return JSONResponse({"success": True})


@app.get("/api/v1/settings/resume-template/backup")
@limiter.limit("30/minute")
async def get_resume_template_backup(request: Request):
    """Return the content of the resume template backup file (.bak), if it exists."""
    config = _load_config()
    path = Path(config.get("evaluation", {}).get("resume_template_path", "my_data/resume_templates/resume_template.typ"))
    bak = Path(str(path) + ".bak")
    if not bak.exists():
        raise HTTPException(status_code=404, detail="No backup file found.")
    return JSONResponse({"content": bak.read_text(encoding="utf-8")})


@app.get("/api/v1/settings/app")
@limiter.limit("30/minute")
async def get_app_settings(request: Request):
    """Return all app_settings records as a flat list of {key, value} pairs."""
    return JSONResponse(database.get_all_app_settings())


@app.patch("/api/v1/settings/app/{key}")
@limiter.limit("30/minute")
async def update_app_setting(request: Request, key: str, body: UpdateAppSettingRequest):
    """Update a single app_settings value by key."""
    database.set_app_setting(key, body.value)
    return JSONResponse({"success": True, "key": key, "value": body.value})


# ─────────────────────────────────────────────────────────────
# Inbox
# ─────────────────────────────────────────────────────────────

@app.get("/api/v1/inbox/files")
@limiter.limit("30/minute")
async def list_inbox_files(request: Request):
    """List pending .md/.txt files in inbox/ root."""
    inbox_dir, _, _ = evaluate._get_inbox_paths()
    inbox_dir.mkdir(parents=True, exist_ok=True)
    pending = sorted([
        f.name for f in inbox_dir.iterdir()
        if f.is_file()
        and f.suffix in {".md", ".txt"}
        and f.parent == inbox_dir
    ])
    return JSONResponse({"pending": pending})


@app.post("/api/v1/inbox/process")
@limiter.limit("10/minute")
async def process_inbox(request: Request, body: ProcessInboxRequest):
    """Process selected inbox files. Filenames must be bare names (no path)."""
    if not body.filenames:
        raise HTTPException(status_code=400, detail="No filenames provided.")
    for name in body.filenames:
        if "/" in name or "\\" in name or name.startswith("."):
            raise HTTPException(status_code=400, detail=f"Invalid filename: {name}")
    try:
        result = await evaluate.process_inbox_files(filenames=body.filenames)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return JSONResponse(result)


# ─────────────────────────────────────────────────────────────
# SPA catch-all — must be last so API routes match first
# ─────────────────────────────────────────────────────────────

@app.get("/{full_path:path}", response_class=FileResponse, include_in_schema=False)
async def serve_spa(full_path: str):
    """Serve the React SPA for all non-API routes so React Router handles navigation."""
    index = Path("frontend/dist/index.html")
    if not index.exists():
        raise HTTPException(
            status_code=503,
            detail="Frontend not built — run: cd frontend && npm run build",
        )
    return FileResponse(index)


# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────

def _find_report(company_name: str, job_title: str, evaluated_at: str) -> str | None:
    """Find the most likely report file for an evaluation by date prefix."""
    reports_dir = Path("reports")
    if not reports_dir.exists():
        return None

    date_prefix = ""
    if evaluated_at:
        date_prefix = evaluated_at[:10].replace("-", "")

    candidates = list(reports_dir.glob(f"{date_prefix}_*.md")) if date_prefix else []
    if not candidates:
        all_reports = sorted(reports_dir.glob("*.md"), reverse=True)
        return str(all_reports[0]) if all_reports else None

    candidates.sort(reverse=True)
    return str(candidates[0])


# ─────────────────────────────────────────────────────────────
# Entrypoint
# ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    config = _load_config()
    server_cfg = config.get("server", {})
    host = server_cfg.get("host", "127.0.0.1")
    port = server_cfg.get("port", 8080)

    log.info("starting", extra={"host": host, "port": port})
    uvicorn.run("main:app", host=host, port=port, reload=False)
