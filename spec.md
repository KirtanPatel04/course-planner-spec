# Description

The Course Planner is a web application that helps UNO students, especially incoming graduate students, build a plan of study and a term schedule without needing an advisor to do the checking for them. Students search the course catalog, build draft schedules on a weekly calendar, and see conflicts, missing prerequisites, credit-limit problems, and registration holds flagged immediately. The application generates a term-by-term plan of study from the student's degree requirements and keeps it current as courses are completed. When a student submits a schedule, the application classifies it as routine or needs review so the academic advisor only spends time on cases that need human judgment. Approved schedules are sent to the University Registration System (MavLINK) for enrollment, and the application keeps re-checking schedules as registration data changes. The University Registration System remains the system of record; the Course Planner reads from it and sends approved selections to it, but never edits course, seat, or hold data directly. Authentication is handled by the university's existing single sign-on and is out of scope for this spec.

# Goals

1. **BG-1: Students register for the right courses each term.** Schedules are checked automatically so routine mistakes are caught before submission. (Goal model: G1, G4)
2. **BG-2: Students graduate on time.** Every student has a realistic, up-to-date plan of study and can see what is left to complete. (Goal model: G2, G5)
3. **BG-3: Advisors spend their time mentoring instead of on data entry.** Only schedules that need judgment reach the advisor, and decisions take a single step. (Goal model: G3, G6, S2)
4. **BG-4: Students need fewer advisor meetings for routine approvals.** Submission, approval, and feedback happen inside the application. (Goal model: S1)
5. **BG-5: Enrollment and planning data stay accurate.** The application stays in sync with the University Registration System, and approved schedules are enrolled without manual re-entry. (Goal model: G7, G8, S3)

# Domain Model

## Actors

- **Student**: An undergraduate or graduate student at UNO. Searches courses, builds draft schedules, edits their plan of study, requests exceptions, and submits schedules for review. A student can only see and act on their own data.
- **Incoming Graduate Student**: A Student in their first term of a graduate program who has no plan of study yet. Treated as a Student in every requirement unless a requirement names this actor specifically.
- **Academic Advisor**: A faculty or staff advisor assigned to a set of students. Reviews submitted schedules, approves or returns them, and mentors students. An advisor can only see and act on data for students assigned to them.
- **Course Planner Application ("the system")**: The product being specified. Validates schedules, generates plans of study, classifies submissions, sends notifications, and syncs with the University Registration System.
- **University Registration System (MavLINK)**: The external system of record. Provides course sections, seat availability, prerequisites, registration holds, completed courses, and advisor assignments. Processes enrollment for approved schedules. The Course Planner never writes to it except to submit approved enrollments.

## Objects

- **Program**: A degree program (for example, MS in Computer Science). Has a set of Degree Requirements and a maximum credit-hour load per term for its students. Sourced from the university catalog; read-only in the system.
- **Degree Requirement**: One requirement category in a Program (for example, "Core", "Electives", "Thesis or Project"), with the courses that satisfy it and the credit hours needed. Read-only.
- **Course**: A catalog course identified by subject and number (for example, CSCI 8000). Has credit hours, prerequisites, co-requisites, and an offering pattern (the terms it is normally offered, such as Fall only).
- **Term**: An academic term (for example, Fall 2027). Has a registration window with a start and end date.
- **Course Section**: A specific offering of a Course in a Term. Has a section ID, meeting days and times, seat capacity, seats available, and a status of Open, Full, or Cancelled.
- **Registration Hold**: A hold on a student's account reported by the University Registration System. A hold either blocks registration or does not; only blocking holds affect validation.
- **Course History**: The student's completed courses and courses currently in progress, from the University Registration System. A prerequisite counts as satisfied if the course is completed, or is in progress in a term that ends before the target term begins.
- **Draft Schedule**: A set of Course Sections a student has selected for one Term. A student can have several Draft Schedules for a Term but only one in Submitted, Approved, or later status for that Term at a time. Statuses:
  - **Draft**: editable by the student.
  - **Submitted**: sent to the advisor; locked from editing.
  - **Approved**: accepted by the advisor; waiting for enrollment.
  - **Returned**: sent back by the advisor or the system with a comment; editable again (behaves like Draft).
  - **Enrolled**: every section was enrolled successfully.
  - **Partially Enrolled**: at least one section enrolled and at least one failed.
  - Allowed transitions: Draft to Submitted (student submits), Submitted to Draft (student withdraws), Submitted to Approved or Returned (advisor decides), Approved to Returned (system revalidation fails before enrollment), Approved to Enrolled or Partially Enrolled (enrollment result), Returned to Submitted (student resubmits).
- **Validation Result**: The outcome of checking one Course Section in a Draft Schedule. Either Pass or Flag. A Flag has one or more reason codes: TIME_CONFLICT, MISSING_PREREQUISITE, MISSING_COREQUISITE, CREDIT_LIMIT_EXCEEDED, BLOCKING_HOLD, SECTION_FULL, SECTION_CANCELLED. Each result records the time of the registration data it was based on.
- **Exception Request**: A student's request to submit a schedule despite a specific Flag (for example, a prerequisite override). Contains the flagged section, the reason code being overridden, and a written justification from the student.
- **Plan of Study**: A term-by-term list of planned Courses that together satisfy the student's Degree Requirements. Generated by the system and editable by the student.
- **Degree Progress**: For each Degree Requirement, whether it is Complete, In Progress, or Remaining, based on Course History.
- **Submission Classification**: Assigned by the system to every Submitted schedule. Either **Routine** (every section passes validation, there are no Exception Requests, and every course appears in the student's Plan of Study for that Term) or **Needs Review** (anything else).
- **Advisor Decision**: An advisor's Approve or Return on a Submitted schedule, with a timestamp. A Return always includes a comment.
- **Enrollment Record**: The result of sending one approved Course Section to the University Registration System: Enrolled, or Failed with the reason returned by that system.
- **Notification**: An in-app message (and email to the user's university address) sent to a Student or Advisor about a specific schedule event: submitted, approved, returned, enrollment result, or revalidation failure.

# Functional Requirements

User stories describe what a student or advisor does. "The system shall" statements describe behavior that happens behind the scenes. Each requirement lists the business goal(s) it supports.

## Course search and schedule building

- **FR-001**: As a student, I want to search the course catalog by requirement category, term, and meeting time, so that I can register for the right courses each term. *(BG-1)*
- **FR-002**: As a student, I want to add course sections to a weekly calendar view to build a draft schedule, so that I can register for the right courses each term. *(BG-1)*
- **FR-003**: As a student, I want time conflicts and missing prerequisites flagged as soon as I add a section, so that my schedule is validated before anyone else has to look at it. *(BG-1)*

## Plan of study and degree progress

- **FR-004**: As an incoming graduate student, I want to start from a suggested plan of study and move courses between terms, so that I have a realistic path to graduate on time. *(BG-2)*
- **FR-005**: As a student, I want to see which degree requirements I have finished and which are still left, so that I can stay on track to graduate on time. *(BG-2)*

## Submission and advisor review

- **FR-006**: As a student, I want to submit my draft schedule to my advisor and get notified when it is approved or returned, so that I do not need a meeting just to get a routine schedule signed off. *(BG-4)*
- **FR-007**: As an academic advisor, I want a dashboard of submitted schedules with the ones that need my attention listed first, so that only the cases that need my judgment take up my time. *(BG-3)*
- **FR-008**: As an academic advisor, I want to approve a schedule, or return it with a comment, in a single step, so that I spend less time on manual data entry. *(BG-3, BG-4)*
- **FR-009**: As an academic advisor, I want to view a student's plan of study and course history next to their proposed schedule, so that I can focus on mentoring, like course sequencing and career-relevant electives, instead of looking up records. Courses in the proposed schedule that are not in the plan for that term should be highlighted. *(BG-3)*
- **FR-016**: As a student, I want to request an exception for a flagged section and explain why, so that I can still submit a schedule when I have a legitimate reason, such as a prerequisite I completed elsewhere. *(BG-1, BG-4)*
- **FR-017**: As a student, I want to withdraw a submitted schedule before my advisor decides on it, so that I can fix a mistake without waiting for it to be returned. *(BG-1)*

## Validation, planning, and sync logic

- **FR-010**: The system shall retrieve course sections, seat availability, prerequisites, registration holds, and course history from the University Registration System whenever a student opens or edits a schedule, and at least once every hour during a Term's registration window. *(BG-5)*
- **FR-011**: The system shall validate every draft schedule against prerequisites, co-requisites, time conflicts, the Program's credit-hour limit, blocking holds, and section status, and return a Pass or Flag result with reason codes for each section. *(BG-1)*
- **FR-012**: The system shall generate a term-by-term plan of study by mapping a Program's degree requirements onto future terms, using course offering patterns and prerequisite ordering, and shall regenerate the not-yet-started terms of the plan when the student's course history changes. Courses the student placed manually are kept unless they become invalid. *(BG-2)*
- **FR-013**: The system shall classify each submitted schedule as Routine or Needs Review, using the definitions in Submission Classification. *(BG-3)*
- **FR-014**: After a schedule is approved, the system shall send its sections to the University Registration System for enrollment, record an Enrollment Record for each section, update the student's plan of study to match, and notify the student of the result. If any section fails, the system shall also notify the advisor. *(BG-5)*
- **FR-015**: The system shall re-check every Submitted, Approved, and Enrolled schedule for the current and next Term whenever registration data changes (for example, a section is cancelled or fills up). An Approved schedule that no longer passes validation is moved to Returned with a system comment. For any schedule that no longer passes, the system shall notify both the student and the advisor. *(BG-1, BG-5)*
- **FR-018**: If the University Registration System cannot be reached, the system shall show the time of the last successful sync, mark validation results as Unverified, block new submissions until a successful sync, and queue enrollments for retry every 15 minutes for up to 24 hours before notifying the student and advisor that enrollment did not go through. *(BG-5)*
- **FR-019**: The system shall only let a student view and change their own schedules and plan of study, and only let an advisor view and decide on schedules of students assigned to them in the University Registration System. *(BG-5)*
- **FR-020**: The system shall send an approved schedule for enrollment at most once. Repeated approval requests for the same schedule shall be ignored. *(BG-5)*

# Acceptance Criteria

### AC-001 (FR-001): Search with combined filters
```gherkin
Scenario: Student filters catalog by requirement, term, and time
  Given I am a student in the MS Computer Science program
  And the Fall 2027 catalog has sections that satisfy the "Core" requirement
  When I search with requirement category "Core", term "Fall 2027", and meeting time "after 5:00 PM"
  Then I see only Fall 2027 sections of Core courses that start at or after 5:00 PM
  And each result shows the course, section ID, meeting days and times, and seats available
```

### AC-002 (FR-001): Search with no results
```gherkin
Scenario: No sections match the filters
  Given no Fall 2027 Core sections meet on Saturday
  When I search with requirement category "Core", term "Fall 2027", and meeting day "Saturday"
  Then I see a message that no sections match
  And my draft schedule is unchanged
```

### AC-003 (FR-002): Add a section to the calendar
```gherkin
Scenario: Student adds a section to a draft schedule
  Given I have a Draft schedule for Fall 2027
  When I add section CSCI 8000-001, which meets Monday and Wednesday 6:00 to 7:15 PM
  Then the section appears on my weekly calendar on Monday and Wednesday from 6:00 to 7:15 PM
  And my total credit hours for the schedule increase by the course's credit hours
```

### AC-004 (FR-003, FR-011): Time conflict flagged on add
```gherkin
Scenario: New section overlaps an existing one
  Given my Draft schedule contains a section meeting Tuesday 5:30 to 6:45 PM
  When I add a section meeting Tuesday 6:00 to 8:40 PM
  Then both sections are flagged with TIME_CONFLICT
  And the flag appears without me leaving or refreshing the page
```

### AC-005 (FR-003, FR-011): Missing prerequisite flagged on add
```gherkin
Scenario: Prerequisite not completed or in progress
  Given CSCI 8500 requires CSCI 8000
  And CSCI 8000 is not in my course history
  When I add a section of CSCI 8500 to my Spring 2028 Draft schedule
  Then the section is flagged with MISSING_PREREQUISITE and the reason names CSCI 8000
```

### AC-006 (FR-011): In-progress prerequisite counts
```gherkin
Scenario: Prerequisite is in progress in an earlier term
  Given CSCI 8500 requires CSCI 8000
  And I am enrolled in CSCI 8000 in Fall 2027
  When I add a section of CSCI 8500 to my Spring 2028 Draft schedule
  Then the section is not flagged with MISSING_PREREQUISITE
```

### AC-007 (FR-011): Credit-hour limit exceeded
```gherkin
Scenario: Schedule goes over the program's credit-hour limit
  Given my Program's credit-hour limit is 12 per term
  And my Draft schedule has 12 credit hours
  When I add a 3-credit section
  Then the new section is flagged with CREDIT_LIMIT_EXCEEDED
```

### AC-008 (FR-011): Blocking hold
```gherkin
Scenario: Student has a hold that blocks registration
  Given the University Registration System reports a blocking hold on my account
  When I open my Draft schedule
  Then every section is flagged with BLOCKING_HOLD
  And I see the hold type reported by the registration system
```

### AC-009 (FR-011): Clean schedule passes
```gherkin
Scenario: All sections pass validation
  Given my Draft schedule has no time conflicts, satisfied prerequisites and co-requisites, no blocking holds, open sections, and credit hours within my limit
  When the system validates the schedule
  Then every section shows Pass
```

### AC-010 (FR-004, FR-012): Suggested plan for an incoming graduate student
```gherkin
Scenario: First-term graduate student gets a generated plan
  Given I am an incoming graduate student with no plan of study
  When I open the plan of study page
  Then I see a term-by-term plan that covers every remaining degree requirement
  And no course is placed in a term outside its offering pattern
  And no course is placed in a term before its prerequisites
```

### AC-011 (FR-004): Moving a course breaks prerequisite order
```gherkin
Scenario: Student moves a course ahead of its prerequisite
  Given my plan places CSCI 8000 in Fall 2027 and CSCI 8500 in Spring 2028
  When I move CSCI 8500 to Fall 2027
  Then CSCI 8500 is flagged with MISSING_PREREQUISITE in the plan
  And the move is saved so I can fix it myself
```

### AC-012 (FR-005): Degree progress view
```gherkin
Scenario: Student views degree progress
  Given I have completed all Core courses and one of four Electives
  And I am enrolled in one Elective this term
  When I open degree progress
  Then "Core" shows Complete
  And "Electives" shows In Progress with 1 of 4 complete and 1 in progress
```

### AC-013 (FR-006): Submit and get notified of approval
```gherkin
Scenario: Student submits and the advisor approves
  Given I have a Draft schedule for Fall 2027 with current validation results
  When I submit it
  Then its status becomes Submitted and it is locked from editing
  And my assigned advisor receives a Notification
  When my advisor approves it
  Then I receive a Notification that it was approved
```

### AC-014 (FR-006): Only one active submission per term
```gherkin
Scenario: Student tries to submit a second schedule for the same term
  Given I already have a Submitted schedule for Fall 2027
  When I try to submit a different Draft schedule for Fall 2027
  Then the submission is rejected with a message to withdraw the first one
```

### AC-015 (FR-007, FR-013): Dashboard ordering
```gherkin
Scenario: Needs Review schedules appear first
  Given I am an advisor with three Submitted schedules
  And one is Needs Review submitted Monday, one is Routine submitted Sunday, and one is Needs Review submitted Tuesday
  When I open my dashboard
  Then I see the Monday Needs Review schedule first, the Tuesday Needs Review schedule second, and the Routine schedule last
  And each Needs Review entry shows the reasons it needs review
```

### AC-016 (FR-008): Approve in one step
```gherkin
Scenario: Advisor approves a schedule
  Given I am viewing a Submitted schedule for one of my students
  When I select Approve
  Then the schedule status becomes Approved without any further form or data entry
```

### AC-017 (FR-008): Return requires a comment
```gherkin
Scenario: Advisor returns a schedule without a comment
  Given I am viewing a Submitted schedule for one of my students
  When I select Return without entering a comment
  Then the return is not saved and I am asked for a comment
  When I enter a comment and select Return
  Then the schedule status becomes Returned and the student receives the comment in a Notification
```

### AC-018 (FR-009): Side-by-side review
```gherkin
Scenario: Advisor sees context next to the schedule
  Given I open a Submitted schedule for one of my students
  Then I see the proposed schedule, the student's plan of study for that term, and the student's course history on the same screen
  And any course in the schedule that is not in the plan for that term is highlighted
```

### AC-019 (FR-010): Data refreshed when opening a schedule
```gherkin
Scenario: Seat count changes before the student opens a schedule
  Given section CSCI 8000-001 had 5 seats available at the last sync
  And it now has 0 seats in the University Registration System
  When I open my Draft schedule containing that section
  Then the section is flagged with SECTION_FULL
```

### AC-020 (FR-010): Hourly refresh during registration
```gherkin
Scenario: Background sync during the registration window
  Given today is inside the Fall 2027 registration window
  When one hour passes since the last successful sync
  Then the system retrieves updated registration data from the University Registration System
```

### AC-021 (FR-012): Plan regenerates after course history changes
```gherkin
Scenario: Student completes a course outside the plan
  Given my plan lists CSCI 8100 in Spring 2028
  When my course history shows I completed CSCI 8100 in Fall 2027
  Then CSCI 8100 is removed from Spring 2028
  And the remaining future terms are regenerated
  And courses I placed manually stay where I put them unless they are now invalid
```

### AC-022 (FR-013): Routine classification
```gherkin
Scenario: Schedule meets every Routine condition
  Given a submitted schedule where every section passes validation
  And there are no Exception Requests
  And every course is in the student's plan of study for that term
  Then the schedule is classified Routine
```

### AC-023 (FR-013): Needs Review classification
```gherkin
Scenario Outline: Any single condition makes a schedule Needs Review
  Given a submitted schedule that <condition>
  Then the schedule is classified Needs Review

  Examples:
    | condition                                                 |
    | has a section with any Flag                               |
    | includes an Exception Request                             |
    | includes a course not in the plan of study for that term  |
```

### AC-024 (FR-014): Successful enrollment
```gherkin
Scenario: All sections enroll
  Given my Fall 2027 schedule was just approved
  When the University Registration System enrolls every section
  Then an Enrolled Enrollment Record is saved for each section
  And the schedule status becomes Enrolled
  And my plan of study for Fall 2027 matches the enrolled courses
  And I receive a Notification with the result
```

### AC-025 (FR-014): Partial enrollment failure
```gherkin
Scenario: One section fails to enroll
  Given my Fall 2027 schedule with three sections was just approved
  When the University Registration System enrolls two sections and rejects one as full
  Then the rejected section gets a Failed Enrollment Record with the reason "full"
  And the schedule status becomes Partially Enrolled
  And both my advisor and I receive a Notification naming the failed section
```

### AC-026 (FR-015): Approved schedule breaks before enrollment
```gherkin
Scenario: Section cancelled after approval but before enrollment
  Given my schedule is Approved and not yet sent for enrollment
  When the University Registration System marks one of its sections Cancelled
  Then the section is flagged with SECTION_CANCELLED
  And the schedule status becomes Returned with a system comment naming the section
  And both my advisor and I receive a Notification
```

### AC-027 (FR-015): Enrolled schedule changes
```gherkin
Scenario: Section cancelled after enrollment
  Given my schedule is Enrolled
  When the University Registration System marks one of its sections Cancelled
  Then the schedule status stays Enrolled
  And both my advisor and I receive a Notification naming the cancelled section
```

### AC-028 (FR-016): Exception request needs a justification
```gherkin
Scenario: Student requests a prerequisite override
  Given a section in my Draft schedule is flagged with MISSING_PREREQUISITE
  When I request an exception without a justification
  Then the request is not saved and I am asked for a justification
  When I request an exception with the justification "Completed equivalent course at Creighton"
  Then the Exception Request is attached to that section
  And the schedule is classified Needs Review when I submit it
```

### AC-029 (FR-017): Withdraw before a decision
```gherkin
Scenario: Student withdraws a submitted schedule
  Given my Fall 2027 schedule is Submitted and my advisor has not decided
  When I withdraw it
  Then its status becomes Draft and I can edit it
  And it no longer appears on my advisor's dashboard
```

### AC-030 (FR-017): Cannot withdraw after a decision
```gherkin
Scenario: Student tries to withdraw an approved schedule
  Given my Fall 2027 schedule is Approved
  When I try to withdraw it
  Then the request is rejected
  And the schedule status stays Approved
```

### AC-031 (FR-018): Registration system unavailable
```gherkin
Scenario: MavLINK cannot be reached
  Given the University Registration System has not responded since 2:00 PM
  When I open my Draft schedule at 2:30 PM
  Then I see "Last synced at 2:00 PM"
  And every validation result is marked Unverified
  And the Submit button is disabled until a successful sync
```

### AC-032 (FR-018): Enrollment queued during an outage
```gherkin
Scenario: Approval happens while MavLINK is down
  Given the University Registration System cannot be reached
  When my advisor approves my schedule
  Then the enrollment is queued and retried every 15 minutes
  And if it still has not gone through after 24 hours, my advisor and I receive a Notification
```

### AC-033 (FR-019): Student cannot access another student's data
```gherkin
Scenario: Student requests someone else's schedule
  Given I am signed in as student A
  When I request a schedule that belongs to student B
  Then the request is denied
  And no information about student B's schedule is shown
```

### AC-034 (FR-019): Advisor limited to assigned students
```gherkin
Scenario Outline: Unauthorized approval attempts are denied
  Given a Submitted schedule for student S
  When <user> tries to approve it
  Then the approval is denied and the schedule stays Submitted

  Examples:
    | user                                  |
    | an advisor not assigned to student S  |
    | student S                             |
```

### AC-035 (FR-020): Duplicate approval does not double-enroll
```gherkin
Scenario: Approve is sent twice
  Given a Submitted schedule for one of my students
  When two approval requests for that schedule arrive within one second
  Then the schedule is sent to the University Registration System for enrollment exactly once
```
