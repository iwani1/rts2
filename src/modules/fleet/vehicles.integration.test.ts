import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '@/server/prisma';
import { assignRole, PermissionDeniedError } from '@/modules/auth/permissions';
import {
  archiveVehicle, createVehicle, getVehicle, getVehicleRegisterSummary, importVehiclesFromCsv, InvalidUsualDriverError, listVehicles,
  previewVehicleImport, updateVehicle, VehicleImportValidationError,
} from './vehicles';
import { vehicleImportHeaders } from './vehicle-import-constants';

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

  it('summarizes only the company’s non-archived vehicle records by supplied category', async () => {
    const category = `Summary category ${randomUUID()}`;
    await createVehicle(vehicleInput({ registrationNumber: `SUM-${randomUUID().slice(0, 8)}`, category }), fleetManagerId, companyId);
    await createVehicle(vehicleInput({ registrationNumber: `SUM-${randomUUID().slice(0, 8)}`, category }), fleetManagerId, companyId);
    const archived = await createVehicle(vehicleInput({ registrationNumber: `SUM-${randomUUID().slice(0, 8)}`, category }), fleetManagerId, companyId);
    await archiveVehicle({ actorId: fleetManagerId, companyId, vehicleId: archived.id, reason: 'Archive summary test record' });
    await createVehicle(vehicleInput({ registrationNumber: `SUM-${randomUUID().slice(0, 8)}`, category }), superAdminId, otherCompanyId);

    const summary = await getVehicleRegisterSummary({ actorId: fleetManagerId, companyId });
    expect(summary.byCategory.find((entry) => entry.category === category)?.count).toBe(2);
    expect(summary.registeredVehicleCount).toBe(await prisma.vehicle.count({ where: { companyId, archivedAt: null } }));
  });

  it('stores a same-company usual-driver link and keeps it out of dispatcher vehicle projections', async () => {
    const [driver, otherCompanyDriver] = await Promise.all([
      prisma.driver.create({ data: { companyId, fullName: `Usual Driver Test ${randomUUID()}` } }),
      prisma.driver.create({ data: { companyId: otherCompanyId, fullName: `Other Company Driver ${randomUUID()}` } }),
    ]);
    const vehicle = await createVehicle(vehicleInput({ registrationNumber: 'GR 4321-25', usualDriverId: driver.id }), fleetManagerId, companyId);
    expect(vehicle.usualDriverId).toBe(driver.id);
    expect(vehicle.usualDriverName).toBe(driver.fullName);
    const stored = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } });
    expect(stored.usualDriverCompanyId).toBe(companyId);
    expect(stored.usualDriverId).toBe(driver.id);

    const managerList = await listVehicles({ actorId: fleetManagerId, companyId });
    expect(managerList.vehicles.find((entry) => entry.id === vehicle.id)?.usualDriverName).toBe(driver.fullName);
    const limited = await getVehicle({ actorId: dispatcherId, companyId, vehicleId: vehicle.id });
    expect(limited.vehicle.usualDriverId).toBeNull();
    expect(limited.vehicle.usualDriverName).toBeNull();

    await expect(createVehicle(vehicleInput({ registrationNumber: 'GR 9876-25', usualDriverId: otherCompanyDriver.id }), fleetManagerId, companyId))
      .rejects.toBeInstanceOf(InvalidUsualDriverError);
    await expect(prisma.$executeRaw`UPDATE "Vehicle" SET "usualDriverCompanyId" = ${otherCompanyId}, "usualDriverId" = ${otherCompanyDriver.id} WHERE "id" = ${vehicle.id}`)
      .rejects.toBeDefined();

    const cleared = await updateVehicle(vehicleInput({
      registrationNumber: vehicle.registrationNumber,
      usualDriverId: null,
      reason: 'Clear the test-only usual-driver association',
    }), fleetManagerId, companyId, vehicle.id);
    expect(cleared.usualDriverId).toBeNull();
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } })).usualDriverCompanyId).toBeNull();
  });

  it('previews vehicle CSV rows and imports no rows when any row is invalid', async () => {
    const beforeCount = await prisma.vehicle.count({ where: { companyId } });
    const csv = `${vehicleImportHeaders.join(',')}\nGR 1111-26,Make,Model,Van,,,,,,,,,,\n,Make,Model,Van,,,,,,,,,,\n`;
    const preview = await previewVehicleImport({ actorId: fleetManagerId, companyId, csv });
    expect(preview).toMatchObject({ totalRows: 2, validRows: 1, invalidRows: 1, canImport: false });
    expect(preview.rows[1]?.errors.join(' ')).toContain('registrationNumber');
    await expect(importVehiclesFromCsv({
      actorId: fleetManagerId, companyId, csv, reason: 'Import vehicle rows after verification',
    })).rejects.toBeInstanceOf(VehicleImportValidationError);
    expect(await prisma.vehicle.count({ where: { companyId } })).toBe(beforeCount);
  });

  it('imports valid vehicle CSV records atomically and audits each row', async () => {
    const registration = `GH ${randomUUID().slice(0, 8)}`;
    const csv = `${vehicleImportHeaders.join(',')}\n${registration},Imported Make,Model,Bus,,,,,,,,,,Import note\n`;
    const result = await importVehiclesFromCsv({
      actorId: fleetManagerId, companyId, csv, reason: 'Import verified vehicle register data',
    });
    expect(result.importedCount).toBe(1);
    const imported = result.vehicles[0]!;
    expect(imported.registrationNumber).toBe(registration.toLocaleUpperCase('en'));
    const stored = await prisma.vehicle.findUniqueOrThrow({ where: { id: imported.id } });
    expect(stored.companyId).toBe(companyId);
    expect(stored.usualDriverId).toBeNull();
    const audit = await prisma.auditEvent.findFirst({ where: { entityType: 'VEHICLE', entityId: imported.id, action: 'VEHICLE_IMPORTED' } });
    expect(audit?.summary).toEqual({
      registrationNumber: imported.registrationNumber,
      reason: 'Import verified vehicle register data', source: 'CSV_IMPORT', rowNumber: 2,
    });
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
