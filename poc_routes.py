import asyncio
import json
import math
import re
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx
import yaml
from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict

import database

router = APIRouter(prefix="/api/v1/poc", tags=["poc"])


def _load_config() -> dict:
    """Load config from user_data/config.yaml."""
    config_path = Path("user_data/config.yaml")
    if config_path.exists():
        with open(config_path) as f:
            return yaml.safe_load(f) or {}
    return {}


def _get_crawl4ai_url() -> str:
    """Get Crawl4AI base URL from config, with fallback."""
    config = _load_config()
    return config.get("crawl4ai", {}).get("base_url", "http://localhost:11235")


CRAWL4AI_BASE_URL = _get_crawl4ai_url()
POC_STATE_PATH = Path("app_data/poc_state.json")
POC_COMPANIES_PATH = Path("app_docs/POC_companies.json")
POC_CAREER_OUTPUT_PATH = Path("app_docs/POC_career_output.json")
POC_JOBS_OUTPUT_PATH = Path("app_docs/POC_jobs_output.json")


def _extract_target_titles_from_jobsearch() -> tuple[list[str], list[str]]:
    """Extract target and open-to titles from Section 5 of jobsearch.md.

    Parses the "Titles I'm targeting:" and "Titles I'm open to:" sections
    and returns comma-separated title lists.

    Returns:
        (target_titles, open_to_titles): Two lists of title strings, lowercase
    """
    try:
        config = _load_config()
        jobsearch_path = config.get("evaluation", {}).get("jobsearch_md_path") or "user_data/my_data/jobsearch.md"

        if not Path(jobsearch_path).exists():
            print(f"[_extract_target_titles_from_jobsearch] File not found: {jobsearch_path}")
            return [], []

        with open(jobsearch_path) as f:
            content = f.read()

        # Extract section 5 only
        section_5_start = content.find("## 5. Target Role Profile")
        section_6_start = content.find("## 6.")
        if section_5_start == -1:
            return [], []

        section_5 = content[section_5_start:section_6_start] if section_6_start != -1 else content[section_5_start:]

        # Extract "Titles I'm targeting:" section
        target_start = section_5.find("**Titles I'm targeting:**")
        open_to_start = section_5.find("**Titles I'm open to:**")
        target_titles = []
        open_to_titles = []

        if target_start != -1:
            # Extract text between "Titles I'm targeting:" and next field
            search_start = target_start + len("**Titles I'm targeting:**")
            next_field = section_5.find("**", search_start)
            if next_field == -1:
                next_field = len(section_5)
            target_text = section_5[search_start:next_field].strip()
            # Remove markdown link syntax [text] if present, keep the text
            target_text = re.sub(r'\[([^\]]+)\]', r'\1', target_text)
            # Split on commas and clean up
            target_titles = [t.strip().lower() for t in target_text.split(",") if t.strip() and not t.strip().startswith("[")]

        if open_to_start != -1:
            # Extract text between "Titles I'm open to:" and next field
            search_start = open_to_start + len("**Titles I'm open to:**")
            next_field = section_5.find("**", search_start)
            if next_field == -1:
                next_field = len(section_5)
            open_to_text = section_5[search_start:next_field].strip()
            # Remove markdown link syntax if present
            open_to_text = re.sub(r'\[([^\]]+)\]', r'\1', open_to_text)
            # Split on commas and clean up (remove parenthetical conditions)
            open_to_titles = [t.strip().lower() for t in open_to_text.split(",") if t.strip() and not t.strip().startswith("[")]
            # Remove conditions in parentheses but keep the title
            open_to_titles = [re.sub(r'\s*\([^)]*\)', '', t).strip() for t in open_to_titles]
            open_to_titles = [t for t in open_to_titles if t]

        return target_titles, open_to_titles

    except Exception:  # noqa: BLE001
        return [], []


def _is_role_interesting(role_title: str, role_description: str | None = None) -> bool:
    """Check if a role matches target or open-to titles from jobsearch.md Section 5.

    Matching logic (word-based fuzzy):
    1. Extract target and open-to titles from Section 5
    2. For each title, extract all words (lowercase, ignore common stop words like "of", "and")
    3. Check if ALL words from any target/open-to title appear in the role title
    4. Role is "interesting" if it matches any target or open-to title

    Example:
    - Target title: "Director of Engineering"
    - Words to match: ["director", "engineering"]
    - Role: "Director, Engineering Manager" → contains both → INTERESTING ✓
    - Role: "Senior Director, Product" → missing "engineering" → NOT interesting

    Args:
        role_title: The role title (required)
        role_description: The role description/markdown (optional, currently unused)

    Returns:
        True if role title matches any target/open-to title, False otherwise
    """
    target_titles, open_to_titles = _extract_target_titles_from_jobsearch()
    all_titles = target_titles + open_to_titles

    if not all_titles:
        return False

    role_title_lower = role_title.lower()

    # Stop words to ignore when extracting title words
    stop_words = {'of', 'and', 'or', 'the', 'a', 'an', 'in', 'at', 'for', 'if'}

    # Check each target/open-to title
    for target_title in all_titles:
        # Extract words from target title
        title_words = [w for w in target_title.split() if w.lower() not in stop_words]

        # Check if ALL words from target title appear in role title
        if all(word in role_title_lower for word in title_words):
            return True

    return False


class QueryCompanyRequest(BaseModel):
    company_name: str
    company_url: str
    careers_page_url: str
    strategy: str = "domain"  # "domain", "heuristic", or "llm"


class CrawlMetadata(BaseModel):
    markdown_length: int = 0
    js_rendering_used: bool = False
    anti_bot_detected: bool = False
    retry_count: int = 0


class CrawlResponse(BaseModel):
    model_config = ConfigDict(exclude_none=False)

    success: bool
    markdown: str
    error: str | None
    crawl_latency_ms: float
    metadata: CrawlMetadata = CrawlMetadata()


class ExtractionDebug(BaseModel):
    model_config = ConfigDict(exclude_none=False)

    domain_count: int | None = None
    heuristic_count: int | None = None
    llm_count: int | None = None
    llm_raw_response: str | None = None
    llm_prompt: str | None = None
    markdown_length: int | None = None


class QueryCompanyResponse(BaseModel):
    model_config = ConfigDict(exclude_none=False)

    success: bool
    jobs: list[dict]
    error: str | None
    extraction_method: str | None
    strategy: str
    crawl_latency_ms: float = 0  # Time to crawl page
    process_latency_ms: float = 0  # Time to extract/process
    llm_model: str | None = None  # Model used (if LLM-based)
    data_source: str = "fresh_crawl"  # "fresh_crawl" or "cached"
    crawl_metadata: CrawlMetadata = CrawlMetadata()  # Not shown in UI, for analysis
    extraction_debug: ExtractionDebug = ExtractionDebug()  # Not shown in UI, for analysis
    markdown: str | None = None  # Raw markdown for debugging (only on request)


class ExtractJobRequest(BaseModel):
    job_url: str
    strategy: str = "structured"  # "structured", "llm", or "hybrid"


class QueryCompanyWithMarkdownRequest(BaseModel):
    company_name: str
    markdown: str  # Pre-crawled markdown
    strategy: str = "domain"


class ExtractJobResponse(BaseModel):
    success: bool
    job: dict
    error: str | None
    extraction_method: str | None
    confidence: str
    strategy: str
    latency_ms: float


class CompanyEntry(BaseModel):
    company_name: str
    company_url: str
    careers_page_url: str


class POCStateRequest(BaseModel):
    companies: list[CompanyEntry] = []
    job_url: str = ""
    research_prompt: str = ""


async def crawl_page(url: str) -> str:
    """Crawl a URL and return markdown content."""
    payload = {
        "urls": [url],
        "browser_config": {
            "type": "BrowserConfig",
            "params": {"headless": True}
        },
        "crawler_config": {
            "type": "CrawlerRunConfig",
            "params": {
                "cache_mode": "bypass",
                "delay_before_return_html": 3.0,
                "page_timeout": 30000
            }
        }
    }
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(f"{CRAWL4AI_BASE_URL}/crawl", json=payload)
        response.raise_for_status()
        data = response.json()
        print(f"DEBUG crawl response keys: {list(data.keys())}")

        results = data.get("results", [])
        if not results or not results[0].get("success"):
            error = results[0].get("error_message") if results else "no results"
            raise RuntimeError(f"Crawl failed: {error}")

        result = results[0]
        markdown = result.get("markdown", {})
        if isinstance(markdown, dict):
            return markdown.get("raw_markdown", "")
        return markdown or ""


def parse_job_listings_domain_filter(markdown: str) -> list[dict]:
    """Strategy 1: Extract job listings from known job board domains."""
    jobs = []
    job_domains = ["ashbyhq.com", "lever.co", "greenhouse.io", "boards.greenhouse.io"]

    pattern = r"\[([^\]]+)\]\((https?://[^)]+)\)"
    matches = re.findall(pattern, markdown)

    for title, url in matches:
        if any(domain in url for domain in job_domains):
            title = re.sub(r"\s+Learn More\s*$", "", title).strip()
            if title:
                jobs.append({"title": title, "url": url})

    return jobs


def extract_all_links(markdown: str) -> list[dict]:
    """Extract all {title, url} link pairs from markdown, deduped by URL. Seeds crawl_list."""
    pattern = r"\[([^\]]+)\]\((https?://[^)]+)\)"
    matches = re.findall(pattern, markdown)
    seen_urls = set()
    links = []
    for title, url in matches:
        if url in seen_urls:
            continue
        seen_urls.add(url)
        title = re.sub(r"\s+Learn More\s*$", "", title).strip()
        links.append({"title": title, "url": url})
    return links


def _is_domain_match(url: str) -> bool:
    """Check if a URL matches a known job board domain."""
    job_domains = ["ashbyhq.com", "lever.co", "greenhouse.io", "boards.greenhouse.io"]
    return any(domain in url.lower() for domain in job_domains)


def _is_heuristic_match(title: str, url: str) -> bool:
    """Check if a link's title or URL matches job keywords/paths."""
    job_keywords = ["apply", "job", "career", "position", "engineer", "manager", "lead", "developer"]
    job_paths = ["/jobs/", "/careers/", "/apply/", "/positions/", "/openings/"]
    title_lower = title.lower()
    url_lower = url.lower()
    has_keyword = any(kw in title_lower for kw in job_keywords)
    has_path = any(path in url_lower for path in job_paths)
    return has_keyword or has_path


def parse_job_listings_heuristic(markdown: str) -> list[dict]:
    """Strategy 2: Extract job listings using keyword heuristics."""
    jobs = []
    job_keywords = ["apply", "job", "career", "position", "engineer", "manager", "lead", "developer"]
    job_paths = ["/jobs/", "/careers/", "/apply/", "/positions/", "/openings/"]

    pattern = r"\[([^\]]+)\]\((https?://[^)]+)\)"
    matches = re.findall(pattern, markdown)

    for title, url in matches:
        title_lower = title.lower()
        url_lower = url.lower()

        # Check if title or URL contains job keywords/paths
        has_keyword = any(kw in title_lower for kw in job_keywords)
        has_path = any(path in url_lower for path in job_paths)

        if has_keyword or has_path:
            title = re.sub(r"\s+Learn More\s*$", "", title).strip()
            if title and len(title) > 2:  # Filter out very short titles
                jobs.append({"title": title, "url": url})

    return jobs


async def extract_job_listings_three_step(markdown: str) -> tuple[list[dict], dict]:
    """
    Three-step extraction: Domain → Heuristic → Merge → LLM validation.
    Returns: (validated_jobs, debug_info)
    """
    try:
        # Step 1: Domain extraction (high precision)
        domain_jobs = parse_job_listings_domain_filter(markdown)
        print(f"[3-Step] Step 1 - Domain extraction: {len(domain_jobs)} jobs")

        # Step 2: Heuristic extraction, dedup against domain
        heuristic_jobs = parse_job_listings_heuristic(markdown)
        domain_urls = {job["url"] for job in domain_jobs}
        heuristic_new = [
            job for job in heuristic_jobs if job["url"] not in domain_urls
        ]
        print(f"[3-Step] Step 2 - Heuristic extraction: {len(heuristic_jobs)} total, {len(heuristic_new)} new")

        # Step 3: Merge domain + heuristic (skip consolidated LLM validation - too expensive)
        merged = domain_jobs + heuristic_new
        print(f"[3-Step] Step 3 - Merged list: {len(merged)} jobs from 2 sources")

        return merged, {
            "domain_count": len(domain_jobs),
            "heuristic_count": len(heuristic_new),
            "merged_count": len(merged),
            "validated_count": len(merged)
        }

    except Exception as e:  # noqa: BLE001
        print(f"[3-Step] Extraction failed: {e}")
        import traceback
        traceback.print_exc()
        return [], {}


async def validate_consolidated_jobs(markdown: str, candidates: list[dict]) -> list[dict]:
    """Validate consolidated job list from all three extraction methods."""
    try:
        candidates_json = json.dumps(candidates, indent=2)

        prompt = f"""You are an expert at parsing job career pages. You have a consolidated list of job candidates extracted from three methods (domain filtering, keyword heuristics, and LLM extraction).

Review each candidate and determine:
1. Is it actually a job posting? (yes/no)
2. If yes, provide the clean job title (improve formatting if needed)
3. Keep the original URL

Candidates to validate:
{candidates_json}

Review the full career page content below to make your determinations.

Return ONLY valid JSON array with validated jobs. Remove non-jobs entirely.

[{{"title": "Clean Job Title", "url": "https://..."}}, ...]

Or empty array if none are valid jobs: []

Career page:
{markdown}"""

        print("[Cascade-Validate] Validating consolidated list with LLM...")

        async with httpx.AsyncClient(timeout=300) as client:
            payload = {
                "model": "qwen2.5:3b",
                "messages": [
                    {
                        "role": "system",
                        "content": "You are a JSON-only parser. Review job candidates and return ONLY valid JSON array. No text before or after.",
                    },
                    {"role": "user", "content": prompt},
                ],
                "stream": False,
            }
            response = await client.post("http://localhost:11434/api/chat", json=payload)
            print(f"[Cascade-Validate] Response status: {response.status_code}")

            if response.status_code != 200:
                print(f"[Cascade-Validate] Ollama error: {response.text}")
                return candidates  # Fallback to consolidated list

            result = response.json()
            content = result.get("message", {}).get("content", "").strip()
            print(f"[Cascade-Validate] Raw response ({len(content)} chars): {content[:200]}")

            if not content:
                print("[Cascade-Validate] Empty response, returning consolidated list")
                return candidates

            # Handle markdown code blocks
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()

            # Try to extract JSON if there's extra text
            if not content.startswith("["):
                start_idx = content.find("[")
                end_idx = content.rfind("]")
                if start_idx >= 0 and end_idx > start_idx:
                    content = content[start_idx : end_idx + 1]
                    print("[Cascade-Validate] Extracted JSON from response")

            jobs = json.loads(content)

            if isinstance(jobs, list):
                validated = []
                for job in jobs:
                    if isinstance(job, dict) and "title" in job and "url" in job:
                        title = str(job["title"]).strip()
                        url = str(job["url"]).strip()
                        if title and url:
                            validated.append({"title": title, "url": url})
                print(f"[Cascade-Validate] Validated {len(validated)} jobs")
                return validated

            print(f"[Cascade-Validate] Response was not a list: {type(jobs)}")
            return candidates

    except json.JSONDecodeError as e:
        print(f"[Cascade-Validate] JSON parse error: {e}")
        print("[Cascade-Validate] Returning consolidated list as fallback")
        return candidates
    except Exception as e:  # noqa: BLE001
        print(f"[Cascade-Validate] Validation failed: {e}")
        import traceback
        traceback.print_exc()
        return candidates


async def parse_job_listings_validate(
    markdown: str, domain_jobs: list[dict], heuristic_jobs: list[dict]
) -> list[dict]:
    """Validate and reconcile job listings using LLM with full page context."""
    try:
        domain_list = json.dumps(domain_jobs, indent=2)
        heuristic_list = json.dumps(heuristic_jobs, indent=2)

        prompt = f"""You are an expert at parsing job career pages. You have two extraction attempts.

Domain extraction: {len(domain_jobs)} jobs
Heuristic extraction: {len(heuristic_jobs)} jobs

Domain jobs:
{domain_list}

Heuristic jobs:
{heuristic_list}

Review the career page content below. Determine which jobs are real and provide the authoritative list.

Return ONLY valid JSON. No other text. No markdown blocks. Just the JSON array.

[{{"title": "job title", "url": "https://..."}}, {{"title": "another job", "url": "https://..."}}]

Or empty array if no jobs: []

Career page:
{markdown}"""

        print("[LLM-Validate] Reconciling extraction results with LLM...")
        print("[LLM-Validate] Waiting 5s before calling Ollama...")
        await asyncio.sleep(5)

        async with httpx.AsyncClient(timeout=300) as client:
            payload = {
                "model": "qwen2.5:3b",
                "messages": [
                    {
                        "role": "system",
                        "content": "You are a JSON-only parser. Return ONLY valid JSON array. No text before or after.",
                    },
                    {"role": "user", "content": prompt},
                ],
                "stream": False,
            }
            response = await client.post("http://localhost:11434/api/chat", json=payload)
            print(f"[LLM-Validate] Response status: {response.status_code}")

            if response.status_code != 200:
                print(f"[LLM-Validate] Ollama error: {response.text}")
                return heuristic_jobs

            result = response.json()
            content = result.get("message", {}).get("content", "").strip()
            print(f"[LLM-Validate] Raw response ({len(content)} chars): {content[:200]}")

            if not content:
                print("[LLM-Validate] Empty response, falling back to heuristic")
                return heuristic_jobs

            # Handle markdown code blocks
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()

            # Try to extract JSON if there's extra text
            if not content.startswith("["):
                # Look for first [ and last ]
                start_idx = content.find("[")
                end_idx = content.rfind("]")
                if start_idx >= 0 and end_idx > start_idx:
                    content = content[start_idx : end_idx + 1]
                    print("[LLM-Validate] Extracted JSON from response")

            jobs = json.loads(content)

            # Handle model wrapping in {"data": [...]}
            if isinstance(jobs, dict) and "data" in jobs:
                jobs = jobs["data"]
                print("[LLM-Validate] Unwrapped data field")

            if isinstance(jobs, list):
                validated = []
                for job in jobs:
                    if isinstance(job, dict) and "title" in job and "url" in job:
                        title = str(job["title"]).strip()
                        url = str(job["url"]).strip()
                        if title and url:
                            validated.append({"title": title, "url": url})
                print(f"[LLM-Validate] Validated {len(validated)} jobs from reconciliation")
                return validated

            print(f"[LLM-Validate] Response was not a list: {type(jobs)}")
            return heuristic_jobs

    except json.JSONDecodeError as e:
        print(f"[LLM-Validate] JSON parse error: {e}")
        print(f"[LLM-Validate] Falling back to heuristic ({len(heuristic_jobs)} jobs)")
        return heuristic_jobs
    except Exception as e:  # noqa: BLE001
        print(f"[LLM-Validate] Validation failed: {e}")
        import traceback
        traceback.print_exc()
        return heuristic_jobs


async def parse_job_listings_llm(markdown: str, extraction_debug: ExtractionDebug | None = None) -> list[dict]:
    """Strategy 3: Extract job listings using LLM (direct Ollama call)."""
    try:
        system_prompt = "You are an expert at parsing job career pages. Extract job listings accurately. Return ONLY valid JSON, no other text."
        user_prompt = f"""Analyze the following career page content and identify all job listings.

For each job found, extract:
1. Job title (exact title as shown)
2. Job URL (the clickable link to the job posting)

Return ONLY a JSON array with this exact format, no other text:
[
  {{"title": "Job Title", "url": "https://..."}},
  {{"title": "Another Job", "url": "https://..."}}
]

If no jobs found, return: []

Career page content:
{markdown}"""

        # Capture debug info
        if extraction_debug:
            extraction_debug.llm_prompt = user_prompt
            extraction_debug.markdown_length = len(markdown)

        print("[LLM] Calling Ollama directly at http://localhost:11434")
        print(f"[LLM] User prompt length: {len(user_prompt)} chars")

        async with httpx.AsyncClient(timeout=300) as client:
            payload = {
                "model": "qwen2.5:3b",
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "stream": False,
            }
            print("[LLM] Sending request to Ollama (timeout=300s)...")
            response = await client.post("http://localhost:11434/api/chat", json=payload)
            print(f"[LLM] Ollama response received, status: {response.status_code}")

            if response.status_code != 200:
                print(f"[LLM] Ollama error: {response.text}")
                return []

            result = response.json()
            content = result.get("message", {}).get("content", "").strip()

            # Capture raw response for debugging
            if extraction_debug:
                extraction_debug.llm_raw_response = content

            print(f"[LLM] Response content length: {len(content)}, first 200 chars: {content[:200]}")

            # Handle markdown code blocks if present
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()

            print(f"[LLM] After code block stripping: {len(content)} chars")

            jobs = json.loads(content)

            # Handle model wrapping in {"data": [...]}
            if isinstance(jobs, dict) and "data" in jobs:
                jobs = jobs["data"]
                print(f"[LLM] Unwrapped data field, got {len(jobs)} items")
            else:
                print(f"[LLM] Parsed JSON successfully, got {len(jobs)} items")

            # Validate structure
            if isinstance(jobs, list):
                validated = []
                for job in jobs:
                    if isinstance(job, dict) and "title" in job and "url" in job:
                        title = str(job["title"]).strip()
                        url = str(job["url"]).strip()
                        if title and url:
                            validated.append({"title": title, "url": url})
                print(f"[LLM] Validated {len(validated)} jobs")
                return validated

            print(f"[LLM] Response was not a list: {type(jobs)}")
            return []

    except json.JSONDecodeError as e:
        print(f"[LLM] JSON parse error: {e}")
        return []
    except Exception as e:  # noqa: BLE001
        print(f"[LLM] Extraction failed: {e}")
        import traceback
        traceback.print_exc()
        return []


async def extract_job_data_hybrid(raw_markdown: str) -> dict:
    """Extract job data using hybrid: structured first, then LLM refinement."""
    try:
        # Step 1: Run structured extraction
        structured = extract_job_data(raw_markdown)
        print(f"[JD-Hybrid] Structured baseline: title={bool(structured.get('title'))}, salary={bool(structured.get('salary_range'))}")

        # Step 2: Pass structured results + markdown to LLM for refinement
        prompt = f"""You have structured extraction results from a job posting. Verify and refine these results based on the actual job posting content below.

Structured extraction found:
- Title: {structured.get('title') or 'NOT FOUND'}
- Salary: {structured.get('salary_range') or 'NOT FOUND'}
- Remote: {structured.get('remote_status') or 'UNKNOWN'}
- Description (first 500 chars): {structured.get('description', '')[:500] if structured.get('description') else 'NOT FOUND'}

Now review the full job posting and correct/improve these fields if needed.

Return ONLY valid JSON with this exact structure, no other text:
{{
  "title": "Corrected/verified job title",
  "description": "The full job description",
  "salary_range": "e.g., $120,000-$150,000 or null if not found",
  "remote_status": "remote" | "hybrid" | "on-site" | "unknown"
}}

Job posting content:
{raw_markdown}"""

        print("[JD-Hybrid] Sending to LLM for refinement...")

        async with httpx.AsyncClient(timeout=120) as client:
            payload = {
                "model": "qwen2.5:3b",
                "messages": [
                    {
                        "role": "system",
                        "content": "You are an expert at parsing job postings. Refine extraction results by comparing with actual content. Return only valid JSON.",
                    },
                    {"role": "user", "content": prompt},
                ],
                "stream": False,
            }
            response = await client.post("http://localhost:11434/api/chat", json=payload)

            if response.status_code != 200:
                print(f"[JD-Hybrid] Ollama error, falling back to structured: {response.text}")
                return structured

            result = response.json()
            content = result.get("message", {}).get("content", "").strip()

            # Handle markdown code blocks
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()

            refined = json.loads(content)

            # Handle model wrapping in {"data": {...}}
            if isinstance(refined, dict) and "data" in refined and isinstance(refined["data"], dict):
                refined = refined["data"]
                print("[JD-Hybrid] Unwrapped data field")

            # Validate structure, keep any valid fields from LLM
            validated = {
                "title": refined.get("title") or structured.get("title"),
                "description": refined.get("description") or structured.get("description"),
                "salary_range": refined.get("salary_range") or structured.get("salary_range"),
                "remote_status": refined.get("remote_status") or structured.get("remote_status", "unknown"),
            }
            print("[JD-Hybrid] Refinement complete")
            return validated

    except Exception as e:  # noqa: BLE001
        print(f"[JD-Hybrid] Extraction failed, falling back to structured: {e}")
        return extract_job_data(raw_markdown)


async def extract_job_data_llm(raw_markdown: str) -> dict:
    """Extract job data using LLM-based extraction."""
    try:
        prompt = f"""Extract job posting information from the following content.

Return ONLY valid JSON with this exact structure, no other text:
{{
  "title": "Job Title",
  "description": "The full job description",
  "salary_range": "e.g., $120,000-$150,000 or null if not found",
  "remote_status": "remote" | "hybrid" | "on-site" | "unknown"
}}

Job posting content:
{raw_markdown}"""

        print("[JD-LLM] Extracting JD with LLM...")

        async with httpx.AsyncClient(timeout=120) as client:
            payload = {
                "model": "qwen2.5:3b",
                "messages": [
                    {
                        "role": "system",
                        "content": "You are an expert at parsing job postings. Extract structured job data accurately. Return only valid JSON.",
                    },
                    {"role": "user", "content": prompt},
                ],
                "stream": False,
            }
            response = await client.post("http://localhost:11434/api/chat", json=payload)

            if response.status_code != 200:
                print(f"[JD-LLM] Ollama error: {response.text}")
                return {}

            result = response.json()
            content = result.get("message", {}).get("content", "").strip()
            print(f"[JD-LLM] Response content length: {len(content)}")

            # Handle markdown code blocks
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()

            job_data = json.loads(content)

            # Handle model wrapping in {"data": {...}}
            if isinstance(job_data, dict) and "data" in job_data and isinstance(job_data["data"], dict):
                job_data = job_data["data"]
                print("[JD-LLM] Unwrapped data field")

            # Validate structure
            if isinstance(job_data, dict):
                validated = {
                    "title": job_data.get("title"),
                    "description": job_data.get("description"),
                    "salary_range": job_data.get("salary_range"),
                    "remote_status": job_data.get("remote_status", "unknown"),
                }
                print("[JD-LLM] Extracted successfully")
                return validated

        return {}

    except json.JSONDecodeError as e:
        print(f"[JD-LLM] JSON parse error: {e}")
        return {}
    except Exception as e:  # noqa: BLE001
        print(f"[JD-LLM] Extraction failed: {e}")
        import traceback
        traceback.print_exc()
        return {}


def extract_job_data(raw_markdown: str) -> dict:
    """Extract structured job data from job posting markdown."""
    # Initialize fields
    title = None
    description = None
    salary_range = None
    remote_status = "unknown"

    lines = raw_markdown.split("\n")

    # Extract title from first H1 or H2
    for line in lines:
        if line.startswith(("# ", "## ")):
            title = line.lstrip("# ").strip()
            break

    # Extract all content as description
    content_lines = [
        line
        for line in lines
        if line.strip()
        and not line.startswith("#")
        and not line.startswith("[")
    ]
    if content_lines:
        description = " ".join(content_lines)

    # Search for salary patterns
    salary_patterns = [
        r"\$[\d,]+(?:\s*-\s*\$[\d,]+)?(?:k|K)?",  # $120k-$150k or $120,000-$150,000
        r"[\d,]+(?:\s*-\s*[\d,]+)?\s*(?:k|K)(?:/year|per year)?",  # 120k-150k
    ]
    for pattern in salary_patterns:
        match = re.search(pattern, raw_markdown)
        if match:
            salary_range = match.group(0)
            break

    # Detect remote status
    remote_keywords = [
        ("remote", "remote"),
        ("work from home", "remote"),
        ("wfh", "remote"),
        ("hybrid", "hybrid"),
        ("on-site", "on-site"),
        ("on site", "on-site"),
        ("in-office", "on-site"),
        ("in office", "on-site"),
    ]

    markdown_lower = raw_markdown.lower()
    for keyword, status in remote_keywords:
        if keyword in markdown_lower:
            remote_status = status
            break

    return {
        "title": title,
        "description": description,
        "salary_range": salary_range,
        "remote_status": remote_status,
    }


@router.post("/crawl-page", response_model=CrawlResponse)
async def crawl_page_endpoint(req: QueryCompanyRequest) -> CrawlResponse:
    """Crawl a career page and return raw markdown (no extraction)."""
    start_time = time.time()
    try:
        markdown = await crawl_page(req.careers_page_url)
        crawl_latency_ms = (time.time() - start_time) * 1000

        # Capture metadata
        metadata = CrawlMetadata(
            markdown_length=len(markdown),
            js_rendering_used=True,  # We configured JS rendering
        )

        return CrawlResponse(
            success=True,
            markdown=markdown,
            error=None,
            crawl_latency_ms=crawl_latency_ms,
            metadata=metadata,
        )
    except Exception as e:  # noqa: BLE001
        crawl_latency_ms = (time.time() - start_time) * 1000
        error_str = str(e)
        anti_bot = "anti-bot" in error_str.lower() or "blocked" in error_str.lower()

        return CrawlResponse(
            success=False,
            markdown="",
            error=f"Crawl failed: {error_str}",
            crawl_latency_ms=crawl_latency_ms,
            metadata=CrawlMetadata(anti_bot_detected=anti_bot),
        )


@router.post("/query-company-cached")
async def query_company_cached(req: QueryCompanyWithMarkdownRequest) -> dict:
    """Extract jobs from pre-crawled markdown (no crawl, just extraction)."""
    start_time = time.time()
    llm_model = "qwen2.5:3b"  # Model used for LLM-based strategies

    try:
        markdown = req.markdown
        strategy = req.strategy

        # Run extraction strategy and capture debug data
        extraction_debug = ExtractionDebug()

        if strategy == "domain":
            jobs = parse_job_listings_domain_filter(markdown)
            extraction_method = "domain_filter"
            model_used = None
            extraction_debug.domain_count = len(jobs)
        elif strategy == "heuristic":
            jobs = parse_job_listings_heuristic(markdown)
            extraction_method = "heuristic"
            model_used = None
            extraction_debug.heuristic_count = len(jobs)
        elif strategy == "llm":
            jobs = await parse_job_listings_llm(markdown, extraction_debug)
            extraction_method = "llm"
            model_used = llm_model
            extraction_debug.llm_count = len(jobs)
        elif strategy == "cascade":
            jobs = (await extract_job_listings_three_step(markdown))[0]
            extraction_method = "cascade"
            model_used = llm_model
            extraction_debug.llm_count = len(jobs)
        elif strategy == "validate":
            domain_jobs = parse_job_listings_domain_filter(markdown)
            heuristic_jobs = parse_job_listings_heuristic(markdown)
            jobs = await parse_job_listings_validate(markdown, domain_jobs, heuristic_jobs)
            extraction_method = "validate"
            model_used = llm_model
            # Capture what each strategy found for comparison
            extraction_debug.domain_count = len(domain_jobs)
            extraction_debug.heuristic_count = len(heuristic_jobs)
            extraction_debug.llm_count = len(jobs)
        else:
            process_latency_ms = (time.time() - start_time) * 1000
            return {
                "success": False,
                "jobs": [],
                "error": f"Unknown strategy: {strategy}",
                "extraction_method": None,
                "strategy": strategy,
                "crawl_latency_ms": 0,
                "process_latency_ms": process_latency_ms,
                "llm_model": None,
                "data_source": "cached",
                "crawl_metadata": {"markdown_length": 0, "js_rendering_used": False, "anti_bot_detected": False, "retry_count": 0},
                "extraction_debug": {"domain_count": None, "heuristic_count": None, "llm_count": None, "llm_raw_response": None, "llm_prompt": None, "markdown_length": None},
                "markdown": markdown,
            }

        process_latency_ms = math.ceil((time.time() - start_time) * 1000)
        return {
            "success": True,
            "jobs": jobs,
            "error": None,
            "extraction_method": extraction_method,
            "strategy": strategy,
            "crawl_latency_ms": 0,
            "process_latency_ms": process_latency_ms,
            "llm_model": model_used,
            "data_source": "cached",
            "crawl_metadata": {"markdown_length": 0, "js_rendering_used": False, "anti_bot_detected": False, "retry_count": 0},
            "extraction_debug": {
                "domain_count": extraction_debug.domain_count,
                "heuristic_count": extraction_debug.heuristic_count,
                "llm_count": extraction_debug.llm_count,
                "llm_raw_response": extraction_debug.llm_raw_response,
                "llm_prompt": extraction_debug.llm_prompt,
                "markdown_length": extraction_debug.markdown_length,
            },
            "markdown": markdown,
        }

    except Exception as e:  # noqa: BLE001
        process_latency_ms = math.ceil((time.time() - start_time) * 1000)
        return {
            "success": False,
            "jobs": [],
            "error": f"Error: {e!s}",
            "extraction_method": None,
            "strategy": req.strategy,
            "crawl_latency_ms": 0,
            "process_latency_ms": process_latency_ms,
            "llm_model": None,
            "data_source": "cached",
            "crawl_metadata": {"markdown_length": 0, "js_rendering_used": False, "anti_bot_detected": False, "retry_count": 0},
            "extraction_debug": {"domain_count": None, "heuristic_count": None, "llm_count": None, "llm_raw_response": None, "llm_prompt": None, "markdown_length": None},
            "markdown": req.markdown,
        }


@router.post("/query-company")
async def query_company(req: QueryCompanyRequest) -> dict:
    """Query a company's career page and extract job listings using selected strategy."""
    llm_model = "qwen2.5:3b"
    start_time = time.time()

    try:
        # Crawl the page
        crawl_start = time.time()
        markdown = await crawl_page(req.careers_page_url)
        crawl_latency_ms = (time.time() - crawl_start) * 1000

        # Capture crawl metadata
        crawl_metadata = CrawlMetadata(
            markdown_length=len(markdown),
            js_rendering_used=True,
        )

        # Process/extract from markdown
        process_start = time.time()
        extraction_debug = ExtractionDebug()

        if req.strategy == "domain":
            jobs = parse_job_listings_domain_filter(markdown)
            extraction_method = "domain_filter"
            model_used = None
            extraction_debug.domain_count = len(jobs)
        elif req.strategy == "heuristic":
            jobs = parse_job_listings_heuristic(markdown)
            extraction_method = "heuristic"
            model_used = None
            extraction_debug.heuristic_count = len(jobs)
        elif req.strategy == "llm":
            jobs = await parse_job_listings_llm(markdown, extraction_debug)
            extraction_method = "llm"
            model_used = llm_model
            extraction_debug.llm_count = len(jobs)
        elif req.strategy == "cascade":
            jobs = (await extract_job_listings_three_step(markdown))[0]
            extraction_method = "cascade"
            model_used = llm_model
            extraction_debug.llm_count = len(jobs)
        elif req.strategy == "validate":
            # Hybrid: domain + heuristic + LLM validation
            domain_jobs = parse_job_listings_domain_filter(markdown)
            heuristic_jobs = parse_job_listings_heuristic(markdown)
            jobs = await parse_job_listings_validate(markdown, domain_jobs, heuristic_jobs)
            extraction_method = "validate"
            model_used = llm_model
            extraction_debug.domain_count = len(domain_jobs)
            extraction_debug.heuristic_count = len(heuristic_jobs)
            extraction_debug.llm_count = len(jobs)
        else:
            return {
                "success": False,
                "jobs": [],
                "error": f"Unknown strategy: {req.strategy}",
                "extraction_method": None,
                "strategy": req.strategy,
                "crawl_latency_ms": crawl_latency_ms,
                "process_latency_ms": 0,
                "llm_model": None,
                "data_source": "fresh_crawl",
                "crawl_metadata": {"markdown_length": 0, "js_rendering_used": False, "anti_bot_detected": False, "retry_count": 0},
                "extraction_debug": {"domain_count": None, "heuristic_count": None, "llm_count": None, "llm_raw_response": None, "llm_prompt": None, "markdown_length": None},
                "markdown": None,
            }

        process_latency_ms = (time.time() - process_start) * 1000
        return {
            "success": True,
            "jobs": jobs,
            "error": None,
            "extraction_method": extraction_method,
            "strategy": req.strategy,
            "crawl_latency_ms": crawl_latency_ms,
            "process_latency_ms": process_latency_ms,
            "llm_model": model_used,
            "data_source": "fresh_crawl",
            "crawl_metadata": {
                "markdown_length": crawl_metadata.markdown_length,
                "js_rendering_used": crawl_metadata.js_rendering_used,
                "anti_bot_detected": crawl_metadata.anti_bot_detected,
                "retry_count": crawl_metadata.retry_count,
            },
            "extraction_debug": {
                "domain_count": extraction_debug.domain_count,
                "heuristic_count": extraction_debug.heuristic_count,
                "llm_count": extraction_debug.llm_count,
                "llm_raw_response": extraction_debug.llm_raw_response,
                "llm_prompt": extraction_debug.llm_prompt,
                "markdown_length": extraction_debug.markdown_length,
            },
            "markdown": markdown,
        }

    except httpx.TimeoutException:
        crawl_latency_ms = (time.time() - start_time) * 1000
        return {
            "success": False,
            "jobs": [],
            "error": "Crawl timeout after 60s",
            "extraction_method": None,
            "strategy": req.strategy,
            "crawl_latency_ms": crawl_latency_ms,
            "process_latency_ms": 0,
            "llm_model": None,
            "data_source": "fresh_crawl",
            "crawl_metadata": {"markdown_length": 0, "js_rendering_used": False, "anti_bot_detected": False, "retry_count": 0},
            "extraction_debug": {"domain_count": None, "heuristic_count": None, "llm_count": None, "llm_raw_response": None, "llm_prompt": None, "markdown_length": None},
            "markdown": None,
        }
    except Exception as e:  # noqa: BLE001
        crawl_latency_ms = (time.time() - start_time) * 1000
        error_str = str(e)
        anti_bot = "anti-bot" in error_str.lower() or "blocked" in error_str.lower()

        return {
            "success": False,
            "jobs": [],
            "error": f"Error: {error_str}",
            "extraction_method": None,
            "strategy": req.strategy,
            "crawl_latency_ms": crawl_latency_ms,
            "process_latency_ms": 0,
            "llm_model": None,
            "data_source": "fresh_crawl",
            "crawl_metadata": {"markdown_length": 0, "js_rendering_used": False, "anti_bot_detected": anti_bot, "retry_count": 0},
            "extraction_debug": {"domain_count": None, "heuristic_count": None, "llm_count": None, "llm_raw_response": None, "llm_prompt": None, "markdown_length": None},
            "markdown": None,
        }


@router.post("/extract-job", response_model=ExtractJobResponse)
async def extract_job(req: ExtractJobRequest) -> ExtractJobResponse:
    """Extract structured data from a job posting using selected strategy."""
    start_time = time.time()
    try:
        markdown = await crawl_page(req.job_url)

        if not markdown:
            latency_ms = (time.time() - start_time) * 1000
            return ExtractJobResponse(
                success=False,
                job={},
                error="No content extracted from job posting",
                extraction_method=None,
                confidence="low",
                strategy=req.strategy,
                latency_ms=latency_ms,
            )

        # Run selected strategy
        if req.strategy == "structured":
            job_data = extract_job_data(markdown)
            extraction_method = "structured"
        elif req.strategy == "llm":
            job_data = await extract_job_data_llm(markdown)
            extraction_method = "llm"
        elif req.strategy == "hybrid":
            job_data = await extract_job_data_hybrid(markdown)
            extraction_method = "hybrid"
        else:
            latency_ms = (time.time() - start_time) * 1000
            return ExtractJobResponse(
                success=False,
                job={},
                error=f"Unknown strategy: {req.strategy}",
                extraction_method=None,
                confidence="low",
                strategy=req.strategy,
                latency_ms=latency_ms,
            )

        # Determine confidence based on completeness
        fields_extracted = sum(
            1 for v in job_data.values() if v and v != "unknown"
        )
        if fields_extracted == 4:
            confidence = "high"
        elif fields_extracted >= 2:
            confidence = "medium"
        else:
            confidence = "low"

        latency_ms = (time.time() - start_time) * 1000
        return ExtractJobResponse(
            success=True,
            job=job_data,
            error=None,
            extraction_method=extraction_method,
            confidence=confidence,
            strategy=req.strategy,
            latency_ms=latency_ms,
        )

    except httpx.TimeoutException:
        latency_ms = (time.time() - start_time) * 1000
        return ExtractJobResponse(
            success=False,
            job={},
            error="Crawl timeout after 60s",
            extraction_method=None,
            confidence="low",
            strategy=req.strategy,
            latency_ms=latency_ms,
        )
    except Exception as e:  # noqa: BLE001
        latency_ms = (time.time() - start_time) * 1000
        return ExtractJobResponse(
            success=False,
            job={},
            error=f"Error: {e!s}",
            extraction_method=None,
            confidence="low",
            strategy=req.strategy,
            latency_ms=latency_ms,
        )


async def validate_new_roles_algorithm(org_id: int, limit_unvalidated: int | None = None, crawl_id: int | None = None) -> dict:
    """
    Core algorithm, per app_docs/crawler_algorithm.md:
    1. Crawl career page
    2. Extract all {title, url} links -> crawl_list
    3. Load existing org_roles -> org_list
    4. De-dupe crawl_list against org_list (found_in_org_list / found_in_crawl_list)
    5. Detect missing roles (found_missing)
    6. Strip previously identified non-job links (non_job_match, from org_nonjob_links)
    7. Domain matching (ignoring non_job_match / found_in_org_list)
    8. Heuristic matching (ignoring non_job_match / found_in_org_list)
    9. Deduped candidate list: not non_job_match, not found_in_org_list, and (domain_match or heuristic_match)
    10. Validate each candidate (2-pass LLM: is_job -> extract_metadata) -> found_new_job
    11. Cleanup: write new non-job links, update crawl_count/missing_count, persist crawl_json

    Args:
        org_id: Organization ID to crawl
        limit_unvalidated: Limit number of unvalidated roles to process (for testing)
        crawl_id: Optional pre-created crawl_id. If provided, skip creating new record.

    Returns:
        {
            "success": bool,
            "new_roles_validated": int,
            "existing_roles_matched": int,
            "roles_marked_inactive": int,
            "validated_roles": [{role data}],
            "debug_log": ["step 1", "step 2", ...]
        }
    """
    debug_log = []
    start_time = time.time()

    try:
        # Step 1: Fetch org and create or use existing crawl record
        org = database.get_org(org_id)
        if not org:
            return {"success": False, "error": "Org not found", "debug_log": []}

        debug_log.append(f"[1] Loaded org: {org['name']}")

        # If crawl_id not provided, create a new crawl record
        if crawl_id is None:
            crawl_id = database.insert_org_crawl(
                org_id=org_id,
                status="running",
                started_at=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
            )
            debug_log.append(f"[1.5] Created org_crawls record: crawl_id={crawl_id}")
        else:
            # Update existing crawl record to running status
            database.update_org_crawl_status(crawl_id, "running")
            debug_log.append(f"[1.5] Using provided crawl_id={crawl_id}, marked as running")

        # Fetch crawl record to get its created_at timestamp for scrape_date
        with database.get_connection() as conn:
            crawl_row = conn.execute("SELECT created_at FROM org_crawls WHERE id = ?", (crawl_id,)).fetchone()
            crawl_created_at = crawl_row['created_at'] if crawl_row else datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

        # Step 2: Crawl career page (with timing)
        debug_log.append(f"[2] Crawling career page: {org['career_page_url']}")
        career_crawl_start = time.time()
        career_markdown = await crawl_page(org["career_page_url"])
        career_crawl_latency_ms = int((time.time() - career_crawl_start) * 1000)
        debug_log.append(f"[3] Career page crawled, {len(career_markdown)} chars in {career_crawl_latency_ms}ms")
        database.update_org_crawl_markdown(crawl_id, career_markdown[:100000])

        # Log crawl4ai career page fetch
        database.insert_org_crawl_log(
            org_crawl_id=crawl_id,
            action_type="crawl4ai_career",
            url=org["career_page_url"],
            markdown=career_markdown[:100000],
            latency_ms=career_crawl_latency_ms,
            method="full",
            status_code=200,  # Assume success if we got markdown
        )

        # Step 2 (doc): Extract all links -> seed crawl_list
        all_links = extract_all_links(career_markdown)
        crawl_list = [
            {
                "title": link["title"],
                "url": link["url"],
                "found_in_org_list": False,
                "non_job_match": False,
                "domain_match": False,
                "heuristic_match": False,
                "found_new_job": False,
                "org_role_id": None,
            }
            for link in all_links
        ]
        crawl_list_by_url = {item["url"]: item for item in crawl_list}
        debug_log.append(f"[4] Extracted {len(crawl_list)} unique links from career page")

        # Step 3 (doc): Load existing org_roles -> org_list
        existing_roles = database.get_org_roles(org_id, include_inactive=False)
        org_list = [
            {
                "title": role["title"],
                "url": role["role_url"],
                "found_in_crawl_list": False,
                "found_missing": False,
            }
            for role in existing_roles if role["role_url"]
        ]
        debug_log.append(f"[5] Loaded {len(org_list)} existing roles from DB")

        # Step 4 (doc): De-dupe crawl_list against org_list
        for org_item in org_list:
            crawl_item = crawl_list_by_url.get(org_item["url"])
            if crawl_item:
                crawl_item["found_in_org_list"] = True
                org_item["found_in_crawl_list"] = True
        debug_log.append("[6] De-duped crawl_list against org_list")

        # Step 5 (doc): Detect missing roles
        for org_item in org_list:
            if not org_item["found_in_crawl_list"]:
                org_item["found_missing"] = True
        detected_missing_count = sum(1 for item in org_list if item["found_missing"])
        debug_log.append(f"[7] Detected {detected_missing_count} roles no longer on career page")

        # Step 6 (doc): Strip previously identified non-job links
        nonjob_urls = database.get_org_nonjob_links(org_id)
        for item in crawl_list:
            if item["url"] in nonjob_urls:
                item["non_job_match"] = True
        debug_log.append(f"[8] Marked {sum(1 for i in crawl_list if i['non_job_match'])} links as known non-job")

        # Step 7 (doc): Domain matching, ignoring non_job_match / found_in_org_list
        domain_start = time.time()
        domain_match_count = 0
        for item in crawl_list:
            if item["non_job_match"] or item["found_in_org_list"]:
                continue
            if _is_domain_match(item["url"]):
                item["domain_match"] = True
                domain_match_count += 1
        domain_latency_ms = int((time.time() - domain_start) * 1000)
        database.insert_org_crawl_log(
            org_crawl_id=crawl_id,
            action_type="domain_extract",
            output_data=json.dumps({"count": domain_match_count}),
            latency_ms=domain_latency_ms,
        )
        debug_log.append(f"[9] Domain matching: {domain_match_count} matches in {domain_latency_ms}ms")

        # Step 8 (doc): Heuristic matching, ignoring non_job_match / found_in_org_list
        heuristic_start = time.time()
        heuristic_match_count = 0
        for item in crawl_list:
            if item["non_job_match"] or item["found_in_org_list"]:
                continue
            if _is_heuristic_match(item["title"], item["url"]):
                item["heuristic_match"] = True
                heuristic_match_count += 1
        heuristic_latency_ms = int((time.time() - heuristic_start) * 1000)
        database.insert_org_crawl_log(
            org_crawl_id=crawl_id,
            action_type="heuristic_extract",
            output_data=json.dumps({"count": heuristic_match_count}),
            latency_ms=heuristic_latency_ms,
        )
        debug_log.append(f"[10] Heuristic matching: {heuristic_match_count} matches in {heuristic_latency_ms}ms")

        # Step 9 (doc): Filter crawl_list to only domain/heuristic matches
        # Filter crawl_list to ONLY items that matched domain OR heuristic (and not already in org/non-job)
        crawl_list = [
            item for item in crawl_list
            if (item["domain_match"] or item["heuristic_match"]) and not item["non_job_match"] and not item["found_in_org_list"]
        ]
        # dedupe_roles_count = final count of items after deduplication/filtering
        dedupe_roles_count = len(crawl_list)
        debug_log.append(f"[11] Filtered crawl_list to {dedupe_roles_count} domain/heuristic matches")

        # Create final candidate list from filtered crawl_list
        new_candidates = crawl_list
        debug_log.append(f"[12] De-duped: {len(new_candidates)} possible new roles to validate")

        # Collect metrics for org_crawls
        scraped_urls = {item["url"] for item in new_candidates}  # Now only domain/heuristic matches
        domain_roles_count = domain_match_count
        heuristic_roles_count = heuristic_match_count
        current_org_roles_count = len(org_list)
        missing_roles_count = detected_missing_count
        matched_roles_count = sum(1 for item in org_list if item["found_in_crawl_list"])
        unvalidated_roles_count = len(new_candidates)

        # Step 10 (doc): Validate each candidate (2-pass LLM approach)
        new_validated_urls = []
        validation_errors = []

        # Process all candidates (limit_unvalidated can still be used for testing if set)
        candidates_to_validate = new_candidates[:limit_unvalidated] if limit_unvalidated else new_candidates
        skipped_count = len(new_candidates) - len(candidates_to_validate)
        if skipped_count > 0:
            debug_log.append(f"[13.a] Processing first {limit_unvalidated} of {len(new_candidates)} (skipping {skipped_count})")

        for idx, candidate in enumerate(candidates_to_validate, 1):
            job_title = candidate.get("title", "")
            job_url = candidate.get("url", "")

            debug_log.append(f"[13.{idx}] Validating: {job_title[:50]}...")

            crawl4ai_latency_ms = None
            validation_info = {}
            extraction_info = {}

            try:
                # Crawl the job page (with timing)
                crawl_start = time.time()
                job_markdown = await crawl_page(job_url)
                crawl4ai_latency_ms = int((time.time() - crawl_start) * 1000)
                debug_log.append(f"[13.{idx}.a] Crawled job page ({len(job_markdown)} chars in {crawl4ai_latency_ms}ms)")

                # Log crawl4ai job page fetch
                database.insert_org_crawl_log(
                    org_crawl_id=crawl_id,
                    action_type="crawl4ai_job",
                    url=job_url,
                    markdown=job_markdown[:100000],
                    latency_ms=crawl4ai_latency_ms,
                    method="full",
                    status_code=200,  # Assume success if we got markdown
                )

                # LLM Pass 1: Is this a real job posting?
                is_job, validation_info = await validate_is_job_posting(job_markdown, job_title)

                # Log LLM validation attempt
                database.insert_org_crawl_log(
                    org_crawl_id=crawl_id,
                    action_type="llm_validate",
                    url=job_url,
                    output_data=json.dumps({"is_job": is_job}),
                    llm_model="qwen2.5:3b",
                    prompt=validation_info.get("prompt", ""),
                    response=validation_info.get("response", "")[:1000],
                    latency_ms=validation_info.get("latency_ms"),
                    status_code=200,  # LLM succeeded (we got a response)
                )

                if not is_job:
                    debug_log.append(f"[13.{idx}.b] LLM Pass 1: NOT a job posting → rejected ({validation_info.get('latency_ms')}ms)")
                    continue

                debug_log.append(f"[13.{idx}.b] LLM Pass 1: Confirmed as job posting ({validation_info.get('latency_ms')}ms)")

                # LLM Pass 2: Extract metadata
                extracted, extraction_info = await extract_job_metadata(job_markdown, job_title)
                debug_log.append(f"[13.{idx}.c] LLM Pass 2: Extracted title={extracted.get('title', 'N/A')}, salary={extracted.get('salary_range', 'N/A')} ({extraction_info.get('latency_ms')}ms)")

                # Log LLM extraction
                database.insert_org_crawl_log(
                    org_crawl_id=crawl_id,
                    action_type="llm_extract",
                    url=job_url,
                    output_data=json.dumps({
                        "title": extracted.get("title"),
                        "salary_range": extracted.get("salary_range"),
                        "remote_type": extracted.get("remote_type"),
                    }),
                    llm_model="qwen2.5:3b",
                    prompt=extraction_info.get("prompt", ""),
                    response=extraction_info.get("response", "")[:1000],
                    latency_ms=extraction_info.get("latency_ms"),
                    status_code=200,  # LLM succeeded
                )

                # Check if role is interesting (matches keywords from jobsearch.md)
                role_title = extracted.get("title", job_title)
                role_description = extracted.get("description")
                is_interesting = 1 if _is_role_interesting(role_title, role_description) else 0

                # Insert or update in DB
                role_id = database.upsert_org_role(
                    org_id,
                    title=role_title,
                    role_url=job_url,
                    description=role_description,
                    salary_range=extracted.get("salary_range"),
                    remote_type=extracted.get("remote_type", "unknown"),
                    markdown=job_markdown,
                    is_interesting=is_interesting,
                    is_active=1,
                    missing_count=0,
                    scrape_date=crawl_created_at,
                )
                debug_log.append(f"[13.{idx}.d] Upserted to DB: role_id={role_id}, interesting={is_interesting}")

                candidate["found_new_job"] = True
                candidate["org_role_id"] = role_id
                new_validated_urls.append(job_url)

            except Exception as e:  # noqa: BLE001
                error_msg = str(e)
                validation_errors.append(f"{job_title}: {error_msg}")
                debug_log.append(f"[13.{idx}] ERROR: {error_msg}")
                # Log the error
                try:
                    database.insert_org_crawl_log(
                        org_crawl_id=crawl_id,
                        action_type="llm_validate",
                        url=job_url,
                        error_msg=error_msg[:200],
                    )
                except Exception:  # noqa: BLE001, S110
                    pass  # If logging fails, don't block the algorithm

        # Step 14 (doc): Write newly identified non-job links to org_nonjob_links
        nonjob_to_write = [
            {"url": item["url"], "title": item["title"]}
            for item in crawl_list
            if not item["non_job_match"] and not item["found_new_job"] and not item["found_in_org_list"]
        ]
        if nonjob_to_write:
            database.insert_org_nonjob_links(org_id, nonjob_to_write)
        debug_log.append(f"[12] Wrote {len(nonjob_to_write)} new non-job links to org_nonjob_links")

        # Step 15 (doc): Update crawl_count for matched existing roles
        database.increment_org_role_crawl_count(org_id, scraped_urls)
        debug_log.append(f"[13] Incremented crawl_count for {matched_roles_count} matched existing roles")

        # Step 16 (doc): Update missing_count for ALL roles using scraped_urls (not validated list)
        database.update_org_role_missing_count(org_id, scraped_urls)
        debug_log.append("[14] Updated missing_count for all roles (roles marked inactive if missing 2+ crawls)")

        # Count results
        all_roles = database.get_org_roles(org_id, include_inactive=True)
        inactive_count = sum(1 for r in all_roles if not r["is_active"])

        elapsed_ms = (time.time() - start_time) * 1000
        debug_log.append(f"[15] Algorithm complete in {elapsed_ms:.0f}ms")

        # Persist the full crawl_list/org_list audit trail
        crawl_json = json.dumps({"crawl_list": crawl_list, "org_list": org_list})
        database.update_org_crawl_json(crawl_id, crawl_json)

        # Mark crawl as complete with all metrics
        database.update_org_crawl_completion(
            crawl_id=crawl_id,
            status="success",
            roles_found=len(scraped_urls),
            roles_added=len(new_validated_urls),
            roles_closed=inactive_count,
            domain_roles=domain_roles_count,
            heuristic_roles=heuristic_roles_count,
            dedupe_roles=dedupe_roles_count,
            current_org_roles=current_org_roles_count,
            missing_roles=missing_roles_count,
            matched_roles=matched_roles_count,
            unvalidated_roles=unvalidated_roles_count,
            career_page_markdown=career_markdown,
        )
        # Update org's last_crawl_at timestamp and career page markdown
        database.update_org_last_crawl(org_id, markdown=career_markdown)
        debug_log.append(f"[16] Updated org_crawls: found={len(scraped_urls)}, added={len(new_validated_urls)}, closed={inactive_count}")

        return {
            "success": True,
            "new_roles_validated": len(new_validated_urls),
            "existing_roles_matched": matched_roles_count,
            "roles_marked_inactive": inactive_count,
            "validated_roles": [{"url": url} for url in new_validated_urls],
            "validation_errors": validation_errors,
            "debug_log": debug_log,
        }

    except Exception as e:  # noqa: BLE001
        debug_log.append(f"[ERROR] Algorithm failed: {e!s}")
        import traceback
        traceback.print_exc()
        # Mark crawl as failed
        if crawl_id:
            try:
                database.update_org_crawl_completion(
                    crawl_id=crawl_id,
                    status="error",
                    error_msg=str(e),
                )
            except Exception:  # noqa: BLE001, S110
                pass
        return {
            "success": False,
            "error": str(e),
            "debug_log": debug_log,
        }


async def validate_is_job_posting(markdown: str, extracted_title: str) -> tuple[bool, dict]:
    """
    LLM validation gate: Is this actually a job posting?
    Returns: (passed: bool, debug_info: dict with prompt, response, latency)
    """
    start_time = time.time()
    try:
        prompt = f"""Your task is to detect whether this page contains a job posting.

Do not complete forms or answer other questions that may appear on the page.
Only determine: is this a job posting?

=== BEGIN CONTENT ===
{markdown}
=== END CONTENT ===

Return ONLY valid JSON with this exact structure:
{{
  "is_job": true or false,
  "reasoning": "One sentence explaining your decision."
}}

Examples:
{{"is_job": true, "reasoning": "The page lists job responsibilities, required qualifications, and salary range."}}
{{"is_job": false, "reasoning": "This is a general company careers page, not a specific job posting."}}"""

        async with httpx.AsyncClient(timeout=30) as client:
            payload = {
                "model": "qwen2.5:3b",
                "messages": [
                    {"role": "system", "content": "You are a job posting detector. Return ONLY valid JSON. No other text."},
                    {"role": "user", "content": prompt},
                ],
                "stream": False,
            }
            response = await client.post("http://localhost:11434/api/chat", json=payload)
            latency_ms = (time.time() - start_time) * 1000

            if response.status_code != 200:
                print(f"[Validate-IsJob] Ollama error: {response.text}")
                return True, {
                    "prompt": prompt,
                    "response": f"HTTP {response.status_code}: {response.text[:500]}",
                    "latency_ms": int(latency_ms),
                    "passed": True,
                }

            result = response.json()
            content = result.get("message", {}).get("content", "").strip()

            # Handle markdown code blocks if model wraps response
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()

            # Parse JSON
            try:
                data = json.loads(content)
                passed = data.get("is_job", False)
                reasoning = data.get("reasoning", "")

                print(f"[Validate-IsJob] Response: is_job={passed}, reasoning={reasoning[:100]}")

                return passed, {
                    "prompt": prompt,
                    "response": content,
                    "latency_ms": int(latency_ms),
                    "passed": passed,
                }
            except json.JSONDecodeError:
                print("[Validate-IsJob] JSON parse error, treating as not a job posting")
                print(f"[Validate-IsJob] Raw response: {content[:200]}")
                return False, {
                    "prompt": prompt,
                    "response": content,
                    "latency_ms": int(latency_ms),
                    "passed": False,
                }

    except Exception as e:  # noqa: BLE001
        print(f"[Validate-IsJob] Error: {e}")
        return True, {
            "prompt": "",
            "response": str(e),
            "latency_ms": int((time.time() - start_time) * 1000),
            "passed": True,
        }


async def extract_job_metadata(markdown: str, extracted_title: str) -> tuple[dict, dict]:
    """
    Extract metadata from validated job posting.
    Returns: (metadata: dict, debug_info: dict with prompt, response, latency)
    """
    start_time = time.time()
    try:
        prompt = f"""Extract job posting metadata. Return ONLY valid JSON.

Extracted title: {extracted_title}

Job posting:
{markdown[:3000]}

Return exactly this JSON structure:
{{
  "title": "Job Title",
  "description": "First 500 chars of description",
  "salary_range": "e.g., $120k-$150k or null",
  "remote_type": "remote" | "hybrid" | "on-site" | "unknown"
}}"""

        async with httpx.AsyncClient(timeout=30) as client:
            payload = {
                "model": "qwen2.5:3b",
                "messages": [
                    {"role": "system", "content": "Extract metadata. Return ONLY valid JSON."},
                    {"role": "user", "content": prompt},
                ],
                "stream": False,
            }
            response = await client.post("http://localhost:11434/api/chat", json=payload)
            latency_ms = (time.time() - start_time) * 1000

            if response.status_code != 200:
                print("[Extract-Metadata] Ollama error")
                return (
                    {"title": extracted_title, "remote_type": "unknown"},
                    {
                        "prompt": prompt,
                        "response": f"HTTP {response.status_code}",
                        "latency_ms": int(latency_ms),
                    }
                )

            result = response.json()
            content = result.get("message", {}).get("content", "").strip()

            # Parse JSON
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()

            data = json.loads(content)
            return (
                {
                    "title": data.get("title", extracted_title),
                    "description": data.get("description"),
                    "salary_range": data.get("salary_range"),
                    "remote_type": data.get("remote_type", "unknown"),
                },
                {
                    "prompt": prompt,
                    "response": content[:1000],  # Store first 1000 chars
                    "latency_ms": int(latency_ms),
                }
            )

    except Exception as e:  # noqa: BLE001
        print(f"[Extract-Metadata] Error: {e}")
        return (
            {"title": extracted_title, "remote_type": "unknown"},
            {
                "prompt": "",
                "response": str(e),
                "latency_ms": int((time.time() - start_time) * 1000),
            }
        )


class ValidateRolesRequest(BaseModel):
    org_id: int
    limit_unvalidated: int | None = None


@router.post("/validate-roles")
async def validate_roles(req: ValidateRolesRequest) -> dict:
    """Trigger the validation algorithm for an org. limit_unvalidated defaults to 3 for testing."""
    return await validate_new_roles_algorithm(req.org_id, limit_unvalidated=req.limit_unvalidated)


@router.post("/crawl-all-orgs")
async def crawl_all_orgs() -> dict:
    """Trigger validation algorithm for all orgs concurrently. Returns immediately."""
    try:
        orgs = database.get_all_orgs()

        if not orgs:
            return {
                "success": True,
                "total_orgs": 0,
                "crawls_started": 0,
                "errors": 0,
                "message": "No orgs found"
            }

        print(f"[Crawl-All] Starting crawls for {len(orgs)} orgs...")

        # Fire off all validation algorithms in parallel
        tasks = [validate_new_roles_algorithm(org["id"]) for org in orgs]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Count successes and errors
        successful = sum(1 for r in results if not isinstance(r, Exception) and r.get("success"))
        failed = sum(1 for r in results if isinstance(r, Exception) or not r.get("success"))

        print(f"[Crawl-All] Crawls fired: {successful} success, {failed} errors")

        return {
            "success": True,
            "total_orgs": len(orgs),
            "crawls_started": successful,
            "errors": failed,
            "org_ids": [org["id"] for org in orgs],
            "message": f"Started {successful} crawls, {failed} errors"
        }

    except Exception as e:  # noqa: BLE001
        print(f"[Crawl-All] Error: {e}")
        import traceback
        traceback.print_exc()
        return {
            "success": False,
            "error": str(e),
            "total_orgs": 0,
            "crawls_started": 0,
            "errors": 1
        }


@router.get("/org-crawls")
async def list_org_crawls() -> list[dict]:
    """List all org_crawls with id, created_at, org_id."""
    with database.get_connection() as conn:
        rows = conn.execute(
            """SELECT id, org_id, created_at FROM org_crawls ORDER BY created_at DESC"""
        ).fetchall()
        return [{"id": row["id"], "org_id": row["org_id"], "created_at": row["created_at"]} for row in rows]


@router.post("/org-crawls/{crawl_id}/export")
async def export_org_crawl(crawl_id: int) -> dict:
    """Export org_crawl and its logs to app_docs/{id}_{MMSS}_output.json."""
    with database.get_connection() as conn:
        # Fetch the crawl record
        crawl = conn.execute(
            "SELECT * FROM org_crawls WHERE id = ?", (crawl_id,)
        ).fetchone()
        if not crawl:
            return {"success": False, "error": "Crawl not found"}

        # Fetch all logs for this crawl
        logs = conn.execute(
            "SELECT * FROM org_crawl_logs WHERE org_crawl_id = ? ORDER BY created_at ASC",
            (crawl_id,)
        ).fetchall()

    # Extract MM:SS from timestamp (format: YYYY-MM-DD HH:MM:SS)
    timestamp = crawl["created_at"]
    from datetime import timezone
    dt = datetime.strptime(timestamp, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
    mmss = f"{dt.month:02d}{dt.second:02d}"

    # Build output structure
    output = {
        "org_crawl": dict(crawl),
        "crawl_logs": [dict(log) for log in logs]
    }

    # Write to app_docs/{id}_{MMSS}_output.json
    output_path = Path("app_docs") / f"{crawl_id}_{mmss}_output.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, "w") as f:  # noqa: ASYNC230
        json.dump(output, f, indent=2)

    return {"success": True, "filename": str(output_path)}


@router.get("/state")
async def get_poc_state() -> dict:
    """Load POC form state from app_data/poc_state.json."""
    if POC_STATE_PATH.exists():
        return await asyncio.to_thread(_load_poc_state)
    return {}


def _load_poc_state() -> dict:
    with open(POC_STATE_PATH) as f:
        return json.load(f)


@router.post("/state")
async def save_poc_state(state: POCStateRequest) -> dict:
    """Save POC form state to app_data/poc_state.json."""
    POC_STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    await asyncio.to_thread(_save_poc_state, state)
    return {"success": True}


def _save_poc_state(state: POCStateRequest) -> None:
    state_dict = state.model_dump()
    with open(POC_STATE_PATH, "w") as f:
        json.dump(state_dict, f, indent=2)


@router.get("/persistent-data")
async def get_persistent_data() -> dict:
    """Load persistent test data (companies + career/job test results)."""
    return await asyncio.to_thread(_load_persistent_data)


def _load_persistent_data() -> dict:
    companies = []
    career_results = []
    jobs_results = []

    if POC_COMPANIES_PATH.exists():
        with open(POC_COMPANIES_PATH) as f:
            data = json.load(f)
            companies = data.get("companies", [])

    if POC_CAREER_OUTPUT_PATH.exists():
        with open(POC_CAREER_OUTPUT_PATH) as f:
            data = json.load(f)
            career_results = data.get("testResults", [])

    if POC_JOBS_OUTPUT_PATH.exists():
        with open(POC_JOBS_OUTPUT_PATH) as f:
            data = json.load(f)
            jobs_results = data.get("testResults", [])

    return {
        "companies": companies,
        "testResults": career_results,
        "jobsResults": jobs_results,
    }


@router.post("/persistent-data")
async def save_persistent_data(data: dict) -> dict:
    """Save persistent test data to separate POC_*.json files (auto-called by frontend)."""
    POC_COMPANIES_PATH.parent.mkdir(parents=True, exist_ok=True)
    await asyncio.to_thread(_save_persistent_data, data)
    return {"success": True}


def _deduplicate_and_merge_roles(companies: list[dict], career_results: list[dict]) -> list[dict]:
    """Merge job results into company roles array, deduping by URL."""
    # Build a map of company_name -> company for quick lookup
    company_map = {c["company_name"]: c for c in companies}

    # Process each career test result
    for result in career_results:
        company_name = result.get("companyName")
        if not company_name:
            continue

        if company_name not in company_map:
            print(f"[DEDUP] Company '{company_name}' not in map. Available: {list(company_map.keys())}")
            continue

        company = company_map[company_name]
        if "roles" not in company:
            company["roles"] = []

        # Get jobs from this result if present
        jobs = result.get("jobs", [])
        if not jobs:
            continue

        # Get existing URLs in roles for dedup
        existing_urls = {role.get("role_url") for role in company["roles"]}

        # Add new jobs that don't already exist
        for job in jobs:
            job_url = job.get("url")
            job_title = job.get("title")

            if job_url and job_url not in existing_urls:
                company["roles"].append({
                    "role_title": job_title or "",
                    "role_url": job_url
                })
                existing_urls.add(job_url)

    return list(company_map.values())


def _save_persistent_data(data: dict) -> None:
    # Load existing companies to preserve manual_job_count, notes, etc.
    existing_data = _load_persistent_data()
    existing_companies = existing_data.get("companies", [])

    # Get incoming companies and merge with existing
    incoming_companies = data.get("companies", [])
    company_map = {c["company_name"]: c for c in existing_companies}

    # Update map with incoming data (preserves existing fields like manual_job_count)
    for incoming in incoming_companies:
        name = incoming.get("company_name")
        if name in company_map:
            company_map[name].update(incoming)
        else:
            company_map[name] = incoming

    companies = list(company_map.values())
    career_results = data.get("testResults", data.get("careerResults", []))

    # Ensure all test results preserve markdown and debug info
    for result in career_results:
        # Keep markdown if it exists
        if "markdown" not in result and "markdown" in data:
            result["markdown"] = data.get("markdown")
        # Keep extraction_debug with all fields
        if "extraction_debug" in result:
            debug = result["extraction_debug"]
            if isinstance(debug, dict):
                # Preserve all debug fields as-is
                pass

    # Deduplicate and merge jobs into roles
    companies = _deduplicate_and_merge_roles(companies, career_results)

    # Ensure all required fields exist in each company
    for company in companies:
        if "manual_job_count" not in company:
            company["manual_job_count"] = None
        if "notes" not in company:
            company["notes"] = ""
        if "roles" not in company:
            company["roles"] = []

    # Save companies (now with updated roles)
    companies_data = {"companies": companies}
    with open(POC_COMPANIES_PATH, "w") as f:
        json.dump(companies_data, f, indent=2)

    # Save career test results
    career_data = {"testResults": career_results}
    with open(POC_CAREER_OUTPUT_PATH, "w") as f:
        json.dump(career_data, f, indent=2)

    # Save job test results
    jobs_data = {"testResults": data.get("jobsResults", [])}
    with open(POC_JOBS_OUTPUT_PATH, "w") as f:
        json.dump(jobs_data, f, indent=2)
