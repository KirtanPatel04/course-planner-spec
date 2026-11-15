// Enrollment (architecture.md §2, §3.1 steps 12–15, §3.4; FR-014, FR-018, FR-020, NFR-004, D9).

import { RegistrationUnavailableError } from '../domain/errors';
import type { EnrollmentJobOutcome, Job } from '../domain/types';
import type { Clock } from '../shared/clock';
import type { DataStore, ScheduleRow } from './dataStore/dataStore';
import type { Notifier } from './notifier';
import type { Planner } from './planner';
import type { RegistrationGateway } from './registrationGateway/registrationGateway';
import type { ScheduleManager } from './scheduleManager';

const RETRY_AFTER_MS = 15 * 60_000; // FR-018
const GIVE_UP_AFTER_MS = 24 * 60 * 60_000; // FR-018

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
    const schedule = await this.store.getSchedule(job.key);
    // Checked before every attempt, including retries: a schedule that was returned (AC-026) or
    // withdrawn is never enrolled (D9).
    if (schedule?.status !== 'APPROVED') {
      await this.store.deleteJob(job.id);
      return 'CANCELLED';
    }
    const now = this.clock.now();
    const firstAttemptAt = job.firstAttemptAt ?? now.toISOString();

    // Send only sections without an Enrolled record, so a retry never re-sends one (NFR-004, FR-020).
    const enrolled = new Set((await this.store.listEnrollmentRecords(schedule.id))
      .filter((r) => r.outcome === 'ENROLLED').map((r) => r.sectionId));
    try {
      for (const sectionId of schedule.sectionIds.filter((id) => !enrolled.has(id))) {
        const answer = await this.gateway.enrollSection(schedule.studentId, sectionId);
        await this.store.insertEnrollmentRecord(answer.ok
          ? { scheduleId: schedule.id, sectionId, outcome: 'ENROLLED', recordedAt: this.now() }
          : { scheduleId: schedule.id, sectionId, outcome: 'FAILED', reason: answer.reason, recordedAt: this.now() });
      }
    } catch (err) {
      if (!(err instanceof RegistrationUnavailableError)) throw err;
      return this.handleOutage(job, schedule, firstAttemptAt, now);
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

  /**
   * MavLINK cannot be reached (FR-018): retry 15 minutes later, until 24 hours have passed since the
   * first attempt. Then stop and tell the student and advisor. The schedule stays Approved (test_plan.md G-10).
   */
  private async handleOutage(job: Job, schedule: ScheduleRow, firstAttemptAt: string, now: Date): Promise<EnrollmentJobOutcome> {
    if (now.getTime() - Date.parse(firstAttemptAt) >= GIVE_UP_AFTER_MS) {
      const data = await this.store.getRegistrationData();
      const termName = data.terms.find((t) => t.code === schedule.term)?.name ?? schedule.term;
      const message = `Enrollment for the ${termName} schedule "${schedule.name}" did not go through: the registration system `
        + 'could not be reached for 24 hours. Contact your advisor to enroll.';
      await this.notifier.notify(schedule.studentId, 'ENROLLMENT_RESULT', schedule.id, message);
      const advisorId = data.students.find((s) => s.id === schedule.studentId)?.advisorId;
      if (advisorId) await this.notifier.notify(advisorId, 'ENROLLMENT_RESULT', schedule.id, message);
      await this.store.deleteJob(job.id);
      return 'GAVE_UP';
    }
    await this.store.updateJob({
      ...job,
      firstAttemptAt,
      attempts: job.attempts + 1,
      runAt: new Date(now.getTime() + RETRY_AFTER_MS).toISOString(),
    });
    return 'RETRY_SCHEDULED';
  }

  private now(): string {
    return this.clock.now().toISOString();
  }
}
