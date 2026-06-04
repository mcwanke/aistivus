---
name: test-baseline-phase-1-6-complete
description: Test counts after FOLLOWUPS-A A1–A4 complete
metadata:
  type: project
---

Phase 1.6 complete + FOLLOWUPS-A items A1–A4 done.

**Why:** Baseline updated after A1 (skipped status), A2 (move generate eval button), A3 (RESUME/COVER GENERATE+UPLOAD label), A4 (I Applied! sets apply_date).

**Frontend:** 216 passed / 6 pre-existing Evaluate.test.tsx failures (222 total)
**Backend:** 545 passed / 0 errors

**Pre-existing failures (6):** All in `Evaluate.test.tsx` — unrelated to this work.

**How to apply:** Start of next FOLLOWUPS-A session (A5+) can skip baseline test run. Known baseline: Frontend 216/6, Backend 545/0.
