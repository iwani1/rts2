import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { getPrisma } from '@/server/prisma';

const authState = vi.hoisted(() => ({ userId: '', getSession: vi.fn() }));
vi.mock('@/server/auth', () => ({ getAuth: () => ({ api: { getSession: authState.getSession } }) }));

import { GET, POST } from './route';
import { DELETE } from '../../../role-assignments/[assignmentId]/route';

const prisma = getPrisma();
let companyId = '';
let adminId = '';
let targetId = '';
let ordinaryActorId = '';

async function makeUser(label: string) {
  return prisma.user.create({
    data: { name: label, email: `${label.toLowerCase().replaceAll(' ', '-')}-${randomUUID()}@example.invalid`, status: 'ACTIVE' },
  });
}
function request(url: string, method: string, body?: unknown) {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeAll(async () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL must point to a disposable PostgreSQL test database');
  const parsed = new URL(databaseUrl);
  if (!['localhost', '127.0.0.1', '::1'].includes(parsed.hostname) || !decodeURIComponent(parsed.pathname.slice(1)).endsWith('_test')) {
    throw new Error('Refusing role-route integration tests outside a local database ending in _test');
  }
  const [company, admin, target, ordinaryActor] = await Promise.all([
    prisma.company.create({ data: { name: `Role route test ${randomUUID()}` } }),
    makeUser('Role Route Super Admin'),
    makeUser('Role Route Target'),
    makeUser('Role Route Ordinary Actor'),
  ]);
  companyId = company.id;
  adminId = admin.id;
  targetId = target.id;
  ordinaryActorId = ordinaryActor.id;
  await prisma.userRoleAssignment.create({
    data: { userId: adminId, roleCode: 'SUPER_ADMIN', assignedById: adminId, reason: 'Integration fixture global administrator' },
  });
  authState.getSession.mockImplementation(async () => authState.userId ? { user: { id: authState.userId } } : null);
});

afterAll(async () => { await prisma.$disconnect(); });

describe('Super Administrator role API with PostgreSQL persistence', () => {
  it('lists the real role catalogue and target assignment history for an active Super Administrator', async () => {
    authState.userId = adminId;
    const response = await GET(request(`http://localhost/api/admin/users/${targetId}/roles`, 'GET'), { params: Promise.resolve({ userId: targetId }) });
    expect(response.status).toBe(200);
    const body = await response.json() as { user: { id: string }; roles: Array<{ code: string }>; assignments: unknown[] };
    expect(body.user.id).toBe(targetId);
    expect(body.roles.map((role) => role.code)).toContain('DRIVER');
    expect(body.assignments).toEqual([]);
  });

  it('persists a role assignment, returns it in history, and audits revocation through the HTTP routes', async () => {
    authState.userId = adminId;
    const response = await POST(request(`http://localhost/api/admin/users/${targetId}/roles`, 'POST', {
      roleCode: 'DRIVER', companyId, reason: 'Approved driver access for integration',
    }), { params: Promise.resolve({ userId: targetId }) });
    expect(response.status).toBe(201);
    const created = await response.json() as { assignment: { id: string; userId: string; companyId: string } };
    expect(created.assignment).toMatchObject({ userId: targetId, companyId });

    const historyResponse = await GET(request(`http://localhost/api/admin/users/${targetId}/roles`, 'GET'), { params: Promise.resolve({ userId: targetId }) });
    const history = await historyResponse.json() as { assignments: Array<{ id: string; revokedAt: string | null }> };
    expect(history.assignments).toHaveLength(1);
    expect(history.assignments[0]).toMatchObject({ id: created.assignment.id, revokedAt: null });

    const revokeResponse = await DELETE(request(`http://localhost/api/admin/role-assignments/${created.assignment.id}`, 'DELETE', {
      reason: 'Remove temporary integration role',
    }), { params: Promise.resolve({ assignmentId: created.assignment.id }) });
    expect(revokeResponse.status).toBe(200);
    const stored = await prisma.userRoleAssignment.findUniqueOrThrow({ where: { id: created.assignment.id } });
    expect(stored.revokedAt).toBeInstanceOf(Date);
    expect(await prisma.auditEvent.count({ where: { entityType: 'USER_ROLE_ASSIGNMENT', entityId: created.assignment.id, action: 'ROLE_ASSIGNED' } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { entityType: 'USER_ROLE_ASSIGNMENT', entityId: created.assignment.id, action: 'ROLE_REVOKED' } })).toBe(1);
  });

  it('denies unauthenticated and non-Super-Administrator route access', async () => {
    authState.userId = '';
    const anonymous = await GET(request(`http://localhost/api/admin/users/${targetId}/roles`, 'GET'), { params: Promise.resolve({ userId: targetId }) });
    expect(anonymous.status).toBe(401);

    authState.userId = ordinaryActorId;
    const denied = await GET(request(`http://localhost/api/admin/users/${targetId}/roles`, 'GET'), { params: Promise.resolve({ userId: targetId }) });
    expect(denied.status).toBe(403);
    const postDenied = await POST(request(`http://localhost/api/admin/users/${targetId}/roles`, 'POST', {
      roleCode: 'DRIVER', companyId, reason: 'Unauthorized integration assignment',
    }), { params: Promise.resolve({ userId: targetId }) });
    expect(postDenied.status).toBe(403);
  });
});
