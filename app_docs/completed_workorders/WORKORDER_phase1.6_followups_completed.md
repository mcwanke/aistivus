

# Current state of the app issues, bugs and changes

-[X] need to add a new applicaiton status of "Skipped". If I evaluate on but choose to not submit a resume I want a better end state status than "Withdrawn" since that implies that I was in process already. We should keep Withdrawn, but add a new "Skipped" status

-[X] we should split the eval into 3 phases. Currently on the Application subtab there is a button "Generate External Eval + Tailored Resume" however, once you generate that and pop it into an external AI like Claude, the "Import External Eval" button is over on the job subtab. Doesn't make sense. I want to split this generate funciton into 3:
  - [X] Generate external eval - this button should be on the jobs page next to the "Import External Eval" button
  - [X] Generate Resume - see Resume / Cover subtab updates below (stubbed in A3; full workflow deferred to later FOLLOWUPS)
  - [X] Generate Cover letter - see Resume / Cover subtab updates below (stubbed in A3; full workflow deferred to later FOLLOWUPS)

-[X] selecting the "I Applied!" button should set the Apply Date to today. Currently it only changes the application status value

-[X] Resume / Cover subtab updates: here we currently have two sections in the main work area: UPLOAD and DOCUMENTS. Note that there is no section title UPLOAD right now - we should add one here. Above the UPLOAD section we should add a new one titled GENERATE. This will have two buttons: Generate Resume and Generate Cover. As part of this work we will need to design and create these workflows and the prompts that go along with them. (GENERATE section + UPLOAD label done in A3; full workflows deferred to later FOLLOWUPS)

-[X] on the application subtab we need to change the order of the left navigation. The first item should be "Details" but under that should be "Application Questions". Also the "Add Application Note" and "Add Event" sections are basically doing the same thing. I think we should combine them. TODO ADD MORE CONTEXT HERE (addressed in B4–B8)

-[X] on the JOB DETAILS subtab, a little bit of re-work on the left nav. The TOP of the left nav reads: ACTIONS. We should rename that to JOB INFO. Then the first option should be then Job Info, then Evaluations, then Job Descriptionm and finally Company Info. Job Info is new and we should move the job data from the bottom of the left column (Company Name, EXCITEMENT, MY RATINGS, and JOB INFO) into this main section. (A5)

-[X] on the JOB DETAILS subtab under the Company Info section we have ADD COMPANY INFO and a list of company info. First, the list should have header text like ADD COMPANY INFO and this should read COMPANY INFO. Next, above the add section we should have a COMPANY SUMMARY section. This should have a description of the org. This text should show as text and we should have an "Edit Summary" button and a "Generate External Summary" button. The Edit should allow for editing or pasting in of a summary. The Generate External Summary button should act like the Generate External Eval button and show a popup with a prompt. Part of the work here will need to be defining what that prompt is. Also in the ADD COMPANY INFO section it lists the buttons like:
- TYPE   NOTES
- URL    SAVE button
This looks weird. It should be TYPE then URL on the first line with TYPE being 30% and URL being ~60%, then the second line has a notes field with 3-4 lines of space (not a single line, more like a textbox) that spans ~70% of space and the SAVE button in about 20% on the right. (A7, A8, A9)

-[X] finally, let's add a new section to the JOB DETAILS subtab at the bottom of the list. This should be called ACTIONS. In it there will be some buttons and text. The first button is that we will move the "Export Job" button from the Job Description section. This should have text similar to: "This exports the main job data into an external reports/ folder. This allows you to save a copy or import into a new instance." As we go there will be more action buttons added here. (A6; nav structure refined in B3)

-there is a circular button in the bottom right of the app that when clicked opens a TANSTACK interface. Is this something we can disable? (deferred to later FOLLOWUPS)


# FOLLOWUPS-B - this is the second collection of follow ups to phase 1.6

- [X] bug: I am no longer able to click on or interact with the stars for EXCITEMENT LEVEL. I should be able to edit the 1-5 star rating for a job (B1)

- [X] on Company Info we jsut added a "Generate External Summary" button. Let's change that to "Generate External Summary Prompt" (B2)

- [X] for the external summary prompt I want to tweak it and add in this at the end: "Output your summary inside a markdown code block." (B2)

- [X] we had a mis-communication on the ACTIONS item for the left nav of JOB DETAILS. THis was supposed to be a page, not adding the button on the left nav. Let's leave the ACTIONS text along here and add a "subpage" named "Job Actions" and move the Export Job button and associated text there (B3)

- [X] next we need to go back and work on the APPLICATION subtab options that were defined above but not addressed in FOLLOWUPS-A-phase1.6.md (B4–B8)

- [X] on the APPLICATION subtab on the left nav we should the company, job title and status under the options. Remove these. (B4)

- [X] on the APPLICATION subtab on the left nav the title is ACTIONS, rename this to APPLICATION INFO (B4)

- [X] I know this might contradict some of the previously defined work here, but instead of merging "Add Event" and "Add Applicaiton Note" let's change "Add Event" to "Change Application Status". Then, on the "App Detail Summary" change the status dropdown to a text field. Back on the "Change Application Status" area we should check to see if the data structure here can hold these notes for app status changes. The goal of this section is to allow the user to change the status and provide a note for why it is changing. (B5, B6)

- [X] next we should rename the "Add Application Note" to "Add App Note/Comms" and the options on this page should now be: General, Compensation, Feedback, Email Comms, Phone Comms, Feedback, Offer, Rejection (B7)

- [X] we are dropping or changing a bunch of the fields from these two pages, things like: Phone Screen, On-site Interview, etc. This is ok. Most of these should be items in the INTERVIEW subpage anyways. That will be worked on in a future FOLLOWUPS item. (B8)

# FOLLOWUPS-C [x] COMPLETE — see FOLLOWUPS-C-phase1.6_completed.md

-[x] a quick walkthrough page-by-page:
  - JOB DETAILS -> Job Detail Summary - looks good to me
  - JOB DETAILS -> Evaluations - also looking good and working well
  - JOB DETAILS -> Job Description - working well, good to go
  - JOB DETAILS -> Company Info - I like the changes we made, happy with this for now
  - JOB DETAILS -> Job Actions - ok for now. I have a few idae for more actions here, but they can wait
  - APPLICATION -> App Detail Summary - page is good for now
  - APPLICATION -> Change Application Status - the Save button here does not clear the fields, otherwise this page is good
  - APPLICATION -> Add App Note/Comms - I like te results of the changes, this page is good
  - APPLICATION -> Application Questions - page is good for now
  - APPLICATION -> Add Lesson - probably good, haven't re-tested it in a while but last time I checked it was working ok

-[x] now on to the RESUME / COVER page. The uploading and typst functions are working well here. I have been using them actively. The first thing I would change is that it would be nice to have a "Rename" button on a line that pops up a textbox where I can change the name of a file and this change will propagate to the db and disk.

-[x] next, on the RESUME / COVER page we need to define the workflows for the "Generate Resume" and "Generate Cover Letter" buttons. For these, they need to both generate prompts like we do on the JOB DETAILS -> Evaluations page with the "Generate External Eval" button - so show the popup with a copy button. This will be the first pass. Once we get that working I will see about how I want to modify the workflow to use any defined AIs for automatic generation. I will provide the prompt text at the point that we are actually building the functions, not now.

-[~] we will save the INTERVIEW subpage for another followups round as I want to add a few things there.

-[x] the final piece to tackle here is the APPLICATION LOG subpage. There are a number of changes and tweaks that are needed here.
  - we need to clarly define the columns that are shown on these rows. Right now they aren't consistent and some things (like some timestamps) wrap. So here is the target columns:
  | timestamp | log type label | info | actions | dropdown arrow|
  -a LOT of these lines have lots and lots of extra space. Let's use it. Here is the target space by % to consider (but we need review here in case these spaces seem off!):
  | 20% | 15% | 50% | 10% | 5% |
  -some of these lines have actions - the COPY action should stay and really be the only actionable button on the rolled-up row. Clicking anywhere else on the unrolled row should unroll it. Then clicking anywhere else (besides the copy button) on the unrolled row header should roll it back up
  -since we just changed the row header action, now we need to address the functions that were available on the row header. First, let's define the space in an unrolled row:
  | reserved/20% | info/65% | actions/10% | reserved/5% |
  This spacing should match the row header with the central info section spanning 3 of the header rows. Now for the functions. The first is the ability to edit timestamps. If the timestamd is editable, then in the first reserved/20% column add a button to "Edit Timestamp". The other one I see right now is that some rows have a Delete button. This should move into the actions/10% column in the unrolled view so that actions like delete take a bit more effort to get to. Also as part of this a review should be done to see if any additional actions need to be considered here.
  -now for some of the extra data. For audit records, the current data looks like:
  | (timestamp) | audit (label) | AUDIT (text) | Copy (button) | roll down/up arrow |
  we should go ahead and change the AUDIT (text) here to the actual audit value, one example from my data is: "Status updated to: rejected". We will also show this in the unrolled row data, but there isn't any reason to not show it in the rolled-up view.
  -next, I want to review all of the prompts that are generated and the return values and see if we can't get them all into the application log here. Let's review this together and see what we can come up with as part of this effort.


  # FOLLOWUPS-D [x] COMPLETE — see FOLLOWUPS-D-phase1.6_completed.md

  -[x] first thing I want to do is to review the current state of the application and look for identifying information. I found in previous work that the prompts were becoming personalized to me. They said things like "check with Kevin". I consider this akin to PII that is leaking out here. We should do a pass through the app and look for any other isntances of this and clean it up! There is a reason that we have .gitignored files like my_data/ and jobsearch.md that are meant to hold "PII-like" user data. 

  -[x] I checked the templates/ folder and want to make a pass through the templates. I noted that we have now added a jobsearch_cover.md but don't have a template for it. I also want to review the jobsearch.md template (currently at JOBSEARCH_TEMPLATE.md) and ensure that it is up to date

  # FOLLOWUPS-E [~] DEFERRED — see FOLLOWUPS-E-phase1.6_completed.md

  # FOLLOWUPS-F — tracked in FOLLOWUPS-F-phase1.6.md

  -i think the next big step is to migrate to docker here, which is defined in phase 1.7. However, before we do that, I want to get this project nice and clean. Therefore, we should make a pass through everything at this point. Here is what I want to tackle in FOLLOWUPS-F:
  - review previous items in this document (WORKORDER_phase1.6_followups.md). We haven't marked them as checked in a while, so review previous items and update to ensure that things are nice and clean, mark any done items as [x] and any deferred items as [~] (don't make assumptions here, if the info isn't in memory or CLAUDE.md or PROJCET_SPEC.md then ask!)
  -add a migration plan that assumes that phase 1.7 was done and explains how I will migrate my local data to the docker instance. Create this doc in ignore/MIGRATION_PLAN.md it is being created here because this document is ONLY for me and my migration needs
  -while we are doing this, I want to start understanding how new features/fixes/etc will work as well as set up a CI/CD pipeline to help automate the testing. Let's discuss this so that I feel like I fully understand it. I want to know how new features will get from my laptop to my docker instance and how all of that works. I also want to practice CI/CD principles and make sure that my knowledge is solid there
  -I also want you to think through this project/app at a macro level. We are hitting an inflection point once it goes into docker, maybe we even bump it to 2.0. If that is the case, what is the overall state of the app and repo? Are there any suggestions that you would make that should be considered? If you were in the role of a senior engineer what changes would you suggest I consider making here? If you were in the role of a senior security engineer are there any changes you would suggest? If you were in the role of a senior backend engineer are there any changes you would suggest?
  -we should also take a moment to look through the frontend and backend tests. I believe that there are 6 frentend tests that are constantly fgailing, let's see if we can get these addressed
  -we should als make a security pass through everything. We haven't done that in a while. Let's look for risks like prompt injection and other potential issues. Worst case is that someone clones the repository and hosts it in a public docker instance. I am not looking for bulletproof security here, but I would like a baseline level of security in the app - in other words I don't want it to have that "vibe coded" feel
  -let's review the current state of the root README.md I have a feeling that it is time to update this, let's go ahead and get it updated assuming that phase 1.7 is done.
  -let's also do a pass through CLAUDE.md and PROJECT_SPEC.md. A while back we made an effort to remove/clean out closed items so that these files and their token usage would be minimized. Let's review them to ensure that they are fully up to date and as clean/minimal as possible here
  -let's also write out the WORKORDER_phase1.7.md plan here. This will probably need some review and discussion, so note that when laying out the plan to tackle these followups items