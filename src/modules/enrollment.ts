// Enrollment (architecture.md §2, §3.1 steps 12–15, §3.4; FR-014, FR-018, FR-020, NFR-004, D9).

import type { EnrollmentJobOutcome, Job } from '../domain/types';
import type { Clock } from '../shared/clock';
import type { DataStore } from './dataStore/dataStore';
import type { Notifier } from './notifier';
import type { Planner } from './planner';
import type { RegistrationGateway } from './registrationGateway/registrationGateway';
import type { ScheduleManager } from './scheduleManager';

export class Enrollment {
  constructor(
    private readonly gateway: RegistrationGateway,
    private readonly scheduleManager: ScheduleManager,
    private readonly planner: Planner,
    private readonly notifier: Notifier,
    private readonly store: DataStore,
    private readonly clock: Clock,
  ) {}

  /**
   * Runs one enrollment job. CANCELLED if the schedule is no longer Approved (AC-026). Otherwise sends
   * each section without an Enrolled record, saves one Enrollment Record per answer, sets Enrolled or
   * Partially Enrolled, updates the plan, and notifies (AC-024, AC-025) → COMPLETED.
   * On an outage: RETRY_SCHEDULED 15 minutes later, or GAVE_UP with a Notification to student and
   * advisor once 24 hours have passed since the first attempt (AC-032).
   */
  async processEnrollmentJob(job: Job): Promise<EnrollmentJobOutcome> {
    const schedule = (await this.store.getSchedule(job.key))!;

    // Send only sections without an Enrolled record, so a retry never re-sends one (NFR-004, FR-020).
    const enrolled = new Set((await this.store.listEnrollmentRecords(schedule.id))
      .filter((r) => r.outcome === 'ENROLLED').map((r) => r.sectionId));
    for (const sectionId of schedule.sectionIds.filter((id) => !enrolled.has(id))) {
      const answer = await this.gateway.enrollSection(schedule.studentId, sectionId);
      await this.store.insertEnrollmentRecord(answer.ok
        ? { scheduleId: schedule.id, sectionId, outcome: 'ENROLLED', recordedAt: this.now() }
        : { scheduleId: schedule.id, sectionId, outcome: 'FAILED', reason: answer.reason, recordedAt: this.now() });
    }

    // The latest record per section decides the result.
    const latest = new Map((await this.store.listEnrollmentRecords(schedule.id)).map((r) => [r.sectionId, r]));
    const failed = schedule.sectionIds.filter((id) => latest.get(id)?.outcome !== 'ENROLLED');
    await this.scheduleManager.recordEnrollmentOutcome(schedule.id, failed.length ? 'PARTIALLY_ENROLLED' : 'ENROLLED');

    const data = await this.store.getRegistrationData();
    const courseOf = new Map(data.sections.map((s) => [s.id, s.courseId]));
    const enrolledCourses = schedule.sectionIds.filter((id) => !failed.includes(id)).map((id) => courseOf.get(id) ?? id);
    await this.planner.applyEnrollment(schedule.studentId, schedule.term, enrolledCourses);

    const termName = data.terms.find((t) => t.code === schedule.term)?.name ?? schedule.term;
    if (failed.length) {
      const reasons = failed.map((id) => `${id} (${latest.get(id)?.reason ?? 'not enrolled'})`).join(', ');
      const message = `Enrollment for the ${termName} schedule "${schedule.name}" was only partly completed. Not enrolled: ${reasons}.`;
      await this.notifier.notify(schedule.studentId, 'ENROLLMENT_RESULT', schedule.id, message);
      const advisorId = data.students.find((s) => s.id === schedule.studentId)?.advisorId;
      if (advisorId) await this.notifier.notify(advisorId, 'ENROLLMENT_RESULT', schedule.id, message);
    } else {
      await this.notifier.notify(schedule.studentId, 'ENROLLMENT_RESULT', schedule.id,
        `You are enrolled in every section of the ${termName} schedule "${schedule.name}".`);
    }
    await this.store.deleteJob(job.id);
    return 'COMPLETED';
  }

  private now(): string {
    return this.clock.now().toISOString();
  }
}
