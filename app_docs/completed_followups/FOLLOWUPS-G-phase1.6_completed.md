# FOLLOWUPS-G — Pre-Docker Code Fixes

Final code quality and security fixes identified during the Phase 1.6 macro-level
architecture review (F9). All five items are small, low-risk, and should be completed
before Phase 1.7 (Docker) ships.

Source: `ignore/DISCUSSION_MACRO_REVIEW.md`

## Status

| # | Status | Title |
|---|--------|-------|
| G1 | [x] | Fix independent `Limiter` in `profile_routes.py` — use shared instance |
| G2 | [x] | Move SQL from `main.py` `generate_orgsummary_prompt` to `database.py` |
| G3 | [x] | Fix stale schema version comment in `database.py` |
| G4 | [x] | Remove duplicate column aliases in `get_all_jobs()` |
| G5 | [x] | Conditionalize `ReactQueryDevtools` on `import.meta.env.DEV` |

Status markers: `[ ]` todo · `[x]` done · `[~]` deferred

---

## Test Baseline (going in)

- Frontend: 229 passed / 0 failures — 229 total
- Backend: 578 passed / 0 errors

---

## Items

### G1 — Fix independent `Limiter` in `profile_routes.py`

**Problem:** `profile_routes.py` creates its own `Limiter` instance at line 40:
```python
limiter = Limiter(key_func=get_remote_address)
```
This is a separate rate limiter from the app-wide instance in `limiter.py`. Profile route
limits are tracked in an independent bucket — an attacker hammering profile endpoints does
not consume the main limiter's quota. `document_routes.py` already imports from `limiter.py`
correctly; `profile_routes.py` needs the same treatment.

**Fix:**
1. Remove the local `limiter` instantiation and its imports from `profile_routes.py` (lines 32–40)
2. Add `from limiter import limiter` — same import used by `document_routes.py`

**Scope:** `profile_routes.py`
**Tests affected:** None — behavior is identical, only the tracking bucket changes

---

### G2 — Move SQL out of `main.py` `generate_orgsummary_prompt`

**Problem:** `generate_orgsummary_prompt` (route handler at line 926 of `main.py`) contains
a direct database call that violates the "all SQL in `database.py`" rule:
```python
# main.py ~line 937
with database.get_connection() as conn:
    row = conn.execute(
        "SELECT id FROM applications WHERE job_id = ? ORDER BY id ASC LIMIT 1",
        (job_id,)
    ).fetchone()
```
The query is correctly parameterized (not a security issue) but sets a precedent for SQL
outside `database.py`.

**Fix:**
1. Add a new helper to `database.py`:
   ```python
   def get_earliest_application_for_job(job_id: int) -> int | None:
       """Return the id of the earliest application for a job, or None."""
       with get_connection() as conn:
           row = conn.execute(
               "SELECT id FROM applications WHERE job_id = ? ORDER BY id ASC LIMIT 1",
               (job_id,)
           ).fetchone()
       return row["id"] if row else None
   ```
2. In `main.py` `generate_orgsummary_prompt`, replace the inline `get_connection` block
   with a call to `database.get_earliest_application_for_job(job_id)`
3. Add a test in `tests/test_database.py` for the new helper (job with applications,
   job with no applications)

**Scope:** `database.py`, `main.py`, `tests/test_database.py`
**Tests affected:** New tests added; existing suite must remain green

---

### G3 — Fix stale schema version comment in `database.py`

**Problem:** The module-level docstring at line 17 of `database.py` reads:
```
Schema version: 1.0
```
The actual constant at line 364 is `CURRENT_SCHEMA_VERSION = "1.5"`. The comment is the
first thing a reader sees and immediately gives incorrect information.

**Fix:** Update line 17 to read `Schema version: 1.5`.

**Scope:** `database.py` (one line)
**Tests affected:** None

---

### G4 — Remove duplicate column aliases in `get_all_jobs()`

**Problem:** The SELECT in `get_all_jobs()` (`database.py`) contains copy-paste duplicates.
Around lines 960–963:
```sql
a.id AS application_id,
a.application_status,
a.id AS application_id,   -- duplicate
a.application_status      -- duplicate
```
SQLite returns both columns; only the first is accessible by name. No runtime error, but
it will confuse any reader and wastes a small amount of query overhead.

**Fix:** Remove the two duplicate lines (second occurrence of `a.id AS application_id`
and `a.application_status`).

**Scope:** `database.py` (two lines removed)
**Tests affected:** None — behavior is unchanged; column access by name is unaffected

---

### G5 — Conditionalize `ReactQueryDevtools` on `import.meta.env.DEV`

**Problem:** `frontend/src/main.tsx` unconditionally includes `ReactQueryDevtools`:
```tsx
// line 4
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
// line 37
<ReactQueryDevtools initialIsOpen={false} />
```
This ships the devtools bundle in the production build. The Docker container will serve
the production build — every user gets devtools code they never use. Not a security issue
for a localhost tool, but adds unnecessary bundle weight.

**Fix:** Wrap in a DEV-only conditional:
```tsx
{import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
```
Vite's tree-shaker will eliminate the import from the production bundle automatically
when the condition is statically false.

**Scope:** `frontend/src/main.tsx`
**Tests affected:** None

---

## Execution Order

```
1. G3 — schema version comment (one line, no risk)
2. G4 — remove duplicate aliases (two lines, no risk)
3. G5 — conditionalize ReactQueryDevtools (one line, no risk)
4. G1 — swap limiter import in profile_routes.py
5. G2 — new database.py helper + main.py update + new tests
```

Run the full test suite after G2 (the only item that touches tested code).

---

## Validation Results (2026-06-07)

**All items complete.**

- Backend: 581 passed / 0 errors (3 new tests from G2 helper)
- Frontend: 229 passed / 0 failures
