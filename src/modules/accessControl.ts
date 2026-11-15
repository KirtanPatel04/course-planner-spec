// Access Control (architecture.md §2; FR-019, NFR-001, D1, D2).
// Decides whether a user may perform an action on a student's data, using the student IDs
// and advisor assignments in the registration snapshot. Approve and Return are advisor-only.

import { DomainError, NotImplementedError } from '../domain/errors';
import type { Action, Actor, AdvisorId, ScheduleId, StudentId, UserId } from '../domain/types';
import type { DataStore } from './dataStore/dataStore';

/** What a student may do to their own schedules (FR-019). Approve and Return are advisor-only. */
const STUDENT_ACTIONS: Action[] = ['VIEW', 'EDIT', 'SUBMIT', 'WITHDRAW'];

export class AccessControl {
  constructor(private readonly store: DataStore) {}

  /**
   * Turns the SSO user ID into a Student or Advisor actor using MavLINK data (D1).
   * @throws DomainError UNAUTHENTICATED if userId is missing or is neither a student nor an advisor.
   */
  async resolveActor(userId: UserId | undefined): Promise<Actor> {
    if (userId) {
      const data = await this.store.getRegistrationData();
      if (data.students.some((s) => s.id === userId)) return { kind: 'STUDENT', id: userId };
      if (data.advisors.some((a) => a.id === userId)) return { kind: 'ADVISOR', id: userId };
    }
    throw new DomainError('UNAUTHENTICATED', 'Sign in with a UNO account to use the Course Planner');
  }

  /**
   * Returns the actor's student ID, for routes that act on the signed-in student's own data
   * (search, drafts, plan, degree progress).
   * @throws DomainError FORBIDDEN if the actor is not a student.
   */
  async requireStudent(actor: Actor): Promise<StudentId> {
    if (actor.kind !== 'STUDENT') throw new DomainError('FORBIDDEN', 'Only students can do this');
    return actor.id;
  }

  /**
   * Returns the actor's advisor ID, for advisor-only routes (dashboard, review view).
   * @throws DomainError FORBIDDEN if the actor is not an advisor.
   */
  async requireAdvisor(actor: Actor): Promise<AdvisorId> {
    if (actor.kind !== 'ADVISOR') throw new DomainError('FORBIDDEN', 'Only advisors can do this');
    return actor.id;
  }

  /**
   * Decides whether the actor may perform `action` on a schedule and returns the owner's student ID.
   * A student may VIEW, EDIT, SUBMIT, WITHDRAW their own schedules; an advisor may VIEW, APPROVE,
   * RETURN schedules of students assigned to them in the current snapshot (FR-019).
   * @throws DomainError NOT_FOUND if the schedule does not exist or the actor may not view it
   *         (identical responses, so existence is not revealed, NFR-001, AC-033),
   *         FORBIDDEN if the actor may view it but not perform `action` (student S approving, AC-034).
   */
  async authorizeSchedule(actor: Actor, action: Action, scheduleId: ScheduleId): Promise<StudentId> {
    // One generic answer for "missing" and "not yours", so a request cannot reveal that a schedule exists.
    const notFound = () => new DomainError('NOT_FOUND', 'Schedule not found');
    const schedule = await this.store.getSchedule(scheduleId);
    if (!schedule) throw notFound();

    if (actor.kind === 'STUDENT') {
      if (schedule.studentId !== actor.id) throw notFound();
      if (!STUDENT_ACTIONS.includes(action)) throw new DomainError('FORBIDDEN', 'Students cannot perform this action');
      return schedule.studentId;
    }
    throw new NotImplementedError('AccessControl.authorizeSchedule (advisor actions)');
  }
}
