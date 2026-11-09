// Access Control (architecture.md §2; FR-019, NFR-001, D1, D2).
// Decides whether a user may perform an action on a student's data, using the student IDs
// and advisor assignments in the registration snapshot. Approve and Return are advisor-only.

import { NotImplementedError } from '../domain/errors';
import type { Action, Actor, AdvisorId, ScheduleId, StudentId, UserId } from '../domain/types';
import type { DataStore } from './dataStore/dataStore';

export class AccessControl {
  constructor(private readonly store: DataStore) {}

  /**
   * Turns the SSO user ID into a Student or Advisor actor using MavLINK data (D1).
   * @throws DomainError UNAUTHENTICATED if userId is missing or is neither a student nor an advisor.
   */
  async resolveActor(_userId: UserId | undefined): Promise<Actor> {
    throw new NotImplementedError('AccessControl.resolveActor');
  }

  /**
   * Returns the actor's student ID, for routes that act on the signed-in student's own data
   * (search, drafts, plan, degree progress).
   * @throws DomainError FORBIDDEN if the actor is not a student.
   */
  async requireStudent(_actor: Actor): Promise<StudentId> {
    throw new NotImplementedError('AccessControl.requireStudent');
  }

  /**
   * Returns the actor's advisor ID, for advisor-only routes (dashboard, review view).
   * @throws DomainError FORBIDDEN if the actor is not an advisor.
   */
  async requireAdvisor(_actor: Actor): Promise<AdvisorId> {
    throw new NotImplementedError('AccessControl.requireAdvisor');
  }

  /**
   * Decides whether the actor may perform `action` on a schedule and returns the owner's student ID.
   * A student may VIEW, EDIT, SUBMIT, WITHDRAW their own schedules; an advisor may VIEW, APPROVE,
   * RETURN schedules of students assigned to them in the current snapshot (FR-019).
   * @throws DomainError NOT_FOUND if the schedule does not exist or the actor may not view it
   *         (identical responses, so existence is not revealed, NFR-001, AC-033),
   *         FORBIDDEN if the actor may view it but not perform `action` (student S approving, AC-034).
   */
  async authorizeSchedule(_actor: Actor, _action: Action, _scheduleId: ScheduleId): Promise<StudentId> {
    throw new NotImplementedError('AccessControl.authorizeSchedule');
  }
}
