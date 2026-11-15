// Schedule Manager (architecture.md §2; FR-002, FR-006, FR-008, FR-015, FR-016, FR-017,
// NFR-002, NFR-007, D8, D9). Owns Draft Schedule contents and applies every status transition,
// recording each one in the schedule history. Authorization is done by the caller (API → Access Control).

import { randomUUID } from 'node:crypto';
import { DomainError, NotImplementedError } from '../domain/errors';
import type {
  Actor, ReasonCode, ScheduleId, ScheduleStatus, ScheduleSummary, ScheduleView, SectionId, StudentId, TermCode,
} from '../domain/types';
import type { Clock } from '../shared/clock';
import type { Classifier } from './classifier';
import type { DataStore, ScheduleRow } from './dataStore/dataStore';
import type { Notifier } from './notifier';
import type { Validator } from './validator';

/** Returned behaves like Draft: both are editable (Draft Schedule statuses). */
const EDITABLE: ScheduleStatus[] = ['DRAFT', 'RETURNED'];

export class ScheduleManager {
  constructor(
    private readonly validator: Validator,
    private readonly classifier: Classifier,
    private readonly notifier: Notifier,
    private readonly store: DataStore,
    private readonly clock: Clock,
  ) {}

  private now(): string {
    return this.clock.now().toISOString();
  }

  private async requireRow(scheduleId: ScheduleId): Promise<ScheduleRow> {
    const row = await this.store.getSchedule(scheduleId);
    if (!row) throw new DomainError('NOT_FOUND', 'Schedule not found');
    return row;
  }

  /** The schedule's student record and term name, for notification messages. */
  private async describe(row: ScheduleRow) {
    const data = await this.store.getRegistrationData();
    return {
      student: data.students.find((s) => s.id === row.studentId),
      termName: data.terms.find((t) => t.code === row.term)?.name ?? row.term,
    };
  }

  /**
   * Creates an empty Draft schedule for a Term. A student may have several Drafts per Term.
   * @throws DomainError INVALID_INPUT if the term is unknown.
   */
  async createDraft(studentId: StudentId, term: TermCode, name?: string): Promise<ScheduleView> {
    const data = await this.store.getRegistrationData();
    const known = data.terms.find((t) => t.code === term);
    if (typeof term !== 'string' || !known) throw new DomainError('INVALID_INPUT', 'Unknown term');
    const now = this.now();
    const row: ScheduleRow = {
      id: randomUUID(),
      studentId,
      term,
      name: typeof name === 'string' && name.trim() ? name.trim() : `${known.name} draft`,
      status: 'DRAFT',
      sectionIds: [],
      validationResults: [],
      classification: null,
      returnComment: null,
      submittedAt: null,
      createdAt: now,
    };
    await this.store.insertSchedule(row, { scheduleId: row.id, from: null, to: 'DRAFT', actor: { kind: 'STUDENT', id: studentId }, at: now });
    return this.getSchedule(row.id);
  }

  /** The student's schedules, optionally for one Term. */
  async listSchedules(studentId: StudentId, term?: TermCode): Promise<ScheduleSummary[]> {
    const rows = await this.store.listSchedules(term === undefined ? { studentId } : { studentId, term });
    return rows.map(({ id, term: t, name, status }) => ({ id, term: t, name, status }));
  }

  /** The schedule with fresh Validation Results for every section, history, and sync state. */
  async getSchedule(scheduleId: ScheduleId): Promise<ScheduleView> {
    const row = await this.store.getSchedule(scheduleId);
    if (!row) throw new DomainError('NOT_FOUND', 'Schedule not found');
    const data = await this.store.getRegistrationData();
    const sync = await this.store.getSyncStatus();
    const credits = new Map(data.courses.map((c) => [c.id, c.creditHours]));
    const courseOf = new Map(data.sections.map((s) => [s.id, s.courseId]));
    return {
      id: row.id,
      studentId: row.studentId,
      term: row.term,
      name: row.name,
      status: row.status,
      sectionIds: row.sectionIds,
      totalCreditHours: row.sectionIds.reduce((sum, id) => sum + (credits.get(courseOf.get(id) ?? '') ?? 0), 0),
      validationResults: await this.validator.validateSchedule({ studentId: row.studentId, term: row.term, sectionIds: row.sectionIds }),
      exceptionRequests: await this.store.listExceptionRequests(row.id),
      classification: row.classification,
      returnComment: row.returnComment,
      enrollmentRecords: await this.store.listEnrollmentRecords(row.id),
      history: await this.store.listStatusChanges(row.id),
      lastSyncedAt: sync.lastSuccessfulSyncAt,
      canSubmit: sync.available,
    };
  }

  /**
   * Adds a section and returns the schedule with results for every section (AC-003, AC-004).
   * Flagged sections are still added.
   * @throws DomainError INVALID_INPUT (unknown section or already in the schedule),
   *         SECTION_TERM_MISMATCH, INVALID_STATE unless status is Draft or Returned.
   */
  async addSection(scheduleId: ScheduleId, sectionId: SectionId): Promise<ScheduleView> {
    const row = await this.store.getSchedule(scheduleId);
    if (!row) throw new DomainError('NOT_FOUND', 'Schedule not found');
    const section = (await this.store.getRegistrationData()).sections.find((s) => s.id === sectionId);
    if (typeof sectionId !== 'string' || !section) throw new DomainError('INVALID_INPUT', 'Unknown section');
    if (row.sectionIds.includes(sectionId)) throw new DomainError('INVALID_INPUT', 'The section is already in this schedule');
    if (section.term !== row.term) throw new DomainError('SECTION_TERM_MISMATCH', 'The section is not offered in this schedule\'s term');

    const sectionIds = [...row.sectionIds, sectionId];
    // Flagged sections are still added; the results are returned with the schedule (FR-003).
    const validationResults = await this.validator.validateSchedule({ studentId: row.studentId, term: row.term, sectionIds });
    if (!await this.store.updateScheduleContents(scheduleId, EDITABLE, { sectionIds, validationResults })) {
      throw new DomainError('INVALID_STATE', 'Only Draft or Returned schedules can be edited');
    }
    return this.getSchedule(scheduleId);
  }

  /**
   * Removes a section (and any Exception Request on it) and returns the revalidated schedule.
   * @throws DomainError INVALID_INPUT if the section is not in the schedule, INVALID_STATE as addSection.
   */
  async removeSection(_scheduleId: ScheduleId, _sectionId: SectionId): Promise<ScheduleView> {
    throw new NotImplementedError('ScheduleManager.removeSection');
  }

  /**
   * Attaches an Exception Request to a flagged section (FR-016, AC-028).
   * @throws DomainError JUSTIFICATION_REQUIRED if justification is missing or empty,
   *         INVALID_INPUT if the section is not in the schedule or does not carry `reasonCode`,
   *         INVALID_STATE unless status is Draft or Returned.
   */
  async requestException(_scheduleId: ScheduleId, _sectionId: SectionId, _reasonCode: ReasonCode, _justification: string): Promise<ScheduleView> {
    throw new NotImplementedError('ScheduleManager.requestException');
  }

  /**
   * Draft or Returned → Submitted; revalidates, classifies (FR-013) and notifies the advisor (AC-013),
   * all in one transaction.
   * @throws DomainError REGISTRATION_UNAVAILABLE while MavLINK is unreachable (AC-031),
   *         ACTIVE_SUBMISSION_EXISTS if another schedule for the Term is Submitted or later (AC-014),
   *         INVALID_STATE from any other status.
   */
  async submit(scheduleId: ScheduleId, actor: Actor): Promise<ScheduleView> {
    const row = await this.requireRow(scheduleId);
    if (!EDITABLE.includes(row.status)) throw new DomainError('INVALID_STATE', 'Only a Draft or Returned schedule can be submitted');

    const validationResults = await this.validator.validateSchedule({ studentId: row.studentId, term: row.term, sectionIds: row.sectionIds });
    const exceptionRequests = await this.store.listExceptionRequests(scheduleId);
    const now = this.now();
    const classification = {
      ...await this.classifier.classify({ studentId: row.studentId, term: row.term, sectionIds: row.sectionIds, validationResults, exceptionRequests }),
      classifiedAt: now,
    };
    const submitted = await this.store.transaction((tx) => tx.updateScheduleStatus(
      scheduleId, row.status, { validationResults, classification, submittedAt: now },
      { scheduleId, from: row.status, to: 'SUBMITTED', actor, at: now }));
    if (!submitted) throw new DomainError('INVALID_STATE', 'Only a Draft or Returned schedule can be submitted');

    const { student, termName } = await this.describe(row);
    if (student) {
      await this.notifier.notify(student.advisorId, 'SCHEDULE_SUBMITTED', scheduleId,
        `${student.name} submitted the ${termName} schedule "${row.name}" for review (${classification.label === 'ROUTINE' ? 'Routine' : 'Needs Review'}).`);
    }
    return this.getSchedule(scheduleId);
  }

  /**
   * Submitted → Draft (FR-017, AC-029).
   * @throws DomainError INVALID_STATE from any other status (AC-030), including after a racing approval.
   */
  async withdraw(_scheduleId: ScheduleId, _actor: Actor): Promise<ScheduleView> {
    throw new NotImplementedError('ScheduleManager.withdraw');
  }

  /**
   * Submitted → Approved; records the Advisor Decision, inserts one enrollment job keyed by schedule ID,
   * and notifies the student (AC-013, AC-016). A repeated approval of an Approved-or-later schedule
   * changes nothing and returns the schedule (FR-020, AC-035).
   * @throws DomainError INVALID_STATE from Draft or Returned.
   */
  async approve(scheduleId: ScheduleId, actor: Actor): Promise<ScheduleView> {
    const row = await this.requireRow(scheduleId);
    if (row.status !== 'SUBMITTED') throw new DomainError('INVALID_STATE', 'Only a Submitted schedule can be approved');

    const now = this.now();
    // One transaction: the status change, the Advisor Decision, and one enrollment job keyed by the
    // schedule ID (D9). Schedule Manager never calls Enrollment; Job Runner picks the job up.
    const approved = await this.store.transaction(async (tx) => {
      if (!await tx.updateScheduleStatus(scheduleId, 'SUBMITTED', {}, { scheduleId, from: 'SUBMITTED', to: 'APPROVED', actor, at: now })) {
        return false;
      }
      await tx.insertAdvisorDecision({ scheduleId, advisorId: actor.kind === 'ADVISOR' ? actor.id : '', decision: 'APPROVE', decidedAt: now });
      await tx.enqueueJob({ id: randomUUID(), kind: 'ENROLLMENT', key: scheduleId, runAt: now, firstAttemptAt: null, attempts: 0 });
      return true;
    });
    if (!approved) throw new DomainError('INVALID_STATE', 'Only a Submitted schedule can be approved');

    const { termName } = await this.describe(row);
    await this.notifier.notify(row.studentId, 'SCHEDULE_APPROVED', scheduleId,
      `Your ${termName} schedule "${row.name}" was approved and will be sent for enrollment.`);
    return this.getSchedule(scheduleId);
  }

  /**
   * Submitted → Returned with the comment; records the Advisor Decision and notifies the student (AC-017).
   * @throws DomainError COMMENT_REQUIRED if comment is missing or empty, INVALID_STATE from any other status.
   */
  async returnSchedule(_scheduleId: ScheduleId, _comment: string, _actor: Actor): Promise<ScheduleView> {
    throw new NotImplementedError('ScheduleManager.returnSchedule');
  }

  /**
   * Approved → Returned with a system comment (FR-015, AC-026). Called by Revalidator.
   * Returns false, changing nothing, if the schedule is no longer Approved.
   */
  async systemReturn(_scheduleId: ScheduleId, _comment: string): Promise<boolean> {
    throw new NotImplementedError('ScheduleManager.systemReturn');
  }

  /** Approved → Enrolled or Partially Enrolled (FR-014). Called by Enrollment. */
  async recordEnrollmentOutcome(_scheduleId: ScheduleId, _status: 'ENROLLED' | 'PARTIALLY_ENROLLED'): Promise<void> {
    throw new NotImplementedError('ScheduleManager.recordEnrollmentOutcome');
  }
}
