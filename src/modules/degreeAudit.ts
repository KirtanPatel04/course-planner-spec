// Degree Audit (architecture.md §2; FR-005, input to FR-012).

import { DomainError } from '../domain/errors';
import type { DegreeProgress, RequirementStatus, StudentId } from '../domain/types';
import type { DataStore } from './dataStore/dataStore';

export class DegreeAudit {
  constructor(private readonly store: DataStore) {}

  /**
   * Complete / In Progress / Remaining for each Degree Requirement of the student's Program,
   * from Course History, with completed and in-progress courses listed separately.
   * @throws DomainError NOT_FOUND if the student is unknown.
   */
  async getDegreeProgress(studentId: StudentId): Promise<DegreeProgress> {
    const data = await this.store.getRegistrationData();
    const student = data.students.find((s) => s.id === studentId);
    const program = data.programs.find((p) => p.id === student?.programId);
    if (!student || !program) throw new DomainError('NOT_FOUND', 'Student not found');

    const credits = new Map(data.courses.map((c) => [c.id, c.creditHours]));
    const history = data.courseHistory.filter((e) => e.studentId === studentId);
    const sum = (ids: string[]) => ids.reduce((total, id) => total + (credits.get(id) ?? 0), 0);

    return {
      studentId,
      programId: program.id,
      requirements: program.requirements.map((r) => {
        const taken = (status: 'COMPLETED' | 'IN_PROGRESS') => [...new Set(
          history.filter((e) => e.status === status && r.courses.includes(e.courseId)).map((e) => e.courseId))];
        const completedCourseIds = taken('COMPLETED');
        const inProgressCourseIds = taken('IN_PROGRESS').filter((c) => !completedCourseIds.includes(c));
        const creditHoursCompleted = sum(completedCourseIds);
        const creditHoursInProgress = sum(inProgressCourseIds);
        // Any completed or in-progress course makes a requirement In Progress until it is met (test_plan.md G-8).
        const status: RequirementStatus = creditHoursCompleted >= r.creditHoursRequired ? 'COMPLETE'
          : creditHoursCompleted + creditHoursInProgress > 0 ? 'IN_PROGRESS' : 'REMAINING';
        return {
          requirementId: r.id,
          name: r.name,
          status,
          creditHoursRequired: r.creditHoursRequired,
          creditHoursCompleted,
          creditHoursInProgress,
          completedCourseIds,
          inProgressCourseIds,
        };
      }),
    };
  }
}
