---
name: test-baseline-phase-1-6-complete
description: Test counts after FOLLOWUPS-B B5–B8 complete (all FOLLOWUPS-B done)
metadata:
  type: project
---

Phase 1.6 complete + FOLLOWUPS-A (A1–A10) + FOLLOWUPS-B (B1–B8) all done.

**Why:** Baseline updated after B5 (Change Application Status pane), B6 (status read-only in App Details), B7 (Add App Note/Comms + new types), B8 (deprecated type options removed from UI).

**Frontend:** 216 passed / 6 pre-existing Evaluate.test.tsx failures (222 total)
**Backend:** 551 passed / 0 errors

**Pre-existing failures (6):** All in `Evaluate.test.tsx` — unrelated to this work.

**How to apply:** All FOLLOWUPS-B items complete. Next work is Phase 1.7 (Docker). Start that session with this baseline; skip initial test run.
