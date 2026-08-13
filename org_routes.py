"""
Org management routes for Phase 2.7 company workflows.
"""

import json
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from fastapi.responses import JSONResponse

import database
import prompt_generation

router = APIRouter(prefix="/api/v1/orgs", tags=["orgs"])


class CreateOrgRequest(BaseModel):
    name: str
    url: str
    career_page_url: str
    crawl_frequency: int = 5


class ImportResearchRequest(BaseModel):
    raw_json: str


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
async def get_org_roles(org_id: int) -> list[dict]:
    """Get all roles for an organization (active only by default)."""
    # TODO: add pagination, sorting per WORKORDER Phase 9
    roles = database.get_org_roles(org_id, include_inactive=False)
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
        "prompt": prompt_result.get("prompt", ""),
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
