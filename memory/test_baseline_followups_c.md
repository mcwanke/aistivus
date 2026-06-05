---
name: test-baseline-followups-c
description: Test baseline updated after C1 + C8 complete (2026-06-05)
metadata:
  type: project
---

Updated after C1 + C8 implementation. Both items complete, no regressions.

- Frontend: 216 passed / 6 pre-existing failures (Evaluate.test.tsx) — 222 total
- Backend: 559 passed / 0 errors (was 551; +8 new tests from C8)

Pre-existing 6 frontend failures are all in Evaluate.test.tsx and are unrelated to any FOLLOWUPS work.

**Why:** Baseline after C1 and C8 complete; next session starts C2/C3/C4+C5/C6+C7.

**How to apply:** Use to verify no regressions after each remaining FOLLOWUPS-C batch.
