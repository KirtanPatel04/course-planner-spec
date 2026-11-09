// Enrollment (architecture.md §2, §3.1 steps 12–15, §3.4; FR-014, FR-018, FR-020, NFR-004, D9).

import { NotImplementedError } from '../domain/errors';
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
  async processEnrollmentJob(_job: Job): Promise<EnrollmentJobOutcome> {
    throw new NotImplementedError('Enrollment.processEnrollmentJob');
  }
}
