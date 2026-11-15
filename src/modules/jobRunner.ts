// Job Runner (architecture.md §2; FR-010 hourly sync, FR-018 15-minute retry, NFR-004, D10).

import type { JobRunSummary, RegistrationData } from '../domain/types';
import type { Clock } from '../shared/clock';
import type { DataStore } from './dataStore/dataStore';
import type { Enrollment } from './enrollment';
import type { Notifier } from './notifier';
import type { RegistrationSync } from './registrationSync';

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;

/** True when `now` falls inside any Term's registration window, both dates inclusive, in UTC (D14). */
const inRegistrationWindow = (data: RegistrationData, now: Date): boolean =>
  data.terms.some((t) =>
    now.getTime() >= Date.parse(`${t.registrationStart}T00:00:00.000Z`)
    && now.getTime() < Date.parse(`${t.registrationEnd}T00:00:00.000Z`) + DAY_MS);

export class JobRunner {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly registrationSync: RegistrationSync,
    private readonly enrollment: Enrollment,
    private readonly notifier: Notifier,
    private readonly store: DataStore,
    private readonly clock: Clock,
  ) {}

  /**
   * Runs every job due at clock.now(): the sync when an hour has passed since the last successful sync
   * inside a registration window (daily outside, D5), due enrollment jobs, and pending emails.
   * Tests call this directly after moving the fake clock.
   */
  async runDueJobs(): Promise<JobRunSummary> {
    const now = this.clock.now();
    const ranAt = now.toISOString();

    const sync = await this.store.getSyncStatus();
    const interval = inRegistrationWindow(await this.store.getRegistrationData(), now) ? HOUR_MS : DAY_MS;
    const syncRan = sync.lastSuccessfulSyncAt === null || now.getTime() - Date.parse(sync.lastSuccessfulSyncAt) >= interval;
    if (syncRan) await this.registrationSync.syncAll();

    const enrollmentJobs: JobRunSummary['enrollmentJobs'] = [];
    for (const job of await this.store.listDueJobs(ranAt, 'ENROLLMENT')) {
      enrollmentJobs.push({ scheduleId: job.key, outcome: await this.enrollment.processEnrollmentJob(job) });
    }

    const emailsSent = await this.notifier.sendPendingEmails();
    return { ranAt, syncRan, enrollmentJobs, emailsSent };
  }

  /** Calls runDueJobs every `intervalMs` in the server process. */
  start(intervalMs: number): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.runDueJobs().catch((err) => console.error(`Background jobs failed: ${(err as Error).message}`));
    }, intervalMs);
    this.timer.unref();
  }

  /** Stops the timer started by start(). */
  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
