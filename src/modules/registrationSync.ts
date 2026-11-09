// Registration Sync (architecture.md §2, §3.3, §3.4; FR-010, FR-018, NFR-003, D4, D5, D6).

import { NotImplementedError } from '../domain/errors';
import type { StudentId, SyncReport, SyncStatus } from '../domain/types';
import type { Clock } from '../shared/clock';
import type { DataStore } from './dataStore/dataStore';
import type { Planner } from './planner';
import type { RegistrationGateway } from './registrationGateway/registrationGateway';
import type { Revalidator } from './revalidator';

export class RegistrationSync {
  constructor(
    private readonly gateway: RegistrationGateway,
    private readonly revalidator: Revalidator,
    private readonly planner: Planner,
    private readonly store: DataStore,
    private readonly clock: Clock,
  ) {}

  /**
   * Copies all registration data into the snapshot, records the sync time, and passes changes to
   * Revalidator (and course-history changes to Planner). On an outage, records it, keeps the last
   * successful sync time, and returns succeeded=false. Never throws for an outage.
   */
  async syncAll(): Promise<SyncReport> {
    throw new NotImplementedError('RegistrationSync.syncAll');
  }

  /**
   * Refreshes the sections, holds, and course history one student's schedules use (FR-010, on open
   * or edit). On an outage, leaves the snapshot as is (results become Unverified). Never throws for an outage.
   */
  async refreshForStudent(_studentId: StudentId): Promise<SyncStatus> {
    throw new NotImplementedError('RegistrationSync.refreshForStudent');
  }

  /** Last successful sync time and whether MavLINK is currently reachable (AC-031). */
  async getSyncStatus(): Promise<SyncStatus> {
    throw new NotImplementedError('RegistrationSync.getSyncStatus');
  }
}
