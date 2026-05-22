# FOLLOWUPS-A — Phase 1.5 Polish

Items discovered during Phase 1.5 testing. All are UI polish or minor behavior fixes unless noted.

## Status

| # | Status | Title |
|---|--------|-------|
| A1 | [x] | Add "Person / LinkedIn Profile" to Company Info dropdown |
| A2 | [x] | Strip UTM params from job application link |
| A3 | [x] | Company Info panel rework (form layout + default-open + Collapse All) |
| A4 | [x] | Job description visual treatment |
| A5 | [x] | Company Info row header enhancements |
| A6 | [x] | Export button → generate .md in inbox/done/ |
| A7 | [x] | Move company name above job title in sub-header |
| A8 | [ ] | Row background highlighting across wide row-based layouts |

Status markers: `[ ]` todo · `[x]` done · `[~]` deferred

---

## Test Baseline (going in)

- Frontend: 195 passed / 6 pre-existing failures (Evaluate.test.tsx) — 201 total
- Backend: 475 passed / 0 errors

## Test Baseline (after A1 + A2 + A7)

- Frontend: 195 passed / 6 pre-existing failures (Evaluate.test.tsx) — 201 total
- Backend: 482 passed / 0 errors (+7 new tests: test_utils.py UTM stripping)

## Test Baseline (after A3 + A4 + A5)

- Frontend: 195 passed / 6 pre-existing failures (Evaluate.test.tsx) — 201 total (unchanged — pure UI)
- Backend: 482 passed / 0 errors (unchanged — no backend changes)

## Test Baseline (after A6)

- Frontend: 195 passed / 6 pre-existing failures (Evaluate.test.tsx) — 201 total (unchanged — no new frontend tests)
- Backend: 486 passed / 0 errors (+4 new tests: TestExportJob)

---

## Items

### A1 — Add "Person / LinkedIn Profile" to Company Info dropdown

**Where:** Company Info note-type dropdown — `system_types` seed in `database.py`  
**Change:** Add a new `system_types` entry for "Person / LinkedIn Profile" in the company info note type group  
**Tests affected:** Any test that asserts the full list of company info note types

---

### A2 — Strip UTM params from job application link

**Where:** Job application link field — backend on save, or frontend before display (TBD at execution)  
**Change:** Strip all `utm_*` query parameters from the stored/displayed application URL  
**Tests affected:** New unit test for the stripping logic

---

### A3 — Company Info panel rework (form layout + default-open + Collapse All)

**Where:** Company Info right column — add-form and row list display  
**Change (form):** Collapse the add-form from its current tall layout into a 2-row grid:
- Row 1: Type (label + dropdown) · Notes (label + text input)
- Row 2: URL (label + text input) · Save button

**Change (rows):** All existing company info rows render expanded (unrolled) by default on page load. Add a "Collapse All" button at the top of the row list to fold them all. No persistence — default-open on every load.  
**Tests affected:** Likely none (pure UI layout); verify visually

---

### A4 — Job description visual treatment

**Where:** Job Details → Job Description tab — the raw job description text block  
**Change:** Wrap the job description in a visually distinct container — a bordered/inset box using existing surface tokens — so it reads as structured content rather than plain text flowing into the page  
**Tests affected:** None

---

### A5 — Company Info row header enhancements

**Where:** Company Info row collapsed/header state (depends on A3 being done first)  
**Change:**
- If the row's note type is a website/URL type: show the URL as a clickable link in the collapsed row header
- If the row has associated notes text: show a small badge in the collapsed header indicating notes exist

**Tests affected:** None (pure UI)

---

### A6 — Export button → generate .md in inbox/done/

**Where:** Job Details → Job Description tab — Export button  
**Change:** Replace the current "copy to clipboard" behavior with generating a `.md` file written to `inbox/done/`. File should contain job information (title, company, URL, description at minimum) in a format that could be re-imported. Current clipboard behavior is removed.  
**Tests affected:** New backend route test; update PROJECT_SPEC.md export behavior description  
**Note:** This is the only item in this batch with backend file I/O — confirm file naming convention at execution time (suggest: `{job_id}-export-{timestamp}.md`)

---

### A7 — Move company name above job title in sub-header

**Where:** Job detail sub-header — the row showing overall score, status, company, job title  
**Change:** Company name is currently positioned under the Status field. Move it to sit above the job title on its own row/position so the hierarchy reads: Company → Job Title  
**Tests affected:** Update any snapshot or layout tests that assert sub-header structure

---

### A8 — Row background highlighting across wide row-based layouts

**Where:** All wide row-based layouts added in Phase 1.5 — confirmed areas include:
- Application tab → Add Event section (activity log rows)
- Job Details → evaluations rows
- Any other Phase 1.5 row lists (audit during implementation)

**Change:** Each row gets `bg-surface2` (`#222222`) as a consistent background. On hover, lighten slightly (one step above surface2). Thin gap or border between rows for separation. This replaces any currently borderless/backgroundless row rendering in these areas.  
**Design rationale:** Rows are wide and interactive (expand + actions). Consistent per-row background + hover lift makes the clickable affordance clear. Alternating (zebra) avoided because these rows have actions and variable height.  
**Tests affected:** None (pure UI)
