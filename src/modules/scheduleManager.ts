// Schedule Manager (architecture.md §2; FR-002, FR-006, FR-008, FR-015, FR-016, FR-017,
// NFR-002, NFR-007, D8, D9). Owns Draft Schedule contents and applies every status transition,
// recording each one in the schedule history. Authorization is done by the caller (API → Access Control).

import { randomUUID } from 'node:crypto';
import { DomainError } from '../domain/errors';
import type {
  Actor, ExceptionRequest, ReasonCode, ScheduleId, ScheduleStatus, ScheduleSummary, ScheduleView, SectionId, StudentId, TermCode,
} from '../domain/types';
import type { Clock } from '../shared/clock';
import type { Classifier } from './classifier';
import type { DataStore, ScheduleRow } from './dataStore/dataStore';
import type { Notifier } from './notifier';
import type { Validator } from './validator';

/** Returned behaves like Draft: both are editable (Draft Schedule statuses). */
const EDITABLE: ScheduleStatus[] = ['DRAFT', 'RETURNED'];
/** "Submitted, Approved, or later": at most one per student per Term (Draft Schedule, AC-014). */
const ACTIVE: ScheduleStatus[] = ['SUBMITTED', 'APPROVED', 'ENROLLED', 'PARTIALLY_ENROLLED'];
const APPROVED_OR_LATER: ScheduleStatus[] = ['APPROVED', 'ENROLLED', 'PARTIALLY_ENROLLED'];

const activeSubmissionExists = () => new DomainError('ACTIVE_SUBMISSION_EXISTS',
  'You already have a submitted schedule for this term. Withdraw it before submitting another one.');

/** Exception Requests on sections still in the schedule; a removed section takes its requests with it. */
export const currentExceptionRequests = async (store: DataStore, row: ScheduleRow): Promise<ExceptionRequest[]> =>
  (await store.listExceptionRequests(row.id)).filter((e) => row.sectionIds.includes(e.sectionId));

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
      exceptionRequests: await currentExceptionRequests(this.store, row),
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
  async removeSection(scheduleId: ScheduleId, sectionId: SectionId): Promise<ScheduleView> {
    const row = await this.requireRow(scheduleId);
    if (!row.sectionIds.includes(sectionId)) throw new DomainError('INVALID_INPUT', 'The section is not in this schedule');
    const sectionIds = row.sectionIds.filter((id) => id !== sectionId);
    const validationResults = await this.validator.validateSchedule({ studentId: row.studentId, term: row.term, sectionIds });
    // The section's Exception Requests go with it: they apply only to sections in the schedule
    // (see currentExceptionRequests), and the audit rows stay stored (NFR-007).
    if (!await this.store.updateScheduleContents(scheduleId, EDITABLE, { sectionIds, validationResults })) {
      throw new DomainError('INVALID_STATE', 'Only Draft or Returned schedules can be edited');
    }
    return this.getSchedule(scheduleId);
  }

  /**
   * Attaches an Exception Request to a flagged section (FR-016, AC-028).
   * @throws DomainError JUSTIFICATION_REQUIRED if justification is missing or empty,
   *         INVALID_INPUT if the section is not in the schedule or does not carry `reasonCode`,
   *         INVALID_STATE unless status is Draft or Returned.
   */
  async requestException(scheduleId: ScheduleId, sectionId: SectionId, reasonCode: ReasonCode, justification: string): Promise<ScheduleView> {
    // Only spaces counts as no justification (test_plan.md G-12).
    if (typeof justification !== 'string' || !justification.trim()) {
      throw new DomainError('JUSTIFICATION_REQUIRED', 'Explain why you need this exception');
    }
    const row = await this.requireRow(scheduleId);
    if (!row.sectionIds.includes(sectionId)) throw new DomainError('INVALID_INPUT', 'The section is not in this schedule');
    const results = await this.validator.validateSchedule({ studentId: row.studentId, term: row.term, sectionIds: row.sectionIds });
    const flagged = results.find((r) => r.sectionId === sectionId)?.flags.some((f) => f.code === reasonCode);
    if (!flagged) throw new DomainError('INVALID_INPUT', 'The section is not flagged with that reason code');
    if (!EDITABLE.includes(row.status)) throw new DomainError('INVALID_STATE', 'Only a Draft or Returned schedule can be changed');

    await this.store.insertExceptionRequest({
      id: randomUUID(), scheduleId, sectionId, reasonCode, justification, createdAt: this.now(),
    });
    return this.getSchedule(scheduleId);
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
    if (!(await this.store.getSyncStatus()).available) {
      throw new DomainError('REGISTRATION_UNAVAILABLE', 'The registration system cannot be reached. Submit again after it reconnects.');
    }
    if ((await this.store.listSchedules({ studentId: row.studentId, term: row.term, statuses: ACTIVE })).some((s) => s.id !== scheduleId)) {
      throw activeSubmissionExists();
    }

    const validationResults = await this.validator.validateSchedule({ studentId: row.studentId, term: row.term, sectionIds: row.sectionIds });
    const exceptionRequests = await currentExceptionRequests(this.store, row);
    const now = this.now();
    const classification = {
      ...await this.classifier.classify({ studentId: row.studentId, term: row.term, sectionIds: row.sectionIds, validationResults, exceptionRequests }),
      classifiedAt: now,
    };
    const submitted = await this.store.transaction((tx) => tx.updateScheduleStatus(
      scheduleId, row.status, { validationResults, classification, submittedAt: now },
      { scheduleId, from: row.status, to: 'SUBMITTED', actor, at: now }));
    if (!submitted) {
      // Either the status changed under us, or a racing submission for the same Term won the unique index.
      const now = await this.requireRow(scheduleId);
      throw EDITABLE.includes(now.status) ? activeSubmissionExists() : new DomainError('INVALID_STATE', 'Only a Draft or Returned schedule can be submitted');
    }

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
  async withdraw(scheduleId: ScheduleId, actor: Actor): Promise<ScheduleView> {
    await this.requireRow(scheduleId);
    // Conditional on Submitted, so a withdraw that loses a race with an approval changes nothing (NFR-002).
    const withdrawn = await this.store.transaction((tx) => tx.updateScheduleStatus(
      scheduleId, 'SUBMITTED', { classification: null, submittedAt: null },
      { scheduleId, from: 'SUBMITTED', to: 'DRAFT', actor, at: this.now() }));
    if (!withdrawn) throw new DomainError('INVALID_STATE', 'Only a Submitted schedule can be withdrawn');
    return this.getSchedule(scheduleId);
  }

  /**
   * Submitted → Approved; records the Advisor Decision, inserts one enrollment job keyed by schedule ID,
   * and notifies the student (AC-013, AC-016). A repeated approval of an Approved-or-later schedule
   * changes nothing and returns the schedule (FR-020, AC-035).
   * @throws DomainError INVALID_STATE from Draft or Returned.
   */
  async approve(scheduleId: ScheduleId, actor: Actor): Promise<ScheduleView> {
    const row = await this.requireRow(scheduleId);
    // A repeated approval is ignored and answers with the schedule as it is (FR-020; test_plan.md G-11).
    if (APPROVED_OR_LATER.includes(row.status)) return this.getSchedule(scheduleId);
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
    if (!approved) {
      // Lost a race: another approval won (ignore this one), or a withdraw did (reject).
      const current = await this.requireRow(scheduleId);
      if (APPROVED_OR_LATER.includes(current.status)) return this.getSchedule(scheduleId);
      throw new DomainError('INVALID_STATE', 'Only a Submitted schedule can be approved');
    }

    const { termName } = await this.describe(row);
    await this.notifier.notify(row.studentId, 'SCHEDULE_APPROVED', scheduleId,
      `Your ${termName} schedule "${row.name}" was approved and will be sent for enrollment.`);
    return this.getSchedule(scheduleId);
  }

  /**
   * Submitted → Returned with the comment; records the Advisor Decision and notifies the student (AC-017).
   * @throws DomainError COMMENT_REQUIRED if comment is missing or empty, INVALID_STATE from any other status.
   */
  async returnSchedule(scheduleId: ScheduleId, comment: string, actor: Actor): Promise<ScheduleView> {
    // A Return always includes a comment (Advisor Decision). Only spaces counts as empty (test_plan.md G-12).
    if (typeof comment !== 'string' || !comment.trim()) throw new DomainError('COMMENT_REQUIRED', 'Enter a comment for the student');
    const row = await this.requireRow(scheduleId);
    if (row.status !== 'SUBMITTED') throw new DomainError('INVALID_STATE', 'Only a Submitted schedule can be returned');

    const now = this.now();
    const returned = await this.store.transaction(async (tx) => {
      if (!await tx.updateScheduleStatus(scheduleId, 'SUBMITTED', { returnComment: comment },
        { scheduleId, from: 'SUBMITTED', to: 'RETURNED', actor, at: now, comment })) {
        return false;
      }
      await tx.insertAdvisorDecision({ scheduleId, advisorId: actor.kind === 'ADVISOR' ? actor.id : '', decision: 'RETURN', comment, decidedAt: now });
      return true;
    });
    if (!returned) throw new DomainError('INVALID_STATE', 'Only a Submitted schedule can be returned');

    const { termName } = await this.describe(row);
    await this.notifier.notify(row.studentId, 'SCHEDULE_RETURNED', scheduleId,
      `Your ${termName} schedule "${row.name}" was returned by your advisor: ${comment}`);
    return this.getSchedule(scheduleId);
  }

  /**
   * Approved → Returned with a system comment (FR-015, AC-026). Called by Revalidator.
   * Returns false, changing nothing, if the schedule is no longer Approved.
   */
  async systemReturn(scheduleId: ScheduleId, comment: string): Promise<boolean> {
    return this.store.transaction((tx) => tx.updateScheduleStatus(
      scheduleId, 'APPROVED', { returnComment: comment },
      { scheduleId, from: 'APPROVED', to: 'RETURNED', actor: { kind: 'SYSTEM' }, at: this.now(), comment }));
  }

  /** Approved → Enrolled or Partially Enrolled (FR-014). Called by Enrollment. */
  async recordEnrollmentOutcome(scheduleId: ScheduleId, status: 'ENROLLED' | 'PARTIALLY_ENROLLED'): Promise<void> {
    const recorded = await this.store.transaction((tx) => tx.updateScheduleStatus(
      scheduleId, 'APPROVED', {}, { scheduleId, from: 'APPROVED', to: status, actor: { kind: 'SYSTEM' }, at: this.now() }));
    if (!recorded) throw new DomainError('INVALID_STATE', 'Only an Approved schedule can be enrolled');
  }
}
