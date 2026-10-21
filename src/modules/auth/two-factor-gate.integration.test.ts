import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '@/server/prisma';
import { getTwoFactorGate } from './two-factor-gate';

const prisma = getPrisma();
let superAdminId = '';
let opsId = '';
let companyId = '';

async function makeUser(name: string) {
  return prisma.user.create({
    data: { name, email: `auth06-${randomUUID()}@example.invalid`, status: 'ACTIVE' },
  });
}

describe('two-factor gate (AUTH-06 / D-076; requirement suspended by D-080)', () => {
  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL must point to a disposable PostgreSQL test database');
    const databaseName = new URL(databaseUrl).pathname.slice(1).split('?')[0];
    if (!databaseName.endsWith('_test')) throw new Error('Refusing integration tests unless the database name ends with _test');
    const company = await prisma.company.create({ data: { name: `Two Factor ${randomUUID()}` } });
    companyId = company.id;
    const [superAdmin, ops] = await Promise.all([makeUser('Gate Super Admin'), makeUser('Gate Ops')]);
    superAdminId = superAdmin.id;
    opsId = ops.id;
    await prisma.userRoleAssignment.create({
      data: { userId: superAdminId, companyId: null, roleCode: 'SUPER_ADMIN', reason: 'Integration setup', assignedById: null },
    });
    await prisma.userRoleAssignment.create({
      data: { userId: opsId, companyId, roleCode: 'OPS_MANAGER', reason: 'Integration setup', assignedById: null },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('requires enrolment from no role while the requirement is suspended', async () => {
    expect(await getTwoFactorGate(superAdminId)).toEqual({
      required: false, enabled: false, mustEnroll: false,
    });
    expect(await getTwoFactorGate(opsId)).toEqual({
      required: false, enabled: false, mustEnroll: false,
    });
  });

  it('still reports enabled state honestly for enrolled users', async () => {
    await prisma.user.update({
      where: { id: superAdminId }, data: { twoFactorEnabled: true },
    });
    expect(await getTwoFactorGate(superAdminId)).toEqual({
      required: false, enabled: true, mustEnroll: false,
    });
    expect(companyId).toBeTruthy();
  });
});
