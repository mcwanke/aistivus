# AIstivus — Phase 1.2 Work Order: Job Search Profile Builder

## How to Use This File

Read `CLAUDE.md` and `PROJECT_SPEC.md` fully before doing anything.
This file defines what to build and in what order for Phase 1.2.

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

## Phase 1.2 Goal

Build a **Job Search Profile page** — a structured, AI-assisted editor for the
user's `jobsearch.md` file. Each section of the file gets its own editable card
with an AI chat panel for building or refining it through conversation.
This directly improves evaluation quality and makes the tool usable by non-technical
users (career changers, new grads) who need help building their profile from scratch.

### What's New in Phase 1.2
- Revised `JOBSEARCH_TEMPLATE.md` (new sections, Experience Level field, merged sections)
- New `Job Search Profile` page with two-column layout
- Per-section AI chat with Socratic / Directive mode toggle
- SSE streaming for all chat interactions (feels responsive with local models)
- One-shot actions: Synthesize Insights from logs, Coherence Check, Generate Tailoring Rules
- Profile health score on Dashboard
- "Capture a lesson" feature on ApplicationDetail page
- `jobsearch_versions` table-based versioning (restored from main/backup approach)
- `lesson_learned` system_type added

### What's NOT in Phase 1.2
- General-purpose chat (Phase 3)
- Interview prep feature (post-1.2, near-term)
- Multi-profile / multi-user support (handled by separate Docker containers per user, Phase 1.4)
- Resume compile / Typst (Phase 1.3)

---

## Revised Template Section Map

After Phase 1.2, `jobsearch.md` has these sections (renumbered):

| # | Section ID | Name | AI Mode | Notes |
|---|---|---|---|---|
| 1 | `who_i_am` | Who I Am | Either | Add Experience Level field |
| 2 | `career_narrative` | Career Narrative | Socratic | NEW — the "why my path" story |
| 3 | `career_history` | Career History | Socratic | Expanded for new grads |
| 4 | `skills_strengths` | Skills & Strengths | Directive | |
| 5 | `target_role` | Target Role Profile | Either | |
| 6 | `resume_master` | Resume Master Copy | Both | Paste + review OR Socratic build |
| 7 | `tailoring_rules` | Tailoring Rules | Generate button | One-shot from sections 1–5 |
| 8 | `insights_lessons` | Insights & Lessons | Synthesize + journal | Driven by application logs |
| 9 | `model_behavior` | Model Behavior Rules | Edit only | Merged former sections 7+9 |

**Section ID** is the stable identifier used in API routes and frontend state.
Used in `PATCH /api/v1/profile/sections/{section_id}` and chat requests.

---

## Priority 1 — Template Revision
*No code. Low risk. Must be done first — section IDs and structure drive everything else.*

- [x] **1. Revise `templates/JOBSEARCH_TEMPLATE.md`** — Added Experience Level field, new Career Narrative section (§2), renumbered §3–8, expanded Career History with new-grad examples, removed old §7 and §9, added new Model Behavior Rules §9.
  - **Section 1 — Who I Am:** Add this field after `**Portfolio / online presence:**`:
    ```
    **Experience level:** [New grad / Early career (1-5 yrs) / Mid-career / Senior / Career changer]
    ```
  - **New Section 2 — Career Narrative:** Insert between current sections 1 and 2:
    ```markdown
    ## 2. Career Narrative
    <!--
      2-3 sentences on why you've made the transitions you've made.
      This is the answer to "tell me about yourself / walk me through your career."
      Interviewers ask this in every first conversation. The model uses it for
      culture fit scoring and for tailoring cover letter openers.
    -->

    [FILL — e.g. "I started as a backend engineer, moved into tech lead roles because
    I found the organizational problems more interesting than the technical ones, and
    have spent the last five years building and scaling engineering teams at growth-stage
    companies. I'm now looking for a VP-level role where I can own both the engineering
    org and the product roadmap."]
    ```
  - **Renumber all subsequent sections** (+1): old 2 → 3, old 3 → 4, etc.
  - **Section 3 — Career History (was 2):** Expand the comment block to include:
    ```
    For new grads and early-career candidates, include:
    - Education (degree, institution, graduation year, relevant coursework, GPA if strong)
    - Projects (class, personal, open source — same bullet format as work history)
    - Internships and part-time roles (use the same role entry format below)
    - Non-work leadership (clubs, volunteer orgs, anything with responsibility and outcome)
    ```
    And add an example entry block below the existing role template:
    ```markdown
    ### Education — [Degree] @ [Institution]
    - **Graduated:** [FILL]
    - **Relevant coursework / focus areas:** [FILL]
    - **Notable projects or thesis:** [FILL]

    ### Project — [Project Name]
    - **Context:** [FILL — class project / side project / open source]
    - **What you built:** [FILL]
    - **Outcome / impact:** [FILL]
    - **Tech / tools:** [FILL]
    ```
  - **Merge old Sections 7 and 9 into new Section 9 — Model Behavior Rules:**
    Remove old Section 7 (`## 7. JD Evaluation Framework`) entirely.
    Remove old Section 9 (`## 9. Session Instructions`) entirely.
    Add new final section:
    ```markdown
    ## 9. Model Behavior Rules
    <!--
      Standing instructions the model follows in every session.
      These apply to both in-app evaluation and standalone Claude sessions.
      Edit as you learn what works. Do not delete — the model reads this section.
    -->

    ### Evaluation behavior
    - Evaluate every JD before generating any materials — do not skip straight to tailoring
    - Ask one clarifying question if something about the role is ambiguous before proceeding
    - If a role scores below 6/10, explain why before asking if I want to proceed

    ### Generation behavior
    - When tailoring, show me the delta from the master resume — do not reprint the whole thing unless asked
    - Flag any claims in tailored materials that could be challenged in an interview
    - Keep cover letters to 4-6 paragraphs unless asked otherwise
    - Do NOT generate resume or cover letter materials in the same response as a JD evaluation
    - After delivering tailored resume changes, offer cover letter as optional next step — do not generate automatically
    - Apply all Always and Never rules from Section 7 without exception — flag conflicts explicitly

    ### Interview process
    - When a JD includes an interview process description, analyze each stage for conflicts
      with known gaps or deal-breakers from Section 5 — surface in the evaluation, not after
    ```
  - Update the comment at top of file: change `[7]` and `[9]` references to `[9]`
  - Verify final section count is 9 and all `## N.` headers are sequential

---

## Priority 2 — Database
*Minimal schema change. Safe to run against existing DB.*

- [x] **2. Add `lesson_learned` to `system_types` seed in `database.py`**
  - File: `database.py`
  - In the `init_db()` function, find the `system_types` seed block
  - Add one new entry to the INSERT list:
    ```python
    ('application_log', 'lesson_learned'),
    ```
  - This entry must be present after every `init_db()` call (same pattern as existing seeds)
  - Do NOT modify any other seed values
  - Do NOT add any other DB changes in this item

- [x] **3. Verify `jobsearch_versions` table in `database.py`** — Table already present. Added `save_jobsearch_version()`, `get_jobsearch_versions()`, and `get_jobsearch_version_by_id()` to `database.py`.
  - File: `database.py`
  - Confirm the `jobsearch_versions` table CREATE statement exists and has columns:
    `(id, content, saved_at, note)`
  - Confirm there is a `save_jobsearch_version(content: str, note: str)` function
    (or equivalent) that inserts a snapshot row
  - Confirm there is a `get_jobsearch_versions(limit: int = 30)` function
    that returns recent versions ordered by `saved_at DESC`
  - If any of these are missing or were replaced with a main/backup approach,
    restore to the table-based implementation
  - Add a `get_jobsearch_version_by_id(version_id: int)` function if not present
  - Do NOT touch any other database functions

---

## Priority 3 — LLM Client Streaming
*New capability in `llm_client.py`. Does not change existing `complete()` interface.*

- [x] **4. Add streaming support to `llm_client.py`** — Added `complete_stream()` async generator, `_stream_ollama()` (httpx streaming with `stream=true`), and `_stream_anthropic()` (AsyncAnthropic `messages.stream()`). Sentinel `[STREAM_ERROR]` on any failure. Existing `complete()` unchanged. 6 unit tests added in `tests/test_llm_client.py`.
  - File: `llm_client.py`
  - Add a new async generator method `complete_stream()` with this signature:
    ```python
    async def complete_stream(
        self,
        prompt: str,
        system: str,
        model: str,
        provider: str,       # "ollama" | "anthropic"
        base_url: str,
        max_tokens: int = 2000
    ) -> AsyncGenerator[str, None]:
        """Yields token strings as they arrive from the LLM."""
    ```
  - **Ollama implementation:** Use `POST {base_url}/api/chat` with `"stream": true`
    Parse each `data:` line as JSON, yield `chunk["message"]["content"]`
    Stop on `"done": true`
  - **Anthropic implementation:** Use `anthropic.AsyncAnthropic` with
    `client.messages.stream()` context manager, yield `text` from `text_delta` events
  - On any streaming error: yield a final sentinel string `"[STREAM_ERROR]"` then stop
  - The existing `complete()` method must NOT be changed
  - No other files are touched in this item
  - Write a unit test in `tests/test_llm_client.py` that mocks streaming for both
    providers and verifies tokens are yielded correctly

---

## Priority 4 — Backend: Profile Parser Utility
*Pure utility, no routes. Used by all profile API routes.*

- [x] **5. Add profile section parser to `database.py`** — Added `SECTION_ID_MAP` constant, `parse_jobsearch_sections()`, `rebuild_jobsearch_from_sections()`, and `is_section_complete()` to `database.py`. `[FILL` prefix check catches all template marker variants. 19 unit tests added in `TestProfileParser` class.
  - File: `database.py`
  - Add a utility function `parse_jobsearch_sections(content: str) -> dict[str, str]`
    that parses the jobsearch.md content and returns a dict keyed by section ID:
    ```python
    {
        "who_i_am": "...",
        "career_narrative": "...",
        "career_history": "...",
        "skills_strengths": "...",
        "target_role": "...",
        "resume_master": "...",
        "tailoring_rules": "...",
        "insights_lessons": "...",
        "model_behavior": "..."
    }
    ```
  - Parsing strategy: split on `## ` headers, map section number + name to section ID
    using this lookup (must handle both old and new numbering gracefully):
    ```python
    SECTION_ID_MAP = {
        "who i am": "who_i_am",
        "career narrative": "career_narrative",
        "career history": "career_history",
        "skills": "skills_strengths",
        "target role": "target_role",
        "resume master": "resume_master",
        "tailoring rules": "tailoring_rules",
        "insights": "insights_lessons",
        "model behavior": "model_behavior",
    }
    ```
    Match is case-insensitive, partial match on first significant word(s).
  - Add a complementary function `rebuild_jobsearch_from_sections(sections: dict[str, str], original_content: str) -> str`
    that takes the sections dict and the original full file content, replaces the content
    of each named section while preserving headers, comment blocks, and surrounding structure
  - Add `is_section_complete(section_content: str) -> bool`:
    returns `True` if content has no `[FILL]` markers AND length > 50 chars
  - Do NOT add any routes or API handlers in this item

---

## Priority 5 — Backend: Profile API Routes
*New file `profile_routes.py`. Registered in `main.py`.*

- [x] **6. Create `profile_routes.py` and register in `main.py`** — Created with 6 CRUD routes (health, sections, patch section, versions list, version by id, restore). Router registered in `main.py` via `app.include_router()`. Tests in `tests/routes/test_profile.py` (19 tests, all passing).

  **File: `profile_routes.py`** — create new file with these routes:

  **`GET /api/v1/profile/health`**
  - Read `jobsearch.md` from path in config
  - Call `parse_jobsearch_sections()` and `is_section_complete()` per section
  - Return:
    ```json
    {
      "total_sections": 9,
      "completed_sections": 3,
      "completion_pct": 33,
      "sections": [
        { "id": "who_i_am", "name": "Who I Am", "complete": true },
        ...
      ],
      "file_exists": true,
      "token_estimate": 1240
    }
    ```
  - `token_estimate`: approximate character count ÷ 4 (rough token estimate)
  - If `jobsearch.md` does not exist: return `file_exists: false`, all sections incomplete

  **`GET /api/v1/profile/sections`**
  - Read and parse `jobsearch.md`
  - Return full sections dict with content and completion status per section

  **`PATCH /api/v1/profile/sections/{section_id}`**
  - Request body: `{ "content": "...", "note": "AI edit — Career History" }`
  - Validate `section_id` is one of the 9 known IDs — 422 if not
  - Read current `jobsearch.md` → snapshot to `jobsearch_versions` (with `note`)
  - Rebuild full file with updated section content
  - Write updated file to disk
  - Return: `{ "success": true, "version_id": 42 }`

  **`GET /api/v1/profile/versions`**
  - Return list of recent versions from `jobsearch_versions`:
    `[{ "id": 42, "saved_at": "...", "note": "AI edit — Career History" }, ...]`
  - Default limit: 30

  **`GET /api/v1/profile/versions/{version_id}`**
  - Return full content of a specific version for restore/preview

  **`POST /api/v1/profile/restore/{version_id}`**
  - Snapshot current file to `jobsearch_versions` first (note: "Pre-restore snapshot")
  - Write the historical version content to disk
  - Return: `{ "success": true }`

  **File: `main.py`**
  - Import and register `profile_routes.router` with prefix `/api/v1`
  - No other changes to `main.py`

  **Tests: `tests/routes/test_profile.py`** — create with:
  - Test `GET /api/v1/profile/health` with missing file, empty file, complete file
  - Test `PATCH /api/v1/profile/sections/{section_id}` — happy path, invalid section_id
  - Test version snapshot is created on section update

- [x] **7. Add profile chat route (SSE streaming) to `profile_routes.py`** — Added `POST /api/v1/profile/chat` (SSE with `_sse_generator`, logs to `llm_call_log`) and `POST /api/v1/profile/propose-update` (non-streaming synthesis). Section prompt map with Socratic/Directive focus per section. Experience level adjustments for New grad and Career changer. 10 tests added (chat + propose-update), all passing.

  **`POST /api/v1/profile/chat`**
  - Request body:
    ```json
    {
      "section_id": "career_history",
      "mode": "socratic",
      "messages": [
        { "role": "user", "content": "..." },
        { "role": "assistant", "content": "..." }
      ],
      "section_content": "current section text or empty string",
      "experience_level": "New grad"
    }
    ```
  - Returns: `StreamingResponse` with `media_type="text/event-stream"`
  - Each SSE event format: `data: {token}\n\n`
  - End of stream sentinel: `data: [DONE]\n\n`
  - On error: `data: [STREAM_ERROR]\n\n`
  - System prompt is built from:
    1. Section-specific instructions (see Section Prompt Map below)
    2. Mode-specific framing (Socratic vs. Directive)
    3. Experience Level from request (adjusts question style)
    4. Current section content (if non-empty, included as context)
  - Log call to `llm_call_log` with `call_type='chat'`, `job_id=NULL`
  - Uses `llm_client.complete_stream()` — model resolved from default `llm_models` record

  **`POST /api/v1/profile/propose-update`**
  - Request body: same as `/chat` plus conversation history
  - NOT streaming — returns full proposed section content as JSON
  - Prompt instructs model: "Based on this conversation, write the complete updated
    content for the [Section Name] section. Return only the section content,
    no preamble."
  - Returns: `{ "proposed_content": "...", "section_id": "career_history" }`
  - Log to `llm_call_log` with `call_type='chat'`

  **Section Prompt Map** (system prompt fragments per section_id):

  | section_id | Socratic prompt focus | Directive prompt focus |
  |---|---|---|
  | `who_i_am` | Ask about background, seniority, defining strengths | Draft summary from conversation context |
  | `career_narrative` | Ask about career transitions and why they made them | Draft 2-3 sentence narrative |
  | `career_history` | Ask about roles, team size, projects, outcomes, metrics | Generate achievement bullets from context |
  | `skills_strengths` | Ask about tools, leadership scope, domain areas | Generate categorized skills list |
  | `target_role` | Ask about preferences, must-haves, deal-breakers | Draft target profile from stated preferences |
  | `resume_master` | Walk through resume section by section | Review pasted resume against target profile |
  | `tailoring_rules` | N/A (use Generate button instead) | N/A |
  | `insights_lessons` | Ask: "What happened this week? What did you learn?" | Summarize stated lessons |
  | `model_behavior` | N/A (edit only) | N/A |

  **Experience Level adjustments:**
  - `New grad`: Replace "walk me through your key achievements with metrics" framing
    with "tell me about a project you're proud of, even if it was for a class"
  - `Career changer`: Emphasize translation of prior domain experience; help surface
    transferable skills that wouldn't be obvious in a corporate resume

- [x] **8. Add one-shot action routes to `profile_routes.py`** — Added `POST /api/v1/profile/synthesize-insights` (reads recruiter_call/interview_feedback/lesson_learned/general logs + current insights section → LLM → proposed update), `POST /api/v1/profile/coherence-check` (reads full jobsearch.md → LLM → review text + issues_found count from numbered-item parsing), and `POST /api/v1/profile/generate-tailoring-rules` (reads sections 1–5 → LLM → proposed tailoring_rules content). Added `_call_llm_and_log_async()` and `_format_logs_for_prompt()` helpers. Added `get_application_logs_for_insights()` to `database.py`. 12 tests added across 3 test classes, all passing.

  **`POST /api/v1/profile/synthesize-insights`**
  - Read all `application_logs` where `type_id` maps to:
    `recruiter_call`, `interview_feedback`, `lesson_learned`, `general`
  - Read current Section 8 (`insights_lessons`) content
  - Send to LLM (NOT streaming):
    System: "You are synthesizing job search lessons from interview logs."
    User: logs formatted as dated entries + current section content
    Instruction: "Identify patterns. What's working? What isn't? What feedback recurs?
    Write the complete updated Insights & Lessons section."
  - Return: `{ "proposed_content": "...", "section_id": "insights_lessons" }`
  - Log to `llm_call_log` with `call_type='chat'`

  **`POST /api/v1/profile/coherence-check`**
  - Read full `jobsearch.md`
  - Send to LLM (NOT streaming):
    Instruction: "Review this job search profile for internal consistency.
    Check: Does the Career Narrative match Career History? Do Tailoring Rules
    support the Target Role Profile? Are there gaps between stated skills and
    target roles? Are any [FILL] markers still present? Return a structured
    review with specific findings and suggested fixes."
  - Return: `{ "review": "...", "issues_found": 3 }`
  - Log to `llm_call_log`

  **`POST /api/v1/profile/generate-tailoring-rules`**
  - Read sections: `who_i_am`, `career_narrative`, `career_history`, `skills_strengths`,
    `target_role`
  - Send to LLM (NOT streaming):
    Instruction: "Based on this person's background and target roles, generate a set of
    tailoring rules for their resume and cover letters. Format as Always/Never/Voice
    rules matching the Tailoring Rules section format."
  - Return: `{ "proposed_content": "...", "section_id": "tailoring_rules" }`
  - Log to `llm_call_log`

  Add tests for all three endpoints in `tests/routes/test_profile.py`:
  - Mock LLM client, verify prompt construction includes correct sections
  - Verify response structure

- [x] **9. Add lesson chat route to application routes** — Added `POST /api/v1/applications/{application_id}/lesson-chat` to `main.py`. `finalize: false` path returns SSE stream via `_lesson_sse_generator` (logs to `llm_call_log` with `job_id`). `finalize: true` path calls LLM non-streaming for JSON synthesis (`log_entry` + `insights_addition`), writes `application_logs` entry with `lesson_learned` type and `llm_call_log_id`, does NOT auto-write jobsearch.md. Added `LessonChatMessage`, `LessonChatRequest` models and `StreamingResponse` import. 6 tests in `TestLessonChat`, all passing.

  **File: routes file that handles application endpoints (wherever they live)**

  **`POST /api/v1/applications/{application_id}/lesson-chat`**
  - Request body:
    ```json
    {
      "messages": [{ "role": "user", "content": "..." }, ...],
      "finalize": false
    }
    ```
  - When `finalize: false`: streaming chat response (SSE) — focused on this application
    System prompt: "You are helping the user reflect on a specific job application.
    Ask about what happened in the process, what they learned, what they'd do differently.
    Be empathetic and specific. Ask follow-up questions."
  - When `finalize: true`: NOT streaming — synthesize conversation into:
    1. A `lesson_learned` log entry for this application
    2. A proposed addition to Section 8 (`insights_lessons`) of jobsearch.md
    Returns:
    ```json
    {
      "log_entry": "Lesson captured from [Company] process: ...",
      "insights_addition": "Text to append to Insights & Lessons section",
      "application_id": 42
    }
    ```
  - After `finalize: true` request:
    - Write `application_logs` entry with `type_id` = `lesson_learned` type,
      `log` = the synthesized lesson text, `llm_call_log_id` set
    - Do NOT auto-write to jobsearch.md — return proposed addition, let frontend
      show Accept/Discard
  - Log all calls to `llm_call_log` with `call_type='chat'`, `job_id` set from application

---

## Priority 6 — TypeScript Types
*Define all types before building any frontend component.*

- [x] **10. Create `frontend/src/types/profile.ts`** — Created with all 12 interfaces/types: `SectionHealth`, `ProfileHealth`, `ProfileSection`, `ProfileSections`, `ChatMode`, `ChatMessage`, `ChatRequest`, `ProposedUpdate`, `ProfileVersion`, `SynthesizeInsightsResponse`, `CoherenceCheckResponse`, `LessonChatFinalizeResponse`. Zero TypeScript errors.

  Define these interfaces:

  ```typescript
  export interface SectionHealth {
    id: string;
    name: string;
    complete: boolean;
  }

  export interface ProfileHealth {
    total_sections: number;
    completed_sections: number;
    completion_pct: number;
    sections: SectionHealth[];
    file_exists: boolean;
    token_estimate: number;
  }

  export interface ProfileSection {
    id: string;
    name: string;
    content: string;
    complete: boolean;
    recommended_mode: 'socratic' | 'directive' | 'generate' | 'edit_only';
  }

  export interface ProfileSections {
    sections: ProfileSection[];
  }

  export type ChatMode = 'socratic' | 'directive';

  export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
  }

  export interface ChatRequest {
    section_id: string;
    mode: ChatMode;
    messages: ChatMessage[];
    section_content: string;
    experience_level?: string;
  }

  export interface ProposedUpdate {
    proposed_content: string;
    section_id: string;
  }

  export interface ProfileVersion {
    id: number;
    saved_at: string;
    note: string;
  }

  export interface SynthesizeInsightsResponse {
    proposed_content: string;
    section_id: string;
  }

  export interface CoherenceCheckResponse {
    review: string;
    issues_found: number;
  }

  export interface LessonChatFinalizeResponse {
    log_entry: string;
    insights_addition: string;
    application_id: number;
  }
  ```

  Also add `ProfileHealth` to the Dashboard types in `frontend/src/types/dashboard.ts`
  (or wherever Dashboard types are defined) if not already present.

---

## Priority 7 — Frontend Hooks
*All server state and streaming logic lives in hooks.*

- [x] **11. Create profile hooks in `frontend/src/hooks/`** — Created 5 hooks: `useProfileHealth` (React Query, stale 60s), `useProfileSections` + `useUpdateSection` mutation (invalidates sections/health/versions on success), `useProfileVersions` + `useProfileVersionContent` + `useRestoreVersion`, `useProfileChat` (local state + SSE streaming, `sendMessage`/`proposeUpdate`/`clearConversation`), `useLessonChat` (same streaming pattern, `sendMessage`/`finalize`/`clearConversation`). Zero TypeScript errors, no test regressions.

  **`useProfileHealth.ts`**
  - Standard React Query hook: `GET /api/v1/profile/health`
  - Stale time: 60 seconds (file rarely changes mid-session without user action)

  **`useProfileSections.ts`**
  - React Query hook: `GET /api/v1/profile/sections`
  - Invalidates on any successful `PATCH /api/v1/profile/sections/{id}` call
  - Returns sections array + a `updateSection(id, content, note)` mutation

  **`useProfileVersions.ts`**
  - React Query hook: `GET /api/v1/profile/versions`
  - Returns versions list + `restoreVersion(id)` mutation

  **`useProfileChat.ts`** — NOT React Query, local state + streaming:
  ```typescript
  // Returns:
  {
    messages: ChatMessage[],
    streamingContent: string,       // current in-progress token accumulation
    isStreaming: boolean,
    sendMessage: (userText: string) => void,
    proposeUpdate: () => Promise<ProposedUpdate>,
    clearConversation: () => void,
    error: string | null
  }
  ```
  - `sendMessage()`: appends user message to `messages`, opens `fetch()` to
    `POST /api/v1/profile/chat` with `ReadableStream` response parsing,
    accumulates tokens into `streamingContent`, on `[DONE]` moves accumulated
    content to `messages` as assistant message, clears `streamingContent`
  - `proposeUpdate()`: sends `POST /api/v1/profile/propose-update` with current
    `messages` + `section_content`, returns `ProposedUpdate`
  - On `[STREAM_ERROR]`: set `error` state, stop streaming

  **`useLessonChat.ts`** — same streaming pattern as `useProfileChat` but for
  `POST /api/v1/applications/{id}/lesson-chat`:
  ```typescript
  {
    messages: ChatMessage[],
    streamingContent: string,
    isStreaming: boolean,
    sendMessage: (userText: string) => void,
    finalize: () => Promise<LessonChatFinalizeResponse>,
    clearConversation: () => void,
    error: string | null
  }
  ```

---

## Priority 8 — Frontend: Job Search Profile Page
*New page. Two-column layout matching the evaluate/jobs page pattern.*

- [x] **12. Build `frontend/src/pages/JobSearchProfile.tsx`** — Two-column layout: left scrollable section cards (StatusBadge, SectionCard with auto-grow textarea, Save/Edit with AI/Generate Rules/Synthesize buttons, special handling per section), right ChatPanel (mode toggle, streaming message thread, Propose Update flow, Accept/Discard card). CoherenceModal for "Review Profile". `key={activeSectionId}` forces ChatPanel remount on section switch. Nav entry "JS Profile" added to Layout.tsx, `/profile` route added to main.tsx. TypeScript type for `recommended_mode` updated to include `'either'` and `'synthesize'` (backend returns both).

  **Overall layout:**
  ```
  ┌─────────────────────────────────────────────────────────────────────┐
  │ Job Search Profile                    [Profile Strength: 3/9] [Review Profile] │
  ├──────────────────────────────┬──────────────────────────────────────┤
  │ LEFT: Section cards          │ RIGHT: Chat panel (inactive state:   │
  │                              │ "Select a section to edit with AI")  │
  │ [Section card]               │                                      │
  │ [Section card ← active]      │ [Active section header]              │
  │ [Section card]               │ [Mode toggle: Socratic | Directive]  │
  │ ...                          │ [Chat thread]                        │
  │                              │ [Proposed update preview]            │
  │                              │ [Input area + Send button]           │
  └──────────────────────────────┴──────────────────────────────────────┘
  ```

  **Left column — Section cards:**
  Each card shows:
  - Section number + name
  - Status badge: green "Complete" / amber "In Progress" / gray "Empty"
    (derived from `is_section_complete` backend check)
  - Editable `<textarea>` with the section content (direct editing, auto-grow)
  - Save button (appears on change, calls `updateSection` mutation)
  - "Edit with AI →" button (activates right panel for this section)
  - Special sections:
    - `tailoring_rules`: replace "Edit with AI" with "Generate Rules" button
      (calls `POST /api/v1/profile/generate-tailoring-rules` → shows proposal)
    - `insights_lessons`: add "Synthesize from Logs" button
      (calls `POST /api/v1/profile/synthesize-insights` → shows proposal)
    - `model_behavior`: no "Edit with AI" button — edit-only
    - `resume_master`: "Edit with AI" opens chat with paste-first UX note

  **Right column — Chat panel:**
  - Inactive state: "Select a section on the left to edit with AI"
  - Active state header: section name + recommended mode label
    e.g. "Career History — Recommended: Socratic"
  - Mode toggle: `[Socratic] [Directive]` — pill buttons, defaults to recommended
  - Message thread: user messages right-aligned (accent color bg),
    assistant messages left-aligned (surface2 bg)
  - Streaming indicator: assistant message shows cursor while streaming
  - "Propose Update" button (below thread) — disabled while streaming
    Calls `proposeUpdate()` from `useProfileChat`
  - **Proposed Update card** (appears when proposal is ready):
    ```
    ┌─────────────────────────────────┐
    │ Proposed update for: Career History │
    │ ─────────────────────────────── │
    │ [proposed content text]         │
    │ [Accept] [Discard]              │
    └─────────────────────────────────┘
    ```
    Accept: calls `updateSection()` with `note: "AI edit — {section_name}"`,
    invalidates sections query, clears proposal card
    Discard: clears proposal card, conversation continues
  - Input area: `<textarea>` (single line, expands on Enter with Shift),
    Send button, disabled while streaming
  - "Clear conversation" link (small, below input)

  **Header actions:**
  - "Review Profile" button → calls `POST /api/v1/profile/coherence-check` →
    opens a modal showing the review text and issues count
  - Profile Strength: `3 of 9 sections complete` (from `useProfileHealth`)

  **Add to left nav:** New entry "Job Search Profile" below "Settings"
  (or wherever makes semantic sense in the nav order)

  **Add route** in the React Router config for `/profile`

---

## Priority 9 — Frontend: Dashboard Update

- [x] **13. Add Profile Strength widget to `frontend/src/pages/Dashboard.tsx`** — `ProfileStrengthWidget` component added using `useProfileHealth`. Shows segmented progress bar (one pip per section), "X of 9 sections complete" count, link to `/profile`. Handles: file_exists=false ("not set up" state), completion_pct=100 (green "Complete ✓"). Placed in new "Profile" section between Overview and Models on the Dashboard.
  - Use `useProfileHealth` hook (already defined in item 11)
  - Add a widget card in the Dashboard grid showing:
    ```
    Job Search Profile
    ══════════════════
    ████████░░░░  3 of 9 sections complete
    [Complete your profile →]
    ```
    - Progress bar: filled segments for complete sections, empty for incomplete
    - Link to `/profile` page
  - If `file_exists: false`: show "Profile not set up — start here →" link
  - If `completion_pct === 100`: show "Profile complete ✓" in green accent
  - Place widget prominently — profile quality directly affects evaluation quality
  - Do NOT restructure the rest of the Dashboard layout

---

## Priority 10 — Frontend: ApplicationDetail Update

- [x] **14. Add "Capture a lesson" feature to `frontend/src/pages/ApplicationDetailPage.tsx`** — Added `LessonCapturePanel` component using `useLessonChat`. Left panel converted to 3-tab layout (Details / Add Log / Add Lesson); header and Actions remain always visible. Chat thread with static opener, streaming messages, `finalize()` flow writes log server-side and shows confirm card with optional "Add to Profile Insights & Lessons" checkbox. Done triggers query invalidation and shows success banner with "Review in Profile →" link if insights checked.
  - Use `useLessonChat` hook
  - Add a "Capture a lesson from this application" button in the logs section
    (near the bottom of the logs card, or as its own card)
  - Clicking opens an inline chat panel (below the button, not a modal):
    - Same streaming chat UX as the profile chat panel
    - System context is pre-set: the application company, role, and current status
    - First assistant message is auto-sent on open:
      "Tell me about your experience with this role so far. What happened,
      and what are you taking away from it?"
  - After conversation, "Save lesson" button calls `finalize()` from `useLessonChat`
  - Response from finalize shows two proposed actions:
    1. "Add to application log" (auto-ticked) — always save the lesson to this application
    2. "Add to profile Insights & Lessons" (user can untick) — propose addition to Section 8
  - Confirm button executes selected actions
  - Accepted log entry appears immediately in the application logs list
  - Proposed insights addition: redirect user to `/profile` with Section 8 highlighted,
    or show a toast with a "Review in Profile →" link
  - Do NOT modify any other ApplicationDetail behavior

---

## Priority 11 — Settings Update

- [x] **15. Add version history to Settings My Data section** — Added `VersionHistorySection` component to `Settings.tsx`. Collapsible (default collapsed, header shows count). Expanded view lists versions with timestamp + note; [Preview] opens read-only modal via `useProfileVersionContent`; [Restore] shows inline confirm → calls `useRestoreVersion` mutation, additionally invalidates `['jobsearch']` so the editor textarea refreshes, shows 4s toast. No other Settings behavior changed.

---

## Priority 12 — Profile Page UX Enhancements + Quality Audit

- [ ] **16. Profile page UX enhancements, quality audit route, and jobsearch.md cleanup**

  ### Files touched
  - `profile_routes.py`
  - `frontend/src/pages/JobSearchProfile.tsx`
  - `my_data/jobsearch.md`
  - `templates/JOBSEARCH_TEMPLATE.md`

  ---

  ### Part A — `profile_routes.py`

  **Tweak existing `POST /api/v1/profile/coherence-check`**
  - Scope the prompt strictly to cross-section consistency. Remove any instruction to flag
    `[FILL]`/`[AUTO]` markers or stub content — those move to the quality audit.
  - Prompt focus: Does Career Narrative match Career History? Do Tailoring Rules support
    Target Role Profile? Are there gaps or contradictions between Skills and Target Role?
    Is Model Behavior consistent with stated search strategy?
  - Output format instruction to LLM: "Return a numbered list of specific findings.
    Each finding is one concise sentence identifying the inconsistency. Do not explain
    how to fix it in detail. Maximum one sentence per finding."
  - Response shape unchanged: `{ "review": "...", "issues_found": N }`

  **Add `POST /api/v1/profile/quality-audit`**
  - Read full `jobsearch.md` via `parse_jobsearch_sections()`
  - Send to LLM (NOT streaming) with this prompt focus:
    - Flag any section that is empty or contains only `[FILL]`/`[AUTO]` placeholders
    - Flag any section under 50 characters of real content (stub)
    - In Career History: flag any role entry with fewer than 3 achievement bullets,
      unless it appears to be an older (10+ years ago) or minor role; exempt Education
      and Project entries from bullet count check
    - In Career History: flag any apparent time gaps greater than 6 months between roles
      where no explanation is present
    - Flag Resume Master Copy if it appears to be empty, a placeholder, or very short
    - Flag Tailoring Rules if all entries are still `[AUTO]` markers
    - Do NOT check cross-section consistency — that belongs to coherence-check
  - Output format instruction to LLM: "Return a numbered list. Each item is one concise
    sentence naming the section and the specific issue. Do not repeat the section's
    instructions or explain how to fill it in. Todo-list style only."
  - Return: `{ "review": "...", "issues_found": N }` — same shape as coherence-check
  - Log to `llm_call_log` with `call_type='chat'`

  **Model selector support — both review routes + all existing profile routes**
  - Add optional `model_id: int | None = None` to request bodies for:
    `POST /api/v1/profile/chat`, `POST /api/v1/profile/propose-update`,
    `POST /api/v1/profile/synthesize-insights`, `POST /api/v1/profile/coherence-check`,
    `POST /api/v1/profile/quality-audit`, `POST /api/v1/profile/generate-tailoring-rules`
  - If `model_id` is provided, look up that model from `llm_models` table and use it
    instead of the default. If not found or not available, fall back to default.
  - Do NOT add `model_id` to the lesson-chat route in `main.py` — that stays page-less.

  ---

  ### Part B — `frontend/src/pages/JobSearchProfile.tsx`

  **Rename + add Review buttons**
  - Rename existing "Review Profile" button → "Review · Alignment"
  - Add new "Review · Quality" button next to it in the page header
  - Both buttons show a spinner (replace button label with a loading indicator) while
    their respective fetches are in flight
  - "Review · Quality" calls `POST /api/v1/profile/quality-audit` and opens a modal
    displaying the result — use the same modal component/pattern as the existing
    Alignment modal (title: "Profile Quality Audit", shows review text + issues count)

  **Section cards — collapsed by default**
  - Each `SectionCard` starts collapsed; only the section header, status badge, and
    expand chevron are visible when collapsed
  - Clicking the header row toggles expand/collapse
  - The active section (the one currently selected for AI chat in the right panel)
    auto-expands when activated and stays expanded while active
  - Collapsed state still shows the status badge so the user can scan completion at a glance

  **Per-section collapsible hint block**
  - Add a `<details><summary>About this section</summary>...</details>` element inside
    each expanded card, above the content area, closed by default
  - Hint text per section (render as plain text, no markdown):

    | section_id | Hint text |
    |---|---|
    | `who_i_am` | The model's first impression of you and the lens for every evaluation. Seniority and experience level are especially important: they change how the model frames questions and what it considers a good JD fit. |
    | `career_narrative` | The answer to "tell me about yourself." Every recruiter asks this in the first call. A strong narrative explains your transitions without the reader having to connect the dots. The model uses this for culture fit scoring and cover letter openers. |
    | `career_history` | The model's primary evidence base. More specific detail means better evaluation accuracy. Include metrics where you have them. New grads: include projects, coursework, and internships — this section supports all backgrounds. |
    | `skills_strengths` | Used to calculate domain match and identify keyword gaps against job descriptions. Be specific — "Python" is more useful than "programming." Include leadership scope and domain areas alongside technical skills. |
    | `target_role` | Defines what "a good fit" looks like for you. Must-haves and deal-breakers are used to flag mismatches in evaluations. The more precise this is, the fewer irrelevant recommendations you'll see. |
    | `resume_master` | The source the model tailors from. Paste your full resume here. Don't summarize or try to fit this to length — more data helps produce better resumes and tailoring. Update it whenever your actual resume changes. |
    | `tailoring_rules` | Standing rules the model follows every time it generates or edits application materials. Use the Generate Rules button to build an initial set from your profile, then refine over time based on what you observe in real applications. |
    | `insights_lessons` | A running record of what's working and what isn't across your search. The model reads this to calibrate its advice. Use Synthesize from Logs to build from your application history, or add entries manually after interviews. |
    | `model_behavior` | Instructions the model follows in every session, both in-app and in standalone Claude sessions. Edit these as you learn what works. Do not delete this section — it is read on every evaluation. |

  **View/edit toggle per section**
  - Default (view mode): render section content as a styled `div`, not a textarea
    - Text matching `**Label:**` patterns (markdown bold labels) renders in muted color (`text-muted`)
    - Text matching `[FILL...]` or `[AUTO...]` placeholder markers renders in amber (`text-accent`)
    - All other text renders in standard body color
    - A pencil icon button in the card header switches to edit mode
  - Edit mode: replace the styled div with a plain auto-grow `<textarea>` pre-filled with
    the raw markdown content. Show Save and Cancel buttons. Cancel reverts to view mode
    with no changes. Save calls `updateSection` mutation then returns to view mode.
  - `---` section dividers: strip from content before displaying in either mode.
    Do NOT strip from the file on disk — the parser uses `## N.` headers, not `---`, as
    delimiters, so this is display-only. Do not add `---` back when saving a section.

  **Page-scoped model selector**
  - Add a model selector dropdown in the profile page header (near the Review buttons)
  - Fetch available models from the existing models API endpoint
  - Store selected `model_id` as page-level state (default: null, meaning use server default)
  - Pass `model_id` in the request body of all profile fetch/mutation calls:
    chat, propose-update, synthesize-insights, coherence-check, quality-audit,
    generate-tailoring-rules
  - Display format: model name only. If only one model exists, still show the selector
    (allows future models to be added without UI change)

  ---

  ### Part C — `my_data/jobsearch.md`

  - Before making any changes: call `POST /api/v1/profile/restore` is NOT right —
    instead, directly call `save_jobsearch_version()` (or `POST /api/v1/profile/sections`
    patch with no content change won't work either). The correct approach: add a one-time
    migration script or do it manually via the Settings version history "save" action
    before running this item. **Instruction: snapshot the file via the Settings My Data
    page before editing.**
  - Remove all per-section `<!-- ... -->` comment blocks from the file.
    The top-level `<!-- HOW TO USE THIS FILE ... -->` block at the top of the file stays.
  - Do not remove or alter any section headers, content, or `---` dividers.

  ---

  ### Part D — `templates/JOBSEARCH_TEMPLATE.md`

  - Remove all per-section `<!-- ... -->` comment blocks.
  - The top-level `<!-- HOW TO USE THIS FILE ... -->` block stays — it is the authoritative
    manual setup reference and should be kept intact.
  - Do not remove or alter any section headers, placeholder text (`[FILL]`, `[AUTO]`),
    or `---` dividers.

---

## Priority 13 — Tests
*Backend tests alongside the routes. Frontend tests alongside the components.*

- [ ] **17. Backend tests for profile routes**
  - File: `tests/routes/test_profile.py` (should exist from item 6 — add remaining tests)
  - Test coverage for:
    - `GET /api/v1/profile/health` — file missing, empty, partial, complete
    - `GET /api/v1/profile/sections` — parsed correctly
    - `PATCH /api/v1/profile/sections/{section_id}` — valid, invalid section_id
    - Version snapshot created on every section update
    - `POST /api/v1/profile/synthesize-insights` — mocked LLM, correct sections read
    - `POST /api/v1/profile/coherence-check` — mocked LLM
    - `POST /api/v1/profile/generate-tailoring-rules` — mocked LLM
    - `POST /api/v1/applications/{id}/lesson-chat` with `finalize: true` —
      verify `application_logs` entry created with `lesson_learned` type

- [ ] **18. Frontend tests for Job Search Profile page**
  - File: `frontend/src/pages/JobSearchProfile.test.tsx`
  - Test: sections render correctly, status badges correct based on mock data
  - Test: clicking "Edit with AI" activates right panel for correct section
  - Test: mode toggle changes active mode
  - Test: Accept on proposed update calls `updateSection` mutation
  - Test: "Review Profile" button triggers coherence check
  - Mock all API calls via `msw`

---

## Out of Scope for Phase 1.2 (Do Not Build)
- General-purpose chat interface (Phase 3)
- Interview prep / practice questions feature (post-1.2, near-term)
- Multi-profile / multi-user support (separate Docker containers, Phase 1.4)
- Typst document generation (Phase 1.3)
- Docker deployment (Phase 1.4)
- Resume chunk library / resume_info table activation (Phase 2)

---

## API Route Summary

| Method | Route | Returns | Streaming |
|---|---|---|---|
| GET | `/api/v1/profile/health` | ProfileHealth | No |
| GET | `/api/v1/profile/sections` | ProfileSections | No |
| PATCH | `/api/v1/profile/sections/{section_id}` | `{success, version_id}` | No |
| GET | `/api/v1/profile/versions` | ProfileVersion[] | No |
| GET | `/api/v1/profile/versions/{version_id}` | `{content}` | No |
| POST | `/api/v1/profile/restore/{version_id}` | `{success}` | No |
| POST | `/api/v1/profile/chat` | SSE token stream | Yes |
| POST | `/api/v1/profile/propose-update` | ProposedUpdate | No |
| POST | `/api/v1/profile/synthesize-insights` | ProposedUpdate | No |
| POST | `/api/v1/profile/coherence-check` | CoherenceCheckResponse | No |
| POST | `/api/v1/profile/generate-tailoring-rules` | ProposedUpdate | No |
| POST | `/api/v1/applications/{id}/lesson-chat` | SSE or finalize JSON | Conditional |
