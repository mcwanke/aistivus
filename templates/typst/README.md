# Typst Templates

Starter templates for resumes and cover letters. Copy and customize — do not edit these files in place.

## How to use

In AIstivus, open any job's **Resume / Cover** tab and use the "New from template" picker. The app copies the template to that application's folder, where you can edit and compile it.

Alternatively, copy manually:

```bash
cp templates/typst/resume/simple-resume.typ generated/{your_app_folder}/my-resume.typ
```

## Adding your own templates

Drop a `.typ` file into the appropriate subdirectory:

- `templates/typst/resume/` — resume templates
- `templates/typst/cover-letter/` — cover letter templates

The template picker reads these directories at runtime — no restart required, no in-app upload needed.

## Finding more templates

Browse the Typst template ecosystem at https://typst.app/universe

## Attribution

Each bundled template includes an attribution comment block at the top of the file. If you add a template from an external source, preserve the original license header.
