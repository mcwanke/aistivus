
Changed my mind - requested salary comes in when an application is generated, not when 
a job is submitted. So a requested_salary column should like in the applications table,
not in the jobs table. Need to make this change and add a field for input in the
application creation flow

Need to update the claude prompt that is generated so that we can output a block of text and re-import that back into the system. The reason for this is that claude is doing the same evaluation that the local model is doing and if we have a copyable output from the claude run we can re-import it as an evaluation run. 

Make sure that we are storing the LLM prompts so that we can show them in the application logs alongside the prompts and other information. I want to be able to copy/paste the original prompt and run it elsewhere.

Open questions to ask:
- can i leave a page and navigate around while an evaluation is running? Could we get a toast to popup anywhere on the 
  site when events are done when they are running in the background?

When evaluations are running, put something animated in the right panel of the evaluations.html page

After an evaluation is complete, do something. Maybe just add a Clear button? I don't know, but it stinks to have to clear everything manually and start over

When starting a new evaluation - clear the right panel. Currently it shows the previous evaluation

idea - while evaluating do a matrix style character dropdown with messages.... add a new column to capture this for each evaluation

bug - when starting an applicaiton it uses the application object creation date as the "apply date" at the top of the application_detail page. Need to adjust that - ideally 
we would add a button titled "Applied" to this page to the right of the Excitement Level
action. This button would generate an audit entry for "Applied" and also move the 
Applicaiton Status to Applied. Also, once applied this is just greyed out for now, then
later on we can rename the button based on current state and implement more functionality

should start capturing LLM processing time so that instead of a count up timer we can do an estimated time dountdown timer on the evaluations.html page

I made a typo when typing in a title. Need a way to edit a company name, title, or other job/application info



want to add a weighted scoring algorithm for the scoring value that shows up. Something like local is worth 1 and claude is worth 3, then generate the average based on this weighted scoring system


Current phase 1 changes to consider/make:
- Add a myScore field where I can add in my own rating to help sort through jobs
- move 'name' column from companies table to 'company_name' in jobs table
- change companies table name to job_company_info

Change list for database tables:
- jobs table
  - add columns agg_role_fit, agg_scope_fit, agg_culture, agg_comp (these will be averages calculated for any evaluations for this job)
  - add column agg_score_overall (an algorithmically calculated value from any evaluations run, I will provide the formula here)
  - add columns my_role_fit, my_scope_fit, my_culture, my_comp (this gives me the chance to add in my own scores)
  - add column my_score_overall (gives me the chance to add in my own overall score)
  - move excitement_level from applications table to jobs table
  - need to add an auto-populating created_at column for the create timestamp

- evaluations table
  - remove column log_entry, not needed
  - add column 'prompt' where the prompt text gets saved
  - add column 'missing_keywords' where missing keywords gets saved
  - need to understand why domain_match column isn't getting populated

- application_logs
  - note_type - need to update this column to type_id (see system_types table below)
  - note - need to update this column to log (to match table name)
  - timestamp - let's update this to log_timestamp (for clarity/readability)

- system_types table
  - purpose here is to have a table that stores type information. The purpose is twofold. First so that types aren't 
    hardcoded in code. Second is so that we can add a Type Settings section to the Settings page. 
  - there is only a created_at column here, no edited_at. This is on purpose. Types can only be added or deleted, not edited
  - other tables will link to this table with a type_id
  - types can only be deleted if there are no associated type records
  - table structure
    - id          INTEGER PRIMARY KEY AUTOINCREMENT
    - type_name   TEXT, (holds the name of the type, )
    - type_value  TEXT,
    - created_at  TEXT NOT NULL DEFAULT (datetime('now'))

Change list for jobs page:
- Left job rows
  - company name (exits now, stays)
  - job title (exits now, stays)
  - pin and location name (need to add this)
  - remote type pill (exists now, stays)
  - application status pill (exists now, remove from this section)
  - fit pill (exists now, remove from this section)
  - eval count pill (exists now, remove from this section)
  - Re-Evaluate button (exists now, remove from this section)
  - "+ Start Application"/"View Application ->" button (stays but needs to be a little bit bigger)
  - each row should look like:
    |-------------------------------------------------------------------|
    | Company Name          1.0  2.0  3.0  4.0  8.5  Button-Application |
    | Job Title              /5.  /5.  /5.  /5. /10  application-status |
    | Location-Pin Location                                             |
    |-------------------------------------------------------------------|
- Right summary area 
  - first need to make this 15% wider
  - this should have different sections
  - top section - Company
    - company name
    - job title
    - location, remote type
    - add a button "Edit" that pops up a modal where the company name, title, and data in job_company_info can be edited
  - next section - My Ratings
    - list my_role_fit, my_scope_fit, my_culture, my_comp and my_score_overall
  - next section - Job Description
    - job description w/ roll up/down button to show/hide the job description
  - next section - Evaluations
    - evaluations w/ evaluation count
    - need to add a roll up/down button like job description
    - 

