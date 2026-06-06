// simple-resume.typ
// Bundled starter template for AIstivus.
// Copy via the "New from template" picker on the Resume/Cover tab, then customize.
// No external package dependencies — compiles with any Typst 0.11+ binary.

// ─────────────────────────────────────
// Configuration — edit these values
// ─────────────────────────────────────
#let name = "Your Name"
#let tagline = "Job Title · City, State"
#let email = "you@example.com"
#let phone = "555-555-5555"
#let linkedin = "linkedin.com/in/yourprofile"
#let website = ""   // leave empty to hide

// ─────────────────────────────────────
// Page setup
// ─────────────────────────────────────
#set page(
  paper: "us-letter",
  margin: (x: 0.75in, y: 0.65in),
)
#set text(font: "Linux Libertine", size: 10.5pt)
#set par(leading: 0.6em)

// ─────────────────────────────────────
// Helper functions
// ─────────────────────────────────────
#let section(title) = {
  v(0.4em)
  text(weight: "bold", size: 11pt, upper(title))
  line(length: 100%, stroke: 0.5pt)
  v(0.15em)
}

#let job(company: "", title: "", dates: "", location: "", body) = {
  grid(
    columns: (1fr, auto),
    [*#company* · #title],
    [#dates],
  )
  text(size: 9.5pt, style: "italic")[#location]
  v(0.15em)
  body
  v(0.3em)
}

#let edu(school: "", degree: "", dates: "", detail: "") = {
  grid(
    columns: (1fr, auto),
    [*#school*],
    [#dates],
  )
  [#degree]
  if detail != "" [ · #detail]
  v(0.3em)
}

// ─────────────────────────────────────
// Header
// ─────────────────────────────────────
#align(center)[
  #text(size: 20pt, weight: "bold")[#name] \
  #text(size: 10pt)[#tagline] \
  #v(0.2em)
  #let contacts = (email, phone, linkedin)
  #let visible = contacts.filter(c => c != "")
  #if website != "" { visible = visible + (website,) }
  #visible.join("  ·  ")
]

#v(0.4em)

// ─────────────────────────────────────
// Summary (optional — delete if unused)
// ─────────────────────────────────────
#section("Summary")
Results-driven professional with X+ years of experience in [your domain].
Proven ability to [key strength 1] and [key strength 2].
Seeking a [target role] where I can [value you bring].

// ─────────────────────────────────────
// Experience
// ─────────────────────────────────────
#section("Experience")

#job(
  company: "Company Name",
  title: "Your Title",
  dates: "Month YYYY – Present",
  location: "City, State (Remote / Hybrid / On-site)",
)[
  - Led initiative that [describe impact + quantify if possible].
  - Partnered with [team/stakeholder] to [describe outcome].
  - Built / managed / improved [what] resulting in [measurable result].
]

#job(
  company: "Previous Company",
  title: "Previous Title",
  dates: "Month YYYY – Month YYYY",
  location: "City, State",
)[
  - [Achievement or responsibility].
  - [Achievement or responsibility].
  - [Achievement or responsibility].
]

// ─────────────────────────────────────
// Education
// ─────────────────────────────────────
#section("Education")

#edu(
  school: "University Name",
  degree: "B.S. in Your Major",
  dates: "YYYY",
  detail: "GPA: X.X (optional)",
)

// ─────────────────────────────────────
// Skills
// ─────────────────────────────────────
#section("Skills")

#grid(
  columns: (auto, 1fr),
  gutter: 0.5em,
  [*Languages:*], [Python, SQL, TypeScript (replace with yours)],
  [*Tools:*], [Git, Docker, Terraform (replace with yours)],
  [*Domains:*], [Platform engineering, data pipelines (replace with yours)],
)
