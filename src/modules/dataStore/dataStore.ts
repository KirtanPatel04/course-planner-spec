// Data Store (architecture.md §2): PostgreSQL schema and transactions for the snapshot,
// schedules, plans, history, jobs, and notifications. Depends on nothing.
// Only server modules call this; it has no REST route.

import type {
  AdvisorDecision,
  EnrollmentRecord,
  ExceptionRequest,
  Instant,
  Job,
  JobKind,
  Notification,
  PlanOfStudy,
  RegistrationData,
  ScheduleId,
  ScheduleStatus,
  StatusChange,
  StudentId,
  SubmissionClassification,
  SyncStatus,
  TermCode,
  ValidationResult,
  SectionId,
} from '../../domain/types';

/** A schedule row as stored (ScheduleView is assembled from this plus related rows). */
export interface ScheduleRow {
  id: ScheduleId;
  studentId: StudentId;
  term: TermCode;
  name: string;
  status: ScheduleStatus;
  sectionIds: SectionId[];
  validationResults: ValidationResult[];
  classification: SubmissionClassification | null;
  returnComment: string | null;
  submittedAt: Instant | null;
  createdAt: Instant;
}

export interface ScheduleFilter {
  studentId?: StudentId;
  studentIds?: StudentId[];
  term?: TermCode;
  terms?: TermCode[];
  statuses?: ScheduleStatus[];
  sectionIds?: SectionId[]; // schedules containing any of these sections
}

export interface DataStore {
  /** Runs `work` in one database transaction; rolls back if it throws (NFR-002). */
  transaction<T>(work: (tx: DataStore) => Promise<T>): Promise<T>;

  // Snapshot of MavLINK data (D4)
  getRegistrationData(): Promise<RegistrationData>;
  saveRegistrationData(data: RegistrationData, syncedAt: Instant): Promise<void>;
  recordSyncFailure(at: Instant): Promise<void>;
  getSyncStatus(): Promise<SyncStatus>;

  // Schedules (D8: updateScheduleStatus is a conditional update)
  insertSchedule(row: ScheduleRow, change: StatusChange): Promise<void>;
  getSchedule(id: ScheduleId): Promise<ScheduleRow | null>;
  listSchedules(filter: ScheduleFilter): Promise<ScheduleRow[]>;
  updateScheduleContents(id: ScheduleId, expectedStatuses: ScheduleStatus[], patch: Partial<ScheduleRow>): Promise<boolean>;
  /** Returns false, changing nothing, if the current status is not `expected` or the unique index rejects it. */
  updateScheduleStatus(id: ScheduleId, expected: ScheduleStatus, patch: Partial<ScheduleRow>, change: StatusChange): Promise<boolean>;
  listStatusChanges(id: ScheduleId): Promise<StatusChange[]>;
  insertExceptionRequest(request: ExceptionRequest): Promise<void>;
  listExceptionRequests(id: ScheduleId): Promise<ExceptionRequest[]>;
  insertAdvisorDecision(decision: AdvisorDecision): Promise<void>;

  // Plans of study
  getPlan(studentId: StudentId): Promise<PlanOfStudy | null>;
  savePlan(plan: PlanOfStudy): Promise<void>;

  // Enrollment
  insertEnrollmentRecord(record: EnrollmentRecord): Promise<void>;
  listEnrollmentRecords(id: ScheduleId): Promise<EnrollmentRecord[]>;

  // Jobs (D9, D10). enqueueJob returns false if a job with the same kind and key exists.
  enqueueJob(job: Job): Promise<boolean>;
  listDueJobs(now: Instant, kind?: JobKind): Promise<Job[]>;
  updateJob(job: Job): Promise<void>;
  deleteJob(id: string): Promise<void>;

  // Notifications
  insertNotification(notification: Notification): Promise<void>;
  listNotifications(recipientId: string): Promise<Notification[]>;
  listUnsentEmails(): Promise<Notification[]>;
  markEmailSent(id: string, at: Instant): Promise<void>;
}
