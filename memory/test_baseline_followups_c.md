---
name: test-baseline-followups-c
description: Test baseline updated after C2 complete (2026-06-05)
metadata:
  type: project
---

Updated after C2 (File Rename) implementation. No regressions.

- Frontend: 216 passed / 6 pre-existing failures (Evaluate.test.tsx) — 222 total
- Backend: 566 passed / 0 errors (was 559; +7 new tests from C2)

Pre-existing 6 frontend failures are all in Evaluate.test.tsx and are unrelated to any FOLLOWUPS work.

**Why:** Baseline after C1, C8, and C2 complete; next session starts C3/C4+C5/C6+C7.

**How to apply:** Use to verify no regressions after each remaining FOLLOWUPS-C batch.
