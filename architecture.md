# Architecture: UNO Course Registration and Planning Application

Section references (FR-, NFR-, AC-) point to [`spec.md`](spec.md).

## 1. Overview

The Course Planner is one web application. A browser client talks to one server process, and the server keeps its own copy of registration data in a single PostgreSQL database. The server is split into modules that check schedules, generate plans, run advisor review, and handle enrollment. Only one module talks to the University Registration System (MavLINK). Background work like the hourly sync, enrollment retries, and email runs in the same process off a job table in the database, so the system has no separate services or message brokers.

```
 Browser (Web Client)
        │ HTTPS / JSON
        ▼
 ┌──────────────────────── Server process ────────────────────────┐
 │ API ─► Access Control                                          │
 │  │                                                             │
 │  ├─► Catalog Search      ├─► Schedule Manager ─► Validator      │
 │  ├─► Planner ─► Degree Audit          │         Classifier      │
 │  ├─► Review Queue                     ├─► Enrollment            │
 │                                       └─► Notifier              │
 │ Job Runner ─► Registration Sync ─► Revalidator                  │
 │                    │                    Enrollment ─┐           │
 │                    ▼                                ▼           │
 │             Registration Gateway ◄──────────────────┘           │
 └───────────────────────┬───────────────────────────┬────────────┘
                         ▼                           ▼
                   PostgreSQL               MavLINK (or simulator)
```

## 2. Modules

"May depend on" lists the only modules each one is allowed to call. The dependency graph has no cycles.

| Module | Responsibility | May depend on | Needed by |
|---|---|---|---|
| **Web Client** | Render the screens (search, weekly calendar and list view, plan of study, degree progress, advisor dashboard, side-by-side review) and send user actions to the API. | API | FR-001 to FR-009, FR-016, FR-017; NFR-008 |
| **API** | Turn HTTP requests into calls on server modules, after taking the user identity from the single sign-on session. | Access Control, Registration Sync (on-open refresh), Catalog Search, Schedule Manager, Planner, Degree Audit, Review Queue, Notifier | All user-facing FRs |
| **Access Control** | Decide whether a user may perform a given action (view, edit, submit, withdraw, approve, return) on a given student's data, using the student ID and advisor assignments in the registration snapshot. Approve and Return are advisor-only actions. | Data Store | FR-019; NFR-001 |
| **Catalog Search** | Find course sections in the snapshot by requirement category, term, and meeting day and time. | Data Store | FR-001 |
| **Schedule Manager** | Own Draft Schedule contents (sections, Exception Requests) and apply every status transition, recording each one in the schedule history. | Validator, Classifier, Notifier, Data Store | FR-002, FR-006, FR-008, FR-015 (Approved to Returned), FR-016, FR-017; NFR-002, NFR-007 |
| **Validator** | Produce a Pass or Flag result with reason codes for each section of a schedule or plan, using snapshot data. Pure function, no side effects. | Data Store (read only) | FR-003, FR-011, FR-012 (plan flags in AC-011) |
| **Classifier** | Label a submitted schedule Routine or Needs Review from its Validation Results, Exception Requests, and plan of study. | Data Store (read only) | FR-013 |
| **Degree Audit** | Compute Degree Progress (Complete, In Progress, Remaining) per Degree Requirement from course history. | Data Store (read only) | FR-005; input to FR-012 |
| **Planner** | Generate, store, and regenerate the term-by-term Plan of Study, keeping manually placed courses. | Degree Audit, Validator, Data Store | FR-004, FR-012, FR-014 (plan update) |
| **Review Queue** | List an advisor's Submitted schedules in the required order and assemble the side-by-side review view. | Data Store (read only) | FR-007, FR-009 |
| **Registration Sync** | Copy registration data from MavLINK into the snapshot, record the last successful sync time, and report which sections, holds, or course histories changed. | Registration Gateway, Revalidator, Planner, Data Store | FR-010, FR-018 (last-sync time, Unverified); NFR-003 |
| **Revalidator** | When Sync reports changes, re-check affected Submitted, Approved, and Enrolled schedules for the current and next Term and ask Schedule Manager to act on failures. | Validator, Classifier, Schedule Manager, Notifier, Data Store | FR-015 |
| **Enrollment** | Send each approved schedule's sections to MavLINK at most once, retry during outages, and record Enrollment Records. | Registration Gateway, Schedule Manager, Planner, Notifier, Data Store | FR-014, FR-018 (retry), FR-020; NFR-004 |
| **Notifier** | Store in-app Notifications and send the matching email through the university mail service. | Data Store | FR-006, FR-014, FR-015, FR-018; NFR-009 |
| **Job Runner** | Run timed jobs from a job table in the database: hourly sync during registration windows, enrollment retries, and email sending. | Registration Sync, Enrollment, Notifier, Data Store | FR-010 (hourly), FR-018 (15-minute retry); NFR-004 |
| **Registration Gateway** | The only code that calls MavLINK. Translates its data and errors into the domain model. Comes in two versions, real and simulated. | none (external system) | FR-010, FR-014, FR-018; NFR-010 |
| **Data Store** | PostgreSQL schema and transactions for the snapshot, schedules, plans, history, jobs, and notifications. | none | All persisted objects in the Domain Model; NFR-002, NFR-004, NFR-007 |

To keep the graph free of cycles, Schedule Manager does not call Enrollment. On approval, it inserts an enrollment job row in the same transaction (D9). Enrollment picks up the job later and calls Schedule Manager to record the result.

## 3. Request flow

### 3.1 Primary scenario: submit, classify, approve, enroll (FR-006, FR-013, FR-008, FR-014, FR-020; AC-013, AC-022, AC-016, AC-024)

1. Student selects **Submit** on a Draft schedule. Web Client sends `POST /schedules/{id}/submit`.
2. API takes the student ID from the SSO session. Access Control confirms the schedule belongs to that student (FR-019).
3. Schedule Manager checks the snapshot's last successful sync time. If the registration system is marked unavailable, the request is rejected (FR-018, AC-031).
4. Schedule Manager asks Validator for fresh results and stores them with the snapshot time (NFR-003).
5. In one database transaction, Schedule Manager changes the status from Draft or Returned to Submitted, only if the current status still allows it and no other schedule for that student and Term is Submitted or later. A unique constraint enforces this (AC-014, NFR-002). The transition is written to schedule history (NFR-007).
6. In the same transaction, Classifier labels the schedule Routine or Needs Review and the label is stored with its reasons (FR-013, AC-022, AC-023).
7. Notifier stores an in-app Notification for the assigned advisor and queues the email job (AC-013).
8. The advisor opens the dashboard. Review Queue lists Needs Review first, oldest first, then Routine (AC-015). Opening the schedule shows the review view with plan and history (AC-018).
9. Advisor selects **Approve**. Access Control confirms the advisor is assigned to the student in the current snapshot (AC-034).
10. In one transaction, Schedule Manager changes Submitted to Approved only if the status is still Submitted, records the Advisor Decision with its timestamp, and inserts one enrollment job keyed by schedule ID. A unique key means a second approval inserts nothing and changes nothing (FR-020, AC-035).
11. Notifier tells the student it was approved (AC-013).
12. Job Runner picks up the enrollment job. Enrollment first confirms the schedule is still Approved and cancels the job if it is not, for example because Revalidator returned it (AC-026). It then sends each section that does not already have an Enrolled record through Registration Gateway (NFR-004).
13. Enrollment saves one Enrollment Record per section, then asks Schedule Manager to set Enrolled or Partially Enrolled (AC-024, AC-025).
14. Planner updates the Term in the plan of study to match the enrolled courses (FR-014).
15. Notifier tells the student the result, and also the advisor if any section failed (AC-025).

### 3.2 Add a section and see flags (FR-002, FR-003, FR-011; AC-003 to AC-009, AC-019)

1. Student adds a section on the calendar. Web Client sends `POST /schedules/{id}/sections`.
2. Access Control checks ownership. Schedule Manager rejects the edit unless the status is Draft or Returned.
3. API asks Registration Sync to refresh the sections, holds, and course history this student's schedule uses, through Registration Gateway (FR-010, "whenever a student opens or edits"). If MavLINK does not answer within a short timeout, the snapshot is used as is and results are marked Unverified (FR-018).
4. Validator returns results for every section, since one new section can create a conflict on an existing one (AC-004).
5. Schedule Manager saves the section and results. API returns them, and Web Client redraws the flags without a page reload (AC-004, NFR-006).

### 3.3 Registration data changes (FR-015; AC-026, AC-027)

1. Job Runner starts the hourly sync, or a refresh happens during 3.2.
2. Registration Sync compares new data with the snapshot and passes the changed section IDs, holds, and course histories to Revalidator. Course-history changes also go to Planner (FR-012, AC-021).
3. Revalidator finds Submitted, Approved, and Enrolled schedules for the current and next Term that use those sections or belong to those students, and runs Validator on each.
4. For each failing schedule: Approved and not yet sent becomes Returned with a system comment through Schedule Manager (AC-026). Submitted is reclassified by Classifier (see Spec issue 1). Enrolled keeps its status (AC-027). Notifier tells the student and advisor in every case.

### 3.4 Registration system outage (FR-018; AC-031, AC-032)

1. Registration Gateway reports a timeout or error. Registration Sync records the outage and keeps the last successful sync time.
2. Every read of Validation Results compares their data time with the last sync and outage state and returns them as Unverified. Schedule Manager rejects Submit (AC-031).
3. Approvals are still accepted (AC-032). Enrollment reschedules its job for 15 minutes later. After 24 hours from the first attempt, it stops and Notifier tells the student and advisor.

## 4. Design decisions

| # | Decision | Reason |
|---|---|---|
| D1 | The application does not handle passwords or log-ins. It trusts the user ID from UNO single sign-on and decides **role and scope** from MavLINK data: a user is an advisor for exactly the students MavLINK assigns to them. | Description (SSO out of scope); FR-019 requires advisor scope to come "from the University Registration System". |
| D2 | All authorization happens on the server in Access Control, called by API before any module runs. The client never hides data as a security measure. | FR-019, AC-033, AC-034, NFR-001. |
| D3 | One deployable server (modular monolith) plus one PostgreSQL database. No microservices, message broker, or cache server. | Preference, supported by the simplest-design rule and solo-developer constraint. No requirement needs independent scaling. NFR-005's 500 users fit one process. |
| D4 | The server keeps a local **snapshot** of MavLINK data with a sync timestamp, and validation runs against it. | FR-015 needs the previous data to detect what changed. FR-018 needs "last successful sync" and must keep working during outages. Validation Result must record the data time (NFR-003). |
| D5 | Refresh the snapshot hourly during a Term's registration window, and refresh just the student's own data when they open or edit a schedule. Outside registration windows, sync once a day. | FR-010, AC-019, AC-020. The daily rate outside windows is a **preference** (see Spec issue 4). |
| D6 | Changes are detected by comparing each sync with the snapshot (polling), not by MavLINK pushing events. | Preference. The spec says nothing about MavLINK offering events, and polling is already required by FR-010. |
| D7 | All validation runs on the server. The client only displays results. | Classification (FR-013) and submission blocking (FR-018) depend on results that the student cannot be allowed to change (NFR-001, NFR-002). AC-004 only requires no page reload, which an API call covers. |
| D8 | Status transitions are conditional updates inside a database transaction (`... WHERE status = expected`). A partial unique index allows one Submitted-or-later schedule per student per Term. | Allowed transitions in Draft Schedule; AC-014, AC-029, AC-030, AC-035; NFR-002. |
| D9 | Enrollment is a row in a job table, created in the same transaction as approval and unique per schedule. Before every attempt, including retries, Enrollment checks that the schedule is still Approved. Retries re-send only sections without an Enrolled record. | FR-020, AC-035, FR-018 (15-minute retry, 24 hours), FR-015 and AC-026 (a returned schedule must not be enrolled), NFR-004. |
| D10 | Background work (hourly sync, retries, email) runs in the server process from a database job table, instead of a separate queue service. | NFR-004 (jobs survive restart because they live in the database); D3 simplicity. |
| D11 | In-app Notifications are rows the client loads when a page opens and checks every 30 seconds. Email goes through the university mail service. There are no push channels or WebSockets. | Notification object (in-app plus university email). The 30-second interval keeps NFR-009's 1-minute target. |
| D12 | Classification is stored when a schedule is submitted and recomputed only when Revalidator finds a change. | FR-013 (every Submitted schedule has one); AC-015 needs it for ordering. Recomputing on change is a **preference** that resolves Spec issue 1. |
| D13 | The plan generator places remaining courses in order of their prerequisites (a topological sort), choosing the earliest future Term that matches each course's offering pattern without going over the Program credit limit. Manually placed courses are fixed inputs. | FR-012, AC-010, AC-021. The specific greedy method is a **preference**; any method that meets AC-010 is acceptable. |
| D14 | All times are stored in UTC and shown in America/Chicago. Retry timing, the 24-hour cutoff, and registration windows are calculated in UTC. | AC-031 shows clock times. FR-018 and FR-010 depend on time intervals. The time zone choice is a **preference** based on UNO's location. |
| D15 | Registration Gateway has a simulated version used for development, testing, and the course demo. | NFR-010; Constraint C3 (no access to the real MavLINK API). |

## 5. Constraints and known limits

### Implementation constraints (mine)

- **C1 Language and framework:** TypeScript throughout. React for the Web Client, Node.js with Express for the server, PostgreSQL for storage.
- **C2 Free resources only:** a free-tier host for the server and database, and no paid services.
- **C3 No real MavLINK access:** the University does not offer students a PeopleSoft API, so the Registration Gateway runs against a simulator with seeded catalog, seat, hold, and course-history data.
- **C4 Solo developer, one semester:** this favors one codebase, one deployable, and one database (D3).
- **C5 Identity from UNO SSO:** the app receives an authenticated user ID and does not store credentials (Description).

### Where the spec's time, identity, concurrency, and error rules are enforced

| Concern | Enforced in |
|---|---|
| Time: data freshness, hourly sync, 15-minute retry, 24-hour cutoff | Registration Sync (last-sync time), Job Runner (schedule), Enrollment (cutoff), D14 |
| Identity and scope | API (reads SSO identity), Access Control (every request), D1, D2 |
| Concurrency: one active submission, single enrollment, withdraw against approve | Schedule Manager transactions and Data Store constraints, D8, D9 |
| Errors: MavLINK outage, section enrollment failure | Registration Gateway (translates errors), Registration Sync (outage state), Enrollment (per-section records and retry) |

### What this design does not handle, and what would change

- **Scale.** One server process and one database are sized for one university during a registration window (NFR-005). If several universities or many more concurrent users were needed, the snapshot reads would need a cache or read replicas, and the Job Runner would need to move to a separate worker.
- **Freshness.** A seat can still fill between the last refresh and the enrollment call. The design treats MavLINK's answer at enrollment as final (Partially Enrolled), as AC-025 already expects. Real-time seat accuracy would need MavLINK to push events, which would replace D6.
- **Advisor changes in the middle of a review.** Access is checked against the current snapshot, so a reassigned advisor loses access on the next sync. Nothing moves the schedule to the new advisor's dashboard beyond what Review Queue shows on its next load (see Spec issue 6).
- **Plan generation quality.** D13 finds *a* valid plan, not the best one. It does not balance workload across terms or account for student preferences. Better plans would need a constraint solver inside Planner, with no change to other modules.
- **Notifications** are best-effort email. There is no SMS, push notification, or delivery confirmation.
- **Real MavLINK integration** would only replace the Registration Gateway's real version (NFR-010). The format of the data and errors would need to be confirmed with the University.

## 6. Out of scope

Copied from the spec's Non-goals section:

- Authentication and credential storage. UNO single sign-on handles these.
- Editing course, section, seat, hold, or advisor-assignment data. The University Registration System is the system of record.
- Department or Program Manager features, including editing Programs or Degree Requirements.
- Registering students for courses without an advisor's approval.
- Waitlists, tuition, billing, and financial aid.
- Native mobile apps. The web application only needs to work in a mobile browser.

## Spec issues

Problems I found while designing. I did not resolve these silently. Where the design had to pick something to proceed, the decision is noted.

1. **A Submitted schedule that fails revalidation.** FR-015 re-checks Submitted schedules and says what happens to Approved ones (Returned), but not Submitted ones. The design reclassifies them as Needs Review and notifies both parties (D12). The spec should say this.
2. **Submitting with flags but no Exception Request.** AC-023 lists "has a section with any Flag" and "includes an Exception Request" as separate conditions, which implies flagged schedules can be submitted without an exception. review-notes.md says flags are submitted "through an Exception Request". The spec should say whether an unexplained Flag blocks submission.
3. **No way out of Partially Enrolled.** No allowed transition leaves Partially Enrolled, and FR-014 does not say whether the plan update covers failed sections. Can the student replace the failed section and resubmit?
4. **Sync outside registration windows.** FR-010 sets a rate only during registration windows. FR-015 still expects changes (for example, a cancelled section) to be noticed for the current and next Term at any time. D5 picks once a day.
5. **Approving Unverified results.** FR-018 blocks new submissions during an outage, and AC-032 allows approval. The spec does not say whether the advisor is warned that the results they are approving are Unverified.
6. **Advisor reassignment.** If MavLINK changes a student's advisor while a schedule is Submitted, the spec does not say whether it moves to the new advisor or is Returned.
7. **Other drafts after enrollment.** The spec does not say what happens to a student's other Draft schedules for a Term once one is Enrolled (kept, archived, or deleted).
8. **No feasible plan.** FR-012 and AC-010 assume a plan always exists. They do not cover a case where offering patterns, prerequisites, and the credit limit cannot fit the remaining requirements before the expected graduation date. The spec also never defines a target graduation date.
9. **Ordering within Routine.** AC-015 orders Needs Review schedules oldest first but does not order multiple Routine schedules. The design uses oldest first for both groups.
