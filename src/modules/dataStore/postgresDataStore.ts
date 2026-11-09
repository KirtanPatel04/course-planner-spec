// PostgreSQL implementation of DataStore (C1). Skeleton: every method throws.
// The connection is opened lazily, so constructing this class never touches a database.

import { NotImplementedError } from '../../domain/errors';
import type { DataStore, ScheduleFilter, ScheduleRow } from './dataStore';
import type {
  AdvisorDecision, EnrollmentRecord, ExceptionRequest, Instant, Job, JobKind, Notification,
  PlanOfStudy, RegistrationData, ScheduleId, ScheduleStatus, StatusChange, StudentId, SyncStatus,
} from '../../domain/types';

const ni = (name: string): never => {
  throw new NotImplementedError(`DataStore.${name}`);
};

export class PostgresDataStore implements DataStore {
  constructor(private readonly connectionString: string) {}

  transaction<T>(_work: (tx: DataStore) => Promise<T>): Promise<T> { return ni('transaction'); }
  getRegistrationData(): Promise<RegistrationData> { return ni('getRegistrationData'); }
  saveRegistrationData(_data: RegistrationData, _syncedAt: Instant): Promise<void> { return ni('saveRegistrationData'); }
  recordSyncFailure(_at: Instant): Promise<void> { return ni('recordSyncFailure'); }
  getSyncStatus(): Promise<SyncStatus> { return ni('getSyncStatus'); }
  insertSchedule(_row: ScheduleRow, _change: StatusChange): Promise<void> { return ni('insertSchedule'); }
  getSchedule(_id: ScheduleId): Promise<ScheduleRow | null> { return ni('getSchedule'); }
  listSchedules(_filter: ScheduleFilter): Promise<ScheduleRow[]> { return ni('listSchedules'); }
  updateScheduleContents(_id: ScheduleId, _expected: ScheduleStatus[], _patch: Partial<ScheduleRow>): Promise<boolean> { return ni('updateScheduleContents'); }
  updateScheduleStatus(_id: ScheduleId, _expected: ScheduleStatus, _patch: Partial<ScheduleRow>, _change: StatusChange): Promise<boolean> { return ni('updateScheduleStatus'); }
  listStatusChanges(_id: ScheduleId): Promise<StatusChange[]> { return ni('listStatusChanges'); }
  insertExceptionRequest(_request: ExceptionRequest): Promise<void> { return ni('insertExceptionRequest'); }
  listExceptionRequests(_id: ScheduleId): Promise<ExceptionRequest[]> { return ni('listExceptionRequests'); }
  insertAdvisorDecision(_decision: AdvisorDecision): Promise<void> { return ni('insertAdvisorDecision'); }
  getPlan(_studentId: StudentId): Promise<PlanOfStudy | null> { return ni('getPlan'); }
  savePlan(_plan: PlanOfStudy): Promise<void> { return ni('savePlan'); }
  insertEnrollmentRecord(_record: EnrollmentRecord): Promise<void> { return ni('insertEnrollmentRecord'); }
  listEnrollmentRecords(_id: ScheduleId): Promise<EnrollmentRecord[]> { return ni('listEnrollmentRecords'); }
  enqueueJob(_job: Job): Promise<boolean> { return ni('enqueueJob'); }
  listDueJobs(_now: Instant, _kind?: JobKind): Promise<Job[]> { return ni('listDueJobs'); }
  updateJob(_job: Job): Promise<void> { return ni('updateJob'); }
  deleteJob(_id: string): Promise<void> { return ni('deleteJob'); }
  insertNotification(_n: Notification): Promise<void> { return ni('insertNotification'); }
  listNotifications(_recipientId: string): Promise<Notification[]> { return ni('listNotifications'); }
  listUnsentEmails(): Promise<Notification[]> { return ni('listUnsentEmails'); }
  markEmailSent(_id: string, _at: Instant): Promise<void> { return ni('markEmailSent'); }
}
