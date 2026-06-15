"""
tests/routes/test_evaluations.py
Integration tests for evaluation-related routes.

Routes covered:
  POST /api/v1/evaluate
  POST /api/v1/evaluations/rerun
  POST /api/v1/evaluations/import
  GET  /api/v1/evaluations
  GET  /api/v1/evaluations/{id}

No live network calls — llm_client.complete is mocked throughout.
"""

import json
from unittest.mock import AsyncMock, patch

import database

# ─────────────────────────────────────────────────────────────
# Shared LLM mock responses
# ─────────────────────────────────────────────────────────────

_GOOD_EVAL = {
    "score_overall": 7.5,
    "score_role_fit": 4.0,
    "score_scope_fit": 4.0,
    "score_culture": 3.5,
    "score_comp": 3.5,
    "fit_type": "Core Fit",
    "archetype": "People Leader",
    "strengths": "Strong background",
    "gaps": "Some gaps",
    "recommendation": "Apply",
    "log_entry": "Test | EM | 7.5 | Core Fit | Apply",
    "keywords": "platform, kubernetes",
    "domain_match": "Same domain",
    "role_type_match": "Target match",
    "keyword_gaps": "Kubernetes, Terraform",
}

_LLM_SUCCESS = {
    "success": True,
    "content": json.dumps(_GOOD_EVAL),
    "error": None,
    "model": "test-model",
    "provider": "ollama",
    "latency_ms": 1200,
    "prompt_tokens_actual": 100,
    "completion_tokens_actual": 200,
    "total_tokens_actual": 300,
}

_LLM_FAILURE = {
    "success": False,
    "content": "",
    "error": "Connection refused",
    "model": "test-model",
    "provider": "ollama",
    "latency_ms": 80,
    "prompt_tokens_actual": None,
    "completion_tokens_actual": None,
    "total_tokens_actual": None,
}

_GOOD_ANALYSIS = {
    "archetype": "People Leader",
    "has_deal_breaker": False,
    "deal_breaker_description": None,
    "domain_match": "Same domain",
    "role_type_match": "Target match",
}

_LLM_ANALYSIS_SUCCESS = {
    "success": True,
    "content": json.dumps(_GOOD_ANALYSIS),
    "error": None,
    "model": "test-model",
    "provider": "ollama",
    "latency_ms": 600,
    "prompt_tokens_actual": 60,
    "completion_tokens_actual": 40,
    "total_tokens_actual": 100,
}


# ─────────────────────────────────────────────────────────────
# POST /api/v1/evaluate
# ─────────────────────────────────────────────────────────────

class TestEvaluateEndpoint:
    def test_empty_jd_text_returns_400(self, seeded_client, jobsearch_file):
        resp = seeded_client["client"].post(
            "/api/v1/evaluate",
            json={"jd_text": "   ", "company_name": "Acme", "job_title": "EM"},
        )
        assert resp.status_code == 400

    def test_missing_jd_text_returns_422(self, seeded_client, jobsearch_file):
        resp = seeded_client["client"].post(
            "/api/v1/evaluate",
            json={"company_name": "Acme", "job_title": "EM"},
        )
        assert resp.status_code == 422

    def test_successful_evaluation(self, seeded_client, jobsearch_file):
        mock = AsyncMock(side_effect=[_LLM_ANALYSIS_SUCCESS, _LLM_SUCCESS])
        with patch("llm_client.complete", new=mock):
            resp = seeded_client["client"].post(
                "/api/v1/evaluate",
                json={"jd_text": "Senior engineer role", "company_name": "Acme", "job_title": "EM"},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["evaluation_id"] is not None
        assert data["job_id"] is not None

    def test_evaluation_returns_scores(self, seeded_client, jobsearch_file):
        mock = AsyncMock(side_effect=[_LLM_ANALYSIS_SUCCESS, _LLM_SUCCESS])
        with patch("llm_client.complete", new=mock):
            resp = seeded_client["client"].post(
                "/api/v1/evaluate",
                json={"jd_text": "Senior engineer role", "company_name": "Acme", "job_title": "EM"},
            )
        data = resp.json()
        assert data["evaluation"]["score_overall"] == 7.5
        assert data["evaluation"]["fit_type"] == "Core Fit"

    def test_duplicate_detected_without_force(self, seeded_client, jobsearch_file):
        with patch("llm_client.complete", new=AsyncMock(return_value=_LLM_SUCCESS)):
            seeded_client["client"].post(
                "/api/v1/evaluate",
                json={"jd_text": "JD text", "company_name": "Acme", "job_title": "EM"},
            )
        resp = seeded_client["client"].post(
            "/api/v1/evaluate",
            json={"jd_text": "JD text", "company_name": "Acme", "job_title": "EM"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["duplicate_detected"] is True
        assert data["success"] is False

    def test_force_bypasses_duplicate_check(self, seeded_client, jobsearch_file):
        with patch("llm_client.complete", new=AsyncMock(return_value=_LLM_SUCCESS)):
            seeded_client["client"].post(
                "/api/v1/evaluate",
                json={"jd_text": "JD text", "company_name": "Acme", "job_title": "EM"},
            )
        with patch("llm_client.complete", new=AsyncMock(return_value=_LLM_SUCCESS)):
            resp = seeded_client["client"].post(
                "/api/v1/evaluate",
                json={
                    "jd_text": "JD text",
                    "company_name": "Acme",
                    "job_title": "EM",
                    "force": True,
                },
            )
        assert resp.json()["duplicate_detected"] is False

    def test_llm_failure_returns_success_false(self, seeded_client, jobsearch_file):
        with patch("llm_client.complete", new=AsyncMock(return_value=_LLM_FAILURE)):
            resp = seeded_client["client"].post(
                "/api/v1/evaluate",
                json={"jd_text": "JD text", "company_name": "Acme", "job_title": "EM"},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is False
        assert data["error"] is not None

    def test_llm_failure_still_writes_evaluation_id(self, seeded_client, jobsearch_file):
        with patch("llm_client.complete", new=AsyncMock(return_value=_LLM_FAILURE)):
            resp = seeded_client["client"].post(
                "/api/v1/evaluate",
                json={"jd_text": "JD text", "company_name": "Acme", "job_title": "EM"},
            )
        assert resp.json()["evaluation_id"] is not None


# ─────────────────────────────────────────────────────────────
# POST /api/v1/evaluations/rerun
# ─────────────────────────────────────────────────────────────

class TestRerunEvaluation:
    def test_404_for_unknown_job(self, seeded_client, jobsearch_file):
        resp = seeded_client["client"].post(
            "/api/v1/evaluations/rerun",
            json={"job_id": 9999},
        )
        assert resp.status_code == 404

    def test_400_when_no_description_stored(self, client, jobsearch_file):
        sid = database.create_server("Local Ollama", "http://localhost:11434", "local")
        database.insert_llm_model("test-model", sid, default_flag=1, available=1)
        job_id, _ = database.upsert_job("Corp", "Role", "general")
        # Remove description
        database.update_job(job_id, description_merged=None)
        resp = client.post("/api/v1/evaluations/rerun", json={"job_id": job_id})
        assert resp.status_code == 400

    def test_successful_rerun(self, seeded_client, jobsearch_file):
        mock = AsyncMock(side_effect=[_LLM_ANALYSIS_SUCCESS, _LLM_SUCCESS])
        with patch("llm_client.complete", new=mock):
            resp = seeded_client["client"].post(
                "/api/v1/evaluations/rerun",
                json={"job_id": seeded_client["job_id"]},
            )
        assert resp.status_code == 200
        assert resp.json()["success"] is True


# ─────────────────────────────────────────────────────────────
# POST /api/v1/evaluations/import
# ─────────────────────────────────────────────────────────────

class TestImportEvaluation:
    def test_404_for_unknown_job(self, seeded_client):
        resp = seeded_client["client"].post(
            "/api/v1/evaluations/import",
            json={"job_id": 9999, "score_overall": 7.0},
        )
        assert resp.status_code == 404

    def test_404_for_unknown_model_id(self, seeded_client):
        resp = seeded_client["client"].post(
            "/api/v1/evaluations/import",
            json={
                "job_id": seeded_client["job_id"],
                "llm_model_id": 9999,
                "score_overall": 7.0,
            },
        )
        assert resp.status_code == 404

    def test_uses_default_model_when_none_specified(self, seeded_client):
        resp = seeded_client["client"].post(
            "/api/v1/evaluations/import",
            json={"job_id": seeded_client["job_id"], "score_overall": 8.0, "fit_type": "Core Fit"},
        )
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    def test_import_creates_evaluation_record(self, seeded_client):
        seeded_client["client"].post(
            "/api/v1/evaluations/import",
            json={"job_id": seeded_client["job_id"], "score_overall": 8.0},
        )
        evals = database.get_evaluations_for_job(seeded_client["job_id"])
        assert len(evals) == 1
        assert evals[0]["score_overall"] == 8.0

    def test_400_when_no_default_model(self, client):
        job_id, _ = database.upsert_job("Corp", "Role", "general")
        resp = client.post(
            "/api/v1/evaluations/import",
            json={"job_id": job_id, "score_overall": 7.0},
        )
        assert resp.status_code == 400


# ─────────────────────────────────────────────────────────────
# GET /api/v1/evaluations
# ─────────────────────────────────────────────────────────────

class TestListEvaluations:
    def test_returns_empty_list_when_no_evaluations(self, client):
        resp = client.get("/api/v1/evaluations")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_returns_evaluation_after_import(self, seeded_client):
        seeded_client["client"].post(
            "/api/v1/evaluations/import",
            json={"job_id": seeded_client["job_id"], "score_overall": 7.0},
        )
        resp = seeded_client["client"].get("/api/v1/evaluations")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["score_overall"] == 7.0

    def test_evaluation_includes_job_title(self, seeded_client):
        seeded_client["client"].post(
            "/api/v1/evaluations/import",
            json={"job_id": seeded_client["job_id"], "score_overall": 7.0},
        )
        resp = seeded_client["client"].get("/api/v1/evaluations")
        assert resp.json()[0]["title"] == "Software Engineer"

    def test_evaluation_includes_company_name(self, seeded_client):
        seeded_client["client"].post(
            "/api/v1/evaluations/import",
            json={"job_id": seeded_client["job_id"], "score_overall": 7.0},
        )
        resp = seeded_client["client"].get("/api/v1/evaluations")
        assert resp.json()[0]["company_name"] == "Test Corp"

    def test_limit_parameter_honoured(self, seeded_client):
        for i in range(5):
            seeded_client["client"].post(
                "/api/v1/evaluations/import",
                json={"job_id": seeded_client["job_id"], "score_overall": float(i + 5)},
            )
        resp = seeded_client["client"].get("/api/v1/evaluations?limit=3")
        assert resp.status_code == 200
        assert len(resp.json()) == 3


# ─────────────────────────────────────────────────────────────
# GET /api/v1/evaluations/{id}
# ─────────────────────────────────────────────────────────────

class TestGetEvaluation:
    def test_404_for_unknown_id(self, client):
        resp = client.get("/api/v1/evaluations/9999")
        assert resp.status_code == 404

    def test_returns_evaluation_detail(self, seeded_client):
        import_resp = seeded_client["client"].post(
            "/api/v1/evaluations/import",
            json={
                "job_id": seeded_client["job_id"],
                "score_overall": 8.0,
                "fit_type": "Core Fit",
                "recommendation": "Apply",
            },
        )
        eval_id = import_resp.json()["evaluation_id"]
        resp = seeded_client["client"].get(f"/api/v1/evaluations/{eval_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["score_overall"] == 8.0
        assert data["fit_type"] == "Core Fit"
        assert data["company_name"] == "Test Corp"
