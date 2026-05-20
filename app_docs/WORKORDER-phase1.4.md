# AIstivus — Phase 1.4 Work Order: Settings Improvements + Job Lifecycle

## How to Use This File

Read `CLAUDE.md` and `PROJECT_SPEC.md` fully before doing anything.
This file defines what to build and in what order for Phase 1.4.

**Session startup prompt:**
> "Read CLAUDE.md and PROJECT_SPEC.md and app_docs/WORKORDER-phase1.4.md fully before doing
> anything. Today's task only: [paste the single item block below]
> Tell me what files you plan to touch and what changes you plan to make.
> Do not write any code until I approve your plan."

**Rules:**
- Complete ONE priority at a time
- After each priority, stop and wait for explicit approval
- Mark completed items `[x]` with a one-line note
- Never touch files not listed in the item's scope
- Never refactor code outside the current item's scope

---

## Phase 1.4 Goal

Two scopes in one phase:

**Scope A — Settings UX fixes (frontend only):**
The "Add Model" form currently uses a free-text input for model name. This should be a
server-aware dropdown populated from the selected server's available model list, filtered
to exclude models already configured on that server. Additionally, the AI Servers table
has a layout bug (delete button overflows its column) and a misleading column header.

**Scope B — Job activation lifecycle:**
Currently, every evaluation automatically creates a permanent job record that appears in
the Jobs list, even for speculative evaluations the user has no intention of pursuing.
Adding `jobs.is_active` (DEFAULT 0) makes evaluations exploratory by default. The user
explicitly promotes a job to active via a CTA on the Evaluate page after seeing the result.
Active jobs appear in the Jobs list; inactive jobs do not.

### What's New in Phase 1.4
- Settings: server-aware model dropdown in "Add Model" form
- Settings: AI Servers layout fix + "IN USE" column header
- `jobs.is_active` schema column (DEFAULT 0)
- `POST /api/v1/jobs/{id}/activate` route
- Evaluate page: post-evaluation CTA prompting activation or dismissal

### What's NOT in Phase 1.4
- Evaluations page (referenced in CTA copy; built in a future phase)
- Deactivation flow for completed/rejected jobs (future)
- Showing inactive jobs in any list view (future)
- Typst / document management (Phase 1.6)
- Docker (Phase 1.7)

---

## Design Decisions

### Server-aware model dropdown
- Strictly a `<select>` — no free-text fallback when a server is selected
- If server is unreachable (useAvailableModels returns error): show error message, no input,
  Save button disabled. User must fix the server in the AI Servers section first.
- Filter: exclude model names where a `llm_models` record already exists with matching
  `server_id`. Prevents duplicate entries per server.
- Refresh button: small inline button alongside the Server label; calls `refetch()` on the
  available-models query.
- Edit mode (isEdit = true): no change — still shows server as read-only text and model
  name as a text input (editing an already-added model).

### is_active flag
- DEFAULT 0 on all new job records — evaluations are exploratory until explicitly activated
- `GET /api/v1/jobs` returns only `is_active = 1` jobs by default (no query param needed yet)
- `activate_job()` is the only write path in this phase; deactivation is future work
- Dashboard stats `jobs` count reflects active jobs only
- `GET /api/v1/jobs/{id}` (single job) returns the job regardless of is_active

### Evaluate page CTA
- Shown only when `job.is_active === 0` after evaluation completes
- On parse failure (recommendation is null): CTA still shows; first line reads
  `"Evaluation completed."` instead of displaying a recommendation value
- "Yes": calls activate mutation → on success, navigates to `/jobs/{jobId}`
- "No": resets the Evaluate page — clears JD textarea, clears results panel, returns model
  selector to default. Job stays in DB at `is_active = 0`.
- Re-evaluation scenario (job already active): CTA not shown

### Schema wipe
Phase 1.4 introduces a breaking schema change (`is_active` on `jobs`). Per project policy,
the database is wiped and rebuilt from scratch. All existing jobs, evaluations, and
applications must be re-entered after upgrade.

---

## Priority 1 — Settings: Add Model Form — Server-Aware Dropdown

- [ ] **1. Update `ModelForm` in `Settings.tsx` — server-aware model name dropdown**

  **Files:** `frontend/src/pages/Settings.tsx`

  Only `ModelForm` is modified. No other component or page is touched.

  ---

  ### Part A — Add mode (isEdit = false)

  Currently `ModelForm` has a free-text `<input>` for Model Name. Replace it with a
  server-aware `<select>` that changes state based on `form.server_id`.

  Add `useAvailableModels(form.server_id)` inside `ModelForm` (already imported in the
  file via `useServers.ts`; `form.server_id` is already tracked in form state).

  **Model Name field states (in order of priority):**

  1. `form.server_id === null` → disabled `<select>` with single option
     `"— select a server first —"`. No loading, no error shown.

  2. `form.server_id !== null && availableModels.isLoading` → disabled `<select>` showing
     `"Loading models…"` as the only option.

  3. `form.server_id !== null && availableModels.isError` → no `<select>` rendered; instead
     show an error paragraph below the Server field:
     ```
     Could not reach this server — fix the connection in AI Servers settings.
     ```
     Save button disabled while in error state. Model name field shows nothing.

  4. `form.server_id !== null && models loaded` → `<select>` with filtered options.

  **Filter logic:**
  ```typescript
  const existingModelNames = new Set(
    models
      .filter((m) => m.server_id === form.server_id)
      .map((m) => m.model)
  )
  const filteredOptions = (availableModels.data?.models ?? []).filter(
    (name) => !existingModelNames.has(name)
  )
  ```
  - `models` is already available in `ModelForm` from `useLlmModels()`
  - If `filteredOptions.length === 0` after filtering: show disabled `<select>` with
    option `"All available models already added"`. Save button disabled.

  **Refresh button:**
  Add a small `"↺ Refresh"` text button inline with the Server label row (not a
  standalone full-width button). Placement: to the right of the "Server" label text.
  ```tsx
  <div className="flex items-center justify-between">
    <label className="text-[10px] font-mono text-muted uppercase tracking-wider">
      Server
    </label>
    {form.server_id !== null && (
      <button
        onClick={() => void availableModels.refetch()}
        disabled={availableModels.isFetching}
        className="text-[10px] font-mono text-muted hover:text-accent transition-colors disabled:opacity-40"
      >
        {availableModels.isFetching ? '…' : '↺ Refresh'}
      </button>
    )}
  </div>
  ```

  **On server change:**
  When `form.server_id` changes (user picks a different server), clear `form.model` to `''`
  to prevent a stale model name carrying into the new server's dropdown.
  ```typescript
  onChange={(e) =>
    setForm((f) => ({
      ...f,
      server_id: e.target.value === '' ? null : parseInt(e.target.value, 10),
      model: '',  // clear model on server change
    }))
  }
  ```

  **Save button disabled conditions (add to existing):**
  - `availableModels.isError` (server unreachable)
  - `filteredOptions.length === 0` (all models already added)
  - `form.model === ''` (still required — no selection made)

  ---

  ### Part B — Edit mode (isEdit = true)

  No change. Edit mode shows server as read-only text and model name as a free-text
  `<input>` (existing behavior is correct — user is editing an already-added model name).

---

## Priority 2 — Settings: AI Servers Section Layout Fixes

- [ ] **2. Fix AI Servers table — column width + header rename**

  **Files:** `frontend/src/pages/Settings.tsx`

  Only `ServersSection` is modified. Two mechanical changes only.

  ---

  ### Part A — Widen Actions column

  The grid-cols string `minmax(0,1.5fr)_80px_minmax(0,1.5fr)_52px_108px` appears in
  **two places** in `ServersSection`: the header row div and the data row div. Change
  `108px` → `140px` in both.

  ---

  ### Part B — Rename "Models" column header

  In the column headers array `['Server Name', 'Type', 'Endpoint', 'Models', 'Actions']`,
  change `'Models'` → `'IN USE'`.

---

## Priority 3 — Schema + database.py

- [ ] **3. Add `is_active` to `jobs` schema; add `activate_job()`; update `get_all_jobs()`**

  **Files:** `database.py`

  DB wipe required after this change. Do not write migration code.

  ---

  ### Part A — Schema change

  In `init_db()`, add `is_active` to the `jobs` table definition after `project_id`:
  ```sql
  is_active       INTEGER NOT NULL DEFAULT 0
  ```
  Position: last column before the closing paren + UNIQUE constraint.

  ---

  ### Part B — Update `create_job()`

  Explicitly set `is_active = 0` in the INSERT statement (belt-and-suspenders with the
  DEFAULT). This makes intent clear at the call site.

  ---

  ### Part C — Update `get_all_jobs()`

  Add `include_inactive` parameter with default `False`:
  ```python
  def get_all_jobs(include_inactive: bool = False) -> list[sqlite3.Row]:
  ```
  Add `WHERE j.is_active = 1` to the query when `include_inactive` is False.
  When `include_inactive = True`, omit the filter (reserved for future Evaluations page).

  All existing callers pass no argument, so they get the new filtered behavior automatically.

  ---

  ### Part D — Add `activate_job()`

  ```python
  def activate_job(job_id: int) -> None:
      """Set is_active = 1 for a job. Caller verifies job exists before calling."""
      with get_connection() as conn:
          conn.execute(
              "UPDATE jobs SET is_active = 1 WHERE id = ?",
              (job_id,)
          )
  ```

  ---

  ### Part E — Update stats query (if in database.py)

  If `get_stats()` or equivalent exists in `database.py`, ensure the jobs count uses
  `WHERE is_active = 1`. If stats are computed in `main.py`, handle in Priority 4.

  **Do NOT touch any other database functions.**

---

## Priority 4 — Backend: Activate Route + Stats Update

- [ ] **4. Add `POST /api/v1/jobs/{job_id}/activate` route; update stats count**

  **Files:** `main.py`

  ---

  ### Part A — New route

  ```
  POST /api/v1/jobs/{job_id}/activate
  ```
  - No request body
  - Call `database.get_job_by_id(job_id)`; return 404 if not found
  - Call `database.activate_job(job_id)`
  - Return the updated job record via `database.get_job_by_id(job_id)`
  - Rate limit: same as other job routes

  ---

  ### Part B — Stats endpoint

  In `GET /api/v1/stats` (or equivalent), update the jobs count to use
  `get_all_jobs()` (which now filters `is_active = 1` by default) or apply
  `WHERE is_active = 1` directly in the stats query.

  ---

  ### Part C — Route list comment

  Update the route list comment at the top of `main.py` to include the new route.

  **Do NOT modify any other route.**

---

## Priority 5 — TypeScript Interfaces + Hooks

- [ ] **5. Update `Job` interface; add `useActivateJob` hook**

  **Files:** `frontend/src/types/api.ts`, appropriate hooks file (wherever job hooks live)

  ---

  ### Part A — TypeScript interface

  Add `is_active: number` to the `Job` interface in `frontend/src/types/api.ts`.
  (Use `number` not `boolean` — SQLite returns 0/1 integers.)

  ---

  ### Part B — Hook

  Add `useActivateJob` to the jobs hooks file:
  ```typescript
  export function useActivateJob() {
    const queryClient = useQueryClient()
    return useMutation({
      mutationFn: (jobId: number) =>
        fetch(`/api/v1/jobs/${jobId}/activate`, { method: 'POST' }).then((r) => {
          if (!r.ok) throw new Error('Failed to activate job')
          return r.json() as Promise<Job>
        }),
      onSuccess: (_data, jobId) => {
        void queryClient.invalidateQueries({ queryKey: ['jobs'] })
        void queryClient.invalidateQueries({ queryKey: ['job', jobId] })
      },
    })
  }
  ```

---

## Priority 6 — Evaluate.tsx: Post-Evaluation Activate CTA

- [ ] **6. Add activate CTA banner to `Evaluate.tsx`**

  **Files:** `frontend/src/pages/Evaluate.tsx`

  Read the current file fully before making any changes. Add the CTA to the results
  panel without disturbing existing evaluation display logic.

  ---

  ### Placement

  Render the CTA banner **at the top of the results panel**, above the score cards and
  other evaluation output. It is only rendered when:
  - An evaluation result is present (not during loading, not before first run)
  - `job.is_active === 0` (job has not been activated yet)

  Import `useActivateJob` and `useNavigate` (React Router).

  ---

  ### Banner content and structure

  ```
  ┌─────────────────────────────────────────────────────────────────────┐
  │  The overall recommendation for this job is:  [recommendation]     │
  │                                                                     │
  │  Would you like to start building the job and application           │
  │  information?                                                       │
  │                                                                     │
  │  [Yes, build this job]        [No, skip for now]                   │
  │                                                                     │
  │  You can always return to this evaluation in the Evaluations page  │
  │  if you change your mind.                                           │
  └─────────────────────────────────────────────────────────────────────┘
  ```

  If `evaluation.recommendation` is null or empty (parse failure): first line reads
  `"Evaluation completed."` instead.

  Style: distinct from the score cards — use `bg-accent/10 border border-accent/30`
  to make it visually prominent. Recommendation value in accent color.

  ---

  ### "Yes" behavior

  ```typescript
  async function handleActivate(): Promise<void> {
    await activateJob.mutateAsync(jobId)
    navigate(`/jobs/${jobId}`)
  }
  ```
  Show loading state on the "Yes" button while mutation is pending.

  ---

  ### "No" behavior

  Reset the Evaluate page to its initial state:
  - Clear the JD textarea
  - Clear the evaluation result state (so the results panel empties)
  - Return the model selector to the default model
  - Dismiss the CTA (it won't re-appear since results are cleared)

  "No" does NOT call any API — the job record stays in the DB at `is_active = 0`.

---

## Priority 7 — Tests

- [ ] **7. Backend and frontend tests**

  **Files:**
  - `tests/routes/test_jobs.py` (update existing)
  - Relevant frontend test file for `Evaluate.tsx`

  ---

  ### Backend

  **`POST /api/v1/jobs/{id}/activate`:**
  - Happy path: job activated, response contains updated job with `is_active = 1`
  - 404 when job_id does not exist

  **`GET /api/v1/jobs`:**
  - Returns only active jobs by default
  - Inactive jobs (is_active = 0) not included in response

  **`database.activate_job()`:**
  - Sets is_active = 1
  - `get_all_jobs()` excludes inactive by default
  - `get_all_jobs(include_inactive=True)` returns all jobs

  ---

  ### Frontend

  **`Evaluate.tsx`:**
  - CTA banner renders after evaluation when `job.is_active === 0`
  - CTA banner does not render when `job.is_active === 1` (re-evaluation)
  - CTA banner shows `"Evaluation completed."` when recommendation is null
  - Clicking "No" clears JD textarea and results panel

---

## API Route Summary

| Method | Route | Description |
|---|---|---|
| POST | `/api/v1/jobs/{id}/activate` | Set job is_active = 1 |

---

## Security Checklist

- [ ] All SQL parameterized — no string interpolation
- [ ] `activate_job()` uses `WHERE id = ?` — no user-controlled SQL
- [ ] No new external data exposure in activate response (returns same Job object as existing routes)
