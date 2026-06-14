"""
profile_routes.py
─────────────────
Profile API routes for AIstivus Phase 1.2.

Registered in main.py under /api/v1 prefix.

Routes:
  GET   /api/v1/profile/health
  GET   /api/v1/profile/sections
  PATCH /api/v1/profile/sections/{section_id}
  GET   /api/v1/profile/versions
  GET   /api/v1/profile/versions/{version_id}
  POST  /api/v1/profile/restore/{version_id}
  POST  /api/v1/profile/chat               (SSE streaming)
  POST  /api/v1/profile/propose-update
  POST  /api/v1/profile/synthesize-insights
  POST  /api/v1/profile/coherence-check
  POST  /api/v1/profile/quality-audit
  POST  /api/v1/profile/generate-tailoring-rules
"""

import re
import time
from pathlib import Path
from typing import AsyncGenerator

import yaml
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
import database
import llm_client
from limiter import limiter
from logger import get_logger

log = get_logger(__name__)
router = APIRouter()

# ─────────────────────────────────────────────────────────────
# Section metadata — stable identifiers drive API routes and frontend state
# ─────────────────────────────────────────────────────────────

_SECTION_ORDER: list[str] = [
    "who_i_am",
    "career_narrative",
    "career_history",
    "skills_strengths",
    "target_role",
    "resume_master",
    "tailoring_rules",
    "insights_lessons",
    "model_behavior",
]

_SECTION_NAMES: dict[str, str] = {
    "who_i_am": "Who I Am",
    "career_narrative": "Career Narrative",
    "career_history": "Career History",
    "skills_strengths": "Skills & Strengths",
    "target_role": "Target Role Profile",
    "resume_master": "Resume Master Copy",
    "tailoring_rules": "Tailoring Rules",
    "insights_lessons": "Insights & Lessons",
    "model_behavior": "Model Behavior Rules",
}

# Maps section_id → recommended AI mode for the frontend toggle default
_RECOMMENDED_MODES: dict[str, str] = {
    "who_i_am": "either",
    "career_narrative": "socratic",
    "career_history": "socratic",
    "skills_strengths": "directive",
    "target_role": "either",
    "resume_master": "either",
    "tailoring_rules": "generate",
    "insights_lessons": "synthesize",
    "model_behavior": "edit_only",
}

_KNOWN_SECTION_IDS: frozenset[str] = frozenset(_SECTION_ORDER)

# ─────────────────────────────────────────────────────────────
# Chat system prompt fragments per section and mode
# ─────────────────────────────────────────────────────────────

_SOCRATIC_FOCUS: dict[str, str] = {
    "who_i_am": (
        "Ask the user about their professional background, seniority level, and the one or two "
        "defining strengths they most want employers to associate with them. Use open-ended questions."
    ),
    "career_narrative": (
        "Ask about their career transitions and why they made them. Help them articulate the "
        "through-line of their career in 2-3 focused sentences."
    ),
    "career_history": (
        "Ask about specific roles — team sizes, business context, key projects, outcomes, and "
        "metrics. Elicit concrete examples with measurable results. One role at a time."
    ),
    "skills_strengths": (
        "Ask about specific tools and technologies, leadership or management scope, and the domain "
        "expertise areas they most want to highlight."
    ),
    "target_role": (
        "Ask about role preferences, must-haves, and explicit deal-breakers. Help them separate "
        "true constraints from preferences."
    ),
    "resume_master": (
        "Ask the user to paste their current resume or a section of it, then walk through each "
        "section asking clarifying questions about major achievements."
    ),
    "insights_lessons": (
        "Ask what happened recently in their job search. What did they learn? What surprised them? "
        "What would they do differently?"
    ),
}

_DIRECTIVE_FOCUS: dict[str, str] = {
    "who_i_am": (
        "Based on what the user shares, draft a concise professional summary paragraph. "
        "Present it and ask for their reaction."
    ),
    "career_narrative": (
        "Draft a 2-3 sentence career narrative based on what the user tells you. "
        "Make it specific and honest, not generic."
    ),
    "career_history": (
        "Generate achievement-oriented bullet points from the details the user provides. "
        "Format: action verb + context + measurable outcome."
    ),
    "skills_strengths": (
        "Generate a categorized skills list from what the user describes. "
        "Group by category, e.g. Languages, Tools, Leadership, Domain Expertise."
    ),
    "target_role": (
        "Draft a target role profile from the preferences the user states. "
        "Include must-haves, nice-to-haves, and explicit deal-breakers."
    ),
    "resume_master": (
        "Review the resume the user pastes against their stated target profile. "
        "Identify weak bullets, gaps, and sections that need strengthening."
    ),
    "insights_lessons": (
        "Summarize the lessons the user shares into a structured, concise format "
        "suitable for their profile."
    ),
}

# Framing adjustments for experience levels that need different question style
_EXPERIENCE_ADJUSTMENTS: dict[str, str] = {
    "New grad": (
        "This person is a new grad or student. Replace any framing about 'key achievements with "
        "metrics at work' with questions about class projects, internships, personal projects, and "
        "non-work leadership. Education and projects are first-class experience."
    ),
    "Career changer": (
        "This person is changing careers. Emphasize translation of prior domain experience into "
        "their target domain. Help surface transferable skills that would not be obvious from a "
        "standard corporate resume."
    ),
}

# ─────────────────────────────────────────────────────────────
# Request / Response models
# ─────────────────────────────────────────────────────────────


class PatchSectionRequest(BaseModel):
    content: str
    note: str = "Manual edit"


class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    section_id: str
    mode: str  # "socratic" | "directive"
    messages: list[ChatMessage]
    section_content: str = ""
    experience_level: str | None = None
    model_id: int | None = None


class ProposeUpdateRequest(BaseModel):
    section_id: str
    mode: str
    messages: list[ChatMessage]
    section_content: str = ""
    experience_level: str | None = None
    model_id: int | None = None


class OneShotRequest(BaseModel):
    model_id: int | None = None


# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────


def _load_config() -> dict:
    config_path = Path("user_data/config.yaml")
    if config_path.exists():
        with open(config_path) as f:
            return yaml.safe_load(f) or {}
    return {}


def _get_jobsearch_path() -> Path:
    config = _load_config()
    return Path(config.get("evaluation", {}).get("jobsearch_md_path", "user_data/my_data/jobsearch.md"))


def _resolve_default_model() -> dict | None:
    """Return model info dict for the default LLM, or None if none configured."""
    row = database.get_default_llm_model()
    if not row:
        return None
    d = dict(row)
    endpoint = d.get("endpoint", "")
    provider = "anthropic" if d.get("server_type") == "anthropic" else "ollama"
    return {
        "id": d["id"],
        "model": d["model"],
        "endpoint": endpoint,
        "provider": provider,
    }


def _resolve_model(model_id: int | None) -> dict | None:
    """Return model info dict for model_id if provided and available, else the default model."""
    if model_id is not None:
        row = database.get_llm_model(model_id)
        if row:
            d = dict(row)
            endpoint = d.get("endpoint", "")
            provider = "anthropic" if d.get("server_type") == "anthropic" else "ollama"
            return {
                "id": d["id"],
                "model": d["model"],
                "endpoint": endpoint,
                "provider": provider,
            }
    return _resolve_default_model()


def _build_system_prompt(
    section_id: str,
    mode: str,
    section_content: str,
    experience_level: str | None,
) -> str:
    section_name = _SECTION_NAMES.get(section_id, section_id)
    lines: list[str] = [
        f"You are an expert career coach helping the user build the '{section_name}' "
        "section of their job search profile.",
        "",
    ]

    if section_content.strip():
        lines += [
            "Current section content:",
            "---",
            section_content.strip(),
            "---",
            "",
        ]
    else:
        lines += [
            "This section is currently empty — help the user build it from scratch.",
            "",
        ]

    if mode == "socratic" and section_id in _SOCRATIC_FOCUS:
        lines += [
            "Mode: Socratic. Ask one focused question at a time to draw out the user's story.",
            _SOCRATIC_FOCUS[section_id],
        ]
    elif mode == "directive" and section_id in _DIRECTIVE_FOCUS:
        lines += [
            "Mode: Directive. Draft content based on what the user shares and offer it for reaction.",
            _DIRECTIVE_FOCUS[section_id],
        ]
    else:
        lines.append("Help the user develop this section through conversation.")

    if experience_level and experience_level in _EXPERIENCE_ADJUSTMENTS:
        lines += ["", _EXPERIENCE_ADJUSTMENTS[experience_level]]

    lines += [
        "",
        "Keep responses conversational and focused. "
        "In Socratic mode, ask one question at a time.",
    ]
    return "\n".join(lines)


def _format_conversation(messages: list[ChatMessage]) -> str:
    """Flatten a message list into a readable prompt string."""
    parts: list[str] = []
    for msg in messages:
        label = "User" if msg.role == "user" else "Assistant"
        parts.append(f"{label}: {msg.content}")
    return "\n\n".join(parts)


async def _sse_generator(
    prompt: str,
    system: str,
    model: str,
    provider: str,
    base_url: str,
    llm_model_id: int,
) -> AsyncGenerator[str, None]:
    """Async generator that yields SSE-formatted tokens and logs the call when done."""
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
        log.warning("profile_chat_stream_error", extra={"error": str(exc)})
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
        )
    except Exception as log_exc:
        log.warning("profile_chat_log_error", extra={"error": str(log_exc)})


# ─────────────────────────────────────────────────────────────
# Routes — Profile health and sections
# ─────────────────────────────────────────────────────────────


@router.get("/profile/health")
@limiter.limit("60/minute")
async def profile_health(request: Request) -> JSONResponse:
    """
    Return completion status for each jobsearch.md section.
    Safe to call when file is missing — returns file_exists: false.
    """
    js_path = _get_jobsearch_path()

    if not js_path.exists():
        sections_out = [
            {"id": sid, "name": _SECTION_NAMES[sid], "complete": False}
            for sid in _SECTION_ORDER
        ]
        return JSONResponse({
            "total_sections": len(_SECTION_ORDER),
            "completed_sections": 0,
            "completion_pct": 0,
            "sections": sections_out,
            "file_exists": False,
            "token_estimate": 0,
        })

    content = js_path.read_text(encoding="utf-8")
    parsed = database.parse_jobsearch_sections(content)

    sections_out = []
    completed = 0
    for sid in _SECTION_ORDER:
        is_complete = database.is_section_complete(parsed.get(sid, ""))
        if is_complete:
            completed += 1
        sections_out.append({
            "id": sid,
            "name": _SECTION_NAMES[sid],
            "complete": is_complete,
        })

    total = len(_SECTION_ORDER)
    pct = round((completed / total) * 100) if total else 0
    token_estimate = len(content) // 4

    return JSONResponse({
        "total_sections": total,
        "completed_sections": completed,
        "completion_pct": pct,
        "sections": sections_out,
        "file_exists": True,
        "token_estimate": token_estimate,
    })


@router.get("/profile/sections")
@limiter.limit("60/minute")
async def profile_sections(request: Request) -> JSONResponse:
    """Return all 9 sections with content and completion status."""
    js_path = _get_jobsearch_path()
    if not js_path.exists():
        raise HTTPException(status_code=404, detail="jobsearch.md not found.")

    content = js_path.read_text(encoding="utf-8")
    parsed = database.parse_jobsearch_sections(content)

    sections_out = []
    for sid in _SECTION_ORDER:
        section_content = parsed.get(sid, "")
        sections_out.append({
            "id": sid,
            "name": _SECTION_NAMES[sid],
            "content": section_content,
            "complete": database.is_section_complete(section_content),
            "recommended_mode": _RECOMMENDED_MODES.get(sid, "either"),
        })

    return JSONResponse({"sections": sections_out})


@router.patch("/profile/sections/{section_id}")
@limiter.limit("30/minute")
async def patch_section(
    request: Request, section_id: str, body: PatchSectionRequest
) -> JSONResponse:
    """
    Update a single section by ID.
    Snapshots the current file to jobsearch_versions before writing.
    """
    if section_id not in _KNOWN_SECTION_IDS:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown section_id '{section_id}'. "
            f"Valid: {', '.join(sorted(_KNOWN_SECTION_IDS))}",
        )

    js_path = _get_jobsearch_path()
    if not js_path.exists():
        raise HTTPException(status_code=404, detail="jobsearch.md not found.")

    current_content = js_path.read_text(encoding="utf-8")

    # Snapshot before writing — preserves undo history
    version_id = database.save_jobsearch_version(current_content, body.note)

    updated_content = database.rebuild_jobsearch_from_sections(
        {section_id: body.content}, current_content
    )
    js_path.write_text(updated_content, encoding="utf-8")

    log.info(
        "profile_section_updated",
        extra={"section_id": section_id, "version_id": version_id},
    )
    return JSONResponse({"success": True, "version_id": version_id})


# ─────────────────────────────────────────────────────────────
# Routes — Version history
# ─────────────────────────────────────────────────────────────


@router.get("/profile/versions")
@limiter.limit("60/minute")
async def list_versions(request: Request) -> JSONResponse:
    """Return recent version metadata from jobsearch_versions (newest first)."""
    versions = database.get_jobsearch_versions(limit=30)
    return JSONResponse(versions)


@router.get("/profile/versions/{version_id}")
@limiter.limit("60/minute")
async def get_version(request: Request, version_id: int) -> JSONResponse:
    """Return full content of a specific version for preview or restore."""
    row = database.get_jobsearch_version_by_id(version_id)
    if not row:
        raise HTTPException(status_code=404, detail=f"Version {version_id} not found.")
    return JSONResponse(row)


@router.post("/profile/restore/{version_id}")
@limiter.limit("10/minute")
async def restore_version(request: Request, version_id: int) -> JSONResponse:
    """
    Restore a historical version of jobsearch.md.
    Snapshots the current file first so the restore itself is undoable.
    """
    row = database.get_jobsearch_version_by_id(version_id)
    if not row:
        raise HTTPException(status_code=404, detail=f"Version {version_id} not found.")

    js_path = _get_jobsearch_path()

    if js_path.exists():
        current_content = js_path.read_text(encoding="utf-8")
        database.save_jobsearch_version(current_content, "Pre-restore snapshot")

    js_path.parent.mkdir(parents=True, exist_ok=True)
    js_path.write_text(row["content"], encoding="utf-8")

    log.info("profile_version_restored", extra={"version_id": version_id})
    return JSONResponse({"success": True})


# ─────────────────────────────────────────────────────────────
# Routes — AI chat (SSE streaming)
# ─────────────────────────────────────────────────────────────


@router.post("/profile/chat")
@limiter.limit("20/minute")
async def profile_chat(request: Request, body: ChatRequest) -> StreamingResponse:
    """
    SSE streaming chat for a specific profile section.
    Events: data: {token}\\n\\n  ...  data: [DONE]\\n\\n
    On error: data: [STREAM_ERROR]\\n\\n
    """
    if body.section_id not in _KNOWN_SECTION_IDS:
        raise HTTPException(
            status_code=422, detail=f"Unknown section_id '{body.section_id}'."
        )
    if not body.messages:
        raise HTTPException(status_code=400, detail="messages must not be empty.")

    model_info = _resolve_model(body.model_id)
    if not model_info:
        raise HTTPException(
            status_code=503, detail="No LLM model configured — add one in Settings."
        )

    system = _build_system_prompt(
        section_id=body.section_id,
        mode=body.mode,
        section_content=body.section_content,
        experience_level=body.experience_level,
    )
    prompt = _format_conversation(body.messages)

    return StreamingResponse(
        _sse_generator(
            prompt=prompt,
            system=system,
            model=model_info["model"],
            provider=model_info["provider"],
            base_url=model_info["endpoint"],
            llm_model_id=model_info["id"],
        ),
        media_type="text/event-stream",
    )


@router.post("/profile/propose-update")
@limiter.limit("10/minute")
async def propose_update(request: Request, body: ProposeUpdateRequest) -> JSONResponse:
    """
    Non-streaming: synthesize conversation into a full section draft.
    Returns proposed_content for the frontend Accept/Discard flow.
    """
    if body.section_id not in _KNOWN_SECTION_IDS:
        raise HTTPException(
            status_code=422, detail=f"Unknown section_id '{body.section_id}'."
        )
    if not body.messages:
        raise HTTPException(status_code=400, detail="messages must not be empty.")

    model_info = _resolve_model(body.model_id)
    if not model_info:
        raise HTTPException(
            status_code=503, detail="No LLM model configured — add one in Settings."
        )

    section_name = _SECTION_NAMES.get(body.section_id, body.section_id)
    system = (
        f"You are extracting the result of a career coaching conversation into a structured "
        f"profile section.\n"
        f"Write the complete content for the '{section_name}' section based on the conversation.\n"
        f"Return ONLY the section content — no headers, no preamble, no commentary.\n"
        f"If the conversation lacks detail for any part, include [FILL] as a placeholder."
    )

    conversation_text = _format_conversation(body.messages)
    prompt = (
        f"Conversation:\n\n{conversation_text}\n\n"
        f"Write the complete '{section_name}' section content:"
    )

    start_ms = int(time.time() * 1000)
    result = await llm_client.complete(
        prompt=prompt,
        system=system,
        model=model_info["model"],
        provider=model_info["provider"],
        base_url=model_info["endpoint"],
    )
    latency_ms = int(time.time() * 1000) - start_ms

    database.insert_llm_call_log(
        llm_model_id=model_info["id"],
        call_type="chat",
        raw_response=result.get("content"),
        latency_ms=latency_ms,
        success=1 if result.get("success") else 0,
        error_message=result.get("error"),
    )

    if not result.get("success"):
        raise HTTPException(
            status_code=502, detail=f"LLM call failed: {result.get('error')}"
        )

    return JSONResponse({
        "proposed_content": result["content"],
        "section_id": body.section_id,
    })


# ─────────────────────────────────────────────────────────────
# Routes — One-shot actions
# ─────────────────────────────────────────────────────────────


async def _call_llm_and_log_async(
    model_info: dict,
    prompt: str,
    system: str,
) -> dict:
    """Async version of LLM call + log. Returns the result dict."""
    start_ms = int(time.time() * 1000)
    result = await llm_client.complete(
        prompt=prompt,
        system=system,
        model=model_info["model"],
        provider=model_info["provider"],
        base_url=model_info["endpoint"],
    )
    latency_ms = int(time.time() * 1000) - start_ms
    database.insert_llm_call_log(
        llm_model_id=model_info["id"],
        call_type="chat",
        raw_response=result.get("content"),
        latency_ms=latency_ms,
        success=1 if result.get("success") else 0,
        error_message=result.get("error"),
    )
    return result


def _format_logs_for_prompt(logs: list) -> str:
    """Format application log rows into a readable block for LLM prompts."""
    if not logs:
        return "No relevant logs found."
    lines: list[str] = []
    for row in logs:
        d = dict(row)
        date = (d.get("log_timestamp") or "")[:10]
        company = d.get("company_name") or "Unknown company"
        title = d.get("title") or "Unknown role"
        type_val = d.get("type_value") or ""
        content = d.get("log") or ""
        lines.append(f"[{date}] {company} — {title} ({type_val}):\n{content}")
    return "\n\n".join(lines)


@router.post("/profile/synthesize-insights")
@limiter.limit("5/minute")
async def synthesize_insights(request: Request, body: OneShotRequest = OneShotRequest()) -> JSONResponse:
    """
    One-shot: read application logs and current insights section, synthesize with LLM.
    Returns a proposed update to the insights_lessons section.
    """
    model_info = _resolve_model(body.model_id)
    if not model_info:
        raise HTTPException(
            status_code=503, detail="No LLM model configured — add one in Settings."
        )

    js_path = _get_jobsearch_path()
    current_insights = ""
    if js_path.exists():
        content = js_path.read_text(encoding="utf-8")
        parsed = database.parse_jobsearch_sections(content)
        current_insights = parsed.get("insights_lessons", "")

    log_types = ["recruiter_call", "interview_feedback", "lesson_learned", "general"]
    logs = database.get_application_logs_for_insights(log_types)
    logs_text = _format_logs_for_prompt(logs)

    system = (
        "You are synthesizing job search lessons from interview logs and application history.\n"
        "Identify patterns: what's working, what isn't, what feedback recurs.\n"
        "Write the complete updated 'Insights & Lessons Learned' section content based on "
        "the logs and current section content provided.\n"
        "Return ONLY the section content — no headers, no preamble."
    )

    current_block = (
        f"Current section content:\n---\n{current_insights.strip()}\n---\n\n"
        if current_insights.strip()
        else ""
    )
    prompt = (
        f"{current_block}"
        f"Application logs:\n---\n{logs_text}\n---\n\n"
        "Write the complete updated Insights & Lessons Learned section:"
    )

    result = await _call_llm_and_log_async(model_info, prompt, system)

    if not result.get("success"):
        raise HTTPException(
            status_code=502, detail=f"LLM call failed: {result.get('error')}"
        )

    return JSONResponse({
        "proposed_content": result["content"],
        "section_id": "insights_lessons",
    })


@router.post("/profile/coherence-check")
@limiter.limit("5/minute")
async def coherence_check(request: Request, body: OneShotRequest = OneShotRequest()) -> JSONResponse:
    """
    One-shot: check cross-section consistency in jobsearch.md.
    Scoped strictly to contradictions and misalignments between sections —
    completeness issues belong to quality-audit.
    Returns review text and a count of issues found.
    """
    model_info = _resolve_model(body.model_id)
    if not model_info:
        raise HTTPException(
            status_code=503, detail="No LLM model configured — add one in Settings."
        )

    js_path = _get_jobsearch_path()
    if not js_path.exists():
        raise HTTPException(status_code=404, detail="jobsearch.md not found.")

    content = js_path.read_text(encoding="utf-8")

    system = (
        "You are reviewing a job search profile for cross-section consistency.\n"
        "Check only for contradictions and misalignments between sections:\n"
        "- Does the Career Narrative match Career History?\n"
        "- Do Tailoring Rules support the Target Role Profile?\n"
        "- Are there gaps or contradictions between Skills & Strengths and Target Role?\n"
        "- Is the Model Behavior Rules section consistent with the stated search strategy?\n"
        "Do NOT flag incomplete sections, [FILL] markers, or stub content — those are "
        "completeness issues, not consistency issues.\n"
        "Return a numbered list of findings. Each item is one concise sentence identifying "
        "the specific inconsistency. Do not explain how to fix it in detail. "
        "Maximum one sentence per finding."
    )

    prompt = (
        f"Review this job search profile for cross-section consistency:\n\n"
        f"---\n{content}\n---\n\n"
        "List each inconsistency as a numbered item (one sentence each):"
    )

    result = await _call_llm_and_log_async(model_info, prompt, system)

    if not result.get("success"):
        raise HTTPException(
            status_code=502, detail=f"LLM call failed: {result.get('error')}"
        )

    review_text = result["content"] or ""
    issues_found = len(re.findall(r"^\s*\d+\.\s+\S", review_text, re.MULTILINE))

    return JSONResponse({"review": review_text, "issues_found": issues_found})


@router.post("/profile/quality-audit")
@limiter.limit("5/minute")
async def quality_audit(request: Request, body: OneShotRequest = OneShotRequest()) -> JSONResponse:
    """
    One-shot: per-section completeness and strength audit of jobsearch.md.
    Flags empty sections, stubs, weak Career History entries, and time gaps.
    Does NOT check cross-section consistency — that belongs to coherence-check.
    Returns review text and a count of issues found.
    """
    model_info = _resolve_model(body.model_id)
    if not model_info:
        raise HTTPException(
            status_code=503, detail="No LLM model configured — add one in Settings."
        )

    js_path = _get_jobsearch_path()
    if not js_path.exists():
        raise HTTPException(status_code=404, detail="jobsearch.md not found.")

    content = js_path.read_text(encoding="utf-8")

    system = (
        "You are auditing a job search profile for completeness and content quality.\n"
        "Check each section for these specific issues:\n"
        "- Any section that is empty or contains only [FILL] or [AUTO] placeholders\n"
        "- Any section under 50 characters of real content (a stub)\n"
        "- In Career History: any role entry with fewer than 3 achievement bullets, "
        "unless it appears to be an older (10+ years ago) or minor role; "
        "Education and Project entries are exempt from the bullet count check\n"
        "- In Career History: any apparent time gap greater than 6 months between roles "
        "where no explanation is present\n"
        "- Resume Master Copy if it appears empty, is a placeholder, or is very short\n"
        "- Tailoring Rules if all entries are still [AUTO] markers\n"
        "Do NOT check cross-section consistency — that is a separate review.\n"
        "Return a numbered list. Each item is one concise sentence naming the section and "
        "the specific issue. Do not repeat the section's instructions or explain how to "
        "fill it in. Todo-list style only."
    )

    prompt = (
        f"Audit this job search profile for completeness and content quality:\n\n"
        f"---\n{content}\n---\n\n"
        "List each issue as a numbered item (one sentence each, section name first):"
    )

    result = await _call_llm_and_log_async(model_info, prompt, system)

    if not result.get("success"):
        raise HTTPException(
            status_code=502, detail=f"LLM call failed: {result.get('error')}"
        )

    review_text = result["content"] or ""
    issues_found = len(re.findall(r"^\s*\d+\.\s+\S", review_text, re.MULTILINE))

    log.info("profile_quality_audit_complete", extra={"issues_found": issues_found})
    return JSONResponse({"review": review_text, "issues_found": issues_found})


@router.post("/profile/generate-tailoring-rules")
@limiter.limit("5/minute")
async def generate_tailoring_rules(request: Request, body: OneShotRequest = OneShotRequest()) -> JSONResponse:
    """
    One-shot: read sections 1–5 and generate tailoring rules with LLM.
    Returns proposed content for the tailoring_rules section.
    """
    model_info = _resolve_model(body.model_id)
    if not model_info:
        raise HTTPException(
            status_code=503, detail="No LLM model configured — add one in Settings."
        )

    js_path = _get_jobsearch_path()
    if not js_path.exists():
        raise HTTPException(status_code=404, detail="jobsearch.md not found.")

    content = js_path.read_text(encoding="utf-8")
    parsed = database.parse_jobsearch_sections(content)

    source_ids = ["who_i_am", "career_narrative", "career_history", "skills_strengths", "target_role"]
    sections_text = "\n\n".join(
        f"### {_SECTION_NAMES[sid]}\n{parsed.get(sid, '[empty]').strip()}"
        for sid in source_ids
    )

    system = (
        "You are generating resume and cover letter tailoring rules for a specific person.\n"
        "Based on their background and target roles, produce a set of Always/Never/Voice rules "
        "they should apply when tailoring materials.\n"
        "Format: use 'Always:', 'Never:', and 'Voice & Tone:' subsections with bullet points.\n"
        "Return ONLY the section content — no headers like 'Tailoring Rules', no preamble."
    )

    prompt = (
        f"Generate tailoring rules based on this person's profile:\n\n"
        f"---\n{sections_text}\n---\n\n"
        "Write the complete Tailoring Rules section content:"
    )

    result = await _call_llm_and_log_async(model_info, prompt, system)

    if not result.get("success"):
        raise HTTPException(
            status_code=502, detail=f"LLM call failed: {result.get('error')}"
        )

    return JSONResponse({
        "proposed_content": result["content"],
        "section_id": "tailoring_rules",
    })
