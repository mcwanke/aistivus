# AIstivus — Phase 2.4 Workorder
> Status: IN PROGRESS
> Last updated: 2026-06-18

---

## Goal

Three improvements bundled as Phase 2.4:

1. **Dead code cleanup** — remove `SYSTEM_PROMPT_TEMPLATE` from `evaluator.py`, deferred since Phase 2.2
2. **Per-prompt temperature** — surface LLM temperature as a per-prompt setting stored in the DB and editable in Settings → Prompts (eval prompts only; gen prompts stored as `0.0` with no UI)
3. **Batch re-evaluation** — redesign the Applications page to show all jobs (not just active applications), add status filter pills and a batch eval action bar, and implement a live-progress modal that re-evaluates selected jobs against a chosen model

**Motivation:** Temperature was hardcoded to `0` in all LLM calls, causing score clustering when
testing local models. Batch re-eval lets the user quickly test prompt or model changes across
many JDs without navigating to each job individually. The Applications page redesign also turns it
into a true data-review surface rather than just a list of active applications.

---

## Pre-Work

- Check `memory/MEMORY.md` for the current test baseline before starting
- Baseline at design time: 647 backend / 267 frontend
- Execute steps in order — later steps depend on earlier ones

---

## Step 1 — Dead Code Cleanup

**Goal:** Remove `SYSTEM_PROMPT_TEMPLATE` from `evaluator.py`. It has had no callers since
Phase 2.2 when `prompt_generation.py` replaced the inline prompt-building logic.

### 1.1 Delete `SYSTEM_PROMPT_TEMPLATE`

In `evaluator.py`, locate and delete the `SYSTEM_PROMPT_TEMPLATE` constant. Confirm no
remaining references in any file before deleting (`grep -rn SYSTEM_PROMPT_TEMPLATE .`).

### Files touched
- `evaluator.py` — delete dead constant

---

## Step 2 — Temperature: Backend

**Goal:** Add `temperature` to the `prompts` table and thread it through every layer from
DB to LLM call. Gen prompts default to `0.0` and are never surfaced in the UI; eval prompts
default to `0.3` and will be editable in Step 3.

### 2.1 DB migration in `database.py`

Add `temperature` column to the `prompts` table DDL and delta migration:

```python
# In init_db() delta migration block:
conn.execute(
    "ALTER TABLE prompts ADD COLUMN temperature REAL NOT NULL DEFAULT 0.0"
)
```

After the migration runs, update the `eval_analysis` and `eval_scoring` seed rows to
`temperature = 0.3`. Gen prompts (`gen_resume`, `gen_cover`, `gen_orgsummary`) remain at `0.0`.

Update `save_prompt()` to accept and write `temperature`:

```python
def save_prompt(key: str, segments_text: str, note: str | None = None, temperature: float = 0.0) -> int:
```

Update `get_active_prompt()` to include `temperature` in its SELECT so callers can read it.

### 2.2 `prompt_generation.py`

`get_prompt()` currently returns `{ prompt_text, prompt_usage_id }`. Add `temperature`:

```python
return {
    "prompt_text": assembled,
    "prompt_usage_id": usage_id,
    "temperature": row["temperature"],
}
```

### 2.3 `llm_client.py`

Add `temperature: float = 0.0` parameter to both `complete()` and `complete_stream()`.
Pass it through to each private call function:

- `_call_ollama()` — already sends `options: { temperature: 0 }`, change to use param
- `_call_openai_compat()` — top-level `"temperature"` field in request body
- `_call_anthropic()` — Anthropic supports top-level `temperature`; pass it through

### 2.4 `evaluator.py`

In `evaluate_with_split()`, read `temperature` from the `prompt_generation.get_prompt()`
response for both the analysis call and the scoring call. Pass each prompt's temperature
to its respective `llm_client.complete()` call.

### 2.5 `main.py` — `PromptSaveRequest` + save route

Add `temperature` field to `PromptSaveRequest`:

```python
class PromptSaveRequest(BaseModel):
    segments_text: str
    note: str | None = None
    temperature: float = 0.0
```

Update the `save_prompt` route to pass `body.temperature` through to `database.save_prompt()`.

### Files touched
- `database.py` — delta migration, `save_prompt()` signature, `get_active_prompt()` select
- `prompt_generation.py` — return temperature in response dict
- `llm_client.py` — add `temperature` param to `complete()` / `complete_stream()` and all private call functions
- `evaluator.py` — extract and pass temperature per-call
- `main.py` — `PromptSaveRequest` + save route

---

## Step 3 — Temperature: Frontend

**Goal:** Show a temperature input in the PromptEditor for eval prompts only. Gen prompts
(`gen_resume`, `gen_cover`, `gen_orgsummary`) show no temperature UI.

### 3.1 Types (`types/api.ts`)

Add `temperature: number` to the prompt response type (whichever interface `usePrompt` returns).

### 3.2 `useSavePrompt` hook

Add `temperature: number` to the save payload sent to `POST /api/v1/prompts/{key}/save`.

### 3.3 `PromptEditor.tsx`

**Condition for showing temperature input:**

```ts
const EVAL_PROMPT_KEYS = ['eval_analysis', 'eval_scoring']
const showTemperature = EVAL_PROMPT_KEYS.includes(selectedKey)
```

**Placement:** In the header row (above the two-column editor), add a temperature input
alongside the prompt key dropdown and Save button when `showTemperature` is true:

```
[Prompt ▾]   Temp: [0.3]   [Save]   Saved (v4)
```

Use a small numeric `<input type="number" min="0" max="1" step="0.05">` with the same
mono styling as existing inputs. Local state mirrors the loaded value; dirty-tracks the
same way as segments (Save button handles both).

### Files touched
- `frontend/src/types/api.ts` — add `temperature` to prompt type
- `frontend/src/hooks/usePrompts.ts` — add temperature to save payload
- `frontend/src/components/PromptEditor.tsx` — temperature input for eval prompts

---

## Step 4 — Extract `ModelSelect` Component

**Goal:** The model selector in `Evaluate.tsx` is inline JSX. Extract it to a shared
component so both Evaluate and the batch eval modal can use it without duplication.

### 4.1 New `frontend/src/components/ModelSelect.tsx`

Props:

```ts
interface ModelSelectProps {
  models: LlmModel[]
  value: number | null
  onChange: (id: number | null) => void
  disabled?: boolean
}
```

Implement using the existing JSX from `Evaluate.tsx` — grouped by server name via
`<optgroup>`, sorted by server then model name, unavailable models disabled.

### 4.2 Update `Evaluate.tsx`

Replace the inline model selector block with `<ModelSelect ... />`.

### Files touched
- `frontend/src/components/ModelSelect.tsx` — new shared component
- `frontend/src/pages/Evaluate.tsx` — use `ModelSelect`

---

## Step 5 — Re-Evaluate Endpoint (Backend)

**Goal:** New endpoint that re-runs the full eval pipeline for a job using its stored JD.
The frontend calls this per-job during batch processing without needing to send JD text.

### 5.1 `POST /api/v1/jobs/{job_id}/re-evaluate`

Request body:
```json
{ "llm_model_id": 3 }
```

Logic:
1. Load job record — 404 if not found
2. Load the job's posting to get `job_description`. Jobs and postings are 1:1; if multiple
   exist (edge case), use the most recent.
3. If no posting or empty JD → 422 with `"No job description found for this job"`
4. Load model record for `llm_model_id` — 404 if not found; 422 if `available != 1`
5. Run the same eval pipeline as `POST /api/v1/evaluate` (delegates to `evaluator.evaluate_jd()`)
6. Return the created evaluation record (same shape as the existing evaluate response)

**Do not add a new function to `database.py`** for this — reuse existing DB helpers
(`get_job()`, `get_postings_for_job()`, `get_llm_model()`).

### Files touched
- `main.py` — new route + `ReEvaluateRequest` Pydantic model

---

## Step 6 — Applications Page Redesign (Backend)

**Goal:** The existing `GET /api/v1/applications` excludes `not-started` records. Add a
query param to include them so the redesigned page can show all jobs.

### 6.1 `GET /api/v1/applications` — add `include_not_started` query param

```python
@app.get("/api/v1/applications")
async def list_applications(request: Request, include_not_started: bool = False):
    rows = database.get_all_applications(exclude_not_started=not include_not_started)
    return JSONResponse([dict(r) for r in rows])
```

The DB function already supports `exclude_not_started` — this just exposes it.

### Files touched
- `main.py` — add query param to `list_applications`

---

## Step 7 — Applications Page Redesign (Frontend)

**Goal:** Redesign Applications to be a full job-data review surface. Show all records by
default, let the user filter by status, select rows for batch eval, and trigger the batch
modal.

### 7.1 `useApplications` hook

Add `includeNotStarted: boolean` param. When true, appends `?include_not_started=true` to
the fetch URL. The Applications page always passes `true`.

### 7.2 `Applications.tsx` — layout

```
┌─ Header (Applications · N visible of M total) ─────────────────┐
├─ Status filter pills (all ON by default, click to toggle) ──────┤
│  [not-started] [draft] [skipped] [applied] [screening]         │
│  [interview] [offer] [rejected] [ghosted] [withdrawn]          │
├─ Batch action bar (sticky, below filter row) ───────────────────┤
│  [□ Select all]  3 selected  [Model ▾]  [Re-run Evals]         │
├─ Job rows ──────────────────────────────────────────────────────┤
│  □  Acme Corp        7.2   Senior Engineer    applied          │
└────────────────────────────────────────────────────────────────┘
```

**Status filter pills:**
- All 10 statuses rendered as toggle buttons, all active on mount
- Client-side filter — does not re-fetch from server
- Clicking a pill toggles it; "N visible of M total" in header reflects filtered count

**Batch action bar:**
- Always visible (below filter pills, sticky as you scroll through the list)
- `ModelSelect` component pre-set to default model
- "Re-run Evals" button disabled until at least 1 row is checked
- Shows "N selected" count; resets when filter changes (deselects hidden rows)

**Row structure:**
- Left: checkbox (separate click target from the row body)
- Row body click: navigate to `/jobs/{job_id}` (same as current behavior)
- Row displays: company, title, status pill, agg_score_overall, apply date

### 7.3 `BatchEvalModal.tsx` — new component

**Trigger:** "Re-run Evals" button opens the modal and immediately begins processing.
The model was already selected in the action bar — no confirmation step in the modal.

**Modal layout:**

```
┌─ Batch Evaluation ──────────────────────────────────────────────┐
│  Running evaluations — Llama 3.1 8B                             │
│                                                                 │
│  5 of 12 complete                                               │
│  ████████░░░░░░░░  42%                                          │
│                                                                 │
│  Now evaluating: Acme Corp — Senior Engineer                    │
│  Estimated remaining: ~4 min                                    │
│                                                                 │
│  ✓ Globex Corp — PM                              8.2            │
│  ✓ Initech — Dev Lead                            6.5            │
│  ✗ Umbrella Corp — Analyst       [eval failed]                  │
│  ⋯ Acme Corp — Senior Engineer   running...                     │
│  ○ Vandelay Ind — Architect       pending                       │
│                                                                 │
│                               [Stop]   [Close]                  │
└─────────────────────────────────────────────────────────────────┘
```

**Processing:**
- Frontend drives sequential loop — calls `POST /api/v1/jobs/{job_id}/re-evaluate` per job
- One in-flight request at a time; do not fire parallel requests
- Time estimate: running average of `elapsed_ms / completed` × remaining count; show `—`
  until at least 1 completes; recalculated after every completed eval
- On per-job failure: mark row as failed, continue with remaining jobs (no rollback)

**Stop behavior:**
- Sets a stop flag; current in-flight call runs to completion; no further jobs are started
- Modal shows "Stopped — X of Y completed"

**Completion:**
- When all jobs finish (success or fail), modal shows final state
- Modal stays open until user dismisses ("Close" button)
- On close: invalidate React Query cache for `['applications']` and `['jobs']` so scores
  refresh in the list

**Close while running:**
- "Close" becomes "Stop & Close" while the batch is running
- Clicking it stops the batch (same as Stop) then closes

### Files touched
- `frontend/src/hooks/useApplications.ts` — add `includeNotStarted` param
- `frontend/src/pages/Applications.tsx` — full redesign
- `frontend/src/components/BatchEvalModal.tsx` — new component

---

## Step 8 — Tests

**Goal:** Cover all new backend paths and keep the frontend suite green.

### 8.1 Backend

**`tests/test_llm_client.py`:**
- `test_complete_passes_temperature_to_ollama` — assert `options.temperature` in request body
- `test_complete_passes_temperature_to_openai_compat` — assert top-level `temperature` in body
- `test_complete_passes_temperature_to_anthropic` — assert `temperature` in Anthropic request

**`tests/test_database.py`:**
- `test_save_prompt_stores_temperature` — save with explicit temperature; retrieve and assert
- `test_get_active_prompt_returns_temperature` — assert field present in returned row

**`tests/routes/test_evaluate.py` (or new `test_re_evaluate.py`):**
- `test_re_evaluate_success` — job with posting → eval created, 200 returned
- `test_re_evaluate_no_posting` — job with no posting → 422
- `test_re_evaluate_job_not_found` → 404
- `test_re_evaluate_model_unavailable` → 422

**`tests/routes/test_applications.py` (or `test_routes.py`):**
- `test_list_applications_excludes_not_started_by_default`
- `test_list_applications_includes_not_started_when_param_set`

### 8.2 Frontend

**`ModelSelect.test.tsx`:**
- Renders options grouped by server
- Calls `onChange` with correct model id on select
- Disables unavailable models

**`Applications.test.tsx`:**
- Status filter pills: all ON by default; toggling a pill hides matching rows
- Checkbox: selecting rows enables Re-run button; select-all selects all visible rows
- Row click navigates to job detail; checkbox click does not navigate

**`BatchEvalModal.test.tsx`:**
- Renders with correct job count
- Calls re-evaluate endpoint sequentially (not in parallel)
- Shows failed row on API error, continues processing
- Stop button halts after current in-flight call
- Close button available after completion

### Files touched
- `tests/test_llm_client.py`
- `tests/test_database.py`
- `tests/routes/` — new or updated files for re-evaluate and applications endpoints
- `frontend/src/components/ModelSelect.test.tsx` — new
- `frontend/src/pages/Applications.test.tsx` — updated
- `frontend/src/components/BatchEvalModal.test.tsx` — new

---

## Deferred (Not In Scope)

- Temperature UI for gen prompts — stored as `0.0`, no UI (gen prompts are not executed by
  the app; the user pastes assembled text into an external model manually)
- Parallel batch execution — sequential only for Phase 2.4; parallel is a future optimization
- Score distribution summary on the Applications page — aggregate stats across visible rows;
  considered during design, deferred to a future phase
- Workorder cleanup — after Phase 2.4 ships, archive or consolidate old Phase 2.x workorders
  in `app_docs/`
