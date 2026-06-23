# Suggested Changes to jobsearch.md
# These changes move personal/user-specific content out of prompt templates
# and into jobsearch.md where it belongs. Each entry lists the target section,
# the action (ADD or REMOVE), and the exact text.

---

## 1. Resume Header Tagline

**Target:** Section 9 (Model Behavior Rules) — add a new "Resume generation behavior" block

**Action:** ADD

**Text to add:**
```
### Resume generation behavior
- Resume header tagline: use "Senior Engineering Manager" for EM-titled roles; use "Director of Engineering" for Director-titled roles. Infer from JD title. Default to "Senior Engineering Manager" if ambiguous.
```

---

## 2. Summary Never Rules

**Target:** Section 7 (Tailoring Rules) — Never list

**Action:** ADD two entries to the existing Never list

**Text to add:**
```
- Do not use double em-dash constructions in the summary or anywhere in the resume.
- Do not use "known for" or "brings" constructions in third person — write in first-person active voice only.
```

---

## 3. Key Impacts Selection Logic

**Target:** Section 7 (Tailoring Rules) — add a new subsection after the Always/Never lists

**Action:** ADD new subsection

**Text to add:**
```
### Key Impacts selection logic

When selecting and ordering Key Impacts bullets for a tailored resume, apply this logic
based on signals present in the JD. All content must come from documented achievements
in jobsearch.md — these are selection and ordering rules, not content.

- **People development / manager pipeline:** Include when the role involves developing
  managers or building leadership depth. Drop or compress for IC-heavy or technical roles
  where this is low signal.
- **AI tooling adoption:** Include for most roles. Compress if space is tight. Drop only
  if the JD has zero AI/tooling signal and a stronger bullet serves better.
- **Largest scale / growth metric:** Include for growth, consumer, acquisition, or
  product-scale roles. Use the strongest documented scale signal.
- **Regulated/compliance delivery:** Include for regulated, enterprise, government, or
  healthcare-adjacent roles.
- **Cloud/platform delivery:** Include for platform, SaaS, or cloud-infrastructure roles.
- **0-to-1 product launch:** Include for hardware, IoT, or build-from-scratch roles.
- **Distributed remote team leadership:** Include when the JD explicitly values distributed
  or async team management.
- **Operational excellence / incident response:** Include when the JD calls out reliability,
  observability, or engineering process rigor.
```
