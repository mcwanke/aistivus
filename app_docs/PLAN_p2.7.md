

goals for 2.7:
- this will be where we introduce crawl4ai integration
- one goal is to introduce the company workflows. I want to have something that can search through ideal/target companies and surface roles for me. One of the biggest issues I am dealing with right now is in just finding roles that I am excited about
- the goal of company workflows is to add a company and the career page, then let the app automatically crawl that page every x number of days to loojk for new roles
- ideally some/all of the company research and evaluations can be automated in this phase as well. 
- this may mean that claude api usage/costs get introduced here
- i also want to explore the possibility of migrating from sqlite over to postgres here. The main reason is that the app is getting slower. 
- i have copied in a discussion at the end of this doc around the feasability/infeasability of doing the company research locally. At this time I am not going to attempt that and plan on keeping the company reseach externally based like it is now in the app. However, I do want to do the daily/nightly company career page scraping and initial job imports in an automated fashion, so I will focus my energy on phase 2.7 here

The Company Flow
- with the decisions above, here is what I would like to build around Company searching
- first, nav to the company page. In the top right there is a list of text nav links ("Career", "Job Search", "Settings"). We will add a new one in called "Company Search" and it will fit in between "Career" and "Job Search" (so the new list will be: "Career", "Company Search", "Job Search", "Settings")
- clicking on that top right nav link will go to a new listing page (like the current jobs page) that lists out all companies in the system. However, one note here, instead of calling it "companies" or "company" let's call this page "orgs"
- one note here, the orgs and the current jobs should be considered as independent entities in the system. We are not going to try and back-port existing jobs/companies/orgs back into this newer orgs structure. This will only exist for new orgs created once this functionality is built, tested, and deployed. Also, jobs can come from the orgs functionality/structure, but it is a one way flow into the current/existing jobs functions
- for the orgs page makeup, we should use the same look and feel of the current jobs page. There should be a search box, SORT, and FILTER in the top of the row listing. Each row should have at minimum these columns: Last Crawl, Org Name, Org URL (don't list out the url, instead just a column with the text "Org URL" and that is a link to the org URL), Career Page URL (same as org url, use the text "Career Page URL" here), a column for a checkbox for Company Research, Open Jobs (a count of currently open jobs), Matched Jobs (a count of currently open jobs that matched the logic for my job search), Active Jobs (we will keep a reference from the new org_roles table to the jobs tables int he db so that we can see how many of these flowed over to the existing jobs structure), and Next Crawl days
- we will need some new tables here:
  - "orgs" will list out the organizations that get added. This will need an id, company name, location, description, research, project_id, crawl_frequency, created_at, modified_at and we will most likely add a few columns as this gets developed
  - "org_crawls" is another table that will list the results of every org crawl event. It should list a status field to show success/error. It should like the number of roles found in the crawl. It should list the number of roles added to the system. It should list the number of roles marked as closed in the system.
  - "org_roles" will be a table that lists out the found roles. It should have an id, org_id, title, location, remote_type, description, pay_band, role_keyword, first_seen_date, last_seen_date, scrape_date, scrape_status, keywords, local_role_fit, local_scope_fit, local_culture, local_comp, local_score_overall, created_at, project_id, job_id
- note that I am keepign the naming here semantically separated. The current setup uses "jobs" and "comapny/companies" for things I have/am appling to. The new setup will use "orgs" instead of companies and "roles" instead of jobs. This will help keep these flows and functions separate when we are talking about them
- we will also need a few more pages to be created here. One of these will be an "Org Details" page. This will very loosely be modeled after the existing job details pages in that it will be a tabbed interface. Right now the tabs should be: Org Info, Interesting Roles, All Roles
- we will also need an aggregate page showing new and interesting Roles. This will be similar to the Org page in that it is a row-based page but here it should show newly found roles to check out, aggregates across companies
- we will also need a role details page. This should show the role details and have a re-scrape button. This should look very close to/copy from the existing createjob page
- There is DEFINITELY more needed here, so don't assume, stop and ask as we are designing p2.7!!!



smaller tweaks to make
- workflow for apply has friction, the textboxes for pass2/pass3 on STEP4 don't clear automatically and it would be nice if they did that. After running through the flow a few times they should clear every time a new .typ resume is uploaded on the page (this happens in 2 locations on that page)
- need to make a pass through the cover letter generation prompt. It is still occasionally trying to compile to a pdf and do other things upon generation. We tightened this up in pass1 and pass3, need to tighten it up here


Some thoughts and discussion around crawling locally for company info from a claude discussion session
---
Claude research output
Local AI Web Research — Exploration & Deferred Decision
Background

As part of planning the Aistivus company research workflow, we explored whether the company profile research step — currently handled by a Claude API prompt that synthesizes multi-source data into a structured JSON profile — could be replaced or augmented with a fully local stack. The goal was to reduce API costs and dependency on external services for what could become a high-frequency workflow as the company list grows.

The Research Task

The company research workflow is materially more complex than it first appears. It requires:

Multi-source retrieval across the company website, Glassdoor, Levels.fyi, LinkedIn, Blind, and Reddit
Structured JSON synthesis from those sources into a strict schema with ~15+ fields
Skeptical judgment — distinguishing live-sourced data from inference, and returning "not found" rather than hallucinating plausible values
Confidence calibration — the output schema includes a research_confidence field that requires the model to accurately assess data quality

This is not a simple summarization task. It is a multi-hop research agent problem with strict output requirements.

Local Stack Options Explored

Three local stack configurations were evaluated conceptually:

Stack A — Fully Local, Pragmatic Quality Bar

SearXNG (self-hosted Docker container) as a free meta-search proxy returning clean JSON, querying Google/Bing/DuckDuckGo without API keys
crawl4ai (already in use) for JavaScript-rendered pages; trafilatura for fast static page extraction
Ollama + Qwen3 8B (fits in 8GB VRAM at Q4 quantization) driving the search and fetch loop via tool-calling
Pure Python orchestration

Verdict: Viable for shallow research (basic company overview, Glassdoor rating). Not reliable for the full structured research prompt. 8B models at this VRAM tier drift on complex nested JSON schemas, hallucinate rather than returning "not found," and lose coherence when synthesizing 5+ sources simultaneously.

Stack B — Local Retrieval, API Synthesis (Hybrid)

SearXNG + crawl4ai/trafilatura handle all fetching locally (free, no API cost per search)
Small local model drives the search loop and selects which URLs to fetch
A single Claude API call handles final synthesis into the JSON schema, using the fetched content as context
Estimated cost: ~$0.05–0.15 per company research run

Verdict: The most pragmatic near-term option. Keeps the expensive/intelligent step as a single bounded API call. The existing Claude prompt works without modification. Retrieval is automated and free.

Stack C — Fully Automated Claude (No Local Model)

SearXNG or direct URL fetching via Python handles retrieval
crawl4ai handles careers pages
Claude API handles all intelligent steps — research, evaluation, extraction
Closest to the current manual workflow, fully automated

Verdict: Simplest to implement since existing prompts require no changes. Slightly higher per-run cost but operationally the least risky path.

Hardware Context

Primary development/run machine: NVIDIA RTX 3070 (8GB VRAM), 128GB system RAM.

The 8GB VRAM ceiling limits fully in-VRAM inference to 7B–8B models at Q4 quantization. Larger models require RAM offloading, which is feasible given the 128GB headroom but significantly slower (10–20x for offloaded layers).

Because the company research workflow runs on a scheduled/overnight basis, run time is not a blocking concern. This opens the door to larger models with RAM offloading:

Model	Est. VRAM	RAM offload	Suitability for research synthesis
Qwen3 8B Q4	~5GB	None	Fragile on complex schema
Qwen3 14B Q4	~9GB	~1GB	Good for extraction tasks
Qwen3 32B Q4	~20GB	~12GB	Approaches API quality; viable overnight
Llama 3.3 70B Q4	~40GB	~32GB	Near API quality; slow with heavy offload

A Qwen3 32B model running overnight with RAM offloading was estimated at 85–90% of Claude API quality for this research task — meaningful but not equivalent, particularly on confidence calibration and "skip don't guess" instruction-following.

Why This Is Deferred

The fully local path is technically feasible but carries meaningful implementation risk for uncertain quality gains at the current hardware tier. The specific failure modes — hallucinated review data, incorrect "not found" handling, JSON schema drift — would silently corrupt the company profiles that downstream workflows (evaluation, resume generation, cover letter generation) depend on. A bad company profile propagates errors through the entire workflow.

The current Claude API prompt produces high-quality, reliable output. Until local model quality at this hardware tier demonstrably matches it on this specific task, the API path is the lower-risk choice for company research specifically.

Potential Future Path

When revisiting this decision, the recommended sequence would be:

Stand up SearXNG as the retrieval layer regardless of which synthesis path is chosen — it eliminates search API costs and is useful infrastructure either way
Evaluate Qwen3 32B or a comparable model against the existing research prompt on a sample of 10–15 real companies, scoring output quality manually
If quality is acceptable, swap the API synthesis call for the local model call — the orchestration layer around it stays identical
Consider the hybrid Stack B approach as a middle path: local retrieval automation feeding the existing Claude prompt, reducing manual effort without changing the synthesis step
What Is Proceeding Now

The local AI stack for careers page scraping and job extraction is proceeding separately and is well-suited to local models at the current hardware tier. See the careers scraping design section for that implementation plan.
---