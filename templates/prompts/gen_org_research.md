# gen_org_research
# Header info. Do not modify!
key: gen_org_research
label: Organization Research Prompt
temperature: 0.0
# description
Prompt generated for use in an external LLM session (e.g. Claude.ai with web search enabled).
Researches a company/organization to build a target list for job search. Output is a structured JSON block
parsed and stored by the app. Research focuses on company fundamentals, market position, financials, and
culture — not role-specific evaluation (that comes later when specific roles are crawled).

Runtime variable injections: {company_name}, {website_url}.

Editable sections: task framing, research instructions, source guidance, output instructions.
Read-only sections: company details injection, JSON schema block.
---
[[PROMPT_START]]
[[EDITABLE]]
You are conducting pre-search research for a job seeker building a target company list. Your job is to
gather accurate, sourced information about the company — not to evaluate fit for a specific role (that
comes later). Be a skeptical researcher: use web search to find real data, distinguish what you found
from what you inferred, and skip anything you can't verify rather than guessing.

Do not reference any candidate name, compensation preferences, or personal background from your project
files or other sources. This research is candidate-agnostic — company fundamentals only.

[[/EDITABLE]]
[[READONLY]]
## COMPANY

Company: {company_name}
Website: {website_url}

---

[[/READONLY]]
[[EDITABLE]]
## RESEARCH TASK

Using the company above, research and document the following. For each area, note whether information
came from a live source or from inference — this affects research_confidence in the output.

**Company profile**
- What the company actually does and the market it operates in
- Company stage and approximate headcount (public/private, funding round if known)
- Company growth trajectory: is the company growing, stable, or declining?

**Headcount and hiring signals**
- Current employee headcount or range if known
- Growth signals: are they actively hiring, stable, or reducing headcount?
- If recent layoffs are discoverable, document them — this is a material signal for job seekers
- LinkedIn headcount trends if accessible

**Culture and reputation**
- Check the company's website directly for published culture statements, values pages, mission
  statements, or "about us" content — this is often the clearest signal of how the company
  presents itself.
- Check Glassdoor: overall rating, culture & values score, work-life balance score. Summarize
  recurring themes in reviews — both positive and critical.
- Check Blind and Reddit (r/cscareerquestions, company-specific subreddits) for employee sentiment.
- Employee tenure signals if accessible.
- If the company is technical, include signals specific to engineering or technical culture.

**Market context**
- What market does this company operate in? Is it growing, mature, consolidating?
- Who are the top 3 competitors?
- Where does this company sit in the competitive landscape? (market leader, small player, growing
  challenger, etc.)
- Focus on ballpark estimation — no need for precise market-size calculations.

**Financials**
- Estimated revenue if discoverable (ballpark is fine — public data, SEC filings, industry reports)
- Funding stage and most recent round if known
- Profitability signals if available (profitable, pre-revenue, growth-focused, etc.)
- Note if the company has recently raised or is seeking funding

**Products and business model**
- What products or services does the company offer?
- Estimated user base or customer count if discoverable
- How does the company make money? (subscription, licensing, advertising, hybrid, etc.)

**Notable links and people**
- Notable links: capture any important resources you find during research (career page, engineering
  blog, press releases, Glassdoor, Crunchbase, etc.). 3–5 links is a good target.
- Notable people: if names/roles surface naturally during research (CEO, founders, CTO, blog authors,
  etc.), capture up to 5. Do not run a dedicated search for org structure — just note who comes up
  organically.

**Red and green flags**
- Red flags: recent layoffs, executive churn, long-open roles, negative review patterns, funding gaps,
  market headwinds, declining headcount, concerning reputation signals.
- Green flags: headcount growth, strong review consistency, stable leadership, strong Glassdoor
  trajectory, successful funding rounds, growing market, clear product differentiation.

**Skip, don't guess.** If a data point isn't findable, leave the field blank or note "not found" rather
than fabricating a plausible answer. Use research_confidence to signal overall data quality:
- high: live sources found for most areas, Glassdoor data present, recent news and financials available
- medium: partial data found, some areas inferred or estimated, limited recent signals
- low: very limited public info, small or obscure company, most fields inferred

---

## OUTPUT FORMAT

Output only the structured JSON block below. Always wrap it in a fenced code block (triple backticks)
to enable easy copying. Never output the JSON inline.

Do not alter field names or structure — this block is parsed by the job search application.

[[/EDITABLE]]
[[READONLY]]

RESEARCH_JSON_START
```
{
  "research_summary": "<3-5 sentence prose summary covering company profile, culture, market position, and notable flags>",
  "company_overview": "<2-3 sentence factual summary of what the company does and its market>",
  "company_stage": "<public | private-series-X | private-early | bootstrap | nonprofit | unknown>",
  "company_trajectory": "<growing | stable | declining | unclear>",
  "headcount": {
    "company_size_actual": "<headcount or range if known, e.g. ~500 employees>",
    "layoff_context": "<summary of recent layoffs if found (1-2 lines), or 'none found'>",
    "headcount_growth": "<hiring | stable | declining | unknown>"
  },
  "company_culture_overview": "<2-3 sentence synthesis of stated and observed culture>",
  "culture_signals": {
    "glassdoor_rating": "<float or null>",
    "glassdoor_summary": "<key themes from reviews, or not found>",
    "blind_summary": "<key themes, or not found>",
    "employee_tenure_signal": "<short or long tenure signal, or not found>",
    "management_style_notes": "<inferred or found>",
    "work_life_balance_notes": "<inferred or found>",
    "technical_culture_notes": "<relevant if applicable, else n/a>"
  },
  "market": {
    "description": "<2-3 sentence description of the market this company operates in>",
    "top_competitors": ["<competitor 1>", "<competitor 2>", "<competitor 3>"],
    "estimated_market_position": "<qualitative position: e.g., 'market leader', 'small player in crowded space', 'growing challenger'>"
  },
  "financials": {
    "estimated_revenue": "<best estimate or 'not found'>",
    "funding_stage": "<bootstrapped | pre-seed | seed | series-A | series-B | etc | not found>",
    "recent_funding": "<most recent round if known, or 'not found'>",
    "profitability_signal": "<profitable | not profitable | unknown>"
  },
  "products": {
    "description": "<what the company makes and how it monetizes>",
    "estimated_user_base": "<if known, else 'not found'>",
    "revenue_model": "<subscription | freemium | licensing | advertising | other | unknown>"
  },
  "notable_links": [
    {
      "title": "<link title>",
      "url": "<https://...>",
      "summary": "<1-line summary of what this resource is>"
    }
  ],
  "notable_people": [
    {
      "name": "<person name>",
      "title": "<their role/title>",
      "url": "<linkedin or other profile url>",
      "summary": "<1-line summary>"
    }
  ],
  "red_flags": ["<flag 1>", "<flag 2>"],
  "green_flags": ["<flag 1>", "<flag 2>"],
  "research_confidence": "<high | medium | low>",
  "research_notes": "<anything else worth flagging, or empty string>"
}
```
RESEARCH_JSON_END

[[/READONLY]]
[[PROMPT_END]]
