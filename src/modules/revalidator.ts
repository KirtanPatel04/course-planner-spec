// Revalidator (architecture.md §2, §3.3; FR-015, D12).

import type { Flag, RegistrationData, ScheduleId, SyncReport, TermCode, ValidationResult } from '../domain/types';
import type { Clock } from '../shared/clock';
import type { Classifier } from './classifier';
import type { DataStore } from './dataStore/dataStore';
import type { Notifier } from './notifier';
import type { ScheduleManager } from './scheduleManager';
import type { Validator } from './validator';

export interface RevalidationOutcome {
  scheduleId: ScheduleId;
  /** RETURNED: Approved schedule moved to Returned (AC-026). RECLASSIFIED: Submitted (Spec issue 1).
   *  NOTIFIED: Enrolled, status kept (AC-027). Schedules that still pass are not listed. */
  action: 'RETURNED' | 'RECLASSIFIED' | 'NOTIFIED';
}

export class Revalidator {
  constructor(
    private readonly validator: Validator,
    private readonly classifier: Classifier,
    private readonly scheduleManager: ScheduleManager,
    private readonly notifier: Notifier,
    private readonly store: DataStore,
    private readonly clock: Clock,
  ) {}

  /**
   * Re-checks Submitted, Approved, and Enrolled schedules for the current and next Term that use a
   * changed section or belong to a student whose holds or history changed; notifies the student and
   * the advisor for every schedule that no longer passes.
   */
  async revalidate(report: SyncReport): Promise<RevalidationOutcome[]> {
    const changedStudents = new Set([...report.changedHoldStudentIds, ...report.changedHistoryStudentIds]);
    const changedSections = new Set(report.changedSectionIds);
    if (!changedStudents.size && !changedSections.size) return [];

    const data = await this.store.getRegistrationData();
    const rows = (await this.store.listSchedules({ terms: this.currentAndNextTerm(data), statuses: ['SUBMITTED', 'APPROVED', 'ENROLLED'] }))
      .filter((r) => changedStudents.has(r.studentId) || r.sectionIds.some((id) => changedSections.has(id)));

    const outcomes: RevalidationOutcome[] = [];
    for (const row of rows) {
      const results = await this.validator.validateSchedule({ studentId: row.studentId, term: row.term, sectionIds: row.sectionIds });
      const problems = newFlags(row.validationResults, results);
      if (!problems.length) continue;
      const summary = problems.map(({ sectionId, flag }) => `${sectionId}: ${flag.message}`).join('; ');

      let action: RevalidationOutcome['action'] | null = null;
      if (row.status === 'APPROVED') {
        // Approved and not yet sent: back to the student (AC-026). Enrollment checks the status before
        // every attempt, so the queued job is cancelled (D9).
        if (await this.scheduleManager.systemReturn(row.id, `Returned by the system because registration data changed. ${summary}`)) {
          action = 'RETURNED';
        }
      } else if (row.status === 'SUBMITTED') {
        // Spec issue 1 (D12): a Submitted schedule is reclassified, not returned.
        const classification = {
          ...await this.classifier.classify({
            studentId: row.studentId, term: row.term, sectionIds: row.sectionIds, validationResults: results,
            exceptionRequests: await this.store.listExceptionRequests(row.id),
          }),
          classifiedAt: this.clock.now().toISOString(),
        };
        if (await this.store.updateScheduleContents(row.id, ['SUBMITTED'], { validationResults: results, classification })) action = 'RECLASSIFIED';
      } else if (await this.store.updateScheduleContents(row.id, ['ENROLLED'], { validationResults: results })) {
        // Enrolled keeps its status (AC-027); storing the new results stops the same change notifying twice.
        action = 'NOTIFIED';
      }
      if (!action) continue; // the status changed meanwhile

      const termName = data.terms.find((t) => t.code === row.term)?.name ?? row.term;
      const message = `Your ${termName} schedule "${row.name}" no longer passes validation. ${summary}`;
      await this.notifier.notify(row.studentId, 'REVALIDATION_FAILURE', row.id, message);
      const advisorId = data.students.find((s) => s.id === row.studentId)?.advisorId;
      if (advisorId) await this.notifier.notify(advisorId, 'REVALIDATION_FAILURE', row.id, message);
      outcomes.push({ scheduleId: row.id, action });
    }
    return outcomes;
  }

  /**
   * FR-015's "current and next Term": the term in progress (or, between terms, the next one to start)
   * and the term after it (test_plan.md G-5).
   */
  private currentAndNextTerm(data: RegistrationData): TermCode[] {
    const today = this.clock.now().toISOString().slice(0, 10);
    const terms = [...data.terms].sort((a, b) => a.startDate.localeCompare(b.startDate));
    const current = terms.findIndex((t) => t.endDate >= today);
    return current < 0 ? [] : terms.slice(current, current + 2).map((t) => t.code);
  }
}

/** Flags in `after` that were not on the same section in `before`: what the data change broke. */
function newFlags(before: ValidationResult[], after: ValidationResult[]): { sectionId: string; flag: Flag }[] {
  return after.flatMap((r) => {
    const old = new Set(before.find((b) => b.sectionId === r.sectionId)?.flags.map((f) => f.code) ?? []);
    return r.flags.filter((f) => !old.has(f.code)).map((flag) => ({ sectionId: r.sectionId, flag }));
  });
}

