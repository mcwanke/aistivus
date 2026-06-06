// simple-cover-letter.typ
// Bundled starter template for AIstivus.
// Copy via the "New from template" picker on the Resume/Cover tab, then customize.
// No external package dependencies — compiles with any Typst 0.11+ binary.

// ─────────────────────────────────────
// Configuration — edit these values
// ─────────────────────────────────────
#let sender_name = "Your Name"
#let sender_email = "you@example.com"
#let sender_phone = "555-555-5555"
#let sender_location = "City, State"

#let recipient_name = "Hiring Manager"
#let recipient_title = ""          // leave empty to omit
#let company_name = "Company Name"
#let company_location = "City, State"

#let date = "June 2025"

// ─────────────────────────────────────
// Page setup
// ─────────────────────────────────────
#set page(
  paper: "us-letter",
  margin: (x: 1in, y: 0.9in),
)
#set text(font: "Linux Libertine", size: 11pt)
#set par(leading: 0.65em, justify: true)

// ─────────────────────────────────────
// Header
// ─────────────────────────────────────
#align(right)[
  #text(weight: "bold", size: 13pt)[#sender_name] \
  #sender_email · #sender_phone \
  #sender_location
]

#v(1.2em)

// ─────────────────────────────────────
// Date + recipient
// ─────────────────────────────────────
#date

#v(0.8em)

#if recipient_title != "" [
  #recipient_name, #recipient_title \
] else [
  #recipient_name \
]
#company_name \
#company_location

#v(0.8em)
Dear #recipient_name,

// ─────────────────────────────────────
// Body — replace with your content
// ─────────────────────────────────────
#v(0.4em)

I am writing to express my interest in the [Job Title] role at #company_name.
With [X years] of experience in [your domain], I bring a track record of
[key strength 1] and [key strength 2] that I believe aligns well with what
your team is building.

#v(0.5em)

At [Current/Most Recent Company], I [describe a relevant achievement or
responsibility that maps to this role]. This experience taught me [insight or
transferable skill], which I would bring directly to [specific aspect of the
target role].

#v(0.5em)

I am drawn to #company_name because [specific reason — product, mission,
team, or problem]. I am confident that [specific skill or experience] would
allow me to contribute meaningfully from day one.

#v(0.5em)

I would welcome the opportunity to discuss how my background aligns with your
needs. Thank you for your time and consideration.

// ─────────────────────────────────────
// Closing
// ─────────────────────────────────────
#v(1em)

Sincerely,

#v(1.5em)

#sender_name
