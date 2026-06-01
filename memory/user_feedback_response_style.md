---
name: user-feedback-response-style
description: User expects direct diagnosis and action, not extended internal deliberation
metadata:
  type: feedback
---

When debugging, state the problem clearly and propose the fix. Do not spend multiple rounds second-guessing the root cause out loud.

**Why:** In a debugging session (eval_count not showing), Claude spent too long thinking through multiple possible causes instead of just stating the diagnosis and acting. User explicitly said "stop going deep, what is the problem?"

**How to apply:** When evidence is available (e.g. curl output shows None), name the cause in one sentence and propose the fix. If genuinely uncertain, say so briefly — don't narrate the uncertainty at length.

Also: before making any code change to prompts or significant logic, explain what you're changing and why, and wait for confirmation. Do not auto-apply.

**Why:** User stopped an auto-edit to the evaluator prompt and asked for explanation first before proceeding.
