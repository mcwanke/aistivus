# AIstivus — Phase 2.6 QOL Pass 1 Workorder

> Status: READY FOR IMPLEMENTATION
> Last updated: 2026-08-09

---

## Goal

Phase 2.6 QOL Pass 1 eliminates friction from five high-value workflows. These are small,
independent improvements that reduce repetitive actions and improve UI polish:

1. **Combine Research Generate/Import workflow** — merge two modals into one (copy on top, paste/submit below)
2. **Combine External Eval Generate/Import workflow** — same pattern as Research
3. **Default external model for evaluations** — stop re-selecting local models in the External Eval flow
4. **Pass 2 resume output as copyable JSON** — convert freeform text to structured JSON for easier copy
5. **Staleness indicator + job status check** — show days-since-touched on Jobs list; add button to check if job still posted

**Deferred to Phase 2.6 QOL Pass 2:** Resume generation prompt simplification (Pass 1 & Pass 2 rework).
Deferred to Phase 2.6 later:** Company-forward feature, two-repo approach, prompt rework.

**Motivation:** These friction points recur frequently during application workflow. Eliminating
them speeds up job search cycles and reduces manual steps. All five are independent — can
be implemented in any order and tested in parallel.

---

## Pre-Work

- Read `memory/MEMORY.md` before starting (reference for prior decisions)
- Check `memory/ERRORS.md` for similar workflow patterns
- Current test baseline: 678 backend / 298 frontend (as of 2026-06-29)
- Execute steps in any order — no hard dependencies between them

---

## Step 1 — Combine Research Generate/Import Workflow

**Goal:** Merge the Generate Research Prompt and Import Research Prompt flows into a
single modal. Top half shows the copy interface (model selection, temperature, generate
button, copy-to-clipboard); bottom half shows the paste interface (text area, submit button).

### 1.1 Frontend: New combined modal component

Create `frontend/src/components/ResearchWorkflowModal.tsx` (or add to existing modal if one
already exists). This modal should have two sections:

**Top section (Generate):**
- Model dropdown (pre-populated from `/api/v1/llm-models`, marked with `[external]` / `[local]`)
- Temperature slider (0.0 - 2.0, default 0.3)
- "Generate Research Prompt" button (calls `POST /api/v1/jobs/{jobId}/research/generate`)
- Copyable text box with generated prompt (shows after generate completes)
- "Copy to Clipboard" button

**Bottom section (Import):**
- Large text area for pasted research output
- "Submit Research" button (calls `POST /api/v1/jobs/{jobId}/research/import`)
- Cancel/Close button

**Behavior:**
- Modal opens with top section focused (empty state)
- After generate + copy, user can optionally scroll to bottom section and paste
- Sections are independent — user can generate, close, paste later; or skip generate and paste directly

### 1.2 Frontend: Wire into Apply Workflow page

In the Apply Workflow subpage (STEP 1 — RESEARCH), replace the current two buttons with
a single "Open Research Workflow" button that opens `ResearchWorkflowModal`.

### 1.3 Backend: No changes required

Both endpoints (`/api/v1/jobs/{jobId}/research/generate` and `/api/v1/jobs/{jobId}/research/import`)
already exist. No backend work needed.

### Files touched

- `frontend/src/components/ResearchWorkflowModal.tsx` (new)
- `frontend/src/pages/ApplyWorkflow.tsx` or equivalent (wire in modal open)
- `frontend/src/types/api.ts` (if adding new response interface for modal state)

### Implementation notes

- Modal should close on successful submit or explicit close button click
- Error states should display inline (top section: generation failures; bottom section: import failures)
- Copy-to-clipboard feedback (brief toast or button state change)
- No new API endpoints needed

---

## Step 2 — Combine External Eval Generate/Import Workflow

**Goal:** Apply the same pattern as Step 1 to the External Eval flow. Merge Generate External
Eval and Import External Eval into one modal.

### 2.1 Frontend: New combined modal component

Create `frontend/src/components/ExternalEvalWorkflowModal.tsx`. Two sections:

**Top section (Generate):**
- Model dropdown (external models only — filter out `[local]` models)
- Temperature slider (0.0 - 2.0, default 0.5)
- "Generate External Eval" button (calls `POST /api/v1/jobs/{jobId}/eval/external/generate`)
- Copyable text box with generated eval prompt
- "Copy to Clipboard" button

**Bottom section (Import):**
- Large text area for pasted eval output
- "Submit External Eval" button (calls `POST /api/v1/jobs/{jobId}/eval/external/import`)
- Cancel/Close button

**Behavior:** Same as Step 1 — independent sections, user can generate → copy → paste, or
skip generate and paste directly.

### 2.2 Frontend: Wire into Apply Workflow page

In Apply Workflow (STEP 2 — EXTERNAL EVAL), replace the current two buttons with a single
"Open External Eval Workflow" button.

### 2.3 Backend: No changes required

Endpoints already exist.

### Files touched

- `frontend/src/components/ExternalEvalWorkflowModal.tsx` (new)
- `frontend/src/pages/ApplyWorkflow.tsx` or equivalent (wire in modal open)

### Implementation notes

- This modal filters the model dropdown to show external models only (infer from `llm_models.provider`
  or use a flag). Never show local Ollama models in this dropdown.
- Same error handling and copy feedback as Step 1
- No new API endpoints needed

---

## Step 3 — Default External Model for Evaluations

**Goal:** Add a user-configurable default external model for evaluation workflows. This
eliminates the repetitive "why is a local model selected?" friction when opening the External
Eval modal.

### 3.1 Backend: Store default in database

In `database.py`, add a new column to `llm_models` table:

```python
conn.execute("""
    ALTER TABLE llm_models ADD COLUMN external_default INTEGER DEFAULT 0
""")
```

This column works like `default_flag` — only one record may have `external_default = 1`.

**Enforcement rule:** Before any INSERT or UPDATE on `llm_models` that sets `external_default = 1`,
SELECT to check if another record already has it. If so, SET that record to `0` first, then set
the new one to `1`. Enforce this in `database.py`, not via DB constraints.

### 3.2 Backend: Expose in settings endpoint

In `main.py`, add to the Settings GET response:

```python
{
    "llm_models": [...],
    "external_default_model_id": int or None  # ID of the record with external_default = 1
}
```

Add a new POST endpoint `POST /api/v1/settings/external-default-model` to accept:

```python
class ExternalDefaultModelRequest(BaseModel):
    model_id: int
```

This endpoint calls `database.set_external_default_model(model_id)` which enforces the
"only one" constraint and updates the flag.

### 3.3 Frontend: App Settings UI

In Settings → LLM Models section, add a small row for each external model:

```
| Model Name              | Default for Eval? |
| gpt-4-turbo             | [radio button]    |
| claude-3-sonnet-20250101| [radio button]    |
```

Only external models should appear in this list. Clicking a radio button calls
`POST /api/v1/settings/external-default-model` with the model ID.

### 3.4 Frontend: Apply Workflow modal defaults

In `ExternalEvalWorkflowModal.tsx` (from Step 2), when the modal opens:

```typescript
const defaultModelId = settingsQuery.data?.external_default_model_id;
const [selectedModel, setSelectedModel] = useState(defaultModelId || null);
```

The dropdown pre-selects the default external model if one is set.

### Files touched

- `database.py` — add `external_default` column, add `set_external_default_model(model_id)` function
- `main.py` — add `external_default_model_id` to settings response, add `POST /api/v1/settings/external-default-model` endpoint
- `frontend/src/components/ExternalEvalWorkflowModal.tsx` — read and use `external_default_model_id`
- `frontend/src/pages/SettingsPage.tsx` — add radio-button list for external model defaults
- `frontend/src/types/api.ts` — add `external_default_model_id?: number` to Settings response type

### Implementation notes

- Only one external model can be the default at a time
- Enforce the constraint in `database.py`, not via DB trigger
- External model definition: infer from `llm_models.provider` value (e.g., `provider != 'ollama'`)
- If no default is set, dropdown shows "Select a model" and user must pick one manually (current behavior)

---

## Step 4 — Pass 2 Resume Output as Copyable JSON

**Goal:** In the resume generation workflow, convert the Pass 2 output from freeform text
to structured JSON in a pre-formatted, easily-copyable block. This eliminates the friction
of manually extracting structured data from prose.

### 4.1 Backend: Pass 2 prompt and parsing

In `prompt_generation.py`, the Pass 2 resume prompt currently generates freeform text.
Modify it to request JSON output:

```
...
Generate a revised resume (JSON format):
{
  "objective": "...",
  "sections": [
    {"title": "...", "entries": [...]},
    ...
  ],
  "improvements_made": "..."
}
```

In `evaluator.py` (or wherever Pass 2 is invoked), parse the LLM response as JSON.
If parsing fails, fall back to the current behavior (show raw text). Store the parsed
JSON separately from the LLM raw response.

### 4.2 Backend: Store Pass 2 JSON in database

In `database.py`, add a new column to `application_documents` table:

```python
conn.execute("""
    ALTER TABLE application_documents ADD COLUMN pass2_json TEXT
""")
```

After successful Pass 2 generation and JSON parse, write the structured JSON here.

### 4.3 Frontend: Display as copyable pre block

In the Resume subpage (Apply Workflow → Resume), show the Pass 2 output in a code block:

```tsx
{pass2Data && (
  <div className="mt-4">
    <h3>Pass 2 Output (Copy for further editing)</h3>
    <pre className="bg-surface2 p-4 rounded overflow-x-auto text-sm">
      {JSON.stringify(pass2Data, null, 2)}
    </pre>
    <button onClick={copyToClipboard}>Copy JSON</button>
  </div>
)}
```

**Behavior:**
- Display as indented JSON
- Copy button copies the JSON string to clipboard
- If `pass2_json` is null/empty, show the raw text fallback
- No editing in the UI — the JSON is for copy-out workflow

### Files touched

- `prompt_generation.py` — update Pass 2 prompt template to request JSON
- `evaluator.py` (or Pass 2 invocation point) — parse JSON from LLM response, handle parse failure gracefully
- `database.py` — add `pass2_json` column migration, add setter function
- `frontend/src/pages/JobDetail.tsx` or Resume subpage component — display + copy button

### Implementation notes

- If JSON parse fails, fall back to showing raw text and log a warning
- JSON output is cosmetic — internal prompts don't change; only the response format changes
- Copy-to-clipboard: use `navigator.clipboard.writeText()` with brief feedback toast
- No new API endpoints needed (existing Pass 2 generation endpoint returns this data)

---

## Step 5 — Staleness Indicator + Job Status Check Button

**Goal:** Show how long it's been since a job was last touched/updated on the Jobs list and
Job Detail page. Add a button on Job Detail to check if the job posting is still active via
crawl4ai.

### 5.1 Backend: Staleness calculation (no DB changes)

Staleness is derived from existing timestamps — no schema migration needed. Calculate as:

```python
staleness_days = (datetime.now() - max(job.date_posted, job.last_updated)).days
```

If `last_updated` is null, use `date_posted`. If both are null, show `—`.

Add a helper function in `database.py`:

```python
def get_job_staleness_days(job_id: int) -> int | None:
    # Returns days since last touch, or None if no timestamps available
```

### 5.2 Backend: Job status check endpoint

Add `POST /api/v1/jobs/{jobId}/check-status` endpoint:

```python
@app.post("/api/v1/jobs/{job_id}/check-status")
async def check_job_status(job_id: int):
    # Call crawl4ai to fetch the job URL
    # Return: { "still_available": true/false, "checked_at": timestamp }
```

This endpoint:
- Reads the job's URL from the `jobs` table
- Makes a request to crawl4ai service (configurable base URL in `config.yaml`)
- Checks if the job posting is still live (heuristic: page loads, contains job title, etc.)
- Returns a boolean result
- Stores the check timestamp (optional, for audit trail)

**Error handling:**
- If crawl4ai is unreachable, return `{ "error": "Service unavailable", "status": 503 }`
- If the URL is malformed or missing, return `{ "error": "No URL on file", "status": 400 }`

### 5.3 Frontend: Display staleness on Jobs list

On the Jobs page list view, add a "STALENESS" column after the Excitement/Score columns:

```
| Company | Role | Excitement | Agg Score | Staleness |
| Google  | SWE  | ▓▓▓▓▓      | 7.2       | 8d        |
```

Staleness is calculated and passed via the existing Jobs API endpoint (no new endpoint).

**Styling:**
- Green for < 7 days: `text-green`
- Yellow for 7-30 days: `text-yellow`
- Red for > 30 days: `text-red`
- `—` for missing timestamp

### 5.4 Frontend: Staleness badge on Job Detail page

In the Job Details Summary (top of Job Detail page), add a small badge showing staleness:

```
Posted: Aug 1, 2026 — Last touched: Aug 8, 2026 — Staleness: 1d
```

Or as a row:

```
STALENESS: 1d (last touched Aug 8)
```

### 5.5 Frontend: "Check if Still Posted" button on Job Detail

In Job Actions subpage (Job Detail → Job Details → Job Actions), add a button:

```
[Check if Still Posted] — fetches via crawl4ai
```

On click:
1. Disable the button and show "Checking..."
2. Call `POST /api/v1/jobs/{jobId}/check-status`
3. Show result as a modal or inline message:
   - ✓ "Still available" with checkmark
   - ✗ "No longer available" with warning color, optional "Archive?" prompt
4. Store the check timestamp (audit trail)

### Files touched

- `database.py` — add `get_job_staleness_days()` function, add optional audit column for check results
- `main.py` — add `POST /api/v1/jobs/{jobId}/check-status` endpoint, update Jobs list response to include staleness
- `frontend/src/pages/JobsPage.tsx` — add Staleness column to list, apply color coding
- `frontend/src/pages/JobDetail.tsx` — add Staleness badge to summary, wire check button to endpoint
- `frontend/src/types/api.ts` — add staleness_days to Job response type

### Implementation notes

- Staleness is read-only on the frontend — calculated server-side, passed in response
- Color coding: `< 7d` green, `7-30d` yellow, `> 30d` red
- Check endpoint should timeout after 10s (crawl4ai may be slow)
- Crawl4ai configuration: read from `config.yaml` under `crawl4ai.base_url` (default `http://localhost:4000`)
- If crawl4ai is not configured, the Check button should show a tooltip: "Service not configured"
- Store check results in a new optional audit log entry (optional refinement for later)

---

## Acceptance Criteria

✅ Step 1: Research workflow modal exists, both generate and import flows work, wire into Apply Workflow page
✅ Step 2: External Eval modal exists, generate and import flows work, modal filters to external models only
✅ Step 3: Default external model can be set in Settings, Apply Workflow modal reads and uses it
✅ Step 4: Pass 2 output is JSON, displays as copyable pre block, fallback to raw text on parse failure
✅ Step 5: Staleness displayed on Jobs list and Job Detail, check-status button works, handles missing crawl4ai gracefully

All steps: No new package dependencies. No breaking changes to existing API contracts (all additions).
Test baseline after completion: expect no regression (these are UX-only changes).

---

## Testing Notes

- Manual: open Research workflow modal, generate, copy, close, reopen, paste → submit
- Manual: same for External Eval modal
- Manual: set default external model in Settings, open External Eval modal, verify preselection
- Manual: trigger Pass 2 resume generation, verify JSON output and copy button
- Manual: Jobs list shows staleness, colors change based on age
- Manual: Job Detail shows staleness badge
- Manual: Click check-status button, verify result display (both success and failure cases)
- CI: no new test coverage required (these are UI-only changes); existing tests should still pass

