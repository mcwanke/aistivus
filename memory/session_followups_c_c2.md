---
name: session-followups-c-c2
description: FOLLOWUPS-C C2 complete — file rename backend + frontend
metadata:
  type: project
---

## Worked on
FOLLOWUPS-C item C2 — RESUME/COVER File Rename (2026-06-05)

## Completed
- `rename_application_document(doc_id, new_file_path)` added to `database.py`
- PATCH `/api/v1/applications/{id}/documents/{doc_id}/rename` route in `document_routes.py` — validates `[a-zA-Z0-9_-]` 1–64 chars, strips/re-attaches extension, 409 on collision, renames on disk, updates DB, writes audit log
- `RenameDocumentRequest` interface added to `frontend/src/types/documents.ts`
- `useRenameDocument` mutation hook added to `frontend/src/hooks/useDocuments.ts` — throws with `.status` attached for 409 differentiation
- Inline rename UI added to `DocRow` in `frontend/src/pages/JobDetail.tsx` — Rename button, textbox pre-filled with stem, Save/Cancel, inline 409 error without dismissing
- `TestRenameDocument` class added to `tests/routes/test_documents.py` — 7 tests: happy path, DB record update, 409 collision, 422 invalid names (4 cases), 404 not found, 404 wrong app, audit entry
- FOLLOWUPS-C doc updated: C2 marked `[x]`
- Memory baseline updated: Backend 566/0, Frontend 216/6

## In Progress
Nothing — C2 complete. C3/C4+C5/C6+C7 remaining.

## Decisions Made
None beyond spec — implementation followed C2 spec exactly.

## Next Session Priorities
1. **C3** — Generate Resume + Cover Letter popups (need prompt text from user first; seeds already in place from C8)
2. **C4 + C5** — APPLICATION LOG row layout rework + audit text surfacing (batch together, frontend-only)
3. **C6 + C7** — Rich expanded views for llm_call + evaluation rows (batch together)
