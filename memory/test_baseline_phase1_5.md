---
name: test-baseline-phase-1-6-complete
description: Test counts after FOLLOWUPS-B B1–B4 complete
metadata:
  type: project
---

Phase 1.6 complete + FOLLOWUPS-A (A1–A10) + FOLLOWUPS-B items B1–B4 done.

**Why:** Baseline updated after B1 (star rating fix), B2 (button rename + prompt tweak), B3 (Job Actions nav subpage), B4 (Application left nav cleanup).

**Frontend:** 216 passed / 6 pre-existing Evaluate.test.tsx failures (222 total)
**Backend:** 550 passed / 0 errors

**Pre-existing failures (6):** All in `Evaluate.test.tsx` — unrelated to this work.

**How to apply:** FOLLOWUPS-B items B1–B4 complete. Next work is B5–B8 (APPLICATION tab: Change Application Status, read-only status field, Add App Note/Comms + new types, remove deprecated type options). Start that session with this baseline; skip initial test run.
