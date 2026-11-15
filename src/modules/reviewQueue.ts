// Review Queue (architecture.md §2; FR-007, FR-009).

import { NotImplementedError } from '../domain/errors';
import type { AdvisorId, DashboardEntry, ReviewView, ScheduleId } from '../domain/types';
import type { DataStore } from './dataStore/dataStore';

export class ReviewQueue {
  constructor(private readonly store: DataStore) {}

  /**
   * The advisor's Submitted schedules (assigned students only): Needs Review first, then Routine,
   * oldest submission first within each group (AC-015).
   */
  async getDashboard(advisorId: AdvisorId): Promise<DashboardEntry[]> {
    const students = (await this.store.getRegistrationData()).students.filter((s) => s.advisorId === advisorId);
    if (!students.length) return [];
    const nameOf = new Map(students.map((s) => [s.id, s.name]));
    const rows = await this.store.listSchedules({ studentIds: students.map((s) => s.id), statuses: ['SUBMITTED'] });
    const group = (e: DashboardEntry) => (e.classification.label === 'NEEDS_REVIEW' ? 0 : 1);
    return rows
      .filter((r) => r.classification && r.submittedAt)
      .map((r): DashboardEntry => ({
        scheduleId: r.id,
        studentId: r.studentId,
        studentName: nameOf.get(r.studentId) ?? '',
        term: r.term,
        submittedAt: r.submittedAt!,
        classification: r.classification!,
      }))
      // Needs Review first, then Routine; oldest submission first in each group (AC-015, architecture.md Spec issue 9).
      .sort((a, b) => group(a) - group(b) || a.submittedAt.localeCompare(b.submittedAt) || a.scheduleId.localeCompare(b.scheduleId));
  }

  /**
   * The schedule, the student's plan for that Term, and course history together, with courses not in
   * the plan for that Term listed in highlightedCourseIds (FR-009, AC-018).
   */
  async getReviewView(_scheduleId: ScheduleId): Promise<ReviewView> {
    throw new NotImplementedError('ReviewQueue.getReviewView');
  }
}
