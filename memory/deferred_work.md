---
name: deferred-work
description: Intentionally deferred architectural tasks — do not attempt these mid-session without explicit instruction
metadata:
  type: project
---

## Python → `api/` folder restructure
All Python backend files (main.py, database.py, evaluator.py, etc.) are currently at the repo root alongside `frontend/`. User agreed this should eventually mirror the frontend/ structure but deferred to its own dedicated session. Blast radius: all inter-module imports, uvicorn startup command, pytest.ini, future Docker config.

**Why:** High blast radius, easy to miss something mid-refactor. Cleanest as a standalone PR.

**How to apply:** Do not fold this into other sessions. When the user asks for it, treat it as the only task in that session.

## DB settings → config.yaml migration
There is one app setting in the DB (`allow_audit_timestamp_edit`). The user considered moving all settings to config.yaml but decided against it because non-technical friends need the UI to remain the primary settings interface. Backing out to config.yaml + app-writes-yaml (Option 3) is the right long-term call but was deferred as out of scope.

**Why:** Non-technical users are a real audience. UI must remain the edit surface for settings.

**How to apply:** If this comes up again, remember Option 3 (app writes config.yaml) is the direction, not removing settings from the UI.
