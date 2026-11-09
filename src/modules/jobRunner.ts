// Job Runner (architecture.md §2; FR-010 hourly sync, FR-018 15-minute retry, NFR-004, D10).

import { NotImplementedError } from '../domain/errors';
import type { JobRunSummary } from '../domain/types';
import type { Clock } from '../shared/clock';
import type { DataStore } from './dataStore/dataStore';
import type { Enrollment } from './enrollment';
import type { Notifier } from './notifier';
import type { RegistrationSync } from './registrationSync';

export class JobRunner {
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
    throw new NotImplementedError('JobRunner.runDueJobs');
  }

  /** Calls runDueJobs every `intervalMs` in the server process. */
  start(_intervalMs: number): void {
    throw new NotImplementedError('JobRunner.start');
  }

  /** Stops the timer started by start(). */
  stop(): void {
    throw new NotImplementedError('JobRunner.stop');
  }
}
