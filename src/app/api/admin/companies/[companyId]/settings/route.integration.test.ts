import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { getPrisma } from '@/server/prisma';

const authState = vi.hoisted(() => ({ userId: '', getSession: vi.fn() }));
vi.mock('@/server/auth', () => ({ getAuth: () => ({ api: { getSession: authState.getSession } }) }));

import { GET } from './route';

const prisma = getPrisma();
let companyId = '';
let adminId = '';
let ordinaryUserId = '';

async function makeUser(label: string) {
  return prisma.user.create({
    data: { name: label, email: `${label.toLowerCase().replaceAll(' ', '-')}-${randomUUID()}@example.invalid`, status: 'ACTIVE' },
  });
}
function getRequest(company: string) {
  return new Request(`http://localhost/api/admin/companies/${company}/settings`, { method: 'GET' });
}

beforeAll(async () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL must point to a disposable PostgreSQL test database');
  const parsed = new URL(databaseUrl);
  const databaseName = decodeURIComponent(parsed.pathname.slice(1));
  if (!['localhost', '127.0.0.1', '::1'].includes(parsed.hostname) || !databaseName.endsWith('_test')) {
    throw new Error('Refusing settings-route integration test outside a local database ending in _test');
  }
  const [company, admin, ordinary] = await Promise.all([
    prisma.company.create({ data: { name: `Settings route test ${randomUUID()}` } }),
    makeUser('Settings Route Super Admin'),
    makeUser('Settings Route Ordinary User'),
  ]);
  companyId = company.id;
  adminId = admin.id;
  ordinaryUserId = ordinary.id;
  await prisma.userRoleAssignment.create({
    data: { userId: adminId, roleCode: 'SUPER_ADMIN', assignedById: adminId, reason: 'Integration fixture global administrator' },
  });
  authState.getSession.mockImplementation(async () => authState.userId ? { user: { id: authState.userId } } : null);
});

afterAll(async () => { await prisma.$disconnect(); });

describe('Super Administrator settings-status API with PostgreSQL', () => {
  it('returns status metadata only and disables caching', async () => {
    authState.userId = adminId;
    const response = await GET(getRequest(companyId), { params: Promise.resolve({ companyId }) });
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    const body = await response.json() as { settings: Array<Record<string, unknown>> };
    expect(body.settings.length).toBeGreaterThan(0);
    expect(body.settings.every((setting) => !Object.hasOwn(setting, 'value'))).toBe(true);
    expect(body.settings.every((setting) => !Object.hasOwn(setting, 'reason'))).toBe(true);
    expect(body.settings.every((setting) => typeof setting.configured === 'boolean')).toBe(true);
  });

  it('denies anonymous and non-Super-Administrator sessions', async () => {
    authState.userId = '';
    const anonymous = await GET(getRequest(companyId), { params: Promise.resolve({ companyId }) });
    expect(anonymous.status).toBe(401);

    authState.userId = ordinaryUserId;
    const denied = await GET(getRequest(companyId), { params: Promise.resolve({ companyId }) });
    expect(denied.status).toBe(403);
  });
});
