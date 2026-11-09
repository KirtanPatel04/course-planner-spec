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
  async getDashboard(_advisorId: AdvisorId): Promise<DashboardEntry[]> {
    throw new NotImplementedError('ReviewQueue.getDashboard');
  }

  /**
   * The schedule, the student's plan for that Term, and course history together, with courses not in
   * the plan for that Term listed in highlightedCourseIds (FR-009, AC-018).
   */
  async getReviewView(_scheduleId: ScheduleId): Promise<ReviewView> {
    throw new NotImplementedError('ReviewQueue.getReviewView');
  }
}
