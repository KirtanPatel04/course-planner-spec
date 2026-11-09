// Schedule Manager (architecture.md §2; FR-002, FR-006, FR-008, FR-015, FR-016, FR-017,
// NFR-002, NFR-007, D8, D9). Owns Draft Schedule contents and applies every status transition,
// recording each one in the schedule history. Authorization is done by the caller (API → Access Control).

import { NotImplementedError } from '../domain/errors';
import type {
  Actor, ReasonCode, ScheduleId, ScheduleSummary, ScheduleView, SectionId, StudentId, TermCode,
} from '../domain/types';
import type { Clock } from '../shared/clock';
import type { Classifier } from './classifier';
import type { DataStore } from './dataStore/dataStore';
import type { Notifier } from './notifier';
import type { Validator } from './validator';

export class ScheduleManager {
  constructor(
    private readonly validator: Validator,
    private readonly classifier: Classifier,
    private readonly notifier: Notifier,
    private readonly store: DataStore,
    private readonly clock: Clock,
  ) {}

  /**
   * Creates an empty Draft schedule for a Term. A student may have several Drafts per Term.
   * @throws DomainError INVALID_INPUT if the term is unknown.
   */
  async createDraft(_studentId: StudentId, _term: TermCode, _name?: string): Promise<ScheduleView> {
    throw new NotImplementedError('ScheduleManager.createDraft');
  }

  /** The student's schedules, optionally for one Term. */
  async listSchedules(_studentId: StudentId, _term?: TermCode): Promise<ScheduleSummary[]> {
    throw new NotImplementedError('ScheduleManager.listSchedules');
  }

  /** The schedule with fresh Validation Results for every section, history, and sync state. */
  async getSchedule(_scheduleId: ScheduleId): Promise<ScheduleView> {
    throw new NotImplementedError('ScheduleManager.getSchedule');
  }

  /**
   * Adds a section and returns the schedule with results for every section (AC-003, AC-004).
   * Flagged sections are still added.
   * @throws DomainError INVALID_INPUT (unknown section or already in the schedule),
   *         SECTION_TERM_MISMATCH, INVALID_STATE unless status is Draft or Returned.
   */
  async addSection(_scheduleId: ScheduleId, _sectionId: SectionId): Promise<ScheduleView> {
    throw new NotImplementedError('ScheduleManager.addSection');
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
  async submit(_scheduleId: ScheduleId, _actor: Actor): Promise<ScheduleView> {
    throw new NotImplementedError('ScheduleManager.submit');
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
  async approve(_scheduleId: ScheduleId, _actor: Actor): Promise<ScheduleView> {
    throw new NotImplementedError('ScheduleManager.approve');
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
