// Planner (architecture.md §2; FR-004, FR-012, FR-014 plan update, D13).

import { NotImplementedError } from '../domain/errors';
import type { CourseId, PlanOfStudy, StudentId, TermCode } from '../domain/types';
import type { Clock } from '../shared/clock';
import type { DataStore } from './dataStore/dataStore';
import type { DegreeAudit } from './degreeAudit';
import type { Validator } from './validator';

export class Planner {
  constructor(
    private readonly degreeAudit: DegreeAudit,
    private readonly validator: Validator,
    private readonly store: DataStore,
    private readonly clock: Clock,
  ) {}

  /**
   * Returns the stored plan, generating and saving one first if the student has none (FR-004).
   * A generated plan covers every remaining requirement, respects offering patterns and
   * prerequisite order, and stays within the Program credit limit per term (AC-010).
   */
  async getPlan(_studentId: StudentId): Promise<PlanOfStudy> {
    throw new NotImplementedError('Planner.getPlan');
  }

  /**
   * Moves a planned course to another future term and marks it MANUAL. The move is always saved,
   * even when it breaks prerequisite order; the course is flagged instead (AC-011).
   * @throws DomainError INVALID_INPUT if the course is not in the plan or the term is unknown.
   */
  async moveCourse(_studentId: StudentId, _courseId: CourseId, _toTerm: TermCode): Promise<PlanOfStudy> {
    throw new NotImplementedError('Planner.moveCourse');
  }

  /**
   * Regenerates the not-yet-started terms after Course History changes, keeping MANUAL courses
   * unless they became invalid (FR-012, AC-021). Called by Registration Sync.
   */
  async regenerate(_studentId: StudentId): Promise<PlanOfStudy> {
    throw new NotImplementedError('Planner.regenerate');
  }

  /** Makes the plan for `term` match the enrolled courses (FR-014, AC-024). Called by Enrollment. */
  async applyEnrollment(_studentId: StudentId, _term: TermCode, _enrolledCourseIds: CourseId[]): Promise<PlanOfStudy> {
    throw new NotImplementedError('Planner.applyEnrollment');
  }
}
