"""
tests/routes/test_models.py
Integration tests for LLM model management routes.

Routes covered:
  GET    /api/v1/models
  POST   /api/v1/models
  PATCH  /api/v1/models/{id}
  DELETE /api/v1/models/{id}
  POST   /api/v1/models/{id}/set-default
  POST   /api/v1/models/check-availability
"""

import pytest
import database


@pytest.fixture
def server_client(client):
    """client with a pre-created local server."""
    sid = database.create_server("Test Server", "http://localhost:11434", "local")
    return {"client": client, "server_id": sid}


@pytest.fixture
def model_client(server_client):
    """server_client with one model pre-inserted."""
    mid = database.insert_llm_model(
        "llama3:8b",
        server_client["server_id"],
        default_flag=1,
        available=1,
    )
    return {**server_client, "model_id": mid}


# ─────────────────────────────────────────────────────────────
# GET /api/v1/models
# ─────────────────────────────────────────────────────────────

class TestListModels:
    def test_returns_empty_list_when_no_models(self, client):
        resp = client.get("/api/v1/models")
        assert resp.status_code == 200
        assert resp.json()["models"] == []

    def test_returns_model_with_server_join_fields(self, model_client):
        resp = model_client["client"].get("/api/v1/models")
        models = resp.json()["models"]
        assert len(models) == 1
        m = models[0]
        assert m["model"] == "llama3:8b"
        # Phase 1.3: server fields come from JOIN
        assert "server_name" in m
        assert "server_type" in m
        assert m["server_name"] == "Test Server"
        assert m["server_type"] == "local"

    def test_endpoint_comes_from_server_join(self, model_client):
        resp = model_client["client"].get("/api/v1/models")
        m = resp.json()["models"][0]
        # endpoint is on llm_servers, surfaced via JOIN — not a direct llm_models column
        assert "endpoint" in m
        assert m["endpoint"] == "http://localhost:11434"

    def test_default_flag_present(self, model_client):
        resp = model_client["client"].get("/api/v1/models")
        m = resp.json()["models"][0]
        assert m["default_flag"] == 1

    def test_multiple_models_returned(self, server_client):
        c = server_client["client"]
        sid = server_client["server_id"]
        database.insert_llm_model("llama3:8b", sid, default_flag=1)
        database.insert_llm_model("mistral:7b", sid, default_flag=0)
        resp = c.get("/api/v1/models")
        assert len(resp.json()["models"]) == 2


# ─────────────────────────────────────────────────────────────
# POST /api/v1/models
# ─────────────────────────────────────────────────────────────

class TestCreateModel:
    def test_creates_model_successfully(self, server_client):
        resp = server_client["client"].post("/api/v1/models", json={
            "model": "llama3:8b",
            "server_id": server_client["server_id"],
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert "model_id" in data

    def test_invalid_server_id_returns_404(self, client):
        resp = client.post("/api/v1/models", json={
            "model": "llama3:8b",
            "server_id": 9999,
        })
        assert resp.status_code == 404

    def test_default_flag_creates_default_model(self, server_client):
        c = server_client["client"]
        sid = server_client["server_id"]
        resp = c.post("/api/v1/models", json={
            "model": "llama3:8b",
            "server_id": sid,
            "default_flag": True,
        })
        assert resp.status_code == 200
        mid = resp.json()["model_id"]
        row = dict(database.get_llm_model(mid))
        assert row["default_flag"] == 1

    def test_default_flag_clears_previous_default(self, server_client):
        c = server_client["client"]
        sid = server_client["server_id"]
        # Create first default
        r1 = c.post("/api/v1/models", json={"model": "model-a", "server_id": sid, "default_flag": True})
        mid1 = r1.json()["model_id"]
        # Create second default — should clear first
        r2 = c.post("/api/v1/models", json={"model": "model-b", "server_id": sid, "default_flag": True})
        mid2 = r2.json()["model_id"]
        assert dict(database.get_llm_model(mid1))["default_flag"] == 0
        assert dict(database.get_llm_model(mid2))["default_flag"] == 1

    def test_endpoint_field_in_body_is_ignored(self, server_client):
        # Pydantic ignores unknown fields — verify model is still created cleanly
        resp = server_client["client"].post("/api/v1/models", json={
            "model": "llama3:8b",
            "server_id": server_client["server_id"],
            "endpoint": "http://should-be-ignored:11434",
        })
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    def test_estimated_eval_time_field_in_body_is_ignored(self, server_client):
        resp = server_client["client"].post("/api/v1/models", json={
            "model": "llama3:8b",
            "server_id": server_client["server_id"],
            "estimated_eval_time": 120,
        })
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    def test_model_weight_defaults_to_one(self, server_client):
        resp = server_client["client"].post("/api/v1/models", json={
            "model": "llama3:8b",
            "server_id": server_client["server_id"],
        })
        mid = resp.json()["model_id"]
        assert dict(database.get_llm_model(mid))["model_weight"] == 1


# ─────────────────────────────────────────────────────────────
# PATCH /api/v1/models/{id}
# ─────────────────────────────────────────────────────────────

class TestUpdateModel:
    def test_updates_model_name(self, model_client):
        c = model_client["client"]
        mid = model_client["model_id"]
        resp = c.patch(f"/api/v1/models/{mid}", json={"model": "llama3:70b"})
        assert resp.status_code == 200
        assert resp.json()["success"] is True
        assert dict(database.get_llm_model(mid))["model"] == "llama3:70b"

    def test_sets_default_flag(self, server_client):
        c = server_client["client"]
        sid = server_client["server_id"]
        mid1 = database.insert_llm_model("model-a", sid, default_flag=1)
        mid2 = database.insert_llm_model("model-b", sid, default_flag=0)
        resp = c.patch(f"/api/v1/models/{mid2}", json={"default_flag": True})
        assert resp.status_code == 200
        assert dict(database.get_llm_model(mid2))["default_flag"] == 1

    def test_updates_model_weight(self, model_client):
        c = model_client["client"]
        mid = model_client["model_id"]
        resp = c.patch(f"/api/v1/models/{mid}", json={"model_weight": 3})
        assert resp.status_code == 200
        assert dict(database.get_llm_model(mid))["model_weight"] == 3

    def test_returns_404_for_unknown_model(self, client):
        resp = client.patch("/api/v1/models/9999", json={"model": "test"})
        assert resp.status_code == 404

    def test_empty_body_returns_400(self, model_client):
        resp = model_client["client"].patch(f"/api/v1/models/{model_client['model_id']}", json={})
        assert resp.status_code == 400

    def test_server_id_not_patchable(self, server_client):
        c = server_client["client"]
        sid = server_client["server_id"]
        mid = database.insert_llm_model("llama3:8b", sid, default_flag=1)
        # Create a second server — patching server_id should have no effect (field not in UpdateModelRequest)
        sid2 = database.create_server("Other Server", "http://192.168.1.20:11434", "local")
        resp = c.patch(f"/api/v1/models/{mid}", json={"model": "llama3:8b", "server_id": sid2})
        assert resp.status_code == 200
        # server_id must remain unchanged
        assert dict(database.get_llm_model(mid))["server_id"] == sid


# ─────────────────────────────────────────────────────────────
# DELETE /api/v1/models/{id}
# ─────────────────────────────────────────────────────────────

class TestDeleteModel:
    def test_deletes_model_successfully(self, server_client):
        c = server_client["client"]
        sid = server_client["server_id"]
        mid1 = database.insert_llm_model("model-a", sid, default_flag=1)
        mid2 = database.insert_llm_model("model-b", sid, default_flag=0)
        resp = c.delete(f"/api/v1/models/{mid2}")
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    def test_deleted_model_not_in_list(self, server_client):
        c = server_client["client"]
        sid = server_client["server_id"]
        mid1 = database.insert_llm_model("model-a", sid, default_flag=1)
        mid2 = database.insert_llm_model("model-b", sid, default_flag=0)
        c.delete(f"/api/v1/models/{mid2}")
        models = c.get("/api/v1/models").json()["models"]
        assert all(m["id"] != mid2 for m in models)

    def test_only_default_model_returns_409(self, model_client):
        resp = model_client["client"].delete(f"/api/v1/models/{model_client['model_id']}")
        assert resp.status_code == 409

    def test_returns_404_for_unknown_model(self, client):
        resp = client.delete("/api/v1/models/9999")
        assert resp.status_code == 404


# ─────────────────────────────────────────────────────────────
# POST /api/v1/models/{id}/set-default
# ─────────────────────────────────────────────────────────────

class TestSetDefaultModel:
    def test_sets_model_as_default(self, server_client):
        c = server_client["client"]
        sid = server_client["server_id"]
        mid1 = database.insert_llm_model("model-a", sid, default_flag=1)
        mid2 = database.insert_llm_model("model-b", sid, default_flag=0)
        resp = c.post(f"/api/v1/models/{mid2}/set-default")
        assert resp.status_code == 200
        assert resp.json()["success"] is True
        assert dict(database.get_llm_model(mid2))["default_flag"] == 1
        assert dict(database.get_llm_model(mid1))["default_flag"] == 0

    def test_returns_404_for_unknown_model(self, client):
        resp = client.post("/api/v1/models/9999/set-default")
        assert resp.status_code == 404
