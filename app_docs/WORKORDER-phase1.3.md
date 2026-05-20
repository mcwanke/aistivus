# AIstivus — Phase 1.3 Work Order: Multi-Server LLM Management

## How to Use This File

Read `CLAUDE.md` and `PROJECT_SPEC.md` fully before doing anything.
This file defines what to build and in what order for Phase 1.3.

**Session startup prompt:**
> "Read CLAUDE.md and PROJECT_SPEC.md fully before doing anything. Today's task only:
> [paste the single item block below]
> Tell me what files you plan to touch and what changes you plan to make.
> Do not write any code until I approve your plan."

**Rules:**
- Complete ONE item at a time
- After each item, stop and wait for explicit approval
- Mark completed items `[x]` with a one-line note
- Never touch files not listed in the item's scope
- Never refactor code outside the current item's scope

---

## Phase 1.3 Goal

Give users clear, explicit control over which AI servers and models are in use.
Today the app assumes one Ollama instance; this phase adds support for multiple local
Ollama servers (e.g., different PCs on a home network) and the Anthropic cloud API,
all managed from the Settings page. Every model selection in the app shows which server
a model lives on so the user always knows what they're calling.

### What's New in Phase 1.3
- `llm_servers` table — named endpoints as first-class entities
- Anthropic API key support via `.env`, managed through Settings UI
- Settings: "Add AI/Server" popup (Local / Remote flows)
- Settings: updated "Add Model" and "Edit Model" popups (server dropdown, default checkbox)
- Settings: remove standalone "Query Endpoint" section; connection testing moves into server popup
- Fix: availability check bug (currently reports "not found" for reachable Ollama endpoints)
- Auto-import model list from Ollama servers and pre-populated Claude model list for Anthropic
- `estimated_eval_time` auto-updated from actual call latencies (no longer user-entered)
- All model dropdowns throughout the app display "Server Name — Model Name" grouped by server

### What's NOT in Phase 1.3
- OpenAI / other cloud provider support (future phase)
- Per-server rate limiting or concurrency controls
- Model capability metadata (context window, token limits)
- Typst / document management (Phase 1.4)
- Docker deployment (Phase 1.5)

---

## Design Decisions

### llm_servers table
New table: `llm_servers (id, server_name, endpoint, server_type, created_at)`

- `server_type`: `'local'` | `'anthropic'`
- `endpoint`: required for `'local'` (Ollama base URL, e.g. `http://192.168.1.10:11434`);
  `NULL` for `'anthropic'` (base URL is hardcoded in `llm_client.py`)
- `llm_models.endpoint` column is removed; `llm_models.server_id` (FK → `llm_servers.id`) added

### llm_models changes
- `endpoint` column removed (now on `llm_servers`)
- `server_id` FK column added
- `estimated_eval_time` stays in the DB but is no longer user-entered in any form;
  it is auto-updated after each successful LLM call (rolling average of last 10 call
  latencies for that model from `llm_call_log`)

### Schema wipe policy
Phase 1.3 introduces breaking schema changes (new table, column removal on `llm_models`).
Per the current project policy, the database is wiped and rebuilt from scratch — no migration
needed. All existing model config must be re-entered in Settings after the upgrade.

### Anthropic API key
- Stored in `.env` at project root as `ANTHROPIC_API_KEY` — set manually by the user, never via UI
- Read at server startup via `env_utils.load_dotenv()` (uses `python-dotenv`, already in requirements.txt)
- Never echoed in any API response or log
- The only Settings UI exposure is a read-only "API Key: ✓ Set / Not set" status indicator
- `GET /api/v1/settings/anthropic-key` returns `{ "anthropic_key_present": bool }` only — no write route

### Connection testing
- "Test Connection" button lives in the Add/Edit Server popup, not in a separate Settings section
- For `local`: `GET {endpoint}/api/tags` — success means Ollama is reachable
- For `anthropic`: lightweight `POST` to Anthropic models endpoint using the current key
- The standalone "Query Endpoint" section in Settings is removed; no replacement
- The existing Check Endpoint bug (Ollama endpoint reported unreachable when models show
  available) is fixed as part of this priority — the root cause is identified and corrected

### Auto-import model list
- After a local server is successfully tested in the popup: call `GET {endpoint}/api/tags`
  and display the returned models as a checklist. User selects which to import.
- After an Anthropic server is saved: display a hardcoded checklist of current Claude models
  (`claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`). User selects which to add.
- In both cases the user can skip import and add models manually later via "+ Add Model"

### Model selector display throughout app
- Every `<select>` for model choice uses `<optgroup>` to group options by server name
- Option label format: `Model Name` (the grouping header shows the server name)
- If only one server exists, `<optgroup>` header is still rendered for consistency

### Server deletion
- A server with one or more `llm_models` records cannot be deleted
- Backend returns 409 with message: "This server has {n} model(s). Delete or reassign them first."

### Auto-seed update
- On first startup with empty `llm_servers` and `llm_models` tables, and when `config.yaml`
  has `ollama.base_url` + `ollama.default_model`: create one `llm_servers` record
  (`server_name = "Local Ollama"`, `endpoint = base_url`, `server_type = 'local'`),
  then create one `llm_models` record pointing to it with `default_flag = 1`

---

## Priority 1 — Database: llm_servers table + llm_models update

*Schema changes. Wipe and rebuild the database after this item.*

- [x] **1. Update `database.py` — add `llm_servers` table and update `llm_models`** — schema v1.3; llm_servers table + 6 CRUD functions; llm_models updated (server_id FK, no endpoint/enabled); all queries JOIN llm_servers; seed creates server first; conftest and route tests updated to new API

  **Files:** `database.py`

  **Part A — Add `llm_servers` table in `init_db()`**

  Add the table before `llm_models`:
  ```sql
  CREATE TABLE IF NOT EXISTS llm_servers (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      server_name TEXT NOT NULL,
      endpoint    TEXT,
      server_type TEXT NOT NULL DEFAULT 'local',
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  )
  ```
  - `server_type` values: `'local'` | `'anthropic'`
  - `endpoint` is `NULL` for `server_type = 'anthropic'` (base URL hardcoded in client)
  - No UNIQUE constraint on endpoint — user may name multiple things similarly; deduplicate in UI

  **Part B — Update `llm_models` table in `init_db()`**

  Remove the `endpoint` column. Add `server_id`:
  ```sql
  CREATE TABLE IF NOT EXISTS llm_models (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      model               TEXT NOT NULL,
      server_id           INTEGER NOT NULL,
      estimated_eval_time INTEGER,
      available           INTEGER NOT NULL DEFAULT 0,
      default_flag        INTEGER NOT NULL DEFAULT 0,
      model_weight        INTEGER NOT NULL DEFAULT 1,
      created_at          TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (server_id) REFERENCES llm_servers(id)
  )
  ```

  **Part C — Add DB functions for `llm_servers`**

  Add these functions (all following existing patterns: parameterized queries, `get_connection()`):

  ```python
  def get_all_servers() -> list[sqlite3.Row]:
      """Return all llm_servers rows, ordered by server_name."""

  def get_server_by_id(server_id: int) -> sqlite3.Row | None:
      """Return a single llm_servers row, or None."""

  def create_server(server_name: str, endpoint: str | None, server_type: str) -> int:
      """Insert a new llm_servers record. Returns new id."""

  def update_server(server_id: int, server_name: str, endpoint: str | None) -> None:
      """Update server_name and endpoint for an existing server."""

  def delete_server(server_id: int) -> None:
      """Delete a server. Caller must verify no models reference it first."""

  def get_model_count_for_server(server_id: int) -> int:
      """Return count of llm_models rows with this server_id."""
  ```

  **Part D — Update existing llm_models DB functions**

  All existing functions that reference `llm_models.endpoint` must be updated:
  - `create_model()`: replace `endpoint` param with `server_id` param
  - `update_model()`: remove `endpoint`, add `server_id` (or leave server_id unchangeable on edit?)
    — leave server_id unchangeable on edit; it cannot be reassigned via update
  - Any `SELECT` that returns `endpoint` from `llm_models` must instead `JOIN llm_servers`
    and return `llm_servers.endpoint`, `llm_servers.server_name`, `llm_servers.server_type`
  - `get_all_models()` query: `SELECT lm.*, ls.server_name, ls.endpoint, ls.server_type FROM llm_models lm JOIN llm_servers ls ON ls.id = lm.server_id ORDER BY ls.server_name, lm.model`
  - `get_model_by_id()`: same JOIN pattern
  - `get_default_model()`: same JOIN pattern

  **Part E — Update auto-seed in `database.py` (if seed logic lives here)**

  If `llm_models` seeding from `config.yaml` is handled in `database.py`:
  - Check if `llm_servers` is empty AND `llm_models` is empty
  - If so, AND if config has Ollama settings: create the default server record first, then
    the model record pointing to it

  If seeding is handled in `main.py`, leave this for Priority 3.

  **Do NOT touch any other database functions.**

---

## Priority 2 — .env API Key Handling

*No schema changes. Adds startup read and a write utility for Anthropic API key.*

- [x] **2. Add `.env` read/write support for `ANTHROPIC_API_KEY`** — env_utils.py created (load_dotenv, get_env_key); main.py lifespan sets app.state.anthropic_key_present; direct dotenv import in main.py replaced with env_utils

  **Files:** `main.py` (startup), `database.py` or a new `env_utils.py`

  > **Note:** `python-dotenv==1.0.1` is already in `requirements.txt` — no new dependency
  > is needed. Use it for `load_dotenv()` rather than writing a manual parser.

  Create a small module `env_utils.py` (new file, ~40 lines):

  ```python
  """Utilities for reading and writing .env at project root."""
  import os
  from pathlib import Path
  from dotenv import load_dotenv as _dotenv_load

  ENV_PATH = Path(__file__).parent / ".env"

  def load_dotenv() -> None:
      """Load .env into os.environ (skips keys already set)."""
      _dotenv_load(dotenv_path=ENV_PATH, override=False)

  def get_env_key(key: str) -> str | None:
      """Return a key's value from os.environ, or None."""
      return os.environ.get(key)
  ```

  No `set_env_key()` — the key is managed manually by the user in `.env`, not via the UI.

  In `main.py` lifespan startup, before LLM availability check:
  ```python
  from env_utils import load_dotenv, get_env_key
  load_dotenv()
  anthropic_key = get_env_key("ANTHROPIC_API_KEY")
  app.state.anthropic_key_present = anthropic_key is not None and len(anthropic_key) > 0
  # Do NOT store the key on app.state — read it via get_env_key() at call time
  ```

  The `set_env_key()` function is used by the settings route (Priority 3) to write a new
  key value. It must:
  - Read the current `.env` file if it exists
  - Replace the existing `ANTHROPIC_API_KEY=...` line, or append if not present
  - Write atomically (write to `.env.tmp`, rename to `.env`)
  - Never log the value

  **Do NOT add any new pip dependency.** Implement the `.env` parser manually.

---

## Priority 3 — Backend: Server Management Routes

*New routes for server CRUD, connection testing, and model import.*

- [x] **3. Create server management routes in `main.py` (or a new `server_routes.py`)** — 7 routes added directly in main.py (list, create, update, delete, test, available-models, anthropic-key); CreateServerRequest/UpdateServerRequest/TestConnectionRequest Pydantic models added; httpx used for Ollama test; hardcoded Claude model list for Anthropic import flow

  **Files:** `main.py` (or new `server_routes.py` registered in `main.py`)

  If the settings routes grow large, move them to `server_routes.py`. Otherwise add to the
  existing settings route section in `main.py`. Decision: add to `main.py` for now.

  ---

  ### `GET /api/v1/settings/llm-servers`

  Call `database.get_all_servers()`. For each server, include:
  - All `llm_servers` fields
  - `model_count`: from `database.get_model_count_for_server(id)`
  - `anthropic_key_present`: `app.state.anthropic_key_present` (only on records where
    `server_type = 'anthropic'`; omit or `null` for local servers)

  Return list.

  ---

  ### `POST /api/v1/settings/llm-servers`

  **Request body:**
  ```json
  {
    "server_name": "Home Lab",
    "endpoint": "http://192.168.1.10:11434",
    "server_type": "local"
  }
  ```
  - `server_name`: required, non-empty string
  - `endpoint`: required for `server_type = 'local'`; must start with `http://` or `https://`;
    omit trailing slash; 422 if missing for local
  - `endpoint`: must be `null`/absent for `server_type = 'anthropic'`
  - `server_type`: must be `'local'` or `'anthropic'`; 422 otherwise
  - Only one `'anthropic'` server may exist; return 409 if one already exists

  Call `database.create_server(...)`. Return the created record.

  ---

  ### `PUT /api/v1/settings/llm-servers/{server_id}`

  Update `server_name` and `endpoint` only. `server_type` is immutable after creation.
  Same validation as POST for the updated fields.
  Return the updated record.

  ---

  ### `DELETE /api/v1/settings/llm-servers/{server_id}`

  - Check `database.get_model_count_for_server(server_id)`:
    - If > 0: return 409 `"This server has {n} model(s). Delete or reassign them first."`
  - Call `database.delete_server(server_id)`
  - Return `{ "success": true }`

  ---

  ### `POST /api/v1/settings/llm-servers/test`

  Test a connection *without* creating a server record. Used by the popup's "Test Connection"
  button before save.

  **Request body:**
  ```json
  {
    "server_type": "local",
    "endpoint": "http://192.168.1.10:11434"
  }
  ```

  For `server_type = 'local'`:
  - `GET {endpoint}/api/tags` with a 5-second timeout
  - Success: 200 response from Ollama → return `{ "success": true, "model_count": N }`
    where N is `len(response["models"])`
  - Failure: return `{ "success": false, "error": "Could not reach Ollama at {endpoint}" }`

  For `server_type = 'anthropic'`:
  - Check `app.state.anthropic_key_present`; if False:
    return `{ "success": false, "error": "No API key set. Enter a key first." }`
  - Make a lightweight call to Anthropic API using the current key from `get_env_key()`
    (e.g., list models or a minimal completion) via `llm_client.py`'s existing Anthropic path
  - Return `{ "success": true }` or `{ "success": false, "error": "..." }`
  - **Must catch `anthropic_sdk.AuthenticationError` explicitly** and return
    `{ "success": false, "error": "API key is invalid. Check the value in your .env file." }`
    — do not rely on the generic `APIError` catch, which gives a cryptic message

  **This is the fix for the existing "Query Endpoint" bug.** The prior implementation
  checked `{endpoint}/api/tags` but then checked for a specific Ollama JSON key incorrectly.
  This new implementation validates the response structure properly.

  ---

  ### `GET /api/v1/settings/llm-servers/{server_id}/available-models`

  Return the list of models available on this server (for the import-after-creation flow).

  For `server_type = 'local'`:
  - Call `GET {endpoint}/api/tags`; 503 if unreachable
  - Return `{ "models": ["llama3:8b", "mistral:7b", ...] }` (name strings only)

  For `server_type = 'anthropic'`:
  - Return the hardcoded known Claude model list:
    ```python
    KNOWN_ANTHROPIC_MODELS = [
        "claude-opus-4-7",
        "claude-sonnet-4-6",
        "claude-haiku-4-5-20251001",
    ]
    ```
  - Always return this list regardless of key validity (user may not have tested yet)

  ---

  ### `GET /api/v1/settings/anthropic-key`

  Return `{ "anthropic_key_present": bool }` only. Never return the key.
  No write route — the key is set manually in `.env` by the user.

  ---

  Update the route list comment at the top of `main.py` with all new routes.

---

## Priority 4 — Backend: Update Model Routes and Auto-seed

*Update existing model management to use server_id instead of endpoint.*

- [x] **4. Update model management routes and startup auto-seed** — CreateModelRequest/UpdateModelRequest updated (server_id required, default_flag added, endpoint/enabled/estimated_eval_time removed); create/update routes updated; _update_model_availability() rewritten for server-type-aware logic (anthropic → key present, local → Ollama ping); lifespan calls seed_llm_models_from_config(); tests/routes/conftest.py noop stub updated to accept app_state param

  **Files:** `main.py` (or wherever model routes live), `database.py`

  **Part A — Update `POST /api/v1/settings/models` (create model)**
  - Remove `endpoint` from the request body
  - Add `server_id` (required integer) — must reference an existing `llm_servers` record; 404 if not found
  - Remove `estimated_eval_time` from the request body (no longer user-entered)
  - Add `default_flag` as an optional boolean (default: false); if true, clear existing default first

  **Part B — Update `PUT /api/v1/settings/models/{id}` (edit model)**
  - Same changes as Part A
  - `server_id` is NOT changeable via edit (the server a model belongs to is fixed at creation)
  - `default_flag` is settable here; if set to true, clear existing default first (SELECT + UPDATE)

  **Part C — Remove `Set Default` from model list route response**
  - Any field/flag that drives the "Set Default" button in the model table row can stay
    in the response (it's still needed to show which model IS the default), but the
    "Set Default" action now lives only in the edit popup — no separate route needed

  **Part D — Update auto-seed in `main.py`**

  In the lifespan startup:
  - Check if BOTH `llm_servers` and `llm_models` tables are empty
  - If empty AND `config.yaml` has `ollama.base_url` + `ollama.default_model`:
    1. `server_id = database.create_server("Local Ollama", base_url, "local")`
    2. `database.create_model(model=default_model, server_id=server_id, default_flag=1)`
    3. Log: `"Auto-seeded default server and model from config.yaml"`
  - If only `llm_models` is empty but `llm_servers` has records: do NOT auto-seed

  **Part E — Update startup availability check**

  The current startup iterates `llm_models` and checks each model's availability.
  This must now work via the server:
  - For each `llm_models` record, get its server via JOIN
  - For `server_type = 'local'`: call `GET {server.endpoint}/api/tags` and check if
    `model.model` appears in the returned list; update `available` flag accordingly
  - For `server_type = 'anthropic'`: set `available = 1` if `anthropic_key_present` else `0`

  **Do NOT change any evaluation, profile, or application routes.**

---

## Priority 5 — Backend: estimated_eval_time Auto-Update

*Small addition to evaluator — no route changes.*

- [x] **5. Auto-update `estimated_eval_time` after each LLM call** — `get_recent_model_latencies()` and `update_model_eval_time()` added to `database.py`; rolling average of last 10 successful latencies written after each successful LLM call in `evaluator.py`; `_provider_from_endpoint` replaced with `_provider_from_server_type` to fix Anthropic null-endpoint crash; test class updated to match renamed function

  **Files:** `evaluator.py` (or wherever `llm_call_log` is written after a call)

  After each successful LLM call is written to `llm_call_log`, add a step:
  - Query the last 10 successful calls for this `llm_model_id` from `llm_call_log`:
    ```sql
    SELECT latency_ms FROM llm_call_log
    WHERE llm_model_id = ? AND success = 1
    ORDER BY timestamp DESC LIMIT 10
    ```
  - Calculate the average (integer division, round to nearest second)
  - Update `llm_models.estimated_eval_time` where `id = llm_model_id`

  Add a new DB function:
  ```python
  def update_model_eval_time(model_id: int, estimated_seconds: int) -> None:
      """Update estimated_eval_time for a model based on recent call latencies."""
  ```

  This fires on every successful evaluation. Skipped if the call failed.

---

## Priority 6 — TypeScript Interfaces

*Define all types before any frontend work.*

- [x] **6. Update and add TypeScript interfaces** — ServerType + LlmServer + ConnectionTestResult + AvailableModelsResponse + AnthropicKeyStatus added; LlmModel updated (server_id, server_name, server_type, endpoint via JOIN; endpoint/enabled direct fields removed); LlmModelHealth endpoint → server_name/server_type

  **Files:** `frontend/src/types/api.ts` (or wherever LLM types live)

  Add or update the following interfaces:

  ```typescript
  export type ServerType = 'local' | 'anthropic';

  export interface LLMServer {
    id: number;
    server_name: string;
    endpoint: string | null;
    server_type: ServerType;
    created_at: string;
    model_count: number;
    anthropic_key_present?: boolean; // only present when server_type === 'anthropic'
  }

  export interface LLMModel {
    id: number;
    model: string;
    server_id: number;
    server_name: string;      // from JOIN
    server_type: ServerType;  // from JOIN
    endpoint: string | null;  // from JOIN (null for anthropic)
    estimated_eval_time: number | null;
    available: boolean;
    default_flag: boolean;
    model_weight: number;
    created_at: string;
  }

  export interface ConnectionTestResult {
    success: boolean;
    error?: string;
    model_count?: number; // for local Ollama tests
  }

  export interface AvailableModelsResponse {
    models: string[];
  }

  export interface AnthropicKeyStatus {
    anthropic_key_present: boolean;
  }
  ```

  Remove `endpoint` from any existing `LLMModel` interface that has it as a direct field
  (it now comes via the server JOIN).

---

## Priority 7 — Frontend Hooks

*All server state and mutation logic lives in hooks.*

- [x] **7. Add/update hooks for server and model management** — useServers.ts created (useServers, useCreateServer, useUpdateServer, useDeleteServer, useTestConnection, useAvailableModels, useAnthropicKeyStatus); useSettings.ts model payloads updated (CreateModelPayload: server_id + default_flag replace endpoint/estimated_eval_time; UpdateModelPayload: endpoint/enabled/estimated_eval_time removed, default_flag added)

  **Files:** `frontend/src/hooks/useServers.ts` (new),
  `frontend/src/hooks/useModels.ts` (update if exists)

  **`useServers.ts` — new file**

  ```typescript
  useServers()
  // GET /api/v1/settings/llm-servers
  // Returns { servers, isLoading, error }
  // Stale time: 30s

  useCreateServer()
  // POST /api/v1/settings/llm-servers
  // On success: invalidate ['servers'] and ['models']

  useUpdateServer()
  // PUT /api/v1/settings/llm-servers/{id}
  // On success: invalidate ['servers'] and ['models']

  useDeleteServer()
  // DELETE /api/v1/settings/llm-servers/{id}
  // On success: invalidate ['servers'] and ['models']

  useTestConnection()
  // POST /api/v1/settings/llm-servers/test
  // Mutation only — no cache invalidation; returns ConnectionTestResult

  useAvailableModels(serverId: number | null)
  // GET /api/v1/settings/llm-servers/{id}/available-models
  // Only fires when serverId is non-null
  // Returns { models, isLoading, error }

  useAnthropicKeyStatus()
  // GET /api/v1/settings/anthropic-key
  // Returns { anthropic_key_present, isLoading }

  useSetAnthropicKey()
  // POST /api/v1/settings/anthropic-key
  // On success: invalidate ['anthropic-key'] and ['servers']
  ```

  **Update `useModels` hook (or equivalent)**
  - The `LLMModel` type now includes `server_name`, `server_type`, `endpoint` from JOIN
  - Create model mutation: remove `endpoint`, add `server_id` and `default_flag` fields
  - Update model mutation: same changes; `server_id` not included (immutable)

---

## Priority 8 — Frontend: Settings Page Changes

*Update Settings.tsx — this is the most complex frontend priority.*

- [x] **8. Update `Settings.tsx` — servers section and updated model management** — ServersSection added (table, Add/Edit/Delete server with guard); AddServerModal (Local/Anthropic tabs, Test Connection, post-save import checklist); EditServerModal; ModelRow updated (server_name via ↳, removed enabled/set-default buttons); ModelForm updated (server dropdown, default_flag checkbox, no endpoint/eval-time); QueryEndpointModal removed; "Servers" tab added to Settings nav

  **Files:** `frontend/src/pages/Settings.tsx`

  This priority has five distinct parts. Complete them in order within the same item.

  ---

  ### Part A — Add Servers section above Models section

  Insert a new "AI Servers" card above the existing Models card.

  **Server list table columns:** Server Name | Type | Endpoint | Models | Actions
  - Type: show "Local" or "Anthropic" badge
  - Endpoint: show URL for local, "—" for Anthropic
  - Models: count badge
  - Actions: "Edit" button | "Delete" button (Delete disabled if model_count > 0;
    show tooltip: "Delete all models on this server first")
  - For the Anthropic server row: show an additional "API Key: ✓ Set" / "API Key: Not set"
    indicator (green / red)

  **"+ Add AI/Server" button** (top-right of the Servers card):
  Opens the Add Server popup (see Part B).

  ---

  ### Part B — "Add AI/Server" popup

  Modal with two tabs at the top: **Local** | **Remote (Anthropic)**

  **Local tab:**
  - Server Name: text input (required)
  - Endpoint: text input, placeholder `http://192.168.1.10:11434` (required)
  - "Test Connection" button: calls `useTestConnection()` with the current field values;
    shows spinner during test; on success: "✓ Connected — {N} model(s) found";
    on failure: "✗ {error message}" in red
  - Save button (disabled until form is valid; connection test not required before save,
    but encouraged via the button state label "Save" vs "Save (untested)")
  - Cancel button

  **Remote (Anthropic) tab:**
  - Server Name: pre-filled "Anthropic Claude" (editable)
  - API Key status (read-only): shows "API Key: ✓ Set" or "API Key: Not set — add ANTHROPIC_API_KEY to your .env file"
    sourced from `useAnthropicKeyStatus()`; no input field, no write path
  - "Test Connection" button: same pattern as Local; triggers API key validation
    (if key not set, button disabled with tooltip "Set ANTHROPIC_API_KEY in .env first")
  - Only one Anthropic server may exist; if one already exists, this tab shows
    "Anthropic server already configured — use Edit to update." and disables the form
  - Save / Cancel buttons

  **After save — model import prompt:**
  After a server is created successfully, the popup transitions to an "Import Models"
  step (same modal, new content):
  - Header: "Would you like to add models from this server?"
  - Shows `useAvailableModels(newServerId)` results as a checklist
    - For local: fetched model names from Ollama
    - For Anthropic: hardcoded list (`claude-opus-4-7`, `claude-sonnet-4-6`,
      `claude-haiku-4-5-20251001`)
  - "Import Selected" button: for each checked model, call create model mutation
    with `server_id` + `model` + `default_flag = false` (unless it's the only model)
  - "Skip" button: closes the popup; user can add models manually later

  ---

  ### Part C — "Edit Server" popup

  Same fields as Add (Local or Anthropic tab, determined by `server_type`).
  - `server_type` is displayed but not editable
  - For Anthropic: same read-only key status indicator as Add tab (no input field)
  - "Test Connection" button behaves identically to Add flow
  - Save / Cancel

  ---

  ### Part D — Update "Add Model" popup

  Remove `endpoint` field. Add `server_id` selector and `default_flag` checkbox.

  Updated fields:
  - Model Name: text input (unchanged)
  - Server: `<select>` dropdown populated from `useServers()`, grouped if multiple exist
    - Option format: "Server Name (server_type)" — e.g., "Home Lab (Local)"
    - Required; no blank option
  - Default model: checkbox — "Set as default model"
    - If checked: existing default will be replaced (show note: "This will replace the
      current default model.")
  - Model Weight: number input (unchanged, default 1)
  - Remove: Est. Eval Time input (removed)
  - Remove: Endpoint input (replaced by server selector)
  - Save / Cancel

  ---

  ### Part E — Update "Edit Model" popup

  Same as Add but:
  - Server selector is shown read-only (display only; not changeable)
  - Default model checkbox present (can be set or unset)
  - Remove: "Set Default" button from the model row in the table (it's now only here)
  - Save / Cancel

  ---

  ### Part F — Remove "Query Endpoint" section

  Remove the existing "Query Endpoint" / "Check Endpoint" UI section from Settings entirely.
  Do not replace it with anything — connection testing now lives in the server popup.

  ---

  ### Part G — Update model row to show server name

  The `ModelRow` component currently shows `{model.endpoint}` as a small muted mono line
  below the model name. In Phase 1.3, `endpoint` is no longer a field on `LLMModel`
  (it moved to `llm_servers`). Replace that line with `server_name` from the JOIN.

  Updated second line of the model info block:
  - Remove: `<p className="font-mono text-xs text-muted mt-0.5 truncate">{model.endpoint}</p>`
  - Add: `<p className="font-mono text-xs text-muted mt-0.5">↳ {model.server_name}</p>`

  The `↳` prefix reads as "lives on [server]" without requiring a new column. The `server_name`
  field is available on `LLMModel` after the Priority 6 interface update.

  This change lands in the same PR as the rest of Priority 8 (after Priority 6 interface
  work is complete and `server_name` is available on the type).

  **Do NOT modify any other Settings section** (My Data, System Types, App Settings, etc.)

---

## Priority 9 — Frontend: Model Selectors Throughout App

*Update all model dropdowns to show server context.*

- [x] **9. Update model selectors throughout the app to use `<optgroup>` by server** — Evaluate.tsx and JobSearchProfile.tsx updated; models grouped by server_name (sorted alphabetically), unavailable models shown as disabled with "(unavailable)" suffix; removed stale `enabled` filter from Evaluate.tsx

  **Files:** Any page or component containing a model `<select>` dropdown.
  Audit all pages — likely candidates: `Evaluate.tsx`, `JobSearchProfile.tsx`,
  `Settings.tsx` (already updated in Priority 8), possibly others.

  For each model selector:
  - Group `<option>` elements under `<optgroup label={server_name}>` for each server
  - Option label: `{model}` (just the model name — the server is the group header)
  - Sort servers alphabetically; sort models within each server alphabetically
  - If a model has `available = false`: add ` (unavailable)` to the option text and set
    `disabled` on the option
  - Preserve all existing selection, onChange, and default-model pre-selection behavior

  **Do NOT change any other behavior of these pages.**

---

## Priority 10 — Backend Tests

- [ ] **10. Backend tests for server management routes**

  **Files:** `tests/routes/test_servers.py` (new)

  Test coverage required:

  **`GET /api/v1/settings/llm-servers`:**
  - Returns empty list when no servers
  - Returns servers with model_count correctly populated

  **`POST /api/v1/settings/llm-servers`:**
  - Happy path local: server created, correct fields returned
  - Happy path anthropic: server created, endpoint null
  - Duplicate anthropic: 409
  - Local without endpoint: 422
  - Invalid server_type: 422

  **`PUT /api/v1/settings/llm-servers/{id}`:**
  - Updates server_name and endpoint
  - server_type unchanged in response

  **`DELETE /api/v1/settings/llm-servers/{id}`:**
  - Happy path: server deleted
  - Server with models: 409

  **`POST /api/v1/settings/llm-servers/test`:**
  - Local success (mock httpx / requests GET returning Ollama response)
  - Local failure (connection error)
  - Anthropic without key: returns false + error message

  **`GET /api/v1/settings/llm-servers/{id}/available-models`:**
  - Local: returns model list from mocked Ollama response
  - Anthropic: returns hardcoded Claude model list

  **`POST /api/v1/settings/anthropic-key`:**
  - Writes to .env (mock file write); returns success + `anthropic_key_present: true`
  - Empty key: 422

  **`GET /api/v1/settings/anthropic-key`:**
  - Returns `anthropic_key_present: false` when no key in env
  - Returns `anthropic_key_present: true` when key present

  **Model routes (update existing test file):**
  In `tests/routes/test_models.py` (existing file):
  - Update fixtures to create a server first, then use `server_id` in model creation
  - Verify that `endpoint` is no longer accepted on model create/edit (422 if provided)
  - Verify `default_flag` works correctly on create and edit
  - Verify that `estimated_eval_time` is NOT accepted on create/edit (field ignored or 422)

---

## Priority 11 — Frontend Tests

- [ ] **11. Frontend tests for server management in Settings**

  **Files:** `frontend/src/pages/Settings.test.tsx` (add to existing)

  Add MSW handlers for:
  - `GET /api/v1/settings/llm-servers` → fixture with one local + one anthropic server
  - `POST /api/v1/settings/llm-servers` → success
  - `DELETE /api/v1/settings/llm-servers/{id}` → success or 409 with models
  - `POST /api/v1/settings/llm-servers/test` → success
  - `GET /api/v1/settings/llm-servers/{id}/available-models` → fixture model list
  - `GET /api/v1/settings/anthropic-key` → `{ anthropic_key_present: false }`

  Test coverage required:
  - Servers section renders with correct columns and row data
  - Delete button disabled when model_count > 0
  - "Add AI/Server" button opens popup
  - Local tab shows server name and endpoint fields
  - Remote tab shows pre-filled name and key status indicator
  - "Test Connection" button triggers test mutation and shows result inline
  - After server creation, import-models step renders checklist
  - "Skip" closes the popup
  - Anthropic server row shows key status indicator
  - Model dropdowns in Add/Edit Model popup are grouped by server (`optgroup`)

---

## Priority 12 — llm_client.py: Anthropic Async Consistency

*No route changes. No schema changes. Fixes an implementation inconsistency in `llm_client.py`.*

- [x] **12. Update `_call_anthropic()` to use `AsyncAnthropic`** — replaced sync Anthropic + asyncio.to_thread() with AsyncAnthropic + native await; added explicit AuthenticationError catch before generic APIError; removed asyncio import from _call_anthropic

  **Files:** `llm_client.py`

  The current `_call_anthropic()` creates a synchronous `anthropic_sdk.Anthropic()` client
  and runs it in a thread via `asyncio.to_thread()`. `_stream_anthropic()` already uses
  `anthropic_sdk.AsyncAnthropic()` directly. Align both paths.

  Replace:
  ```python
  client = anthropic_sdk.Anthropic(api_key=api_key)
  response = await asyncio.to_thread(
      client.messages.create, ...
  )
  ```

  With:
  ```python
  client = anthropic_sdk.AsyncAnthropic(api_key=api_key)
  response = await client.messages.create(
      model=model,
      max_tokens=max_tokens,
      system=system,
      messages=[{"role": "user", "content": prompt}],
  )
  ```

  Also add explicit `anthropic_sdk.AuthenticationError` handling before the generic
  `anthropic_sdk.APIError` catch, with message: `"API key is invalid. Check ANTHROPIC_API_KEY in .env."`

  Remove the now-unused `import asyncio` from `_call_anthropic()` if it was imported only
  for `to_thread`.

  **Do not change any other logic in `llm_client.py`.**

---

---

## Priority 13 — Routing: Pull Dashboard Outside Layout

*Structural routing change. No visual changes to other pages.*

- [x] **13. Move Dashboard route outside the `<Layout>` wrapper** — Dashboard moved to standalone route in main.tsx; all other pages remain wrapped in Layout

  **Files:** `frontend/src/main.tsx` (or wherever the router is configured)

  Currently all routes render inside `<Layout>` (which includes the left sidebar).
  Dashboard needs to be a standalone full-page experience without the sidebar.

  Change the router so:
  - The `'/'` route renders `<Dashboard />` directly (no Layout wrapper)
  - All other routes remain wrapped in `<Layout>` as before

  Example structure (exact syntax depends on how the router is currently set up):
  ```tsx
  // Dashboard — standalone, no sidebar
  { path: '/', element: <Dashboard /> }

  // All other pages — wrapped in Layout (sidebar present)
  {
    element: <Layout />,
    children: [
      { path: '/jobs', element: <Jobs /> },
      { path: '/applications', element: <Applications /> },
      // ... etc
    ]
  }
  ```

  Verify after change: navigating to `/` shows no sidebar; navigating to `/jobs` shows sidebar.

  **Do NOT change any page component other than verifying the route structure.**

---

## Priority 14 — AppHeader Component

*New reusable component. No page changes yet — used by Dashboard in Priority 15.*

- [x] **14. Create `frontend/src/components/AppHeader.tsx`** — wordmark, tagline, Settings link; pure presentational, no props; uses React Router Link; border-b border-surface2 header bar

  **Files:** `frontend/src/components/AppHeader.tsx` (new)

  A top-bar header component matching the `.header` block from `pages/index.html`,
  translated to Tailwind using the existing design tokens.

  **Visual structure (left to right):**
  - **Wordmark:** "AIstivus" — `font-serif text-accent text-2xl tracking-tight`
  - **Tagline:** "AI Job Search Helper for the Rest of Us" — `font-mono text-xs text-muted uppercase tracking-widest` (vertically aligned with wordmark baseline)
  - **Settings link** (right, `ml-auto`): links to `/settings` — `font-mono text-xs text-muted hover:text-text transition-colors`

  **Container:** `border-b border-border px-12 py-4 flex items-baseline gap-4`

  The component takes no props — it is a pure presentational header. The Settings link
  uses React Router `<Link>` (not `<a>`).

  **Do NOT build any page or other component in this priority.**

---

## Priority 15 — Dashboard Redesign

*Full redesign of Dashboard.tsx. Depends on Priority 13 (routing) and Priority 14 (AppHeader).*

- [ ] **15. Rewrite `Dashboard.tsx` — header, hero, stats bar, nav tiles**

  **Files:** `frontend/src/pages/Dashboard.tsx`

  Complete rewrite. Keep existing data fetching logic (`useQuery` for stats and health,
  `useProfileHealth`). Remove the old sidebar-era layout (`h-full overflow-y-auto p-8 max-w-4xl mx-auto`).

  ---

  ### Structure (top to bottom)

  **1. `<AppHeader />`**

  Rendered at the very top. No padding wrapper — AppHeader handles its own padding.

  ---

  **2. Hero block**

  ```
  padding: px-12 pt-18 pb-12, max-width ~760px
  ```

  - **Eyebrow:** small mono uppercase accent-dim text.
    Content: `"PHASE 1.3 — MULTI-SERVER LLM MANAGEMENT"` (static string, update when phase changes)
    Style: `font-mono text-[0.65rem] uppercase tracking-[0.14em] text-accent/60 mb-4`

  - **Headline:** `"Because companies use AI to filter "` + `<em>you.</em>`
    Style: `font-serif text-5xl leading-tight tracking-tight text-text mb-5`
    The `<em>` tag: `text-accent not-italic` (use accent color, not italic — the HTML uses italic
    but our serif font's italic weight may differ; match the visual weight)

    > Actually, use italic here: `italic text-accent`. DM Serif Display has a proper italic cut.

  - **Subtitle:** `"A local, private job search command center. Evaluate roles against your
    background, track applications, and build tailored resumes — powered by models running
    on your own machine."`
    Style: `text-base text-muted leading-relaxed font-light max-w-lg`

  ---

  **3. Stats bar**

  Horizontal row of 4 bordered cells. Max width ~600px. Margin: `mx-12 mb-12`.

  ```
  border border-border rounded-xl overflow-hidden flex
  ```

  Each stat cell (`flex-1 px-5 py-4 border-r border-border last:border-r-0`):
  - **Number:** `font-serif text-accent text-3xl leading-none mb-1` — the stat value
  - **Label:** `font-mono text-[0.65rem] uppercase tracking-widest text-muted`

  Stats and link behavior:
  | Label | Value | Link |
  |---|---|---|
  | Jobs | `stats.data.jobs` | `/jobs` |
  | Evaluations | `stats.data.evaluations` | none |
  | Applications | `stats.data.applications` | `/applications` |
  | LLM Calls | `stats.data.llm_calls` | `/llm-usage` |

  When a stat links somewhere, wrap the cell content in `<Link to={...}>` and add
  `hover:bg-surface transition-colors` to the cell.

  Show `—` for each value while loading. Show `—` (silently) on error — stats are non-critical.

  ---

  **4. Nav tiles**

  Section label + grid. Padding: `px-12 pb-18`.

  ```
  Section label: font-mono text-[0.65rem] uppercase tracking-widest text-muted/60 mb-5
  Grid: grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4 max-w-4xl
  ```

  Each tile is a `<Link>` wrapping a card div:
  ```
  bg-surface border border-border rounded-xl p-6 flex flex-col gap-2.5
  hover:border-border-focus hover:bg-surface2 hover:-translate-y-0.5
  transition-all duration-200
  ```

  Tile contents:
  - **Icon:** `text-2xl leading-none`
  - **Title:** `font-serif text-xl text-text tracking-tight`
  - **Description:** `text-[0.78rem] text-muted leading-snug`
  - **Status line** (`mt-auto pt-2 border-t border-border`):
    `font-mono text-[0.62rem] uppercase tracking-wider text-green`
    Content: `● Active`

  Five tiles (in display order):

  | Icon | Title | Description | Route |
  |---|---|---|---|
  | ⚡ | Evaluate | Paste a job description and get a structured fit assessment against your background. | `/evaluate` |
  | 💼 | Jobs | View all jobs and opportunities. Compare evaluations and re-evaluate top candidates. | `/jobs` |
  | 📁 | Applications | Track application status, add notes, and log recruiter conversations. | `/applications` |
  | 📋 | JS Profile | Build and refine your Job Search Profile — the context behind every evaluation. | `/profile` |
  | 📊 | LLM Usage | View all LLM call logs, inspect prompts, and monitor usage by model. | `/llm-usage` |

  ---

  **5. Profile Strength widget**

  Keep existing `<ProfileStrengthWidget />` component and its logic. Place it below the
  nav tiles in its own section with a label:
  ```
  Section label: PROFILE  (same mono uppercase style as "TOOLS")
  ```
  Restyled to fill the full available width (remove any `max-w` constraint from the widget
  that assumed a sidebar layout).

  ---

  **6. Model health**

  Keep existing model health section and `<ModelBadge />` component. Place below Profile
  Strength with label `MODELS`. Same restyling — full width.

  ---

  ### What to remove

  - The old `<h1 className="font-serif text-accent text-3xl">Dashboard</h1>` heading
  - The `max-w-4xl mx-auto` container that assumed sidebar context
  - The `h-full overflow-y-auto` outer wrapper (the page now scrolls naturally)

  The outer page wrapper becomes `<div className="min-h-screen bg-bg overflow-y-auto">`.

  ---

  **Do NOT change any other page or component.**

---

## Out of Scope for Phase 1.3 (Do Not Build)

- OpenAI or any other cloud provider beyond Anthropic
- Self-hosted OpenAI-compatible endpoints (LiteLLM, etc.)
- Per-server rate limiting or concurrency controls
- Model capability metadata (context window sizes, etc.)
- Automatic model pruning / cleanup of unavailable models
- Typst / document management (Phase 1.4)
- Docker deployment (Phase 1.5)

---

## API Route Summary

| Method | Route | Description |
|---|---|---|
| GET | `/api/v1/settings/llm-servers` | List all servers |
| POST | `/api/v1/settings/llm-servers` | Create server |
| PUT | `/api/v1/settings/llm-servers/{id}` | Update server name/endpoint |
| DELETE | `/api/v1/settings/llm-servers/{id}` | Delete server (fails if models exist) |
| POST | `/api/v1/settings/llm-servers/test` | Test connection (no record created) |
| GET | `/api/v1/settings/llm-servers/{id}/available-models` | Fetch importable model list |
| GET | `/api/v1/settings/anthropic-key` | Key presence status (boolean only; no write route) |

---

## Security Checklist (verify before closing each backend item)

- [ ] `ANTHROPIC_API_KEY` never appears in any log output, API response, or DB record
- [ ] `GET /api/v1/settings/anthropic-key` returns only `{ anthropic_key_present: bool }` — no write route exists
- [ ] Server connection test route does not create any DB record
- [ ] All SQL parameterized — no string interpolation
- [ ] Server deletion checks model count before deleting (no orphaned models)
- [ ] Startup key load: key read into `os.environ`, not stored on `app.state`
