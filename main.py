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
  POST /api/v1/jobs/{id}/activate
  POST /api/v1/jobs/{id}/generate-orgsummary-prompt
  GET  /api/v1/settings/llm-servers
  POST /api/v1/settings/llm-servers
  PUT  /api/v1/settings/llm-servers/{id}
  DELETE /api/v1/settings/llm-servers/{id}
  POST /api/v1/settings/llm-servers/test
  GET  /api/v1/settings/llm-servers/{id}/available-models
  GET  /api/v1/settings/anthropic-key
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
  POST /api/v1/applications/{id}/generate-resume-prompt
  POST /api/v1/applications/{id}/generate-cover-prompt
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
  GET  /api/v1/settings/documents-storage
  POST /api/v1/applications/{id}/documents
  GET  /api/v1/applications/{id}/documents
  DELETE /api/v1/applications/{id}/documents/{doc_id}
  GET  /api/v1/applications/{id}/documents/{doc_id}/content
  PUT  /api/v1/applications/{id}/documents/{doc_id}/content
  POST /api/v1/applications/{id}/documents/{doc_id}/compile
  POST /api/v1/applications/{id}/documents/{doc_id}/finalize
  POST /api/v1/applications/{id}/documents/from-template
  GET  /api/v1/documents/file/{doc_id}
  GET  /api/v1/templates/typst
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
  POST /api/v1/scrape
  POST /api/v1/scrape/fill-gaps

SPA catch-all (Phase 1.1+):
  GET  /{full_path}  → serves frontend/dist/index.html (React Router handles routing)
"""

import os
import re
import subprocess
import time
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import AsyncGenerator

import httpx
import yaml
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, field_validator
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

import database
import document_routes
import evaluate
import evaluator
import llm_client
import profile_routes
import prompt_generation
import scrape_routes
from env_utils import get_env_key, load_dotenv
from limiter import limiter
from logger import get_logger

load_dotenv()

log = get_logger(__name__)

# ─────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────

def _load_config() -> dict:
    config_path = Path("user_data/config.yaml")
    if config_path.exists():
        with open(config_path) as f:
            return yaml.safe_load(f) or {}
    return {}


# ─────────────────────────────────────────────────────────────
# External evaluation prompt template
# ─────────────────────────────────────────────────────────────

EXTERNAL_EVAL_PROMPT_TEMPLATE = """## CONTEXT FILES

You have been provided the following file. Read it completely before
doing anything else:

- **jobsearch.md** — candidate profile, career history, target role
  preferences, deal-breakers, compensation targets, tailoring rules,
  and model behavior rules.

Confirm you have read jobsearch.md before proceeding.

---

## CLARIFICATION GATE

Before beginning any evaluation, check the following. If anything is
missing or ambiguous, ask a single clarifying question — do not guess:

- Is a job description present below? If not, ask for it.
- Is the company name, role title, and location clearly stated?
  If any are missing, ask.
- If the JD does not include a salary band, note that comp scoring
  will be estimated based on market norms for the role level —
  do not ask, just flag it in the scorecard.

Do not proceed until all required inputs are present.

---

## JOB DETAILS

Company: {company_name}
Title: {title}
Location: {location}
Pay Band: {pay_band}

---

## JOB DESCRIPTION

{jd_text}

---

## TASK: EVALUATION SCORECARD

Produce a full evaluation scorecard using the framework below.
Use jobsearch.md as the sole source of truth for all candidate facts.
Apply the model behavior rules in jobsearch.md throughout.

### Scoring Framework

**Dimension scores (1–5 each):**
- **Role fit:** Does the role type, title, and day-to-day responsibilities
  match what the candidate is targeting? Reference the Target Role Profile
  section of jobsearch.md.
- **Scope fit:** Does the team size, org scope, and leadership depth match
  the candidate's background and stated preferences?
- **Culture signals:** Does the JD language, company type, and mission
  suggest a culture compatible with the candidate's values?
- **Comp signals:** How does the stated or estimated pay band align with
  the candidate's compensation target? Reference jobsearch.md.

**Overall score:** 1–10 composite with one-sentence verdict.

Scoring guidance — apply the same calibration used internally:
- 1–2: Categorically wrong — function, domain, or level fundamentally misaligned
- 3–4: Significant mismatch — major gaps or deal-breaker violations
- 5: Borderline — some fit but gaps make this a poor application choice
- 6: Viable — meets minimum threshold, not a standout candidate
- 7: Good fit — solid match, minor gaps, competitive
- 8: Strong fit — well-aligned, strong candidate
- 9: Excellent fit — near-perfect, very few concerns
- 10: Exceptional — every requirement met, direct domain match, no meaningful gaps

**Fit type:** Core Fit / Stretch / Mismatch — with one-sentence reasoning.

**Role archetype:** A concise label describing the nature of the role
(e.g. "Hybrid: People Leadership + Platform Technical Direction" or
"Pure People Leadership: EM-scale").

**Strengths of this match:** Bullet list. Be specific — cite actual
experience from jobsearch.md that maps to a specific JD requirement.

**Gaps or concerns:** Bullet list. Be honest — if a gap is real, name
it. Flag anything that could surface as a challenge in an interview.

**Interview process analysis:** If the JD includes a described interview
process, analyze each stage for conflicts with known gaps or deal-breakers
from jobsearch.md. Surface these here — not later.

**ATS keyword analysis:**
- List 25–35 ATS-relevant keywords extracted from the JD.
- Cross-reference against the master resume copy in jobsearch.md.
- Call out any JD keywords not present in the master resume as
  tailoring targets.

**Recommended action:** Apply / Apply with modifications / Skip
Include one sentence of reasoning.

---

## MACHINE-READABLE OUTPUT BLOCK

After the full scorecard, output the following block exactly as
formatted. Do not alter field names or structure — this block is
parsed programmatically by the job search application.

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
  "keyword_gaps": "<comma-separated keywords from JD not in master resume>",
  "log_entry": "<one-sentence verdict>"
}}
EVALUATION_JSON_END

---

## STOP

After delivering the scorecard and JSON block, stop and ask:

> "Want to proceed to resume tailoring for this role, or would you
>  like to review anything in the evaluation first?"

Do not generate resume or cover letter materials in this response."""


# ─────────────────────────────────────────────────────────────
# Startup helpers
# ─────────────────────────────────────────────────────────────

async def _update_model_availability(app_state=None) -> None:
    """
    Re-check availability of every llm_models record and update the available flag.
    Uses server_type from the server JOIN: local → Ollama ping, anthropic → key present.
    Failures are logged; the app continues regardless — usable for browsing.
    """
    models = database.get_all_llm_models()
    if not models:
        log.warning("no_models_configured", extra={"hint": "add a model in Settings"})
        return

    # Check key presence from state if available (avoids re-reading env at call time)
    anthropic_key_present = getattr(app_state, "anthropic_key_present", bool(get_env_key("ANTHROPIC_API_KEY")))

    available_count = 0
    for row in models:
        model_dict = dict(row)
        server_type = model_dict.get("server_type", "local")
        endpoint = model_dict.get("endpoint")
        model_name = model_dict["model"]
        model_id = model_dict["id"]

        try:
            if server_type == "anthropic":
                is_available = anthropic_key_present
            else:
                if not endpoint:
                    is_available = False
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

    database.seed_prompt_if_missing(
        prompt_key="eval_internal",
        label="Internal Evaluation Prompt",
        segments_text=evaluator.SYSTEM_PROMPT_TEMPLATE,
    )
    database.seed_prompt_if_missing(
        prompt_key="eval_external",
        label="External Evaluation Prompt",
        segments_text=EXTERNAL_EVAL_PROMPT_TEMPLATE,
    )
    database.seed_prompt_if_missing(
        prompt_key="eval_analysis",
        label="Evaluation — Analysis",
        segments_text=evaluator.EVAL_ANALYSIS_PROMPT_TEMPLATE,
    )
    database.seed_prompt_if_missing(
        prompt_key="eval_scoring",
        label="Evaluation — Scoring",
        segments_text=evaluator.EVAL_SCORING_PROMPT_TEMPLATE,
    )

    anthropic_key = get_env_key("ANTHROPIC_API_KEY")
    app.state.anthropic_key_present = bool(anthropic_key)

    database.seed_llm_models_from_config()

    await _update_model_availability(app.state)

    cfg = _load_config()
    typst_binary = cfg.get("typst", {}).get("binary_path", "typst")
    application_docs_dir = Path(cfg.get("typst", {}).get("application_docs_dir", "./app_data/application_docs"))

    application_docs_dir.mkdir(parents=True, exist_ok=True)

    try:
        typst_result = subprocess.run(
            [typst_binary, "--version"],
            capture_output=True,
            timeout=5,
        )
        typst_available = typst_result.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        typst_available = False

    app.state.typst_available = typst_available
    app.state.typst_binary = typst_binary
    app.state.application_docs_dir = application_docs_dir

    if typst_available:
        log.info("typst_available", extra={"binary": typst_binary})
    else:
        log.warning("typst_not_found", extra={
            "binary": typst_binary,
            "hint": "document compilation disabled; install typst to enable",
        })

    cfg_eval = cfg.get("evaluation", {})
    jobsearch_path = Path(cfg_eval.get("jobsearch_md_path", "./user_data/my_data/jobsearch.md"))
    if not jobsearch_path.exists():
        log.warning(
            "jobsearch_md_missing",
            extra={"hint": "copy JOBSEARCH_TEMPLATE.md to user_data/my_data/jobsearch.md"},
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
    docs_url=None,
    redoc_url=None,
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
app.include_router(document_routes.router, prefix="/api/v1")
app.include_router(scrape_routes.router, prefix="/api/v1")

_frontend_assets = Path("frontend/dist/assets")
if _frontend_assets.exists():
    app.mount("/assets", StaticFiles(directory=str(_frontend_assets)), name="frontend-assets")


# ─────────────────────────────────────────────────────────────
# Utilities
# ─────────────────────────────────────────────────────────────

def strip_utm_params(url: str | None) -> str | None:
    """Remove all utm_* query parameters from a URL before storing."""
    if not url:
        return url
    parsed = urlparse(url)
    params = parse_qs(parsed.query, keep_blank_values=True)
    cleaned = {k: v for k, v in params.items() if not k.lower().startswith("utm_")}
    new_query = urlencode(cleaned, doseq=True)
    return urlunparse(parsed._replace(query=new_query))


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
    rerun_job_id: int | None = None


class EvaluateResponse(BaseModel):
    success: bool
    evaluation_id: int | None
    job_id: int | None
    evaluation: dict | None
    error: str | None
    duplicate_detected: bool = False
    existing_jobs: list | None = None
    prompt_usage_id: int | None = None


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


class CreateJobRequest(BaseModel):
    company_name: str
    title: str
    location: str | None = None
    remote_type: str | None = None
    apply_url: str | None = None
    pay_band: str | None = None
    description: str | None = None


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


class CompanySummaryRequest(BaseModel):
    text: str


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

    @field_validator("timestamp")
    @classmethod
    def validate_iso_format(cls, v: str) -> str:
        if not re.match(r"^\d{4}-\d{2}-\d{2}", v.strip()):
            raise ValueError("timestamp must begin with a date in YYYY-MM-DD format")
        return v


class UpdateSettingsRequest(BaseModel):
    settings: dict[str, str]


class ProcessInboxRequest(BaseModel):
    filenames: list[str]


class CreateServerRequest(BaseModel):
    server_name: str
    endpoint: str | None = None
    server_type: str


class UpdateServerRequest(BaseModel):
    server_name: str
    endpoint: str | None = None


class TestConnectionRequest(BaseModel):
    server_type: str
    endpoint: str | None = None


class CreateModelRequest(BaseModel):
    model: str
    server_id: int
    model_weight: int = 1
    default_flag: bool = False


class UpdateModelRequest(BaseModel):
    model: str | None = None
    model_weight: int | None = None
    default_flag: bool | None = None


class CreateSystemTypeRequest(BaseModel):
    type_name: str
    type_value: str


class CreateQuestionRequest(BaseModel):
    question: str
    response: str | None = None


class UpdateQuestionRequest(BaseModel):
    question: str | None = None
    response: str | None = None


class SaveJobsearchRequest(BaseModel):
    content: str


class SaveResumeTemplateRequest(BaseModel):
    content: str


class PromptUsageFeedbackRequest(BaseModel):
    agree: int
    dimension: str | None = None
    feedback_text: str | None = None


class PromptSaveRequest(BaseModel):
    segments_text: str
    note: str | None = None


# Valid application status values per spec
_VALID_STATUSES = frozenset({
    "not-started", "draft", "skipped", "applied", "screening", "interview",
    "offer", "rejected", "ghosted", "withdrawn",
})

_VALID_APP_SETTING_KEYS = frozenset({"allow_audit_timestamp_edit"})


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
            safe_token = token.replace("\n", "\ndata: ")
            yield f"data: {safe_token}\n\n"
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
            raw_response="".join(accumulated) if accumulated else None,
            latency_ms=latency_ms,
            success=0 if had_error else 1,
            job_id=job_id,
        )
    except Exception as log_exc:
        log.warning("lesson_chat_log_error", extra={"error": str(log_exc)})



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
        "typst_available": getattr(request.app.state, "typst_available", False),
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

    if body.rerun_job_id is not None:
        if not database.get_job(body.rerun_job_id):
            raise HTTPException(status_code=404, detail=f"Job {body.rerun_job_id} not found.")
    elif not body.force:
        existing = database.find_similar_jobs(body.company_name, body.job_title)
        if existing:
            return EvaluateResponse(
                success=False,
                duplicate_detected=True,
                existing_jobs=existing,
                evaluation_id=None,
                job_id=None,
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
        apply_url=strip_utm_params(body.apply_url),
        pay_band=body.pay_band,
        llm_model_id=body.llm_model_id,
        existing_job_id=body.rerun_job_id,
    )

    log.info(
        "evaluate_complete",
        extra={
            "job_id": result.get("job_id"),
            "success": result.get("success"),
        },
    )

    if result.get("success") and result.get("job_id"):
        try:
            from document_routes import _get_application_folder
            app_row = database.get_application_for_job(result["job_id"])
            if app_row:
                app_folder = _get_application_folder(
                    request.app.state.application_docs_dir,
                    dict(app_row)["id"],
                    body.company_name,
                )
                app_folder.mkdir(parents=True, exist_ok=True)
        except Exception as _folder_exc:
            log.warning("application_folder_create_failed", extra={"error": str(_folder_exc)})

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


@app.post("/api/v1/prompt-usage/{prompt_usage_id}/feedback")
@limiter.limit("60/minute")
async def submit_prompt_usage_feedback(
    request: Request, prompt_usage_id: int, body: PromptUsageFeedbackRequest
):
    """Record agree/disagree feedback on a prompt_usage row."""
    usage = database.get_prompt_usage(prompt_usage_id)
    if not usage:
        raise HTTPException(
            status_code=404, detail=f"prompt_usage {prompt_usage_id} not found."
        )
    database.update_prompt_feedback(
        prompt_usage_id=prompt_usage_id,
        agree=body.agree,
        dimension=body.dimension,
        feedback_text=body.feedback_text,
    )
    return JSONResponse({"success": True})


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
    return JSONResponse(data)


# ─────────────────────────────────────────────────────────────
# Jobs
# ─────────────────────────────────────────────────────────────

@app.get("/api/v1/jobs")
@limiter.limit("60/minute")
async def list_jobs(request: Request):
    """All jobs with current application status and aggregated scores."""
    jobs = database.get_all_jobs()
    eval_counts = database.get_eval_counts()
    result = []
    for j in jobs:
        row = dict(j)
        row['eval_count'] = eval_counts.get(row['id'], 0)
        result.append(row)
    return JSONResponse(result)


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

    evals_out = [dict(e) for e in evaluations]

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


@app.put("/api/v1/jobs/{job_id}/company-summary")
@limiter.limit("30/minute")
async def update_company_summary(request: Request, job_id: int, body: CompanySummaryRequest):
    """Insert or update the single company summary entry for a job."""
    job = database.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found.")
    database.upsert_company_summary(job_id, body.text)
    return JSONResponse({"success": True})


@app.get("/api/v1/jobs/{job_id}/application")
@limiter.limit("60/minute")
async def get_job_application(request: Request, job_id: int):
    """Check whether a job has an active application and return its status."""
    app_row = database.get_application_for_job(job_id)
    if app_row:
        return JSONResponse({"exists": True, "application": dict(app_row)})
    return JSONResponse({"exists": False, "application": None})


@app.post("/api/v1/jobs/{job_id}/activate")
@limiter.limit("30/minute")
async def activate_job(request: Request, job_id: int):
    """Set is_active = 1 for a job, promoting it to the active jobs list."""
    job = database.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found.")
    database.activate_job(job_id)
    updated = database.get_job(job_id)
    return JSONResponse(dict(updated))


@app.post("/api/v1/jobs/create")
@limiter.limit("10/minute")
async def create_job_without_eval(request: Request, body: CreateJobRequest):
    """Create a job record without running an AI evaluation."""
    if not body.company_name.strip():
        raise HTTPException(status_code=422, detail="company_name cannot be empty.")
    if not body.title.strip():
        raise HTTPException(status_code=422, detail="title cannot be empty.")

    job_id, _created = database.upsert_job(
        body.company_name.strip(),
        body.title.strip(),
        None,
        location=body.location,
        remote_type=body.remote_type,
        description_merged=body.description,
        pay_band=body.pay_band,
    )
    database.activate_job(job_id)

    if body.apply_url or body.description:
        database.insert_job_posting(
            job_id=job_id,
            source_board="manual",
            source_url=strip_utm_params(body.apply_url) if body.apply_url else None,
            description_raw=body.description,
        )

    return JSONResponse({"success": True, "job_id": job_id})


@app.post("/api/v1/jobs/{job_id}/export")
@limiter.limit("30/minute")
async def export_job(request: Request, job_id: int):
    """Write a re-importable .md file to inbox/done/ containing the job's details."""
    job = database.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found.")

    job = dict(job)
    postings = database.get_postings_for_job(job_id)
    posting = dict(postings[0]) if postings else {}

    source_url = posting.get("source_url") or ""
    description = job.get("description_merged") or posting.get("description_raw") or ""

    pay_band_val = job.get("pay_band") or ""
    timestamp = datetime.utcnow().strftime("%Y%m%dT%H%M%S")
    filename = f"{job_id}-export-{timestamp}.md"

    _, done_dir, _ = evaluate._get_inbox_paths()
    done_dir.mkdir(parents=True, exist_ok=True)

    lines = [
        "---",
        f"company: {job['company_name']}",
        f"title: {job['title']}",
        f"location: {job.get('location') or ''}",
        f"remote_type: {job.get('remote_type') or ''}",
        f"pay_band: {pay_band_val}",
        f"url: {source_url}",
        "date_posted: ",
        "notes: ",
        "---",
        "",
        description,
    ]

    dest = done_dir / filename
    dest.write_text("\n".join(lines), encoding="utf-8")

    return JSONResponse({"file_name": filename, "file_path": str(dest)})


@app.get("/api/v1/jobs/{job_id}/activity-log")
@limiter.limit("60/minute")
async def get_activity_log(request: Request, job_id: int):
    """Unified activity timeline for a job across all 7 data sources, newest first."""
    job = database.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found.")
    entries = database.get_activity_log(job_id)
    return JSONResponse({"entries": entries})


@app.post("/api/v1/jobs/{job_id}/generate-orgsummary-prompt")
@limiter.limit("10/minute")
async def generate_orgsummary_prompt(request: Request, job_id: int):
    """
    Build an org-summary prompt for the given job and log it to application_logs.
    Returns the prompt text.
    """
    job = database.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found.")
    job_dict = dict(job)

    # Resolve application_id — earliest application for this job, same as get_activity_log
    application_id = database.get_earliest_application_for_job(job_id)
    if application_id is None:
        raise HTTPException(
            status_code=404, detail=f"No application found for job {job_id}."
        )

    # Pull website URL from company log if present
    company_log = database.get_job_company_log(job_id, type_name="company_info")
    website_url = ""
    for entry in company_log:
        if dict(entry).get("type_value") == "website":
            website_url = dict(entry).get("url") or ""
            break

    company_name = job_dict.get("company_name") or "N/A"
    title = job_dict.get("title") or "N/A"

    prompt = f"""You are helping a job seeker quickly evaluate a company before applying. Research the following company and write a concise 2-3 paragraph summary for personal reference.

*Company Name*: {company_name}
*Company URL*: {website_url}
*Job Title*: {title}

Cover the following in your summary:
- What the company does, what market it operates in, and its approximate size
- General company culture and, if relevant to the job title, engineering or technical culture specifically
- Public reputation and employee sentiment (draw from sources like Glassdoor, Blind, or Reddit — keep research brief)

Write in plain, conversational prose. No headers or bullet points. Keep it tight — this is a quick reference, not a deep dive. If the URL is blank or a detail can't be found, skip it rather than guessing. Output your summary inside a markdown code block."""

    prompt_type_id = database.get_system_type_id("application_log", "prompt_orgsummary")
    if prompt_type_id is None:
        raise HTTPException(status_code=500, detail="system_types not seeded correctly.")

    log_id = database.add_application_log(
        application_id=application_id,
        type_id=prompt_type_id,
        log=prompt,
    )
    return JSONResponse({"success": True, "log_id": log_id, "prompt": prompt})


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
    """Add a new LLM model linked to an existing server."""
    if not database.get_server_by_id(body.server_id):
        raise HTTPException(status_code=404, detail=f"Server {body.server_id} not found.")
    model_id = database.insert_llm_model(
        model=body.model,
        server_id=body.server_id,
        model_weight=body.model_weight,
        default_flag=1 if body.default_flag else 0,
    )
    log.info("model_created", extra={"model_id": model_id, "model": body.model, "server_id": body.server_id})
    return JSONResponse({"success": True, "model_id": model_id})


@app.patch("/api/v1/models/{model_id}")
@limiter.limit("30/minute")
async def update_model(request: Request, model_id: int, body: UpdateModelRequest):
    """Update mutable fields on a model record. server_id is immutable after creation."""
    row = database.get_llm_model(model_id)
    if not row:
        raise HTTPException(status_code=404, detail=f"Model {model_id} not found.")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update.")
    if "default_flag" in updates:
        updates["default_flag"] = 1 if updates["default_flag"] else 0
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
    await _update_model_availability(request.app.state)
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
        "logs": [dict(log) for log in logs],
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

    # Auto-set apply_date when marking as applied, if not already set
    if body.applied == 1 and "apply_date" not in field_updates:
        if not dict(app_row).get("apply_date"):
            field_updates["apply_date"] = datetime.now(timezone.utc).strftime("%Y-%m-%d")

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
    Build a job evaluation prompt for this application and log it.
    Returns the prompt text for use with an external AI (eval only).
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

    company_name = job_dict.get("company_name") or "N/A"
    title = job_dict.get("title") or "N/A"
    location = job_dict.get("location") or "N/A"
    pay_band = job_dict.get("pay_band") or "Not listed"
    jd_text = job_dict.get("description_merged") or ""

    prompt_result = prompt_generation.get_prompt(
        "eval_external",
        {
            "company_name": company_name,
            "title": title,
            "location": location,
            "pay_band": pay_band,
            "jd_text": jd_text,
        },
        job_id=app_dict["job_id"],
        source="external_eval",
    )
    prompt = prompt_result["prompt_text"]
    prompt_usage_id = prompt_result["prompt_usage_id"]

    prompt_type_id = database.get_system_type_id("application_log", "prompt_eval")
    if prompt_type_id is None:
        raise HTTPException(status_code=500, detail="system_types not seeded correctly.")

    log_id = database.add_application_log(
        application_id=application_id,
        type_id=prompt_type_id,
        log=prompt,
    )
    return JSONResponse({
        "success": True,
        "log_id": log_id,
        "prompt": prompt,
        "prompt_usage_id": prompt_usage_id,
    })


@app.post("/api/v1/applications/{application_id}/generate-resume-prompt")
@limiter.limit("10/minute")
async def generate_resume_prompt(request: Request, application_id: int):
    """
    Build a tailored resume generation prompt for this application and log it.
    Returns the prompt text for use with an external AI.
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

    if eval_row:
        e = dict(eval_row)
        keywords_text = e.get("keywords") or "Not provided — will extract from JD"
        keyword_gaps_text = e.get("keyword_gaps") or "Not provided — will extract from JD"
    else:
        keywords_text = "Not provided — will extract from JD"
        keyword_gaps_text = "Not provided — will extract from JD"

    prompt = f"""## CONTEXT FILES

You have been provided the following files. Read both completely before
doing anything else:

- **jobsearch.md** — candidate profile, career history, tailoring rules
  (Always/Never), and model behavior rules. Every factual claim in the
  resume must be sourced from here.
- **resume_template.typ** — the structural and formatting base. Populate
  every [CONTENT: ...] block. Do not modify any formatting, font, color,
  layout, or helper function code — structure is fixed.

Confirm you have read both files before proceeding.

---

## CLARIFICATION GATE

Before generating anything, verify the following. If anything is
missing or ambiguous, ask a single clarifying question — do not guess
or assume:

- Is a job description present below? If not, ask for it.
- Is a company name and role title present? If not, ask.
- If evaluation output (ATS keywords + keyword gaps) from a prior
  evaluation is not provided, note that you will extract keywords
  directly from the JD and flag any gaps you identify.
- If the role type or seniority level is ambiguous, ask before
  proceeding — this affects summary framing, which content to
  emphasize, and which tailoring rules apply.

Do not generate the resume until all required inputs are confirmed.

---

## JOB DETAILS

Company: {company_name}
Title: {title}
Location: {location}
Pay Band: {pay_band}

---

## JOB DESCRIPTION

{jd_text}

---

## EVALUATION INPUT (optional — paste if available)

If a prior evaluation was run for this role, paste the ATS keywords
and keyword gaps here. The resume will confirm coverage against these
and flag any gaps that cannot be addressed without fabrication.

ATS Keywords: {keywords_text}
Keyword Gaps: {keyword_gaps_text}

---

## TASK: GENERATE TAILORED RESUME

Using **resume_template.typ** as the exact structural and formatting
base, generate a complete, ready-to-compile .typ file tailored to
this role.

### Rules — non-negotiable

- Use **jobsearch.md as the sole source of truth** for all facts.
  Never fabricate, inflate, or soften claims beyond what is documented.
- Apply **all Always and Never rules from the tailoring rules section
  of jobsearch.md** without exception. If a rule conflicts with a
  tailoring decision, apply the rule and flag the conflict — do not
  silently override.
- Do **not** modify any Typst formatting code — only populate
  [CONTENT: ...] blocks.
- **Target output: 2 pages when compiled.** If content runs long,
  compress experience bullets — do not adjust margins or font size.

### Tailoring priorities

Apply these in order based on the role type inferred from the JD.
All content must be drawn from jobsearch.md — these are selection
and ordering instructions, not content.

1. **Summary:** Lead with years of experience and domain breadth.
   Mirror the JD's language for the role's core responsibility.
   Close with a belief statement. Apply all style rules from the
   Never section of jobsearch.md (e.g. sentence construction rules).

2. **Key Impacts:** 6–8 bullets selected and ordered by relevance
   to this specific JD. Use the candidate's documented achievements
   from jobsearch.md. Apply the following selection logic:

   - **People development / manager pipeline:** Include when the role
     involves developing managers or building leadership depth. Drop
     or compress for IC-heavy or technical roles where this is low signal.
   - **AI tooling adoption:** Include for most roles. Compress if space
     is tight. Drop only if the JD has zero AI/tooling signal and a
     stronger bullet serves better.
   - **Largest scale / growth metric:** Include for growth, consumer,
     acquisition, or product-scale roles. Use the candidate's strongest
     documented scale signal from jobsearch.md.
   - **Regulated/compliance delivery:** Include for regulated, enterprise,
     government, or healthcare-adjacent roles.
   - **Cloud/platform delivery:** Include for platform, SaaS, or
     cloud-infrastructure roles.
   - **0-to-1 product launch:** Include for hardware, IoT, or
     build-from-scratch roles.
   - **Distributed remote team leadership:** Include when the JD
     explicitly values distributed or async team management.
   - **Operational excellence / incident response:** Include when the
     JD calls out reliability, observability, or engineering process rigor.

3. **Core Competencies:** Two columns as defined in the template.
   Prioritize competencies that mirror JD language directly.
   Source from jobsearch.md skills and strengths sections.

4. **Experience — most recent role(s):** Always include. Tailor the
   intro paragraph and bullets to emphasize what is most relevant to
   this JD. The template defines the sub-section structure — follow it.
   Compress or expand sub-sections based on relevance, but preserve
   the structure defined in the template.

5. **Experience — earlier roles:** Include and frame based on role type
   using the tailoring guidance in jobsearch.md. Earlier roles should
   compress as tenure recedes — preserve the most relevant signal and
   drop lower-signal detail to protect page budget.

   - For roles where early-career IC work is low signal: default to a
     single sentence with no bullets.
   - For roles where early-career domain experience is directly relevant
     (e.g. data platform, embedded systems, enterprise data): expand to
     1–2 bullets surfacing the specific signal. Source from jobsearch.md.
   - Apply all Never rules from jobsearch.md to early-career entries —
     honesty framing on contributed-to vs. led is especially important
     for early IC work.

### Keyword coverage check

After completing the resume, output a brief keyword coverage note:

> **Keyword Coverage:**
> - Covered: [keywords confirmed present in the resume]
> - Gaps remaining: [JD keywords not addressable without fabrication,
>   with a one-sentence note on why]

### Flagging rule

If any bullet in the tailored resume could be challenged in an
interview based on the Never rules in jobsearch.md, flag it inline:
`// ⚠ FLAG: [reason]`

---

## OUTPUT FORMAT

Deliver the complete .typ file content. Do not include explanatory
prose before or after — just the file, ready to compile."""

    prompt_type_id = database.get_system_type_id("application_log", "prompt_resume")
    if prompt_type_id is None:
        raise HTTPException(status_code=500, detail="system_types not seeded correctly.")

    log_id = database.add_application_log(
        application_id=application_id,
        type_id=prompt_type_id,
        log=prompt,
    )
    return JSONResponse({"success": True, "log_id": log_id, "prompt": prompt})


@app.post("/api/v1/applications/{application_id}/generate-cover-prompt")
@limiter.limit("10/minute")
async def generate_cover_prompt(request: Request, application_id: int):
    """
    Build a cover letter generation prompt for this application and log it.
    Returns the prompt text for use with an external AI.
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

    company_log = database.get_job_company_log(app_dict["job_id"], type_name="company_info")
    website_url = ""
    for entry in company_log:
        if dict(entry).get("type_value") == "website":
            website_url = dict(entry).get("url") or ""
            break

    company_name = job_dict.get("company_name") or "N/A"
    title = job_dict.get("title") or "N/A"
    jd_text = job_dict.get("description_merged") or ""
    website_display = website_url or "Not available — provide the company URL before proceeding"

    prompt = f"""## CONTEXT FILES

You have been provided the following files. Read all completely before
doing anything else:

- **jobsearch.md** — candidate profile, career history, and tailoring
  rules. The master factual source of truth for all claims.
- **jobsearch_cover.md** — cover letter voice, Always/Never rules,
  reusable content blocks, hook guidance, and generation instructions.
  Apply the Voice & Rules section and Pre-Draft Checklist without
  exception.
- **cover_letter_template.typ** — the structural and formatting base.
  Populate every [CONTENT: ...] block. Do not modify any formatting,
  font, color, layout, or helper function code.

Confirm you have read all three files before proceeding.

---

## ⛔ HARD STOP RULE

**Do not write a single word of the cover letter until the user has
confirmed the salutation, tone descriptor, and hook.** Propose first.
Write second. Always.

---

## CLARIFICATION GATE

Before doing anything else, verify the following. If anything is
missing, ask a single clarifying question — do not guess or assume:

- Is a job description present below? If not, ask for it.
- Is a company name, role title, and company website URL present?
  If the URL is missing, ask for it — company research is required
  before proposing a hook, and a generic letter is worse than no letter.
- Is any personal hook seed, scratchpad note, or context about this
  company provided? If not, note that you will propose a hook based
  on research — the user can accept, override, or request alternatives.
- If jobsearch_cover.md defines any scope framing rules that apply to
  this role type (e.g. a specific intent statement for certain
  seniority levels), flag whether it should be included and ask for
  confirmation.

Do not begin company research or proposal until all required inputs
are present.

---

## JOB DETAILS

Company: {company_name}
Role Title: {title}
Company Website: {website_display}
Hook Seed (optional):

---

## JOB DESCRIPTION

{jd_text}

---

## STEP 1 — COMPANY RESEARCH

Fetch and read the company website. Prioritize: About, Mission, Culture,
Values, and Team pages. Note specific language, themes, and values worth
mirroring in the letter.

If web browsing is not available in this session, ask the user to paste
the relevant About/Mission/Culture page content before proceeding.
Do not skip this step or substitute generic assumptions.

---

## STEP 2 — PRE-DRAFT CHECKLIST

Before proposing anything, run the Pre-Draft Checklist from the
Pre-Draft Checklist section of jobsearch_cover.md. Complete every
item — do not skip or summarize.

---

## STEP 3 — PROPOSAL (wait for confirmation before drafting)

After completing research and the checklist, propose the following.
Ask the user to confirm, adjust, or override before writing the letter:

**SALUTATION:** Suggested salutation with a one-sentence rationale.
  Apply the salutation guidance from jobsearch_cover.md — personable
  is the default bias unless the context calls for formal. Explain
  the choice.

**TONE:** One-word tone descriptor with a one-sentence rationale
  based on your company culture read. Reference the tone guidance in
  jobsearch_cover.md.

**HOOK:** A 2–3 sentence description of the opening angle you propose,
  grounded specifically in your company research. Explain why this hook
  is specific to this company and could not appear in any other letter.
  Reference the hook guidance and hook bank in jobsearch_cover.md for
  principles — do not reuse archived hooks verbatim.

**GAP FLAG:** If a meaningful gap exists between the candidate's
  background and this role, name it and ask whether to include the
  optional gap acknowledgment block defined in jobsearch_cover.md.

Then ask:
> "Want to proceed with these, or would you like to adjust anything
>  before I draft?"

**Do not write the letter until the user replies with confirmation.**

---

## STEP 4 — GENERATE COVER LETTER

After confirmation, generate the complete cover letter using
**cover_letter_template.typ** as the exact structural and formatting
base. Populate every [CONTENT: ...] block.

### Rules — non-negotiable

- Use **jobsearch.md and jobsearch_cover.md as the sole sources of
  truth** for all facts, voice, and reusable block content.
- Apply **all Always and Never rules from jobsearch_cover.md** and
  **jobsearch.md** without exception.
- Do **not** modify any Typst formatting code — only populate
  [CONTENT: ...] blocks.
- **Target: one page.** One page is the constraint — word count is a
  byproduct. If the draft runs long, tighten the body before
  delivering. Do not ask the user to cut it. Do not adjust margins
  or font size to compensate.
- The closing block defined in the template is fixed — do not modify it.

### Letter architecture

Follow the letter architecture defined in jobsearch_cover.md. Apply
the block selection and ordering guidance from the Generation
Instructions section — including which blocks are defaults, which are
conditional, and when to lead with a domain opener vs. the engineering
pillar directly.

### Flagging rule

If any claim in the letter could be challenged in an interview based
on the Never rules in jobsearch.md, flag it inline:
`// ⚠ FLAG: [reason]`

### Final check before delivering

Verify the company-specific closing line has been updated for this
company — this is the most common copy-paste error. Do not deliver
without confirming it.

---

## OUTPUT FORMAT

Deliver the complete .typ file content. Do not include explanatory
prose before or after — just the file, ready to compile.

---

## STEP 5 — POST-DELIVERY CHECK

After delivering the letter, note the following if applicable:

> "Block [X] had a strong variation in this letter worth archiving.
>  Want me to update jobsearch_cover.md?"

The user confirms before any update is written."""

    prompt_type_id = database.get_system_type_id("application_log", "prompt_cover")
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
    provider = "anthropic" if model_info.get("server_type") == "anthropic" else "ollama"

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
# Application Questions
# ─────────────────────────────────────────────────────────────

@app.get("/api/v1/applications/{application_id}/questions")
@limiter.limit("60/minute")
async def list_application_questions(request: Request, application_id: int):
    """Return all Q&A entries for an application."""
    app_row = database.get_application(application_id)
    if not app_row:
        raise HTTPException(status_code=404, detail=f"Application {application_id} not found.")
    rows = database.get_application_questions(application_id)
    return JSONResponse([dict(r) for r in rows])


@app.post("/api/v1/applications/{application_id}/questions")
@limiter.limit("30/minute")
async def create_application_question(
    request: Request, application_id: int, body: CreateQuestionRequest
):
    """Create a new application Q&A entry."""
    app_row = database.get_application(application_id)
    if not app_row:
        raise HTTPException(status_code=404, detail=f"Application {application_id} not found.")
    if not body.question.strip():
        raise HTTPException(status_code=400, detail="question must not be empty.")
    new_id = database.create_application_question(
        application_id, body.question, body.response
    )
    rows = database.get_application_questions(application_id)
    record = next((dict(r) for r in rows if r["id"] == new_id), None)
    return JSONResponse(record, status_code=201)


@app.patch("/api/v1/applications/{application_id}/questions/{question_id}")
@limiter.limit("30/minute")
async def update_application_question(
    request: Request,
    application_id: int,
    question_id: int,
    body: UpdateQuestionRequest,
):
    """Update the question text and/or response on an existing Q&A entry."""
    app_row = database.get_application(application_id)
    if not app_row:
        raise HTTPException(status_code=404, detail=f"Application {application_id} not found.")
    updated = database.update_application_question(
        question_id, body.question, body.response
    )
    if not updated:
        raise HTTPException(status_code=404, detail=f"Question {question_id} not found.")
    rows = database.get_application_questions(application_id)
    record = next((dict(r) for r in rows if r["id"] == question_id), None)
    return JSONResponse(record)


@app.delete("/api/v1/applications/{application_id}/questions/{question_id}")
@limiter.limit("30/minute")
async def delete_application_question(
    request: Request, application_id: int, question_id: int
):
    """Delete an application Q&A entry."""
    app_row = database.get_application(application_id)
    if not app_row:
        raise HTTPException(status_code=404, detail=f"Application {application_id} not found.")
    deleted = database.delete_application_question(question_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Question {question_id} not found.")
    return JSONResponse({"deleted": True})


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
    if key not in _VALID_APP_SETTING_KEYS:
        raise HTTPException(status_code=400, detail=f"Unknown setting key: '{key}'")
    database.set_app_setting(key, body.value)
    return JSONResponse({"success": True, "key": key, "value": body.value})


@app.get("/api/v1/settings/documents-storage")
@limiter.limit("30/minute")
async def get_documents_storage(request: Request):
    """Disk usage for generated documents and Typst availability status."""
    application_docs_dir: Path = getattr(request.app.state, "application_docs_dir", Path("./app_data/application_docs"))
    typst_available: bool = getattr(request.app.state, "typst_available", False)
    typst_binary: str = getattr(request.app.state, "typst_binary", "typst")

    total_bytes = 0
    file_count = 0
    if application_docs_dir.exists():
        for f in application_docs_dir.rglob("*"):
            if f.is_file():
                total_bytes += f.stat().st_size
                file_count += 1

    return JSONResponse({
        "application_docs_dir": str(application_docs_dir),
        "total_bytes": total_bytes,
        "total_mb": round(total_bytes / 1048576, 1),
        "file_count": file_count,
        "typst_available": typst_available,
        "typst_binary": typst_binary,
    })


# ─────────────────────────────────────────────────────────────
# Settings / LLM Servers
# ─────────────────────────────────────────────────────────────

_VALID_SERVER_TYPES = frozenset({"local", "anthropic"})

# Claude models supported via Anthropic API — update as new versions ship
_KNOWN_ANTHROPIC_MODELS = [
    "claude-opus-4-7",
    "claude-sonnet-4-6",
    "claude-haiku-4-5-20251001",
]


@app.get("/api/v1/settings/llm-servers")
@limiter.limit("60/minute")
async def list_servers(request: Request):
    """Return all LLM servers with model count and anthropic key status."""
    servers = database.get_all_servers()
    result = []
    for row in servers:
        s = dict(row)
        s["model_count"] = database.get_model_count_for_server(s["id"])
        if s["server_type"] == "anthropic":
            s["anthropic_key_present"] = request.app.state.anthropic_key_present
        result.append(s)
    return JSONResponse({"servers": result})


@app.post("/api/v1/settings/llm-servers")
@limiter.limit("30/minute")
async def create_server(request: Request, body: CreateServerRequest):
    """Create a new LLM server record."""
    if body.server_type not in _VALID_SERVER_TYPES:
        raise HTTPException(status_code=422, detail=f"server_type must be one of: {', '.join(_VALID_SERVER_TYPES)}")
    if body.server_type == "local":
        if not body.endpoint:
            raise HTTPException(status_code=422, detail="endpoint is required for local servers.")
        if not (body.endpoint.startswith("http://") or body.endpoint.startswith("https://")):
            raise HTTPException(status_code=422, detail="endpoint must start with http:// or https://")
    if body.server_type == "anthropic":
        existing = [dict(s) for s in database.get_all_servers() if dict(s)["server_type"] == "anthropic"]
        if existing:
            raise HTTPException(status_code=409, detail="An Anthropic server is already configured.")
    server_id = database.create_server(
        server_name=body.server_name,
        endpoint=body.endpoint if body.server_type == "local" else None,
        server_type=body.server_type,
    )
    row = database.get_server_by_id(server_id)
    result = dict(row)
    result["model_count"] = 0
    if body.server_type == "anthropic":
        result["anthropic_key_present"] = request.app.state.anthropic_key_present
    log.info("server_created", extra={"server_id": server_id, "server_type": body.server_type})
    return JSONResponse(result, status_code=201)


@app.put("/api/v1/settings/llm-servers/{server_id}")
@limiter.limit("30/minute")
async def update_server(request: Request, server_id: int, body: UpdateServerRequest):
    """Update a server's name and endpoint. server_type is immutable."""
    row = database.get_server_by_id(server_id)
    if not row:
        raise HTTPException(status_code=404, detail=f"Server {server_id} not found.")
    server = dict(row)
    if server["server_type"] == "local" and body.endpoint:
        if not (body.endpoint.startswith("http://") or body.endpoint.startswith("https://")):
            raise HTTPException(status_code=422, detail="endpoint must start with http:// or https://")
    database.update_server(server_id, server_name=body.server_name, endpoint=body.endpoint)
    updated = dict(database.get_server_by_id(server_id))
    updated["model_count"] = database.get_model_count_for_server(server_id)
    if server["server_type"] == "anthropic":
        updated["anthropic_key_present"] = request.app.state.anthropic_key_present
    log.info("server_updated", extra={"server_id": server_id})
    return JSONResponse(updated)


@app.delete("/api/v1/settings/llm-servers/{server_id}")
@limiter.limit("30/minute")
async def delete_server(request: Request, server_id: int):
    """Delete a server. Blocked if any models reference it."""
    row = database.get_server_by_id(server_id)
    if not row:
        raise HTTPException(status_code=404, detail=f"Server {server_id} not found.")
    model_count = database.get_model_count_for_server(server_id)
    if model_count > 0:
        raise HTTPException(
            status_code=409,
            detail=f"This server has {model_count} model(s). Delete or reassign them first.",
        )
    database.delete_server(server_id)
    log.info("server_deleted", extra={"server_id": server_id})
    return JSONResponse({"success": True})


@app.post("/api/v1/settings/llm-servers/test")
@limiter.limit("20/minute")
async def test_server_connection(request: Request, body: TestConnectionRequest):
    """Test a server connection without creating a record."""
    if body.server_type == "local":
        if not body.endpoint:
            raise HTTPException(status_code=422, detail="endpoint is required for local server test.")
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{body.endpoint.rstrip('/')}/api/tags")
            if resp.status_code == 200:
                data = resp.json()
                model_count = len(data.get("models", []))
                return JSONResponse({"success": True, "model_count": model_count})
            return JSONResponse({"success": False, "error": f"Ollama returned HTTP {resp.status_code}."})
        except httpx.ConnectError:
            return JSONResponse({"success": False, "error": f"Could not reach Ollama at {body.endpoint}."})
        except Exception as exc:
            return JSONResponse({"success": False, "error": f"Connection error: {exc}"})

    if body.server_type == "anthropic":
        if not request.app.state.anthropic_key_present:
            return JSONResponse({"success": False, "error": "No API key set. Add ANTHROPIC_API_KEY to your .env file."})
        api_key = get_env_key("ANTHROPIC_API_KEY")
        try:
            import anthropic as anthropic_sdk
            client = anthropic_sdk.AsyncAnthropic(api_key=api_key)
            await client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=1,
                messages=[{"role": "user", "content": "hi"}],
            )
            return JSONResponse({"success": True})
        except anthropic_sdk.AuthenticationError:
            return JSONResponse({"success": False, "error": "API key is invalid. Check the value in your .env file."})
        except Exception as exc:
            return JSONResponse({"success": False, "error": f"Anthropic API error: {exc}"})

    raise HTTPException(status_code=422, detail=f"server_type must be one of: {', '.join(_VALID_SERVER_TYPES)}")


@app.get("/api/v1/settings/llm-servers/{server_id}/available-models")
@limiter.limit("20/minute")
async def get_available_models(request: Request, server_id: int):
    """Return models available on this server for the import flow."""
    row = database.get_server_by_id(server_id)
    if not row:
        raise HTTPException(status_code=404, detail=f"Server {server_id} not found.")
    server = dict(row)
    if server["server_type"] == "anthropic":
        return JSONResponse({"models": _KNOWN_ANTHROPIC_MODELS})
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{server['endpoint'].rstrip('/')}/api/tags")
        if resp.status_code != 200:
            raise HTTPException(status_code=503, detail="Ollama server returned an error.")
        model_names = [m["name"] for m in resp.json().get("models", [])]
        return JSONResponse({"models": sorted(model_names)})
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Could not reach Ollama: {exc}")


@app.get("/api/v1/settings/anthropic-key")
@limiter.limit("30/minute")
async def get_anthropic_key_status(request: Request):
    """Return whether the Anthropic API key is set. Never echoes the key value."""
    return JSONResponse({"anthropic_key_present": request.app.state.anthropic_key_present})


# ─────────────────────────────────────────────────────────────
# Prompts
# ─────────────────────────────────────────────────────────────

@app.get("/api/v1/prompts")
@limiter.limit("60/minute")
async def list_prompts(request: Request):
    """Return all active prompts (one per key)."""
    return JSONResponse(database.get_all_active_prompts())


@app.get("/api/v1/prompts/{key}")
@limiter.limit("60/minute")
async def get_prompt(request: Request, key: str):
    """Return the active prompt for a key. 404 if not found."""
    row = database.get_active_prompt(key)
    if not row:
        raise HTTPException(status_code=404, detail=f"Prompt '{key}' not found.")
    return JSONResponse(row)


@app.post("/api/v1/prompts/{key}/save")
@limiter.limit("30/minute")
async def save_prompt(request: Request, key: str, body: PromptSaveRequest):
    """Save a new version of a prompt. Deactivates the current active version."""
    existing = database.get_active_prompt(key)
    if not existing:
        raise HTTPException(status_code=404, detail=f"Prompt '{key}' not found.")
    database.save_prompt(key, body.segments_text, body.note)
    updated = database.get_active_prompt(key)
    return JSONResponse({"success": True, "version": updated["version"]})


@app.get("/api/v1/prompts/{key}/preview")
@limiter.limit("60/minute")
async def preview_prompt(request: Request, key: str):
    """Return the assembled prompt text with preview_context values substituted."""
    row = database.get_active_prompt(key)
    if not row:
        raise HTTPException(status_code=404, detail=f"Prompt '{key}' not found.")
    assembled = database.assemble_prompt(row["segments_text"])
    preview_context = row.get("preview_context")
    if preview_context:
        try:
            import json as _json
            ctx = _json.loads(preview_context)
            for k, v in ctx.items():
                assembled = assembled.replace(f"{{{k}}}", str(v))
        except Exception:
            pass
    return JSONResponse({"preview_text": assembled})


@app.post("/api/v1/prompts/{key}/feedback-loop")
@limiter.limit("2/minute")
async def run_feedback_loop(request: Request, key: str):
    """
    Gather unprocessed feedback for a prompt, send to cloud LLM for improvement
    suggestions, mark feedback consumed, return suggestions text.
    """
    feedback_rows = database.get_unprocessed_feedback(key)
    if not feedback_rows:
        return JSONResponse({"success": False, "reason": "no_feedback"})

    prompt_row = database.get_active_prompt(key)
    if not prompt_row:
        raise HTTPException(status_code=404, detail=f"Prompt '{key}' not found.")

    default_model = database.get_default_llm_model()
    if not default_model:
        raise HTTPException(
            status_code=503, detail="No LLM model configured — add one in Settings."
        )
    model_info = dict(default_model)
    endpoint = model_info.get("endpoint", "")
    provider = "anthropic" if model_info.get("server_type") == "anthropic" else "ollama"

    assembled = database.assemble_prompt(prompt_row["segments_text"])

    feedback_lines = []
    for row in feedback_rows:
        agree_label = "Agree" if row["agree"] == 1 else "Disagree"
        parts = [f"- {agree_label}"]
        if row.get("dimension"):
            parts.append(f"dimension={row['dimension']}")
        if row.get("feedback_text"):
            parts.append(f'comment="{row["feedback_text"]}"')
        feedback_lines.append(" | ".join(parts))

    system = (
        "You are an expert prompt engineer reviewing user feedback on an AI evaluation prompt. "
        "Analyze the feedback and suggest specific, actionable improvements to the prompt. "
        "Be concise and specific — reference the relevant part of the prompt for each suggestion."
    )
    user_prompt = (
        f"Current prompt:\n---\n{assembled}\n---\n\n"
        f"User feedback ({len(feedback_rows)} entries):\n"
        + "\n".join(feedback_lines)
        + "\n\nSuggest improvements to this prompt based on the feedback above."
    )

    result = await llm_client.complete(
        prompt=user_prompt,
        system=system,
        model=model_info["model"],
        provider=provider,
        base_url=endpoint,
    )

    feedback_ids = [row["id"] for row in feedback_rows]
    database.mark_feedback_consumed(feedback_ids)

    if not result.get("success"):
        return JSONResponse(
            {"success": False, "reason": result.get("error", "llm_error")},
            status_code=502,
        )

    return JSONResponse({
        "success": True,
        "suggestions": result["content"],
        "feedback_count": len(feedback_rows),
    })


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
