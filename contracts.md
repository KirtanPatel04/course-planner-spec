# Contracts: UNO Course Registration and Planning Application

The calling interfaces that the tests run against. Section references (FR-, NFR-, AC-) point to [`spec.md`](spec.md); module names and dependencies follow [`architecture.md`](architecture.md) §2. The skeleton in `src/` implements exactly these signatures. Every body throws `NotImplementedError`, and every REST route answers HTTP 501.

**Stack (architecture C1):** TypeScript, Node.js 20+, Express 4, PostgreSQL. Tests use Vitest and supertest.

## 0. Conventions

| Item | Contract |
|---|---|
| Identity | The UNO SSO proxy puts the authenticated user ID in the `X-User-Id` request header (D1, C5). The server never handles passwords. Role and scope come from MavLINK data (a user is an advisor for exactly the students assigned to them). |
| Error body | Every failure returns `{ "error": "<CODE>", "message": "<text>" }`. A message never contains another student's data (NFR-001). |
| Not implemented | Until implemented, every route returns `501 { "error": "not_implemented", "message": "<METHOD> <path> → <function> is not implemented ..." }`. |
| Times | Instants are ISO-8601 strings in UTC (`2027-07-15T19:00:00.000Z`); the Web Client shows them in America/Chicago (D14). Meeting times are Chicago wall-clock `"HH:MM"`. |
| IDs | Term `"FA27"`, course `"CSCI 8000"`, section `"CSCI8000-001"`, requirement `"CORE"`, weekday `"MON"`…`"SUN"`. Statuses and codes are UPPER_SNAKE_CASE (`DRAFT`, `NEEDS_REVIEW`, `TIME_CONFLICT`). |
| Injected | Every module gets its dependencies through its constructor, in the order of the architecture's "May depend on" column (`src/container.ts`). Things outside the process are injected so tests can replace them: **DataStore** (PostgreSQL), **RegistrationGateway** (MavLINK or the simulator), **MailService** (university mail), **Clock** (`now()`). |

### Error codes

| Code | HTTP | Meaning |
|---|---|---|
| `UNAUTHENTICATED` | 401 | No `X-User-Id`, or the ID is neither a student nor an advisor in MavLINK. |
| `FORBIDDEN` | 403 | The user may see the data but may not perform this action (student S approving their own schedule, AC-034; a student calling an advisor route). |
| `NOT_FOUND` | 404 | The resource does not exist **or** belongs to a student the user may not see. Both cases get the same response with the same generic message, so a request cannot reveal that another student's schedule exists (AC-033, NFR-001). |
| `INVALID_INPUT` | 400 | Missing or unknown term, section, course, requirement, reason code; malformed time or day. |
| `SECTION_TERM_MISMATCH` | 400 | The section is not offered in the schedule's Term (a Draft Schedule is for one Term). |
| `COMMENT_REQUIRED` | 400 | Return without a comment (AC-017). |
| `JUSTIFICATION_REQUIRED` | 400 | Exception Request without a justification (AC-028). |
| `INVALID_STATE` | 409 | The schedule's status does not allow this transition or edit (Draft Schedule transitions; AC-030). |
| `ACTIVE_SUBMISSION_EXISTS` | 409 | Another schedule for the same Term is Submitted, Approved, Enrolled, or Partially Enrolled (AC-014). The message tells the student to withdraw the other schedule. |
| `REGISTRATION_UNAVAILABLE` | 503 | Submit is blocked until a successful sync with MavLINK (FR-018, AC-031). |

**Precedence:** identity (401) → visibility (404) → permission (403) → input (400) → state (409, 503). An unassigned advisor approving a Draft schedule therefore gets 404, not 409, so the response does not reveal the schedule's state.

## 1. Module functions

Types are in `src/domain/types.ts`. "Fails with" lists `DomainError` codes; functions never throw for a MavLINK outage unless stated.

### Access Control — `src/modules/accessControl.ts`
Injected: DataStore.

| Signature | Success result | Fails with | Spec rule |
|---|---|---|---|
| `resolveActor(userId: string \| undefined): Promise<Actor>` | `{ kind: 'STUDENT', id }` or `{ kind: 'ADVISOR', id }` | `UNAUTHENTICATED` | Description (SSO), D1 |
| `requireStudent(actor: Actor): Promise<StudentId>` | the student's own ID | `FORBIDDEN` if not a student | FR-019 (own data only) |
| `requireAdvisor(actor: Actor): Promise<AdvisorId>` | the advisor's ID | `FORBIDDEN` if not an advisor | FR-007, FR-009 |
| `authorizeSchedule(actor: Actor, action: Action, scheduleId: ScheduleId): Promise<StudentId>` | the owner's student ID. Students may `VIEW`, `EDIT`, `SUBMIT`, `WITHDRAW` their own; advisors may `VIEW`, `APPROVE`, `RETURN` for assigned students. | `NOT_FOUND` (missing or not visible), `FORBIDDEN` (visible, action not allowed) | FR-019, AC-033, AC-034, NFR-001, D2 |

### Catalog Search — `src/modules/catalogSearch.ts`
Injected: DataStore.

| Signature | Success result | Fails with | Spec rule |
|---|---|---|---|
| `searchSections(studentId, query: { term, requirementId?, startsAtOrAfter?, day? }): Promise<SectionSearchResult[]>` | Sections in `term` whose course satisfies the requirement in the student's Program, starting at or after the time, meeting on the day. Each result: `sectionId, courseId, title, creditHours, meetings, seatsAvailable, status`. Empty list when nothing matches. | `INVALID_INPUT` (unknown term or requirement, malformed time or day) | FR-001, AC-001, AC-002 |

### Schedule Manager — `src/modules/scheduleManager.ts`
Injected: Validator, Classifier, Notifier, DataStore, Clock. Every status change is a conditional update in one transaction and is written to the schedule history with the actor and time (D8, NFR-002, NFR-007).

| Signature | Success result | Fails with | Spec rule |
|---|---|---|---|
| `createDraft(studentId, term, name?): Promise<ScheduleView>` | New `DRAFT` with no sections | `INVALID_INPUT` (unknown term) | FR-002; Draft Schedule (several drafts per Term) |
| `listSchedules(studentId, term?): Promise<ScheduleSummary[]>` | `{ id, term, name, status }` per schedule | — | FR-002 |
| `getSchedule(scheduleId): Promise<ScheduleView>` | Status, sections, `totalCreditHours`, one `ValidationResult` per section (with `dataAsOf` and `verified`), exception requests, classification, `returnComment`, enrollment records, `history`, `lastSyncedAt`, `canSubmit` | `NOT_FOUND` | FR-003, FR-011, FR-018, NFR-003, NFR-007 |
| `addSection(scheduleId, sectionId): Promise<ScheduleView>` | Schedule with the section added and results for **every** section. Flagged sections are still added. | `INVALID_INPUT` (unknown or duplicate section), `SECTION_TERM_MISMATCH`, `INVALID_STATE` (not Draft or Returned) | FR-002, FR-003, AC-003, AC-004 |
| `removeSection(scheduleId, sectionId): Promise<ScheduleView>` | Schedule without the section, revalidated | `INVALID_INPUT` (not in schedule), `INVALID_STATE` | FR-002, NFR-006 |
| `requestException(scheduleId, sectionId, reasonCode, justification): Promise<ScheduleView>` | Schedule with the Exception Request attached to the section | `JUSTIFICATION_REQUIRED`, `INVALID_INPUT` (section not in schedule or not flagged with `reasonCode`), `INVALID_STATE` | FR-016, AC-028 |
| `submit(scheduleId, actor): Promise<ScheduleView>` | `SUBMITTED`, revalidated, classified, advisor notified (`SCHEDULE_SUBMITTED`) | `REGISTRATION_UNAVAILABLE`, `ACTIVE_SUBMISSION_EXISTS`, `INVALID_STATE` | FR-006, FR-013, FR-018, AC-013, AC-014, AC-031 |
| `withdraw(scheduleId, actor): Promise<ScheduleView>` | `SUBMITTED` → `DRAFT` | `INVALID_STATE` (any other status, including after a racing approval) | FR-017, AC-029, AC-030, NFR-002 |
| `approve(scheduleId, actor): Promise<ScheduleView>` | `SUBMITTED` → `APPROVED`; Advisor Decision recorded; one enrollment job keyed by schedule ID; student notified (`SCHEDULE_APPROVED`). Repeated approval of an Approved-or-later schedule changes nothing and returns the schedule. | `INVALID_STATE` (Draft, Returned) | FR-008, FR-020, AC-016, AC-035, D9 |
| `returnSchedule(scheduleId, comment, actor): Promise<ScheduleView>` | `SUBMITTED` → `RETURNED` with comment; student notified (`SCHEDULE_RETURNED`) | `COMMENT_REQUIRED`, `INVALID_STATE` | FR-008, AC-017 |
| `systemReturn(scheduleId, comment): Promise<boolean>` | `APPROVED` → `RETURNED` with a system comment; `false` and no change if no longer Approved | — | FR-015, AC-026 |
| `recordEnrollmentOutcome(scheduleId, status: 'ENROLLED' \| 'PARTIALLY_ENROLLED'): Promise<void>` | Status set | `INVALID_STATE` (not Approved) | FR-014 |

### Validator — `src/modules/validator.ts`
Injected: DataStore (read only). No side effects.

| Signature | Success result | Fails with | Spec rule |
|---|---|---|---|
| `validateSchedule({ studentId, term, sectionIds }): Promise<ValidationResult[]>` | One result per section, in order: `PASS`, or `FLAG` with reason codes `TIME_CONFLICT` (both sections), `MISSING_PREREQUISITE`, `MISSING_COREQUISITE`, `CREDIT_LIMIT_EXCEEDED`, `BLOCKING_HOLD` (with `holdType`), `SECTION_FULL`, `SECTION_CANCELLED`; each flag names related courses or sections. Each result has `dataAsOf` and `verified` (false during an outage). | never for flagged input | FR-003, FR-011, AC-004 – AC-009, AC-019, NFR-003 |
| `validatePlan(plan: PlanOfStudy): Promise<PlanOfStudy>` | Copy of the plan with flags on planned courses (prerequisite order, offering pattern, credit limit) | — | FR-012, AC-011 |

### Classifier — `src/modules/classifier.ts`
Injected: DataStore (read only, for the plan of study).

| Signature | Success result | Fails with | Spec rule |
|---|---|---|---|
| `classify({ studentId, term, sectionIds, validationResults, exceptionRequests }): Promise<SubmissionClassification>` | `ROUTINE` with no reasons, or `NEEDS_REVIEW` with one reason per failed condition: `SECTION_FLAGGED`, `EXCEPTION_REQUESTED`, `COURSE_NOT_IN_PLAN` | — | FR-013, AC-022, AC-023, D12 |

### Degree Audit — `src/modules/degreeAudit.ts`
Injected: DataStore (read only).

| Signature | Success result | Fails with | Spec rule |
|---|---|---|---|
| `getDegreeProgress(studentId): Promise<DegreeProgress>` | Per requirement: `status` (`COMPLETE`, `IN_PROGRESS`, `REMAINING`), credit hours required/completed/in progress, completed and in-progress course lists | `NOT_FOUND` | FR-005, AC-012 |

### Planner — `src/modules/planner.ts`
Injected: DegreeAudit, Validator, DataStore, Clock.

| Signature | Success result | Fails with | Spec rule |
|---|---|---|---|
| `getPlan(studentId): Promise<PlanOfStudy>` | Stored plan; generated and saved first if none exists. Covers every remaining requirement, respects offering patterns, prerequisite order, credit limit. | — | FR-004, FR-012, AC-010, D13 |
| `moveCourse(studentId, courseId, toTerm): Promise<PlanOfStudy>` | Course moved and marked `MANUAL`; always saved, flagged if it breaks prerequisite order | `INVALID_INPUT` (course not in plan, unknown term) | FR-004, AC-011 |
| `regenerate(studentId): Promise<PlanOfStudy>` | Not-yet-started terms rebuilt; completed courses removed; `MANUAL` courses kept unless invalid | — | FR-012, AC-021 |
| `applyEnrollment(studentId, term, enrolledCourseIds): Promise<PlanOfStudy>` | Plan for `term` equals the enrolled courses | — | FR-014, AC-024 |

### Review Queue — `src/modules/reviewQueue.ts`
Injected: DataStore (read only).

| Signature | Success result | Fails with | Spec rule |
|---|---|---|---|
| `getDashboard(advisorId): Promise<DashboardEntry[]>` | The advisor's `SUBMITTED` schedules: `NEEDS_REVIEW` first, then `ROUTINE`, oldest submission first in each group; each with its classification reasons | — | FR-007, AC-015, AC-029 |
| `getReviewView(scheduleId): Promise<ReviewView>` | `{ schedule, planForTerm, courseHistory, highlightedCourseIds }` | `NOT_FOUND` | FR-009, AC-018 |

### Registration Sync — `src/modules/registrationSync.ts`
Injected: RegistrationGateway, Revalidator, Planner, DataStore, Clock.

| Signature | Success result | Fails with | Spec rule |
|---|---|---|---|
| `syncAll(): Promise<SyncReport>` | Snapshot replaced; `{ succeeded, syncedAt, changedSectionIds, changedHoldStudentIds, changedHistoryStudentIds }`; changes passed to Revalidator and history changes to Planner. On an outage: `succeeded: false`, last successful sync time kept. | never throws for an outage | FR-010, FR-015, FR-018, AC-020, D4, D6 |
| `refreshForStudent(studentId): Promise<SyncStatus>` | The student's sections, holds, and history refreshed; on an outage the snapshot is used as is | never throws for an outage | FR-010, AC-019 |
| `getSyncStatus(): Promise<SyncStatus>` | `{ lastSuccessfulSyncAt, available }` | — | FR-018, AC-031 |

### Revalidator — `src/modules/revalidator.ts`
Injected: Validator, Classifier, ScheduleManager, Notifier, DataStore, Clock.

| Signature | Success result | Fails with | Spec rule |
|---|---|---|---|
| `revalidate(report: SyncReport): Promise<RevalidationOutcome[]>` | For each affected Submitted/Approved/Enrolled schedule of the current and next Term that no longer passes: Approved → `RETURNED` (system comment naming the section), Submitted → `RECLASSIFIED` (Spec issue 1), Enrolled → `NOTIFIED`; student and advisor notified (`REVALIDATION_FAILURE`) | — | FR-015, AC-026, AC-027 |

### Enrollment — `src/modules/enrollment.ts`
Injected: RegistrationGateway, ScheduleManager, Planner, Notifier, DataStore, Clock.

| Signature | Success result | Fails with | Spec rule |
|---|---|---|---|
| `processEnrollmentJob(job: Job): Promise<EnrollmentJobOutcome>` | `CANCELLED` if no longer Approved; `COMPLETED` after one Enrollment Record per section (only sections without an `ENROLLED` record are sent), status `ENROLLED`/`PARTIALLY_ENROLLED`, plan updated, student notified (and advisor if any failed); `RETRY_SCHEDULED` 15 minutes later during an outage; `GAVE_UP` with notifications once 24 hours have passed since the first attempt | never throws for an outage | FR-014, FR-018, FR-020, AC-024, AC-025, AC-032, NFR-004, D9 |

### Notifier — `src/modules/notifier.ts`
Injected: DataStore, MailService, Clock.

| Signature | Success result | Fails with | Spec rule |
|---|---|---|---|
| `notify(recipientId, event, scheduleId, message): Promise<Notification>` | Stored in-app notification; email queued | — | FR-006, FR-014, FR-015, FR-018 |
| `listNotifications(userId): Promise<Notification[]>` | The user's own notifications, newest first | — | FR-006, NFR-001 |
| `sendPendingEmails(): Promise<number>` | Number of emails handed to MailService | — | Notification object, NFR-009 |

### Job Runner — `src/modules/jobRunner.ts`
Injected: RegistrationSync, Enrollment, Notifier, DataStore, Clock.

| Signature | Success result | Fails with | Spec rule |
|---|---|---|---|
| `runDueJobs(): Promise<JobRunSummary>` | Runs everything due at `clock.now()`: sync when an hour has passed since the last successful sync inside a registration window (daily outside, D5), due enrollment jobs, pending emails | — | FR-010, FR-018, NFR-004, D10 |
| `start(intervalMs): void` / `stop(): void` | Timer that calls `runDueJobs` in the server process | — | D10 |

### Registration Gateway — `src/modules/registrationGateway/`
The only code that talks to MavLINK (NFR-010). Two classes implement `RegistrationGateway`: `MavlinkGateway` (real, not buildable yet, C3) and `SimulatedRegistrationGateway` (D15).

| Signature | Success result | Fails with | Spec rule |
|---|---|---|---|
| `fetchRegistrationData(scope?: { studentId? }): Promise<RegistrationData>` | Terms, programs, courses, sections, students (with advisor assignments), advisors, holds, course history | throws `RegistrationUnavailableError` on an outage | FR-010, NFR-010 |
| `enrollSection(studentId, sectionId): Promise<{ ok: true } \| { ok: false, reason }>` | MavLINK's answer; a rejection such as `"full"` is a result, not an error | throws `RegistrationUnavailableError` on an outage | FR-014, AC-025 |

Simulator controls (test and demo only, not part of the interface): `seed(data)`, `update(fn)`, `setAvailable(bool)`, `setEnrollmentOutcome(sectionId, response)`, and the call logs `fetchCalls` and `enrollCalls`. **Deviation:** the simulator's bodies are filled in. It is a stand-in for an external system and holds no Course Planner rules, and every test needs it to set up registration data.

### Data Store — `src/modules/dataStore/`
`DataStore` interface (`dataStore.ts`) and `PostgresDataStore` (`postgresDataStore.ts`). Called only by server modules; tests never call it. Methods: `transaction`, `getRegistrationData`, `saveRegistrationData`, `recordSyncFailure`, `getSyncStatus`, `insertSchedule`, `getSchedule`, `listSchedules`, `updateScheduleContents`, `updateScheduleStatus` (conditional on the expected status; returns `false` and changes nothing otherwise, D8), `listStatusChanges`, `insertExceptionRequest`, `listExceptionRequests`, `insertAdvisorDecision`, `getPlan`, `savePlan`, `insertEnrollmentRecord`, `listEnrollmentRecords`, `enqueueJob` (returns `false` if the kind and key already exist, D9), `listDueJobs`, `updateJob`, `deleteJob`, `insertNotification`, `listNotifications`, `listUnsentEmails`, `markEmailSent`. Serves NFR-002, NFR-004, NFR-007.

### Web Client
Has no callable functions. Its contract is the REST API below. The React client is not part of this skeleton.

## 2. REST API

All routes need `X-User-Id`. Success bodies are the module function's result as JSON. Each route first resolves the actor (`AccessControl.resolveActor`) and authorizes (`requireStudent`, `requireAdvisor`, or `authorizeSchedule`). Routes marked *refresh* call `RegistrationSync.refreshForStudent` for the owner first (FR-010, "whenever a student opens or edits a schedule").

| Method and path | Request | Maps to | Success | Errors | Requirements |
|---|---|---|---|---|---|
| `GET /sections` | query `term`, `requirement`, `startsAtOrAfter` (`HH:MM`), `day` | `CatalogSearch.searchSections` | 200 `SectionSearchResult[]` | 400, 401, 403 | FR-001 |
| `POST /schedules` | `{ term, name? }` | `ScheduleManager.createDraft` | 201 `ScheduleView` | 400, 401, 403 | FR-002 |
| `GET /schedules` | query `term?` | `ScheduleManager.listSchedules` | 200 `ScheduleSummary[]` | 401, 403 | FR-002 |
| `GET /schedules/{id}` *refresh* | — | `ScheduleManager.getSchedule` | 200 `ScheduleView` | 401, 404 | FR-002, FR-003, FR-010, FR-011, FR-018 |
| `POST /schedules/{id}/sections` *refresh* | `{ sectionId }` | `ScheduleManager.addSection` | 200 `ScheduleView` | 400, 401, 403, 404, 409 | FR-002, FR-003, FR-010, FR-011 |
| `DELETE /schedules/{id}/sections/{sectionId}` *refresh* | — | `ScheduleManager.removeSection` | 200 `ScheduleView` | 400, 401, 403, 404, 409 | FR-002, FR-003 |
| `POST /schedules/{id}/exceptions` | `{ sectionId, reasonCode, justification }` | `ScheduleManager.requestException` | 201 `ScheduleView` | 400, 401, 403, 404, 409 | FR-016 |
| `POST /schedules/{id}/submit` *refresh* | — | `ScheduleManager.submit` | 200 `ScheduleView` | 401, 403, 404, 409, 503 | FR-006, FR-013, FR-018 |
| `POST /schedules/{id}/withdraw` | — | `ScheduleManager.withdraw` | 200 `ScheduleView` | 401, 403, 404, 409 | FR-017 |
| `POST /schedules/{id}/approve` | — | `ScheduleManager.approve` | 200 `ScheduleView` | 401, 403, 404, 409 | FR-008, FR-019, FR-020 |
| `POST /schedules/{id}/return` | `{ comment }` | `ScheduleManager.returnSchedule` | 200 `ScheduleView` | 400, 401, 403, 404, 409 | FR-008, FR-019 |
| `GET /plan` | — | `Planner.getPlan` | 200 `PlanOfStudy` | 401, 403 | FR-004, FR-012 |
| `PUT /plan/courses/{courseId}` | `{ term }` | `Planner.moveCourse` | 200 `PlanOfStudy` | 400, 401, 403 | FR-004 |
| `GET /degree-progress` | — | `DegreeAudit.getDegreeProgress` | 200 `DegreeProgress` | 401, 403 | FR-005 |
| `GET /notifications` | — | `Notifier.listNotifications` | 200 `Notification[]` | 401 | FR-006, FR-014, FR-015, FR-018 |
| `GET /advisor/dashboard` | — | `ReviewQueue.getDashboard` | 200 `DashboardEntry[]` | 401, 403 | FR-007, FR-013 |
| `GET /advisor/schedules/{id}/review` | — | `ReviewQueue.getReviewView` | 200 `ReviewView` | 401, 403, 404 | FR-009 |
| `GET /sync-status` | — | `RegistrationSync.getSyncStatus` | 200 `SyncStatus` | 401 | FR-018 |

### Requirements without their own route

These run behind the scenes. They are reached through the routes above or through Job Runner, and tests call them through the listed function.

| Requirement | Entry point |
|---|---|
| FR-010 (hourly sync) | `JobRunner.runDueJobs` → `RegistrationSync.syncAll` |
| FR-011 (validation) | inside `addSection`, `getSchedule`, `submit` |
| FR-012 (regenerate plan) | `RegistrationSync.syncAll` → `Planner.regenerate` |
| FR-013 (classification) | inside `submit`; shown by `GET /advisor/dashboard` |
| FR-014 (enrollment) | `JobRunner.runDueJobs` → `Enrollment.processEnrollmentJob` |
| FR-015 (revalidation) | `RegistrationSync.syncAll` → `Revalidator.revalidate` |
| FR-019 (access) | every route, through Access Control |
| FR-020 (enroll once) | `approve` (unique enrollment job) and `processEnrollmentJob` |

## 3. Contract review

Checked every FR against the table above: each has an entry point, and every route maps to exactly one public function. Changes made during the review, and functions considered but left out:

- **Removed** `AccessControl.authorizeStudentData`. Every route that uses a student's own data needs only `requireStudent`, and schedule routes use `authorizeSchedule`.
- **Left out** a separate validation route (`GET /schedules/{id}/validation`). Results are already part of `ScheduleView`.
- **Left out** a history route. History is part of `ScheduleView` (NFR-007).
- **Left out** `ScheduleManager.reclassify`. Revalidator stores a new classification through the Data Store, which it may depend on.
- **Removed** the `programId` search parameter. Catalog Search reads the student's Program from the snapshot, so a student cannot search as another Program.
- **Kept** `GET /schedules`. The tests need it to check that a rejected `POST /schedules` created nothing.
- **Kept** `removeSection`. FR-002 and NFR-006 both speak of removing sections.
