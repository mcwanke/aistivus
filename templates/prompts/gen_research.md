# gen_research
key: gen_research
label: Company Research Prompt
# description
Prompt generated for use in an external LLM session (e.g. Claude.ai with web search enabled).
Researches the company and role before evaluation. Output is a structured JSON block parsed
and stored by the app. Research context is injected into the eval prompt when generated.

Runtime variable injections: {company_name}, {website_url}, {title}, {jd_text}.

Editable sections: task framing, research instructions, source guidance, output instructions.
Read-only sections: company/role details injection, JD injection, JSON schema block.
---
[[PROMPT_START]]
[[EDITABLE]]
You are conducting pre-application research for a job seeker. Your job is to gather accurate,
sourced information about the company and role listed below — not to evaluate fit (that comes
later). Be a skeptical researcher: use web search to find real data, distinguish what you
found from what you inferred, and skip anything you can't verify rather than guessing.

Do not reference any candidate name, compensation preferences, or personal background from
your project files or other sources. This research is candidate-agnostic — company and role
only. Candidate fit is evaluated in a separate prompt.

[[/EDITABLE]]
[[READONLY]]
## COMPANY AND ROLE

Company: {company_name}
Website: {website_url}
Role: {title}

---

## JOB DESCRIPTION

{jd_text}

---

[[/READONLY]]
[[EDITABLE]]
## RESEARCH TASK

Using the company and role above, research and document the following. For each area, note
whether information came from a live source or from inference — this affects
research_confidence in the output.

**Company profile**
- What the company actually does and the market it operates in
- Company stage and approximate headcount (public/private, funding round if known)
- Growth trajectory signals: headcount trend, recent news, market position

**Culture and reputation**
- Check the company's website directly for published culture statements, values pages,
  mission statements, or "about us" content — this is often the clearest signal of how
  the company presents itself internally.
- Check Glassdoor: overall rating, culture & values score, work-life balance score.
  Summarize recurring themes in reviews — both positive and critical.
- Check Blind and Reddit (r/cscareerquestions, company-specific subreddits) for employee
  sentiment relevant to this role or company.
- LinkedIn headcount and tenure signals if accessible.
- If the role is technical, include signals specific to engineering or technical culture.

**Compensation signals**
- Check Levels.fyi (especially for technical roles), Glassdoor salaries, and any other
  available comp data for this role at this company.
- If no direct data exists, note the market range for this role level and location based
  on comparable data.
- Note any equity signals if the company is pre-IPO or early stage.

**Role context**
- Research the likely hiring manager or team if identifiable from the JD or LinkedIn.
- Note any signals about how long this role has been open.
- If the JD signals why this role is open (growth, backfill, new team), note them.

**Interview process**
- Check if the JD mentions the interview process directly.
- Search Glassdoor interview reviews for this company and role type.
- Check the company's career page or engineering blog for published hiring process information.

**Red and green flags**
- Red flags: recent layoffs, executive churn, long-open roles, negative review patterns,
  concerning JD language, funding gaps.
- Green flags: headcount growth, strong review consistency, clear role scope, stable
  leadership, strong Glassdoor trajectory.

**Skip, don't guess.** If a data point isn't findable, leave the field blank or note
"not found" rather than fabricating a plausible answer. Use research_confidence to signal
overall data quality:
- high: live sources found for most areas, Glassdoor data present, comp data available
- medium: partial data found, some areas inferred or estimated
- low: very limited public info, small or obscure company, most fields inferred

---

## OUTPUT FORMAT

Output only the structured JSON block below. Always wrap it in a fenced code block
(triple backticks) to enable easy copying. Never output the JSON inline.

Do not alter field names or structure — this block is parsed by the job search application.

[[/EDITABLE]]
[[READONLY]]

RESEARCH_JSON_START
```
{{
  "research_summary": "<3-5 sentence prose summary covering company profile, culture signals, comp signals, and any notable flags>",
  "company_overview": "<2-3 sentence factual summary of what the company does and its market>",
  "company_stage": "<public | private-series-X | private-early | bootstrap | nonprofit | unknown>",
  "company_size_actual": "<headcount or range if known, e.g. ~500 employees>",
  "company_trajectory": "<growing | stable | declining | unclear>",
  "company_culture_overview": "<2-3 sentence synthesis of the company's stated and observed culture — draw from website values pages, JD language, and review sources>",
  "culture_signals": {{
    "glassdoor_rating": <float or null>,
    "glassdoor_summary": "<key themes from reviews, or not found>",
    "blind_summary": "<key themes, or not found>",
    "employee_tenure_signal": "<short or long tenure signal, or not found>",
    "management_style_notes": "<inferred or found>",
    "work_life_balance_notes": "<inferred or found>",
    "technical_culture_notes": "<relevant if technical role, else n/a>"
  }},
  "comp_signals": {{
    "estimated_band": "<best estimate for this role/level/location, or not found>",
    "market_comp_notes": "<context for the estimate>",
    "equity_signals": "<if applicable, else n/a>"
  }},
  "role_context": {{
    "hiring_manager_notes": "<what was found, or not found>",
    "team_signals": "<size or composition signals, or not found>",
    "role_age_signal": "<how long open if findable, or not found>",
    "why_open_signal": "<growth | backfill | new-team | unclear>"
  }},
  "interview_process": "<what was found from JD, Glassdoor, or company materials. not found if nothing.>",
  "red_flags": ["<flag 1>", "<flag 2>"],
  "green_flags": ["<flag 1>", "<flag 2>"],
  "research_confidence": "<high | medium | low>",
  "research_notes": "<anything else worth flagging. Empty string if nothing.>"
}}
```
RESEARCH_JSON_END

[[/READONLY]]
[[PROMPT_END]]
