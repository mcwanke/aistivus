"""
workers.py
──────────
Async worker functions and registry. Workers are long-running tasks executed
in the background without blocking the UI (e.g., CLI evaluation, org scrapes).

Each worker is an async function registered in the WORKERS dict below.
Workers are executed by the background executor thread in main.py.
"""

import hashlib
import json
import re
from pathlib import Path

import database
import llm_client
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
            with open(config_path) as f:  # noqa: ASYNC230
                config = yaml.safe_load(f) or {}

        jobsearch_sections_1_5 = ""
        jobsearch_path = config.get("evaluation", {}).get("jobsearch_md_path") or "./user_data/my_data/jobsearch.md"
        try:
            with open(jobsearch_path) as f:  # noqa: ASYNC230
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

        # Get external default model
        external_model = database.get_external_default_model()
        if not external_model:
            raise ValueError("No external default model configured")
        model_name = external_model["model"]

        # Call Claude CLI via llm_client
        call_result = await llm_client.complete(
            prompt=prompt,
            system="",
            model=model_name,
            provider="claude_cli",
            timeout=300.0,
        )

        logger.info(f"[Worker eval_external_cli] LLM call completed for job {job_id} (latency: {call_result.get('latency_ms')}ms)")

        if not call_result["success"]:
            raise RuntimeError(f"Claude CLI failed: {call_result.get('error')}")

        # Log to llm_call_log
        llm_model_id = external_model["id"]

        call_log_id = database.insert_llm_call_log(
            llm_model_id=llm_model_id,
            call_type="evaluation_external_cli",
            raw_response=call_result["content"],
            prompt_tokens_actual=call_result.get("prompt_tokens_actual"),
            completion_tokens_actual=call_result.get("completion_tokens_actual"),
            total_tokens_actual=call_result.get("total_tokens_actual"),
            latency_ms=call_result.get("latency_ms"),
            call_time=(call_result.get("latency_ms") or 0) // 1000,
            success=1 if call_result["success"] else 0,
            error_message=call_result.get("error"),
            job_id=job_id,
            prompt_usage_id=prompt_result["prompt_usage_id"],
        )
        logger.info(f"[Worker eval_external_cli] Logged LLM call {call_log_id} for job {job_id}")

        # Extract JSON from response (handle optional markers for backward compatibility)
        output = call_result["content"]

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

            # Recalculate all job aggregate scores (role_fit, scope_fit, culture, comp, overall)
            database._update_job_agg_scores(job_id, conn)

        logger.info(f"[Worker eval_external_cli] Completed composite scores for evaluation {evaluation_id}")

        return {"evaluation_id": evaluation_id, "success": True}

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
    Input: {job_id} OR {org_id}
    Output: {success, research_summary, research_confidence}
    """
    logger = log_module.get_logger("worker.company_research_cli")

    # Determine if this is a job or org worker
    job_id = input_data.get("job_id")
    org_id = input_data.get("org_id")

    if not job_id and not org_id:
        raise ValueError("Input must contain either job_id or org_id")

    is_org = org_id is not None
    entity_id = org_id if is_org else job_id
    entity_type = "org" if is_org else "job"

    try:
        # Fetch entity (job or org) and extract details
        if is_org:
            org = database.get_org(org_id)
            if not org:
                raise ValueError(f"Org {org_id} not found")
            org_dict = dict(org)
            company_name = org_dict.get("name") or "N/A"
            title = ""
            description = ""
        else:
            job = database.get_job(job_id)
            if not job:
                raise ValueError(f"Job {job_id} not found")
            job_dict = dict(job)
            company_name = job_dict.get("company_name") or "N/A"
            title = job_dict.get("title") or "N/A"
            description = job_dict.get("description_merged") or ""

        # Generate research prompt
        prompt_result = prompt_generation.get_prompt(
            "gen_research",
            {
                "company_name": company_name,
                "title": title,
                "jd_text": description,
                "website_url": "N/A",
            },
            job_id=job_id if not is_org else None,
            source="company_research",
        )
        prompt = prompt_result["prompt_text"]
        logger.info(f"[Worker company_research_cli] Generated prompt for {entity_type} {entity_id} ({len(prompt)} chars)")

        # Get external default model
        external_model = database.get_external_default_model()
        if not external_model:
            raise ValueError("No external default model configured")
        model_name = external_model["model"]

        # Call Claude CLI via llm_client
        call_result = await llm_client.complete(
            prompt=prompt,
            system="",
            model=model_name,
            provider="claude_cli",
            timeout=300.0,
        )

        logger.info(f"[Worker company_research_cli] LLM call completed for {entity_type} {entity_id} (latency: {call_result.get('latency_ms')}ms)")

        if not call_result["success"]:
            raise RuntimeError(f"Claude CLI failed: {call_result.get('error')}")

        # Log to llm_call_log
        llm_model_id = external_model["id"]

        call_log_id = database.insert_llm_call_log(
            llm_model_id=llm_model_id,
            call_type="research_cli",
            raw_response=call_result["content"],
            prompt_tokens_actual=call_result.get("prompt_tokens_actual"),
            completion_tokens_actual=call_result.get("completion_tokens_actual"),
            total_tokens_actual=call_result.get("total_tokens_actual"),
            latency_ms=call_result.get("latency_ms"),
            call_time=(call_result.get("latency_ms") or 0) // 1000,
            success=1 if call_result["success"] else 0,
            error_message=call_result.get("error"),
            job_id=job_id if not is_org else None,
            prompt_usage_id=prompt_result["prompt_usage_id"],
        )
        logger.info(f"[Worker company_research_cli] Logged LLM call {call_log_id} for {entity_type} {entity_id}")

        # Extract JSON from response (try markers first, then fallback to braces)
        output = call_result["content"]
        json_str = None

        # Try to extract from RESEARCH_JSON_START/END markers
        start_marker = "RESEARCH_JSON_START"
        end_marker = "RESEARCH_JSON_END"
        start_idx = output.find(start_marker)
        end_idx = output.find(end_marker)

        if start_idx != -1 and end_idx != -1 and start_idx < end_idx:
            # Extract content between markers
            marker_content = output[start_idx + len(start_marker) : end_idx].strip()
            # Remove code fence backticks if present
            marker_content = marker_content.replace("```json", "").replace("```", "").strip()
            # Find JSON in the cleaned content
            json_brace_start = marker_content.find('{')
            json_brace_end = marker_content.rfind('}')
            if json_brace_start != -1 and json_brace_end != -1 and json_brace_start < json_brace_end:
                json_str = marker_content[json_brace_start : json_brace_end + 1].strip()

        # Fallback: look for JSON braces directly
        if not json_str:
            json_start = output.find('{')
            json_end = output.rfind('}')
            if json_start != -1 and json_end != -1 and json_start < json_end:
                json_str = output[json_start : json_end + 1].strip()

        if not json_str:
            raise ValueError(f"No JSON found in CLI response. Raw output:\n\n{output}")

        try:
            research_json = json.loads(json_str)
        except json.JSONDecodeError as e:
            raise ValueError(f"CLI returned malformed JSON: {e}\n\nRaw output:\n\n{output}")

        logger.info(f"[Worker company_research_cli] Parsed JSON for job {job_id}")

        # Validate required fields
        research_summary = research_json.get("research_summary")
        research_confidence = research_json.get("research_confidence")
        if not research_summary or not research_confidence:
            raise ValueError("Missing required fields: research_summary or research_confidence")

        def _as_json(val) -> str | None:
            if val is None:
                return None
            return json.dumps(val) if isinstance(val, (dict, list)) else str(val)

        # Import directly to database
        record_id = database.insert_job_research(
            job_id=job_id if not is_org else None,
            org_id=org_id if is_org else None,
            raw_json=json.dumps(research_json),
            research_summary=research_summary,
            company_overview=research_json.get("company_overview"),
            company_stage=research_json.get("company_stage"),
            company_size_actual=research_json.get("company_size_actual"),
            company_trajectory=research_json.get("company_trajectory"),
            company_culture_overview=research_json.get("company_culture_overview"),
            culture_signals=_as_json(research_json.get("culture_signals")),
            comp_signals=_as_json(research_json.get("comp_signals")),
            role_context=_as_json(research_json.get("role_context")),
            interview_process=research_json.get("interview_process"),
            red_flags=_as_json(research_json.get("red_flags")),
            green_flags=_as_json(research_json.get("green_flags")),
            research_confidence=research_confidence,
            research_notes=research_json.get("research_notes"),
        )

        logger.info(f"[Worker company_research_cli] Imported research {record_id} for {entity_type} {entity_id}")

        return {
            "success": True,
            "research_summary": research_summary,
            "research_confidence": research_confidence,
        }

    except json.JSONDecodeError as e:
        logger.error(f"[Worker company_research_cli] JSON parse error: {e}")
        raise ValueError(f"CLI returned malformed JSON: {e}") from e
    except Exception as e:
        logger.error(f"[Worker company_research_cli] Failed for {entity_type} {entity_id}: {e}")
        raise


# ─────────────────────────────────────────────────────────────
# org_research — Run org research via Claude CLI or API
# ─────────────────────────────────────────────────────────────


async def org_research_handler(input_data: dict) -> dict:
    """
    Run org research via Claude CLI or API (provider-agnostic).
    Input: {org_id, provider: "cli" | "api" | None (uses default)}
    Output: {success, research_summary, research_confidence}
    """
    logger = log_module.get_logger("worker.org_research")

    org_id = input_data.get("org_id")
    if not org_id:
        raise ValueError("Input must contain org_id")

    provider = input_data.get("provider")  # Optional: "cli", "api", or None for default

    try:
        # Fetch org
        org = database.get_org(org_id)
        if not org:
            raise ValueError(f"Org {org_id} not found")
        org_dict = dict(org)
        company_name = org_dict.get("name") or "N/A"
        website_url = org_dict.get("url") or "N/A"

        # Generate org research prompt
        prompt_result = prompt_generation.get_prompt(
            "gen_org_research",
            {
                "company_name": company_name,
                "website_url": website_url,
            },
            source="org_research",
        )
        prompt = prompt_result["prompt_text"]
        logger.info(f"[Worker org_research] Generated prompt for org {org_id} ({len(prompt)} chars)")

        # Determine provider: explicit, or default to CLI
        if not provider:
            provider = "claude_cli"  # Default to CLI
        elif provider not in ("cli", "api"):
            raise ValueError(f"Invalid provider: {provider}. Must be 'cli', 'api', or None.")

        # Map provider name to llm_client provider format
        provider_map = {"cli": "claude_cli", "api": "anthropic"}
        llm_provider = provider_map.get(provider, "claude_cli")

        # Get the appropriate model based on provider
        if llm_provider == "claude_cli":
            # CLI: use external default model (Claude via CLI)
            model_config = database.get_external_default_model()
            if not model_config:
                raise ValueError("No external default model configured")
            model_name = model_config["model"]
        else:
            # API: use default model from llm_models
            model_config = database.get_default_model()
            if not model_config:
                raise ValueError("No default model configured")
            model_name = model_config["model"]

        # Call LLM via specified provider
        call_result = await llm_client.complete(
            prompt=prompt,
            system="",
            model=model_name,
            provider=llm_provider,
            timeout=300.0,
        )

        logger.info(f"[Worker org_research] LLM call completed for org {org_id} (latency: {call_result.get('latency_ms')}ms)")

        if not call_result["success"]:
            raise RuntimeError(f"LLM call failed: {call_result.get('error')}")

        raw_response = call_result.get("content", "")

        # Log to llm_call_log
        llm_model_id = model_config["id"]
        call_log_id = database.insert_llm_call_log(
            llm_model_id=llm_model_id,
            call_type="org_research",
            raw_response=raw_response,
            prompt_tokens_actual=call_result.get("prompt_tokens_actual"),
            completion_tokens_actual=call_result.get("completion_tokens_actual"),
            total_tokens_actual=call_result.get("total_tokens_actual"),
            latency_ms=call_result.get("latency_ms"),
            call_time=(call_result.get("latency_ms") or 0) // 1000,
            success=1 if call_result["success"] else 0,
            error_message=call_result.get("error"),
            prompt_usage_id=prompt_result["prompt_usage_id"],
        )
        logger.info(f"[Worker org_research] Logged LLM call {call_log_id} for org {org_id}")

        # Parse JSON from response
        import re
        json_match = re.search(r"```json\s*(.*?)\s*```", raw_response, re.DOTALL)
        if not json_match:
            raise ValueError("No JSON code block found in LLM response")

        research_json = json.loads(json_match.group(1))

        # Validate required fields
        research_summary = research_json.get("research_summary")
        research_confidence = research_json.get("research_confidence")
        if not research_summary or not research_confidence:
            raise ValueError("Missing required fields: research_summary and research_confidence")

        # Helper to convert dicts/lists to JSON strings
        def _as_json(val) -> str | None:
            if val is None:
                return None
            return json.dumps(val) if isinstance(val, (dict, list)) else str(val)

        # Extract headcount fields
        headcount_obj = research_json.get("headcount", {})
        if isinstance(headcount_obj, dict):
            headcount_size = headcount_obj.get("company_size_actual")
            headcount_growth = headcount_obj.get("headcount_growth")
            layoff_context = headcount_obj.get("layoff_context")
        else:
            headcount_size = headcount_growth = layoff_context = None

        # Insert org research record
        record_id = database.insert_org_research(
            org_id=org_id,
            raw_json=raw_response,
            research_summary=research_summary,
            company_overview=research_json.get("company_overview"),
            company_stage=research_json.get("company_stage"),
            company_trajectory=research_json.get("company_trajectory"),
            company_culture_overview=research_json.get("company_culture_overview"),
            culture_signals=_as_json(research_json.get("culture_signals")),
            market=_as_json(research_json.get("market")),
            financials=_as_json(research_json.get("financials")),
            products=_as_json(research_json.get("products")),
            headcount_size=headcount_size,
            headcount_growth=headcount_growth,
            layoff_context=layoff_context,
            red_flags=_as_json(research_json.get("red_flags")),
            green_flags=_as_json(research_json.get("green_flags")),
            research_confidence=research_confidence,
            research_notes=research_json.get("research_notes"),
        )

        # Insert org info links
        links = research_json.get("notable_links", [])
        if isinstance(links, list):
            for link in links:
                if isinstance(link, dict):
                    database.insert_org_info_link(
                        org_id=org_id,
                        url=link.get("url", ""),
                        title=link.get("title"),
                        summary=link.get("summary"),
                    )

        # Insert org info people
        people = research_json.get("notable_people", [])
        if isinstance(people, list):
            for person in people:
                if isinstance(person, dict):
                    database.insert_org_info_person(
                        org_id=org_id,
                        name=person.get("name", ""),
                        title=person.get("title"),
                        url=person.get("url"),
                        summary=person.get("summary"),
                    )

        logger.info(f"[Worker org_research] Imported research {record_id} for org {org_id}")

        return {
            "success": True,
            "research_summary": research_summary,
            "research_confidence": research_confidence,
        }

    except json.JSONDecodeError as e:
        logger.error(f"[Worker org_research] JSON parse error: {e}")
        raise ValueError(f"LLM returned malformed JSON: {e}") from e
    except Exception as e:
        logger.error(f"[Worker org_research] Failed for org {org_id}: {e}")
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
    "org_research": {
        "handler": org_research_handler,
        "entity_type": "org",
    },
    # Future workers will be registered here:
    # "org_scrape": {...},
    # "eval_role": {...},
    # etc.
}
