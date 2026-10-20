import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '@/server/prisma';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import {
  archiveClient,
  createClient,
  ClientNotFoundError,
  getClient,
  listClients,
  updateClient,
} from './clients';

const prisma = getPrisma();
let companyId = '';
let otherCompanyId = '';
let adminId = '';
let managerId = '';

async function makeUser(label: string) {
  return prisma.user.create({
    data: { name: label, email: `${label.toLowerCase().replaceAll(' ', '-')}-${randomUUID()}@example.invalid`, status: 'ACTIVE' },
  });
}

const clientInput = (overrides: Record<string, unknown> = {}) => ({
  name: `Client ${randomUUID()}`,
  registrationDetails: null,
  contactPerson: null,
  telephone: null,
  email: null,
  billingAddress: null,
  status: null,
  notes: null,
  reason: 'Integration test client entry',
  ...overrides,
});

describe('corporate client register with PostgreSQL persistence', () => {
  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL must point to a disposable PostgreSQL test database');
    const databaseName = new URL(databaseUrl).pathname.slice(1).split('?')[0];
    if (!databaseName.endsWith('_test')) throw new Error('Refusing integration tests unless the database name ends with _test');
    const [company, otherCompany, admin, manager] = await Promise.all([
      prisma.company.create({ data: { name: `Clients ${randomUUID()}` } }),
      prisma.company.create({ data: { name: `Other clients ${randomUUID()}` } }),
      makeUser('Client Super Admin'),
      makeUser('Client Ops Manager'),
    ]);
    companyId = company.id;
    otherCompanyId = otherCompany.id;
    adminId = admin.id;
    managerId = manager.id;
    await prisma.userRoleAssignment.create({
      data: { userId: adminId, companyId: null, roleCode: 'SUPER_ADMIN', reason: 'Integration setup', assignedById: null },
    });
    await prisma.userRoleAssignment.create({
      data: { userId: adminId, companyId, roleCode: 'OPS_MANAGER', reason: 'Integration setup', assignedById: null },
    });
    await prisma.userRoleAssignment.create({
      data: { userId: managerId, companyId, roleCode: 'OPS_MANAGER', reason: 'Integration setup', assignedById: null },
    });
  });

  afterAll(async () => {
    await prisma.client.deleteMany({ where: { companyId: { in: [companyId, otherCompanyId] } } });
    await prisma.userRoleAssignment.deleteMany({ where: { userId: { in: [adminId, managerId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [adminId, managerId] } } });
    await prisma.company.deleteMany({ where: { id: { in: [companyId, otherCompanyId] } } });
    await prisma.$disconnect();
  });

  it('creates a client with only a name required', async () => {
    const client = await createClient(clientInput(), adminId, companyId);
    expect(client.name).toContain('Client');
    expect(client.registrationDetails).toBeNull();
    expect(client.contactPerson).toBeNull();
  });

  it('lists clients for the company with cursor pagination', async () => {
    await createClient(clientInput(), adminId, companyId);
    await createClient(clientInput(), adminId, companyId);
    const first = await listClients({ actorId: adminId, companyId });
    expect(first.clients.length).toBeGreaterThanOrEqual(2);
    expect(first.canManage).toBe(true);
    if (first.nextCursor) {
      const second = await listClients({ actorId: adminId, companyId, cursor: first.nextCursor });
      expect(second.clients.length).toBeGreaterThanOrEqual(0);
    }
  });

  it('gets a client with audit history', async () => {
    const created = await createClient(clientInput(), adminId, companyId);
    const detail = await getClient({ actorId: adminId, companyId, clientId: created.id });
    expect(detail.client.id).toBe(created.id);
    expect(detail.history.length).toBeGreaterThan(0);
    expect(detail.history[0].action).toBe('CLIENT_CREATED');
  });

  it('updates a client', async () => {
    const created = await createClient(clientInput(), adminId, companyId);
    const updated = await updateClient({ ...clientInput({ name: 'Updated Client Name' }), reason: 'Integration test update' }, adminId, companyId, created.id);
    expect(updated.name).toBe('Updated Client Name');
    expect(updated.id).toBe(created.id);
  });

  it('archives a client', async () => {
    const created = await createClient(clientInput(), adminId, companyId);
    const archived = await archiveClient({ actorId: adminId, companyId, clientId: created.id, reason: 'Integration test archive' });
    expect(archived.id).toBe(created.id);
    expect(archived.archivedAt).not.toBeNull();
    await expect(getClient({ actorId: adminId, companyId, clientId: created.id })).rejects.toThrow(ClientNotFoundError);
  });

  it('rejects access for a user of another company', async () => {
    const created = await createClient(clientInput(), adminId, companyId);
    await expect(getClient({ actorId: managerId, companyId: otherCompanyId, clientId: created.id })).rejects.toThrow(PermissionDeniedError);
  });

  it('rejects invalid cursor', async () => {
    await expect(listClients({ actorId: adminId, companyId, cursor: 'not-a-real-cursor' })).rejects.toThrow();
  });
});
