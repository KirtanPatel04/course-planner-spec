# Implementation Plan: UNO Course Registration and Planning Application

Section references point to [`spec.md`](spec.md) (FR-, NFR-, AC-), [`architecture.md`](architecture.md) (D-, §), [`contracts.md`](contracts.md) and [`test_plan.md`](test_plan.md) (AT-, X-, G-).

## Starting point

`npm test` on the skeleton (commit `d03a298`): **122 tests, 20 passed, 102 failed.**

- The 20 passing tests are the wiring checks in `tests/contracts.test.ts`. They must stay green.
- All 102 failures stop at the same line: `h.sync()` → `RegistrationSync.syncAll` is not implemented. So no test reaches its own rule yet. Every slice below therefore depends on slice 1.

Failing tests by acceptance criterion (from the `describe`/test names):

| AC | Failing tests | AC | Failing tests |
|---|---|---|---|
| AC-001 | AT-001-1 | AC-019 | AT-019-1, AT-019-2 |
| AC-002 | AT-002-1, AT-002-2 | AC-020 | AT-020-1, AT-020-2 |
| AC-003 | AT-003-1, AT-003-2 | AC-021 | AT-021-1 |
| AC-004 | AT-004-1, -2, -3 | AC-022 | AT-022-1 |
| AC-005 | AT-005-1 | AC-023 | AT-023-0, -1, -2, -3 |
| AC-006 | AT-006-1, -2, -3 | AC-024 | AT-024-1 |
| AC-007 | AT-007-1, -2, -3 | AC-025 | AT-025-1 |
| AC-008 | AT-008-1, -2 | AC-026 | AT-026-1, -2 |
| AC-009 | AT-009-1 | AC-027 | AT-027-1 |
| AC-010 | AT-010-1 | AC-028 | AT-028-1, -2, -3 |
| AC-011 | AT-011-1, -2 | AC-029 | AT-029-1 |
| AC-012 | AT-012-1, -2, -3 | AC-030 | AT-030-1 |
| AC-013 | AT-013-1, -2, -3 | AC-031 | AT-031-1, -2 |
| AC-014 | AT-014-1, -2, -3, -4 | AC-032 | AT-032-1, -2, -3 |
| AC-015 | AT-015-1 | AC-033 | AT-033-1, -2, -3 |
| AC-016 | AT-016-1 | AC-034 | AT-034-1, -2, -3 |
| AC-017 | AT-017-1, -2, -3 | AC-035 | AT-035-1, -2 |
| AC-018 | AT-018-1 | Extra | X-01 to X-29 (28 tests; X-13, X-14, X-15 have a control each; X-30 is not automated) |

## Conventions used in this plan

- **Tests that should turn green** are copied exactly from the suite (`file > describe > test`).
- A **control** test (a valid request beside a rejection) can already pass before its rule exists, because a rule that does nothing does not reject anything. Such tests are placed in the slice of the rule they control, and marked *(control, may already be green)*. They must stay green from then on.
- **Validator.validateSchedule** is one function holding seven rules. It is filled one rule at a time (slices 2 to 7), so a failure points at one rule. The slice lists which part it fills.
- Routes are already written in `src/api/routes.ts`. A route "returns 501" only because the function it calls throws. A route is listed in the slice that makes it stop returning 501.
- Every slice's **Done when**: the listed tests pass, and no previously passing test fails (including the 20 wiring tests).

---

## Slice 1: Walking skeleton, identity and catalog search

- **Goal:** A signed-in student can search the catalog through `GET /sections`, served from a synced snapshot in PostgreSQL. This is the full request flow: SSO header → Access Control → module → Data Store.
- **Spec sources:** FR-001; FR-010 (sync); FR-019; Description (SSO); architecture §2 (API, Access Control, Catalog Search, Registration Sync, Data Store), D1, D2, D4.
- **Criteria:** AC-001.
- **Tests that should turn green:**
  - `search.test.ts > AC-001 Search with combined filters (FR-001) > AT-001-1 [main][inside][outside] Core, FA27, starting at or after 17:00`
  - `search.test.ts > AC-002 Search with no results (FR-001) > AT-002-2 [control] Electives on Saturday returns CSCI8800-001`
  - `search.test.ts > X-15 Malformed search time (extra, probes FR-001) > X-15 "5pm" is rejected`
  - `search.test.ts > X-15 Malformed search time (extra, probes FR-001) > X-15 [control] "17:00" is accepted`
  - `access.test.ts > Extra tests for identity and precedence > X-01 no identity is rejected (probes FR-019, NFR-001)`
  - `access.test.ts > Extra tests for identity and precedence > X-02 an identity unknown to MavLINK is rejected (probes FR-019, D1)`
  - `access.test.ts > Extra tests for identity and precedence > X-03 a student cannot open the advisor dashboard (probes FR-007, FR-019)`
- **Skeleton to fill in:**
  - `PostgresDataStore`: connection and schema, `transaction`, `getRegistrationData`, `saveRegistrationData`, `getSyncStatus`
  - `RegistrationSync.syncAll` (success path only: fetch, compare with the snapshot, save, return the report)
  - `AccessControl.resolveActor`, `requireStudent`, `requireAdvisor`
  - `CatalogSearch.searchSections`
  - Route: `GET /sections`
- **Depends on:** none. **Blocked by Design question 1.**
- **Done when:** the listed tests pass and no previously passing test fails.
- **Status:** done.

## Slice 2: Draft schedules and ownership

- **Goal:** A student creates, lists, opens and adds sections to their own drafts, and cannot see or change another student's drafts.
- **Spec sources:** FR-002, FR-010 (refresh on open or edit), FR-019; Draft Schedule; Validation Result (`dataAsOf`); NFR-001, NFR-003, NFR-007 (creation history entry); architecture §3.2.
- **Criteria:** AC-002, AC-003, AC-033.
- **Tests that should turn green:**
  - `search.test.ts > AC-002 Search with no results (FR-001) > AT-002-1 [main] no Core section meets on Saturday; draft unchanged`
  - `schedule.test.ts > AC-003 Add a section to the calendar (FR-002) > AT-003-1 [main] adding CSCI8000-001 to an empty draft`
  - `schedule.test.ts > AC-003 Add a section to the calendar (FR-002) > AT-003-2 [main] credit hours go from 3 to 6`
  - `access.test.ts > AC-033 Student cannot access another student's data (FR-019) > AT-033-1 [main] reading stu-b's schedule is denied and reveals nothing`
  - `access.test.ts > AC-033 Student cannot access another student's data (FR-019) > AT-033-2 [main] changing stu-b's schedule is denied; nothing added`
  - `access.test.ts > AC-033 Student cannot access another student's data (FR-019) > AT-033-3 [control] stu-b reads their own schedule`
  - `schedule.test.ts > Extra tests for building and validating drafts > X-12 unknown section is rejected; draft unchanged (probes FR-002)`
  - `schedule.test.ts > Extra tests for building and validating drafts > X-13 SP28 section in an FA27 draft is rejected; draft unchanged (probes FR-002, Draft Schedule)`
  - `schedule.test.ts > Extra tests for building and validating drafts > X-13 [control] an FA27 section in the same draft is accepted`
  - `schedule.test.ts > Extra tests for building and validating drafts > X-14 draft for unknown term FA99 is rejected; nothing created (probes FR-002)`
  - `schedule.test.ts > Extra tests for building and validating drafts > X-14 [control] draft for FA27 is created`
  - `schedule.test.ts > Extra tests for building and validating drafts > X-16 adding the same section twice is rejected; still one entry (probes FR-002)`
  - `schedule.test.ts > Extra tests for building and validating drafts > X-21 listing filters by term (probes FR-002)`
  - `schedule.test.ts > Extra tests for building and validating drafts > X-23 every result records the time of the data it used (probes NFR-003, Validation Result)`
- **Skeleton to fill in:**
  - `AccessControl.authorizeSchedule` (student `VIEW`/`EDIT` own schedules; `NOT_FOUND` otherwise)
  - `ScheduleManager.createDraft`, `listSchedules`, `getSchedule`, `addSection`
  - `RegistrationSync.refreshForStudent` (success path)
  - `Validator.validateSchedule` (part: one result per section in input order, with `dataAsOf` and `verified`; no rules yet)
  - `PostgresDataStore`: `insertSchedule`, `getSchedule`, `listSchedules`, `updateScheduleContents`, `listStatusChanges`, `listExceptionRequests`, `listEnrollmentRecords`
  - Routes: `POST /schedules`, `GET /schedules`, `GET /schedules/:id`, `POST /schedules/:id/sections`
- **Depends on:** 1.
- **Done when:** the listed tests pass and no previously passing test fails.
- **Status:** done.

## Slice 3: Validation rule, time conflicts

- **Goal:** Overlapping sections are both flagged `TIME_CONFLICT`, each naming the other.
- **Spec sources:** FR-003, FR-011; Validation Result.
- **Criteria:** AC-004.
- **Tests that should turn green:**
  - `schedule.test.ts > AC-004 Time conflict flagged on add (FR-003, FR-011) > AT-004-1 [main] Tue 17:30–18:45 vs Tue 18:00–20:40: both flagged`
  - `schedule.test.ts > AC-004 Time conflict flagged on add (FR-003, FR-011) > AT-004-2 [inside] one minute of overlap (18:44) flags both`
  - `schedule.test.ts > AC-004 Time conflict flagged on add (FR-003, FR-011) > AT-004-3 [outside][control] one minute apart (18:46) flags neither` *(control, may already be green)*
- **Skeleton to fill in:** `Validator.validateSchedule` (part: `TIME_CONFLICT`).
- **Depends on:** 2.
- **Done when:** the listed tests pass and no previously passing test fails.
- **Status:** done.

## Slice 4: Validation rule, prerequisites

- **Goal:** A section is flagged `MISSING_PREREQUISITE` unless each prerequisite is completed, or in progress in a term that ends before the target term starts.
- **Spec sources:** FR-003, FR-011; Course History (in-progress rule).
- **Criteria:** AC-005, AC-006.
- **Tests that should turn green:**
  - `schedule.test.ts > AC-005 Missing prerequisite flagged on add (FR-003, FR-011) > AT-005-1 [main] CSCI 8500 without CSCI 8000`
  - `schedule.test.ts > AC-006 In-progress prerequisite counts (FR-011) > AT-006-1 [main][inside] CSCI 8000 in progress in FA27 (ends before SP28 starts)` *(control, may already be green)*
  - `schedule.test.ts > AC-006 In-progress prerequisite counts (FR-011) > AT-006-2 [outside] CSCI 8000 in progress in SP28 itself`
  - `schedule.test.ts > AC-006 In-progress prerequisite counts (FR-011) > AT-006-3 [control] CSCI 8000 completed in FA27` *(control, may already be green)*
- **Skeleton to fill in:** `Validator.validateSchedule` (part: `MISSING_PREREQUISITE`).
- **Depends on:** 2.
- **Done when:** the listed tests pass and no previously passing test fails.
- **Status:** done.

## Slice 5: Validation rule, credit-hour limit

- **Goal:** Sections that take the schedule above the Program's per-term limit are flagged `CREDIT_LIMIT_EXCEEDED`. Exactly at the limit passes.
- **Spec sources:** FR-011; Program (maximum credit-hour load).
- **Criteria:** AC-007.
- **Tests that should turn green:**
  - `schedule.test.ts > AC-007 Credit-hour limit exceeded (FR-011) > AT-007-1 [main] 12 + 3 = 15 flags the new section`
  - `schedule.test.ts > AC-007 Credit-hour limit exceeded (FR-011) > AT-007-2 [inside][control] 9 + 3 = 12 passes` *(control, may already be green)*
  - `schedule.test.ts > AC-007 Credit-hour limit exceeded (FR-011) > AT-007-3 [outside] 12 + 1 = 13 flags the new section`
- **Skeleton to fill in:** `Validator.validateSchedule` (part: `CREDIT_LIMIT_EXCEEDED`).
- **Depends on:** 2. Runs after 3 and 4 because AT-007-2 needs all four sections free of conflict and prerequisite flags.
- **Done when:** the listed tests pass and no previously passing test fails.
- **Status:** done.

## Slice 6: Validation rules, co-requisites and blocking holds

- **Goal:** A section whose co-requisite is not in the schedule is flagged `MISSING_COREQUISITE`. Every section is flagged `BLOCKING_HOLD` with the hold type when a blocking hold exists.
- **Spec sources:** FR-011; Registration Hold.
- **Criteria:** AC-008.
- **Tests that should turn green:**
  - `schedule.test.ts > Extra tests for building and validating drafts > X-24 lab without its co-requisite is flagged (probes FR-011)`
  - `schedule.test.ts > Extra tests for building and validating drafts > X-25 [control] lab with its co-requisite in the same draft is not flagged` *(control, may already be green)*
  - `schedule.test.ts > AC-008 Blocking hold (FR-011) > AT-008-1 [main] Bursar hold flags every section with its type`
  - `schedule.test.ts > AC-008 Blocking hold (FR-011) > AT-008-2 [control] a non-blocking hold flags nothing` *(control, may already be green)*
- **Skeleton to fill in:** `Validator.validateSchedule` (parts: `MISSING_COREQUISITE`, `BLOCKING_HOLD`).
- **Depends on:** 2.
- **Done when:** the listed tests pass and no previously passing test fails.
- **Status:** done.

## Slice 7: Validation rules, section status, and refresh on open

- **Goal:** Full and cancelled sections are still added but flagged `SECTION_FULL` or `SECTION_CANCELLED`, and opening a schedule picks up seat changes from MavLINK first.
- **Spec sources:** FR-010 ("whenever a student opens"), FR-011; Course Section status; architecture §3.2 step 3, D5.
- **Criteria:** AC-009, AC-019.
- **Tests that should turn green:**
  - `schedule.test.ts > Extra tests for building and validating drafts > X-26 a cancelled section is added and flagged SECTION_CANCELLED (probes FR-011)`
  - `schedule.test.ts > Extra tests for building and validating drafts > X-27 a full section is added and flagged SECTION_FULL (probes FR-011)`
  - `sync.test.ts > AC-019 Data refreshed when opening a schedule (FR-010) > AT-019-1 [main] seats drop to 0 in MavLINK; opening the schedule flags SECTION_FULL`
  - `sync.test.ts > AC-019 Data refreshed when opening a schedule (FR-010) > AT-019-2 [control] before the change the section passes` *(control, may already be green)*
  - `schedule.test.ts > AC-009 Clean schedule passes (FR-011) > AT-009-1 [main] three non-conflicting open sections, 9 credits` (placed here because it only means something once all seven rules exist; it may already be green)
- **Skeleton to fill in:** `Validator.validateSchedule` (parts: `SECTION_FULL`, `SECTION_CANCELLED`). `RegistrationSync.refreshForStudent` must actually replace that student's sections, holds and history in the snapshot (it may already do this after slice 2).
- **Depends on:** 2, and 3 to 6 for AT-009-1.
- **Done when:** the listed tests pass and no previously passing test fails.
- **Status:** done.

## Slice 8: Job Runner and hourly sync

- **Goal:** Background jobs run in the server process. A full sync runs when an hour has passed since the last successful sync inside a registration window, and queued emails are sent.
- **Spec sources:** FR-010 (hourly), NFR-003, NFR-009; Notification (email); architecture D5, D10.
- **Criteria:** AC-020.
- **Tests that should turn green:**
  - `sync.test.ts > AC-020 Hourly refresh during registration (FR-010) > AT-020-1 [main][inside] 60 minutes after the last sync a new full sync runs`
  - `sync.test.ts > AC-020 Hourly refresh during registration (FR-010) > AT-020-2 [inside] on the last day of the window`
- **Skeleton to fill in:**
  - `JobRunner.runDueJobs` (sync due check; hands due ENROLLMENT jobs to Enrollment; sends emails), `start`, `stop`
  - `RegistrationSync.getSyncStatus`
  - `Notifier.sendPendingEmails`
  - `PostgresDataStore`: `listDueJobs`, `listUnsentEmails`, `markEmailSent`
  - Route: `GET /sync-status`
- **Depends on:** 1.
- **Done when:** the listed tests pass and no previously passing test fails.
- **Status:** done.

## Slice 9: Degree progress

- **Goal:** A student sees each requirement as Complete, In Progress, or Remaining, with completed and in-progress courses and credit hours.
- **Spec sources:** FR-005; Degree Progress; Degree Requirement.
- **Criteria:** AC-012.
- **Tests that should turn green:**
  - `plan.test.ts > AC-012 Degree progress view (FR-005) > AT-012-1 [main] Core complete; Electives 1 complete and 1 in progress; Project remaining`
  - `plan.test.ts > AC-012 Degree progress view (FR-005) > AT-012-2 [inside] four Electives completed makes Electives COMPLETE`
  - `plan.test.ts > AC-012 Degree progress view (FR-005) > AT-012-3 [outside] Core with one course still in progress is not COMPLETE`
- **Skeleton to fill in:** `DegreeAudit.getDegreeProgress`. Route: `GET /degree-progress`.
- **Depends on:** 1.
- **Done when:** the listed tests pass and no previously passing test fails.
- **Status:** done.

## Slice 10: Plan generation

- **Goal:** A student with no plan gets a generated term-by-term plan that covers every remaining requirement, respects offering patterns and prerequisite order, and stays within the credit limit.
- **Spec sources:** FR-004, FR-012; Plan of Study; architecture D13.
- **Criteria:** AC-010.
- **Tests that should turn green:**
  - `plan.test.ts > AC-010 Suggested plan for an incoming graduate student (FR-004, FR-012) > AT-010-1 [main] generated plan covers every requirement in a valid order`
- **Skeleton to fill in:** `Planner.getPlan` (generates and saves when none exists). `PostgresDataStore`: `getPlan`, `savePlan`. Route: `GET /plan`.
- **Depends on:** 9 (Planner uses Degree Audit for the remaining requirements).
- **Done when:** the listed tests pass and no previously passing test fails.
- **Status:** done.

## Slice 11: Manual plan moves and plan validation

- **Goal:** A student can move a planned course to another term. The move is always saved, marked `MANUAL`, and flagged when it breaks prerequisite order.
- **Spec sources:** FR-004, FR-012; architecture (Validator: plan flags for AC-011).
- **Criteria:** AC-011.
- **Tests that should turn green:**
  - `plan.test.ts > AC-011 Moving a course breaks prerequisite order (FR-004) > AT-011-1 [main] CSCI 8500 moved into the same term as CSCI 8000 is saved and flagged`
  - `plan.test.ts > AC-011 Moving a course breaks prerequisite order (FR-004) > AT-011-2 [control] CSCI 8500 moved after CSCI 8000 is not flagged`
- **Skeleton to fill in:** `Planner.moveCourse`, `Validator.validatePlan`. Route: `PUT /plan/courses/:courseId`.
- **Depends on:** 10.
- **Done when:** the listed tests pass and no previously passing test fails.
- **Status:** done.

## Slice 12: Submission classification

- **Goal:** The Classifier labels a schedule Routine only if every section passes, there are no Exception Requests, and every course is in the plan for that term. Otherwise it is Needs Review, with one reason per failed condition.
- **Spec sources:** FR-013; Submission Classification; architecture D12.
- **Criteria:** AC-023.
- **Tests that should turn green:**
  - `submission.test.ts > AC-023 Needs Review classification (FR-013) — Classifier.classify > AT-023-0 [control] base input is ROUTINE`
  - `submission.test.ts > AC-023 Needs Review classification (FR-013) — Classifier.classify > AT-023-1 [main] a flagged section → NEEDS_REVIEW (SECTION_FLAGGED)`
  - `submission.test.ts > AC-023 Needs Review classification (FR-013) — Classifier.classify > AT-023-2 [main] an Exception Request → NEEDS_REVIEW (EXCEPTION_REQUESTED)`
  - `submission.test.ts > AC-023 Needs Review classification (FR-013) — Classifier.classify > AT-023-3 [main] a course not in the plan for the term → NEEDS_REVIEW (COURSE_NOT_IN_PLAN)`
- **Skeleton to fill in:** `Classifier.classify`.
- **Depends on:** 11 (the tests pin the plan with `PUT /plan/courses`).
- **Done when:** the listed tests pass and no previously passing test fails.
- **Status:** done.

## Slice 13: Submit and approve, with notifications

- **Goal:** A student submits a draft, which locks it, classifies it, and notifies the assigned advisor. The assigned advisor approves it in one step, which records the decision, queues one enrollment job, and notifies the student.
- **Spec sources:** FR-006, FR-008, FR-013, FR-019; Draft Schedule transitions; Advisor Decision; Notification; NFR-001, NFR-002, NFR-007; architecture §3.1 steps 1 to 11, D8, D9.
- **Criteria:** AC-013, AC-016, AC-022, AC-034.
- **Tests that should turn green:**
  - `submission.test.ts > AC-013 Submit and get notified of approval (FR-006) > AT-013-1 [main] submit notifies the assigned advisor; approval notifies the student`
  - `submission.test.ts > AC-013 Submit and get notified of approval (FR-006) > AT-013-2 [main] a Submitted schedule is locked from editing; nothing added`
  - `submission.test.ts > AC-013 Submit and get notified of approval (FR-006) > AT-013-3 [control] the same add on a Draft is accepted` *(control, may already be green)*
  - `submission.test.ts > AC-016 Approve in one step (FR-008) > AT-016-1 [main] approve with no body`
  - `submission.test.ts > AC-022 Routine classification (FR-013) > AT-022-1 [main] passing sections, no exceptions, all in plan → ROUTINE`
  - `access.test.ts > AC-034 Advisor limited to assigned students (FR-019) > AT-034-1 [main] an unassigned advisor cannot approve`
  - `access.test.ts > AC-034 Advisor limited to assigned students (FR-019) > AT-034-2 [main] the student cannot approve their own schedule`
  - `access.test.ts > AC-034 Advisor limited to assigned students (FR-019) > AT-034-3 [control] the assigned advisor approves`
  - `access.test.ts > Extra tests for identity and precedence > X-04 a student sees only their own notifications (probes FR-006, NFR-001)`
  - `access.test.ts > Extra tests for identity and precedence > X-17 wrong advisor and wrong state: visibility wins, 404 not 409 (probes FR-019, NFR-001)`
  - `access.test.ts > Extra tests for identity and precedence > X-18 student approving own Draft: permission wins, 403 not 409 (probes FR-019)`
  - `submission.test.ts > Extra tests for status transitions > X-05 approving a Draft is rejected; no enrollment (probes Draft Schedule transitions)`
  - `submission.test.ts > Extra tests for status transitions > X-22 history records every transition with who and when (probes NFR-007)`
- **Skeleton to fill in:**
  - `ScheduleManager.submit` (Draft or Returned → Submitted, revalidate, classify, notify; `INVALID_STATE`), `approve` (Submitted → Approved, Advisor Decision, one enrollment job, notify; `INVALID_STATE` from Draft or Returned)
  - `AccessControl.authorizeSchedule` (student `SUBMIT`; advisor `VIEW`/`APPROVE` for assigned students; `FORBIDDEN` for a student approving)
  - `Notifier.notify`, `listNotifications`
  - `PostgresDataStore`: `updateScheduleStatus`, `insertAdvisorDecision`, `enqueueJob`, `insertNotification`, `listNotifications`
  - Routes: `POST /schedules/:id/submit`, `POST /schedules/:id/approve`, `GET /notifications`
- **Depends on:** 2, 8 (AT-034-1, AT-034-2 and X-05 call `runJobs`), 12.
- **Done when:** the listed tests pass and no previously passing test fails.
- **Status:** done.

## Slice 14: Return with a comment

- **Goal:** An advisor returns a Submitted schedule only with a non-empty text comment. The student is notified with it, and can edit and resubmit.
- **Spec sources:** FR-008; Advisor Decision ("A Return always includes a comment"); Draft Schedule (Returned is editable, Returned → Submitted).
- **Criteria:** AC-017.
- **Tests that should turn green:**
  - `submission.test.ts > AC-017 Return requires a comment (FR-008) > AT-017-1 [main] return with no comment is rejected; nothing changes`
  - `submission.test.ts > AC-017 Return requires a comment (FR-008) > AT-017-2 [outside] an empty comment is rejected`
  - `submission.test.ts > AC-017 Return requires a comment (FR-008) > AT-017-3 [control] return with a comment notifies the student with it`
  - `submission.test.ts > AC-017 Return requires a comment (FR-008) > X-28 a non-text comment is rejected (extra, probes FR-008)`
  - `submission.test.ts > Extra tests for status transitions > X-07 returning an Approved schedule is rejected (probes Draft Schedule transitions)`
  - `submission.test.ts > Extra tests for status transitions > X-08 a Returned schedule can be edited and resubmitted (probes Draft Schedule transitions)`
- **Skeleton to fill in:** `ScheduleManager.returnSchedule`; `AccessControl.authorizeSchedule` (advisor `RETURN`). Route: `POST /schedules/:id/return`.
- **Depends on:** 13.
- **Done when:** the listed tests pass and no previously passing test fails.
- **Status:** done.

## Slice 15: Withdraw

- **Goal:** A student can withdraw a Submitted schedule back to Draft, and only from Submitted.
- **Spec sources:** FR-017; Draft Schedule transitions.
- **Criteria:** AC-030.
- **Tests that should turn green:**
  - `submission.test.ts > AC-030 Cannot withdraw after a decision (FR-017) > AT-030-1 [main] withdrawing an Approved schedule is rejected; still Approved`
  - `submission.test.ts > Extra tests for status transitions > X-06 withdrawing a Draft is rejected (probes Draft Schedule transitions)`
- **Skeleton to fill in:** `ScheduleManager.withdraw`; `AccessControl.authorizeSchedule` (student `WITHDRAW`). Route: `POST /schedules/:id/withdraw`.
- **Depends on:** 13.
- **Done when:** the listed tests pass and no previously passing test fails.
- **Status:** done.

## Slice 16: One active submission per term

- **Goal:** A student cannot submit a second schedule for a Term while another is Submitted or later, even when both submissions race.
- **Spec sources:** FR-006; Draft Schedule ("only one in Submitted, Approved, or later status for that Term"); NFR-002; architecture D8 (partial unique index).
- **Criteria:** AC-014.
- **Tests that should turn green:**
  - `submission.test.ts > AC-014 Only one active submission per term (FR-006) > AT-014-1 [main] second FA27 submission is rejected; nothing changes`
  - `submission.test.ts > AC-014 Only one active submission per term (FR-006) > AT-014-2 [control] after withdrawing the first, the second submits` *(control, may already be green)*
  - `submission.test.ts > AC-014 Only one active submission per term (FR-006) > AT-014-3 [control] a submission for another term is accepted` *(control, may already be green)*
  - `submission.test.ts > AC-014 Only one active submission per term (FR-006) > AT-014-4 [main] an Approved schedule also blocks a second submission`
  - `submission.test.ts > Extra tests for status transitions > X-11 two drafts submitted at the same time: exactly one wins (probes NFR-002, AC-014)`
- **Skeleton to fill in:** `ScheduleManager.submit` (part: `ACTIVE_SUBMISSION_EXISTS`); `PostgresDataStore` partial unique index behind `updateScheduleStatus`.
- **Depends on:** 13, 15.
- **Done when:** the listed tests pass and no previously passing test fails.
- **Status:** done.

## Slice 17: Exception requests

- **Goal:** A student attaches an Exception Request with a justification to a flagged section, and the schedule is then Needs Review.
- **Spec sources:** FR-016; Exception Request; FR-013.
- **Criteria:** AC-028.
- **Tests that should turn green:**
  - `submission.test.ts > AC-028 Exception request needs a justification (FR-016) > AT-028-1 [main] missing justification is rejected; nothing attached`
  - `submission.test.ts > AC-028 Exception request needs a justification (FR-016) > AT-028-2 [outside] empty justification is rejected; nothing attached`
  - `submission.test.ts > AC-028 Exception request needs a justification (FR-016) > AT-028-3 [control] with a justification it is attached and the submission is Needs Review`
- **Skeleton to fill in:** `ScheduleManager.requestException`; `PostgresDataStore.insertExceptionRequest`. Route: `POST /schedules/:id/exceptions`.
- **Depends on:** 4, 13.
- **Done when:** the listed tests pass and no previously passing test fails.
- **Status:** done.

## Slice 18: Advisor dashboard

- **Goal:** An advisor sees only their students' Submitted schedules, Needs Review first and then Routine, oldest first in each group, with reasons.
- **Spec sources:** FR-007, FR-013, FR-019; architecture §3.1 step 8, Spec issue 9.
- **Criteria:** AC-015, AC-029.
- **Tests that should turn green:**
  - `review.test.ts > AC-015 Dashboard ordering (FR-007, FR-013) > AT-015-1 [main] Needs Review oldest first, then Routine`
  - `review.test.ts > AC-015 Dashboard ordering (FR-007, FR-013) > X-19 the dashboard lists only assigned students (extra, probes FR-007, FR-019)`
  - `review.test.ts > AC-015 Dashboard ordering (FR-007, FR-013) > X-20 an approved schedule leaves the dashboard (extra, probes FR-007)`
  - `submission.test.ts > AC-029 Withdraw before a decision (FR-017) > AT-029-1 [main] withdraw returns to Draft, editable, off the dashboard`
- **Skeleton to fill in:** `ReviewQueue.getDashboard`. Route: `GET /advisor/dashboard`.
- **Depends on:** 7, 15, 17.
- **Done when:** the listed tests pass and no previously passing test fails.
- **Status:** done.

## Slice 19: Side-by-side review

- **Goal:** An advisor sees the proposed schedule, the plan for that term and the course history together, with off-plan courses highlighted.
- **Spec sources:** FR-009, FR-019.
- **Criteria:** AC-018.
- **Tests that should turn green:**
  - `review.test.ts > AC-018 Side-by-side review (FR-009) > AT-018-1 [main] schedule, plan for the term, and history together; CSCI 8100 highlighted`
  - `access.test.ts > Extra tests for identity and precedence > X-29 a student cannot use the advisor review view (probes FR-019, NFR-001)` (may already be green after slice 13, because `requireAdvisor` rejects first)
- **Skeleton to fill in:** `ReviewQueue.getReviewView`. Route: `GET /advisor/schedules/:id/review`.
- **Depends on:** 11, 13.
- **Done when:** the listed tests pass and no previously passing test fails.
- **Status:** done.

## Slice 20: Enrollment

- **Goal:** The enrollment job sends each approved section to MavLINK and records one Enrollment Record per section. It sets Enrolled or Partially Enrolled, updates the plan, notifies the student, and also notifies the advisor if any section failed.
- **Spec sources:** FR-014; Enrollment Record; architecture §3.1 steps 12 to 15, D9.
- **Criteria:** AC-024, AC-025.
- **Tests that should turn green:**
  - `enrollment.test.ts > AC-024 Successful enrollment (FR-014) > AT-024-1 [main] every section enrolls; plan and notifications updated`
  - `enrollment.test.ts > AC-025 Partial enrollment failure (FR-014) > AT-025-1 [main] one section rejected as full`
  - `submission.test.ts > Extra tests for status transitions > X-09 an Enrolled schedule blocks another FA27 submission (probes Draft Schedule "or later")`
- **Skeleton to fill in:** `Enrollment.processEnrollmentJob` (success path: send sections without an ENROLLED record, record results, `COMPLETED`); `ScheduleManager.recordEnrollmentOutcome`; `Planner.applyEnrollment`; `PostgresDataStore`: `insertEnrollmentRecord`, `updateJob`, `deleteJob`.
- **Depends on:** 8, 10, 13, 16.
- **Done when:** the listed tests pass and no previously passing test fails.
- **Status:** done.

## Slice 21: Enroll at most once

- **Goal:** Duplicate or racing approvals leave one approval and one enrollment, and a withdraw that races an approve leaves exactly one winner.
- **Spec sources:** FR-020, FR-017; NFR-002; architecture D8, D9.
- **Criteria:** AC-035.
- **Tests that should turn green:**
  - `enrollment.test.ts > AC-035 Duplicate approval does not double-enroll (FR-020) > AT-035-1 [main] two approvals at once enroll each section exactly once`
  - `enrollment.test.ts > AC-035 Duplicate approval does not double-enroll (FR-020) > AT-035-2 [main] approving again after enrollment changes nothing`
  - `enrollment.test.ts > X-10 Withdraw and approve at the same time (extra, probes NFR-002, FR-017) > X-10 exactly one wins and the state matches the winner`
- **Skeleton to fill in:** `ScheduleManager.approve` (part: a repeated or racing approval of an Approved-or-later schedule returns it unchanged with 200); `ScheduleManager.withdraw` (part: losing a race returns `INVALID_STATE`); `enqueueJob` uniqueness by kind and key.
- **Depends on:** 15, 20.
- **Done when:** the listed tests pass and no previously passing test fails.
- **Status:** done.

## Slice 22: Registration system outage

- **Goal:** When MavLINK cannot be reached, the last successful sync time is shown, every result is Unverified, and Submit is rejected until a successful sync.
- **Spec sources:** FR-018, NFR-003, NFR-005; architecture §3.4.
- **Criteria:** AC-031.
- **Tests that should turn green:**
  - `sync.test.ts > AC-031 Registration system unavailable (FR-018) > AT-031-1 [main] last sync shown, results Unverified, submit blocked; nothing sent`
  - `sync.test.ts > AC-031 Registration system unavailable (FR-018) > AT-031-2 [control] after MavLINK answers again, submit succeeds`
- **Skeleton to fill in:** `RegistrationSync.syncAll` and `refreshForStudent` (outage paths); `Validator.validateSchedule` (part: `verified = false`); `ScheduleManager.getSchedule` (`lastSyncedAt`, `canSubmit`) and `submit` (part: `REGISTRATION_UNAVAILABLE`); `PostgresDataStore.recordSyncFailure`.
- **Depends on:** 13.
- **Done when:** the listed tests pass and no previously passing test fails.
- **Status:** done.

## Slice 23: Enrollment retries during an outage

- **Goal:** An enrollment that cannot reach MavLINK is retried every 15 minutes. After 24 hours from the first attempt the system stops and notifies the student and advisor.
- **Spec sources:** FR-018, NFR-004; architecture §3.4 step 3, D9.
- **Criteria:** AC-032.
- **Tests that should turn green:**
  - `enrollment.test.ts > AC-032 Enrollment queued during an outage (FR-018) > AT-032-1 [main][inside] retried every 15 minutes; both notified at 24 hours; then retries stop`
  - `enrollment.test.ts > AC-032 Enrollment queued during an outage (FR-018) > AT-032-2 [outside] no new attempt 14 minutes after the first`
  - `enrollment.test.ts > AC-032 Enrollment queued during an outage (FR-018) > AT-032-3 [control] MavLINK back after an hour: enrolled, no failure notice`
- **Skeleton to fill in:** `Enrollment.processEnrollmentJob` (parts: `RETRY_SCHEDULED`, `GAVE_UP`).
- **Depends on:** 20, 22.
- **Done when:** the listed tests pass and no previously passing test fails.
- **Status:** done.

## Slice 24: Revalidation after registration data changes

- **Goal:** When a sync finds changed sections, affected Approved schedules are returned with a system comment and never enrolled. Enrolled schedules keep their status. Both student and advisor are notified.
- **Spec sources:** FR-015; architecture §3.3, D9, D12, Spec issue 1.
- **Criteria:** AC-026, AC-027.
- **Tests that should turn green:**
  - `sync.test.ts > AC-026 Approved schedule breaks before enrollment (FR-015) > AT-026-1 [main] cancelled section returns the schedule, notifies both, never enrolls`
  - `sync.test.ts > AC-026 Approved schedule breaks before enrollment (FR-015) > AT-026-2 [control] a sync with no change keeps it Approved`
  - `sync.test.ts > AC-027 Enrolled schedule changes (FR-015) > AT-027-1 [main] stays Enrolled; both notified naming the section`
- **Skeleton to fill in:** `Revalidator.revalidate`; `ScheduleManager.systemReturn`; `RegistrationSync.syncAll` (part: pass changes to Revalidator); `Enrollment.processEnrollmentJob` (part: `CANCELLED` when no longer Approved).
- **Depends on:** 20.
- **Done when:** the listed tests pass and no previously passing test fails.
- **Status:** done.

## Slice 25: Plan regeneration after course history changes

- **Goal:** When a student's course history changes, completed courses leave the plan, and the not-yet-started terms are rebuilt while manual placements stay.
- **Spec sources:** FR-012; architecture §3.3 step 2, D13.
- **Criteria:** AC-021.
- **Tests that should turn green:**
  - `plan.test.ts > AC-021 Plan regenerates after course history changes (FR-012) > AT-021-1 [main] completed CSCI 8100 leaves the plan; manual CSCI 8200 stays`
- **Skeleton to fill in:** `Planner.regenerate`; `RegistrationSync.syncAll` (part: pass history changes to Planner).
- **Depends on:** 11, 24 (both change `syncAll`'s change handling; doing them in sequence avoids conflicting edits).
- **Done when:** the listed tests pass and no previously passing test fails.
- **Status:** done.

---

## Coverage check

- **Criteria:** AC-001 to AC-035 each appear in exactly one slice's Criteria (1: 001 · 2: 002, 003, 033 · 3: 004 · 4: 005, 006 · 5: 007 · 6: 008 · 7: 009, 019 · 8: 020 · 9: 012 · 10: 010 · 11: 011 · 12: 023 · 13: 013, 016, 022, 034 · 14: 017 · 15: 030 · 16: 014 · 17: 028 · 18: 015, 029 · 19: 018 · 20: 024, 025 · 21: 035 · 22: 031 · 23: 032 · 24: 026, 027 · 25: 021).
- **Tests:** the slices list 7 + 14 + 3 + 4 + 3 + 4 + 5 + 2 + 3 + 1 + 2 + 4 + 13 + 6 + 2 + 5 + 3 + 4 + 2 + 3 + 3 + 2 + 3 + 3 + 1 = **102**, matching the 102 failing tests. Each one appears once.
- **Dependencies:** every "Depends on" names an earlier slice. No slice depends on a later one.

### Not covered by any slice

| Item | Why |
|---|---|
| `ScheduleManager.removeSection` and `DELETE /schedules/:id/sections/:sectionId` | No test exercises them (test_plan.md G-R1). Recommend adding them to slice 2 as an untested extra once a test exists, or leaving them at 501 for now. |
| `MavlinkGateway.fetchRegistrationData`, `enrollSection` | Out of reach by design (C3: no real MavLINK API). Stays `NotImplementedError`. |
| `JobRunner.start`, `stop` | Filled in slice 8, but no test covers them. |
| X-30 (restart during retries, NFR-004) | Not automated in the suite (needs a persistent Data Store and a process restart). Can be checked by hand after slice 23. |
| Every criterion and every failing test | Assigned. None left over. |

---

## Design questions

These need a decision before the named slice. None is resolved in this plan.

1. **Test isolation and the PostgreSQL driver (blocks slice 1).** The harness builds `new PostgresDataStore(TEST_DATABASE_URL ?? 'postgres://localhost:5432/course_planner_test')` for **every** test, with no reset step. Vitest runs test files in parallel. The registration snapshot, schedules and notifications are global rows, so tests would see each other's data. For example, `Notifications(adv-2)` must be empty in AT-013-1, X-20 expects an empty dashboard, and AT-008-1 seeds a hold that other tests must not see. Also, `package.json` has no PostgreSQL driver (`pg`), and the `course_planner_test` database does not exist yet. Options:
   - (a) `PostgresDataStore` creates its own schema per instance, and drops nothing. This isolates tests without changing them. But a production restart would start in a new, empty schema, which breaks NFR-004, unless the schema name is fixed outside tests.
   - (b) Add an in-memory `DataStore` and point the harness at it. This is fast and isolated, but it adds a module that architecture.md does not list and changes a test helper.
   - (c) Use one shared schema and run with `fileParallelism: false`. This is simplest, but tests would still leak into each other, so many would fail for reasons unrelated to their rule.
2. **What does the first `syncAll` report?** With no previous snapshot, is every section "changed"? If so, the first sync calls `Revalidator.revalidate` and `Planner.regenerate` for every student (both are later slices). Recommend: the first sync sets a baseline and reports no changes (D6 compares against a snapshot that does not exist yet).
3. **Does `refreshForStudent` count as a "successful sync"?** AT-031-2 expects Submit to succeed right after MavLINK returns, with only the per-student refresh in between. AT-015-1 submits a day after the last full sync. So `canSubmit` and `verified` must follow "the last MavLINK call succeeded", not "the data is under 60 minutes old" (NFR-003). But if a refresh moves `lastSuccessfulSyncAt`, the hourly full sync (AC-020) would keep being pushed back while students are active. Recommend: track availability from every call, but set `lastSuccessfulSyncAt` only from `syncAll`.
4. **Should `refreshForStudent` pass changes to Revalidator?** Architecture §3.3 step 1 says a refresh also triggers revalidation. contracts.md does not say this. If a refresh updates the snapshot quietly, the next `syncAll` sees no difference, so an Approved schedule whose section was cancelled would never be returned (FR-015). No test covers this.
5. **Credit limit: which sections are flagged?** AC-007 says "the new section". Recommend: flag every section whose running total, in schedule order, goes above the limit. Equal to the limit passes (AT-007-2).
6. **"Full" seat rule (G-2).** Is a section with 0 seats but status OPEN `SECTION_FULL`? AC-019 changes both values. Recommend: use the status only, since MavLINK is the system of record.
7. **Plan generation range.** Should the generator use only terms in the snapshot (FA27 to SP29), or create later terms (the test accepts FA29 onward)? What happens when no plan fits (architecture Spec issue 8)? Recommend: snapshot terms only, and place what fits.
8. **Offering-pattern flag in a plan (G-9).** `validatePlan` is supposed to flag offering-pattern violations, but `ReasonCode` has no code for this. Adding one would add a field the contracts do not list. Recommend: do not flag offering pattern until the spec adds a code.
9. **Classification when the student has no stored plan.** Classifier reads the plan from the Data Store and cannot generate one, because it may not call Planner. Recommend: no plan means every course is `COURSE_NOT_IN_PLAN`.
10. **Submitting with a Flag and no Exception Request (Spec issue 2, G-7).** contracts.md has no error code for this, so the plan assumes it is allowed and classified Needs Review.

## Test issues

No test was changed.

1. **Shared database state (all tests).** See Design question 1. As written, the harness cannot give each test a clean database, so tests that assert "empty" (AT-013-1 `adv-2`, X-04, X-20, AT-026-2, AT-031-1) depend on running alone. This is a harness problem, not an error in any one test.
2. **X-29 vs. the precedence rule.** contracts.md's precedence says visibility (404) comes before permission (403). For stu-a on stu-b's schedule, that would give 404. X-29 expects 403, because the route checks `requireAdvisor` first, and the error table says a student calling an advisor route gets 403. Both rules are in contracts.md. The test follows the route rule, which is consistent, but the precedence text should say it applies after the route's role check.
3. **AT-024-1, plan after enrollment.** It expects FA27 to hold exactly the enrolled courses. If the generated plan had electives in FA27, `applyEnrollment` drops them, and FR-014 does not say whether the dropped courses are re-planned. The test does not check, so this is not a failure. It is an open spec point.
4. **Control tests that pass early.** AT-004-3, AT-006-1, AT-006-3, AT-007-2, X-25, AT-008-2, AT-019-2 and AT-009-1 can turn green before their rule exists. They catch over-flagging, not missing rules. That is fine, but it should not be mistaken for progress.

## Review of this plan

- **Backlog-sized:** every slice is one user-visible behavior or one rule, with its own tests and a short list of functions. Slices 1, 13 and 20 are the largest. Slice 1 is large because the Data Store and sync have to exist before anything can run.
- **Subtle rules isolated:** time-conflict boundaries (3), in-progress prerequisites (4), the credit limit (5), concurrency (16, 21), retry timing (23) and revalidation (24) each have their own slice.
- **Interacting rules adjacent:** validation rules 3 to 7. Submit, return and withdraw, then one-active-submission (13 to 16). Enrollment, then at-most-once (20, 21). Outage, then retries (22, 23). Revalidation, then regeneration (24, 25), which both extend `syncAll`.

**Next action:** Slice 1, "Walking skeleton, identity and catalog search". First, resolve Design question 1. Then make `search.test.ts > AC-001 Search with combined filters (FR-001) > AT-001-1 [main][inside][outside] Core, FA27, starting at or after 17:00` pass.
