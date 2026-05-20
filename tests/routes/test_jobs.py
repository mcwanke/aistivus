"""
tests/routes/test_jobs.py
Integration tests for job-related routes.

Routes covered:
  GET  /api/v1/jobs
  GET  /api/v1/jobs/{id}
  GET  /api/v1/jobs/{id}/application
  POST /api/v1/jobs/{id}/activate
  GET  /api/v1/stats
"""

import pytest
import database


class TestListJobs:
    def test_returns_empty_list_when_no_jobs(self, client):
        resp = client.get("/api/v1/jobs")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_returns_active_job_after_activate(self, client):
        job_id, _ = database.upsert_job("Acme", "Engineer", "backend")
        database.activate_job(job_id)
        resp = client.get("/api/v1/jobs")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["company_name"] == "Acme"
        assert data[0]["title"] == "Engineer"

    def test_inactive_job_not_returned(self, client):
        database.upsert_job("Hidden Corp", "Ghost Role", "general")
        resp = client.get("/api/v1/jobs")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_returns_only_active_jobs_when_mixed(self, client):
        job_id, _ = database.upsert_job("Alpha Corp", "Backend Engineer", "backend")
        database.upsert_job("Beta Inc", "Frontend Engineer", "frontend")  # stays inactive
        database.activate_job(job_id)
        resp = client.get("/api/v1/jobs")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["company_name"] == "Alpha Corp"

    def test_job_includes_application_status(self, client):
        job_id, _ = database.upsert_job("Corp", "Role", "general")
        database.activate_job(job_id)
        resp = client.get("/api/v1/jobs")
        assert resp.status_code == 200
        job = resp.json()[0]
        assert "application_status" in job

    def test_new_job_has_not_started_application(self, client):
        job_id, _ = database.upsert_job("Corp", "Role", "general")
        database.activate_job(job_id)
        resp = client.get("/api/v1/jobs")
        job = resp.json()[0]
        assert job["application_status"] == "not-started"

    def test_job_includes_agg_scores(self, client):
        job_id, _ = database.upsert_job("Corp", "Role", "general")
        database.activate_job(job_id)
        resp = client.get("/api/v1/jobs")
        job = resp.json()[0]
        assert "agg_score_overall" in job

    def test_job_includes_is_active_field(self, client):
        job_id, _ = database.upsert_job("Corp", "Role", "general")
        database.activate_job(job_id)
        resp = client.get("/api/v1/jobs")
        job = resp.json()[0]
        assert job["is_active"] == 1


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

    def test_get_job_returns_inactive_job(self, client):
        # single-job GET is not filtered by is_active
        job_id, _ = database.upsert_job("Inactive Co", "Analyst", "finance")
        resp = client.get(f"/api/v1/jobs/{job_id}")
        assert resp.status_code == 200
        assert resp.json()["job"]["is_active"] == 0


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


class TestActivateJob:
    def test_activate_returns_200_and_updated_job(self, client):
        job_id, _ = database.upsert_job("Zeta Ltd", "Data Eng", "data")
        resp = client.post(f"/api/v1/jobs/{job_id}/activate")
        assert resp.status_code == 200
        data = resp.json()
        assert data["is_active"] == 1
        assert data["id"] == job_id

    def test_activate_job_appears_in_list(self, client):
        job_id, _ = database.upsert_job("Zeta Ltd", "Data Eng", "data")
        assert client.get("/api/v1/jobs").json() == []
        client.post(f"/api/v1/jobs/{job_id}/activate")
        jobs = client.get("/api/v1/jobs").json()
        assert len(jobs) == 1
        assert jobs[0]["is_active"] == 1

    def test_activate_returns_404_for_unknown_job(self, client):
        resp = client.post("/api/v1/jobs/9999/activate")
        assert resp.status_code == 404

    def test_activate_is_idempotent(self, client):
        job_id, _ = database.upsert_job("Zeta Ltd", "Data Eng", "data")
        client.post(f"/api/v1/jobs/{job_id}/activate")
        resp = client.post(f"/api/v1/jobs/{job_id}/activate")
        assert resp.status_code == 200
        assert resp.json()["is_active"] == 1


class TestStats:
    def test_stats_returns_zeroes_on_empty_db(self, client):
        resp = client.get("/api/v1/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert data["jobs"] == 0
        assert data["evaluations"] == 0
        assert data["applications"] == 0
        assert data["jobs_applied_to"] == 0
        assert data["applications_in_process"] == 0

    def test_stats_counts_only_active_jobs(self, client):
        job_id, _ = database.upsert_job("A", "B", "general")
        database.upsert_job("C", "D", "general")  # stays inactive
        database.activate_job(job_id)
        resp = client.get("/api/v1/stats")
        assert resp.json()["jobs"] == 1

    def test_stats_inactive_jobs_not_counted(self, client):
        database.upsert_job("A", "B", "general")
        database.upsert_job("C", "D", "general")
        resp = client.get("/api/v1/stats")
        assert resp.json()["jobs"] == 0

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

    def test_stats_jobs_applied_to_counts_applied_flag(self, client):
        job_id, _ = database.upsert_job("A", "B", "general")
        app_row = database.get_application_for_job(job_id)
        database.update_application(app_row["id"], applied=1)
        resp = client.get("/api/v1/stats")
        assert resp.json()["jobs_applied_to"] == 1

    def test_stats_jobs_applied_to_excludes_not_applied(self, client):
        database.upsert_job("A", "B", "general")
        resp = client.get("/api/v1/stats")
        assert resp.json()["jobs_applied_to"] == 0

    def test_stats_applications_in_process_counts_active_statuses(self, client):
        for status in ("applied", "screening", "interview", "offer"):
            job_id, _ = database.upsert_job(f"Co {status}", "Role", "general")
            app_row = database.get_application_for_job(job_id)
            database.update_application_status(app_row["id"], status)
        resp = client.get("/api/v1/stats")
        assert resp.json()["applications_in_process"] == 4

    def test_stats_applications_in_process_excludes_inactive_statuses(self, client):
        for status in ("not-started", "draft", "rejected", "ghosted", "withdrawn"):
            job_id, _ = database.upsert_job(f"Co {status}", "Role", "general")
            app_row = database.get_application_for_job(job_id)
            if status != "not-started":
                database.update_application_status(app_row["id"], status)
        resp = client.get("/api/v1/stats")
        assert resp.json()["applications_in_process"] == 0


class TestGetAllJobsDatabase:
    def test_get_all_jobs_excludes_inactive_by_default(self, client):
        database.upsert_job("Inactive Co", "Analyst", "finance")
        jobs = database.get_all_jobs()
        assert len(jobs) == 0

    def test_get_all_jobs_include_inactive_returns_all(self, client):
        database.upsert_job("Inactive Co", "Analyst", "finance")
        jobs = database.get_all_jobs(include_inactive=True)
        assert len(jobs) == 1

    def test_activate_job_sets_is_active(self, client):
        job_id, _ = database.upsert_job("Corp", "Role", "general")
        database.activate_job(job_id)
        jobs = database.get_all_jobs()
        assert len(jobs) == 1
        assert jobs[0]["is_active"] == 1
