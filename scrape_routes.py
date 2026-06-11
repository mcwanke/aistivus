"""
scrape_routes.py
────────────────
URL ingestion routes for AIstivus Phase 2.0 Step 3.

Registered in main.py under /api/v1 prefix.

Routes:
  POST /api/v1/scrape            — fetch + extract structured fields from a job URL
  POST /api/v1/scrape/fill-gaps  — use LLM to fill null fields from jd_text
"""

import hashlib
import json
import re
import time
from pathlib import Path
from typing import Any

import httpx
import yaml
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

import database
import llm_client
from limiter import limiter
from logger import get_logger

log = get_logger(__name__)
router = APIRouter()


# ─────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────

def _load_config() -> dict:
    config_path = Path("user_data/config.yaml")
    if config_path.exists():
        with open(config_path) as f:
            return yaml.safe_load(f) or {}
    return {}


def _get_crawl4ai_base_url() -> str | None:
    cfg = _load_config()
    return cfg.get("crawl4ai", {}).get("base_url")


# ─────────────────────────────────────────────────────────────
# Crawl4AI client
# ─────────────────────────────────────────────────────────────

async def _fetch_crawl4ai(url: str, base_url: str) -> dict[str, Any]:
    """POST to Crawl4AI and return the first result dict."""
    payload = {
        "urls": [url],
        "browser_config": {"type": "BrowserConfig", "params": {"headless": True}},
        "crawler_config": {"type": "CrawlerRunConfig", "params": {"cache_mode": "bypass"}},
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(f"{base_url}/crawl", json=payload)
        resp.raise_for_status()
        data = resp.json()
    results = data.get("results") or []
    if not results:
        raise ValueError("Crawl4AI returned no results")
    return results[0]


# ─────────────────────────────────────────────────────────────
# Structured field extraction
# ─────────────────────────────────────────────────────────────

def _extract_json_ld(html: str) -> dict[str, Any]:
    """Return the first JobPosting JSON-LD block found, or empty dict."""
    pattern = re.compile(
        r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        re.DOTALL | re.IGNORECASE,
    )
    for match in pattern.finditer(html):
        try:
            data = json.loads(match.group(1).strip())
            # handle @graph arrays
            if isinstance(data, dict) and data.get("@type") == "JobPosting":
                return data
            if isinstance(data, dict) and "@graph" in data:
                for node in data["@graph"]:
                    if isinstance(node, dict) and node.get("@type") == "JobPosting":
                        return node
        except (json.JSONDecodeError, TypeError):
            continue
    return {}


def _extract_fields(markdown: str, html: str) -> dict[str, Any]:
    """Extract structured fields from Crawl4AI output."""
    jd = _extract_json_ld(html)

    # title
    title = jd.get("title") or jd.get("name")
    if not title:
        m = re.search(r"<h1[^>]*>([^<]+)</h1>", html, re.IGNORECASE)
        if m:
            title = m.group(1).strip()
    if not title:
        m = re.search(r"<title[^>]*>([^<|<-]+)", html, re.IGNORECASE)
        if m:
            title = m.group(1).strip()

    # company
    company = None
    org = jd.get("hiringOrganization")
    if isinstance(org, dict):
        company = org.get("name")
    elif isinstance(org, str):
        company = org
    if not company:
        m = re.search(
            r'<meta[^>]+property=["\']og:site_name["\'][^>]+content=["\']([^"\']+)["\']',
            html, re.IGNORECASE,
        )
        if m:
            company = m.group(1).strip()

    # location
    location = None
    job_loc = jd.get("jobLocation")
    if isinstance(job_loc, dict):
        addr = job_loc.get("address", {})
        if isinstance(addr, dict):
            location = addr.get("addressLocality") or addr.get("addressRegion")
        elif isinstance(addr, str):
            location = addr
    elif isinstance(job_loc, str):
        location = job_loc

    # pay_band
    pay_band = None
    salary = jd.get("baseSalary")
    if isinstance(salary, dict):
        val = salary.get("value", {})
        if isinstance(val, dict):
            min_v = val.get("minValue")
            max_v = val.get("maxValue")
            currency = salary.get("currency", "")
            if min_v and max_v:
                pay_band = f"{currency}{min_v}–{currency}{max_v}".strip()
            elif min_v:
                pay_band = f"{currency}{min_v}+".strip()
        elif val:
            pay_band = str(val)
    elif isinstance(salary, str):
        pay_band = salary

    # remote_type
    remote_type = None
    work_location = jd.get("jobLocationType") or ""
    if isinstance(work_location, str):
        wl = work_location.lower()
        if "remote" in wl or "telecommute" in wl:
            remote_type = "Remote"
        elif "hybrid" in wl:
            remote_type = "Hybrid"
        elif "onsite" in wl or "on-site" in wl or "inperson" in wl:
            remote_type = "On-site"

    word_count = len(markdown.split())
    scrape_quality = "partial" if word_count < 100 else "full"

    return {
        "title": title,
        "company": company,
        "location": location,
        "pay_band": pay_band,
        "remote_type": remote_type,
        "jd_text": markdown,
        "scrape_quality": scrape_quality,
    }


# ─────────────────────────────────────────────────────────────
# Request / response models
# ─────────────────────────────────────────────────────────────

class ScrapeRequest(BaseModel):
    url: str


class ScrapeResult(BaseModel):
    scrape_quality: str
    apply_url: str
    title: str | None
    company: str | None
    location: str | None
    remote_type: str | None
    pay_band: str | None
    jd_text: str
    error: str | None


class FillGapsRequest(BaseModel):
    jd_text: str
    title: str | None = None
    company: str | None = None
    location: str | None = None
    remote_type: str | None = None
    pay_band: str | None = None


class FillGapsResult(BaseModel):
    title: str | None
    company: str | None
    location: str | None
    remote_type: str | None
    pay_band: str | None
    error: str | None


# ─────────────────────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────────────────────

@router.post("/scrape")
@limiter.limit("10/minute")
async def scrape_url(request: Request, body: ScrapeRequest) -> JSONResponse:
    """Fetch a job posting URL via Crawl4AI and extract structured fields."""
    base_url = _get_crawl4ai_base_url()
    if not base_url:
        return JSONResponse({
            "success": False,
            "error": "Crawl4AI service unavailable — base_url not configured",
            "scrape_quality": "partial",
            "apply_url": body.url,
            "title": None,
            "company": None,
            "location": None,
            "remote_type": None,
            "pay_band": None,
            "jd_text": "",
        })

    try:
        result = await _fetch_crawl4ai(body.url, base_url)
    except (httpx.ConnectError, httpx.ConnectTimeout, httpx.HTTPStatusError, ValueError) as exc:
        log.warning("Crawl4AI unavailable: %s", exc)
        return JSONResponse({
            "success": False,
            "error": "Crawl4AI service unavailable",
            "scrape_quality": "partial",
            "apply_url": body.url,
            "title": None,
            "company": None,
            "location": None,
            "remote_type": None,
            "pay_band": None,
            "jd_text": "",
        })

    markdown = result.get("markdown") or result.get("markdown_v2", {}).get("raw_markdown", "") or ""
    html = result.get("html") or ""

    fields = _extract_fields(markdown, html)

    return JSONResponse({
        "success": True,
        "error": None,
        "apply_url": body.url,
        **fields,
    })


@router.post("/scrape/fill-gaps")
@limiter.limit("10/minute")
async def fill_gaps(request: Request, body: FillGapsRequest) -> JSONResponse:
    """Use the default LLM to extract null structured fields from jd_text."""
    null_fields = [
        f for f in ("title", "company", "location", "remote_type", "pay_band")
        if getattr(body, f) is None
    ]
    if not null_fields:
        return JSONResponse({
            "title": body.title,
            "company": body.company,
            "location": body.location,
            "remote_type": body.remote_type,
            "pay_band": body.pay_band,
            "error": None,
        })

    model_row = database.get_default_llm_model()
    if not model_row:
        return JSONResponse({
            "title": body.title,
            "company": body.company,
            "location": body.location,
            "remote_type": body.remote_type,
            "pay_band": body.pay_band,
            "error": "No LLM model configured",
        })

    server_row = database.get_server_by_id(model_row["server_id"])
    fields_list = ", ".join(null_fields)
    system_prompt = (
        "You are a structured data extractor. "
        "Return only valid JSON with no markdown formatting."
    )
    user_prompt = (
        f"Extract the following fields from this job posting: {fields_list}.\n\n"
        "Return a JSON object with exactly these keys. Use null for any field you cannot find.\n"
        'remote_type must be one of: "Remote", "Hybrid", "On-site", or null.\n\n'
        f"Job posting:\n{body.jd_text[:6000]}"
    )

    prompt_hash = hashlib.sha256(system_prompt.encode()).hexdigest()
    start_ms = int(time.time() * 1000)

    llm_resp = await llm_client.complete(
        prompt=user_prompt,
        system=system_prompt,
        model=model_row["model"],
        provider=server_row["server_type"],
        base_url=server_row["endpoint"] or "",
        max_tokens=300,
    )

    latency_ms = int(time.time() * 1000) - start_ms

    database.insert_llm_call_log(
        llm_model_id=model_row["id"],
        call_type="extraction",
        prompt=user_prompt,
        prompt_hash=prompt_hash,
        raw_response=llm_resp.get("content", ""),
        prompt_tokens_actual=llm_resp.get("prompt_tokens_actual"),
        completion_tokens_actual=llm_resp.get("completion_tokens_actual"),
        total_tokens_actual=llm_resp.get("total_tokens_actual"),
        latency_ms=latency_ms,
        success=1 if llm_resp.get("success") else 0,
        error_message=llm_resp.get("error"),
    )

    if not llm_resp.get("success"):
        return JSONResponse({
            "title": body.title,
            "company": body.company,
            "location": body.location,
            "remote_type": body.remote_type,
            "pay_band": body.pay_band,
            "error": f"LLM call failed: {llm_resp.get('error', 'unknown error')}",
        })

    raw = llm_resp.get("content", "")
    try:
        # strip markdown fences if present
        clean = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip(), flags=re.DOTALL)
        extracted = json.loads(clean)
    except (json.JSONDecodeError, TypeError):
        return JSONResponse({
            "title": body.title,
            "company": body.company,
            "location": body.location,
            "remote_type": body.remote_type,
            "pay_band": body.pay_band,
            "error": "LLM response could not be parsed",
        })

    valid_remote = {"Remote", "Hybrid", "On-site", None}
    remote_val = extracted.get("remote_type")
    if remote_val not in valid_remote:
        remote_val = None

    return JSONResponse({
        "title": extracted.get("title") or body.title,
        "company": extracted.get("company") or body.company,
        "location": extracted.get("location") or body.location,
        "remote_type": remote_val if remote_val is not None else body.remote_type,
        "pay_band": extracted.get("pay_band") or body.pay_band,
        "error": None,
    })
