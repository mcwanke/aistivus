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
  POST   /api/v1/applications/{id}/generate-resume-prompt
  POST   /api/v1/applications/{id}/generate-cover-prompt
  POST   /api/v1/applications/{id}/lesson-chat
"""

import database
import llm_client


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

    def test_includes_not_started_when_param_set(self, seeded_client):
        # Default state: job has a not-started application, excluded by default
        resp = seeded_client["client"].get(
            "/api/v1/applications?include_not_started=true"
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["application_status"] == "not-started"

    def test_excludes_not_started_by_default(self, seeded_client):
        resp = seeded_client["client"].get("/api/v1/applications")
        assert resp.status_code == 200
        data = resp.json()
        statuses = [a["application_status"] for a in data]
        assert "not-started" not in statuses


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

    def test_applied_flag_sets_apply_date_when_null(self, seeded_client):
        resp = seeded_client["client"].patch(
            f"/api/v1/applications/{seeded_client['app_id']}",
            json={"applied": 1, "application_status": "applied"},
        )
        assert resp.status_code == 200
        app = database.get_application(seeded_client["app_id"])
        assert app["apply_date"] is not None
        import re
        assert re.match(r"^\d{4}-\d{2}-\d{2}$", app["apply_date"])

    def test_applied_flag_does_not_overwrite_existing_apply_date(self, seeded_client):
        seeded_client["client"].patch(
            f"/api/v1/applications/{seeded_client['app_id']}",
            json={"apply_date": "2024-01-15"},
        )
        seeded_client["client"].patch(
            f"/api/v1/applications/{seeded_client['app_id']}",
            json={"applied": 1},
        )
        app = database.get_application(seeded_client["app_id"])
        assert app["apply_date"] == "2024-01-15"


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
                "type_value": "general",
                "log": "Call scheduled.",
                "url": "https://calendly.com/slot",
            },
        )
        assert resp.status_code == 200

    def test_all_valid_type_values_accepted(self, seeded_client):
        valid_types = [
            "compensation", "general", "prompt", "feedback",
            "email_comms", "phone_comms", "offer", "rejection", "status_change",
        ]
        for t in valid_types:
            resp = seeded_client["client"].post(
                f"/api/v1/applications/{seeded_client['app_id']}/logs",
                json={"type_value": t, "log": f"Test {t}"},
            )
            assert resp.status_code == 200, f"Expected 200 for type_value={t!r}"

    def test_status_change_log_type_accepted(self, seeded_client):
        resp = seeded_client["client"].post(
            f"/api/v1/applications/{seeded_client['app_id']}/logs",
            json={"type_value": "status_change", "log": "Status changed to applied"},
        )
        assert resp.status_code == 200
        logs = seeded_client["client"].get(
            f"/api/v1/applications/{seeded_client['app_id']}"
        ).json()["logs"]
        assert any(log["type_value"] == "status_change" for log in logs)


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
        prompt_logs = [log for log in logs if dict(log)["type_value"] == "prompt_eval"]
        assert len(prompt_logs) == 1

    def test_prompt_log_uses_prompt_eval_type(self, seeded_client):
        seeded_client["client"].post(
            f"/api/v1/applications/{seeded_client['app_id']}/generate-prompt"
        )
        logs = database.get_application_logs(seeded_client["app_id"])
        assert len(logs) == 1
        assert dict(logs[0])["type_value"] == "prompt_eval"

    def test_prompt_contains_job_details_not_eval_scores(self, seeded_client):
        resp = seeded_client["client"].post(
            f"/api/v1/applications/{seeded_client['app_id']}/generate-prompt"
        )
        prompt = resp.json()["prompt"]
        # New eval-only prompt — no resume instructions or local eval score injection
        assert "LOCAL AI EVALUATION RESULTS" not in prompt
        assert "EVALUATION_JSON_START" in prompt
        assert "keyword_gaps" in prompt


# ─────────────────────────────────────────────────────────────
# POST /api/v1/applications/{id}/generate-resume-prompt
# ─────────────────────────────────────────────────────────────

class TestGenerateResumePrompt:
    def test_404_for_unknown_application(self, client):
        resp = client.post("/api/v1/applications/9999/generate-resume-prompt")
        assert resp.status_code == 404

    def test_returns_prompt_text(self, seeded_client):
        resp = seeded_client["client"].post(
            f"/api/v1/applications/{seeded_client['app_id']}/generate-resume-prompt"
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert "prompt" in data
        assert len(data["prompt"]) > 100

    def test_prompt_contains_job_details(self, seeded_client):
        resp = seeded_client["client"].post(
            f"/api/v1/applications/{seeded_client['app_id']}/generate-resume-prompt"
        )
        prompt = resp.json()["prompt"]
        assert "Test Corp" in prompt
        assert "Software Engineer" in prompt

    def test_prompt_includes_keyword_fallback_without_eval(self, seeded_client):
        resp = seeded_client["client"].post(
            f"/api/v1/applications/{seeded_client['app_id']}/generate-resume-prompt"
        )
        prompt = resp.json()["prompt"]
        assert "Not provided — will extract from JD" in prompt

    def test_prompt_logged_with_prompt_resume_type(self, seeded_client):
        seeded_client["client"].post(
            f"/api/v1/applications/{seeded_client['app_id']}/generate-resume-prompt"
        )
        logs = database.get_application_logs(seeded_client["app_id"])
        resume_logs = [log for log in logs if dict(log)["type_value"] == "prompt_resume"]
        assert len(resume_logs) == 1


# ─────────────────────────────────────────────────────────────
# POST /api/v1/applications/{id}/generate-cover-prompt
# ─────────────────────────────────────────────────────────────

class TestGenerateCoverPrompt:
    def test_404_for_unknown_application(self, client):
        resp = client.post("/api/v1/applications/9999/generate-cover-prompt")
        assert resp.status_code == 404

    def test_returns_prompt_text(self, seeded_client):
        resp = seeded_client["client"].post(
            f"/api/v1/applications/{seeded_client['app_id']}/generate-cover-prompt"
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert "prompt" in data
        assert len(data["prompt"]) > 100

    def test_prompt_contains_job_details(self, seeded_client):
        resp = seeded_client["client"].post(
            f"/api/v1/applications/{seeded_client['app_id']}/generate-cover-prompt"
        )
        prompt = resp.json()["prompt"]
        assert "Test Corp" in prompt
        assert "Software Engineer" in prompt

    def test_prompt_includes_website_fallback_without_company_log(self, seeded_client):
        resp = seeded_client["client"].post(
            f"/api/v1/applications/{seeded_client['app_id']}/generate-cover-prompt"
        )
        prompt = resp.json()["prompt"]
        assert "Not available" in prompt

    def test_prompt_logged_with_prompt_cover_type(self, seeded_client):
        seeded_client["client"].post(
            f"/api/v1/applications/{seeded_client['app_id']}/generate-cover-prompt"
        )
        logs = database.get_application_logs(seeded_client["app_id"])
        cover_logs = [log for log in logs if dict(log)["type_value"] == "prompt_cover"]
        assert len(cover_logs) == 1


# ─────────────────────────────────────────────────────────────
# POST /api/v1/applications/{id}/lesson-chat
# ─────────────────────────────────────────────────────────────


class TestLessonChat:
    def _mock_stream(self, tokens: list[str]):
        async def _gen(*args, **kwargs):
            for t in tokens:
                yield t
        return _gen

    def _mock_complete(self, content: str):
        async def _complete(*args, **kwargs):
            return {"success": True, "content": content, "error": None}
        return _complete

    def test_streaming_returns_sse(self, seeded_client, monkeypatch):
        c = seeded_client["client"]
        monkeypatch.setattr(llm_client, "complete_stream", self._mock_stream(["Hello", " there"]))

        r = c.post(
            f"/api/v1/applications/{seeded_client['app_id']}/lesson-chat",
            json={
                "messages": [{"role": "user", "content": "What did I learn?"}],
                "finalize": False,
            },
        )
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("text/event-stream")
        body = r.text
        assert "data: Hello\n\n" in body
        assert "data: [DONE]\n\n" in body

    def test_streaming_logs_llm_call(self, seeded_client, monkeypatch):
        c = seeded_client["client"]
        monkeypatch.setattr(llm_client, "complete_stream", self._mock_stream(["hi"]))

        c.post(
            f"/api/v1/applications/{seeded_client['app_id']}/lesson-chat",
            json={
                "messages": [{"role": "user", "content": "reflect"}],
                "finalize": False,
            },
        )
        logs = database.get_llm_call_log(call_type="chat")
        assert len(logs) == 1
        assert dict(logs[0])["success"] == 1

    def test_finalize_writes_lesson_learned_log(self, seeded_client, monkeypatch):
        c = seeded_client["client"]
        lesson_json = '{"log_entry": "I learned to follow up sooner.", "insights_addition": "Always follow up within 48 hours."}'
        monkeypatch.setattr(llm_client, "complete", self._mock_complete(lesson_json))

        r = c.post(
            f"/api/v1/applications/{seeded_client['app_id']}/lesson-chat",
            json={
                "messages": [
                    {"role": "user", "content": "I should have followed up faster."},
                    {"role": "assistant", "content": "What would you do differently?"},
                    {"role": "user", "content": "Follow up within 48 hours."},
                ],
                "finalize": True,
            },
        )
        assert r.status_code == 200
        data = r.json()
        assert data["log_entry"] == "I learned to follow up sooner."
        assert data["insights_addition"] == "Always follow up within 48 hours."
        assert data["application_id"] == seeded_client["app_id"]

        # Verify the lesson_learned log entry was written to the DB
        logs = database.get_application_logs(seeded_client["app_id"])
        lesson_logs = [log for log in logs if dict(log)["type_value"] == "lesson_learned"]
        assert len(lesson_logs) == 1
        assert dict(lesson_logs[0])["log"] == "I learned to follow up sooner."

    def test_finalize_links_llm_call_log(self, seeded_client, monkeypatch):
        c = seeded_client["client"]
        lesson_json = '{"log_entry": "Good lesson.", "insights_addition": "Apply this next time."}'
        monkeypatch.setattr(llm_client, "complete", self._mock_complete(lesson_json))

        c.post(
            f"/api/v1/applications/{seeded_client['app_id']}/lesson-chat",
            json={
                "messages": [{"role": "user", "content": "I learned a lot."}],
                "finalize": True,
            },
        )

        logs = database.get_application_logs(seeded_client["app_id"])
        lesson_log = next(log for log in logs if dict(log)["type_value"] == "lesson_learned")
        # llm_call_log_id must be set — links the log entry to the LLM call
        assert dict(lesson_log)["llm_call_log_id"] is not None

    def test_streaming_404_for_unknown_application(self, client, monkeypatch):
        monkeypatch.setattr(llm_client, "complete_stream", self._mock_stream(["x"]))
        r = client.post(
            "/api/v1/applications/9999/lesson-chat",
            json={"messages": [{"role": "user", "content": "hi"}], "finalize": False},
        )
        assert r.status_code == 404

    def test_no_model_returns_503(self, client):
        """Without a seeded model, lesson-chat must return 503."""
        # Need a real application to pass the 404 check before model check
        _, job_id = None, None
        job_id, _ = database.upsert_job("Corp", "Eng", "eng")
        app_row = database.get_application_for_job(job_id)
        r = client.post(
            f"/api/v1/applications/{app_row['id']}/lesson-chat",
            json={"messages": [{"role": "user", "content": "hi"}], "finalize": False},
        )
        assert r.status_code == 503
