"""
tests/routes/test_prompts.py
Integration tests for prompt management and feedback-loop routes.

Routes covered:
  GET  /api/v1/prompts
  GET  /api/v1/prompts/{key}
  POST /api/v1/prompts/{key}/save
  GET  /api/v1/prompts/{key}/preview
  POST /api/v1/prompts/{key}/feedback-loop
"""

from unittest.mock import AsyncMock, patch

import database


_SEGMENTS_TEXT = "[[READONLY]]You are an evaluator.[[/READONLY]][[EDITABLE]] Score the candidate.[[/EDITABLE]]"
_SEGMENTS_TEXT_V2 = "[[READONLY]]You are an expert.[[/READONLY]][[EDITABLE]] Rate the candidate.[[/EDITABLE]]"

# Use a key that does NOT conflict with startup-seeded keys (eval_internal, eval_external)
_TEST_KEY = "test_prompt_key"
_TEST_LABEL = "Test Prompt"

_LLM_SUCCESS = {
    "success": True,
    "content": "Suggestion: improve scoring clarity.",
    "model": "test-model",
    "provider": "ollama",
    "latency_ms": 100,
    "prompt_tokens_actual": 50,
    "completion_tokens_actual": 20,
    "total_tokens_actual": 70,
}

_LLM_FAILURE = {
    "success": False,
    "content": "",
    "error": "connection refused",
    "model": "test-model",
    "provider": "ollama",
    "latency_ms": 0,
    "prompt_tokens_actual": 0,
    "completion_tokens_actual": 0,
    "total_tokens_actual": 0,
}


def _seed_prompt(key: str = _TEST_KEY, label: str = _TEST_LABEL) -> None:
    database.seed_prompt_if_missing(key, label, _SEGMENTS_TEXT)


def _seed_model() -> int:
    server_id = database.create_server("Local", "http://localhost:11434", "ollama")
    return database.insert_llm_model("test-model", server_id, default_flag=1, available=1)


# ─────────────────────────────────────────────────────────────
# GET /api/v1/prompts
# ─────────────────────────────────────────────────────────────

class TestGetPrompts:
    def test_returns_startup_seeded_prompts(self, client):
        # Startup lifespan seeds eval_analysis, eval_scoring, eval_external
        resp = client.get("/api/v1/prompts")
        assert resp.status_code == 200
        keys = [r["prompt_key"] for r in resp.json()]
        assert "eval_analysis" in keys
        assert "eval_scoring" in keys
        assert "eval_external" in keys

    def test_returns_additional_seeded_prompt(self, client):
        _seed_prompt()
        data = client.get("/api/v1/prompts").json()
        keys = [r["prompt_key"] for r in data]
        assert _TEST_KEY in keys

    def test_returns_multiple_distinct_prompts(self, client):
        _seed_prompt(_TEST_KEY, _TEST_LABEL)
        _seed_prompt("test_key_2", "Test Prompt 2")
        data = client.get("/api/v1/prompts").json()
        keys = [r["prompt_key"] for r in data]
        assert _TEST_KEY in keys
        assert "test_key_2" in keys

    def test_only_returns_active_version_per_key(self, client):
        _seed_prompt()
        database.save_prompt(_TEST_KEY, _SEGMENTS_TEXT_V2)
        data = client.get("/api/v1/prompts").json()
        match = next(r for r in data if r["prompt_key"] == _TEST_KEY)
        assert match["version"] == 2

    def test_response_has_required_fields(self, client):
        _seed_prompt()
        data = client.get("/api/v1/prompts").json()
        item = next(r for r in data if r["prompt_key"] == _TEST_KEY)
        assert "prompt_key" in item
        assert "label" in item
        assert "version" in item


# ─────────────────────────────────────────────────────────────
# GET /api/v1/prompts/{key}
# ─────────────────────────────────────────────────────────────

class TestGetPrompt:
    def test_returns_404_for_unknown_key(self, client):
        resp = client.get("/api/v1/prompts/nonexistent_key")
        assert resp.status_code == 404

    def test_returns_active_prompt(self, client):
        _seed_prompt()
        data = client.get(f"/api/v1/prompts/{_TEST_KEY}").json()
        assert data["prompt_key"] == _TEST_KEY
        assert data["version"] == 1
        assert "segments_text" in data

    def test_returns_segments_text(self, client):
        _seed_prompt()
        data = client.get(f"/api/v1/prompts/{_TEST_KEY}").json()
        assert data["segments_text"] == _SEGMENTS_TEXT

    def test_returns_latest_version_after_save(self, client):
        _seed_prompt()
        database.save_prompt(_TEST_KEY, _SEGMENTS_TEXT_V2)
        data = client.get(f"/api/v1/prompts/{_TEST_KEY}").json()
        assert data["version"] == 2
        assert data["segments_text"] == _SEGMENTS_TEXT_V2

    def test_returns_temperature_field(self, client):
        database.seed_prompt_if_missing(_TEST_KEY, _TEST_LABEL, _SEGMENTS_TEXT, temperature=0.4)
        data = client.get(f"/api/v1/prompts/{_TEST_KEY}").json()
        assert "temperature" in data
        assert data["temperature"] == 0.4


# ─────────────────────────────────────────────────────────────
# POST /api/v1/prompts/{key}/save
# ─────────────────────────────────────────────────────────────

class TestSavePrompt:
    def test_returns_404_for_unknown_key(self, client):
        resp = client.post(
            "/api/v1/prompts/nonexistent_key/save",
            json={"segments_text": "new text"},
        )
        assert resp.status_code == 404

    def test_version_increments(self, client):
        _seed_prompt()
        resp = client.post(
            f"/api/v1/prompts/{_TEST_KEY}/save",
            json={"segments_text": _SEGMENTS_TEXT_V2},
        )
        assert resp.status_code == 200
        assert resp.json()["success"] is True
        assert resp.json()["version"] == 2

    def test_saved_text_is_retrievable(self, client):
        _seed_prompt()
        client.post(
            f"/api/v1/prompts/{_TEST_KEY}/save",
            json={"segments_text": _SEGMENTS_TEXT_V2},
        )
        data = client.get(f"/api/v1/prompts/{_TEST_KEY}").json()
        assert data["segments_text"] == _SEGMENTS_TEXT_V2

    def test_note_is_accepted(self, client):
        _seed_prompt()
        resp = client.post(
            f"/api/v1/prompts/{_TEST_KEY}/save",
            json={"segments_text": _SEGMENTS_TEXT_V2, "note": "tightened scoring"},
        )
        assert resp.status_code == 200

    def test_multiple_saves_increment_version(self, client):
        _seed_prompt()
        client.post(f"/api/v1/prompts/{_TEST_KEY}/save", json={"segments_text": "v2"})
        resp = client.post(f"/api/v1/prompts/{_TEST_KEY}/save", json={"segments_text": "v3"})
        assert resp.json()["version"] == 3

    def test_temperature_persists_after_save(self, client):
        _seed_prompt()
        client.post(
            f"/api/v1/prompts/{_TEST_KEY}/save",
            json={"segments_text": _SEGMENTS_TEXT_V2, "temperature": 0.7},
        )
        data = client.get(f"/api/v1/prompts/{_TEST_KEY}").json()
        assert data["temperature"] == 0.7


# ─────────────────────────────────────────────────────────────
# GET /api/v1/prompts/{key}/preview
# ─────────────────────────────────────────────────────────────

class TestPromptPreview:
    def test_returns_404_for_unknown_key(self, client):
        resp = client.get("/api/v1/prompts/nonexistent_key/preview")
        assert resp.status_code == 404

    def test_returns_assembled_text(self, client):
        _seed_prompt()
        data = client.get(f"/api/v1/prompts/{_TEST_KEY}/preview").json()
        assert "preview_text" in data
        # Tags should be stripped
        assert "[[READONLY]]" not in data["preview_text"]
        assert "[[EDITABLE]]" not in data["preview_text"]

    def test_preview_contains_segment_content(self, client):
        _seed_prompt()
        data = client.get(f"/api/v1/prompts/{_TEST_KEY}/preview").json()
        assert "You are an evaluator" in data["preview_text"]
        assert "Score the candidate" in data["preview_text"]

    def test_preview_with_context_substitution(self, client):
        import json
        ctx = json.dumps({"role": "Software Engineer"})
        database.seed_prompt_if_missing(
            "test_ctx",
            "Context Test",
            "[[EDITABLE]]Evaluate the {role} candidate.[[/EDITABLE]]",
            preview_context=ctx,
        )
        data = client.get("/api/v1/prompts/test_ctx/preview").json()
        assert "Software Engineer" in data["preview_text"]
        assert "{role}" not in data["preview_text"]


# ─────────────────────────────────────────────────────────────
# POST /api/v1/prompts/{key}/feedback-loop
# ─────────────────────────────────────────────────────────────

class TestFeedbackLoop:
    def test_returns_no_feedback_when_none_exists(self, client):
        _seed_prompt()
        _seed_model()
        resp = client.post(f"/api/v1/prompts/{_TEST_KEY}/feedback-loop")
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is False
        assert data["reason"] == "no_feedback"

    def test_returns_404_when_prompt_missing_but_feedback_exists(self, client):
        # Feedback exists for a key that has no active prompt row
        usage_id = database.create_prompt_usage(
            prompt_key="ghost_key",
            prompt_version=1,
            prompt_text="orphaned prompt",
            prompt_hash="deadbeef",
            source="eval_internal",
            job_id=None,
        )
        database.update_prompt_feedback(usage_id, agree=1, dimension=None, feedback_text=None)
        resp = client.post("/api/v1/prompts/ghost_key/feedback-loop")
        assert resp.status_code == 404

    def test_returns_503_when_no_model(self, client):
        _seed_prompt()
        usage_id = database.create_prompt_usage(
            prompt_key=_TEST_KEY,
            prompt_version=1,
            prompt_text="test prompt",
            prompt_hash="abc123",
            source="eval_internal",
            job_id=None,
        )
        database.update_prompt_feedback(usage_id, agree=1, dimension=None, feedback_text=None)
        resp = client.post(f"/api/v1/prompts/{_TEST_KEY}/feedback-loop")
        assert resp.status_code == 503

    def test_calls_llm_and_returns_suggestions(self, client):
        _seed_prompt()
        _seed_model()
        usage_id = database.create_prompt_usage(
            prompt_key=_TEST_KEY,
            prompt_version=1,
            prompt_text="test prompt",
            prompt_hash="abc123",
            source="eval_internal",
            job_id=None,
        )
        database.update_prompt_feedback(usage_id, agree=0, dimension="scoring", feedback_text="Too harsh")

        with patch("llm_client.complete", new=AsyncMock(return_value=_LLM_SUCCESS)):
            resp = client.post(f"/api/v1/prompts/{_TEST_KEY}/feedback-loop")

        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["feedback_count"] == 1
        assert "suggestions" in data

    def test_marks_feedback_consumed_after_run(self, client):
        _seed_prompt()
        _seed_model()
        usage_id = database.create_prompt_usage(
            prompt_key=_TEST_KEY,
            prompt_version=1,
            prompt_text="test prompt",
            prompt_hash="abc123",
            source="eval_internal",
            job_id=None,
        )
        database.update_prompt_feedback(usage_id, agree=1, dimension=None, feedback_text=None)

        with patch("llm_client.complete", new=AsyncMock(return_value=_LLM_SUCCESS)):
            client.post(f"/api/v1/prompts/{_TEST_KEY}/feedback-loop")

        remaining = database.get_unprocessed_feedback(_TEST_KEY)
        assert remaining == []

    def test_llm_failure_returns_502(self, client):
        _seed_prompt()
        _seed_model()
        usage_id = database.create_prompt_usage(
            prompt_key=_TEST_KEY,
            prompt_version=1,
            prompt_text="test prompt",
            prompt_hash="abc123",
            source="eval_internal",
            job_id=None,
        )
        database.update_prompt_feedback(usage_id, agree=1, dimension=None, feedback_text=None)

        with patch("llm_client.complete", new=AsyncMock(return_value=_LLM_FAILURE)):
            resp = client.post(f"/api/v1/prompts/{_TEST_KEY}/feedback-loop")

        assert resp.status_code == 502

    def test_feedback_without_agree_not_included(self, client):
        _seed_prompt()
        _seed_model()
        # Create usage with no feedback (agree IS NULL)
        database.create_prompt_usage(
            prompt_key=_TEST_KEY,
            prompt_version=1,
            prompt_text="test prompt",
            prompt_hash="abc123",
            source="eval_internal",
            job_id=None,
        )
        resp = client.post(f"/api/v1/prompts/{_TEST_KEY}/feedback-loop")
        assert resp.status_code == 200
        assert resp.json()["reason"] == "no_feedback"
