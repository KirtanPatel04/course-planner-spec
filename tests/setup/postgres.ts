// Vitest global setup (not a test). Makes `npm test` work on a fresh machine with a local PostgreSQL:
// creates the test database if it is missing, and removes the per-test schemas that
// PostgresDataStore creates under the test runner (plan.md, Design question 1) before and after a run.

import { Client } from 'pg';
import { TEST_SCHEMA_PREFIX } from '../../src/modules/dataStore/postgresDataStore';

const url = process.env.TEST_DATABASE_URL ?? 'postgres://localhost:5432/course_planner_test';

async function ensureDatabase(): Promise<void> {
  const target = new URL(url);
  const name = decodeURIComponent(target.pathname.slice(1));
  const admin = new URL(url);
  admin.pathname = '/postgres';
  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (!rowCount) await client.query(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
  } finally {
    await client.end();
  }
}

async function dropTestSchemas(): Promise<void> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query<{ nspname: string }>(
      'SELECT nspname FROM pg_namespace WHERE nspname LIKE $1', [`${TEST_SCHEMA_PREFIX}%`]);
    for (const { nspname } of rows) await client.query(`DROP SCHEMA IF EXISTS "${nspname}" CASCADE`);
  } finally {
    await client.end();
  }
}

export async function setup(): Promise<() => Promise<void>> {
  await ensureDatabase();
  await dropTestSchemas();
  return dropTestSchemas;
}
