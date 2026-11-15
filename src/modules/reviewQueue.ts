// Review Queue (architecture.md §2; FR-007, FR-009).

import { DomainError } from '../domain/errors';
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
  async getReviewView(scheduleId: ScheduleId): Promise<ReviewView> {
    const row = await this.store.getSchedule(scheduleId);
    if (!row) throw new DomainError('NOT_FOUND', 'Schedule not found');
    const data = await this.store.getRegistrationData();
    const sync = await this.store.getSyncStatus();
    const courseOf = new Map(data.sections.map((s) => [s.id, s.courseId]));
    const credits = new Map(data.courses.map((c) => [c.id, c.creditHours]));

    const planForTerm = (await this.store.getPlan(row.studentId))?.terms.find((t) => t.term === row.term)?.courses ?? [];
    const planned = new Set(planForTerm.map((c) => c.courseId));
    const scheduledCourses = [...new Set(row.sectionIds.map((id) => courseOf.get(id) ?? ''))];

    return {
      // Review Queue reads the Data Store only (architecture.md §2), so the schedule shows the
      // validation results stored at submission rather than re-running Validator.
      schedule: {
        id: row.id,
        studentId: row.studentId,
        term: row.term,
        name: row.name,
        status: row.status,
        sectionIds: row.sectionIds,
        totalCreditHours: row.sectionIds.reduce((sum, id) => sum + (credits.get(courseOf.get(id) ?? '') ?? 0), 0),
        validationResults: row.validationResults,
        exceptionRequests: (await this.store.listExceptionRequests(row.id)).filter((e) => row.sectionIds.includes(e.sectionId)),
        classification: row.classification,
        returnComment: row.returnComment,
        enrollmentRecords: await this.store.listEnrollmentRecords(row.id),
        history: await this.store.listStatusChanges(row.id),
        lastSyncedAt: sync.lastSuccessfulSyncAt,
        canSubmit: sync.available,
      },
      planForTerm,
      courseHistory: data.courseHistory.filter((e) => e.studentId === row.studentId),
      highlightedCourseIds: scheduledCourses.filter((c) => c && !planned.has(c)),
    };
  }
}
