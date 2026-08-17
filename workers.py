"""
workers.py
──────────
Async worker functions and registry. Workers are long-running tasks executed
in the background without blocking the UI (e.g., CLI evaluation, org scrapes).

Each worker is an async function registered in the WORKERS dict below.
Workers are executed by the background executor thread in main.py.
"""

import json
import subprocess
from pathlib import Path

import database
import logger as log_module
import prompt_generation

# ─────────────────────────────────────────────────────────────
# eval_external_cli — Run evaluation via Claude Code CLI
# ─────────────────────────────────────────────────────────────


async def eval_external_cli_handler(input_data: dict) -> dict:
    """
    Run evaluation via Claude Code CLI subprocess (claude -p).
    Input: {job_id, application_id, ai_backend_mode}
    Output: {evaluation_id, success}
    """
    logger = log_module.get_logger("worker.eval_external_cli")
    job_id = input_data["job_id"]
    application_id = input_data["application_id"]

    try:
        # Fetch job and application
        job = database.get_job(job_id)
        if not job:
            raise ValueError(f"Job {job_id} not found")

        app = database.get_application(application_id)
        if not app:
            raise ValueError(f"Application {application_id} not found")

        job_dict = dict(job)

        # Extract job details
        company_name = job_dict.get("company_name") or "N/A"
        title = job_dict.get("title") or "N/A"
        location = job_dict.get("location") or "N/A"
        pay_band = job_dict.get("pay_band") or "Not listed"
        jd_text = job_dict.get("description_merged") or ""

        # Get research context
        research = database.get_job_research_latest(job_id)
        research_context = research["raw_json"] if research and research.get("raw_json") else "null"

        # Load config and extract jobsearch sections
        import yaml
        config_path = Path("user_data/config.yaml")
        config = {}
        if config_path.exists():
            with open(config_path) as f:
                config = yaml.safe_load(f) or {}

        jobsearch_sections_1_5 = ""
        jobsearch_path = config.get("evaluation", {}).get("jobsearch_md_path") or "./user_data/my_data/jobsearch.md"
        try:
            with open(jobsearch_path) as f:
                jobsearch_full = f.read()
            sections_end_marker = "## 6."
            end_idx = jobsearch_full.find(sections_end_marker)
            if end_idx != -1:
                jobsearch_sections_1_5 = jobsearch_full[:end_idx].rstrip()
            else:
                jobsearch_sections_1_5 = jobsearch_full
        except (OSError, FileNotFoundError):
            logger.warning(f"[Worker eval_external_cli] jobsearch.md not found at {jobsearch_path}")
            jobsearch_sections_1_5 = "[jobsearch.md not found]"

        # Generate prompt
        prompt_result = prompt_generation.get_prompt(
            "eval_external_cli",
            {
                "company_name": company_name,
                "title": title,
                "location": location,
                "pay_band": pay_band,
                "jd_text": jd_text,
                "research_context": research_context,
                "jobsearch_sections_1_5": jobsearch_sections_1_5,
            },
            job_id=job_id,
            source="external_eval",
        )
        prompt = prompt_result["prompt_text"]
        logger.info(f"[Worker eval_external_cli] Generated prompt for job {job_id} ({len(prompt)} chars)")

        # Run subprocess with 300s timeout
        try:
            result = subprocess.run(
                ["claude", "-p", prompt],
                capture_output=True,
                text=True,
                timeout=300,
            )
        except subprocess.TimeoutExpired:
            raise RuntimeError("Claude CLI subprocess timed out (300s)")

        if result.returncode != 0:
            raise RuntimeError(f"Claude CLI exited with code {result.returncode}: {result.stderr}")

        logger.info(f"[Worker eval_external_cli] CLI returned successfully for job {job_id}")

        # Extract JSON from response (handle optional markers for backward compatibility)
        output = result.stdout

        # Try to strip old markers if present
        start_marker = "EVALUATION_JSON_START"
        end_marker = "EVALUATION_JSON_END"
        start_idx = output.find(start_marker)
        end_idx = output.find(end_marker)

        if start_idx != -1 and end_idx != -1:
            # Old-style markers present, use them
            json_str = output[start_idx + len(start_marker) : end_idx].strip()
        else:
            # New-style: just look for JSON object (first { to last })
            json_start = output.find('{')
            json_end = output.rfind('}')
            if json_start == -1 or json_end == -1 or json_start > json_end:
                raise ValueError("No JSON found in CLI response")
            json_str = output[json_start : json_end + 1].strip()

        eval_json = json.loads(json_str)

        logger.info(f"[Worker eval_external_cli] Parsed JSON for job {job_id}")

        # Import evaluation via existing logic
        # Find external default model
        external_model = database.get_external_default_model()
        if not external_model:
            raise ValueError("No external default model configured")

        llm_model_id = external_model["id"]

        # Convert dict fields to JSON strings for database insertion
        if isinstance(eval_json.get("score_reasons"), dict):
            eval_json["score_reasons"] = json.dumps(eval_json["score_reasons"])
        if isinstance(eval_json.get("analysis_json"), dict):
            eval_json["analysis_json"] = json.dumps(eval_json["analysis_json"])

        # Insert evaluation
        evaluation_id = database.insert_evaluation(
            job_id=job_id,
            llm_model_id=llm_model_id,
            **eval_json,
        )

        logger.info(f"[Worker eval_external_cli] Inserted evaluation {evaluation_id} for job {job_id}")

        # Compute and update composite scores
        with database.get_connection() as conn:
            weights = database.get_eval_weights(conn)
            composites = database.compute_eval_composites(eval_json, weights)
            conn.execute(
                """UPDATE evaluations
                   SET composite_screenability = ?,
                       composite_company_fit = ?,
                       composite_candidate_fit = ?,
                       score_overall = ?
                   WHERE id = ?""",
                (
                    composites["composite_screenability"],
                    composites["composite_company_fit"],
                    composites["composite_candidate_fit"],
                    composites["score_overall"],
                    evaluation_id,
                ),
            )

        logger.info(f"[Worker eval_external_cli] Completed composite scores for evaluation {evaluation_id}")

        return {"evaluation_id": evaluation_id, "success": True}

    except subprocess.TimeoutExpired as e:
        logger.error(f"[Worker eval_external_cli] Timeout: {e}")
        raise RuntimeError("Evaluation generation timed out (60s)") from e
    except json.JSONDecodeError as e:
        logger.error(f"[Worker eval_external_cli] JSON parse error: {e}")
        raise ValueError(f"CLI returned malformed JSON: {e}") from e
    except Exception as e:
        logger.error(f"[Worker eval_external_cli] Failed for job {job_id}: {e}")
        raise


# ─────────────────────────────────────────────────────────────
# company_research_cli — Run company research via Claude Code CLI
# ─────────────────────────────────────────────────────────────


async def company_research_cli_handler(input_data: dict) -> dict:
    """
    Run company research via Claude Code CLI subprocess (claude -p).
    Input: {job_id}
    Output: {success, research_summary, research_confidence}
    """
    logger = log_module.get_logger("worker.company_research_cli")
    job_id = input_data["job_id"]

    try:
        # Fetch job
        job = database.get_job(job_id)
        if not job:
            raise ValueError(f"Job {job_id} not found")

        job_dict = dict(job)

        # Extract job details for context
        company_name = job_dict.get("company_name") or "N/A"
        title = job_dict.get("title") or "N/A"
        description = job_dict.get("description_merged") or ""

        # Generate research prompt
        prompt_result = prompt_generation.get_prompt(
            "job_research",
            {
                "company_name": company_name,
                "title": title,
                "job_description": description,
            },
            job_id=job_id,
            source="company_research",
        )
        prompt = prompt_result["prompt_text"]
        logger.info(f"[Worker company_research_cli] Generated prompt for job {job_id} ({len(prompt)} chars)")

        # Run subprocess with 300s timeout
        try:
            result = subprocess.run(
                ["claude", "-p", prompt],
                capture_output=True,
                text=True,
                timeout=300,
            )
        except subprocess.TimeoutExpired:
            raise RuntimeError("Claude CLI subprocess timed out (300s)")

        if result.returncode != 0:
            raise RuntimeError(f"Claude CLI exited with code {result.returncode}: {result.stderr}")

        logger.info(f"[Worker company_research_cli] CLI returned successfully for job {job_id}")

        # Extract JSON from response
        output = result.stdout
        json_start = output.find('{')
        json_end = output.rfind('}')
        if json_start == -1 or json_end == -1 or json_start > json_end:
            raise ValueError("No JSON found in CLI response")
        json_str = output[json_start : json_end + 1].strip()

        research_json = json.loads(json_str)
        logger.info(f"[Worker company_research_cli] Parsed JSON for job {job_id}")

        # Validate required fields
        if not research_json.get("research_summary") or not research_json.get("research_confidence"):
            raise ValueError("Missing required fields: research_summary or research_confidence")

        # Import via HTTP call to internal endpoint
        import httpx
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"http://127.0.0.1:8000/api/v1/jobs/{job_id}/research",
                json={"raw_json": json.dumps(research_json)},
                timeout=30,
            )
            if response.status_code not in (200, 201):
                raise RuntimeError(
                    f"Failed to import research: {response.status_code} {response.text}"
                )

        logger.info(f"[Worker company_research_cli] Imported research for job {job_id}")

        return {
            "success": True,
            "research_summary": research_json.get("research_summary"),
            "research_confidence": research_json.get("research_confidence"),
        }

    except subprocess.TimeoutExpired as e:
        logger.error(f"[Worker company_research_cli] Timeout: {e}")
        raise RuntimeError("Research generation timed out (300s)") from e
    except json.JSONDecodeError as e:
        logger.error(f"[Worker company_research_cli] JSON parse error: {e}")
        raise ValueError(f"CLI returned malformed JSON: {e}") from e
    except Exception as e:
        logger.error(f"[Worker company_research_cli] Failed for job {job_id}: {e}")
        raise


# ─────────────────────────────────────────────────────────────
# Worker Registry
# ─────────────────────────────────────────────────────────────

WORKERS = {
    "eval_external_cli": {
        "handler": eval_external_cli_handler,
        "entity_type": "job",
    },
    "company_research_cli": {
        "handler": company_research_cli_handler,
        "entity_type": "job",
    },
    # Future workers will be registered here:
    # "org_scrape": {...},
    # "eval_role": {...},
    # etc.
}
