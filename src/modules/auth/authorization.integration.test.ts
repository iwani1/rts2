import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assignRole, requirePermission, resolvePermission, revokeRoleAssignment } from './permissions';
import { PermissionDeniedError } from './permissions';
import { getPrisma } from '@/server/prisma';

const prisma = getPrisma();
let companyA = '';
let companyB = '';
let superAdminId = '';
let operationsManagerId = '';
let targetId = '';

async function makeUser(label: string) {
  return prisma.user.create({
    data: {
      name: label,
      email: `${label.toLowerCase().replaceAll(' ', '-')}-${randomUUID()}@example.invalid`,
      status: 'ACTIVE',
    },
  });
}

describe('role-based authorization with PostgreSQL persistence', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must point to the migrated PostgreSQL test database');
    const [a, b, admin, manager, target] = await Promise.all([
      prisma.company.create({ data: { name: `Permission test A ${randomUUID()}` } }),
      prisma.company.create({ data: { name: `Permission test B ${randomUUID()}` } }),
      makeUser('Test Super Admin'),
      makeUser('Test Operations Manager'),
      makeUser('Test Target User'),
    ]);
    companyA = a.id;
    companyB = b.id;
    superAdminId = admin.id;
    operationsManagerId = manager.id;
    targetId = target.id;
    await prisma.userRoleAssignment.createMany({
      data: [
        { userId: superAdminId, roleCode: 'SUPER_ADMIN', assignedById: superAdminId, reason: 'Integration fixture global administrator' },
        { userId: operationsManagerId, companyId: companyA, roleCode: 'OPS_MANAGER', assignedById: superAdminId, reason: 'Integration fixture company manager' },
      ],
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('denies by default and restricts company grants to the assigned tenant', async () => {
    const noRole = await resolvePermission({ userId: targetId, companyId: companyA, permission: 'rental:manage' });
    expect(noRole).toEqual({ allowed: false, scopes: [] });

    const managerA = await resolvePermission({ userId: operationsManagerId, companyId: companyA, permission: 'rental:manage' });
    const managerB = await resolvePermission({ userId: operationsManagerId, companyId: companyB, permission: 'rental:manage' });
    expect(managerA).toEqual({ allowed: true, scopes: ['COMPANY'] });
    expect(managerB).toEqual({ allowed: false, scopes: [] });
  });

  it('applies own-record scope instead of treating a permission as unrestricted', async () => {
    await prisma.userRoleAssignment.create({
      data: {
        userId: targetId,
        companyId: companyA,
        roleCode: 'RENTAL_CUSTOMER',
        assignedById: superAdminId,
        reason: 'Integration fixture rental customer',
      },
    });
    const own = await resolvePermission({
      userId: targetId,
      companyId: companyA,
      permission: 'rental:manage',
      ownerUserId: targetId,
    });
    const anotherUser = await resolvePermission({
      userId: targetId,
      companyId: companyA,
      permission: 'rental:manage',
      ownerUserId: operationsManagerId,
    });
    expect(own.allowed).toBe(true);
    expect(own.scopes).toContain('OWN_CREATE_READ_RESPOND');
    expect(anotherUser.allowed).toBe(false);
  });

  it('keeps policy-dependent finance approval denied while the delegated policy is undefined', async () => {
    await prisma.userRoleAssignment.create({
      data: {
        userId: targetId,
        companyId: companyA,
        roleCode: 'FINANCE_OFFICER',
        assignedById: superAdminId,
        reason: 'Integration fixture finance officer',
      },
    });
    const notVerified = await resolvePermission({
      userId: targetId,
      companyId: companyA,
      permission: 'quotation:approve',
    });
    expect(notVerified).toEqual({ allowed: false, scopes: [] });
  });

  it('permits audited role changes only by a system Super Administrator and prevents self-escalation', async () => {
    await expect(assignRole({
      actorId: operationsManagerId,
      targetUserId: targetId,
      companyId: companyA,
      roleCode: 'DRIVER',
      reason: 'Test unauthorized role assignment',
    })).rejects.toBeInstanceOf(PermissionDeniedError);

    await expect(assignRole({
      actorId: superAdminId,
      targetUserId: superAdminId,
      roleCode: 'SUPER_ADMIN',
      reason: 'Test self escalation',
    })).rejects.toThrow();

    const assignment = await assignRole({
      actorId: superAdminId,
      targetUserId: targetId,
      companyId: companyA,
      roleCode: 'DRIVER',
      reason: 'Assign approved driver role for integration test',
    });
    const audit = await prisma.auditEvent.findFirst({
      where: { action: 'ROLE_ASSIGNED', entityId: assignment.id },
    });
    expect(audit?.actorId).toBe(superAdminId);
    expect(audit?.companyId).toBe(companyA);

    const scopes = await resolvePermission({
      userId: targetId,
      companyId: companyA,
      permission: 'trip:dispatch',
      assignedUserId: targetId,
    });
    expect(scopes.allowed).toBe(true);
    expect(scopes.scopes).toContain('OWN_TRIP_EVENTS');

    await revokeRoleAssignment({
      actorId: superAdminId,
      assignmentId: assignment.id,
      reason: 'Revoke integration-only driver role',
    });
    expect((await prisma.userRoleAssignment.findUniqueOrThrow({ where: { id: assignment.id } })).revokedAt).not.toBeNull();
    await expect(requirePermission({
      userId: targetId,
      companyId: companyA,
      permission: 'trip:dispatch',
      assignedUserId: targetId,
    })).rejects.toBeInstanceOf(PermissionDeniedError);
  });
});
