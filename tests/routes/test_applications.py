"""
tests/routes/test_applications.py
Integration tests for application-related routes.

Routes covered:
  POST   /api/v1/applications
  GET    /api/v1/applications
  GET    /api/v1/applications/{id}
  PATCH  /api/v1/applications/{id}
  POST   /api/v1/applications/{id}/logs
  DELETE /api/v1/applications/{id}/logs/{log_id}
  POST   /api/v1/applications/{id}/generate-prompt
"""

import pytest
import database


# ─────────────────────────────────────────────────────────────
# POST /api/v1/applications
# ─────────────────────────────────────────────────────────────

class TestCreateApplication:
    def test_activates_not_started_application(self, seeded_client):
        resp = seeded_client["client"].post(
            "/api/v1/applications",
            json={"job_id": seeded_client["job_id"]},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["application_id"] == seeded_client["app_id"]

    def test_transitions_status_to_draft(self, seeded_client):
        seeded_client["client"].post(
            "/api/v1/applications",
            json={"job_id": seeded_client["job_id"]},
        )
        app = database.get_application(seeded_client["app_id"])
        assert app["application_status"] == "draft"

    def test_409_when_already_active(self, seeded_client):
        seeded_client["client"].post(
            "/api/v1/applications",
            json={"job_id": seeded_client["job_id"]},
        )
        resp = seeded_client["client"].post(
            "/api/v1/applications",
            json={"job_id": seeded_client["job_id"]},
        )
        assert resp.status_code == 409

    def test_404_for_unknown_job(self, client):
        resp = client.post("/api/v1/applications", json={"job_id": 9999})
        assert resp.status_code == 404

    def test_missing_job_id_returns_422(self, client):
        resp = client.post("/api/v1/applications", json={})
        assert resp.status_code == 422


# ─────────────────────────────────────────────────────────────
# GET /api/v1/applications
# ─────────────────────────────────────────────────────────────

class TestListApplications:
    def test_excludes_not_started(self, seeded_client):
        resp = seeded_client["client"].get("/api/v1/applications")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_returns_active_application(self, seeded_client):
        seeded_client["client"].post(
            "/api/v1/applications",
            json={"job_id": seeded_client["job_id"]},
        )
        resp = seeded_client["client"].get("/api/v1/applications")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["application_status"] == "draft"

    def test_includes_job_info(self, seeded_client):
        seeded_client["client"].post(
            "/api/v1/applications",
            json={"job_id": seeded_client["job_id"]},
        )
        resp = seeded_client["client"].get("/api/v1/applications")
        app = resp.json()[0]
        assert app["company_name"] == "Test Corp"
        assert app["title"] == "Software Engineer"


# ─────────────────────────────────────────────────────────────
# GET /api/v1/applications/{id}
# ─────────────────────────────────────────────────────────────

class TestGetApplication:
    def test_404_for_unknown_id(self, client):
        resp = client.get("/api/v1/applications/9999")
        assert resp.status_code == 404

    def test_returns_application_data(self, seeded_client):
        resp = seeded_client["client"].get(
            f"/api/v1/applications/{seeded_client['app_id']}"
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "application" in data
        assert "job" in data
        assert "logs" in data
        assert "audit" in data
        assert "evaluations" in data
        assert "postings" in data

    def test_application_detail_has_correct_job(self, seeded_client):
        resp = seeded_client["client"].get(
            f"/api/v1/applications/{seeded_client['app_id']}"
        )
        assert resp.json()["job"]["company_name"] == "Test Corp"

    def test_application_detail_audit_not_empty(self, seeded_client):
        resp = seeded_client["client"].get(
            f"/api/v1/applications/{seeded_client['app_id']}"
        )
        # auto-created application writes an audit event at job creation
        assert len(resp.json()["audit"]) >= 1

    def test_application_detail_logs_empty_initially(self, seeded_client):
        resp = seeded_client["client"].get(
            f"/api/v1/applications/{seeded_client['app_id']}"
        )
        assert resp.json()["logs"] == []


# ─────────────────────────────────────────────────────────────
# PATCH /api/v1/applications/{id}
# ─────────────────────────────────────────────────────────────

class TestUpdateApplication:
    def test_404_for_unknown_id(self, client):
        resp = client.patch(
            "/api/v1/applications/9999",
            json={"application_status": "draft"},
        )
        assert resp.status_code == 404

    def test_updates_status(self, seeded_client):
        resp = seeded_client["client"].patch(
            f"/api/v1/applications/{seeded_client['app_id']}",
            json={"application_status": "applied"},
        )
        assert resp.status_code == 200
        app = database.get_application(seeded_client["app_id"])
        assert app["application_status"] == "applied"

    def test_invalid_status_returns_400(self, seeded_client):
        resp = seeded_client["client"].patch(
            f"/api/v1/applications/{seeded_client['app_id']}",
            json={"application_status": "invalid_status"},
        )
        assert resp.status_code == 400

    def test_updates_requested_salary(self, seeded_client):
        resp = seeded_client["client"].patch(
            f"/api/v1/applications/{seeded_client['app_id']}",
            json={"requested_salary": "120000"},
        )
        assert resp.status_code == 200
        app = database.get_application(seeded_client["app_id"])
        assert app["requested_salary"] == "120000"

    def test_status_change_writes_audit(self, seeded_client):
        seeded_client["client"].patch(
            f"/api/v1/applications/{seeded_client['app_id']}",
            json={"application_status": "applied"},
        )
        audit = database.get_application_audit(seeded_client["app_id"])
        events = [dict(a)["event"] for a in audit]
        assert any("applied" in e for e in events)

    def test_noop_on_empty_body(self, seeded_client):
        resp = seeded_client["client"].patch(
            f"/api/v1/applications/{seeded_client['app_id']}",
            json={},
        )
        assert resp.status_code == 200


# ─────────────────────────────────────────────────────────────
# POST /api/v1/applications/{id}/logs
# ─────────────────────────────────────────────────────────────

class TestAddLog:
    def test_adds_log_entry(self, seeded_client):
        resp = seeded_client["client"].post(
            f"/api/v1/applications/{seeded_client['app_id']}/logs",
            json={"type_value": "general", "log": "Had a call with recruiter."},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["log_id"] is not None

    def test_log_appears_in_application_detail(self, seeded_client):
        seeded_client["client"].post(
            f"/api/v1/applications/{seeded_client['app_id']}/logs",
            json={"type_value": "general", "log": "Note here."},
        )
        resp = seeded_client["client"].get(
            f"/api/v1/applications/{seeded_client['app_id']}"
        )
        logs = resp.json()["logs"]
        assert len(logs) == 1
        assert logs[0]["log"] == "Note here."

    def test_invalid_type_value_returns_400(self, seeded_client):
        resp = seeded_client["client"].post(
            f"/api/v1/applications/{seeded_client['app_id']}/logs",
            json={"type_value": "invalid_type", "log": "Note."},
        )
        assert resp.status_code == 400

    def test_404_for_unknown_application(self, client):
        resp = client.post(
            "/api/v1/applications/9999/logs",
            json={"type_value": "general", "log": "Note."},
        )
        assert resp.status_code == 404

    def test_accepts_optional_url(self, seeded_client):
        resp = seeded_client["client"].post(
            f"/api/v1/applications/{seeded_client['app_id']}/logs",
            json={
                "type_value": "recruiter_call",
                "log": "Call scheduled.",
                "url": "https://calendly.com/slot",
            },
        )
        assert resp.status_code == 200

    def test_all_valid_type_values_accepted(self, seeded_client):
        valid_types = [
            "recruiter_call", "interview_feedback", "compensation",
            "general", "repost_alert", "prompt",
        ]
        for t in valid_types:
            resp = seeded_client["client"].post(
                f"/api/v1/applications/{seeded_client['app_id']}/logs",
                json={"type_value": t, "log": f"Test {t}"},
            )
            assert resp.status_code == 200, f"Expected 200 for type_value={t!r}"


# ─────────────────────────────────────────────────────────────
# DELETE /api/v1/applications/{id}/logs/{log_id}
# ─────────────────────────────────────────────────────────────

class TestDeleteLog:
    def test_deletes_existing_log(self, seeded_client):
        add_resp = seeded_client["client"].post(
            f"/api/v1/applications/{seeded_client['app_id']}/logs",
            json={"type_value": "general", "log": "To be deleted."},
        )
        log_id = add_resp.json()["log_id"]
        del_resp = seeded_client["client"].delete(
            f"/api/v1/applications/{seeded_client['app_id']}/logs/{log_id}"
        )
        assert del_resp.status_code == 200
        assert del_resp.json()["success"] is True

    def test_404_for_unknown_log(self, seeded_client):
        resp = seeded_client["client"].delete(
            f"/api/v1/applications/{seeded_client['app_id']}/logs/9999"
        )
        assert resp.status_code == 404

    def test_log_absent_after_delete(self, seeded_client):
        add_resp = seeded_client["client"].post(
            f"/api/v1/applications/{seeded_client['app_id']}/logs",
            json={"type_value": "general", "log": "Gone."},
        )
        log_id = add_resp.json()["log_id"]
        seeded_client["client"].delete(
            f"/api/v1/applications/{seeded_client['app_id']}/logs/{log_id}"
        )
        resp = seeded_client["client"].get(
            f"/api/v1/applications/{seeded_client['app_id']}"
        )
        assert resp.json()["logs"] == []


# ─────────────────────────────────────────────────────────────
# POST /api/v1/applications/{id}/generate-prompt
# ─────────────────────────────────────────────────────────────

class TestGeneratePrompt:
    def test_404_for_unknown_application(self, client):
        resp = client.post("/api/v1/applications/9999/generate-prompt")
        assert resp.status_code == 404

    def test_returns_prompt_text(self, seeded_client):
        resp = seeded_client["client"].post(
            f"/api/v1/applications/{seeded_client['app_id']}/generate-prompt"
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert "prompt" in data
        assert len(data["prompt"]) > 100

    def test_prompt_contains_job_details(self, seeded_client):
        resp = seeded_client["client"].post(
            f"/api/v1/applications/{seeded_client['app_id']}/generate-prompt"
        )
        prompt = resp.json()["prompt"]
        assert "Test Corp" in prompt
        assert "Software Engineer" in prompt

    def test_prompt_log_stored_in_db(self, seeded_client):
        seeded_client["client"].post(
            f"/api/v1/applications/{seeded_client['app_id']}/generate-prompt"
        )
        logs = database.get_application_logs(seeded_client["app_id"])
        prompt_logs = [l for l in logs if dict(l)["type_value"] == "prompt"]
        assert len(prompt_logs) == 1
