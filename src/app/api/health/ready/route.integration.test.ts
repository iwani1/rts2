import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '@/server/prisma';
import { GET } from './route';

const prisma = getPrisma();

beforeAll(() => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL must point to a disposable PostgreSQL test database');
  const parsed = new URL(databaseUrl);
  const databaseName = decodeURIComponent(parsed.pathname.slice(1));
  if (!['localhost', '127.0.0.1', '::1'].includes(parsed.hostname) || !databaseName.endsWith('_test')) {
    throw new Error('Refusing readiness integration test outside a local database ending in _test');
  }
});

afterAll(async () => { await prisma.$disconnect(); });

describe('GET /api/health/ready with PostgreSQL', () => {
  it('confirms the database dependency against the live test database', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'ok', service: 'richie-tms', dependencies: { database: 'ok' },
    });
  });
});
