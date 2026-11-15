// Registration Sync (architecture.md §2, §3.3, §3.4; FR-010, FR-018, NFR-003, D4, D5, D6).

import { NotImplementedError } from '../domain/errors';
import type { RegistrationData, StudentId, SyncReport, SyncStatus } from '../domain/types';
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
    const syncedAt = this.clock.now().toISOString();
    const fresh = await this.gateway.fetchRegistrationData();
    const before = await this.store.getSyncStatus();
    const previous = await this.store.getRegistrationData();
    // The first successful sync sets the baseline: with nothing to compare against, it reports no
    // changes (D6; plan.md Design question 2).
    const report: SyncReport = before.lastSuccessfulSyncAt === null
      ? { succeeded: true, syncedAt, changedSectionIds: [], changedHoldStudentIds: [], changedHistoryStudentIds: [] }
      : { succeeded: true, syncedAt, ...diff(previous, fresh) };
    await this.store.saveRegistrationData(fresh, syncedAt);
    return report;
  }

  /**
   * Refreshes the sections, holds, and course history one student's schedules use (FR-010, on open
   * or edit). On an outage, leaves the snapshot as is (results become Unverified). Never throws for an outage.
   */
  async refreshForStudent(studentId: StudentId): Promise<SyncStatus> {
    const fresh = await this.gateway.fetchRegistrationData({ studentId });
    const snapshot = await this.store.getRegistrationData();
    const status = await this.store.getSyncStatus();

    // Replace only what this student's schedules use: their sections, holds, and course history.
    const used = new Set((await this.store.listSchedules({ studentId })).flatMap((s) => s.sectionIds));
    const freshSections = new Map(fresh.sections.filter((s) => used.has(s.id)).map((s) => [s.id, s]));
    const merged: RegistrationData = {
      ...snapshot,
      sections: snapshot.sections.map((s) => freshSections.get(s.id) ?? s),
      holds: [...snapshot.holds.filter((h) => h.studentId !== studentId), ...fresh.holds.filter((h) => h.studentId === studentId)],
      courseHistory: [
        ...snapshot.courseHistory.filter((e) => e.studentId !== studentId),
        ...fresh.courseHistory.filter((e) => e.studentId === studentId),
      ],
    };
    // A partial refresh marks MavLINK reachable but keeps the last full sync time, so the hourly
    // full sync (AC-020) is not pushed back by students opening schedules (plan.md Design question 3).
    await this.store.saveRegistrationData(merged, status.lastSuccessfulSyncAt ?? this.clock.now().toISOString());
    return this.store.getSyncStatus();
  }

  /** Last successful sync time and whether MavLINK is currently reachable (AC-031). */
  async getSyncStatus(): Promise<SyncStatus> {
    throw new NotImplementedError('RegistrationSync.getSyncStatus');
  }
}

type Changes = Pick<SyncReport, 'changedSectionIds' | 'changedHoldStudentIds' | 'changedHistoryStudentIds'>;

/** What changed between two snapshots: sections by ID, holds and course history by student (D6). */
function diff(before: RegistrationData, after: RegistrationData): Changes {
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

  const oldSections = new Map(before.sections.map((s) => [s.id, s]));
  const newSections = new Map(after.sections.map((s) => [s.id, s]));
  const changedSectionIds = [...new Set([...oldSections.keys(), ...newSections.keys()])]
    .filter((id) => !same(oldSections.get(id), newSections.get(id)));

  const changedStudents = <T extends { studentId: string }>(a: T[], b: T[]) => {
    const ids = new Set([...a, ...b].map((x) => x.studentId));
    return [...ids].filter((id) => !same(a.filter((x) => x.studentId === id), b.filter((x) => x.studentId === id)));
  };

  return {
    changedSectionIds,
    changedHoldStudentIds: changedStudents(before.holds, after.holds),
    changedHistoryStudentIds: changedStudents(before.courseHistory, after.courseHistory),
  };
}
