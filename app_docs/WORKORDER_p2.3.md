# AIstivus — Phase 2.3 Workorder
> Status: Planned
> Last updated: 2026-06-17

---

## Goal

Replace the meaningless `server_type = 'local'` label in `llm_servers` with a protocol
discriminator (`'ollama'` | `'openai-compat'` | `'anthropic'`). Add support for
OpenAI-compatible endpoints (llama.cpp, LM Studio, vLLM, etc.) which use
`/v1/chat/completions` instead of Ollama's `/api/chat`. Add auto-detection of server
type when a URL is entered in Settings.

**Motivation:** The app was originally designed assuming the LLM ran on the same device
as the app. The new deployment model is a Docker container that reaches out to LLM
servers on the local network (e.g., `http://192.168.1.x:11434`). The "local" label
encoded network scope, which was never useful — the base URL already encodes that.
What `llm_client.py` actually needs to dispatch correctly is the API protocol the
server speaks.

---

## Pre-Work

- Check `memory/MEMORY.md` for the current test baseline before starting
- Baseline at design time: 629 backend / 263 frontend
- Step order: 1 → 2 → 3 → 4 → 5 (each step depends on the previous)

---

## Step 1 — DB Migration: Repurpose `server_type`

**Goal:** Rename the existing `'local'` value to `'ollama'` so the column encodes
protocol, not network scope. Update the column default.

### 1.1 Delta migration in `database.py` `init_db()`

Add to the existing delta migration block:

```python
conn.execute(
    "UPDATE llm_servers SET server_type = 'ollama' WHERE server_type = 'local'"
)
```

### 1.2 UPDATE CREATE TABLE default

In the `llm_servers` DDL, change:

```sql
server_type TEXT NOT NULL DEFAULT 'local',
```

to:

```sql
server_type TEXT NOT NULL DEFAULT 'ollama',
```

This only affects new rows — existing rows are handled by the migration above.

### 1.3 Update `seed_llm_models_from_config()`

The seed function inserts `server_type = 'local'` when bootstrapping from `config.yaml`.
Change the literal to `'ollama'`.

### Valid values going forward

| Value | Meaning |
|---|---|
| `'ollama'` | Ollama server — uses `/api/chat` |
| `'openai-compat'` | OpenAI-compatible server (llama.cpp, LM Studio, vLLM) — uses `/v1/chat/completions` |
| `'anthropic'` | Anthropic cloud API — no `endpoint` field needed |

### Files touched
- `database.py` — delta migration + DDL default + seed function

---

## Step 2 — `llm_client.py`: Add OpenAI-Compatible Provider

**Goal:** Add a complete call + stream path for OpenAI-compatible endpoints. These
servers accept the standard OpenAI request format and return the standard OpenAI
response shape — they differ from Ollama on endpoint path, request structure, and
response parsing.

### 2.1 Add provider constant

```python
PROVIDER_OPENAI_COMPAT = "openai-compat"
```

### 2.2 Request/response differences vs Ollama

| | Ollama | OpenAI-compat |
|---|---|---|
| Endpoint | `/api/chat` | `/v1/chat/completions` |
| Temperature | nested in `options: { temperature: 0 }` | top-level `"temperature": 0` |
| Response content | `response["message"]["content"]` | `response["choices"][0]["message"]["content"]` |
| Token counts | `eval_count` / `prompt_eval_count` | `usage.completion_tokens` / `usage.prompt_tokens` / `usage.total_tokens` |
| Stream token | `response["message"]["content"]` | `response["choices"][0]["delta"]["content"]` |

### 2.3 Add `_call_openai_compat()`

Mirror the structure of `_call_ollama()`:
- POST to `{base_url}/v1/chat/completions`
- Request body: `{ model, messages: [{role: "system", ...}, {role: "user", ...}], stream: false, temperature: 0, max_tokens }`
- Parse `choices[0].message.content`
- Map `usage.*` to token count fields
- Same error handling contract as `_call_ollama()`

### 2.4 Add `_stream_openai_compat()`

Mirror `_stream_ollama()`:
- POST with `stream: true`
- Parse SSE lines: `data: {...}` → extract `choices[0].delta.content`
- Terminate on `data: [DONE]`

### 2.5 Update `complete()` and `complete_stream()` dispatch

Add `elif provider == PROVIDER_OPENAI_COMPAT:` branch in both functions.

### 2.6 Add `check_openai_compat_health()`

```python
async def check_openai_compat_health(base_url: str) -> dict[str, Any]:
```

GET `{base_url}/v1/models` — if 200, return `{ available: True, models: [...] }`.
Mirror the return shape of `check_ollama_health()` so callers can treat them
interchangeably.

### Files touched
- `llm_client.py` — new constant, two new private functions, dispatch updates, new health check

---

## Step 3 — `main.py`: Protocol-Aware Health Checks + Remove Localhost Defaults

**Goal:** The server health check endpoint currently assumes Ollama. Make it dispatch
based on `server_type`. Remove any remaining hardcoded `localhost` defaults.

### 3.1 Server health check endpoint

The existing health check route reads a server record and calls `check_ollama_health()`.
Update to dispatch based on `server.server_type`:

```python
if server["server_type"] == "ollama":
    result = await llm_client.check_ollama_health(server["endpoint"])
elif server["server_type"] == "openai-compat":
    result = await llm_client.check_openai_compat_health(server["endpoint"])
elif server["server_type"] == "anthropic":
    result = await llm_client.check_anthropic_configured()
```

### 3.2 Remove localhost defaults

Audit `main.py` for any hardcoded `http://localhost:11434` or similar defaults. Remove
or replace with values sourced from the DB record. The `llm_client.complete()` default
parameter is fine to leave as a fallback in the function signature — but callers in
`main.py` should always pass the value from the DB, never rely on the default.

### Files touched
- `main.py` — health check dispatch; localhost default audit

---

## Step 4 — Frontend Settings: Server Type UI + Auto-Detection

**Goal:** When adding or editing a server in Settings, the user selects a server type
from a dropdown. A "Test Connection" button probes the URL and auto-selects the type
if it can be detected. User can always override.

### 4.1 Server type dropdown

In the add/edit server form:
- Replace any existing "Local / Cloud" toggle with a dropdown:
  - `Ollama` (value: `'ollama'`)
  - `OpenAI-Compatible` (value: `'openai-compat'`) — subtitle: "llama.cpp, LM Studio, vLLM, etc."
  - `Anthropic` (value: `'anthropic'`)

### 4.2 Auto-detect on "Test Connection"

New "Test Connection" button in the server form:
1. POST to a new backend endpoint `POST /api/v1/servers/detect` with `{ url }` in body
2. Backend probes `/api/tags` (Ollama) and `/v1/models` (openai-compat) in parallel with
   a short timeout (2–3s each)
3. Returns `{ detected_type: 'ollama' | 'openai-compat' | null, reachable: bool }`
4. Frontend auto-sets the type dropdown if `detected_type` is not null; shows
   "Could not detect — please select manually" if null but reachable; shows error if
   not reachable

### 4.3 Label updates

Anywhere in the Settings UI that currently shows "Local" as a server type label,
update to display the human-readable form:
- `'ollama'` → "Ollama"
- `'openai-compat'` → "OpenAI-Compatible"
- `'anthropic'` → "Anthropic"

### 4.4 New backend endpoint

`POST /api/v1/servers/detect`
- Body: `{ url: str }`
- Probes both endpoints in parallel (asyncio gather with timeout)
- Returns `{ detected_type, reachable }`
- No auth required; URL validated to be http/https only

### Files touched
- `frontend/src/` — Settings page/components (server form)
- `frontend/src/types/` — add `ServerDetectResponse` type
- `main.py` — new `/api/v1/servers/detect` endpoint

---

## Step 5 — Tests

**Goal:** Keep the test suite green and cover the new dispatch path.

### 5.1 Existing tests to update

- Any test that asserts `server_type = 'local'` — update to `'ollama'`
- Seed/startup tests that check the default server type

### 5.2 New tests

In `tests/` (likely `test_llm_client.py` or a new `tests/routes/test_servers.py`):
- `test_openai_compat_call_success` — mock HTTP 200 with OpenAI response shape; assert
  content and token counts parsed correctly
- `test_openai_compat_call_parse_failure` — mock malformed response; assert error contract
- `test_openai_compat_health_check` — mock `/v1/models` 200; assert `available: True`
- `test_detect_endpoint_ollama` — mock `/api/tags` 200; assert `detected_type = 'ollama'`
- `test_detect_endpoint_openai_compat` — mock `/api/tags` 404, `/v1/models` 200; assert
  `detected_type = 'openai-compat'`
- `test_detect_endpoint_unreachable` — both timeout; assert `reachable: false`

### Files touched
- `tests/test_llm_client.py` — new openai-compat tests
- `tests/routes/test_servers.py` — new file for detect endpoint tests
- Any existing test file with `server_type = 'local'` assertions

---

## Deferred (Not In Scope)

- Default model selection logic — how `default_flag` is resolved when multiple models
  are available; left for a future phase
- Anthropic model listing in the UI — `check_anthropic_configured()` returns a boolean,
  not a model list; Anthropic model records are still added manually
- `SYSTEM_PROMPT_TEMPLATE` dead code in `evaluator.py` — deferred from Phase 2.2, still
  not cleaned up; low priority
