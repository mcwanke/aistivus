# AIstivus — Phase 0.4 Work Order

## How to Use This File

This file is the task tracker for Phase 0.4 changes.
`CLAUDE.md` is the rules and context document — read that first.
This file defines what to build and in what order.

**Session startup prompt for Claude Code:**
> "Read CLAUDE.md before doing anything. Today's task only:
> [paste the single item block below]
> Tell me what files you plan to touch and what changes you plan
> to make. Do not write any code until I approve your plan."

**Rules:**
- Complete ONE item at a time
- After each item, stop and wait for explicit approval
- Mark completed items `[x]` with a one-line note
- Never touch files not listed in the item's scope
- Never refactor code outside the current item's scope

---

## Priority 1 — File Structure Cleanup
*Do this first. Every subsequent item touches HTML files.*
*Low risk — mechanical changes only. DB not affected.*

- [x] **1. Move all HTML files into `pages/` folder**
  - Create: `pages/` directory in repo root
  - Move these files into `pages/`:
    - `index.html`
    - `evaluate.html`
    - `jobs.html`
    - `applications.html`
    - `application_detail.html`
  - File: `main.py` — update every `FileResponse` path:
    - `Path("index.html")` → `Path("pages/index.html")`
    - `Path("evaluate.html")` → `Path("pages/evaluate.html")`
    - `Path("jobs.html")` → `Path("pages/jobs.html")`
    - `Path("applications.html")` → `Path("pages/applications.html")`
    - `Path("application_detail.html")` → `Path("pages/application_detail.html")`
  - URLs do NOT change — `/jobs` still serves `jobs.html`, etc.
  - Test: restart server, confirm all pages load correctly
  - Do NOT touch any HTML content — file move only

- [x] **2. Create `static/` folder for shared assets**
  - Create: `static/` directory in repo root
  - Create: `static/modal.js` — empty file with a comment placeholder:
    `// Shared markdown modal — populated in item 5`
  - Create: `static/modal.css` — empty file with a comment placeholder:
    `/* Shared modal styles — populated in item 5 */`
  - File: `main.py` — add static file serving:
    ```python
    from fastapi.staticfiles import StaticFiles
    app.mount("/static", StaticFiles(directory="static"), name="static")
    ```
  - Verify `/static/modal.js` is accessible at that URL
  - Do NOT add content to modal files yet

---

## Priority 2 — Font Contrast
*Touches all HTML files in `pages/`. Do after file move.*
*Purely visual — no logic changes.*

- [x] **3. Brighten font contrast across all pages**
  - Files: all files in `pages/` (index, evaluate, jobs, applications, application_detail)
  - In the `:root` CSS block on EVERY page, find and update these two variables:
    ```css
    /* Find: */
    --text-muted:   #7a7872;
    --text-dim:     #4a4844;

    /* Replace with: */
    --text-muted:   #a8a49e;
    --text-dim:     #7a7670;
    ```
  - These two values only — do not change any other CSS variables
  - Apply to all 5 pages — must be consistent across every page
  - Visual check: text should be noticeably more readable on dark background

---

## Priority 3 — Report Template Fix
*Backend change — no DB wipe needed.*

- [x] **4. Add `keyword_gaps` and `domain_match` to markdown report**
  - File: `evaluator.py`
  - Find `_generate_report()` function
  - Add `domain_match` to the report header section after Fit Type:
    ```
    **Domain Match:** {evaluation.get('domain_match', 'Not assessed')}
    ```
  - Add new section after Keywords:
    ```markdown
    ## Keyword Gaps (Tailoring Targets)
    {evaluation.get('keyword_gaps', 'None identified.')}
    ```
  - These fields are already in the database — just not rendered in the report
  - Remove the "View Full Detail" button from `pages/jobs.html`
    - Find the eval card actions section
    - Remove the "View full detail →" link entirely
    - Keep "View report" and "Re-evaluate" buttons
  - Test: run an evaluation, confirm report contains both new sections

---

## Priority 4 — Shared Markdown Modal
*Builds the reusable component used by jobs.html and future pages.*

- [x] **5. Build shared markdown modal in `static/modal.js` and `static/modal.css`**
  - File: `static/modal.css`
  - Add modal CSS — dark theme matching existing design language:
    - Modal overlay: fixed, full screen, rgba(0,0,0,0.85) background
    - Modal inner: var(--surface) background, var(--border) border, border-radius-lg
    - Max width 780px, max height 85vh, scrollable body
    - Header with title + close button
    - Markdown content styles matching existing page typography
    - DM Serif Display for h1/h2, DM Mono for code/labels, DM Sans for body
    - Close on Escape key and backdrop click
  - File: `static/modal.js`
  - Implement `MarkdownModal` object with:
    ```javascript
    MarkdownModal.open(url, title)  // fetches URL, renders markdown, shows modal
    MarkdownModal.openText(text, title) // renders raw text directly
    MarkdownModal.close()
    ```
  - Uses `marked.js` from CDN for markdown rendering:
    `https://cdnjs.cloudflare.com/ajax/libs/marked/9.1.6/marked.min.js`
  - Modal HTML injected into document body on first call (not hardcoded in each page)
  - Handles loading state ("Loading...") while fetching
  - Handles fetch errors gracefully

- [x] **6. Wire shared modal into `pages/jobs.html`**
  - File: `pages/jobs.html`
  - Add to `<head>`:
    ```html
    <link rel="stylesheet" href="/static/modal.css" />
    <script src="https://cdnjs.cloudflare.com/ajax/libs/marked/9.1.6/marked.min.js"></script>
    <script src="/static/modal.js"></script>
    ```
  - Remove any existing inline modal HTML, CSS, and JS that was
    copied from the old `evaluations.html` (report viewer modal)
  - Update "View report" button click handler to call:
    ```javascript
    MarkdownModal.open('/report?path=' + encodeURIComponent(reportPath), title)
    ```
  - Test: click "View report" on a job with an existing report —
    confirm markdown renders correctly in the modal
  - Do NOT add the modal script to other pages yet — jobs.html only

---

## Priority 5 — Settings Infrastructure
*Schema change — DB wipe required after this item.*

- [x] **7. Add `user_settings` table to database schema**
  - File: `database.py`
  - Add to SCHEMA string:
    ```sql
    CREATE TABLE IF NOT EXISTS user_settings (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        key        TEXT NOT NULL UNIQUE,
        value      TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    ```
  - Add helper functions:
    ```python
    def get_setting(key: str, default: str | None = None) -> str | None
    def set_setting(key: str, value: str) -> None
    def get_all_settings() -> dict[str, str]
    ```
  - Seed default settings on `init_db()`:
    ```python
    # Default settings — only insert if not already present
    defaults = {
        "timezone": "America/New_York",
        "allow_log_timestamp_editing": "false",
    }
    for key, value in defaults.items():
        existing = conn.execute(
            "SELECT id FROM user_settings WHERE key = ?", (key,)
        ).fetchone()
        if not existing:
            conn.execute(
                "INSERT INTO user_settings (key, value) VALUES (?, ?)",
                (key, value)
            )
    ```
  - **⚠️ WIPE DATABASE after this item:**
    `rm data/jobs.db` then `python3 main.py`

- [x] **8. Add settings API routes to `main.py`**
  - File: `main.py`
  - Add page route:
    ```python
    @app.get("/settings", response_class=FileResponse)
    async def serve_settings():
        path = Path("pages/settings.html")
        if not path.exists():
            raise HTTPException(status_code=404, detail="settings.html not found.")
        return FileResponse(path)
    ```
  - Add API routes:
    ```
    GET  /api/settings          → return all settings as dict
    PATCH /api/settings         → update one or more settings keys
    ```
  - Add `UpdateSettingsRequest` Pydantic model:
    ```python
    class UpdateSettingsRequest(BaseModel):
        settings: dict[str, str]
    ```
  - Add PATCH to CORS allowed methods (already done in 0.2 — confirm)
  - Update docstring at top of `main.py` to include new routes

---

## Priority 6 — Settings Page UI
*Builds `pages/settings.html`.*

- [x] **9. Build `pages/settings.html`**
  - File: `pages/settings.html` (new file)
  - Follows same design language as all other pages:
    - Same header with ← Home back link
    - Same dark theme CSS variables
    - Same font stack (DM Serif Display, DM Mono, DM Sans)
  - Page sections (collapsible, same pattern as application_detail.html):

  **Section: General**
  - Timezone selector — full IANA timezone list dropdown
    - Grouped by region (Americas, Europe, Asia/Pacific, etc.)
    - Default: value from `user_settings` table
    - On change: PATCH /api/settings immediately (no save button needed)
    - Label: "Display Timezone"
    - Help text: "Times are stored in UTC and converted for display"

  **Section: Applications**
  - Toggle: "Allow Editing of Application Log Timestamps"
    - Default: OFF
    - When OFF: timestamp field in log entry form is visible but not clickable
    - When ON: timestamp field is clickable and opens an edit modal
    - On toggle: PATCH /api/settings immediately
    - Label: "Enable Log Timestamp Editing"
    - Help text: "Enable to backfill historical applications with accurate timestamps"

  **Section: External AI**
  - Anthropic API key status display:
    - Shows "✅ Configured" if ANTHROPIC_API_KEY is set in .env
    - Shows "❌ Not configured" if not set
    - Never shows the key value — boolean display only
    - Help text: "Add ANTHROPIC_API_KEY to your .env file to enable Claude evaluations"
  - Anthropic model selector:
    - Dropdown showing hardcoded model list:
      - `claude-haiku-4-5-20251001` — Fast, low cost
      - `claude-sonnet-4-6` — Balanced (recommended)
      - `claude-opus-4-6` — Most capable, higher cost
    - Default: `claude-sonnet-4-6`
    - Stored in `user_settings` as `anthropic_default_model`
    - On change: PATCH /api/settings immediately
    - Only shown if ANTHROPIC_API_KEY is configured
  - Cost warning note:
    "Claude API calls incur costs charged to your Anthropic account.
     A confirmation prompt is shown before each cloud evaluation."

- [x] **10. Add Settings link to `pages/index.html` nav**
  - File: `pages/index.html`
  - In the header, find the status dot + model name:
    ```html
    <div class="header-status">
      <div class="status-dot" id="statusDot"></div>
      <span id="statusText">checking...</span>
    </div>
    ```
  - Replace with a Settings gear link:
    ```html
    <a href="/settings" class="header-settings">
      ⚙️ Settings
    </a>
    ```
  - Add CSS for `.header-settings`:
    ```css
    .header-settings {
      margin-left: auto;
      font-size: 0.75rem;
      color: var(--text-muted);
      font-family: var(--mono);
      text-decoration: none;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: color var(--transition);
    }
    .header-settings:hover { color: var(--text); }
    ```
  - Remove the Settings nav card from the grid (it was a tile — now it's in the nav)
  - Do NOT update other pages' headers — index.html only for now

---

## Priority 7 — Timezone Rendering
*Apply timezone conversion to all pages using user settings.*

- [x] **11. Add timezone utility to `static/modal.js` or new `static/utils.js`**
  - Preferred: create `static/utils.js` — separate from modal concerns
  - File: `static/utils.js`
  - Implement:
    ```javascript
    // Fetches timezone from /api/settings and caches it
    const AIstivusUtils = {
      _timezone: null,

      async getTimezone() {
        if (this._timezone) return this._timezone;
        try {
          const res  = await fetch('/api/settings');
          const data = await res.json();
          this._timezone = data.timezone || 'UTC';
        } catch {
          this._timezone = 'UTC';
        }
        return this._timezone;
      },

      async formatDate(isoString) {
        const tz = await this.getTimezone();
        if (!isoString) return '—';
        return new Date(isoString).toLocaleDateString('en-US', {
          timeZone: tz,
          month: 'short', day: 'numeric', year: 'numeric'
        });
      },

      async formatDateTime(isoString) {
        const tz = await this.getTimezone();
        if (!isoString) return '—';
        return new Date(isoString).toLocaleString('en-US', {
          timeZone: tz,
          month: 'short', day: 'numeric',
          hour: 'numeric', minute: '2-digit'
        });
      }
    };
    ```
  - File: `main.py` — add static file serving for utils.js
    (already covered if static mount is in place from item 2)

- [x] **12. Apply timezone formatting to `pages/jobs.html`**
  - File: `pages/jobs.html`
  - Add to `<head>`: `<script src="/static/utils.js"></script>`
  - Replace all `formatDate()` and `formatDateTime()` calls with
    `await AIstivusUtils.formatDate()` and `await AIstivusUtils.formatDateTime()`
  - Functions that call these must be `async`
  - Test: change timezone in Settings, reload jobs page,
    confirm dates render in selected timezone

- [x] **13. Apply timezone formatting to remaining pages**
  - Files: `pages/applications.html`, `pages/application_detail.html`
  - Same pattern as item 12
  - Add utils.js script tag, replace date formatting calls
  - Test each page after changes

---

## Priority 8 — Anthropic API Integration
*Adds Claude as an evaluation provider.*

- [ ] **14. Add `anthropic` SDK to `requirements.txt`**
  - File: `requirements.txt`
  - Add: `anthropic>=0.40.0`
  - Run: `pip install -r requirements.txt`
  - Confirm install succeeds before proceeding

- [ ] **15. Add Anthropic provider to `llm_client.py`**
  - File: `llm_client.py`
  - Add at top: `PROVIDER_ANTHROPIC = "anthropic"`
  - Add import: `import anthropic` (conditional — only imported if used)
  - Add `_call_anthropic()` function:
    ```python
    async def _call_anthropic(
        prompt: str,
        system: str,
        model: str,
        max_tokens: int,
    ) -> dict[str, Any]:
        """
        Call Anthropic API using the official SDK.
        API key loaded from ANTHROPIC_API_KEY environment variable.
        Never log or store the key value.
        """
    ```
  - The function follows the same return dict structure as `_call_ollama()`
  - Update `complete()` routing:
    ```python
    elif provider == PROVIDER_ANTHROPIC:
        return await _call_anthropic(...)
    ```
  - Add `check_anthropic_configured()` helper:
    ```python
    def check_anthropic_configured() -> bool:
        """Return True if ANTHROPIC_API_KEY is set in environment."""
        import os
        return bool(os.getenv("ANTHROPIC_API_KEY"))
    ```
  - Error handling:
    - Key not configured → return error response with clear message
    - API error → return error response with message, never raise
    - Rate limit → return error response with retry suggestion

- [ ] **16. Add Anthropic model list to `main.py` `/api/models` route**
  - File: `main.py`
  - Update `GET /api/models` to return both Ollama and Anthropic models:
    ```python
    ANTHROPIC_MODELS = [
        {"id": "claude-haiku-4-5-20251001",  "label": "Claude Haiku — Fast, low cost",        "provider": "anthropic"},
        {"id": "claude-sonnet-4-6",           "label": "Claude Sonnet — Balanced (recommended)", "provider": "anthropic"},
        {"id": "claude-opus-4-6",             "label": "Claude Opus — Most capable",            "provider": "anthropic"},
    ]
    ```
  - Only include Anthropic models if `llm_client.check_anthropic_configured()` returns True
  - Return format:
    ```json
    {
      "models": [
        {"id": "qwen2.5-coder:14b", "label": "qwen2.5-coder:14b", "provider": "ollama"},
        {"id": "claude-sonnet-4-6", "label": "Claude Sonnet — Balanced", "provider": "anthropic"}
      ],
      "default": "qwen2.5-coder:14b"
    }
    ```
  - `default` is the configured `ollama.default_model` from config.yaml

- [ ] **17. Update re-evaluate modal in `pages/jobs.html` to use new model list format**
  - File: `pages/jobs.html`
  - Update `loadModels()` function to handle new response format
    (models is now array of objects with `id`, `label`, `provider` instead of array of strings)
  - Pre-select the `default` model returned by `/api/models`
  - Show provider grouping in dropdown:
    ```
    --- Local (Ollama) ---
    qwen2.5-coder:14b
    --- Cloud (Anthropic) ---
    Claude Sonnet — Balanced (recommended)
    ```
  - Show cost warning before running Anthropic evaluation:
    ```javascript
    if (selectedModel.provider === 'anthropic') {
      const confirmed = confirm(
        'This will use the Anthropic API and may incur costs. Continue?'
      );
      if (!confirmed) return;
    }
    ```
  - Update `submitRerun()` to pass provider alongside model to the rerun endpoint

- [ ] **18. Update `POST /api/evaluations/rerun` to route by provider**
  - File: `main.py`
  - Update `RerunRequest` model:
    ```python
    class RerunRequest(BaseModel):
        job_id:   int
        model:    str
        provider: str = "ollama"
    ```
  - Update route handler to pass provider to `evaluator.evaluate_jd()`
  - Update `evaluator.evaluate_jd()` to accept and pass provider to `llm_client.complete()`
  - Test: run a re-evaluation with Anthropic model selected,
    confirm evaluation record shows `model_used = "anthropic/claude-sonnet-4-6"`

---

## Priority 9 — Cleanup

- [ ] **19. Update `CLAUDE.md`**
  - File: `CLAUDE.md`
  - Update file structure section — add `pages/` and `static/` folders
  - Update tech stack — add `anthropic` SDK
  - Update Phase 1 Active Additions table — mark Anthropic as active in Phase 0.4
  - Add `user_settings` table to schema section
  - Update available models section — add Anthropic models

- [ ] **20. Update `WORKORDER.md` (Phase 0.2) — mark remaining items status**
  - Review Phase 0.2 WORKORDER
  - Mark any items completed as part of 0.4 work
  - Note any items deferred to Phase 1

- [ ] **21. Final commit and DB wipe**
  - Commit message: `"Phase 0.4 — settings page, Anthropic API, markdown modal, file structure cleanup"`
  - Wipe DB: `rm data/jobs.db`
  - Restart: `python3 main.py`
  - Verify clean startup
  - Verify all pages load correctly from `pages/` folder
  - Verify Settings page loads at `/settings`
  - Run one Ollama evaluation — confirm works
  - Run one Anthropic evaluation (if key configured) — confirm works

---

## Completed Items

*(moved here when done)*

---

## Notes

- This WORKORDER covers only Phase 0.4 scope
- OpenAI and Gemini providers deferred to a future phase
- Settings nav on all pages deferred to Phase 1 React rebuild (shared component)

---

*Archive as WORKORDER_phase04_complete.md when all items are done.*