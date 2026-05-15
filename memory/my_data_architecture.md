---
name: my-data-architecture
description: my_data/ folder structure, file-based backup approach, and resume template path conventions
metadata:
  type: project
---

## my_data/ folder (gitignored)
Created 2026-05-15 to localize all user PII to one folder. Replaces root-level jobsearch.md and resume_template.typ.

```
my_data/
  jobsearch.md                          — live job search context file
  jobsearch.md.bak                      — rolling backup (written before each save)
  resume_templates/
    resume_template.typ                 — active resume template
    resume_template.typ.bak             — rolling backup
```

## Backup approach (.bak)
On every Save, the backend writes the current file to `.bak` before overwriting. No DB versioning — the `jobsearch_versions` table exists in the schema but is no longer written to. UI shows a "Load backup" button only when a `.bak` file exists; clicking it loads backup content into the editor without auto-saving.

**Why:** PII stays out of the DB. File-based backups are transparent and portable.

## Config keys (under `evaluation:`)
- `jobsearch_md_path: ./my_data/jobsearch.md`
- `resume_template_path: ./my_data/resume_templates/resume_template.typ`

## Future multi-template support
The `resume_templates/` subdirectory is intentional — when multi-template support lands, additional `.typ` files drop into that folder. The config key would change from `resume_template_path` (single file) to `resume_templates_dir` (directory). No other structural change needed.
