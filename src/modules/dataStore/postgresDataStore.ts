// PostgreSQL implementation of DataStore (C1).
// The connection is opened lazily, so constructing this class never touches a database.
// Rows keep their domain object in a JSONB `data` column; the columns that queries, constraints
// and conditional updates need (status, student, term, job key, ...) are real columns (D8, D9).
//
// Schema: the server uses the fixed schema `public`, so data survives a restart (NFR-004). Under
// the test runner (NODE_ENV=test) every instance gets its own schema, so each test starts from an
// empty database even when test files run in parallel (plan.md, Design question 1).

import { randomUUID } from 'node:crypto';
import { Pool, PoolClient, QueryResultRow } from 'pg';
import { NotImplementedError } from '../../domain/errors';
import type { DataStore, ScheduleFilter, ScheduleRow } from './dataStore';
import type {
  AdvisorDecision, EnrollmentRecord, ExceptionRequest, Instant, Job, JobKind, Notification,
  PlanOfStudy, RegistrationData, ScheduleId, ScheduleStatus, StatusChange, StudentId, SyncStatus,
} from '../../domain/types';

const ni = (name: string): never => {
  throw new NotImplementedError(`DataStore.${name}`);
};

/** Prefix of the per-instance schemas used under the test runner. */
export const TEST_SCHEMA_PREFIX = 'cp_test_';

const emptyRegistrationData = (): RegistrationData => ({
  terms: [], programs: [], courses: [], sections: [], students: [], advisors: [], holds: [], courseHistory: [],
});

const DDL = `
  CREATE TABLE IF NOT EXISTS registration_snapshot (
    id integer PRIMARY KEY CHECK (id = 1),
    data jsonb NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sync_state (
    id integer PRIMARY KEY CHECK (id = 1),
    last_successful_sync_at text,
    available boolean NOT NULL DEFAULT true
  );
`;

interface Queryable {
  query<R extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]): Promise<{ rows: R[]; rowCount: number | null }>;
}

export class PostgresDataStore implements DataStore {
  private readonly schema = process.env.NODE_ENV === 'test'
    ? `${TEST_SCHEMA_PREFIX}${randomUUID().replace(/-/g, '')}`
    : 'public';
  private pool: Promise<Pool> | null = null;
  /** Set on the store handed to a transaction's work function. */
  private client: PoolClient | null = null;

  constructor(private readonly connectionString: string) {}

  // ----- connection -----

  private connect(): Promise<Pool> {
    if (!this.pool) {
      this.pool = (async () => {
        const pool = new Pool({ connectionString: this.connectionString, max: 5, idleTimeoutMillis: 1000, allowExitOnIdle: true });
        pool.on('error', () => { /* an idle client failed; the next query reconnects */ });
        pool.on('connect', (c) => { void c.query(`SET search_path TO "${this.schema}"`); });
        await pool.query(`CREATE SCHEMA IF NOT EXISTS "${this.schema}"`);
        await pool.query(DDL);
        return pool;
      })();
      this.pool.catch(() => { this.pool = null; });
    }
    return this.pool;
  }

  private async db(): Promise<Queryable> {
    return (this.client ?? await this.connect()) as Queryable;
  }

  async transaction<T>(work: (tx: DataStore) => Promise<T>): Promise<T> {
    if (this.client) return work(this); // already inside a transaction
    const client = await (await this.connect()).connect();
    const tx = new PostgresDataStore(this.connectionString);
    tx.client = client;
    try {
      await client.query('BEGIN');
      const result = await work(tx);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  // ----- snapshot of MavLINK data (D4) -----

  async getRegistrationData(): Promise<RegistrationData> {
    const { rows } = await (await this.db()).query<{ data: RegistrationData }>('SELECT data FROM registration_snapshot WHERE id = 1');
    return rows[0]?.data ?? emptyRegistrationData();
  }

  async saveRegistrationData(data: RegistrationData, syncedAt: Instant): Promise<void> {
    await this.transaction(async (tx) => {
      const db = await (tx as PostgresDataStore).db();
      await db.query(
        `INSERT INTO registration_snapshot (id, data) VALUES (1, $1)
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`, [JSON.stringify(data)]);
      await db.query(
        `INSERT INTO sync_state (id, last_successful_sync_at, available) VALUES (1, $1, true)
         ON CONFLICT (id) DO UPDATE SET last_successful_sync_at = EXCLUDED.last_successful_sync_at, available = true`, [syncedAt]);
    });
  }

  recordSyncFailure(_at: Instant): Promise<void> { return ni('recordSyncFailure'); }

  async getSyncStatus(): Promise<SyncStatus> {
    const { rows } = await (await this.db()).query<{ last_successful_sync_at: string | null; available: boolean }>(
      'SELECT last_successful_sync_at, available FROM sync_state WHERE id = 1');
    return { lastSuccessfulSyncAt: rows[0]?.last_successful_sync_at ?? null, available: rows[0]?.available ?? true };
  }

  // ----- schedules -----

  insertSchedule(_row: ScheduleRow, _change: StatusChange): Promise<void> { return ni('insertSchedule'); }
  getSchedule(_id: ScheduleId): Promise<ScheduleRow | null> { return ni('getSchedule'); }
  listSchedules(_filter: ScheduleFilter): Promise<ScheduleRow[]> { return ni('listSchedules'); }
  updateScheduleContents(_id: ScheduleId, _expected: ScheduleStatus[], _patch: Partial<ScheduleRow>): Promise<boolean> { return ni('updateScheduleContents'); }
  updateScheduleStatus(_id: ScheduleId, _expected: ScheduleStatus, _patch: Partial<ScheduleRow>, _change: StatusChange): Promise<boolean> { return ni('updateScheduleStatus'); }
  listStatusChanges(_id: ScheduleId): Promise<StatusChange[]> { return ni('listStatusChanges'); }
  insertExceptionRequest(_request: ExceptionRequest): Promise<void> { return ni('insertExceptionRequest'); }
  listExceptionRequests(_id: ScheduleId): Promise<ExceptionRequest[]> { return ni('listExceptionRequests'); }
  insertAdvisorDecision(_decision: AdvisorDecision): Promise<void> { return ni('insertAdvisorDecision'); }

  // ----- plans -----

  getPlan(_studentId: StudentId): Promise<PlanOfStudy | null> { return ni('getPlan'); }
  savePlan(_plan: PlanOfStudy): Promise<void> { return ni('savePlan'); }

  // ----- enrollment -----

  insertEnrollmentRecord(_record: EnrollmentRecord): Promise<void> { return ni('insertEnrollmentRecord'); }
  listEnrollmentRecords(_id: ScheduleId): Promise<EnrollmentRecord[]> { return ni('listEnrollmentRecords'); }

  // ----- jobs -----

  enqueueJob(_job: Job): Promise<boolean> { return ni('enqueueJob'); }
  listDueJobs(_now: Instant, _kind?: JobKind): Promise<Job[]> { return ni('listDueJobs'); }
  updateJob(_job: Job): Promise<void> { return ni('updateJob'); }
  deleteJob(_id: string): Promise<void> { return ni('deleteJob'); }

  // ----- notifications -----

  insertNotification(_n: Notification): Promise<void> { return ni('insertNotification'); }
  listNotifications(_recipientId: string): Promise<Notification[]> { return ni('listNotifications'); }
  listUnsentEmails(): Promise<Notification[]> { return ni('listUnsentEmails'); }
  markEmailSent(_id: string, _at: Instant): Promise<void> { return ni('markEmailSent'); }
}
