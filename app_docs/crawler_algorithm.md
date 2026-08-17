

This is a documentation of the crawler algorithm

1. Crawl initiated. This can happen in one of two ways. A user can initiate a crawl from on org page on the CRAWLS tab. Also, the background processing will initiate crawls on an interval basis.

2. The career page URL is used from the database and passed to crawl4ai. This action is saved in the org_crawl logs with an action_type=crawl4ai_career and we save the resulting markdown, status code, and calculate and store the time it takes to do this crawl in a log record in org_crawl_logs

3. Once we have the markdown returned from the crawl the first processing step is to review the markdown and parse out any {title: url} pairs from the markdown. We will use these to seed our crawl JSON in the "crawl_list" block

4. Now we need to pull our existing roles list for this org. This will see into the "org_list" array in the crawl JSON. We will pull the title, role_url from org roles for this org. 

5. Now we can de-dupe the crawl list against the org list. To do this, loop through the org list and for each item, if it exists in the crawl list set the crawl list {"found_in_org_list": true} and also set the org list {"found_in_crawl_list": true}

6. Now we look for missing roles. Loop through the org list. If any of these roles are not found in the crawl list set {"found_missing": true} indicating that they are missing from this crawl

7. Using the crawl JSON, strip out any previously identified non-job links. This is done by reading the list of non-job links from the org_nonjob_links table into a nonjob list and comparing the crawl JSON list against the nonjob list and setting {"non_job_match": true}

8. Next we run the crawl JSON through domain matching, ignoring any {"non_job_match": true} and {"found_in_org_list": true} records. If we find any domain matches, they are set as {"domain_match": true}. Once domain extraction is complete against the list we will write an org_crawl_log with action_type=domain_extract to log this effort

9. Next we run the crawl JSON through heuristic matching, ignoring any {"non_job_match": true} and {"found_in_org_list": true} records. If we find any heuristic matches, they are set as {"heuristic_match": true}. Note we will ignore the previous domain_match here, it is ok for both domain and heuristic to find a match. Once heuristic extraction is complete against the list we will write an org_crawl_log with action_type=heuristic_extract to log this effort

10. Originally at this step we were de-duping the domain and heuristic lists together, but there is no need to do that anymore. At this point the list is already set in the crawl JSON. The "deduped list" is simple any url in the array with {"non_job_match": false} AND {"found_in_org_list": false} and either {"domain_match": true} OR {"heuristic_match": true}

11. Now we get going with the LLM. But first, we need to crawl the page at the URL. The role URL is passed to crawl4ai. This action is saved in the org_crawl logs with an action_type=crawl4ai_job and we save the resulting markdown, status code, and calculate and store the time it takes to do this crawl in a log record in org_crawl_logs

12. Next we run a llm call basically asking "is this a job?" and asking for a structured JSON response. We pass in the markdown from the crawl4ai_job result. If the llm statees this is a job we mark the role as {"found_new_job": true} in the crawl list

13. If this is determined to be a job, we run another llm call to attempt to extract role metadata from the crawl4ai_job markdown. We save this information into the database in a new org_roles record

14. Now we can start cleanup. The first cleanup task is to write any new non-job URLs to the org_nonjob_links table. The logic here is that we loop through the crawl list and look for any {"non_job_match": false} AND {"found_new_job": false} AND {"found_in_org_list": false} records and add these urls to the org_nonjob_links

15. The next cleanup task is to update the crawl_count column for org_roles. This is for any any org list records where {"found_in_crawl_list": true} and they are set to = old_value + 1

16. The next cleanup task is to update the missing_count column for org_roles. This is for any any org list records where {"found_missing": true} and they are set to = old_value + 1

17. We can then save any new jobs. These are roles where {"found_new_job": true} in the crawl list


Crawl JSON Structure
{
    "crawl_list": [
        {
            "title": "URL Title Goes Here",
            "url": "URL Goes Here",
            "found_in_org_list": false,
            "non_job_match": false,
            "domain_match": false,
            "heuristic_match": false,
            "found_new_job": false
        }
    ],
    "org_list": [
        {
            "title": "URL Title Goes Here",
            "url": "URL Goes Here",
            "found_in_crawl_list": false,
            "found_missing": false
        }
    ]
}