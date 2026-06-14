"""
tests/routes/test_settings.py
Integration tests for health, settings, system-types, models, and LLM call log routes.

Routes covered:
  GET  /api/v1/health
  GET  /api/v1/settings
  PATCH /api/v1/settings
  GET  /api/v1/models
  GET  /api/v1/system-types
  GET  /api/v1/llm-call-log
"""

import database


# ─────────────────────────────────────────────────────────────
# GET /api/v1/health
# ─────────────────────────────────────────────────────────────

class TestHealth:
    def test_returns_200(self, client):
        resp = client.get("/api/v1/health")
        assert resp.status_code == 200

    def test_response_has_required_keys(self, client):
        data = client.get("/api/v1/health").json()
        assert "status" in data
        assert "database" in data
        assert "models" in data
        assert "version" in data

    def test_degraded_when_no_models(self, client):
        data = client.get("/api/v1/health").json()
        assert data["status"] == "degraded"

    def test_ok_when_model_available(self, seeded_client):
        data = seeded_client["client"].get("/api/v1/health").json()
        assert data["status"] == "ok"

    def test_schema_version_in_response(self, client):
        data = client.get("/api/v1/health").json()
        assert data["database"]["schema_version"] == "1.7"

    def test_models_list_in_response(self, seeded_client):
        data = seeded_client["client"].get("/api/v1/health").json()
        assert len(data["models"]) == 1
        assert data["models"][0]["model"] == "test-model"

    def test_anthropic_configured_is_bool(self, client):
        data = client.get("/api/v1/health").json()
        assert isinstance(data["anthropic_configured"], bool)

    def test_api_key_value_never_echoed(self, client, monkeypatch):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-secret-key-should-not-appear")
        data = client.get("/api/v1/health").json()
        resp_text = str(data)
        assert "sk-ant-secret-key-should-not-appear" not in resp_text
        assert data["anthropic_configured"] is True


# ─────────────────────────────────────────────────────────────
# GET /api/v1/settings
# ─────────────────────────────────────────────────────────────

class TestGetSettings:
    def test_returns_200(self, client):
        resp = client.get("/api/v1/settings")
        assert resp.status_code == 200

    def test_includes_schema_version(self, client):
        data = client.get("/api/v1/settings").json()
        assert "schema_version" in data

    def test_includes_api_key_boolean(self, client):
        data = client.get("/api/v1/settings").json()
        assert "anthropic_api_key_configured" in data
        assert isinstance(data["anthropic_api_key_configured"], bool)

    def test_api_key_value_never_echoed(self, client, monkeypatch):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-another-secret")
        data = client.get("/api/v1/settings").json()
        assert "sk-ant-another-secret" not in str(data)
        assert data["anthropic_api_key_configured"] is True

    def test_returns_false_when_no_api_key(self, client, monkeypatch):
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        data = client.get("/api/v1/settings").json()
        assert data["anthropic_api_key_configured"] is False


# ─────────────────────────────────────────────────────────────
# PATCH /api/v1/settings
# ─────────────────────────────────────────────────────────────

class TestUpdateSettings:
    def test_returns_200(self, client):
        resp = client.patch(
            "/api/v1/settings",
            json={"settings": {"some_key": "some_value"}},
        )
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    def test_empty_settings_returns_200(self, client):
        resp = client.patch("/api/v1/settings", json={"settings": {}})
        assert resp.status_code == 200

    def test_missing_settings_key_returns_422(self, client):
        resp = client.patch("/api/v1/settings", json={})
        assert resp.status_code == 422


# ─────────────────────────────────────────────────────────────
# GET /api/v1/models
# ─────────────────────────────────────────────────────────────

class TestListModels:
    def test_returns_empty_models_list(self, client):
        resp = client.get("/api/v1/models")
        assert resp.status_code == 200
        assert resp.json()["models"] == []

    def test_returns_inserted_model(self, seeded_client):
        resp = seeded_client["client"].get("/api/v1/models")
        models = resp.json()["models"]
        assert len(models) == 1
        assert models[0]["model"] == "test-model"
        assert models[0]["default_flag"] == 1


# ─────────────────────────────────────────────────────────────
# GET /api/v1/system-types
# ─────────────────────────────────────────────────────────────

class TestSystemTypes:
    def test_returns_seeded_types(self, client):
        resp = client.get("/api/v1/system-types")
        assert resp.status_code == 200
        types = resp.json()
        assert len(types) > 0

    def test_all_seed_type_names_present(self, client):
        resp = client.get("/api/v1/system-types")
        type_names = {t["type_name"] for t in resp.json()}
        assert "application_log" in type_names
        assert "company_info" in type_names
        assert "application_document" in type_names

    def test_filter_by_type_name(self, client):
        resp = client.get("/api/v1/system-types?type_name=application_log")
        assert resp.status_code == 200
        types = resp.json()
        assert all(t["type_name"] == "application_log" for t in types)

    def test_application_log_seed_values(self, client):
        resp = client.get("/api/v1/system-types?type_name=application_log")
        values = {t["type_value"] for t in resp.json()}
        assert "status_change" in values
        assert "prompt" in values
        assert "general" in values

    def test_prompt_subtype_seeds_present(self, client):
        resp = client.get("/api/v1/system-types?type_name=application_log")
        values = {t["type_value"] for t in resp.json()}
        assert "prompt_eval" in values
        assert "prompt_orgsummary" in values
        assert "prompt_resume" in values
        assert "prompt_cover" in values

    def test_unknown_type_name_returns_empty(self, client):
        resp = client.get("/api/v1/system-types?type_name=nonexistent")
        assert resp.status_code == 200
        assert resp.json() == []


# ─────────────────────────────────────────────────────────────
# GET /api/v1/llm-call-log
# ─────────────────────────────────────────────────────────────

class TestLlmCallLog:
    def test_returns_empty_list_initially(self, client):
        resp = client.get("/api/v1/llm-call-log")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_returns_log_entries(self, seeded_client):
        database.insert_llm_call_log(
            llm_model_id=seeded_client["model_id"],
            call_type="evaluation",
            success=1,
            job_id=seeded_client["job_id"],
        )
        resp = seeded_client["client"].get("/api/v1/llm-call-log")
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    def test_filter_by_job_id(self, seeded_client):
        job2_id, _ = database.upsert_job("Other Corp", "Dev", "backend")
        database.insert_llm_call_log(
            llm_model_id=seeded_client["model_id"],
            call_type="evaluation",
            success=1,
            job_id=seeded_client["job_id"],
        )
        database.insert_llm_call_log(
            llm_model_id=seeded_client["model_id"],
            call_type="evaluation",
            success=1,
            job_id=job2_id,
        )
        resp = seeded_client["client"].get(
            f"/api/v1/llm-call-log?job_id={seeded_client['job_id']}"
        )
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    def test_limit_parameter(self, seeded_client):
        for _ in range(5):
            database.insert_llm_call_log(
                llm_model_id=seeded_client["model_id"],
                call_type="evaluation",
                success=1,
            )
        resp = seeded_client["client"].get("/api/v1/llm-call-log?limit=3")
        assert resp.status_code == 200
        assert len(resp.json()) == 3

    def test_limit_out_of_range_returns_422(self, client):
        resp = client.get("/api/v1/llm-call-log?limit=9999")
        assert resp.status_code == 422
