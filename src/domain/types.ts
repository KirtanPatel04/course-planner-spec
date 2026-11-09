// Domain types for the Course Planner. Names follow the Domain Model in spec.md.
// These are data shapes only: no behavior lives in this file.

// ---------- Identifiers ----------
export type UserId = string; // from UNO single sign-on (Description, D1)
export type StudentId = string;
export type AdvisorId = string;
export type ProgramId = string; // e.g. "MSCS"
export type TermCode = string; // e.g. "FA27" = Fall 2027
export type CourseId = string; // e.g. "CSCI 8000"
export type SectionId = string; // e.g. "CSCI8000-001"
export type RequirementId = string; // e.g. "CORE"
export type ScheduleId = string;
export type NotificationId = string;

/** ISO-8601 instant in UTC, e.g. "2027-07-15T19:00:00.000Z" (D14). */
export type Instant = string;
/** Calendar date, e.g. "2027-08-23". */
export type DateOnly = string;
/** Wall-clock time in America/Chicago, 24-hour "HH:MM", e.g. "18:00". */
export type ClockTime = string;

export type Weekday = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';
export type Season = 'FALL' | 'SPRING' | 'SUMMER';

// ---------- Actors ----------
export type Actor =
  | { kind: 'STUDENT'; id: StudentId }
  | { kind: 'ADVISOR'; id: AdvisorId }
  | { kind: 'SYSTEM' };

/** Actions Access Control decides on (architecture.md, Access Control). */
export type Action = 'VIEW' | 'EDIT' | 'SUBMIT' | 'WITHDRAW' | 'APPROVE' | 'RETURN';

// ---------- Registration data (read-only copy of MavLINK, D4) ----------
export interface Term {
  code: TermCode;
  name: string; // "Fall 2027"
  season: Season;
  startDate: DateOnly;
  endDate: DateOnly;
  registrationStart: DateOnly;
  registrationEnd: DateOnly;
}

export interface Course {
  id: CourseId;
  title: string;
  creditHours: number;
  prerequisites: CourseId[];
  corequisites: CourseId[];
  offeredIn: Season[]; // offering pattern
}

export interface Meeting {
  days: Weekday[];
  start: ClockTime;
  end: ClockTime;
}

export type SectionStatus = 'OPEN' | 'FULL' | 'CANCELLED';

export interface CourseSection {
  id: SectionId;
  courseId: CourseId;
  term: TermCode;
  meetings: Meeting[];
  capacity: number;
  seatsAvailable: number;
  status: SectionStatus;
}

export interface DegreeRequirement {
  id: RequirementId;
  name: string; // "Core", "Electives", "Thesis or Project"
  courses: CourseId[]; // courses that satisfy it
  creditHoursRequired: number;
}

export interface Program {
  id: ProgramId;
  name: string;
  maxCreditHoursPerTerm: number;
  requirements: DegreeRequirement[];
}

export interface StudentRecord {
  id: StudentId;
  name: string;
  email: string;
  programId: ProgramId;
  advisorId: AdvisorId; // advisor assignment from MavLINK (FR-019)
  firstTerm: TermCode;
}

export interface AdvisorRecord {
  id: AdvisorId;
  name: string;
  email: string;
}

export interface RegistrationHold {
  studentId: StudentId;
  type: string; // e.g. "Bursar"
  blocking: boolean;
}

export type CourseHistoryStatus = 'COMPLETED' | 'IN_PROGRESS';

export interface CourseHistoryEntry {
  studentId: StudentId;
  courseId: CourseId;
  term: TermCode;
  status: CourseHistoryStatus;
}

/** Everything the system copies from the University Registration System. */
export interface RegistrationData {
  terms: Term[];
  programs: Program[];
  courses: Course[];
  sections: CourseSection[];
  students: StudentRecord[];
  advisors: AdvisorRecord[];
  holds: RegistrationHold[];
  courseHistory: CourseHistoryEntry[];
}

// ---------- Validation ----------
export type ReasonCode =
  | 'TIME_CONFLICT'
  | 'MISSING_PREREQUISITE'
  | 'MISSING_COREQUISITE'
  | 'CREDIT_LIMIT_EXCEEDED'
  | 'BLOCKING_HOLD'
  | 'SECTION_FULL'
  | 'SECTION_CANCELLED';

export interface Flag {
  code: ReasonCode;
  message: string;
  /** Courses named by the reason (e.g. the missing prerequisite). */
  relatedCourseIds: CourseId[];
  /** Sections named by the reason (e.g. the other side of a time conflict). */
  relatedSectionIds: SectionId[];
  /** Hold type for BLOCKING_HOLD (AC-008). */
  holdType?: string;
}

export interface ValidationResult {
  sectionId: SectionId;
  outcome: 'PASS' | 'FLAG';
  flags: Flag[];
  /** Time of the registration data the result was based on (Validation Result, NFR-003). */
  dataAsOf: Instant;
  /** false when the registration system could not be reached (FR-018, "Unverified"). */
  verified: boolean;
}

// ---------- Schedules ----------
export type ScheduleStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'RETURNED'
  | 'ENROLLED'
  | 'PARTIALLY_ENROLLED';

export interface ExceptionRequest {
  id: string;
  scheduleId: ScheduleId;
  sectionId: SectionId;
  reasonCode: ReasonCode;
  justification: string;
  createdAt: Instant;
}

export type ClassificationLabel = 'ROUTINE' | 'NEEDS_REVIEW';
export type ClassificationReasonCode = 'SECTION_FLAGGED' | 'EXCEPTION_REQUESTED' | 'COURSE_NOT_IN_PLAN';

export interface ClassificationReason {
  code: ClassificationReasonCode;
  sectionId?: SectionId;
  courseId?: CourseId;
}

export interface SubmissionClassification {
  label: ClassificationLabel;
  reasons: ClassificationReason[]; // empty when ROUTINE
  classifiedAt: Instant;
}

export interface AdvisorDecision {
  scheduleId: ScheduleId;
  advisorId: AdvisorId;
  decision: 'APPROVE' | 'RETURN';
  comment?: string;
  decidedAt: Instant;
}

/** One entry in a schedule's history (NFR-007). */
export interface StatusChange {
  scheduleId: ScheduleId;
  from: ScheduleStatus | null; // null for creation
  to: ScheduleStatus;
  actor: Actor;
  at: Instant;
  comment?: string;
}

export interface EnrollmentRecord {
  scheduleId: ScheduleId;
  sectionId: SectionId;
  outcome: 'ENROLLED' | 'FAILED';
  reason?: string; // reason returned by MavLINK when FAILED (AC-025)
  recordedAt: Instant;
}

/** What GET /schedules/{id} returns. */
export interface ScheduleView {
  id: ScheduleId;
  studentId: StudentId;
  term: TermCode;
  name: string;
  status: ScheduleStatus;
  sectionIds: SectionId[];
  totalCreditHours: number;
  validationResults: ValidationResult[];
  exceptionRequests: ExceptionRequest[];
  classification: SubmissionClassification | null;
  /** Latest Return comment from an advisor or the system. */
  returnComment: string | null;
  enrollmentRecords: EnrollmentRecord[];
  history: StatusChange[];
  /** Last successful sync with MavLINK (AC-031). */
  lastSyncedAt: Instant | null;
  /** false while MavLINK is unreachable; Submit is blocked (FR-018). */
  canSubmit: boolean;
}

export interface ScheduleSummary {
  id: ScheduleId;
  term: TermCode;
  name: string;
  status: ScheduleStatus;
}

// ---------- Plan of study and degree progress ----------
export interface PlannedCourse {
  courseId: CourseId;
  placement: 'GENERATED' | 'MANUAL';
  flags: Flag[]; // e.g. MISSING_PREREQUISITE after a manual move (AC-011)
}

export interface PlannedTerm {
  term: TermCode;
  courses: PlannedCourse[];
}

export interface PlanOfStudy {
  studentId: StudentId;
  programId: ProgramId;
  terms: PlannedTerm[];
  updatedAt: Instant;
}

export type RequirementStatus = 'COMPLETE' | 'IN_PROGRESS' | 'REMAINING';

export interface RequirementProgress {
  requirementId: RequirementId;
  name: string;
  status: RequirementStatus;
  creditHoursRequired: number;
  creditHoursCompleted: number;
  creditHoursInProgress: number;
  completedCourseIds: CourseId[];
  inProgressCourseIds: CourseId[];
}

export interface DegreeProgress {
  studentId: StudentId;
  programId: ProgramId;
  requirements: RequirementProgress[];
}

// ---------- Search ----------
export interface SectionQuery {
  term: TermCode;
  /** Requirement category of the student's own Program, e.g. "CORE". */
  requirementId?: RequirementId;
  startsAtOrAfter?: ClockTime;
  day?: Weekday;
}

export interface SectionSearchResult {
  sectionId: SectionId;
  courseId: CourseId;
  title: string;
  creditHours: number;
  meetings: Meeting[];
  seatsAvailable: number;
  status: SectionStatus;
}

// ---------- Review ----------
export interface DashboardEntry {
  scheduleId: ScheduleId;
  studentId: StudentId;
  studentName: string;
  term: TermCode;
  submittedAt: Instant;
  classification: SubmissionClassification;
}

export interface ReviewView {
  schedule: ScheduleView;
  planForTerm: PlannedCourse[];
  courseHistory: CourseHistoryEntry[];
  /** Courses in the schedule that are not in the plan for that term (FR-009, AC-018). */
  highlightedCourseIds: CourseId[];
}

// ---------- Notifications ----------
export type NotificationEvent =
  | 'SCHEDULE_SUBMITTED'
  | 'SCHEDULE_APPROVED'
  | 'SCHEDULE_RETURNED'
  | 'ENROLLMENT_RESULT'
  | 'REVALIDATION_FAILURE';

export interface Notification {
  id: NotificationId;
  recipientId: UserId;
  event: NotificationEvent;
  scheduleId: ScheduleId;
  message: string;
  createdAt: Instant;
  emailSentAt: Instant | null;
}

// ---------- Sync, jobs ----------
export interface SyncStatus {
  lastSuccessfulSyncAt: Instant | null;
  available: boolean; // false while MavLINK cannot be reached
}

export interface SyncReport {
  succeeded: boolean;
  syncedAt: Instant;
  changedSectionIds: SectionId[];
  changedHoldStudentIds: StudentId[];
  changedHistoryStudentIds: StudentId[];
}

export type JobKind = 'SYNC' | 'ENROLLMENT' | 'EMAIL';

export interface Job {
  id: string;
  kind: JobKind;
  /** Unique key; for ENROLLMENT it is the schedule ID (D9, FR-020). */
  key: string;
  runAt: Instant;
  firstAttemptAt: Instant | null;
  attempts: number;
}

export type EnrollmentJobOutcome = 'COMPLETED' | 'RETRY_SCHEDULED' | 'GAVE_UP' | 'CANCELLED';

export interface JobRunSummary {
  ranAt: Instant;
  syncRan: boolean;
  enrollmentJobs: { scheduleId: ScheduleId; outcome: EnrollmentJobOutcome }[];
  emailsSent: number;
}
