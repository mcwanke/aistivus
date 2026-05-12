
Changed my mind - requested salary comes in when an application is generated, not when 
a job is submitted. So a requested_salary column should like in the applications table,
not in the jobs table. Need to make this change and add a field for input in the
application creation flow

Need to update the claude prompt that is generated so that we can output a block of text and re-import that back into the system. The reason for this is that claude is doing the same evaluation that the local model is doing and if we have a copyable output from the claude run we can re-import it as an evaluation run. 

Make sure that we are storing the LLM prompts so that we can show them in the application logs alongside the prompts and other information. I want to be able to copy/paste the original prompt and run it elsewhere.

Need to add a "copy" button to logs/prompts/etc in logs

can i leave a page and navigate around while an evaluation is running? Could we get a toast to popup anywhere on the site when events are done when they are running in the background?

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

Add a myScore field where I can add in my own rating to help sort through jobs

want to add a weighted scoring algorithm for the scoring value that shows up. Something like local is worth 1 and claude is worth 3, then generate the avrage based on this 
weighted scoring system


