---
name: session-followups-b-b5-b8
description: Session summary — FOLLOWUPS-B items B5–B8 complete; all FOLLOWUPS-B done
metadata:
  type: project
---

FOLLOWUPS-B items B5–B8 all done in a single session. All FOLLOWUPS-B complete.

**Why:** Pre-Docker polish pass — APPLICATION tab functionality and backend type cleanup before Phase 1.7.

## Completed

- **B5** — "Add Event" nav + form replaced with "Change Application Status". New content pane: current status read-only label, status selector (all 10 statuses including `not-started`), "Reason for change (optional)" textarea, Save button. On save: `patch.mutateAsync()` for status PATCH + `addLog.mutateAsync()` for `status_change` log entry. Added `ALL_STATUSES` local constant in `JobDetail.tsx` to include `not-started` (not in the shared `STATUSES` export).
- **B6** — Status `<select>` in App Details pane replaced with read-only `<span>` text. Removed now-unused `STATUSES` import.
- **B7** — "Add Application Note" → "Add App Note/Comms" (nav label + pane header). `LOG_TYPE_OPTIONS` replaced: removed `recruiter_call`, `interview_feedback`, `repost_alert`; kept `general`, `compensation`; added `feedback`, `email_comms`, `phone_comms`, `offer`, `rejection`.
- **B8** — Handled implicitly: `EVENT_TYPE_OPTIONS` removed (B5 replaced the form), note type list updated (B7).
- **Backend seed** — `database.py` `_SYSTEM_TYPES_SEED`: removed `recruiter_call`, `repost_alert`, `interview_feedback`; added `status_change`, `feedback`, `email_comms`, `phone_comms`, `offer`, `rejection`. Net: 14 → 17 `application_log` types, 24 → 27 total.

## Test fixes (5 files updated)
- `test_database.py` — seed set, count assertions (×4 locations), `recruiter_call` ref
- `test_applications.py` — `recruiter_call` ref, valid_types list, new `test_status_change_log_type_accepted`
- `test_profile.py` — `recruiter_call` → `general`
- `test_settings.py` — `recruiter_call` → `status_change`

## Test result

Frontend: 216/6 (baseline unchanged) · Backend: 551/0 (+1 new test)

## Next session priorities

Phase 1.7 — Docker:
- Dockerfile
- docker-compose.yml (volume mounts: data/, generated/, reports/, logs/)
- .dockerignore
- README Docker setup instructions
