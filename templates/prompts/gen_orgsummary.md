# gen_orgsummary
key: gen_orgsummary
label: Org Summary Prompt
# description
Prompt generated for use in an external LLM session to produce a concise
company research summary before applying to a role.

Runtime variable injections: {company_name}, {website_url}, {title}.

Editable sections: intro framing, research instructions, writing guidance.
Read-only sections: company details injection ({company_name}, {website_url},
{title}).
---
[[PROMPT_START]]
[[EDITABLE]]
You are helping a job seeker quickly evaluate a company before applying. Research the following company and write a concise 2-3 paragraph summary for personal reference.

[[/EDITABLE]]
[[READONLY]]
*Company Name*: {company_name}
*Company URL*: {website_url}
*Job Title*: {title}

[[/READONLY]]
[[EDITABLE]]
Cover the following in your summary:
- What the company does, what market it operates in, and its approximate size
- General company culture and, if relevant to the job title, engineering or technical culture specifically
- Public reputation and employee sentiment (draw from sources like Glassdoor, Blind, or Reddit — keep research brief)

Write in plain, conversational prose. No headers or bullet points. Keep it tight — this is a quick reference, not a deep dive. If the URL is blank or a detail can't be found, skip it rather than guessing. Output your summary inside a markdown code block.

[[/EDITABLE]]
[[PROMPT_END]]
