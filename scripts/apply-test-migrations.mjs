import pg from 'pg';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const connectionString = process.env.TMS_TEST_DATABASE_URL;
if (!connectionString) throw new Error('TMS_TEST_DATABASE_URL must point to a disposable local PostgreSQL database');
const url = new URL(connectionString);
const database = decodeURIComponent(url.pathname.slice(1));
if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname) || !database.endsWith('_test')) {
  throw new Error('Refusing test migration: only a local database whose name ends in _test is allowed');
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = path.join(root, 'prisma', 'migrations');
const migrations = (await readdir(migrationsDir, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const client = new pg.Client({ connectionString });
await client.connect();
try {
  for (const migration of migrations) {
    const sql = await readFile(path.join(migrationsDir, migration, 'migration.sql'), 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('COMMIT');
      console.log(`Applied test SQL migration ${migration}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
} finally {
  await client.end();
}
