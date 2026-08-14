"""
Org management routes for Phase 2.7 company workflows.
"""

import json
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from fastapi.responses import JSONResponse
import yaml
import httpx

import database
import prompt_generation

router = APIRouter(prefix="/api/v1/orgs", tags=["orgs"])


# ─── Config & Health Check ─────────────────────────────────────────────────

def _load_config() -> dict:
    """Load config from user_data/config.yaml."""
    config_path = Path("user_data/config.yaml")
    if config_path.exists():
        with open(config_path) as f:
            return yaml.safe_load(f) or {}
    return {}


def _get_service_urls() -> tuple[str, str]:
    """Get Ollama and Crawl4AI URLs from config."""
    config = _load_config()
    ollama_url = config.get("ollama", {}).get("base_url", "http://localhost:11434")
    crawl4ai_url = config.get("crawl4ai", {}).get("base_url", "http://localhost:11235")
    return ollama_url, crawl4ai_url


async def _check_service_health() -> dict[str, bool]:
    """Check if Ollama and Crawl4AI services are running.

    Returns:
        {"ollama_ok": bool, "crawl4ai_ok": bool}
    """
    ollama_url, crawl4ai_url = _get_service_urls()

    ollama_ok = False
    crawl4ai_ok = False

    # Check Ollama health
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            res = await client.get(f"{ollama_url}/api/tags")
            ollama_ok = res.status_code == 200
    except Exception:  # noqa: BLE001
        pass

    # Check Crawl4AI health
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            res = await client.get(f"{crawl4ai_url}/health", follow_redirects=True)
            crawl4ai_ok = res.status_code == 200
    except Exception:  # noqa: BLE001
        pass

    return {"ollama_ok": ollama_ok, "crawl4ai_ok": crawl4ai_ok}


# ─── Request Models ───────────────────────────────────────────────────────

class CreateOrgRequest(BaseModel):
    name: str
    url: str
    career_page_url: str
    crawl_frequency: int = 5


class ImportResearchRequest(BaseModel):
    raw_json: str


class UpdateOrgRoleRequest(BaseModel):
    title: str | None = None
    description: str | None = None
    salary_range: str | None = None
    remote_type: str | None = None
    role_url: str | None = None


@router.get("")
async def list_orgs() -> list[dict]:
    """List all organizations."""
    # TODO: add search/sort/filter params per WORKORDER Phase 3
    with database.get_connection() as conn:
        rows = conn.execute(
            """SELECT id, name, url, career_page_url, crawl_frequency,
                      crawl_offset_minutes, last_crawl_at, next_crawl_at,
                      created_at, modified_at
               FROM orgs
               ORDER BY name"""
        ).fetchall()
        return [dict(row) for row in rows]


@router.get("/{org_id}")
async def get_org(org_id: int) -> dict:
    """Get a single organization."""
    org = database.get_org(org_id)
    if not org:
        return {"error": "Org not found"}
    return dict(org)


@router.get("/{org_id}/roles")
async def get_org_roles(org_id: int, include_inactive: bool = True) -> list[dict]:
    """Get all roles for an organization. Include both active and inactive by default."""
    # TODO: add pagination, sorting per WORKORDER Phase 9
    roles = database.get_org_roles(org_id, include_inactive=include_inactive)
    return [dict(row) for row in roles]


@router.get("/{org_id}/roles/{role_id}")
async def get_org_role(org_id: int, role_id: int) -> dict:
    """Get a single role."""
    role = database.get_org_role(org_id, role_id)
    if not role:
        return {"error": "Role not found"}
    return dict(role)


@router.post("")
async def create_org(req: CreateOrgRequest) -> dict:
    """Create a new organization."""
    import random
    from datetime import datetime, timezone

    offset = random.randint(0, 120)
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

    with database.get_connection() as conn:
        conn.execute(
            """INSERT INTO orgs
               (name, url, career_page_url, crawl_frequency, crawl_offset_minutes,
                created_at, modified_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (req.name, req.url, req.career_page_url, req.crawl_frequency, offset, now, now)
        )
        org_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

    org = database.get_org(org_id)
    return dict(org) if org else {"error": "Failed to create org"}


@router.post("/{org_id}/crawl")
async def trigger_crawl(org_id: int) -> dict:
    """Trigger a manual crawl for an organization.

    Returns immediately with crawl_id and status='pending'.
    Backend processes the crawl asynchronously.

    Checks service health (Ollama, Crawl4AI) before queuing.
    Returns 503 if either service is down.
    """
    import asyncio
    from datetime import datetime, timezone
    from poc_routes import validate_new_roles_algorithm

    org = database.get_org(org_id)
    if not org:
        raise HTTPException(status_code=404, detail=f"Org {org_id} not found.")

    # Check service health before queuing crawl
    health = await _check_service_health()
    if not health["ollama_ok"]:
        raise HTTPException(
            status_code=503,
            detail="Ollama service is not available. Ensure Ollama is running (run 'ollama serve')"
        )
    if not health["crawl4ai_ok"]:
        raise HTTPException(
            status_code=503,
            detail="Crawl4AI service is not available. Ensure Crawl4AI is running"
        )

    # Create org_crawl record with status='pending'
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    crawl_id = database.insert_org_crawl(
        org_id=org_id,
        status="pending",
        started_at=now
    )

    # Fire off async task to run the crawl algorithm
    # This doesn't block the response
    asyncio.create_task(_run_crawl_async(org_id, crawl_id))

    return {
        "success": True,
        "crawl_id": crawl_id,
        "status": "pending",
        "message": f"Crawl queued for org {org['name']}"
    }


async def _run_crawl_async(org_id: int, crawl_id: int) -> None:
    """Run the crawl algorithm asynchronously in the background."""
    from poc_routes import validate_new_roles_algorithm
    from datetime import datetime, timezone

    try:
        # Run the algorithm (pass crawl_id so it doesn't create a duplicate)
        result = await validate_new_roles_algorithm(org_id, crawl_id=crawl_id)

        # Update crawl status based on result
        if result.get("success"):
            database.update_org_crawl_status(crawl_id, "success")
        else:
            error_msg = result.get("error", "Unknown error")
            database.update_org_crawl_completion(
                crawl_id=crawl_id,
                status="error",
                error_msg=error_msg
            )
    except Exception as e:
        # Mark crawl as failed
        try:
            database.update_org_crawl_completion(
                crawl_id=crawl_id,
                status="error",
                error_msg=str(e)
            )
        except Exception:  # noqa: BLE001
            pass  # If even error logging fails, give up


@router.get("/{org_id}/research")
async def get_org_research(org_id: int) -> dict:
    """Return most recent research record for an org, or null."""
    org = database.get_org(org_id)
    if not org:
        raise HTTPException(status_code=404, detail=f"Org {org_id} not found.")
    record = database.get_job_research_latest(org_id=org_id)
    return JSONResponse({"research": record})


@router.post("/{org_id}/research")
async def import_org_research(org_id: int, body: ImportResearchRequest) -> dict:
    """Parse and store a research JSON blob for an org."""
    org = database.get_org(org_id)
    if not org:
        raise HTTPException(status_code=404, detail=f"Org {org_id} not found.")

    try:
        parsed = json.loads(body.raw_json)
    except (json.JSONDecodeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=f"Invalid JSON: {exc}") from exc

    research_summary = parsed.get("research_summary")
    research_confidence = parsed.get("research_confidence")
    if not research_summary or not research_confidence:
        raise HTTPException(
            status_code=400,
            detail="Missing required fields: research_summary and research_confidence",
        )

    def _as_json(val) -> str | None:
        if val is None:
            return None
        return json.dumps(val) if isinstance(val, (dict, list)) else str(val)

    record_id = database.insert_job_research(
        raw_json=body.raw_json,
        research_summary=research_summary,
        company_overview=parsed.get("company_overview"),
        company_stage=parsed.get("company_stage"),
        company_size_actual=parsed.get("company_size_actual"),
        company_trajectory=parsed.get("company_trajectory"),
        company_culture_overview=parsed.get("company_culture_overview"),
        culture_signals=_as_json(parsed.get("culture_signals")),
        comp_signals=_as_json(parsed.get("comp_signals")),
        role_context=_as_json(parsed.get("role_context")),
        interview_process=parsed.get("interview_process"),
        red_flags=_as_json(parsed.get("red_flags")),
        green_flags=_as_json(parsed.get("green_flags")),
        research_confidence=research_confidence,
        research_notes=parsed.get("research_notes"),
        org_id=org_id,
    )
    record = database.get_job_research_latest(org_id=org_id)
    return JSONResponse({"success": True, "id": record_id, "research": record})


@router.post("/{org_id}/generate-research-prompt")
async def generate_org_research_prompt(org_id: int) -> dict:
    """Build a company research prompt for external use."""
    org = database.get_org(org_id)
    if not org:
        raise HTTPException(status_code=404, detail=f"Org {org_id} not found.")
    org_dict = dict(org)

    org_name = org_dict.get("name") or "N/A"
    org_url = org_dict.get("url") or "N/A"
    career_page_url = org_dict.get("career_page_url") or "N/A"

    try:
        prompt_result = prompt_generation.get_prompt(
            "gen_research",
            {
                "company_name": org_name,
                "title": "",
                "website_url": org_url,
                "jd_text": "",
            },
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to generate prompt: {exc}") from exc

    return JSONResponse({
        "prompt": prompt_result.get("prompt_text", ""),
        "prompt_usage_id": prompt_result.get("prompt_usage_id"),
    })


@router.get("/{org_id}/crawls")
async def get_org_crawls(org_id: int) -> list[dict]:
    """Get all crawls for an organization."""
    org = database.get_org(org_id)
    if not org:
        raise HTTPException(status_code=404, detail=f"Org {org_id} not found.")

    crawls = database.get_org_crawls(org_id)
    return [dict(row) for row in crawls]


@router.get("/{org_id}/crawls/{crawl_id}/logs")
async def get_crawl_logs(org_id: int, crawl_id: int) -> list[dict]:
    """Get all logs for a specific crawl."""
    org = database.get_org(org_id)
    if not org:
        raise HTTPException(status_code=404, detail=f"Org {org_id} not found.")

    with database.get_connection() as conn:
        crawl = conn.execute(
            "SELECT id FROM org_crawls WHERE id = ? AND org_id = ?",
            (crawl_id, org_id)
        ).fetchone()
        if not crawl:
            raise HTTPException(status_code=404, detail=f"Crawl {crawl_id} not found for org {org_id}.")

    logs = database.get_org_crawl_logs(crawl_id)
    return [dict(row) for row in logs]


@router.post("/{org_id}/crawls/export")
async def export_org_crawls(org_id: int) -> dict:
    """Export all crawls for an org as JSON."""
    org = database.get_org(org_id)
    if not org:
        raise HTTPException(status_code=404, detail=f"Org {org_id} not found.")

    crawls = database.get_org_crawls(org_id)
    crawl_dicts = [dict(row) for row in crawls]

    export_dir = Path("user_data/exports")
    export_dir.mkdir(parents=True, exist_ok=True)

    filename = database.generate_export_filename(org["name"], "crawls")
    filepath = export_dir / filename

    with open(filepath, "w") as f:
        json.dump(crawl_dicts, f, indent=2)

    return JSONResponse({"success": True, "filename": filename})


@router.post("/{org_id}/crawls/{crawl_id}/logs/export")
async def export_crawl_logs(org_id: int, crawl_id: int) -> dict:
    """Export logs for a specific crawl as JSON."""
    org = database.get_org(org_id)
    if not org:
        raise HTTPException(status_code=404, detail=f"Org {org_id} not found.")

    with database.get_connection() as conn:
        crawl = conn.execute(
            "SELECT id FROM org_crawls WHERE id = ? AND org_id = ?",
            (crawl_id, org_id)
        ).fetchone()
        if not crawl:
            raise HTTPException(status_code=404, detail=f"Crawl {crawl_id} not found for org {org_id}.")

    logs = database.get_org_crawl_logs(crawl_id)
    log_dicts = [dict(row) for row in logs]

    export_dir = Path("user_data/exports")
    export_dir.mkdir(parents=True, exist_ok=True)

    filename = database.generate_export_filename(org["name"], "crawllogs")
    filepath = export_dir / filename

    with open(filepath, "w") as f:
        json.dump(log_dicts, f, indent=2)

    return JSONResponse({"success": True, "filename": filename})


@router.patch("/{org_id}/roles/{role_id}/mark-interesting")
async def mark_role_interesting(org_id: int, role_id: int) -> dict:
    """Mark a role as interesting (is_interesting = 1)."""
    org = database.get_org(org_id)
    if not org:
        raise HTTPException(status_code=404, detail=f"Org {org_id} not found.")

    role = database.get_org_role(org_id, role_id)
    if not role:
        raise HTTPException(status_code=404, detail=f"Role {role_id} not found for org {org_id}.")

    with database.get_connection() as conn:
        conn.execute(
            "UPDATE org_roles SET is_interesting = 1 WHERE id = ?",
            (role_id,)
        )

    updated_role = database.get_org_role(org_id, role_id)
    return JSONResponse({"success": True, "role": dict(updated_role) if updated_role else None})


@router.patch("/{org_id}/roles/{role_id}/mark-not-interesting")
async def mark_role_not_interesting(org_id: int, role_id: int) -> dict:
    """Mark a role as not interesting (is_interesting = 0)."""
    org = database.get_org(org_id)
    if not org:
        raise HTTPException(status_code=404, detail=f"Org {org_id} not found.")

    role = database.get_org_role(org_id, role_id)
    if not role:
        raise HTTPException(status_code=404, detail=f"Role {role_id} not found for org {org_id}.")

    with database.get_connection() as conn:
        conn.execute(
            "UPDATE org_roles SET is_interesting = 0 WHERE id = ?",
            (role_id,)
        )

    updated_role = database.get_org_role(org_id, role_id)
    return JSONResponse({"success": True, "role": dict(updated_role) if updated_role else None})


@router.patch("/{org_id}/roles/{role_id}/toggle-active")
async def toggle_role_active(org_id: int, role_id: int) -> dict:
    """Toggle a role's active status (is_active = 1 - is_active)."""
    org = database.get_org(org_id)
    if not org:
        raise HTTPException(status_code=404, detail=f"Org {org_id} not found.")

    role = database.get_org_role(org_id, role_id)
    if not role:
        raise HTTPException(status_code=404, detail=f"Role {role_id} not found for org {org_id}.")

    role_dict = dict(role)
    current_active = role_dict.get("is_active", 1)
    new_active = 1 - current_active

    with database.get_connection() as conn:
        conn.execute(
            "UPDATE org_roles SET is_active = ? WHERE id = ?",
            (new_active, role_id)
        )

    updated_role = database.get_org_role(org_id, role_id)
    return JSONResponse({"success": True, "role": dict(updated_role) if updated_role else None})


@router.patch("/{org_id}/roles/{role_id}/mark-active")
async def mark_role_active(org_id: int, role_id: int) -> dict:
    """Mark a role as active (is_active = 1)."""
    org = database.get_org(org_id)
    if not org:
        raise HTTPException(status_code=404, detail=f"Org {org_id} not found.")

    role = database.get_org_role(org_id, role_id)
    if not role:
        raise HTTPException(status_code=404, detail=f"Role {role_id} not found for org {org_id}.")

    with database.get_connection() as conn:
        conn.execute(
            "UPDATE org_roles SET is_active = 1 WHERE id = ?",
            (role_id,)
        )

    updated_role = database.get_org_role(org_id, role_id)
    return JSONResponse({"success": True, "role": dict(updated_role) if updated_role else None})


@router.patch("/{org_id}/roles/{role_id}/mark-closed")
async def mark_role_closed(org_id: int, role_id: int) -> dict:
    """Mark a role as closed (is_active = 0)."""
    org = database.get_org(org_id)
    if not org:
        raise HTTPException(status_code=404, detail=f"Org {org_id} not found.")

    role = database.get_org_role(org_id, role_id)
    if not role:
        raise HTTPException(status_code=404, detail=f"Role {role_id} not found for org {org_id}.")

    with database.get_connection() as conn:
        conn.execute(
            "UPDATE org_roles SET is_active = 0 WHERE id = ?",
            (role_id,)
        )

    updated_role = database.get_org_role(org_id, role_id)
    return JSONResponse({"success": True, "role": dict(updated_role) if updated_role else None})


@router.patch("/{org_id}/roles/{role_id}")
async def update_org_role(org_id: int, role_id: int, payload: UpdateOrgRoleRequest) -> dict:
    """Update a role's metadata (title, description, salary_range, remote_type, role_url)."""
    org = database.get_org(org_id)
    if not org:
        raise HTTPException(status_code=404, detail=f"Org {org_id} not found.")

    role = database.get_org_role(org_id, role_id)
    if not role:
        raise HTTPException(status_code=404, detail=f"Role {role_id} not found for org {org_id}.")

    with database.get_connection() as conn:
        updates = []
        params = []
        if payload.title is not None:
            updates.append("title = ?")
            params.append(payload.title)
        if payload.description is not None:
            updates.append("description = ?")
            params.append(payload.description)
        if payload.salary_range is not None:
            updates.append("salary_range = ?")
            params.append(payload.salary_range)
        if payload.remote_type is not None:
            updates.append("remote_type = ?")
            params.append(payload.remote_type)
        if payload.role_url is not None:
            updates.append("role_url = ?")
            params.append(payload.role_url)

        if updates:
            updates.append("modified_at = datetime('now')")
            params.append(role_id)
            query = f"UPDATE org_roles SET {', '.join(updates)} WHERE id = ?"
            conn.execute(query, params)

    updated_role = database.get_org_role(org_id, role_id)
    return JSONResponse({"success": True, "role": dict(updated_role) if updated_role else None})


@router.post("/{org_id}/roles/export")
async def export_org_roles(org_id: int) -> dict:
    """Export all roles for an org as JSON."""
    org = database.get_org(org_id)
    if not org:
        raise HTTPException(status_code=404, detail=f"Org {org_id} not found.")

    roles = database.get_org_roles(org_id, include_inactive=True)
    role_dicts = [dict(row) for row in roles]

    export_dir = Path("user_data/exports")
    export_dir.mkdir(parents=True, exist_ok=True)

    filename = database.generate_export_filename(org["name"], "allroles")
    filepath = export_dir / filename

    with open(filepath, "w") as f:
        json.dump(role_dicts, f, indent=2)

    return JSONResponse({"success": True, "filename": filename})


