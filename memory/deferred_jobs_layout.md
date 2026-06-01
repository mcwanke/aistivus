---
name: deferred-jobs-layout
description: Jobs list row layout needs a proper redesign — current attempts are unbalanced
metadata:
  type: project
---

The Jobs list row layout is not satisfying. Two attempts were made:
1. All data left, score floating alone on the right — unbalanced
2. Score in a fixed left column with border — wasted whitespace, only used 20% of row

**Why:** Neither approach translated well from the old HTML's `grid-template-columns: 1fr auto auto` pattern into Tailwind/React.

**How to apply:** When revisiting, study the old HTML's job-row CSS carefully. The old design used a 3-column grid (content | action buttons | score) at full row width. In the React version without action buttons inline, the layout needs rethinking — possibly a 2-column grid with the score integrated into the content block rather than isolated.
