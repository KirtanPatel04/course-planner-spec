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

/** PostgreSQL error code for a unique-constraint violation. */
const UNIQUE_VIOLATION = '23505';

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
  CREATE TABLE IF NOT EXISTS schedules (
    id text PRIMARY KEY,
    student_id text NOT NULL,
    term text NOT NULL,
    status text NOT NULL,
    created_at text NOT NULL,
    data jsonb NOT NULL
  );
  -- One Submitted-or-later schedule per student per Term (Draft Schedule; AC-014, D8).
  CREATE UNIQUE INDEX IF NOT EXISTS one_active_schedule_per_term ON schedules (student_id, term)
    WHERE status IN ('SUBMITTED', 'APPROVED', 'ENROLLED', 'PARTIALLY_ENROLLED');
  CREATE TABLE IF NOT EXISTS status_changes (
    seq bigserial PRIMARY KEY,
    schedule_id text NOT NULL,
    data jsonb NOT NULL
  );
  CREATE TABLE IF NOT EXISTS exception_requests (
    seq bigserial PRIMARY KEY,
    schedule_id text NOT NULL,
    data jsonb NOT NULL
  );
  CREATE TABLE IF NOT EXISTS enrollment_records (
    seq bigserial PRIMARY KEY,
    schedule_id text NOT NULL,
    data jsonb NOT NULL
  );
  CREATE TABLE IF NOT EXISTS advisor_decisions (
    seq bigserial PRIMARY KEY,
    schedule_id text NOT NULL,
    data jsonb NOT NULL
  );
  CREATE TABLE IF NOT EXISTS plans (
    student_id text PRIMARY KEY,
    data jsonb NOT NULL
  );
  CREATE TABLE IF NOT EXISTS jobs (
    id text PRIMARY KEY,
    kind text NOT NULL,
    key text NOT NULL,
    run_at text NOT NULL,
    data jsonb NOT NULL,
    UNIQUE (kind, key)
  );
  CREATE TABLE IF NOT EXISTS notifications (
    seq bigserial PRIMARY KEY,
    id text NOT NULL UNIQUE,
    recipient_id text NOT NULL,
    email_sent_at text,
    data jsonb NOT NULL
  );
`;

/** The parts of a ScheduleRow kept in real columns rather than in `data`. */
const toScheduleRow = (r: { status: ScheduleStatus; data: ScheduleRow }): ScheduleRow => ({ ...r.data, status: r.status });
const withoutStatus = (patch: Partial<ScheduleRow>): Partial<ScheduleRow> => {
  const { status: _status, ...rest } = patch;
  return rest;
};

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
        const pool = new Pool({
          connectionString: this.connectionString,
          options: `-c search_path=${this.schema}`,
          max: 5,
          idleTimeoutMillis: 1000,
          allowExitOnIdle: true,
        });
        pool.on('error', () => { /* an idle client failed; the next query reconnects */ });
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

  async insertSchedule(row: ScheduleRow, change: StatusChange): Promise<void> {
    await this.transaction(async (tx) => {
      const db = await (tx as PostgresDataStore).db();
      await db.query(
        'INSERT INTO schedules (id, student_id, term, status, created_at, data) VALUES ($1, $2, $3, $4, $5, $6)',
        [row.id, row.studentId, row.term, row.status, row.createdAt, JSON.stringify(withoutStatus(row))]);
      await db.query('INSERT INTO status_changes (schedule_id, data) VALUES ($1, $2)', [row.id, JSON.stringify(change)]);
    });
  }

  async getSchedule(id: ScheduleId): Promise<ScheduleRow | null> {
    const { rows } = await (await this.db()).query<{ status: ScheduleStatus; data: ScheduleRow }>(
      'SELECT status, data FROM schedules WHERE id = $1', [id]);
    return rows[0] ? toScheduleRow(rows[0]) : null;
  }

  async listSchedules(filter: ScheduleFilter): Promise<ScheduleRow[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (sql: string, value: unknown) => { params.push(value); where.push(sql.replace(':v', `$${params.length}`)); };
    if (filter.studentId !== undefined) add('student_id = :v', filter.studentId);
    if (filter.studentIds !== undefined) add('student_id = ANY(:v)', filter.studentIds);
    if (filter.term !== undefined) add('term = :v', filter.term);
    if (filter.terms !== undefined) add('term = ANY(:v)', filter.terms);
    if (filter.statuses !== undefined) add('status = ANY(:v)', filter.statuses);
    if (filter.sectionIds !== undefined) add(`data->'sectionIds' ?| :v`, filter.sectionIds);
    const { rows } = await (await this.db()).query<{ status: ScheduleStatus; data: ScheduleRow }>(
      `SELECT status, data FROM schedules ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at, id`, params);
    return rows.map(toScheduleRow);
  }

  async updateScheduleContents(id: ScheduleId, expectedStatuses: ScheduleStatus[], patch: Partial<ScheduleRow>): Promise<boolean> {
    const { rowCount } = await (await this.db()).query(
      'UPDATE schedules SET data = data || $3::jsonb WHERE id = $1 AND status = ANY($2)',
      [id, expectedStatuses, JSON.stringify(withoutStatus(patch))]);
    return (rowCount ?? 0) > 0;
  }

  async updateScheduleStatus(id: ScheduleId, expected: ScheduleStatus, patch: Partial<ScheduleRow>, change: StatusChange): Promise<boolean> {
    // A conditional update (D8): it changes the row only if the status is still `expected`. A racing
    // request waits for the row lock and then finds the status changed. The change runs in a
    // savepoint, so a constraint violation returns false without aborting the caller's transaction.
    return this.transaction(async (tx) => {
      const db = await (tx as PostgresDataStore).db();
      await db.query('SAVEPOINT status_change');
      try {
        const { rowCount } = await db.query(
          'UPDATE schedules SET status = $3, data = data || $4::jsonb WHERE id = $1 AND status = $2',
          [id, expected, change.to, JSON.stringify(withoutStatus(patch))]);
        if (!rowCount) {
          await db.query('RELEASE SAVEPOINT status_change');
          return false;
        }
        await db.query('INSERT INTO status_changes (schedule_id, data) VALUES ($1, $2)', [id, JSON.stringify(change)]);
        await db.query('RELEASE SAVEPOINT status_change');
        return true;
      } catch (err) {
        await db.query('ROLLBACK TO SAVEPOINT status_change');
        if ((err as { code?: string }).code === UNIQUE_VIOLATION) return false;
        throw err;
      }
    });
  }

  async listStatusChanges(id: ScheduleId): Promise<StatusChange[]> {
    const { rows } = await (await this.db()).query<{ data: StatusChange }>(
      'SELECT data FROM status_changes WHERE schedule_id = $1 ORDER BY seq', [id]);
    return rows.map((r) => r.data);
  }

  insertExceptionRequest(_request: ExceptionRequest): Promise<void> { return ni('insertExceptionRequest'); }

  async listExceptionRequests(id: ScheduleId): Promise<ExceptionRequest[]> {
    const { rows } = await (await this.db()).query<{ data: ExceptionRequest }>(
      'SELECT data FROM exception_requests WHERE schedule_id = $1 ORDER BY seq', [id]);
    return rows.map((r) => r.data);
  }
  async insertAdvisorDecision(decision: AdvisorDecision): Promise<void> {
    await (await this.db()).query('INSERT INTO advisor_decisions (schedule_id, data) VALUES ($1, $2)', [decision.scheduleId, JSON.stringify(decision)]);
  }

  // ----- plans -----

  async getPlan(studentId: StudentId): Promise<PlanOfStudy | null> {
    const { rows } = await (await this.db()).query<{ data: PlanOfStudy }>('SELECT data FROM plans WHERE student_id = $1', [studentId]);
    return rows[0]?.data ?? null;
  }

  async savePlan(plan: PlanOfStudy): Promise<void> {
    await (await this.db()).query(
      `INSERT INTO plans (student_id, data) VALUES ($1, $2)
       ON CONFLICT (student_id) DO UPDATE SET data = EXCLUDED.data`, [plan.studentId, JSON.stringify(plan)]);
  }

  // ----- enrollment -----

  insertEnrollmentRecord(_record: EnrollmentRecord): Promise<void> { return ni('insertEnrollmentRecord'); }
  async listEnrollmentRecords(id: ScheduleId): Promise<EnrollmentRecord[]> {
    const { rows } = await (await this.db()).query<{ data: EnrollmentRecord }>(
      'SELECT data FROM enrollment_records WHERE schedule_id = $1 ORDER BY seq', [id]);
    return rows.map((r) => r.data);
  }

  // ----- jobs -----

  async enqueueJob(job: Job): Promise<boolean> {
    const { rowCount } = await (await this.db()).query(
      'INSERT INTO jobs (id, kind, key, run_at, data) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (kind, key) DO NOTHING',
      [job.id, job.kind, job.key, job.runAt, JSON.stringify(job)]);
    return (rowCount ?? 0) > 0;
  }
  async listDueJobs(now: Instant, kind?: JobKind): Promise<Job[]> {
    // ISO-8601 UTC instants in one format compare in time order as text (D14).
    const { rows } = await (await this.db()).query<{ data: Job }>(
      'SELECT data FROM jobs WHERE run_at <= $1 AND ($2::text IS NULL OR kind = $2) ORDER BY run_at, id', [now, kind ?? null]);
    return rows.map((r) => r.data);
  }
  updateJob(_job: Job): Promise<void> { return ni('updateJob'); }
  deleteJob(_id: string): Promise<void> { return ni('deleteJob'); }

  // ----- notifications -----

  async insertNotification(n: Notification): Promise<void> {
    await (await this.db()).query(
      'INSERT INTO notifications (id, recipient_id, email_sent_at, data) VALUES ($1, $2, $3, $4)',
      [n.id, n.recipientId, n.emailSentAt, JSON.stringify(n)]);
  }

  async listNotifications(recipientId: string): Promise<Notification[]> {
    const { rows } = await (await this.db()).query<{ data: Notification }>(
      'SELECT data FROM notifications WHERE recipient_id = $1 ORDER BY seq DESC', [recipientId]);
    return rows.map((r) => r.data);
  }
  async listUnsentEmails(): Promise<Notification[]> {
    const { rows } = await (await this.db()).query<{ data: Notification }>(
      'SELECT data FROM notifications WHERE email_sent_at IS NULL ORDER BY seq');
    return rows.map((r) => r.data);
  }

  async markEmailSent(id: string, at: Instant): Promise<void> {
    await (await this.db()).query(
      `UPDATE notifications SET email_sent_at = $2, data = jsonb_set(data, '{emailSentAt}', to_jsonb($2::text)) WHERE id = $1`, [id, at]);
  }
}
