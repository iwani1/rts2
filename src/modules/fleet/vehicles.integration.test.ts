import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '@/server/prisma';
import { assignRole, PermissionDeniedError } from '@/modules/auth/permissions';
import { archiveVehicle, createVehicle, getVehicle, listVehicles, updateVehicle } from './vehicles';

const prisma = getPrisma();
let companyId = '';
let otherCompanyId = '';
let superAdminId = '';
let fleetManagerId = '';
let dispatcherId = '';

async function makeUser(label: string) {
  return prisma.user.create({
    data: { name: label, email: `${label.toLowerCase().replaceAll(' ', '-')}-${randomUUID()}@example.invalid`, status: 'ACTIVE' },
  });
}

const vehicleInput = (overrides: Record<string, unknown> = {}) => ({
  registrationNumber: ' gr 1234-25 ', make: 'Verified Make', model: 'Verified Model', category: 'Company supplied category',
  seatCount: null, fuelType: null, ownershipType: null, odometerValue: null, odometerUnit: null,
  insuranceExpiresAt: null, roadworthinessExpiresAt: null, registrationExpiresAt: null, nextServiceAt: null, notes: null,
  reason: 'Test vehicle record entry', ...overrides,
});

describe('vehicle register with PostgreSQL persistence', () => {
  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL must point to a disposable PostgreSQL test database');
    const databaseName = new URL(databaseUrl).pathname.slice(1).split('?')[0];
    if (!databaseName.endsWith('_test')) throw new Error('Refusing integration tests unless the database name ends with _test');
    const [company, otherCompany, admin, manager, dispatcher] = await Promise.all([
      prisma.company.create({ data: { name: `Fleet integration ${randomUUID()}` } }),
      prisma.company.create({ data: { name: `Fleet other ${randomUUID()}` } }),
      makeUser('Fleet Super Admin'), makeUser('Fleet Manager'), makeUser('Fleet Dispatcher'),
    ]);
    companyId = company.id;
    otherCompanyId = otherCompany.id;
    superAdminId = admin.id;
    fleetManagerId = manager.id;
    dispatcherId = dispatcher.id;
    await prisma.userRoleAssignment.create({
      data: { userId: superAdminId, roleCode: 'SUPER_ADMIN', assignedById: superAdminId, reason: 'Integration test global administrator' },
    });
    await assignRole({ actorId: superAdminId, targetUserId: fleetManagerId, companyId, roleCode: 'FLEET_MANAGER', reason: 'Integration test fleet manager assignment' });
    await assignRole({ actorId: superAdminId, targetUserId: dispatcherId, companyId, roleCode: 'DISPATCHER', reason: 'Integration test dispatcher assignment' });
  });

  afterAll(async () => { await prisma.$disconnect(); });

  it('creates a tenant-scoped vehicle, normalizes registration, and writes an audit event', async () => {
    const vehicle = await createVehicle(vehicleInput({ odometerValue: 12750.5, odometerUnit: 'KM' }), fleetManagerId, companyId);
    expect(vehicle.registrationNumber).toBe('GR 1234-25');
    expect(vehicle.odometerValue).toBe('12750.5');
    expect(vehicle.seatCount).toBeNull();
    const stored = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } });
    expect(stored.companyId).toBe(companyId);
    const audit = await prisma.auditEvent.findFirst({ where: { entityType: 'VEHICLE', entityId: vehicle.id, action: 'VEHICLE_CREATED' } });
    expect(audit?.actorId).toBe(fleetManagerId);
    expect(audit?.summary).toEqual({ registrationNumber: 'GR 1234-25', reason: 'Test vehicle record entry' });
  });

  it('enforces company registration uniqueness and blocks cross-company lookup', async () => {
    await expect(createVehicle(vehicleInput(), fleetManagerId, companyId)).rejects.toMatchObject({ code: 'P2002' });
    await expect(listVehicles({ actorId: fleetManagerId, companyId: otherCompanyId })).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it('limits dispatcher reads, denies dispatcher mutations, and supports audited update/archive', async () => {
    const vehicle = await prisma.vehicle.findFirstOrThrow({ where: { companyId, registrationNumber: 'GR 1234-25' } });
    const limited = await getVehicle({ actorId: dispatcherId, companyId, vehicleId: vehicle.id });
    expect(limited.canManage).toBe(false);
    expect(limited.vehicle.notes).toBeNull();
    await expect(createVehicle(vehicleInput({ registrationNumber: 'GR 9999-25' }), dispatcherId, companyId)).rejects.toBeInstanceOf(PermissionDeniedError);
    const updated = await updateVehicle(vehicleInput({
      registrationNumber: vehicle.registrationNumber,
      make: 'Updated Make', model: vehicle.model, odometerValue: 12750.5, odometerUnit: 'KM',
      reason: 'Correct verified make after review',
    }), fleetManagerId, companyId, vehicle.id);
    expect(updated.make).toBe('Updated Make');
    expect(await prisma.auditEvent.count({ where: { entityType: 'VEHICLE', entityId: vehicle.id, action: 'VEHICLE_UPDATED' } })).toBe(1);
    const archived = await archiveVehicle({ actorId: fleetManagerId, companyId, vehicleId: vehicle.id, reason: 'Vehicle sold and removed from fleet' });
    expect(archived.archivedAt).toBeInstanceOf(Date);
    await expect(getVehicle({ actorId: fleetManagerId, companyId, vehicleId: vehicle.id })).rejects.toMatchObject({ code: 'VEHICLE_NOT_FOUND' });
    expect(await prisma.vehicle.findUnique({ where: { id: vehicle.id } })).not.toBeNull();
  });
});
