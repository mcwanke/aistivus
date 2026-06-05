---
name: session-followups-c-c4-c5
description: FOLLOWUPS-C C4+C5 complete — APPLICATION LOG row layout rework + audit text surfacing
metadata:
  type: project
---

## Worked on
FOLLOWUPS-C items C4 + C5 — APPLICATION LOG ActivityLogRow redesign (2026-06-05)

## Completed
- `ActivityLogRow` in `JobDetail.tsx` fully rewritten:
  - **Header row** is now a clickable div that toggles open/close (click anywhere except Copy and Toggle)
  - Copy button has `stopPropagation`; Toggle button has `stopPropagation`
  - Timestamp is now a plain `<span>` (non-interactive) — no longer a clickable button in the header
  - `activity_type` text column removed from header entirely
  - Info column (50%) shows `entry.source`; for `entry_type === 'audit'` shows `entry.text` instead (C5)
  - Delete button moved from header to expanded view (10% column)
  - Edit Timestamp button moved from header to expanded view (20% reserved column)
- 6 new frontend tests added in `JobDetail.test.tsx` under `APPLICATION LOG ActivityLogRow` describe:
  - clicking header toggles expanded content
  - Delete appears in expanded view only (not collapsed)
  - Edit Timestamp appears in expanded view when `can_edit_timestamp`
  - Edit Timestamp absent when `can_edit_timestamp` is false
  - C5: audit entry shows event text in collapsed header info column
  - non-audit entry shows source in collapsed header info column
- FOLLOWUPS-C doc updated: C4 and C5 marked `[x]`
- Memory baseline updated: Frontend 222/6, Backend 577/0

## Decisions Made
- No new shared components created — all logic inlined in `ActivityLogRow` (single use case)
- Used Tailwind arbitrary percentage widths (`w-1/5`, `w-[15%]`, `w-[10%]`, `w-[5%]`) for column layout
- `activity_type` column dropped from header (not in spec; badge carries sufficient type context)

## Next Session Priorities
1. **C6 + C7** — Rich expanded views: llm_call rows (LLM Usage-style data) + evaluation rows (structured eval card); C7 requires a backend extension to `get_activity_log()`
