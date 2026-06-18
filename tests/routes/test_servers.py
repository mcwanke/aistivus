"""
tests/routes/test_servers.py
Integration tests for LLM server management and Anthropic key routes.

Routes covered:
  GET    /api/v1/settings/llm-servers
  POST   /api/v1/settings/llm-servers
  PUT    /api/v1/settings/llm-servers/{id}
  DELETE /api/v1/settings/llm-servers/{id}
  POST   /api/v1/settings/llm-servers/test
  GET    /api/v1/settings/llm-servers/{id}/available-models
  GET    /api/v1/settings/anthropic-key
"""

from unittest.mock import AsyncMock, MagicMock, patch
import httpx

import database


# ─────────────────────────────────────────────────────────────
# GET /api/v1/settings/llm-servers
# ─────────────────────────────────────────────────────────────

class TestListServers:
    def test_returns_empty_list_when_no_servers(self, client):
        resp = client.get("/api/v1/settings/llm-servers")
        assert resp.status_code == 200
        assert resp.json()["servers"] == []

    def test_returns_created_server(self, client):
        database.create_server("Local Ollama", "http://localhost:11434", "ollama")
        resp = client.get("/api/v1/settings/llm-servers")
        servers = resp.json()["servers"]
        assert len(servers) == 1
        assert servers[0]["server_name"] == "Local Ollama"
        assert servers[0]["endpoint"] == "http://localhost:11434"
        assert servers[0]["server_type"] == "ollama"

    def test_model_count_is_correct(self, client):
        sid = database.create_server("Lab", "http://localhost:11434", "ollama")
        database.insert_llm_model("llama3:8b", sid)
        database.insert_llm_model("mistral:7b", sid)
        resp = client.get("/api/v1/settings/llm-servers")
        servers = resp.json()["servers"]
        assert servers[0]["model_count"] == 2

    def test_local_server_has_no_anthropic_key_field(self, client):
        database.create_server("Lab", "http://localhost:11434", "ollama")
        resp = client.get("/api/v1/settings/llm-servers")
        server = resp.json()["servers"][0]
        assert "anthropic_key_present" not in server

    def test_anthropic_server_includes_key_present_field(self, client, monkeypatch):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test")
        # Refresh app.state so the key is visible
        client.app.state.anthropic_key_present = True
        database.create_server("Anthropic Claude", None, "anthropic")
        resp = client.get("/api/v1/settings/llm-servers")
        server = resp.json()["servers"][0]
        assert "anthropic_key_present" in server
        assert isinstance(server["anthropic_key_present"], bool)


# ─────────────────────────────────────────────────────────────
# POST /api/v1/settings/llm-servers
# ─────────────────────────────────────────────────────────────

class TestCreateServer:
    def test_creates_local_server(self, client):
        resp = client.post("/api/v1/settings/llm-servers", json={
            "server_name": "Home Lab",
            "endpoint": "http://192.168.1.10:11434",
            "server_type": "ollama",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["server_name"] == "Home Lab"
        assert data["endpoint"] == "http://192.168.1.10:11434"
        assert data["server_type"] == "ollama"
        assert data["model_count"] == 0

    def test_creates_anthropic_server_with_null_endpoint(self, client):
        resp = client.post("/api/v1/settings/llm-servers", json={
            "server_name": "Anthropic Claude",
            "server_type": "anthropic",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["endpoint"] is None
        assert data["server_type"] == "anthropic"

    def test_https_endpoint_accepted(self, client):
        resp = client.post("/api/v1/settings/llm-servers", json={
            "server_name": "Secure Lab",
            "endpoint": "https://192.168.1.10:11434",
            "server_type": "ollama",
        })
        assert resp.status_code == 201

    def test_local_missing_endpoint_returns_422(self, client):
        resp = client.post("/api/v1/settings/llm-servers", json={
            "server_name": "No Endpoint",
            "server_type": "ollama",
        })
        assert resp.status_code == 422

    def test_local_bad_endpoint_scheme_returns_422(self, client):
        resp = client.post("/api/v1/settings/llm-servers", json={
            "server_name": "Bad",
            "endpoint": "ftp://192.168.1.10:11434",
            "server_type": "ollama",
        })
        assert resp.status_code == 422

    def test_invalid_server_type_returns_422(self, client):
        resp = client.post("/api/v1/settings/llm-servers", json={
            "server_name": "Bad Type",
            "endpoint": "http://localhost:11434",
            "server_type": "openai",
        })
        assert resp.status_code == 422

    def test_duplicate_anthropic_returns_409(self, client):
        client.post("/api/v1/settings/llm-servers", json={
            "server_name": "Anthropic Claude",
            "server_type": "anthropic",
        })
        resp = client.post("/api/v1/settings/llm-servers", json={
            "server_name": "Another Anthropic",
            "server_type": "anthropic",
        })
        assert resp.status_code == 409

    def test_created_server_persists_in_list(self, client):
        client.post("/api/v1/settings/llm-servers", json={
            "server_name": "Persist Test",
            "endpoint": "http://localhost:11434",
            "server_type": "ollama",
        })
        servers = client.get("/api/v1/settings/llm-servers").json()["servers"]
        assert any(s["server_name"] == "Persist Test" for s in servers)


# ─────────────────────────────────────────────────────────────
# PUT /api/v1/settings/llm-servers/{id}
# ─────────────────────────────────────────────────────────────

class TestUpdateServer:
    def test_updates_server_name(self, client):
        sid = database.create_server("Old Name", "http://localhost:11434", "ollama")
        resp = client.put(f"/api/v1/settings/llm-servers/{sid}", json={
            "server_name": "New Name",
            "endpoint": "http://localhost:11434",
        })
        assert resp.status_code == 200
        assert resp.json()["server_name"] == "New Name"

    def test_updates_endpoint(self, client):
        sid = database.create_server("Lab", "http://localhost:11434", "ollama")
        resp = client.put(f"/api/v1/settings/llm-servers/{sid}", json={
            "server_name": "Lab",
            "endpoint": "http://192.168.1.20:11434",
        })
        assert resp.status_code == 200
        assert resp.json()["endpoint"] == "http://192.168.1.20:11434"

    def test_server_type_unchanged_after_update(self, client):
        sid = database.create_server("Lab", "http://localhost:11434", "ollama")
        resp = client.put(f"/api/v1/settings/llm-servers/{sid}", json={
            "server_name": "Lab Updated",
            "endpoint": "http://localhost:11434",
        })
        assert resp.json()["server_type"] == "ollama"

    def test_returns_404_for_unknown_server(self, client):
        resp = client.put("/api/v1/settings/llm-servers/9999", json={
            "server_name": "Ghost",
            "endpoint": "http://localhost:11434",
        })
        assert resp.status_code == 404

    def test_response_includes_model_count(self, client):
        sid = database.create_server("Lab", "http://localhost:11434", "ollama")
        database.insert_llm_model("llama3:8b", sid)
        resp = client.put(f"/api/v1/settings/llm-servers/{sid}", json={
            "server_name": "Lab Updated",
            "endpoint": "http://localhost:11434",
        })
        assert resp.json()["model_count"] == 1


# ─────────────────────────────────────────────────────────────
# DELETE /api/v1/settings/llm-servers/{id}
# ─────────────────────────────────────────────────────────────

class TestDeleteServer:
    def test_deletes_server_successfully(self, client):
        sid = database.create_server("Temp", "http://localhost:11434", "ollama")
        resp = client.delete(f"/api/v1/settings/llm-servers/{sid}")
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    def test_deleted_server_no_longer_in_list(self, client):
        sid = database.create_server("Temp", "http://localhost:11434", "ollama")
        client.delete(f"/api/v1/settings/llm-servers/{sid}")
        servers = client.get("/api/v1/settings/llm-servers").json()["servers"]
        assert all(s["id"] != sid for s in servers)

    def test_server_with_models_returns_409(self, client):
        sid = database.create_server("In Use", "http://localhost:11434", "ollama")
        database.insert_llm_model("llama3:8b", sid)
        resp = client.delete(f"/api/v1/settings/llm-servers/{sid}")
        assert resp.status_code == 409
        assert "model" in resp.json()["detail"].lower()

    def test_returns_404_for_unknown_server(self, client):
        resp = client.delete("/api/v1/settings/llm-servers/9999")
        assert resp.status_code == 404


# ─────────────────────────────────────────────────────────────
# POST /api/v1/settings/llm-servers/test
# ─────────────────────────────────────────────────────────────

class TestServerConnectionTest:
    def test_local_success(self, client):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"models": [{"name": "llama3:8b"}, {"name": "mistral:7b"}]}

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(return_value=mock_response)

        with patch("httpx.AsyncClient", return_value=mock_client):
            resp = client.post("/api/v1/settings/llm-servers/test", json={
                "server_type": "ollama",
                "endpoint": "http://192.168.1.10:11434",
            })

        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["model_count"] == 2

    def test_local_connection_failure(self, client):
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(side_effect=httpx.ConnectError("refused"))

        with patch("httpx.AsyncClient", return_value=mock_client):
            resp = client.post("/api/v1/settings/llm-servers/test", json={
                "server_type": "ollama",
                "endpoint": "http://192.168.1.10:11434",
            })

        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is False
        assert "error" in data

    def test_local_missing_endpoint_returns_422(self, client):
        resp = client.post("/api/v1/settings/llm-servers/test", json={
            "server_type": "ollama",
        })
        assert resp.status_code == 422

    def test_anthropic_no_key_returns_failure(self, client):
        client.app.state.anthropic_key_present = False
        resp = client.post("/api/v1/settings/llm-servers/test", json={
            "server_type": "anthropic",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is False
        assert "key" in data["error"].lower()

    def test_invalid_server_type_returns_422(self, client):
        resp = client.post("/api/v1/settings/llm-servers/test", json={
            "server_type": "openai",
            "endpoint": "http://localhost:11434",
        })
        assert resp.status_code == 422


# ─────────────────────────────────────────────────────────────
# GET /api/v1/settings/llm-servers/{id}/available-models
# ─────────────────────────────────────────────────────────────

class TestAvailableModels:
    def test_anthropic_returns_hardcoded_model_list(self, client):
        sid = database.create_server("Anthropic Claude", None, "anthropic")
        resp = client.get(f"/api/v1/settings/llm-servers/{sid}/available-models")
        assert resp.status_code == 200
        models = resp.json()["models"]
        assert "claude-sonnet-4-6" in models
        assert "claude-opus-4-7" in models
        assert "claude-haiku-4-5-20251001" in models

    def test_local_returns_models_from_ollama(self, client):
        sid = database.create_server("Lab", "http://localhost:11434", "ollama")

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "models": [{"name": "llama3:8b"}, {"name": "mistral:7b"}]
        }
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(return_value=mock_response)

        with patch("httpx.AsyncClient", return_value=mock_client):
            resp = client.get(f"/api/v1/settings/llm-servers/{sid}/available-models")

        assert resp.status_code == 200
        models = resp.json()["models"]
        assert "llama3:8b" in models
        assert "mistral:7b" in models

    def test_local_returns_sorted_models(self, client):
        sid = database.create_server("Lab", "http://localhost:11434", "ollama")

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "models": [{"name": "zephyr:7b"}, {"name": "llama3:8b"}, {"name": "mistral:7b"}]
        }
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(return_value=mock_response)

        with patch("httpx.AsyncClient", return_value=mock_client):
            resp = client.get(f"/api/v1/settings/llm-servers/{sid}/available-models")

        models = resp.json()["models"]
        assert models == sorted(models)

    def test_returns_404_for_unknown_server(self, client):
        resp = client.get("/api/v1/settings/llm-servers/9999/available-models")
        assert resp.status_code == 404

    def test_local_unreachable_returns_503(self, client):
        sid = database.create_server("Lab", "http://localhost:11434", "ollama")

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(side_effect=httpx.ConnectError("refused"))

        with patch("httpx.AsyncClient", return_value=mock_client):
            resp = client.get(f"/api/v1/settings/llm-servers/{sid}/available-models")

        assert resp.status_code == 503


# ─────────────────────────────────────────────────────────────
# GET /api/v1/settings/anthropic-key
# ─────────────────────────────────────────────────────────────

# ─────────────────────────────────────────────────────────────
# openai-compat server type
# ─────────────────────────────────────────────────────────────

class TestOpenAICompatServer:
    def test_creates_openai_compat_server(self, client):
        resp = client.post("/api/v1/settings/llm-servers", json={
            "server_name": "LM Studio",
            "endpoint": "http://192.168.1.10:1234",
            "server_type": "openai-compat",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["server_type"] == "openai-compat"
        assert data["endpoint"] == "http://192.168.1.10:1234"

    def test_openai_compat_missing_endpoint_returns_422(self, client):
        resp = client.post("/api/v1/settings/llm-servers", json={
            "server_name": "LM Studio",
            "server_type": "openai-compat",
        })
        assert resp.status_code == 422

    def test_connection_test_openai_compat_success(self, client):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "data": [{"id": "llama-3.2-3b"}, {"id": "mistral-7b"}]
        }
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(return_value=mock_response)

        with patch("httpx.AsyncClient", return_value=mock_client):
            resp = client.post("/api/v1/settings/llm-servers/test", json={
                "server_type": "openai-compat",
                "endpoint": "http://192.168.1.10:1234",
            })

        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["model_count"] == 2

    def test_connection_test_openai_compat_connection_failure(self, client):
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(side_effect=httpx.ConnectError("refused"))

        with patch("httpx.AsyncClient", return_value=mock_client):
            resp = client.post("/api/v1/settings/llm-servers/test", json={
                "server_type": "openai-compat",
                "endpoint": "http://192.168.1.10:1234",
            })

        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is False
        assert "error" in data

    def test_available_models_openai_compat(self, client):
        sid = database.create_server("LM Studio", "http://192.168.1.10:1234", "openai-compat")

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "data": [{"id": "llama-3.2-3b"}, {"id": "mistral-7b"}]
        }
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(return_value=mock_response)

        with patch("httpx.AsyncClient", return_value=mock_client):
            resp = client.get(f"/api/v1/settings/llm-servers/{sid}/available-models")

        assert resp.status_code == 200
        models = resp.json()["models"]
        assert "llama-3.2-3b" in models
        assert "mistral-7b" in models


# ─────────────────────────────────────────────────────────────
# GET /api/v1/settings/anthropic-key
# ─────────────────────────────────────────────────────────────

class TestAnthropicKeyStatus:
    def test_returns_false_when_no_key(self, client):
        client.app.state.anthropic_key_present = False
        resp = client.get("/api/v1/settings/anthropic-key")
        assert resp.status_code == 200
        assert resp.json()["anthropic_key_present"] is False

    def test_returns_true_when_key_present(self, client, monkeypatch):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test-key")
        client.app.state.anthropic_key_present = True
        resp = client.get("/api/v1/settings/anthropic-key")
        assert resp.status_code == 200
        assert resp.json()["anthropic_key_present"] is True

    def test_key_value_never_echoed(self, client, monkeypatch):
        secret = "sk-ant-super-secret-key"
        monkeypatch.setenv("ANTHROPIC_API_KEY", secret)
        client.app.state.anthropic_key_present = True
        resp = client.get("/api/v1/settings/anthropic-key")
        assert secret not in str(resp.json())

    def test_response_contains_only_expected_field(self, client):
        resp = client.get("/api/v1/settings/anthropic-key")
        assert set(resp.json().keys()) == {"anthropic_key_present"}
