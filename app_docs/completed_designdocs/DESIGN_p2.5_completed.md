


# 

I have been having a lot of issues with resume .typ generation in claude. What I want to do is to rework the workflow for resume .typ generation here in phase 2.5. This is a design document that we will start from and the goal will be to generate a WORKORDER_p2.5.md doc that we can work against in future implementation sessions.


# claude session summary context

First, I have been discussing this in a claude session and I asked in that session to generate a summary which I am going to paste here. Note that this should NOT imply that this is the full plan. I will cover that later in this doc, but I wanted to bring in that context. Here is the summary:

The architecture decision

Three-button flow: Button 1 generates, Button 2 evaluates, Button 3 corrects. Each prompt has one job. This was explicitly chosen over a single prompt or two-prompt approach because prompt overload causes line count drift, formatting drift, and inconsistent quality gates.
What each button's prompt does

Button 1: Pure generation. Strongest possible .typ on first pass. Escape character rule baked in. No self-review.
Button 2: Judgment only. Recruiter scan (human 8-10 second gut check), ATS smell test, structured JSON output the app stores and reimports. Possibly company/culture research. Does not output a .typ.
Button 3: Pure execution. Receives app-computed line counts + Button 2 JSON + optional human feedback popup. Applies correction list. Outputs final .typ. No judgment, no counting.

What the app handles in code, not prompts

Exact line count using ceil(chars/97) for bullets, ceil(chars/100) for prose, ceil(items/2) for competencies. Target range 93-102.
Escape character scanning for unescaped #, $, @
Keyword coverage against ATS keyword list

The known failure modes we're designing against

Model approximates line counts instead of computing them — solved by moving to app code
Formatting code drift (spacing, font sizes) when model edits .typ — solved by Button 3 being correction-only with explicit do-not-touch rules
Plex sub-section structure drift — solved by locking canonical labels in jobsearch.md, not in app-side prompts

What's unresolved and needs design discussion

Button 2 JSON schema — what fields does it output, what does the app store
Human feedback popup placement and format
Whether company/culture research in Button 2 is live fetch or manual input
Qwen2.5:7b role — confirmed too weak for judgment checks, code handles mechanical checks, local model role is currently undefined in this flow


# notes on prompt re-work and prompt generation
- the overall goal of prompts now is that every prompt should be able to be dropped into a brand new session. This focuses the prompt and attempts to streamline things into more of a one prompt = one job approach. Currently things like the resume generation prompt fits more of a one prompt = many jobs style and it is causing problems
- this phase 2.5 effort will require introducing new prompts into the system. These new prompts should fit the new prompt structure, with a prompt .md file and also that being pulled into the database upon startup and then an edit through the Settings -> Prompts functionality


# here are the changes and plan

# Updating App Detail Summary subpage and migrating/removing the Change Application Status subpage
Starting with the APPLICATION -> App Detail Summary Page:
- we are reworking this page
- the data fields here are spread out. We are going to condense them a little bit like this:
row 1:
| STATUS (label)    APPLY     APPLY URL (label)      |
| [status] (value)  BUTTON    [url] (value w/ link)  |
row 2:
| APPLY DATE (label)   REQUESTED SALARY (label)  END DATE.            SAVE    |
| [date] (edit field)  [data field] (textbox)    [date] (edit field)  BUTTON  |

-next, we are going to remove the Change Application Status subpage and move the data fields here. These will go into new rows under row 2:
row 3:
| CHANGE STATUS (label)  |
| [data] (dropdown)   |
row 4:
| REASON FOR CHANGE (optional) (label)  |
| [data field] (textbox)                |
row 5:
| SAVE   |
| BUTTON |

# Adding new Workflow subpage
Next we are adding a new page that goes under the  with the APPLICATION -> App Detail Summary Page. This new subpage title is "Workflow"
-this will contain a bunch of buttons and other elements. It will describe the overall workflow for an application
-it will also consolidate the actions around generating evaluations and generation activites around applying for a job
-this page will consolidate actions, buttons, and external prompt generation activities
-the subpage will be structured as a workflow, and the subpage should be setup like this:
| EVALUATIONS (label)
| COUNT (label)   OVERALL (label) ROLE (label) SCOPE (label) CULTURE (label) COMP (label) Re-Run Internal Eval (button) Generate External Eval (Button) Import External Eval (Button) 
|  X (eval count)   8.3 (score)    4.0 (score)  4.5 (score)    4.5 (score)   4.5 (score)   (buttons can span into this row for aesthetics)
| Review Evaluations (link to Evaluations subpage)
| (hr for separation)
| RESUME GENERATION (label)
| Pass 1 (label) Generate First Pass .typ Prompt (button to generate prompt popup)
| UPLOAD .TYP RESUME (label) BROWSE (button) (text showing file or No file selected) UPLOAD (button)
| (completion checkmark) (pass 1 description text)
| Review Resumes (link to Resumes subpage)
| (blank line)
| Pass 2 (label) Generate Recruiter Review Pass Prompt (button to generate prompt popup)
| IMPORT REVIEW PASS FEEDBACK (label) IMPORT (button that shows import popup) ADD FEEDBACK (button to show prompt allowing user feedback) REVIEW FEEDBACK (button to show popup with previous review feedback)
| (completion checkmark) (pass 2 description text)
| (blank line)
| Pass 3 (label) Generate Final Pass .typ Prompt (button to generate prompt popup)
| (completion checkmark) (pass 3 description text)
| (hr for separation)


# Moving Evaluations
Next we are going to move the "Evaluations" subpage from JOB DETAILS to APPLICATION. This will go under the APPLICATION -> Workflow subpage
-this moves as-is, meaning that the scoring, rows, and buttons should stay where they are and just move to this new subpage


# Moving RESUME / COVER
Next, we are going to move the RESUME / COVER page from the tabbed interface into the subpages under APPLICATION. This will be somewhat similar to the move for the Evaluations pages - the subpage content will not change, it will just remove the RESUME / COVER tab from that tabbed interface and instead list out


# Displaying Fonts
In the Settings page we should move the TYPST block from the Storage subpage to the System Info subpage
In the settings page we whould add a new block to the System Info subpage that lists out all fonts found in the fonts folder on startup that can be used in typst generation compiles. This would be a display-only block.


# Other tweaks
-is it possible to make the filters on the jobs page persistent?


# Summary of the Jobs page, tabs, and subpages
The jobs page is getting a decent rework in this phase. The trigger here is in wanting stronger resume generation flows, but other areas are getting caught up in this refactor. When done, the jobs page should have this structure on the tabbed view for a job:
TAB: JOB DETAILS
  LEFTNAV: Job Details Summary (no changes)
  LEFTNAV: Job Description (no changes)
  LEFTNAV: Company Info (tweaking actions available here)
  LEFTNAV: Job Actions
TAB: APPLICATION (change name to APPLY)
  LEFTNAV: App Details Summary (Change name to Application Details, rework of page)
  LEFTNAV: Apply Workflow (new page added)
  LEFTNAV: Evaluations (moved from JOB DETAILS tab)
  LEFTNAV: Resume (moved from RESUME / COVER tab)
  LEFTNAV: Cover Letter (moved from RESUME / COVER tab)
  LEFTNAV: Add App Note/Comms
  LEFTNAV: Application Questions
  LEFTNAV: Add Lesson
TAB: RESUME / COVER (remove, content migrated to other areas)
TAB: INTERVIEW (no changes here)
TAB: APPLICATION LOG (no changes here)


# Subpage: App Details Summary - lets go through the actions, buttons, and elements described here
-the row structure and functions are described above
-there aren't any new functions here
-just in case, here is a repeat of the intended functionality:
  -row 1 - status label and status value display
  -row 1 - apply button. This is the button that starts as "I APPLIED!" then after that shows a disabled state with a "APPLIED [checkmark]" state
  -row 1 - Apply URL with label showing a clickable URL to the application page
  -row 2 - Apply Date label and date entry/edit field. This isn't new, just moved around from current position
  -row 2 - Requested Salary label and entry field. This isn't new, just moved around from current position
  -row 2 - End Date label and date entry/edit field. This isn't new, just moved around from current position
  -row 3 - Change Status label and dropdown. This is new to this page, but it isn't new functionality. This is the former "NEW STATUS" function from the Change Application Status subpage
  -row 4 - "REASON FOR CHANGE (OPTIONAL)" label and text field. This is new to this page, but it isn't new functionality. This is the same "REASON FOR CHANGE (OPTIONAL)" function from the Change Application Status subpage
  -row 5 - SAVE button. Upon review of theApp Details Summary page I noted that there isn't a Save button currently. This adds one and makes storing of any changes on this page a manual function

# Subpage: Apply Workflow - lets go through the actions, buttons, and elements described here
-this is the biggest area of change in this phase 2.5 effort. The primary goal here is to re-work the resume generation flow from an overly complex single prompt into a multi-prompt workflow
-the intent here is to consolidate application actions into a single page, so it is pulling actions from other pages to this one subpage location
-the "rows" that were described above are listed out here. Note that I use "row" terminology, but this isn't meant to indicate actual rows, this is a loose logical grouping mechanism to describe elements here, not an actual definition of row information. See above for that. These "rows" include:
  -row 1: this first row copies over the evaluations actions which were formerly on the JOB DETAILS -> Evaluations page. It copies over the accumulated scoring and also shows the number of evaluations that have been run. It adds in the button functions to re-run internal evaluations, generate a prompt for external evaluations, and import the results from external evaluations. The actions/navigation/popups that occur for these buttons will not change here
  -row 2: a link to navigate to the moved Evaluations subpage is being added here. This allows the user to navigate there and review evaluations data
  -row 3: This is where resume creation starts. This row covers the Pass 1 of resume generation. The goal for this prompt is to build the initial .typ resume. What I have found is that this initial pass doesn't meet final expectations, but does tend to generate a solid initial resume. This prompt will require design work before implementation occurs here. This design doc doesn't cover that design work, so make sure to call this out before we write code here. This row also includes the upload functionality, this is not new but should be copied over from the current RESUME/COVER page. It should also be noted that this design doc also has that upload functionality on the new Resume and Cover Letter pages, that duplication of functionality is by design
  -row 4: a link to navigate to the moved Resume subpage is being added here. This allows the user to navigate there and review/manage resume files
  -row 5: It is possible that the initial resume creation in Pass 1 builds a valid and strong resume. Therefore, this Pass 2 and the later Pass 3 might not be needed. This row has a button to generate a prompt, but it will also need to kick off some internal code to read the .typ file and calculate line usage. This new functionality, both the internal code and the external pass 2 prompt will require some new database storage to hold the pass data. I also didn't call it out but we should consider adding a dropdown selector for the specific .typ to be targeted here and we might need a download button/function so that that specific .typ can be used in the external prompt. There is a lot here so ask questions!
  -row 6: three new buttons here. The IMPORT button will open a popup that allows for pasting in of the external AI review information. This should work in a similar fashion to importing external eval feedback with the popup and save. The ADD FEEDBACK allows the user to add some of their own feedback in for the final prompt generation. This will be another input popup and some text to explain what type of user feedback and how it should be structured should be added here. The final button REVIEW FEEDBACK should be disabled until there is stored feedback from Pass 2 in the database. When there is, it is enabled and should show a read-only popup with the feedback information. Note that Pass 2 feedback will not be versioned - running Pass 2 feedback a second time will overwrite any previous feedback so we don't need to have versioned or child tables here, simple columns added to store this information for each job/application should be all that is needed here
  -row 7: Finally this is fairly straightforward, a button to generate a Pass 3 prompt. This will incorporate Pass 2 feedback and the button action will be to show a copyable popup with the compiled prompt

# Subpage: Evaluations - lets go through the actions, buttons, and elements described here
-this will copy the existing JOB DETAILS -> Evaluations tab with a few changes
-first the "Re-Run Internal Eval", "Import External Eval", and "Generate External Eval" buttons should be removed
-all other labels, data and rows should be preserved in moving this subpage to this new location

# Subpage: Resume - lets go through the actions, buttons, and elements described here
-this will copy the existing RESUME / COVER tab with a few changes
-first the GENERATE label and "Generate External Resume Prompt" and "Generate External Cover Letter Prompt" buttons should be removed
-next the NEW FROM TEMPLATE label and the "Simple Resume (resume)" and Simple Cover Letter (cover)" buttons should be removed
-The UPLOAD label and BROWSE button and "No file found"/filename text and Upload button will show here. The dropdown with Resume/Cover Letter can be removed as we are splitting out the Resume and Cover Letter into two separate pages
-The rows of files will be copied over, but will only show resume files, no cover letter files. Also the "resume" label does not need to be shown anymore

# Subpage: Cover - lets go through the actions, buttons, and elements described here
-this will copy the existing RESUME / COVER tab with a few changes
-first the GENERATE label and "Generate External Resume Prompt" and "Generate External Cover Letter Prompt" buttons should be removed
-next the NEW FROM TEMPLATE label and the "Simple Resume (resume)" and Simple Cover Letter (cover)" buttons should be removed
-The UPLOAD label and BROWSE button and "No file found"/filename text and Upload button will show here. The dropdown with Resume/Cover Letter can be removed as we are splitting out the Resume and Cover Letter into two separate pages
-The rows of files will be copied over, but will only show cover letter files, no cover letter files. Also the "cover" label does not need to be shown anymore


