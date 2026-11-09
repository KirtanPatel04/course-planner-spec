// Revalidator (architecture.md §2, §3.3; FR-015, D12).

import { NotImplementedError } from '../domain/errors';
import type { ScheduleId, SyncReport } from '../domain/types';
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
  async revalidate(_report: SyncReport): Promise<RevalidationOutcome[]> {
    throw new NotImplementedError('Revalidator.revalidate');
  }
}
