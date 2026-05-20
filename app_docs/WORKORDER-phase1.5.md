# AIstivus — Phase 1.5 Work Order: Navigation & Header Rollout (STUB)

## Status: STUB — Detail to be added before implementation begins

---

## Phase 1.5 Goal

Bring the top-header navigation model introduced on the Dashboard in Phase 1.3 to all
pages in the application. The sidebar (`<Layout>` wrapper) is removed from all
non-Dashboard pages. A CSS/design pass pulls forward the look and feel established in
the original HTML pages (`pages/`) that was partially lost in the Phase 1.1 React rewrite.

---

## What's in Phase 1.5

- `AppHeader.tsx` applied to all pages (currently only Dashboard uses it)
- Sidebar (`<Layout>` wrapper) removed from all non-Dashboard pages
- CSS/design pass across all pages — pulling forward visual details from `pages/`
- Additional page-specific rework TBD

## What's NOT in Phase 1.5

- New features or functionality
- Typst / document management (Phase 1.6)
- Docker (Phase 1.7)

---

## Pages in Scope

All pages currently wrapped in `<Layout>` (sidebar visible):
- `Jobs.tsx` / `JobDetail.tsx`
- `Evaluate.tsx`
- `Applications.tsx`
- `ApplicationDetail.tsx`
- `Settings.tsx`
- `LLMUsage.tsx`
- `JobSearchProfile.tsx`

`Dashboard.tsx` already uses `AppHeader` and has no sidebar — no change needed.

---

## Design Reference

Original HTML pages in `pages/` remain as read-only reference material. The Phase 1.5
CSS pass should review these files to identify visual patterns that were not carried
forward during the Phase 1.1 React rewrite.

---

## Phase 1.5 Checklist 🔲

- [ ] `AppHeader.tsx` applied to all pages; `<Layout>` sidebar wrapper removed from all non-Dashboard pages
- [ ] CSS/design pass across all pages (details TBD in session planning)
- [ ] Additional page-specific rework (TBD)

---

## Priorities

*To be defined when this workorder is fleshed out. Recommended order:*

1. Remove sidebar from all pages (routing change + Layout removal)
2. AppHeader applied to all pages
3. CSS/design pass — page by page
4. Any page-specific rework items identified during the CSS pass

---

*This stub will be expanded into a full workorder before Phase 1.5 implementation begins.*
