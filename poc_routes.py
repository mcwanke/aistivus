import json
import re
from pathlib import Path

import httpx
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/v1/poc", tags=["poc"])

CRAWL4AI_BASE_URL = "http://192.168.100.14:11235"
POC_STATE_PATH = Path("app_data/poc_state.json")


class QueryCompanyRequest(BaseModel):
    company_name: str
    company_url: str
    careers_page_url: str
    strategy: str = "domain"  # "domain", "heuristic", or "llm"


class QueryCompanyResponse(BaseModel):
    success: bool
    jobs: list[dict]
    error: str | None
    extraction_method: str | None
    strategy: str


class ExtractJobRequest(BaseModel):
    job_url: str
    strategy: str = "structured"  # "structured", "llm", or "hybrid"


class ExtractJobResponse(BaseModel):
    success: bool
    job: dict
    error: str | None
    extraction_method: str | None
    confidence: str
    strategy: str


class CompanyEntry(BaseModel):
    company_name: str
    company_url: str
    careers_page_url: str


class POCStateRequest(BaseModel):
    companies: list[CompanyEntry] = []
    job_url: str = ""
    research_prompt: str = ""


async def crawl_page(url: str) -> dict:
    """Crawl a URL and return markdown content."""
    async with httpx.AsyncClient(timeout=60) as client:
        # Use /md endpoint which returns markdown directly
        payload = {"url": url}
        response = await client.post(f"{CRAWL4AI_BASE_URL}/md", json=payload)
        response.raise_for_status()
        return response.json()


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


async def parse_job_listings_llm(markdown: str) -> list[dict]:
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

        print("[LLM] Calling Ollama directly at http://localhost:11434")
        print(f"[LLM] User prompt length: {len(user_prompt)} chars")

        async with httpx.AsyncClient(timeout=300) as client:
            payload = {
                "model": "qwen2.5:7b",
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
            print(f"[LLM] Response content length: {len(content)}, first 200 chars: {content[:200]}")

            # Handle markdown code blocks if present
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()

            print(f"[LLM] After code block stripping: {len(content)} chars")

            jobs = json.loads(content)
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
    except Exception as e:
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
                "model": "qwen2.5:7b",
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

            # Validate structure, keep any valid fields from LLM
            validated = {
                "title": refined.get("title") or structured.get("title"),
                "description": refined.get("description") or structured.get("description"),
                "salary_range": refined.get("salary_range") or structured.get("salary_range"),
                "remote_status": refined.get("remote_status") or structured.get("remote_status", "unknown"),
            }
            print("[JD-Hybrid] Refinement complete")
            return validated

    except Exception as e:
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
                "model": "qwen2.5:7b",
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
    except Exception as e:
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


@router.post("/query-company", response_model=QueryCompanyResponse)
async def query_company(req: QueryCompanyRequest) -> QueryCompanyResponse:
    """Query a company's career page and extract job listings using selected strategy."""
    try:
        result = await crawl_page(req.careers_page_url)

        if not result.get("success"):
            return QueryCompanyResponse(
                success=False,
                jobs=[],
                error="Failed to crawl page",
                extraction_method=None,
                strategy=req.strategy,
            )

        markdown = result.get("markdown", "")

        # Run only the selected strategy
        if req.strategy == "domain":
            jobs = parse_job_listings_domain_filter(markdown)
            extraction_method = "domain_filter"
        elif req.strategy == "heuristic":
            jobs = parse_job_listings_heuristic(markdown)
            extraction_method = "heuristic"
        elif req.strategy == "llm":
            jobs = await parse_job_listings_llm(markdown)
            extraction_method = "llm"
        else:
            return QueryCompanyResponse(
                success=False,
                jobs=[],
                error=f"Unknown strategy: {req.strategy}",
                extraction_method=None,
                strategy=req.strategy,
            )

        return QueryCompanyResponse(
            success=True,
            jobs=jobs,
            error=None,
            extraction_method=extraction_method,
            strategy=req.strategy,
        )

    except httpx.TimeoutException:
        return QueryCompanyResponse(
            success=False,
            jobs=[],
            error="Crawl timeout after 60s",
            extraction_method=None,
            strategy=req.strategy,
        )
    except Exception as e:
        return QueryCompanyResponse(
            success=False,
            jobs=[],
            error=f"Error: {e!s}",
            extraction_method=None,
            strategy=req.strategy,
        )


@router.post("/extract-job", response_model=ExtractJobResponse)
async def extract_job(req: ExtractJobRequest) -> ExtractJobResponse:
    """Extract structured data from a job posting using selected strategy."""
    try:
        result = await crawl_page(req.job_url)

        if not result.get("success"):
            return ExtractJobResponse(
                success=False,
                job={},
                error="Failed to crawl job posting",
                extraction_method=None,
                confidence="low",
                strategy=req.strategy,
            )

        markdown = result.get("markdown", "")
        if not markdown:
            return ExtractJobResponse(
                success=False,
                job={},
                error="No content extracted from job posting",
                extraction_method=None,
                confidence="low",
                strategy=req.strategy,
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
            return ExtractJobResponse(
                success=False,
                job={},
                error=f"Unknown strategy: {req.strategy}",
                extraction_method=None,
                confidence="low",
                strategy=req.strategy,
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

        return ExtractJobResponse(
            success=True,
            job=job_data,
            error=None,
            extraction_method=extraction_method,
            confidence=confidence,
            strategy=req.strategy,
        )

    except httpx.TimeoutException:
        return ExtractJobResponse(
            success=False,
            job={},
            error="Crawl timeout after 60s",
            extraction_method=None,
            confidence="low",
            strategy=req.strategy,
        )
    except Exception as e:
        return ExtractJobResponse(
            success=False,
            job={},
            error=f"Error: {e!s}",
            extraction_method=None,
            confidence="low",
            strategy=req.strategy,
        )


@router.get("/state")
async def get_poc_state() -> dict:
    """Load POC form state from app_data/poc_state.json."""
    if POC_STATE_PATH.exists():
        with open(POC_STATE_PATH) as f:
            return json.load(f)
    return {}


@router.post("/state")
async def save_poc_state(state: POCStateRequest) -> dict:
    """Save POC form state to app_data/poc_state.json."""
    POC_STATE_PATH.parent.mkdir(parents=True, exist_ok=True)

    state_dict = state.model_dump()
    with open(POC_STATE_PATH, "w") as f:
        json.dump(state_dict, f, indent=2)

    return {"success": True}
