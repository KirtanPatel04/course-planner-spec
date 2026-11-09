# Test Plan: UNO Course Registration and Planning Application

This plan refines the BDD acceptance criteria in [`spec.md`](spec.md) into concrete tests (the "BDD alternative" of the assignment). It was written from `spec.md` and `architecture.md` only. Request and response shapes come from [`contracts.md`](contracts.md).

**How to read it**

- Each test has a unique ID. `AT-005-1` is the first test for AC-005. Extra tests found by the gap checklist are `X-01`, `X-02`, and so on. Each extra test names the requirement it probes.
- Every test is tagged with its role: **[main]** is the scenario from the spec with real values; **[inside]** and **[outside]** sit just inside and just outside a limit; **[control]** is a valid request of the same shape as a rejection, so the rejection can only be caused by the rule under test.
- Every rejected request is wrong in exactly one way. Every rejection ends with a **Nothing created** check.
- Expected values were worked out by hand from the spec and the test data below. Where the spec leaves a value open, the test is marked **blocked by spec gap** and is listed under [Spec gaps](#spec-gaps) instead of being guessed.
- All tests run against the simulated Registration Gateway (NFR-010) with an injected clock. Times are UTC; Chicago time (CDT, UTC−5) is in brackets.

## Test data (the "world")

Every test starts from this data, seeded into the simulated MavLINK. Each test then runs one full sync (`RegistrationSync.syncAll`) at its start time, unless it says otherwise. Tests change only what their Given steps say.

**Default start time T0:** 2027-07-15T14:00Z [9:00 AM CDT], inside the Fall 2027 registration window.

### Terms

| Code | Name | Season | Starts | Ends | Registration window |
|---|---|---|---|---|---|
| FA27 | Fall 2027 | FALL | 2027-08-23 | 2027-12-17 | 2027-04-01 to 2027-08-20 |
| SP28 | Spring 2028 | SPRING | 2028-01-18 | 2028-05-12 | 2027-11-01 to 2028-01-14 |
| FA28 | Fall 2028 | FALL | 2028-08-21 | 2028-12-15 | 2028-04-01 to 2028-08-18 |
| SP29 | Spring 2029 | SPRING | 2029-01-16 | 2029-05-11 | 2028-11-01 to 2029-01-12 |

### Program and degree requirements

Program **MSCS** (MS in Computer Science), credit-hour limit **12 per term**.

| Requirement | Name | Courses that satisfy it | Credit hours needed |
|---|---|---|---|
| CORE | Core | CSCI 8000, CSCI 8100, CSCI 8500 | 9 (all three) |
| ELEC | Electives | CSCI 8200, 8300, 8400, 8600, 8700, 8800 | 12 (any four) |
| PROJ | Thesis or Project | CSCI 8990 | 3 |

### Courses

| Course | Credits | Prerequisites | Co-requisites | Offered |
|---|---|---|---|---|
| CSCI 8000 | 3 | — | — | Fall |
| CSCI 8100 | 3 | — | — | Fall, Spring |
| CSCI 8500 | 3 | CSCI 8000 | — | Spring |
| CSCI 8200 | 3 | — | — | Fall, Spring |
| CSCI 8300 | 3 | — | — | Fall |
| CSCI 8400 | 3 | — | — | Fall, Spring |
| CSCI 8410 (lab) | 1 | — | CSCI 8400 | Fall, Spring |
| CSCI 8600 | 3 | — | — | Fall, Spring |
| CSCI 8700 | 3 | — | — | Fall |
| CSCI 8800 | 3 | — | — | Fall, Spring |
| CSCI 8990 | 3 | CSCI 8500 | — | Spring |

### Sections

| Section | Term | Days | Time | Seats (cap / available) | Status |
|---|---|---|---|---|---|
| CSCI8000-001 | FA27 | Mon, Wed | 18:00–19:15 | 30 / 5 | OPEN |
| CSCI8000-002 | FA27 | Tue, Thu | 17:00–18:15 | 30 / 12 | OPEN |
| CSCI8100-001 | FA27 | Tue, Thu | 17:30–18:45 | 30 / 10 | OPEN |
| CSCI8100-002 | FA27 | Fri | 16:59–19:39 | 30 / 10 | OPEN |
| CSCI8200-001 | FA27 | Tue | 18:00–20:40 | 30 / 8 | OPEN |
| CSCI8300-001 | FA27 | Tue | 18:44–21:24 | 30 / 8 | OPEN |
| CSCI8300-002 | FA27 | Tue | 18:46–21:26 | 30 / 8 | OPEN |
| CSCI8400-001 | FA27 | Thu | 19:00–21:40 | 30 / 8 | OPEN |
| CSCI8410-001 | FA27 | Fri | 13:00–14:50 | 20 / 6 | OPEN |
| CSCI8600-001 | FA27 | Wed | 13:00–15:40 | 25 / 0 | FULL |
| CSCI8700-001 | FA27 | Mon | 13:00–15:40 | 25 / 20 | CANCELLED |
| CSCI8800-001 | FA27 | Sat | 09:00–11:40 | 25 / 15 | OPEN |
| CSCI8500-001 | SP28 | Mon, Wed | 18:00–19:15 | 30 / 10 | OPEN |
| CSCI8100-101 | SP28 | Tue, Thu | 17:30–18:45 | 30 / 10 | OPEN |

### People

| ID | Role | Program | Advisor | Course history | Holds |
|---|---|---|---|---|---|
| stu-a | Student (incoming graduate) | MSCS | adv-1 | none | none |
| stu-b | Student | MSCS | adv-1 | none | none |
| stu-c | Student | MSCS | adv-2 | none | none |
| stu-d | Student | MSCS | adv-1 | none | none |
| adv-1 | Academic Advisor | — | — | — | — |
| adv-2 | Academic Advisor | — | — | — | — |

### Shorthand used below

- "Draft X = {…}" means: `POST /schedules {term}` then `POST /schedules/{id}/sections` for each section, as the owning student. Each step must answer 201 or 200.
- "Pin plan: course → term" means `PUT /plan/courses/{course} {term}` as the student (after `GET /plan` has generated the plan). It sets which courses the plan holds for a term, so classification tests do not depend on how the plan generator chooses.
- "Submitted X" means Draft X then `POST /schedules/{id}/submit`, answered 200.
- "Run jobs at t" means: set the clock to t, then call `JobRunner.runDueJobs()`.
- "Notifications(u)" is `GET /notifications` as user u.

---

## FR-001: Course search

### AC-001: Search with combined filters

**AT-001-1 [main] [inside] [outside]**
```gherkin
Given I am stu-a
When I GET /sections?term=FA27&requirement=CORE&startsAtOrAfter=17:00
Then the status is 200
And the result section IDs are exactly CSCI8000-001, CSCI8000-002, CSCI8100-001
And CSCI8000-002, which starts at 17:00, is included            # inside: starts exactly at the limit
And CSCI8100-002, which starts at 16:59, is not included         # outside: one minute before the limit
And CSCI8200-001 is not included (not a Core course)
And CSCI8500-001 is not included (Spring 2028)
And the CSCI8000-001 result has courseId "CSCI 8000", meetings Mon/Wed 18:00–19:15, seatsAvailable 5
```
"After 5:00 PM" is read as "starts at or after 5:00 PM", as the AC's Then step says.

### AC-002: Search with no results

**AT-002-1 [main]**
```gherkin
Given I am stu-a with Draft A = {CSCI8000-001} for FA27
When I GET /sections?term=FA27&requirement=CORE&day=SAT
Then the status is 200 and the result is an empty list
And GET /schedules/{A} still lists exactly CSCI8000-001 with 3 credit hours     # draft unchanged
```

**AT-002-2 [control]** Same search shape with `requirement=ELEC&day=SAT` returns 200 with exactly CSCI8800-001. So the empty result in AT-002-1 comes from the Core filter, not from the Saturday filter alone.

---

## FR-002: Build a draft schedule

### AC-003: Add a section to the calendar

**AT-003-1 [main]**
```gherkin
Given I am stu-a with an empty Draft for FA27 (totalCreditHours 0)
When I POST /schedules/{id}/sections {"sectionId": "CSCI8000-001"}
Then the status is 200
And sectionIds is ["CSCI8000-001"]
And totalCreditHours is 3                       # 0 + 3
```
The meeting days and times shown on the calendar come from the section (Mon/Wed 18:00–19:15). The calendar drawing itself is a Web Client check (NFR-008), outside this API test.

**AT-003-2 [main]** From Draft = {CSCI8100-001} (3 credits), adding CSCI8000-001 gives 200 and totalCreditHours **6**.

---

## FR-003, FR-011: Validation

### AC-004: Time conflict flagged on add

**AT-004-1 [main]**
```gherkin
Given I am stu-a with Draft = {CSCI8100-001}       # Tue 17:30–18:45
When I add CSCI8200-001                            # Tue 18:00–20:40
Then the status is 200
And the response has a validation result for both sections
And CSCI8100-001 is flagged TIME_CONFLICT naming CSCI8200-001
And CSCI8200-001 is flagged TIME_CONFLICT naming CSCI8100-001
```
"Without refreshing the page" is met because the add response itself carries the results (D7). The 1-second target is NFR-006 and is a load test, not part of this suite.

**AT-004-2 [inside]** Draft = {CSCI8100-001}, add CSCI8300-001 (Tue 18:44–21:24, one minute of overlap) → both sections flagged TIME_CONFLICT.

**AT-004-3 [outside] [control]** Draft = {CSCI8100-001}, add CSCI8300-002 (Tue 18:46–21:26, one minute apart) → 200, neither section has TIME_CONFLICT.

*Not tested:* a section starting at exactly 18:45. See Spec gap G-1.

### AC-005: Missing prerequisite flagged on add

**AT-005-1 [main]**
```gherkin
Given the time is 2027-11-15T15:00Z (inside the SP28 registration window)
And I am stu-a with no course history
And I have an empty Draft for SP28
When I add CSCI8500-001
Then CSCI8500-001 is flagged MISSING_PREREQUISITE
And the flag's relatedCourseIds is ["CSCI 8000"]
```

### AC-006: In-progress prerequisite counts

**AT-006-1 [main] [inside]** As AT-005-1, but stu-a's history has CSCI 8000 IN_PROGRESS in FA27 (ends 2027-12-17, before SP28 starts 2028-01-18). CSCI8500-001 has **no** MISSING_PREREQUISITE flag.

**AT-006-2 [outside]** As AT-005-1, but CSCI 8000 is IN_PROGRESS in SP28 (ends 2028-05-12, after SP28 starts). CSCI8500-001 **is** flagged MISSING_PREREQUISITE.

**AT-006-3 [control]** As AT-005-1, but CSCI 8000 is COMPLETED in FA27 → no MISSING_PREREQUISITE.

### AC-007: Credit-hour limit exceeded

**AT-007-1 [main]**
```gherkin
Given my Program's limit is 12 per term
And I am stu-a with Draft = {CSCI8000-001, CSCI8100-001, CSCI8400-001, CSCI8800-001}   # 3+3+3+3 = 12
When I add CSCI8300-002 (3 credits)                                                    # 15
Then CSCI8300-002 is flagged CREDIT_LIMIT_EXCEEDED
And totalCreditHours is 15
```
The draft sections do not conflict with one another or with CSCI8300-002, so CREDIT_LIMIT_EXCEEDED is the only rule in play.

**AT-007-2 [inside] [control]** Draft = {CSCI8000-001, CSCI8100-001, CSCI8800-001} (9), add CSCI8300-002 → total **12**, every section PASS.

**AT-007-3 [outside]** The AT-007-1 draft (12), add CSCI8410-001 (1 credit; its co-requisite CSCI 8400 is in the draft) → total **13**, CSCI8410-001 flagged CREDIT_LIMIT_EXCEEDED.

### AC-008: Blocking hold

**AT-008-1 [main]**
```gherkin
Given MavLINK reports a hold on stu-a: type "Bursar", blocking
And I am stu-a with Draft = {CSCI8000-001, CSCI8100-001}
When I GET /schedules/{id}
Then CSCI8000-001 and CSCI8100-001 are both flagged BLOCKING_HOLD
And each BLOCKING_HOLD flag has holdType "Bursar"
```

**AT-008-2 [control]** Same, but the hold is type "Advising Reminder", **not** blocking → neither section has BLOCKING_HOLD; both PASS.

### AC-009: Clean schedule passes

**AT-009-1 [main]** stu-a, Draft = {CSCI8000-001, CSCI8100-001, CSCI8800-001} (9 credits; no conflicts; no prerequisites; open; no holds). GET /schedules/{id} → every result has outcome PASS, no flags, verified true.

---

## FR-004, FR-012: Plan of study

### AC-010: Suggested plan for an incoming graduate student

**AT-010-1 [main]**
```gherkin
Given I am stu-a, an incoming graduate student with no plan and no course history
When I GET /plan
Then the status is 200
And the planned courses include CSCI 8000, CSCI 8100, CSCI 8500, CSCI 8990
And they include exactly four different Electives from {8200, 8300, 8400, 8600, 8700, 8800}
And every course is planned in a term whose season is in its offering pattern
And CSCI 8000 is in an earlier term than CSCI 8500, and CSCI 8500 in an earlier term than CSCI 8990
And no term has more than 12 credit hours
And no course is planned before FA27
And CSCI 8990 is planned in SP29 or later           # hand-computed: 8000 Fall → 8500 next Spring → 8990 the Spring after
```

### AC-011: Moving a course breaks prerequisite order

**AT-011-1 [main]**
```gherkin
Given I am stu-a and my plan is pinned: CSCI 8000 → FA27, CSCI 8500 → SP28
When I PUT /plan/courses/CSCI%208500 {"term": "FA27"}
Then the status is 200
And FA27 contains CSCI 8500 with placement MANUAL
And CSCI 8500 is flagged MISSING_PREREQUISITE naming CSCI 8000
And GET /plan still shows CSCI 8500 in FA27          # the move is saved
```

**AT-011-2 [control]** Same start, move CSCI 8500 to SP29 (after CSCI 8000) → 200, CSCI 8500 in SP29 with no MISSING_PREREQUISITE flag.

### AC-021: Plan regenerates after course history changes

**AT-021-1 [main]**
```gherkin
Given the time is 2027-12-20T15:00Z (FA27 has ended, SP28 has not started)
And stu-a's history has CSCI 8000 COMPLETED in FA27
And stu-a's plan is pinned: CSCI 8100 → SP28, CSCI 8200 → FA28
When MavLINK adds CSCI 8100 COMPLETED in FA27 to stu-a's history
And RegistrationSync.syncAll() runs
Then GET /plan has CSCI 8100 in no term
And CSCI 8200 is still in FA28 with placement MANUAL     # manual placement kept
And the plan still includes CSCI 8500 and CSCI 8990, and four Electives in total
```

---

## FR-005: Degree progress

### AC-012: Degree progress view

**AT-012-1 [main]**
```gherkin
Given the time is 2028-09-15T15:00Z (FA28 in progress)
And stu-b's history: CSCI 8000, 8100 COMPLETED FA27; CSCI 8500, 8200 COMPLETED SP28; CSCI 8300 IN_PROGRESS FA28
When stu-b GETs /degree-progress
Then CORE is COMPLETE with creditHoursCompleted 9 of 9
And ELEC is IN_PROGRESS with completedCourseIds ["CSCI 8200"], inProgressCourseIds ["CSCI 8300"],
    creditHoursCompleted 3, creditHoursInProgress 3, creditHoursRequired 12     # "1 of 4 complete and 1 in progress"
And PROJ is REMAINING with creditHoursCompleted 0
```

**AT-012-2 [inside]** As AT-012-1, plus CSCI 8400, 8600, 8800 COMPLETED → ELEC has 4 completed (12 of 12) → COMPLETE.

**AT-012-3 [outside]** CORE with CSCI 8000, 8100 COMPLETED and CSCI 8500 IN_PROGRESS (6 of 9) → CORE is IN_PROGRESS, not COMPLETE.

---

## FR-006: Submit and notify

### AC-013: Submit and get notified of approval

**AT-013-1 [main]**
```gherkin
Given I am stu-a with Draft A = {CSCI8000-001, CSCI8100-001} for FA27, synced at T0
When I POST /schedules/{A}/submit
Then the status is 200 and status is SUBMITTED
And Notifications(adv-1) has one SCHEDULE_SUBMITTED for A
And Notifications(adv-2) is empty
When adv-1 POSTs /schedules/{A}/approve
Then the status is 200 and status is APPROVED
And Notifications(stu-a) has one SCHEDULE_APPROVED for A
```

**AT-013-2 [main] locked from editing:** Submitted A, then stu-a adds CSCI8800-001 → **409 INVALID_STATE**. *Nothing created:* A still has exactly CSCI8000-001 and CSCI8100-001.

**AT-013-3 [control]** The same add on a Draft returns 200 with three sections.

### AC-014: Only one active submission per term

**AT-014-1 [main]**
```gherkin
Given stu-a has Submitted A = {CSCI8000-001} and Draft B = {CSCI8100-001}, both FA27
When stu-a POSTs /schedules/{B}/submit
Then the status is 409 with error ACTIVE_SUBMISSION_EXISTS
And the message mentions withdrawing the other schedule
And B is still DRAFT and A is still SUBMITTED                 # nothing created
And Notifications(adv-1) has exactly one SCHEDULE_SUBMITTED (for A)
```

**AT-014-2 [control]** After stu-a withdraws A, submitting B returns 200 SUBMITTED.

**AT-014-3 [control] other term:** With A Submitted for FA27, a Draft C = {CSCI8100-101} for SP28 submits with 200.

**AT-014-4 [main] Approved counts as active:** With A **Approved**, submitting B → 409 ACTIVE_SUBMISSION_EXISTS; B still DRAFT.

---

## FR-007, FR-013: Advisor dashboard and classification

### AC-015: Dashboard ordering

**AT-015-1 [main]**
```gherkin
Given adv-1 is assigned stu-a, stu-b, stu-d
And at 2027-07-11T15:00Z (Sunday) stu-b submits R = {CSCI8000-001, CSCI8100-001},
    with plan pinned CSCI 8000 → FA27, CSCI 8100 → FA27                       # Routine
And at 2027-07-12T15:00Z (Monday) stu-a submits N1 = {CSCI8600-001} with an
    Exception Request on SECTION_FULL, justification "Instructor gave permission"   # Needs Review
And at 2027-07-13T15:00Z (Tuesday) stu-d submits N2 the same way as N1           # Needs Review
When adv-1 GETs /advisor/dashboard
Then the schedule IDs are, in order, N1, N2, R
And N1 and N2 each have classification NEEDS_REVIEW with reasons including EXCEPTION_REQUESTED
And R has classification ROUTINE with no reasons
```

### AC-022: Routine classification

**AT-022-1 [main]** stu-b, plan pinned CSCI 8000 → FA27 and CSCI 8100 → FA27; submit {CSCI8000-001, CSCI8100-001} (both pass, no exceptions, both in plan) → GET /schedules/{id} has classification ROUTINE with no reasons.

### AC-023: Needs Review classification

These call `Classifier.classify` directly, so each input breaks exactly one Routine condition. The base input is stu-b (plan pinned CSCI 8000 → FA27, CSCI 8100 → FA27), term FA27, sections {CSCI8000-001, CSCI8100-001}, both results PASS, no Exception Requests.

| ID | Role | Change from the base input | Expected |
|---|---|---|---|
| AT-023-0 | [control] | none | ROUTINE, no reasons |
| AT-023-1 | [main] | CSCI8100-001 result is FLAG with SECTION_FULL | NEEDS_REVIEW, reasons = [SECTION_FLAGGED] |
| AT-023-2 | [main] | one Exception Request on CSCI8000-001 | NEEDS_REVIEW, reasons = [EXCEPTION_REQUESTED] |
| AT-023-3 | [main] | sections {CSCI8000-001, CSCI8200-001}, both PASS, plan pinned CSCI 8200 → SP28 | NEEDS_REVIEW, reasons = [COURSE_NOT_IN_PLAN for CSCI 8200] |

---

## FR-008: Advisor decisions

### AC-016: Approve in one step

**AT-016-1 [main]** Submitted A (stu-a). adv-1 POSTs `/schedules/{A}/approve` with **no body** → 200, status APPROVED. The last history entry is SUBMITTED → APPROVED by adv-1.

### AC-017: Return requires a comment

**AT-017-1 [main] missing comment:** adv-1 POSTs `/return` with `{}` → **400 COMMENT_REQUIRED**. *Nothing created:* A is still SUBMITTED, and Notifications(stu-a) has no SCHEDULE_RETURNED.

**AT-017-2 [outside] empty comment:** `{"comment": ""}` → 400 COMMENT_REQUIRED; A still SUBMITTED.

**AT-017-3 [control]** `{"comment": "Take CSCI 8100 in spring instead"}` → 200, status RETURNED, returnComment is that text, and Notifications(stu-a) has one SCHEDULE_RETURNED whose message contains it.

---

## FR-009: Side-by-side review

### AC-018: Side-by-side review

**AT-018-1 [main]**
```gherkin
Given the time is 2027-11-15T15:00Z
And stu-b's history has CSCI 8000 IN_PROGRESS in FA27
And stu-b's plan is pinned CSCI 8500 → SP28, CSCI 8100 → FA28
And stu-b has Submitted S = {CSCI8500-001, CSCI8100-101} for SP28
When adv-1 GETs /advisor/schedules/{S}/review
Then the status is 200
And schedule.sectionIds is [CSCI8500-001, CSCI8100-101]
And planForTerm contains CSCI 8500 and not CSCI 8100
And courseHistory is [CSCI 8000 IN_PROGRESS FA27]
And highlightedCourseIds is ["CSCI 8100"]
```

---

## FR-010: Keeping data current

### AC-019: Data refreshed when opening a schedule

**AT-019-1 [main]**
```gherkin
Given stu-a has Draft = {CSCI8000-001} and the last sync saw 5 seats, OPEN
And MavLINK now reports CSCI8000-001 with 0 seats, FULL
When stu-a GETs /schedules/{id}          # no syncAll in between
Then CSCI8000-001 is flagged SECTION_FULL
```

**AT-019-2 [control]** Before MavLINK changes, the same GET shows CSCI8000-001 PASS.

### AC-020: Hourly refresh during registration

**AT-020-1 [main] [inside]**
```gherkin
Given a successful sync at T0 = 2027-07-15T14:00Z (inside the FA27 window)
When I run jobs at 2027-07-15T15:00Z          # exactly 60 minutes later
Then the simulator received a new full fetch (no student scope)
And GET /sync-status has lastSuccessfulSyncAt "2027-07-15T15:00:00.000Z"
```

**AT-020-2 [inside] last day of the window:** sync at 2027-08-20T19:00Z [2:00 PM CDT on the window's last day]; run jobs at 20:00Z → a new full fetch happens.

*Not tested:* syncs outside a registration window. See Spec gap G-4.

---

## FR-014: Enrollment

### AC-024: Successful enrollment

**AT-024-1 [main]**
```gherkin
Given stu-a's Fall 2027 schedule A = {CSCI8000-001, CSCI8100-001} was just approved by adv-1
When I run jobs at T0
Then the simulator received exactly one delivered enroll call for each of CSCI8000-001 and CSCI8100-001
And A has two Enrollment Records, both ENROLLED
And A's status is ENROLLED
And GET /plan FA27 holds exactly CSCI 8000 and CSCI 8100
And Notifications(stu-a) has one ENROLLMENT_RESULT for A
And Notifications(adv-1) has no ENROLLMENT_RESULT          # advisor is told only on failure
```

### AC-025: Partial enrollment failure

**AT-025-1 [main]**
```gherkin
Given A = {CSCI8000-001, CSCI8100-001, CSCI8800-001} was just approved
And MavLINK will reject CSCI8100-001 with reason "full"
When I run jobs at T0
Then CSCI8100-001 has a FAILED Enrollment Record with reason "full"
And CSCI8000-001 and CSCI8800-001 have ENROLLED records
And A's status is PARTIALLY_ENROLLED
And Notifications(stu-a) and Notifications(adv-1) each have an ENROLLMENT_RESULT whose message contains "CSCI8100-001"
```
AT-024-1 is the control (all accepted → ENROLLED, advisor not notified).

---

## FR-015: Revalidation

### AC-026: Approved schedule breaks before enrollment

**AT-026-1 [main]**
```gherkin
Given stu-a's A = {CSCI8000-001, CSCI8100-001} is APPROVED and no jobs have run
When MavLINK marks CSCI8000-001 CANCELLED
And RegistrationSync.syncAll() runs
Then A's status is RETURNED
And A's returnComment contains "CSCI8000-001"
And the last history entry is APPROVED → RETURNED by the system
And CSCI8000-001's result is flagged SECTION_CANCELLED
And Notifications(stu-a) and Notifications(adv-1) each have a REVALIDATION_FAILURE for A
When I run jobs at T0
Then the simulator received no enroll calls                 # a Returned schedule is never enrolled (D9)
```

**AT-026-2 [control]** syncAll with no MavLINK change → A stays APPROVED and nobody gets REVALIDATION_FAILURE.

### AC-027: Enrolled schedule changes

**AT-027-1 [main]** A enrolled (approved and jobs run). MavLINK marks CSCI8000-001 CANCELLED; syncAll → A stays ENROLLED; Notifications(stu-a) and Notifications(adv-1) each have a REVALIDATION_FAILURE whose message contains "CSCI8000-001".

---

## FR-016: Exception requests

### AC-028: Exception request needs a justification

Setup: time 2027-11-15T15:00Z; stu-a, no history; Draft S = {CSCI8500-001} for SP28, so CSCI8500-001 is flagged MISSING_PREREQUISITE.

**AT-028-1 [main] missing justification:** `POST /schedules/{S}/exceptions {"sectionId": "CSCI8500-001", "reasonCode": "MISSING_PREREQUISITE"}` → **400 JUSTIFICATION_REQUIRED**. *Nothing created:* S has no Exception Requests.

**AT-028-2 [outside] empty justification:** same with `"justification": ""` → 400 JUSTIFICATION_REQUIRED; still none.

**AT-028-3 [control]** same with `"justification": "Completed equivalent course at Creighton"` → 201; S has one Exception Request with that section, reason code, and justification. Submitting S → 200 with classification NEEDS_REVIEW, reasons including EXCEPTION_REQUESTED.

---

## FR-017: Withdraw

### AC-029: Withdraw before a decision

**AT-029-1 [main]** Submitted A (stu-a). stu-a POSTs `/withdraw` → 200, status DRAFT. Adding CSCI8800-001 then returns 200 (editable again). adv-1's dashboard no longer lists A.

### AC-030: Cannot withdraw after a decision

**AT-030-1 [main]** A Approved. stu-a POSTs `/withdraw` → **409 INVALID_STATE**. *Nothing created:* A is still APPROVED and its history has no APPROVED → DRAFT entry. AT-029-1 is the control.

---

## FR-018: Registration system outage

### AC-031: Registration system unavailable

**AT-031-1 [main]**
```gherkin
Given a successful sync at 2027-07-15T19:00Z [2:00 PM CDT]
And stu-a has Draft A = {CSCI8000-001, CSCI8100-001}
And MavLINK stops answering
When stu-a GETs /schedules/{A} at 2027-07-15T19:30Z [2:30 PM CDT]
Then lastSyncedAt is "2027-07-15T19:00:00.000Z"          # shown as "Last synced at 2:00 PM"
And every validation result has verified = false (Unverified)
And canSubmit is false
When stu-a POSTs /schedules/{A}/submit
Then the status is 503 with error REGISTRATION_UNAVAILABLE
And A is still DRAFT and Notifications(adv-1) is empty      # nothing created
```

**AT-031-2 [control]** MavLINK answers again; stu-a submits A → 200 SUBMITTED.

### AC-032: Enrollment queued during an outage

Setup: stu-a's A = {CSCI8000-001} Submitted at T0; MavLINK stops answering; adv-1 approves A at T0 → 200 APPROVED (approvals are still accepted).

**AT-032-1 [main] [inside]**
```gherkin
When I run jobs every 15 minutes from T0 to T0 + 23h45m (96 runs)
Then every run makes at least one enroll attempt
And no run makes a delivered enroll call
And Notifications(stu-a) and Notifications(adv-1) have no ENROLLMENT_RESULT       # still inside 24 h
When I run jobs at T0 + 24h
Then Notifications(stu-a) and Notifications(adv-1) each have an ENROLLMENT_RESULT for A
When I run jobs at T0 + 24h15m
Then no new enroll attempt is made                                                 # retries stopped
```

**AT-032-2 [outside] between retries:** after the T0 attempt, running jobs at T0 + 14m makes **no** new attempt.

**AT-032-3 [control]** MavLINK answers again at T0 + 1h; running jobs then enrolls CSCI8000-001 (status ENROLLED), and no failure notification is sent.

---

## FR-019: Access

### AC-033: Student cannot access another student's data

**AT-033-1 [main]**
```gherkin
Given stu-b has Draft B = {CSCI8000-001} named "Ben fall plan"
When stu-a GETs /schedules/{B}
Then the status is 404 with error NOT_FOUND
And the body does not contain "stu-b", "Ben fall plan", or "CSCI8000-001"
And the body is identical to the body of GET /schedules/does-not-exist        # existence is not revealed
```

**AT-033-2 [main] write attempt:** stu-a POSTs `/schedules/{B}/sections {"sectionId": "CSCI8100-001"}` → 404. *Nothing created:* stu-b's GET of B still lists only CSCI8000-001.

**AT-033-3 [control]** stu-b GETs B → 200.

### AC-034: Advisor limited to assigned students

Setup: stu-c (advisor adv-2) has Submitted C.

| ID | Role | Who approves | Expected |
|---|---|---|---|
| AT-034-1 | [main] | adv-1 (not assigned to stu-c) | 404 NOT_FOUND (cannot see C) |
| AT-034-2 | [main] | stu-c (the owner) | 403 FORBIDDEN (can see C, cannot approve) |
| AT-034-3 | [control] | adv-2 (assigned) | 200 APPROVED |

For AT-034-1 and AT-034-2, *nothing created:* C is still SUBMITTED, and running jobs makes no enroll call.

---

## FR-020: Enroll at most once

### AC-035: Duplicate approval does not double-enroll

**AT-035-1 [main]**
```gherkin
Given stu-a's A = {CSCI8000-001, CSCI8100-001} is SUBMITTED
When adv-1 sends two POST /schedules/{A}/approve requests at the same time
Then both answer 200 with status APPROVED
And A's history has exactly one SUBMITTED → APPROVED entry
When I run jobs at T0, and again at T0 + 15m
Then the simulator received exactly one delivered enroll call for CSCI8000-001 and one for CSCI8100-001
```

**AT-035-2 [main] approve after enrollment:** after AT-035-1, adv-1 approves A again → 200; A stays ENROLLED; running jobs makes no new enroll call.

---

## Extra tests from the gap checklist

| ID | Category | Probes | Test | Expected |
|---|---|---|---|---|
| X-01 | identity | FR-019, NFR-001 | GET /schedules with no `X-User-Id` | 401 UNAUTHENTICATED |
| X-02 | identity | FR-019, D1 | GET /schedules with `X-User-Id: nobody` (not in MavLINK) | 401 UNAUTHENTICATED |
| X-03 | identity | FR-007, FR-019 | stu-a GETs /advisor/dashboard | 403 FORBIDDEN |
| X-04 | identity | FR-006, NFR-001 | After AT-013-1, stu-b GETs /notifications | empty list (stu-a's notifications are not shown) |
| X-05 | state | Draft Schedule transitions | adv-1 approves a **Draft** of stu-a | 409 INVALID_STATE; still DRAFT; no enroll call after running jobs |
| X-06 | state | Draft Schedule transitions | stu-a withdraws a **Draft** | 409 INVALID_STATE; still DRAFT |
| X-07 | state | Draft Schedule transitions | adv-1 returns an **Approved** schedule with a comment | 409 INVALID_STATE; still APPROVED |
| X-08 | state | Draft Schedule (Returned editable, Returned → Submitted) | Returned A: stu-a adds CSCI8800-001 then submits | 200 then 200 SUBMITTED |
| X-09 | state | Draft Schedule (Enrolled is "later") | A Enrolled; submit Draft B for FA27 | 409 ACTIVE_SUBMISSION_EXISTS; B still DRAFT |
| X-10 | concurrency | NFR-002, FR-017 | Submitted A: stu-a withdraw and adv-1 approve sent at the same time | exactly one answers 200; if approve won, A is APPROVED and withdraw got 409; if withdraw won, A is DRAFT, approve got 409, and running jobs makes no enroll call |
| X-11 | concurrency | NFR-002, AC-014 | Two Drafts of stu-a for FA27 submitted at the same time | exactly one 200 and one 409 ACTIVE_SUBMISSION_EXISTS; exactly one SUBMITTED |
| X-12 | input types | FR-002 | add section `NOPE-999` | 400 INVALID_INPUT; draft unchanged |
| X-13 | input types | FR-002, Draft Schedule ("for one Term") | add SP28 section CSCI8500-001 to an FA27 draft | 400 SECTION_TERM_MISMATCH; draft unchanged. Control: CSCI8000-001 → 200 |
| X-14 | input types | FR-002 | POST /schedules `{"term": "FA99"}` | 400 INVALID_INPUT; GET /schedules unchanged (nothing created). Control: `{"term": "FA27"}` → 201 |
| X-15 | input types | FR-001 | GET /sections?term=FA27&startsAtOrAfter=5pm | 400 INVALID_INPUT. Control: `17:00` → 200 |
| X-16 | input types | FR-002 | add CSCI8000-001 twice | second add 400 INVALID_INPUT; sectionIds still one entry; 3 credits |
| X-17 | errors and precedence | FR-019, NFR-001 | adv-1 approves stu-c's **Draft** (wrong advisor and wrong state) | 404 NOT_FOUND, not 409 (state not revealed) |
| X-18 | errors and precedence | FR-019 | stu-a approves own **Draft** | 403 FORBIDDEN, not 409 |
| X-19 | listing | FR-007, FR-019 | stu-c (adv-2) and stu-a (adv-1) both Submitted; adv-1 dashboard | lists stu-a's only |
| X-20 | listing | FR-007 | after adv-1 approves A | A no longer on adv-1's dashboard |
| X-21 | listing | FR-002 | stu-a has drafts for FA27 and SP28; GET /schedules?term=SP28 | only the SP28 draft |
| X-22 | what is returned | NFR-007 | Submitted then approved A | history is [null → DRAFT by stu-a, DRAFT → SUBMITTED by stu-a, SUBMITTED → APPROVED by adv-1], each with a time |
| X-23 | what is returned, time | NFR-003, Validation Result | Draft synced at T0; GET it | every result's dataAsOf is "2027-07-15T14:00:00.000Z" (the last sync), verified true |
| X-24 | boundaries | FR-011 (co-requisites) | Draft {} add CSCI8410-001 without CSCI 8400 | flagged MISSING_COREQUISITE naming CSCI 8400 |
| X-25 | boundaries | FR-011 (co-requisites) | [control] Draft {CSCI8400-001} add CSCI8410-001 | no MISSING_COREQUISITE |
| X-26 | boundaries | FR-011 (section status) | add CSCI8700-001 (Cancelled) | 200, flagged SECTION_CANCELLED (still added) |
| X-27 | boundaries | FR-011 (section status) | add CSCI8600-001 (Full) | 200, flagged SECTION_FULL (still added) |
| X-28 | input types | FR-008 | `return` with `{"comment": 42}` | 400 COMMENT_REQUIRED; still SUBMITTED |
| X-29 | identity | FR-019, NFR-001 | stu-a GETs /advisor/schedules/{B}/review for stu-b's submitted schedule | 403 FORBIDDEN (students cannot use advisor routes) |
| X-30 | time | FR-018, NFR-004 | restart the application during AT-032-1 and continue | retry still happens; never re-sends an ENROLLED section. **Needs a persistent Data Store; not automated in this suite.** |

## Spec gaps

Listed for the spec owner. None of them is resolved here; tests that would need an answer are marked "not tested" above.

### Requirements, or parts of requirements, with no acceptance criterion

| # | Requirement | What has no AC |
|---|---|---|
| G-R1 | FR-002 | Removing a section from a draft. |
| G-R2 | FR-010 | Refreshing when a student **edits** a schedule. AC-019 covers only opening. |
| G-R3 | FR-011 | Co-requisites and MISSING_COREQUISITE (X-24, X-25 probe it). |
| G-R4 | FR-011 | SECTION_CANCELLED and SECTION_FULL when a section is **added**. AC-019 and AC-026 cover them only after a data change (X-26, X-27). |
| G-R5 | FR-016 | Exception Requests for any reason code other than MISSING_PREREQUISITE. |
| G-R6 | FR-018 | "Block new submissions" when the user calls the API directly. AC-031 only says the button is disabled (AT-031-1 tests the API). |
| G-R7 | NFR-004 | Surviving a restart has a check in the NFR but no acceptance criterion (X-30). |
| G-R8 | NFR-007 | The audit history has no acceptance criterion (X-22). |

### Acceptance criteria that test something no requirement states

| # | Criterion | What it adds |
|---|---|---|
| G-A1 | AC-008 | "I see the hold type." FR-011 does not say the hold type is shown. |
| G-A2 | AC-012 | Counts Electives as "1 of 4" courses. The Degree Requirement object measures credit hours, not a course count. |
| G-A3 | AC-014 | "A message to withdraw the first one." FR-006 does not mention it. |
| G-A4 | AC-031 | "The Submit button is disabled." A user-interface detail that FR-018 does not state. |

### Rules the tests need that the spec leaves open

| # | Question | Where it matters |
|---|---|---|
| G-1 | Is a section ending at 18:45 in conflict with one starting at 18:45? | AC-004 boundary (not tested) |
| G-2 | Is a section with 0 seats but status Open "full"? AC-019 changes both. | AC-019 |
| G-3 | Is a co-requisite satisfied by a course in the same schedule, an earlier completed course, or both? | X-24, X-25 (only the unambiguous cases are tested) |
| G-4 | How often to sync outside a registration window, and whether the window's end date is inclusive and in which time zone. | AC-020 (Spec issue 4 in architecture.md) |
| G-5 | What "current Term" and "next Term" mean on a date between terms (FR-015). | AC-026, AC-027 use FA27 only |
| G-6 | Does "Submitted, Approved, or later" include Returned? | AC-014 (Returned case not tested) |
| G-7 | Can a schedule with a Flag but no Exception Request be submitted? (Spec issue 2) | AC-023 row 1 is tested through `Classifier.classify` instead |
| G-8 | When is a requirement "In Progress" rather than "Remaining" (for example, 1 course complete and none in progress)? | AC-012 |
| G-9 | No reason code exists for a plan course placed outside its offering pattern after a manual move. | AC-011 (only MISSING_PREREQUISITE is checked) |
| G-10 | After the 24-hour retry period, does an Approved schedule stay Approved? | AC-032 (status not checked) |
| G-11 | Does a "ignored" repeated approval answer success or an error? contracts.md chose 200 with no change. | AC-035 |
| G-12 | Is a comment or justification of only spaces "empty"? | AC-017, AC-028 (not tested) |
| G-13 | Which error wins when MavLINK is down **and** another schedule for the Term is already Submitted? | AC-014, AC-031 (not tested) |
| G-14 | Should the advisor be notified when a student withdraws? | AC-029 (not checked) |
| G-15 | Does a denied request answer "not found" or "forbidden"? contracts.md chose 404 when the user may not see the data, 403 when they may see it but not act. | AC-033, AC-034 |

## Coverage

| AC | Tests | AC | Tests |
|---|---|---|---|
| AC-001 | AT-001-1 | AC-019 | AT-019-1, -2 |
| AC-002 | AT-002-1, -2 | AC-020 | AT-020-1, -2 |
| AC-003 | AT-003-1, -2 | AC-021 | AT-021-1 |
| AC-004 | AT-004-1, -2, -3 | AC-022 | AT-022-1 |
| AC-005 | AT-005-1 | AC-023 | AT-023-0 to -3 |
| AC-006 | AT-006-1, -2, -3 | AC-024 | AT-024-1 |
| AC-007 | AT-007-1, -2, -3 | AC-025 | AT-025-1 |
| AC-008 | AT-008-1, -2 | AC-026 | AT-026-1, -2 |
| AC-009 | AT-009-1 | AC-027 | AT-027-1 |
| AC-010 | AT-010-1 | AC-028 | AT-028-1, -2, -3 |
| AC-011 | AT-011-1, -2 | AC-029 | AT-029-1 |
| AC-012 | AT-012-1, -2, -3 | AC-030 | AT-030-1 |
| AC-013 | AT-013-1, -2, -3 | AC-031 | AT-031-1, -2 |
| AC-014 | AT-014-1 to -4 | AC-032 | AT-032-1, -2, -3 |
| AC-015 | AT-015-1 | AC-033 | AT-033-1, -2, -3 |
| AC-016 | AT-016-1 | AC-034 | AT-034-1, -2, -3 |
| AC-017 | AT-017-1, -2, -3 | AC-035 | AT-035-1, -2 |
| AC-018 | AT-018-1 | | |
