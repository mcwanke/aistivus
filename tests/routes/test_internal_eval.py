"""
tests/routes/test_internal_eval.py
Integration tests for the internal eval SSE endpoint.

Route covered:
  POST /api/v1/jobs/{job_id}/eval/internal

No live network calls — llm_client.complete and prompt_generation.get_prompt
are mocked throughout.
"""

import json
from unittest.mock import AsyncMock, patch

import database


# ─── Shared LLM mock responses ────────────────────────────────────────────────

_ANALYSIS = {
    "domain_match": "backend engineering",
    "role_type_match": "IC",
    "key_requirements": ["Python", "distributed systems"],
}

_SCREENABILITY = {
    "score_ats": 3,
    "score_recruiter_fast": 3,
    "score_recruiter_deep": 3,
    "score_reasons_screenability": {
        "ats": "Matches keywords",
        "recruiter_fast": "Clear title",
        "recruiter_deep": "Solid experience",
    },
}

_FIT = {
    "score_role_fit": 4,
    "score_scope_fit": 4,
    "score_culture": 4,
    "score_candidate_role": 4,
    "score_candidate_scope": 4,
    "score_candidate_culture": 4,
    "research_confidence": "high",
    "score_reasons_fit": {
        "role_fit": "Strong alignment",
        "scope_fit": "Appropriate scope",
        "culture": "Culture match",
        "candidate_role": "Motivated",
        "candidate_scope": "Right level",
        "candidate_culture": "Values align",
    },
}

_SYNTHESIS = {
    "fit_type": "Core Fit",
    "archetype": "People Leader",
    "strengths": "Platform expertise",
    "gaps": "Minimal gaps",
    "recommendation": "Apply",
    "keywords": "python, kubernetes",
    "keyword_gaps": "terraform",
    "interview_prep_notes": "Prepare leadership examples",
}

def _llm_ok(content: dict) -> dict:
    return {
        "success": True,
        "content": json.dumps(content),
        "error": None,
        "model": "test-model",
        "provider": "ollama",
        "latency_ms": 800,
        "prompt_tokens_actual": 100,
        "completion_tokens_actual": 150,
        "total_tokens_actual": 250,
    }

def _llm_fail(message: str = "Network error") -> dict:
    return {
        "success": False,
        "content": "",
        "error": message,
        "model": "test-model",
        "provider": "ollama",
        "latency_ms": 0,
        "prompt_tokens_actual": 0,
        "completion_tokens_actual": 0,
        "total_tokens_actual": 0,
    }

_PROMPT_STUB = {
    "prompt_text": "Evaluate this role.",
    "temperature": 0.0,
    "prompt_usage_id": 1,
}


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _parse_sse(text: str) -> list[dict]:
    """Extract all SSE data payloads from a buffered stream response."""
    events = []
    for line in text.splitlines():
        if line.startswith("data: "):
            events.append(json.loads(line[6:]))
    return events


def _four_step_mock():
    """AsyncMock returning the 4-step happy-path LLM sequence."""
    return AsyncMock(side_effect=[
        _llm_ok(_ANALYSIS),
        _llm_ok(_SCREENABILITY),
        _llm_ok(_FIT),
        _llm_ok(_SYNTHESIS),
    ])


# ─── Tests ────────────────────────────────────────────────────────────────────

class TestInternalEvalSSE:

    def test_emits_events_in_correct_order(self, seeded_client, jobsearch_file):
        job_id = seeded_client["job_id"]
        model_id = seeded_client["model_id"]

        with patch("llm_client.complete", new=_four_step_mock()), \
             patch("prompt_generation.get_prompt", return_value=_PROMPT_STUB):
            resp = seeded_client["client"].post(
                f"/api/v1/jobs/{job_id}/eval/internal",
                json={"llm_model_id": model_id},
            )

        assert resp.status_code == 200
        events = _parse_sse(resp.text)
        event_types = [e["event"] for e in events]

        # All 4 step_start events present in order
        step_starts = [e for e in events if e["event"] == "step_start"]
        assert [e["step"] for e in step_starts] == [1, 2, 3, 4]

        # All 4 step_complete events present
        step_completes = [e for e in events if e["event"] == "step_complete"]
        assert [e["step"] for e in step_completes] == [1, 2, 3, 4]

        # done is the final event
        assert event_types[-1] == "done"
        assert "error" not in event_types

    def test_done_event_contains_eval_id(self, seeded_client, jobsearch_file):
        job_id = seeded_client["job_id"]
        model_id = seeded_client["model_id"]

        with patch("llm_client.complete", new=_four_step_mock()), \
             patch("prompt_generation.get_prompt", return_value=_PROMPT_STUB):
            resp = seeded_client["client"].post(
                f"/api/v1/jobs/{job_id}/eval/internal",
                json={"llm_model_id": model_id},
            )

        events = _parse_sse(resp.text)
        done_events = [e for e in events if e["event"] == "done"]
        assert len(done_events) == 1
        assert "eval_id" in done_events[0]
        assert isinstance(done_events[0]["eval_id"], int)
        assert done_events[0]["eval_id"] > 0

    def test_error_emitted_when_step1_llm_fails(self, seeded_client, jobsearch_file):
        job_id = seeded_client["job_id"]
        model_id = seeded_client["model_id"]

        with patch("llm_client.complete", new=AsyncMock(return_value=_llm_fail("step1 failed"))), \
             patch("prompt_generation.get_prompt", return_value=_PROMPT_STUB):
            resp = seeded_client["client"].post(
                f"/api/v1/jobs/{job_id}/eval/internal",
                json={"llm_model_id": model_id},
            )

        events = _parse_sse(resp.text)
        error_events = [e for e in events if e["event"] == "error"]
        assert len(error_events) == 1
        assert error_events[0]["step"] == 1
        assert "step1 failed" in error_events[0]["message"]

        # No done event when step 1 fails
        assert not any(e["event"] == "done" for e in events)

    def test_error_emitted_when_step2_llm_fails(self, seeded_client, jobsearch_file):
        job_id = seeded_client["job_id"]
        model_id = seeded_client["model_id"]

        mock = AsyncMock(side_effect=[
            _llm_ok(_ANALYSIS),
            _llm_fail("step2 failed"),
        ])
        with patch("llm_client.complete", new=mock), \
             patch("prompt_generation.get_prompt", return_value=_PROMPT_STUB):
            resp = seeded_client["client"].post(
                f"/api/v1/jobs/{job_id}/eval/internal",
                json={"llm_model_id": model_id},
            )

        events = _parse_sse(resp.text)
        error_events = [e for e in events if e["event"] == "error"]
        assert len(error_events) == 1
        assert error_events[0]["step"] == 2
        assert not any(e["event"] == "done" for e in events)

    def test_assembled_eval_has_all_9_dim_fields(self, seeded_client, jobsearch_file):
        job_id = seeded_client["job_id"]
        model_id = seeded_client["model_id"]

        with patch("llm_client.complete", new=_four_step_mock()), \
             patch("prompt_generation.get_prompt", return_value=_PROMPT_STUB):
            resp = seeded_client["client"].post(
                f"/api/v1/jobs/{job_id}/eval/internal",
                json={"llm_model_id": model_id},
            )

        events = _parse_sse(resp.text)
        done = next(e for e in events if e["event"] == "done")
        eval_id = done["eval_id"]

        eval_row = database.get_evaluation(eval_id)
        assert eval_row is not None
        row = dict(eval_row)

        nine_dims = [
            "score_ats", "score_recruiter_fast", "score_recruiter_deep",
            "score_role_fit", "score_scope_fit", "score_culture",
            "score_candidate_role", "score_candidate_scope", "score_candidate_culture",
        ]
        for dim in nine_dims:
            assert row[dim] is not None, f"{dim} should not be NULL"

    def test_score_overall_computed_in_written_record(self, seeded_client, jobsearch_file):
        job_id = seeded_client["job_id"]
        model_id = seeded_client["model_id"]

        with patch("llm_client.complete", new=_four_step_mock()), \
             patch("prompt_generation.get_prompt", return_value=_PROMPT_STUB):
            resp = seeded_client["client"].post(
                f"/api/v1/jobs/{job_id}/eval/internal",
                json={"llm_model_id": model_id},
            )

        events = _parse_sse(resp.text)
        done = next(e for e in events if e["event"] == "done")
        eval_row = database.get_evaluation(done["eval_id"])
        row = dict(eval_row)

        assert row["score_overall"] is not None
        assert row["composite_screenability"] is not None
        assert row["composite_company_fit"] is not None
        assert row["composite_candidate_fit"] is not None

    def test_score_reasons_merged_from_steps_2_and_3(self, seeded_client, jobsearch_file):
        job_id = seeded_client["job_id"]
        model_id = seeded_client["model_id"]

        with patch("llm_client.complete", new=_four_step_mock()), \
             patch("prompt_generation.get_prompt", return_value=_PROMPT_STUB):
            resp = seeded_client["client"].post(
                f"/api/v1/jobs/{job_id}/eval/internal",
                json={"llm_model_id": model_id},
            )

        events = _parse_sse(resp.text)
        done = next(e for e in events if e["event"] == "done")
        eval_row = database.get_evaluation(done["eval_id"])
        row = dict(eval_row)

        assert row["score_reasons"] is not None
        reasons = json.loads(row["score_reasons"])
        # Keys from step 2 screenability
        assert "ats" in reasons
        # Keys from step 3 fit
        assert "role_fit" in reasons

    def test_step3_parse_failure_still_writes_eval(self, seeded_client, jobsearch_file):
        """Step 3 parse failure is non-fatal — writes eval with fit scores NULL."""
        job_id = seeded_client["job_id"]
        model_id = seeded_client["model_id"]

        mock = AsyncMock(side_effect=[
            _llm_ok(_ANALYSIS),
            _llm_ok(_SCREENABILITY),
            {**_llm_ok({}), "content": "not valid json {{"},
            _llm_ok(_SYNTHESIS),
        ])
        with patch("llm_client.complete", new=mock), \
             patch("prompt_generation.get_prompt", return_value=_PROMPT_STUB):
            resp = seeded_client["client"].post(
                f"/api/v1/jobs/{job_id}/eval/internal",
                json={"llm_model_id": model_id},
            )

        events = _parse_sse(resp.text)
        # done still emitted
        assert any(e["event"] == "done" for e in events)
        done = next(e for e in events if e["event"] == "done")
        eval_row = database.get_evaluation(done["eval_id"])
        row = dict(eval_row)
        # screenability scores present, fit scores NULL
        assert row["score_ats"] == 3
        assert row["score_role_fit"] is None

    def test_404_for_unknown_job(self, seeded_client, jobsearch_file):
        with patch("prompt_generation.get_prompt", return_value=_PROMPT_STUB):
            resp = seeded_client["client"].post(
                "/api/v1/jobs/99999/eval/internal",
                json={"llm_model_id": seeded_client["model_id"]},
            )

        events = _parse_sse(resp.text)
        error_events = [e for e in events if e["event"] == "error"]
        assert len(error_events) == 1
        assert "99999" in error_events[0]["message"]

    def test_error_when_no_default_model(self, client, jobsearch_file):
        """Without any model in DB, the endpoint emits an error event."""
        job_id, _ = database.upsert_job(
            "Jobless Corp", "Engineer", "backend",
            description_merged="We need an engineer.",
        )
        resp = client.post(
            f"/api/v1/jobs/{job_id}/eval/internal",
            json={"llm_model_id": None},
        )
        events = _parse_sse(resp.text)
        assert any(e["event"] == "error" for e in events)

    def test_uses_default_model_when_none_specified(self, seeded_client, jobsearch_file):
        """Passing llm_model_id: null uses the default model."""
        job_id = seeded_client["job_id"]

        with patch("llm_client.complete", new=_four_step_mock()), \
             patch("prompt_generation.get_prompt", return_value=_PROMPT_STUB):
            resp = seeded_client["client"].post(
                f"/api/v1/jobs/{job_id}/eval/internal",
                json={"llm_model_id": None},
            )

        events = _parse_sse(resp.text)
        assert any(e["event"] == "done" for e in events)
