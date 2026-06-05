---
name: feedback-prompt-logging-rule
description: Any externally-used prompt must be logged to the DB before the modal opens, with a distinguishing type_value
metadata:
  type: feedback
---

Any prompt generated for external use (show-prompt-in-modal pattern) must be:
1. Constructed server-side in a backend route — never built as a frontend string
2. Written to `application_logs` before the modal opens, with a specific distinguishing `type_value`
3. Never use the generic `prompt` type — always use a named sub-type (e.g. `prompt_eval`, `prompt_orgsummary`, `prompt_resume`, `prompt_cover`)

**Why:** Discovered during FOLLOWUPS-C planning that Generate External Summary was frontend-only and never logged. All other prompt generators (eval, resume, cover) were using the same `prompt` type_value, making them indistinguishable in the activity log. C8 fixes this retroactively.

**How to apply:** Any time a new "generate external prompt" feature is added, start by defining the backend route and the new `system_types` seed value before writing any frontend code. The modal should call the backend, not construct strings itself.
