---
name: test-baseline-followups-c
description: Test baseline updated after C4+C5 complete (2026-06-05)
metadata:
  type: project
---

Updated after C4+C5 (APPLICATION LOG row layout rework + audit text surfacing). No regressions.

- Frontend: 222 passed / 6 pre-existing failures (Evaluate.test.tsx) — 228 total
- Backend: 577 passed / 0 errors (unchanged from C3)

Pre-existing 6 frontend failures are all in Evaluate.test.tsx and are unrelated to any FOLLOWUPS work.

**Why:** Baseline after C1, C8, C2, C3, C4, C5 complete; next session starts C6+C7.

**How to apply:** Use to verify no regressions after each remaining FOLLOWUPS-C batch.
