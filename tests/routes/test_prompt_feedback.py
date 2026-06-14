"""
tests/routes/test_prompt_feedback.py
Integration tests for the prompt feedback endpoint.

Routes covered:
  POST /api/v1/prompt-feedback
"""


class TestPromptFeedbackEndpoint:
    def test_full_submission_returns_id(self, seeded_client):
        """All non-FK fields populated — record created and id returned."""
        resp = seeded_client["client"].post(
            "/api/v1/prompt-feedback",
            json={
                "prompt_type": "evaluation_internal",
                "agree": 1,
                "dimension": "overall_score",
                "feedback_text": "Score felt accurate",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert isinstance(data["id"], int)
        assert data["id"] > 0

    def test_only_prompt_type_required(self, seeded_client):
        """All optional fields omitted — endpoint still accepts the request."""
        resp = seeded_client["client"].post(
            "/api/v1/prompt-feedback",
            json={"prompt_type": "evaluation_external"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True

    def test_nullable_fks_omitted(self, seeded_client):
        """evaluation_id and llm_call_log_id can both be absent."""
        resp = seeded_client["client"].post(
            "/api/v1/prompt-feedback",
            json={
                "prompt_type": "evaluation_internal",
                "agree": 0,
                "dimension": "role_fit",
            },
        )
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    def test_missing_prompt_type_returns_422(self, seeded_client):
        resp = seeded_client["client"].post(
            "/api/v1/prompt-feedback",
            json={"agree": 1},
        )
        assert resp.status_code == 422
