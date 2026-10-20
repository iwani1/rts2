import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assignRole } from '@/modules/auth/permissions';
import { archiveVehicle, listVehicles } from '@/modules/fleet/vehicles';
import { getPrisma } from '@/server/prisma';
import { applyVehicleSafetyBlock, releaseVehicleSafetyBlock } from './vehicle-safety-blocks';

const prisma = getPrisma();
let companyId = '';
let managerId = '';
let vehicleId = '';

describe('vehicle safety block lifecycle with PostgreSQL', () => {
  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL must point to a disposable PostgreSQL test database');
    const databaseName = new URL(databaseUrl).pathname.slice(1).split('?')[0];
    if (!databaseName.endsWith('_test')) throw new Error('Refusing integration tests unless the database name ends with _test');
    const [company, admin, manager] = await Promise.all([
      prisma.company.create({ data: { name: `Safety block ${randomUUID()}` } }),
      prisma.user.create({ data: { name: 'Safety block test admin', email: `${randomUUID()}@example.invalid`, status: 'ACTIVE' } }),
      prisma.user.create({ data: { name: 'Safety block test manager', email: `${randomUUID()}@example.invalid`, status: 'ACTIVE' } }),
    ]);
    companyId = company.id;
    managerId = manager.id;
    await prisma.userRoleAssignment.create({ data: {
      userId: admin.id, roleCode: 'SUPER_ADMIN', assignedById: admin.id, reason: 'Safety-block integration administrator',
    } });
    await assignRole({ actorId: admin.id, targetUserId: manager.id, companyId, roleCode: 'FLEET_MANAGER', reason: 'Safety-block integration fleet manager' });
    const vehicle = await prisma.vehicle.create({ data: {
      companyId, registrationNumber: `SB-${randomUUID().slice(0, 8)}`, make: 'Test', model: 'Van', category: 'Integration fixture',
    } });
    vehicleId = vehicle.id;
  });

  afterAll(async () => { await prisma.$disconnect(); });

  it('exposes an applied block to the fleet register and permits only one active block', async () => {
    const block = await applyVehicleSafetyBlock({
      actorId: managerId, companyId, vehicleId, status: 'Under Maintenance', reason: 'Repair required after engine warning',
    });
    const list = await listVehicles({ actorId: managerId, companyId });
    expect(list.vehicles.find((item) => item.id === vehicleId)?.safetyBlock).toMatchObject({ id: block.id, status: 'Under Maintenance' });
    expect(list.vehicles.find((item) => item.id === vehicleId)?.safetyBlock?.reason).toBe('Repair required after engine warning');
    await expect(archiveVehicle({ actorId: managerId, companyId, vehicleId, reason: 'Attempt to archive an actively safety-blocked vehicle' })).rejects.toThrow('cannot be archived');
    await expect(applyVehicleSafetyBlock({
      actorId: managerId, companyId, vehicleId, status: 'Out of Service', reason: 'Another block must not overwrite current state',
    })).rejects.toThrow('already has an active');
  });

  it('releases once with completion and passed-inspection records; database rows remain non-deletable', async () => {
    const block = await prisma.vehicleSafetyBlock.findFirstOrThrow({ where: { companyId, vehicleId, releasedAt: null } });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const released = await releaseVehicleSafetyBlock({
      actorId: managerId, companyId, vehicleId, blockId: block.id,
      workCompletedAt: new Date().toISOString(), inspectionResults: 'Brake and steering inspection passed after repair',
      inspectionPassed: true, reason: 'Release after recorded completed work and passed inspection',
    });
    expect(released.releasedAt).not.toBeNull();
    const list = await listVehicles({ actorId: managerId, companyId });
    expect(list.vehicles.find((item) => item.id === vehicleId)?.safetyBlock).toBeNull();
    await expect(prisma.vehicleSafetyBlock.update({ where: { id: block.id }, data: { reason: 'Tampered applied reason' } })).rejects.toThrow('immutable');
    await expect(prisma.vehicleSafetyBlock.delete({ where: { id: block.id } })).rejects.toThrow('cannot be deleted');
  });
});
