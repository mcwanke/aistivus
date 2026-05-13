



Open questions to ask (not part of the new phase 1, ignore for now):
- can i leave a page and navigate around while an evaluation is running? Could we get a toast to popup anywhere on the 
  site when events are done when they are running in the background?

Future ideas, ignore for now:
- idea - while evaluating do a matrix style character dropdown with messages.... add a new column to capture this for each evaluation
- want to add a weighted scoring algorithm for the scoring value that shows up. Something like local is worth 1 and claude is worth 3, then generate the avrage based on this weighted scoring system
- bug - when starting an applicaiton it uses the application object creation date as the "apply date" at the top of the application_detail page. Need to adjust that - ideally we would add a button titled "Applied" to this page to the right of the Excitement Level action. This button would generate an audit entry for "Applied" and also move the Applicaiton Status to Applied. Also, once applied this is just greyed out for now, then
later on we can rename the button based on current state and implement more functionality
- I made a typo when typing in a title. Need a way to edit a company name, title, or other job/application info




Current phase 1 changes to consider/make:
- Add a myScore field where I can add in my own rating to help sort through jobs
- move 'name' column from companies table to 'company_name' in jobs table
- change companies table name to job_company_info
- would like to store a calculation for average model run time - adding a new table to capture this information and probably need a button in settings to re-calculate model run averages

Change list for database tables:
- jobs table
  - add columns agg_role_fit, agg_scope_fit, agg_culture, agg_comp (these will be averages calculated for any evaluations for this job)
  - add column agg_score_overall (an algorithmically calculated value from any evaluations run, initial formula is simply an average of all evaluation runs for this job/application will tweak this algorithm later)
  - add columns my_role_fit, my_scope_fit, my_culture, my_comp (this gives me the chance to add in my own scores)
  - add column my_score_overall (gives me the chance to add in my own overall score)
  - move excitement_level from applications table to jobs table
  - need to add an auto-populating created_at column for the create timestamp
  - when we add a job record we also need to create a corresponding application record with an 'not-started' state. This is so that we can start adding data to the application_logs table which needs an application_id

- evaluations table
  - remove column log_entry, not needed
  - add column 'prompt' where the prompt text gets saved
  - add column 'missing_keywords' where missing keywords gets saved
  - need to understand why domain_match column isn't getting populated
  - we are adding a llm_models table so need to change the 'model_used' column to a 'llm_model_id' reference column

- applications table
  - add column 'requested_salary' here

- application_logs
  - note_type - need to update this column to type_id (see system_types table below)
  - note - need to update this column to log (to match table name)
  - timestamp - let's update/rename this to 'log_timestamp' (for clarity/readability)
  - let's also add a 'llm_call_log_id' column that only gets populated when a llm call against this job/application is made

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

- llm_call_log table
  - need to add a 'prompt' field here to store the actual prompt being sent
  - also need to start populating this table with local llm logs. We won't be able to populate all fields, but should populate as many as we can here
  - also when any llm_call is made we need to add a record in the application_logs table creating a link to this llm_call_log record so that we can add the prmopt used to the application logs sectino of application_detail
  - need to add a 'call_time' column to start storing llm call times

- llm_models table
  - need to add this as a new table
  - the columns should be:
    - id
    - model
    - endpoint (this will store the pathing for the ollama and/or url for endpoints)
    - estimated_eval_time (this will store a calculated estimated evaluation time)
    - available (a binary flag that is set/reset at startup indicating if models are available)
    - default_flag (a binary flag that can only be set on 1 record indicating which is the target default)
    - model_weight (this is an integer field that will help in scoraging aggregate calculations down the line, default here is 1)
    - created_at
  - the purpose of this table is so that we can move things from config.yaml to the database
  - we will also need a function to re-query availability of these models at startup
  - we will need to update the evaluate page and the popup modal for re-evaluations to list out any available models
  - we will need to add management of this information to the settings page

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
    - top section - Job Detail
      - contains company name, job title, location, remote status, job created date
      - need to add a button here to edit job information
      - this section does not roll up/down
    - next section - Application Status
      - this should list out current application status (pill formerly in left job rows)
      - this should also list out relevant information for started applications (apply date, application status, excitement level)
      - "+ Start Application"/"View Application ->" button (moved from left job rows)
      - this section does not roll up/down
    - next section - Job Description
      - pretty much same as current, descriptino should roll up/down
      - need to add an Edit button to allow a modal for editing the job description
      - should have a HR below this section (all sections should be separated with a HR list is currently shown above job description)
    - next section - Evaluations
      - should have the ability to roll up/down
      - add the Re-Evaluate button (moved from left job rows)

Change list for evaluate page:
- When evaluations are running, put something animated in the right panel of the evaluations page
- When starting a new evaluation - clear/reset the right panel. Currently it shows the previous evaluation
- for evaluation runs we have a count-up timer. Keep this, but also add a count down timer based on the calculated average model run time from the new llm_models table






