# AIstivus — Phase 2.2 Workorder
> Status: Active
> Last updated: 2026-06-15

---

## Pre-Work

Before starting any step:
- Check `memory/MEMORY.md` for the current test baseline
- Run tests only if no baseline exists
- Each step should end with a passing test run and an updated baseline in memory

**Step order and dependencies:**
- TBD as steps are added

---

## Step 1 — Prompt Defaults as Template Files ✅

**Goal:** Move the default prompt text out of Python code constants and into committed
markdown files in `templates/prompts/`. This makes prompts readable and documentable for
users who want to understand or audit what the app sends to the LLM. Since the files are
read once at startup and seeded into the DB, later edits by the user to the files have no
effect — the DB is the live source of truth.

### 1.1 File structure

Each prompt gets its own file in `templates/prompts/`. File format:

```
# {prompt_key}
key: {prompt_key}
label: {Human-readable label}
# description
{Free-text description of what this prompt does, when it runs, what is editable vs readonly.
 Can be as long as needed — this is for humans, not the loader.}
---
{Tagged prompt text with [[EDITABLE]] / [[READONLY]] blocks}
```

The loader splits on the first `---` line and takes everything after it as the prompt
content. Everything before `---` is documentation only and is never stored in the DB.

**Files to create:**

| File | prompt_key | label |
|---|---|---|
| `eval_analysis.md` | `eval_analysis` | Evaluation — Analysis |
| `eval_scoring.md` | `eval_scoring` | Evaluation — Scoring |
| `eval_external.md` | `eval_external` | External Evaluation Prompt |

Note: The original workorder planned 5 system/user-split files, but Phase 2.1 Step 6
implemented 2 combined-prompt keys per call (`eval_analysis`, `eval_scoring`) rather than
the 4 split keys. Template files match the actual DB keys — 3 files, not 5.

`eval_internal` was the single-call predecessor to the split pipeline — superseded and
removed in Step 4 of this phase.

### 1.2 Tagging conventions

- `[[EDITABLE]]` — instructional text the user may want to tune (persona, scoring guidance,
  step instructions, critical rules)
- `[[READONLY]]` — structural content that must not be changed (variable injection blocks
  like `{jobsearch_context}` and `{jd_clean}`; JSON output schema blocks where field names
  are parsed by the app)

### 1.3 Loader in `main.py`

New function `load_prompt_template(filename: str) -> str | None`:
- Reads `templates/prompts/{filename}`
- Splits on the first `---` line; returns everything after it, stripped
- Returns `None` and logs a warning if the file does not exist

At startup, replace the existing `seed_prompt_if_missing` calls that use inline Python
constants with calls that load from template files. If `load_prompt_template` returns
`None` for a key, log a warning and skip seeding that key — the app can still run if
the key is already in the DB from a prior startup.

### 1.4 Migration for existing rows

Existing DB rows were seeded at v1 without `[[EDITABLE]]` / `[[READONLY]]` tags. At
startup, after loading template files, check each prompt key: if the active row exists
and contains no `[[EDITABLE]]` tags, call `database.save_prompt()` with the tagged
template text. This creates a v2 row with proper tags and preserves v1 as history.

Guard: only run if `'[[EDITABLE]]' not in active_row['segments_text']`.

### 1.5 Python constants

The large prompt string constants in `evaluator.py` (`SYSTEM_PROMPT_TEMPLATE`,
`ANALYSIS_SYSTEM_PROMPT_TEMPLATE`, `ANALYSIS_USER_PROMPT`, `EVALUATION_USER_PROMPT`)
are retained as minimal in-code fallbacks for the `prompt_generation.get_prompt()`
retry path. They are no longer used for seeding.

### Files touched
- `templates/prompts/` (new directory — 5 new files)
- `main.py` — `load_prompt_template()` loader; updated startup seeding; v2 migration block
- `evaluator.py` — no changes to constants (retained as fallbacks)
- `database.py` — no changes needed

---

## Step 2 — Evaluate Page: Remove Inline Timer from Button Row ✅

**Goal:** The button row on the Evaluate page left column now contains three buttons
(Evaluate, Create Without Eval, Clear). When an evaluation is running, a timer span
(`elapsed · countdown`) renders inline to the right of Clear, cramping the row. The same
information is already displayed in `RunningPanel` in the right column. Remove the
duplicate from the button row.

### Change

In `frontend/src/pages/Evaluate.tsx`, remove the `{isRunning && ...}` timer span that
follows the Clear button (lines ~805–810):

```tsx
{isRunning && (
  <span className="font-mono text-xs text-muted">
    {fmtElapsed(elapsed)}
    {countdown !== null && ` · ${fmtCountdown(countdown)}`}
  </span>
)}
```

No other changes. `RunningPanel` in the right column remains the sole display of
elapsed time and countdown during an evaluation run.

### Files touched
- `frontend/src/pages/Evaluate.tsx` — remove inline timer span from button row

---

## Step 3 — Job Detail Summary: Show Company and Title in Job Info Grid ✅

**Goal:** Company name and job title were added to `EditJobInfoModal` in Phase 2.1
Step 2, but the Job Detail Summary panel does not display them in the Job Info section.
Users see Location, Remote, Pay Band, Keyword in the labeled grid — but not Company or
Title — making it unclear that those two fields are editable from that same Edit button.

### Change

In `frontend/src/pages/JobDetail.tsx`, in the `activeAction === 'job-details'` render
block, add Company and Title as the first two rows in the Job Info display grid
(currently lines ~2205–2215):

```tsx
['Company', job.company_name],
['Title',   job.title],
['Location', job.location],
['Remote',   job.remote_type],
['Pay Band', job.pay_band],
['Keyword',  job.role_keyword],
```

The standalone `{job.company_name}` heading at line ~2155 can be removed or retained —
it is redundant once Company appears in the labeled grid. Remove it to avoid showing
company name twice.

### Files touched
- `frontend/src/pages/JobDetail.tsx` — add Company + Title rows to Job Info grid;
  remove standalone company_name heading above the section

---

---

## Step 4 — eval_internal Removal + PromptEditor UX Polish ✅

**Goal:** Remove the superseded `eval_internal` prompt from the startup seed and the UI,
and fix several UX issues in `PromptEditor` that made the component hard to use.

### 4.1 eval_internal removal

`eval_internal` was the single-call evaluation prompt used before Phase 2.1 Step 6 split
evaluation into two calls. Nothing in the current pipeline uses it. Remove its
`seed_prompt_if_missing` call from `main.py` startup. The DB row on existing installs can
be cleared manually (`DELETE FROM prompts`) — startup re-seeds only the 3 current keys.

### 4.2 PromptEditor regex fix

`parseSegments` used `/(\[\[(?:\/?)(EDITABLE|READONLY)\]\])/` to split the segments text.
JavaScript's `split()` includes all capture group matches in the result array — the inner
group `(EDITABLE|READONLY)` was emitting the bare word as a separate element, which the
parser treated as segment content. This caused literal "EDITABLE" text to appear inside
editable textareas.

Fix: change the inner group to non-capturing: `(?:EDITABLE|READONLY)`.

### 4.3 PromptEditor layout changes

- Add `<hr>` between the header row (dropdown, Run Feedback Loop, Save) and the two-column grid
- Add "EDIT PROMPT" label above the left column
- Move the "Preview" label outside the preview box and above it; rename to "PROMPT PREVIEW"

### 4.4 Textarea height

Change `rows={Math.max(4, segment.content.split('\n').length + 1)}` to
`rows={segment.content.split('\n').length || 1}`. Height is now proportional to actual
content with no artificial minimum floor.

### 4.5 Test update

`test_returns_startup_seeded_prompts` in `tests/routes/test_prompts.py` asserted
`eval_internal` was present. Updated to assert `eval_analysis`, `eval_scoring`,
`eval_external`.

### Files touched
- `main.py` — removed `eval_internal` seed block
- `frontend/src/components/PromptEditor.tsx` — regex fix; HR + column labels; textarea rows formula
- `tests/routes/test_prompts.py` — updated seeded prompt assertions

**Note:** `SYSTEM_PROMPT_TEMPLATE` in `evaluator.py` is now dead code (its only caller was
the removed seed). Deferred cleanup.

---

## Deferred from Phase 2.1

- **Prompt version history:** Version dropdown + diff view in the PromptEditor.
  Table infrastructure exists; UI deferred.
- **Feedback display to user:** Viewing feedback on past evaluations. Deferred pending
  multi-prompt architecture being stable (evaluation rows may link to multiple
  `prompt_usage` records after Step 6).
- **Remaining prompt migrations:** `fill_gaps_system`, `fill_gaps_user`, `org_summary`,
  and other currently-unmanaged prompts.
