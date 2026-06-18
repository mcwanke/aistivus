"""
tests/test_llm_client.py
Unit tests for llm_client.py streaming support.

All network calls are mocked — no live Ollama or Anthropic connections are made.
Async generators are exercised with asyncio.run() — no pytest-asyncio needed.
"""

import asyncio
import json
import os
from unittest.mock import AsyncMock, MagicMock, patch

import llm_client


# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────

async def _collect(gen) -> list[str]:
    """Drain an async generator into a list."""
    tokens = []
    async for token in gen:
        tokens.append(token)
    return tokens


def run_stream(gen) -> list[str]:
    return asyncio.run(_collect(gen))


# ─────────────────────────────────────────────────────────────
# Ollama streaming mocks
# ─────────────────────────────────────────────────────────────

_OLLAMA_LINES = [
    json.dumps({"message": {"content": "Hello"}, "done": False}),
    json.dumps({"message": {"content": " world"}, "done": False}),
    json.dumps({"message": {"content": "!"}, "done": True}),
]


class _FakeOllamaStreamResponse:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        pass

    def raise_for_status(self):
        pass

    async def aiter_lines(self):
        for line in _OLLAMA_LINES:
            yield line


class _FakeOllamaHttpxClient:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        pass

    def stream(self, *args, **kwargs):
        return _FakeOllamaStreamResponse()


class _FakeOllamaHttpxClientError:
    """Raises on entry to simulate a connection failure."""
    async def __aenter__(self):
        raise ConnectionError("Ollama is not running")

    async def __aexit__(self, *args):
        pass


# ─────────────────────────────────────────────────────────────
# Anthropic streaming mocks
# ─────────────────────────────────────────────────────────────

_ANTHROPIC_TOKENS = ["Hello", " from", " Anthropic"]


class _FakeAnthropicStream:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        pass

    @property
    def text_stream(self):
        return self._gen()

    async def _gen(self):
        for text in _ANTHROPIC_TOKENS:
            yield text


class _FakeAnthropicMessages:
    def stream(self, **kwargs):
        return _FakeAnthropicStream()


class _FakeAsyncAnthropic:
    def __init__(self, **kwargs):
        self.messages = _FakeAnthropicMessages()


# ─────────────────────────────────────────────────────────────
# Ollama streaming tests
# ─────────────────────────────────────────────────────────────

def test_complete_stream_ollama_yields_tokens():
    with patch("llm_client.httpx.AsyncClient", return_value=_FakeOllamaHttpxClient()):
        tokens = run_stream(llm_client.complete_stream(
            prompt="Say hello",
            system="You are helpful",
            model="test-model",
            provider="ollama",
            base_url="http://localhost:11434",
        ))
    assert tokens == ["Hello", " world", "!"]


def test_complete_stream_ollama_stops_on_done():
    """Verify generator stops after the done=True chunk even if more lines follow."""
    lines_with_trailer = _OLLAMA_LINES + [
        json.dumps({"message": {"content": "SHOULD_NOT_APPEAR"}, "done": False}),
    ]

    class _TrailingLinesResponse(_FakeOllamaStreamResponse):
        async def aiter_lines(self):
            for line in lines_with_trailer:
                yield line

    class _TrailingClient(_FakeOllamaHttpxClient):
        def stream(self, *args, **kwargs):
            return _TrailingLinesResponse()

    with patch("llm_client.httpx.AsyncClient", return_value=_TrailingClient()):
        tokens = run_stream(llm_client.complete_stream(
            prompt="Say hello",
            system="You are helpful",
            model="test-model",
            provider="ollama",
            base_url="http://localhost:11434",
        ))
    assert "SHOULD_NOT_APPEAR" not in tokens
    assert tokens == ["Hello", " world", "!"]


def test_complete_stream_ollama_yields_stream_error_on_exception():
    with patch("llm_client.httpx.AsyncClient", return_value=_FakeOllamaHttpxClientError()):
        tokens = run_stream(llm_client.complete_stream(
            prompt="Say hello",
            system="You are helpful",
            model="test-model",
            provider="ollama",
            base_url="http://localhost:11434",
        ))
    assert tokens == ["[STREAM_ERROR]"]


# ─────────────────────────────────────────────────────────────
# Anthropic streaming tests
# ─────────────────────────────────────────────────────────────

def test_complete_stream_anthropic_yields_tokens():
    with patch.dict(os.environ, {"ANTHROPIC_API_KEY": "test-key"}):
        with patch("anthropic.AsyncAnthropic", _FakeAsyncAnthropic):
            tokens = run_stream(llm_client.complete_stream(
                prompt="Say hello",
                system="You are helpful",
                model="claude-haiku-4-5-20251001",
                provider="anthropic",
                base_url="",
            ))
    assert tokens == _ANTHROPIC_TOKENS


def test_complete_stream_anthropic_yields_stream_error_when_no_api_key():
    with patch.dict(os.environ, {}, clear=True):
        # Ensure ANTHROPIC_API_KEY is absent
        os.environ.pop("ANTHROPIC_API_KEY", None)
        tokens = run_stream(llm_client.complete_stream(
            prompt="Say hello",
            system="You are helpful",
            model="claude-haiku-4-5-20251001",
            provider="anthropic",
            base_url="",
        ))
    assert tokens == ["[STREAM_ERROR]"]


# ─────────────────────────────────────────────────────────────
# Unknown provider test
# ─────────────────────────────────────────────────────────────

def test_complete_stream_unknown_provider_yields_stream_error():
    tokens = run_stream(llm_client.complete_stream(
        prompt="Hello",
        system="System",
        model="some-model",
        provider="openai",
        base_url="http://example.com",
    ))
    assert tokens == ["[STREAM_ERROR]"]


# ─────────────────────────────────────────────────────────────
# OpenAI-compatible call tests
# ─────────────────────────────────────────────────────────────

def _make_openai_compat_client(response_json: dict, status_code: int = 200):
    """Return a mock httpx.AsyncClient that yields a single POST response."""
    mock_response = MagicMock()
    mock_response.status_code = status_code
    mock_response.json.return_value = response_json
    mock_response.raise_for_status = MagicMock()

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(return_value=mock_response)
    return mock_client


def test_openai_compat_call_success():
    payload = {
        "choices": [{"message": {"content": "  Hello from openai-compat  "}}],
        "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
    }
    with patch("llm_client.httpx.AsyncClient", return_value=_make_openai_compat_client(payload)):
        result = asyncio.run(llm_client.complete(
            prompt="Say hello",
            system="You are helpful",
            model="llama-3.2-3b",
            provider="openai-compat",
            base_url="http://192.168.1.10:1234",
        ))
    assert result["success"] is True
    assert result["content"] == "Hello from openai-compat"
    assert result["prompt_tokens_actual"] == 10
    assert result["completion_tokens_actual"] == 5
    assert result["total_tokens_actual"] == 15
    assert result["provider"] == "openai-compat"


def test_openai_compat_call_parse_failure():
    # Response is missing 'choices' entirely
    payload = {"error": "model not found"}
    mock_client = _make_openai_compat_client(payload)
    with patch("llm_client.httpx.AsyncClient", return_value=mock_client):
        result = asyncio.run(llm_client.complete(
            prompt="Say hello",
            system="You are helpful",
            model="llama-3.2-3b",
            provider="openai-compat",
            base_url="http://192.168.1.10:1234",
        ))
    assert result["success"] is False
    assert result["content"] == ""
    assert "response shape" in result["error"].lower()


def test_openai_compat_call_missing_usage_still_succeeds():
    """usage field is optional — servers may omit it."""
    payload = {
        "choices": [{"message": {"content": "Hello"}}],
    }
    with patch("llm_client.httpx.AsyncClient", return_value=_make_openai_compat_client(payload)):
        result = asyncio.run(llm_client.complete(
            prompt="Say hello",
            system="You are helpful",
            model="llama-3.2-3b",
            provider="openai-compat",
            base_url="http://192.168.1.10:1234",
        ))
    assert result["success"] is True
    assert result["content"] == "Hello"
    assert result["prompt_tokens_actual"] is None
    assert result["completion_tokens_actual"] is None
    assert result["total_tokens_actual"] is None


# ─────────────────────────────────────────────────────────────
# OpenAI-compatible health check tests
# ─────────────────────────────────────────────────────────────

def test_openai_compat_health_check_success():
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "data": [{"id": "llama-3.2-3b"}, {"id": "mistral-7b"}]
    }
    mock_response.raise_for_status = MagicMock()

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.get = AsyncMock(return_value=mock_response)

    with patch("llm_client.httpx.AsyncClient", return_value=mock_client):
        result = asyncio.run(llm_client.check_openai_compat_health("http://192.168.1.10:1234"))

    assert result["reachable"] is True
    assert "llama-3.2-3b" in result["models"]
    assert result["error"] is None


def test_openai_compat_health_check_connection_refused():
    import httpx

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.get = AsyncMock(side_effect=httpx.ConnectError("refused"))

    with patch("llm_client.httpx.AsyncClient", return_value=mock_client):
        result = asyncio.run(llm_client.check_openai_compat_health("http://192.168.1.10:1234"))

    assert result["reachable"] is False
    assert result["models"] == []
    assert result["error"] is not None


# ─────────────────────────────────────────────────────────────
# OpenAI-compatible streaming tests
# ─────────────────────────────────────────────────────────────

_OPENAI_COMPAT_SSE_LINES = [
    'data: ' + json.dumps({"choices": [{"delta": {"content": "Hello"}}]}),
    'data: ' + json.dumps({"choices": [{"delta": {"content": " world"}}]}),
    'data: ' + json.dumps({"choices": [{"delta": {"content": "!"}}]}),
    "data: [DONE]",
]


class _FakeOpenAICompatStreamResponse:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        pass

    def raise_for_status(self):
        pass

    async def aiter_lines(self):
        for line in _OPENAI_COMPAT_SSE_LINES:
            yield line


class _FakeOpenAICompatHttpxClient:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        pass

    def stream(self, *args, **kwargs):
        return _FakeOpenAICompatStreamResponse()


def test_complete_stream_openai_compat_yields_tokens():
    with patch("llm_client.httpx.AsyncClient", return_value=_FakeOpenAICompatHttpxClient()):
        tokens = run_stream(llm_client.complete_stream(
            prompt="Say hello",
            system="You are helpful",
            model="llama-3.2-3b",
            provider="openai-compat",
            base_url="http://192.168.1.10:1234",
        ))
    assert tokens == ["Hello", " world", "!"]


def test_complete_stream_openai_compat_stops_on_done():
    lines_with_trailer = _OPENAI_COMPAT_SSE_LINES + [
        'data: ' + json.dumps({"choices": [{"delta": {"content": "SHOULD_NOT_APPEAR"}}]}),
    ]

    class _TrailingLinesResponse(_FakeOpenAICompatStreamResponse):
        async def aiter_lines(self):
            for line in lines_with_trailer:
                yield line

    class _TrailingClient(_FakeOpenAICompatHttpxClient):
        def stream(self, *args, **kwargs):
            return _TrailingLinesResponse()

    with patch("llm_client.httpx.AsyncClient", return_value=_TrailingClient()):
        tokens = run_stream(llm_client.complete_stream(
            prompt="Say hello",
            system="You are helpful",
            model="llama-3.2-3b",
            provider="openai-compat",
            base_url="http://192.168.1.10:1234",
        ))
    assert "SHOULD_NOT_APPEAR" not in tokens
    assert tokens == ["Hello", " world", "!"]
