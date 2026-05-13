"""
tests/routes/test_jobs.py
Integration tests for job-related routes.

Routes covered:
  GET /api/v1/jobs
  GET /api/v1/jobs/{id}
  GET /api/v1/jobs/{id}/application
  GET /api/v1/stats
"""

import pytest
import database


class TestListJobs:
    def test_returns_empty_list_when_no_jobs(self, client):
        resp = client.get("/api/v1/jobs")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_returns_job_after_insert(self, client):
        database.upsert_job("Acme", "Engineer", "backend")
        resp = client.get("/api/v1/jobs")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["company_name"] == "Acme"
        assert data[0]["title"] == "Engineer"

    def test_returns_multiple_jobs(self, client):
        database.upsert_job("Alpha Corp", "Backend Engineer", "backend")
        database.upsert_job("Beta Inc", "Frontend Engineer", "frontend")
        resp = client.get("/api/v1/jobs")
        assert resp.status_code == 200
        assert len(resp.json()) == 2

    def test_job_includes_application_status(self, client):
        database.upsert_job("Corp", "Role", "general")
        resp = client.get("/api/v1/jobs")
        assert resp.status_code == 200
        job = resp.json()[0]
        assert "application_status" in job

    def test_new_job_has_not_started_application(self, client):
        database.upsert_job("Corp", "Role", "general")
        resp = client.get("/api/v1/jobs")
        job = resp.json()[0]
        assert job["application_status"] == "not-started"

    def test_job_includes_agg_scores(self, client):
        database.upsert_job("Corp", "Role", "general")
        resp = client.get("/api/v1/jobs")
        job = resp.json()[0]
        assert "agg_score_overall" in job


class TestGetJob:
    def test_returns_404_for_unknown_id(self, client):
        resp = client.get("/api/v1/jobs/9999")
        assert resp.status_code == 404

    def test_returns_job_data(self, seeded_client):
        sc = seeded_client
        resp = sc["client"].get(f"/api/v1/jobs/{sc['job_id']}")
        assert resp.status_code == 200
        data = resp.json()
        assert "job" in data
        assert "evaluations" in data
        assert "postings" in data

    def test_job_detail_has_correct_company(self, seeded_client):
        sc = seeded_client
        resp = sc["client"].get(f"/api/v1/jobs/{sc['job_id']}")
        assert resp.json()["job"]["company_name"] == "Test Corp"

    def test_job_detail_evaluations_empty_on_new_job(self, seeded_client):
        sc = seeded_client
        resp = sc["client"].get(f"/api/v1/jobs/{sc['job_id']}")
        assert resp.json()["evaluations"] == []

    def test_job_detail_postings_empty_on_new_job(self, seeded_client):
        sc = seeded_client
        resp = sc["client"].get(f"/api/v1/jobs/{sc['job_id']}")
        assert resp.json()["postings"] == []

    def test_job_detail_includes_postings_when_present(self, seeded_client):
        sc = seeded_client
        database.insert_job_posting(
            sc["job_id"],
            source_board="manual",
            source_url="https://example.com",
            description_raw="JD text",
        )
        resp = sc["client"].get(f"/api/v1/jobs/{sc['job_id']}")
        assert len(resp.json()["postings"]) == 1


class TestGetJobApplication:
    def test_returns_application_for_new_job(self, seeded_client):
        sc = seeded_client
        resp = sc["client"].get(f"/api/v1/jobs/{sc['job_id']}/application")
        assert resp.status_code == 200
        data = resp.json()
        assert data["exists"] is True
        assert data["application"] is not None

    def test_application_status_is_not_started(self, seeded_client):
        sc = seeded_client
        resp = sc["client"].get(f"/api/v1/jobs/{sc['job_id']}/application")
        assert resp.json()["application"]["application_status"] == "not-started"

    def test_returns_exists_false_for_unknown_job(self, client):
        resp = client.get("/api/v1/jobs/9999/application")
        assert resp.status_code == 200
        assert resp.json()["exists"] is False


class TestStats:
    def test_stats_returns_zeroes_on_empty_db(self, client):
        resp = client.get("/api/v1/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert data["jobs"] == 0
        assert data["evaluations"] == 0
        assert data["applications"] == 0

    def test_stats_counts_jobs(self, client):
        database.upsert_job("A", "B", "general")
        database.upsert_job("C", "D", "general")
        resp = client.get("/api/v1/stats")
        assert resp.json()["jobs"] == 2

    def test_stats_excludes_not_started_from_applications(self, client):
        # upsert_job auto-creates a not-started application
        database.upsert_job("A", "B", "general")
        resp = client.get("/api/v1/stats")
        assert resp.json()["applications"] == 0

    def test_stats_counts_active_application(self, client):
        job_id, _ = database.upsert_job("A", "B", "general")
        app_row = database.get_application_for_job(job_id)
        database.update_application_status(app_row["id"], "draft")
        resp = client.get("/api/v1/stats")
        assert resp.json()["applications"] == 1
