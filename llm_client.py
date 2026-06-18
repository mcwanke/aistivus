"""
llm_client.py
─────────────
Unified LLM abstraction layer for AIstivus.

Phase 0: Ollama only.
Phase 1+: Anthropic and OpenAI providers added here.

Rules (from CLAUDE.md):
- All LLM calls in the entire project go through this module.
- No direct Ollama or Anthropic API calls anywhere else.
- Provider routing, error handling, and response normalization
  are handled internally — callers get a clean string back.
"""

import json
import time
from typing import Any, AsyncGenerator

import httpx

# ─────────────────────────────────────────────────────────────
# Provider constants
# ─────────────────────────────────────────────────────────────

PROVIDER_OLLAMA = "ollama"
PROVIDER_ANTHROPIC = "anthropic"
PROVIDER_OPENAI_COMPAT = "openai-compat"


# ─────────────────────────────────────────────────────────────
# Main interface
# ─────────────────────────────────────────────────────────────

async def complete(
    prompt: str,
    system: str,
    model: str,
    provider: str = PROVIDER_OLLAMA,
    base_url: str = "http://localhost:11434",
    max_tokens: int = 2000,
    timeout: float = 300.0,
    think: bool = True,
    temperature: float = 0.0,
) -> dict[str, Any]:
    """
    Send a completion request to the configured LLM provider.

    Args:
        prompt:    User message content
        system:    System prompt (persona + context)
        model:     Model name e.g. "qwen2.5-coder:14b"
        provider:  LLM provider — "ollama" in Phase 0
        base_url:  Provider base URL (Ollama default: http://localhost:11434)
        max_tokens: Maximum tokens in the response
        timeout:   Request timeout in seconds (Ollama can be slow on large models)

    Returns:
        dict with keys:
            success    (bool)   — True if call succeeded and response parsed
            content    (str)    — Response text, or empty string on failure
            error      (str)    — Error message if success=False, else None
            model      (str)    — Model used
            provider   (str)    — Provider used
            latency_ms (int)    — Wall clock time for the API call in milliseconds
            prompt_tokens_actual     (int | None) — Actual input tokens from response
            completion_tokens_actual (int | None) — Actual output tokens from response
            total_tokens_actual      (int | None) — Total tokens from response
    """
    if provider == PROVIDER_OLLAMA:
        return await _call_ollama(
            prompt=prompt,
            system=system,
            model=model,
            base_url=base_url,
            max_tokens=max_tokens,
            timeout=timeout,
            think=think,
            temperature=temperature,
        )

    elif provider == PROVIDER_ANTHROPIC:
        return await _call_anthropic(
            prompt=prompt,
            system=system,
            model=model,
            max_tokens=max_tokens,
            temperature=temperature,
        )

    elif provider == PROVIDER_OPENAI_COMPAT:
        return await _call_openai_compat(
            prompt=prompt,
            system=system,
            model=model,
            base_url=base_url,
            max_tokens=max_tokens,
            timeout=timeout,
            temperature=temperature,
        )

    return _error_response(
        provider=provider,
        model=model,
        error=f"Provider '{provider}' not yet implemented.",
    )


# ─────────────────────────────────────────────────────────────
# Streaming interface
# ─────────────────────────────────────────────────────────────

async def complete_stream(
    prompt: str,
    system: str,
    model: str,
    provider: str = PROVIDER_OLLAMA,
    base_url: str = "http://localhost:11434",
    max_tokens: int = 2000,
    timeout: float = 300.0,
    temperature: float = 0.0,
) -> AsyncGenerator[str, None]:
    """
    Stream tokens from the configured LLM provider.

    Yields individual token strings as they arrive. On any unrecoverable error,
    yields the sentinel string "[STREAM_ERROR]" and stops — callers must check for it.
    """
    if provider == PROVIDER_OLLAMA:
        async for token in _stream_ollama(
            prompt=prompt,
            system=system,
            model=model,
            base_url=base_url,
            max_tokens=max_tokens,
            timeout=timeout,
        ):
            yield token
    elif provider == PROVIDER_ANTHROPIC:
        async for token in _stream_anthropic(
            prompt=prompt,
            system=system,
            model=model,
            max_tokens=max_tokens,
        ):
            yield token
    elif provider == PROVIDER_OPENAI_COMPAT:
        async for token in _stream_openai_compat(
            prompt=prompt,
            system=system,
            model=model,
            base_url=base_url,
            max_tokens=max_tokens,
            timeout=timeout,
            temperature=temperature,
        ):
            yield token
    else:
        yield "[STREAM_ERROR]"


async def _stream_ollama(
    prompt: str,
    system: str,
    model: str,
    base_url: str,
    max_tokens: int,
    timeout: float,
) -> AsyncGenerator[str, None]:
    """Stream tokens from Ollama /api/chat with stream=true."""
    url = f"{base_url.rstrip('/')}/api/chat"
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
        "stream": True,
        "options": {
            "num_predict": max_tokens,
            "num_ctx": 4096,
        },
    }
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            async with client.stream("POST", url, json=payload) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line.strip():
                        continue
                    try:
                        chunk = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    content = chunk.get("message", {}).get("content", "")
                    if content:
                        yield content
                    if chunk.get("done"):
                        return
    except Exception:
        yield "[STREAM_ERROR]"


async def _stream_anthropic(
    prompt: str,
    system: str,
    model: str,
    max_tokens: int,
) -> AsyncGenerator[str, None]:
    """Stream tokens from Anthropic using the async messages.stream() context manager."""
    import os
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        yield "[STREAM_ERROR]"
        return

    import anthropic as anthropic_sdk
    try:
        client = anthropic_sdk.AsyncAnthropic(api_key=api_key)
        async with client.messages.stream(
            model=model,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": prompt}],
        ) as stream:
            async for text in stream.text_stream:
                if text:
                    yield text
    except Exception:
        yield "[STREAM_ERROR]"


# ─────────────────────────────────────────────────────────────
# OpenAI-compatible (llama.cpp, LM Studio, vLLM, etc.)
# ─────────────────────────────────────────────────────────────

async def _call_openai_compat(
    prompt: str,
    system: str,
    model: str,
    base_url: str,
    max_tokens: int,
    timeout: float,
    temperature: float = 0.0,
) -> dict[str, Any]:
    """Call an OpenAI-compatible /v1/chat/completions endpoint."""
    url = f"{base_url.rstrip('/')}/v1/chat/completions"
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
        "stream": False,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

    start = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(url, json=payload)
            response.raise_for_status()

        latency_ms = int((time.monotonic() - start) * 1000)
        data = response.json()

        content = data["choices"][0]["message"]["content"]
        usage = data.get("usage", {})
        prompt_tokens = usage.get("prompt_tokens")
        completion_tokens = usage.get("completion_tokens")
        total_tokens = usage.get("total_tokens")

        return {
            "success": True,
            "content": content.strip(),
            "error": None,
            "model": model,
            "provider": PROVIDER_OPENAI_COMPAT,
            "latency_ms": latency_ms,
            "prompt_tokens_actual": prompt_tokens,
            "completion_tokens_actual": completion_tokens,
            "total_tokens_actual": total_tokens,
        }

    except (KeyError, IndexError) as e:
        latency_ms = int((time.monotonic() - start) * 1000)
        return _error_response(
            provider=PROVIDER_OPENAI_COMPAT,
            model=model,
            error=f"Unexpected response shape from OpenAI-compat server: {e}",
            latency_ms=latency_ms,
        )
    except httpx.TimeoutException:
        latency_ms = int((time.monotonic() - start) * 1000)
        return _error_response(
            provider=PROVIDER_OPENAI_COMPAT,
            model=model,
            error=f"Request timed out after {timeout}s.",
            latency_ms=latency_ms,
        )
    except httpx.HTTPStatusError as e:
        latency_ms = int((time.monotonic() - start) * 1000)
        return _error_response(
            provider=PROVIDER_OPENAI_COMPAT,
            model=model,
            error=f"HTTP error {e.response.status_code}: {e.response.text}",
            latency_ms=latency_ms,
        )
    except Exception as e:
        latency_ms = int((time.monotonic() - start) * 1000)
        return _error_response(
            provider=PROVIDER_OPENAI_COMPAT,
            model=model,
            error=f"Unexpected error: {type(e).__name__}: {e}",
            latency_ms=latency_ms,
        )


async def _stream_openai_compat(
    prompt: str,
    system: str,
    model: str,
    base_url: str,
    max_tokens: int,
    timeout: float,
    temperature: float = 0.0,
) -> AsyncGenerator[str, None]:
    """Stream tokens from an OpenAI-compatible /v1/chat/completions endpoint."""
    url = f"{base_url.rstrip('/')}/v1/chat/completions"
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
        "stream": True,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            async with client.stream("POST", url, json=payload) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    raw = line[len("data:"):].strip()
                    if raw == "[DONE]":
                        return
                    try:
                        chunk = json.loads(raw)
                        content = chunk["choices"][0]["delta"].get("content", "")
                        if content:
                            yield content
                    except (json.JSONDecodeError, KeyError, IndexError):
                        continue
    except Exception:
        yield "[STREAM_ERROR]"


async def check_openai_compat_health(base_url: str) -> dict[str, Any]:
    """
    Check reachability of an OpenAI-compatible server via GET /v1/models.

    Returns the same shape as check_ollama_health() so callers can treat them
    interchangeably.
    """
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{base_url.rstrip('/')}/v1/models")
            response.raise_for_status()

        data = response.json()
        models = [m["id"] for m in data.get("data", [])]

        return {
            "reachable": True,
            "models": models,
            "error": None,
        }

    except httpx.ConnectError:
        return {
            "reachable": False,
            "models": [],
            "error": "Cannot connect to server. Check the URL and ensure the server is running.",
        }
    except Exception as e:
        return {
            "reachable": False,
            "models": [],
            "error": f"Health check failed: {type(e).__name__}: {e}",
        }


# ─────────────────────────────────────────────────────────────
# Ollama
# ─────────────────────────────────────────────────────────────

async def _call_ollama(
    prompt: str,
    system: str,
    model: str,
    base_url: str,
    max_tokens: int,
    timeout: float,
    think: bool = True,
    temperature: float = 0.0,
) -> dict[str, Any]:
    """
    Call the Ollama /api/chat endpoint.
    Uses the chat format (system + user messages) for best results.
    """
    url = f"{base_url.rstrip('/')}/api/chat"
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
        "stream": False,
        "think": think,
        "options": {
            "num_predict": max_tokens,
            "num_ctx": 4096,
            "temperature": temperature,
        }
    }

    start = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(url, json=payload)
            response.raise_for_status()

        latency_ms = int((time.monotonic() - start) * 1000)
        data = response.json()

        content = (
            data.get("message", {}).get("content", "")
            or data.get("response", "")
        )

        # Ollama returns token counts in the response
        prompt_tokens = data.get("prompt_eval_count")
        completion_tokens = data.get("eval_count")
        total_tokens = (
            (prompt_tokens or 0) + (completion_tokens or 0)
            if prompt_tokens is not None and completion_tokens is not None
            else None
        )

        return {
            "success": True,
            "content": content.strip(),
            "error": None,
            "model": model,
            "provider": PROVIDER_OLLAMA,
            "latency_ms": latency_ms,
            "prompt_tokens_actual": prompt_tokens,
            "completion_tokens_actual": completion_tokens,
            "total_tokens_actual": total_tokens,
        }

    except httpx.TimeoutException:
        latency_ms = int((time.monotonic() - start) * 1000)
        return _error_response(
            provider=PROVIDER_OLLAMA,
            model=model,
            error=f"Ollama request timed out after {timeout}s. "
                  f"Try a smaller model or increase timeout.",
            latency_ms=latency_ms,
        )
    except httpx.HTTPStatusError as e:
        latency_ms = int((time.monotonic() - start) * 1000)
        return _error_response(
            provider=PROVIDER_OLLAMA,
            model=model,
            error=f"Ollama HTTP error {e.response.status_code}: {e.response.text}",
            latency_ms=latency_ms,
        )
    except Exception as e:
        latency_ms = int((time.monotonic() - start) * 1000)
        return _error_response(
            provider=PROVIDER_OLLAMA,
            model=model,
            error=f"Unexpected error calling Ollama: {type(e).__name__}: {e}",
            latency_ms=latency_ms,
        )


# ─────────────────────────────────────────────────────────────
# Anthropic
# ─────────────────────────────────────────────────────────────

async def _call_anthropic(
    prompt: str,
    system: str,
    model: str,
    max_tokens: int,
    temperature: float = 0.0,
) -> dict[str, Any]:
    """
    Call Anthropic API using the official SDK.
    API key loaded from ANTHROPIC_API_KEY environment variable.
    Never log or store the key value.
    """
    import os
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        return _error_response(
            provider=PROVIDER_ANTHROPIC,
            model=model,
            error="ANTHROPIC_API_KEY is not set. Configure it in your .env file.",
        )

    import anthropic as anthropic_sdk

    start = time.monotonic()
    try:
        client = anthropic_sdk.AsyncAnthropic(api_key=api_key)
        response = await client.messages.create(
            model=model,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": prompt}],
            temperature=temperature,
        )

        latency_ms = int((time.monotonic() - start) * 1000)
        content = response.content[0].text if response.content else ""
        prompt_tokens = response.usage.input_tokens
        completion_tokens = response.usage.output_tokens

        return {
            "success": True,
            "content": content.strip(),
            "error": None,
            "model": model,
            "provider": PROVIDER_ANTHROPIC,
            "latency_ms": latency_ms,
            "prompt_tokens_actual": prompt_tokens,
            "completion_tokens_actual": completion_tokens,
            "total_tokens_actual": prompt_tokens + completion_tokens,
        }

    except anthropic_sdk.RateLimitError as e:
        latency_ms = int((time.monotonic() - start) * 1000)
        return _error_response(
            provider=PROVIDER_ANTHROPIC,
            model=model,
            error=f"Anthropic rate limit reached. Wait a moment and retry. ({e})",
            latency_ms=latency_ms,
        )
    except anthropic_sdk.AuthenticationError:
        latency_ms = int((time.monotonic() - start) * 1000)
        return _error_response(
            provider=PROVIDER_ANTHROPIC,
            model=model,
            error="API key is invalid. Check ANTHROPIC_API_KEY in .env.",
            latency_ms=latency_ms,
        )
    except anthropic_sdk.APIError as e:
        latency_ms = int((time.monotonic() - start) * 1000)
        return _error_response(
            provider=PROVIDER_ANTHROPIC,
            model=model,
            error=f"Anthropic API error: {e}",
            latency_ms=latency_ms,
        )
    except Exception as e:
        latency_ms = int((time.monotonic() - start) * 1000)
        return _error_response(
            provider=PROVIDER_ANTHROPIC,
            model=model,
            error=f"Unexpected error calling Anthropic: {type(e).__name__}: {e}",
            latency_ms=latency_ms,
        )


# ─────────────────────────────────────────────────────────────
# Ollama health check
# ─────────────────────────────────────────────────────────────

async def check_ollama_health(base_url: str = "http://localhost:11434") -> dict[str, Any]:
    """
    Verify Ollama is running and the configured model is available.
    Called on startup — fails fast with a clear error message.

    Returns:
        dict with keys:
            reachable  (bool) — True if Ollama server is up
            model_available (bool) — True if configured model is pulled
            models     (list) — List of available model names
            error      (str | None) — Error message if reachable=False
    """
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{base_url.rstrip('/')}/api/tags")
            response.raise_for_status()

        data = response.json()
        models = [m["name"] for m in data.get("models", [])]

        return {
            "reachable": True,
            "models": models,
            "error": None,
        }

    except httpx.ConnectError:
        return {
            "reachable": False,
            "models": [],
            "error": (
                "Cannot connect to Ollama. "
                "Is it running? Try: brew services start ollama"
            ),
        }
    except Exception as e:
        return {
            "reachable": False,
            "models": [],
            "error": f"Ollama health check failed: {type(e).__name__}: {e}",
        }


def model_is_available(model: str, available_models: list[str]) -> bool:
    """
    Check if a model name is in the list of available models.
    Handles Ollama's tag format e.g. "qwen2.5-coder:14b" matches "qwen2.5-coder:14b".
    Also matches if the base name matches (without tag).
    """
    if model in available_models:
        return True
    # Try matching without tag suffix
    base = model.split(":")[0]
    return any(m.split(":")[0] == base for m in available_models)


# ─────────────────────────────────────────────────────────────
# Anthropic configuration check
# ─────────────────────────────────────────────────────────────

def check_anthropic_configured() -> bool:
    """Return True if ANTHROPIC_API_KEY is set in environment."""
    import os
    return bool(os.getenv("ANTHROPIC_API_KEY"))


# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────

def _error_response(
    provider: str,
    model: str,
    error: str,
    latency_ms: int = 0,
) -> dict[str, Any]:
    """Return a standardized error response dict."""
    return {
        "success": False,
        "content": "",
        "error": error,
        "model": model,
        "provider": provider,
        "latency_ms": latency_ms,
        "prompt_tokens_actual": None,
        "completion_tokens_actual": None,
        "total_tokens_actual": None,
    }