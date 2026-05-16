"""
tests/test_llm_client.py
Unit tests for llm_client.py streaming support.

All network calls are mocked — no live Ollama or Anthropic connections are made.
Async generators are exercised with asyncio.run() — no pytest-asyncio needed.
"""

import asyncio
import json
import os
from unittest.mock import patch

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
