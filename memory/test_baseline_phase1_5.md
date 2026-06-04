---
name: test-baseline-phase-1-6-complete
description: Test counts after FOLLOWUPS-A A1–A8 complete
metadata:
  type: project
---

Phase 1.6 complete + FOLLOWUPS-A items A1–A8 done.

**Why:** Baseline updated after A5 (JOB DETAILS left nav rework + job detail summary view), A6 (ACTIONS section + Export Job button moved to left nav), A7 (Company Info form layout redesign), A8 (COMPANY INFO section label).

**Frontend:** 216 passed / 6 pre-existing Evaluate.test.tsx failures (222 total)
**Backend:** 545 passed / 0 errors

**Pre-existing failures (6):** All in `Evaluate.test.tsx` — unrelated to this work.

**How to apply:** Start of next FOLLOWUPS-A session (A9+) can skip baseline test run. Known baseline: Frontend 216/6, Backend 545/0.
