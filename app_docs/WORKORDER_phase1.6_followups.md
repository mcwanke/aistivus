

# Current state of the app issues, bugs and changes

-need to add a new applicaiton status of "Skipped". If I evaluate on but choose to not submit a resume I want a better end state status than "Withdrawn" since that implies that I was in process already. We should keep Withdrawn, but add a new "Skipped" status

-we should split the eval into 3 phases. Currently on the Application subtab there is a button "Generate External Eval + Tailored Resume" however, once you generate that and pop it into an external AI like Claude, the "Import External Eval" button is over on the job subtab. Doesn't make sense. I want to split this generate funciton into 3:
  - Generate external eval - this button should be on the jobs page next to the "Import External Eval" button
  - Generate Resume - see Resume / Cover subtab updates below
  - Generate Cover letter - see Resume / Cover subtab updates below

-selecting the "I Applied!" button should set the Apply Date to today. Currently it only changes the application status value

-Resume / Cover subtab updates: here we currently have two sections in the main work area: UPLOAD and DOCUMENTS. Note that there is no section title UPLOAD right now - we should add one here. Above the UPLOAD section we should add a new one titled GENERATE. This will have two buttons: Generate Resume and Generate Cover. As part of this work we will need to design and create these workflows and the prompts that go along with them.

-on the application subtab we need to change the order of the left navigation. The first item should be "Details" but under that should be "Application Questions". Also the "Add Application Note" and "Add Event" sections are basically doing the same thing. I think we should combine them. TODO ADD MORE CONTEXT HERE

-on the JOB DETAILS subtab, a little bit of re-work on the left nav. The TOP of the left nav reads: ACTIONS. We should rename that to JOB INFO. Then the first option should be then Job Info, then Evaluations, then Job Descriptionm and finally Company Info. Job Info is new and we should move the job data from the bottom of the left column (Company Name, EXCITEMENT, MY RATINGS, and JOB INFO) into this main section. 

-on the JOB DETAILS subtab under the Company Info section we have ADD COMPANY INFO and a list of company info. First, the list should have header text like ADD COMPANY INFO and this should read COMPANY INFO. Next, above the add section we should have a COMPANY SUMMARY section. This should have a description of the org. This text should show as text and we should have an "Edit Summary" button and a "Generate External Summary" button. The Edit should allow for editing or pasting in of a summary. The Generate External Summary button should act like the Generate External Eval button and show a popup with a prompt. Part of the work here will need to be defining what that prompt is. Also in the ADD COMPANY INFO section it lists the buttons like:
- TYPE   NOTES
- URL    SAVE button
This looks weird. It should be TYPE then URL on the first line with TYPE being 30% and URL being ~60%, then the second line has a notes field with 3-4 lines of space (not a single line, more like a textbox) that spans ~70% of space and the SAVE button in about 20% on the right.

-finally, let's add a new section to the JOB DETAILS subtab at the bottom of the list. This should be called ACTIONS. In it there will be some buttons and text. The first button is that we will move the "Export Job" button from the Job Description section. This should have text similar to: "This exports the main job data into an external reports/ folder. This allows you to save a copy or import into a new instance." As we go there will be more action buttons added here.

-there is a circular button in the bottom right of the app that when clicked opens a TANSTACK interface. Is this something we can disable?