import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import { getPrisma } from '@/server/prisma';
import { listCompanySettingStatus, requireCompanySetting, setCompanySetting } from './registry';

const prisma = getPrisma();
let companyId = '';
let adminId = '';
let regularUserId = '';

async function makeUser(name: string) {
  return prisma.user.create({
    data: {
      name,
      email: `${name.toLowerCase().replaceAll(' ', '-')}-${randomUUID()}@example.invalid`,
      status: 'ACTIVE',
    },
  });
}

describe('company settings against PostgreSQL', () => {
  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL must point to a disposable PostgreSQL test database');
    const databaseName = new URL(databaseUrl).pathname.slice(1).split('?')[0];
    if (!databaseName.endsWith('_test')) throw new Error('Refusing integration tests unless the database name ends with _test');

    const [company, admin, regularUser] = await Promise.all([
      prisma.company.create({ data: { name: `Settings integration ${randomUUID()}` } }),
      makeUser('Settings Test Super Admin'),
      makeUser('Settings Test User'),
    ]);
    companyId = company.id;
    adminId = admin.id;
    regularUserId = regularUser.id;
    await prisma.userRoleAssignment.create({
      data: {
        userId: adminId,
        roleCode: 'SUPER_ADMIN',
        assignedById: adminId,
        reason: 'Integration fixture global administrator',
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('starts with unconfigured registry entries and blocks dependent reads', async () => {
    const status = await listCompanySettingStatus(companyId);
    expect(status.length).toBeGreaterThan(0);
    expect(status.every((setting) => !setting.configured && setting.updatedAt === null)).toBe(true);
    await expect(requireCompanySetting(companyId, 'finance.tax_lines')).rejects.toMatchObject({
      name: 'SettingNotConfiguredError',
      blockedFeatures: ['RNT-04', 'FIN-01'],
    });
  });

  it('persists an explicit Super Administrator value and its audit event in one transaction', async () => {
    const value = [{ code: 'INTEGRATION_ONLY', label: 'Integration-only test line', rateBasisPoints: 0 }];
    const updated = await setCompanySetting({
      actorId: adminId,
      companyId,
      key: 'finance.tax_lines',
      value,
      reason: 'Disposable integration fixture value',
    });
    expect(updated.configured).toBe(true);
    expect(await requireCompanySetting(companyId, 'finance.tax_lines')).toEqual(value);
    const audit = await prisma.auditEvent.findFirst({
      where: { action: 'SETTING_UPDATED', entityId: (await prisma.setting.findUniqueOrThrow({
        where: { companyId_key: { companyId, key: 'finance.tax_lines' } },
        select: { id: true },
      })).id },
    });
    expect(audit?.actorId).toBe(adminId);
    expect(audit?.companyId).toBe(companyId);
    expect(audit?.summary).toEqual({ key: 'finance.tax_lines', reason: 'Disposable integration fixture value' });
  });

  it('denies writes from an ordinary active user', async () => {
    await expect(setCompanySetting({
      actorId: regularUserId,
      companyId,
      key: 'finance.tax_lines',
      value: [],
      reason: 'Attempted non-admin policy write',
    })).rejects.toBeInstanceOf(PermissionDeniedError);
  });
});
