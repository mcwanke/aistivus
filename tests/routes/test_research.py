"""
tests/routes/test_research.py
Integration tests for job research routes.

Routes covered:
  GET  /api/v1/jobs/{job_id}/research
  POST /api/v1/jobs/{job_id}/research
  POST /api/v1/jobs/{job_id}/generate-research-prompt
"""

import json
import database

VALID_RESEARCH_JSON = json.dumps({
    "research_summary": "Strong Series B company in the payments space.",
    "research_confidence": "high",
    "company_overview": "A fintech startup founded in 2018.",
    "company_stage": "Series B",
    "company_size_actual": "200-500",
    "green_flags": ["Strong engineering culture", "Good compensation"],
    "red_flags": ["High turnover in 2023"],
})


# ─────────────────────────────────────────────────────────────
# GET /api/v1/jobs/{job_id}/research
# ─────────────────────────────────────────────────────────────

class TestGetJobResearch:
    def test_returns_null_when_no_research(self, seeded_client):
        resp = seeded_client["client"].get(
            f"/api/v1/jobs/{seeded_client['job_id']}/research"
        )
        assert resp.status_code == 200
        assert resp.json()["research"] is None

    def test_returns_404_for_unknown_job(self, client):
        resp = client.get("/api/v1/jobs/99999/research")
        assert resp.status_code == 404

    def test_returns_record_after_insert(self, seeded_client):
        job_id = seeded_client["job_id"]
        database.insert_job_research(
            job_id=job_id,
            raw_json=VALID_RESEARCH_JSON,
            research_summary="Strong Series B company.",
            research_confidence="high",
        )
        resp = seeded_client["client"].get(f"/api/v1/jobs/{job_id}/research")
        assert resp.status_code == 200
        data = resp.json()["research"]
        assert data is not None
        assert data["research_summary"] == "Strong Series B company."
        assert data["research_confidence"] == "high"

    def test_returns_most_recent_after_multiple(self, seeded_client):
        job_id = seeded_client["job_id"]
        database.insert_job_research(
            job_id=job_id,
            raw_json="{}",
            research_summary="First",
            research_confidence="low",
        )
        database.insert_job_research(
            job_id=job_id,
            raw_json="{}",
            research_summary="Second",
            research_confidence="high",
        )
        resp = seeded_client["client"].get(f"/api/v1/jobs/{job_id}/research")
        assert resp.json()["research"]["research_summary"] == "Second"


# ─────────────────────────────────────────────────────────────
# POST /api/v1/jobs/{job_id}/research
# ─────────────────────────────────────────────────────────────

class TestPostJobResearch:
    def test_stores_and_returns_record(self, seeded_client):
        job_id = seeded_client["job_id"]
        resp = seeded_client["client"].post(
            f"/api/v1/jobs/{job_id}/research",
            json={"raw_json": VALID_RESEARCH_JSON},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert isinstance(data["id"], int)
        assert data["research"]["research_summary"] == "Strong Series B company in the payments space."

    def test_stores_optional_fields(self, seeded_client):
        job_id = seeded_client["job_id"]
        seeded_client["client"].post(
            f"/api/v1/jobs/{job_id}/research",
            json={"raw_json": VALID_RESEARCH_JSON},
        )
        record = database.get_job_research_latest(job_id)
        assert record["company_stage"] == "Series B"
        assert record["company_size_actual"] == "200-500"

    def test_returns_400_on_invalid_json(self, seeded_client):
        job_id = seeded_client["job_id"]
        resp = seeded_client["client"].post(
            f"/api/v1/jobs/{job_id}/research",
            json={"raw_json": "not valid json {{"},
        )
        assert resp.status_code == 400

    def test_returns_400_on_missing_research_summary(self, seeded_client):
        job_id = seeded_client["job_id"]
        payload = json.dumps({"research_confidence": "high"})
        resp = seeded_client["client"].post(
            f"/api/v1/jobs/{job_id}/research",
            json={"raw_json": payload},
        )
        assert resp.status_code == 400

    def test_returns_400_on_missing_research_confidence(self, seeded_client):
        job_id = seeded_client["job_id"]
        payload = json.dumps({"research_summary": "Some summary"})
        resp = seeded_client["client"].post(
            f"/api/v1/jobs/{job_id}/research",
            json={"raw_json": payload},
        )
        assert resp.status_code == 400

    def test_returns_404_for_unknown_job(self, client):
        resp = client.post(
            "/api/v1/jobs/99999/research",
            json={"raw_json": VALID_RESEARCH_JSON},
        )
        assert resp.status_code == 404

    def test_subsequent_get_returns_posted_record(self, seeded_client):
        job_id = seeded_client["job_id"]
        seeded_client["client"].post(
            f"/api/v1/jobs/{job_id}/research",
            json={"raw_json": VALID_RESEARCH_JSON},
        )
        resp = seeded_client["client"].get(f"/api/v1/jobs/{job_id}/research")
        assert resp.json()["research"] is not None
