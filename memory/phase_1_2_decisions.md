---
name: phase-1-2-decisions
description: Key architectural decisions made for Phase 1.2 (Job Search Profile Builder) — replaces prior Typst phase
metadata:
  type: project
---

Phase 1.2 is now the **Job Search Profile Builder** (not Typst). Typst → 1.3. Docker → 1.4.

**Why:** Profile quality directly drives evaluation quality. Non-technical users (new grads, career changers) need guided assistance building jobsearch.md. Phase ordering: profile builder is upstream of document generation in the value chain.

**Multi-user:** Separate Docker container per person (Phase 1.4). No in-app multi-profile support needed.

**Key design decisions:**
- Two-column page: section cards (left, direct editing always available) + AI chat panel (right, activates per section)
- Nav label: "Job Search Profile"
- Socratic / Directive mode toggle per section, with recommended default per section type
- SSE streaming for all chat (feel matters with local models; 15-30s blank wait is unacceptable)
- Chat sessions are ephemeral (React state); proposals logged to `llm_call_log` with `call_type='chat'`
- Accept = snapshot to `jobsearch_versions` table THEN write to disk (table-based, not main/backup)
- `lesson_learned` added to `system_types` seed
- "Capture a lesson" button on ApplicationDetail → saves to `application_logs` + proposes Section 8 addition
- Profile health score: computed endpoint (file parse, no DB table), shown on Dashboard
- One-shot actions: synthesize-insights (from app logs), coherence-check, generate-tailoring-rules

**Template changes (JOBSEARCH_TEMPLATE.md):**
- 9 sections total (was 9 but restructured)
- New Section 2: Career Narrative (the "why my path" story)
- Experience Level field added to Section 1
- Section 3 (Career History) expanded for new grads: education, projects, internships
- Sections 7 (JD Eval Framework) + 9 (Session Instructions) merged into Section 9 (Model Behavior Rules)
- Renumbered throughout

**jobsearch_versions:** Restored to table-based approach (was changed to main/backup in a prior session — reverted). Table: `(id, content, saved_at, note)`. Retention: last 30 versions.

**How to apply:** When touching profile-related routes, streaming, or jobsearch.md handling — see `app_docs/WORKORDER-phase1.2.md` for full spec. When touching CLAUDE.md or PROJECT_SPEC.md phase references, Typst is Phase 1.3, Docker is Phase 1.4.
