import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assignRole, PermissionDeniedError } from '@/modules/auth/permissions';
import { getPrisma } from '@/server/prisma';
import {
  archiveDriver, createDriver, getDriver, importDriversFromCsv, listDrivers, previewDriverImport,
  updateDriver, DriverImportValidationError,
} from './drivers';
import { driverImportHeaders } from './driver-import-constants';

const prisma = getPrisma();
let companyId = '';
let otherCompanyId = '';
let superAdminId = '';
let fleetManagerId = '';
let dispatcherId = '';
let driverUserId = '';

async function makeUser(label: string) {
  return prisma.user.create({
    data: { name: label, email: `${label.toLowerCase().replaceAll(' ', '-')}-${randomUUID()}@example.invalid`, status: 'ACTIVE' },
  });
}

const driverInput = (overrides: Record<string, unknown> = {}) => ({
  fullName: `Integration Driver ${randomUUID()}`,
  licenceClass: null,
  licenceExpiresAt: null,
  qualifications: 'Synthetic integration fixture only',
  availability: null,
  status: null,
  reason: 'Integration test driver record',
  ...overrides,
});

describe('driver register with PostgreSQL persistence', () => {
  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL must point to a disposable PostgreSQL test database');
    const databaseName = new URL(databaseUrl).pathname.slice(1).split('?')[0];
    if (!databaseName.endsWith('_test')) throw new Error('Refusing integration tests unless the database name ends with _test');
    const [company, otherCompany, admin, manager, dispatcher, driver] = await Promise.all([
      prisma.company.create({ data: { name: `Driver integration ${randomUUID()}` } }),
      prisma.company.create({ data: { name: `Driver other ${randomUUID()}` } }),
      makeUser('Driver Test Super Admin'), makeUser('Driver Test Fleet Manager'),
      makeUser('Driver Test Dispatcher'), makeUser('Driver Test Own Profile'),
    ]);
    companyId = company.id;
    otherCompanyId = otherCompany.id;
    superAdminId = admin.id;
    fleetManagerId = manager.id;
    dispatcherId = dispatcher.id;
    driverUserId = driver.id;
    await prisma.userRoleAssignment.create({
      data: { userId: superAdminId, roleCode: 'SUPER_ADMIN', assignedById: superAdminId, reason: 'Integration test global administrator' },
    });
    await assignRole({ actorId: superAdminId, targetUserId: fleetManagerId, companyId, roleCode: 'FLEET_MANAGER', reason: 'Integration test fleet manager assignment' });
    await assignRole({ actorId: superAdminId, targetUserId: dispatcherId, companyId, roleCode: 'DISPATCHER', reason: 'Integration test dispatcher assignment' });
    await assignRole({ actorId: superAdminId, targetUserId: driverUserId, companyId, roleCode: 'DRIVER', reason: 'Integration test own-profile driver assignment' });
  });

  afterAll(async () => { await prisma.$disconnect(); });

  it('creates an audited company-scoped driver without inventing status or availability', async () => {
    const input = driverInput();
    const driver = await createDriver(input, fleetManagerId, companyId);
    expect(driver.fullName).toBe(input.fullName);
    expect(driver.status).toBeNull();
    expect(driver.availability).toBeNull();
    const stored = await prisma.driver.findUniqueOrThrow({ where: { id: driver.id } });
    expect(stored.companyId).toBe(companyId);
    const audit = await prisma.auditEvent.findFirst({ where: { entityType: 'DRIVER', entityId: driver.id, action: 'DRIVER_CREATED' } });
    expect(audit?.actorId).toBe(fleetManagerId);
    expect(audit?.summary).toEqual({ reason: input.reason });
  });

  it('denies cross-company access and fails closed for unresolved dispatcher/own-profile scopes', async () => {
    const driver = await prisma.driver.findFirstOrThrow({ where: { companyId } });
    await expect(listDrivers({ actorId: fleetManagerId, companyId: otherCompanyId })).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(listDrivers({ actorId: dispatcherId, companyId })).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(getDriver({ actorId: dispatcherId, companyId, driverId: driver.id })).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(listDrivers({ actorId: driverUserId, companyId })).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it('previews every row and imports no driver when any row is invalid', async () => {
    const beforeCount = await prisma.driver.count({ where: { companyId } });
    const csv = `${driverImportHeaders.join(',')}\nValid Import Driver,,,,,\n,,,,,\n`;
    const preview = await previewDriverImport({ actorId: fleetManagerId, companyId, csv });
    expect(preview).toMatchObject({ totalRows: 2, validRows: 1, invalidRows: 1, canImport: false });
    expect(preview.rows[1]?.errors.join(' ')).toContain('fullName');
    await expect(importDriversFromCsv({
      actorId: fleetManagerId, companyId, csv, reason: 'Import verified driver roster rows',
    })).rejects.toBeInstanceOf(DriverImportValidationError);
    expect(await prisma.driver.count({ where: { companyId } })).toBe(beforeCount);
  });

  it('imports all valid driver rows atomically and records an audit event per row', async () => {
    const fullName = `Imported Driver ${randomUUID()}`;
    const csv = `${driverImportHeaders.join(',')}\n${fullName},Class B,2027-09-30,Qualification A,Availability note,Status note\n`;
    const result = await importDriversFromCsv({
      actorId: fleetManagerId, companyId, csv, reason: 'Import verified driver roster rows',
    });
    expect(result.importedCount).toBe(1);
    const imported = result.drivers[0]!;
    expect(imported.fullName).toBe(fullName);
    const stored = await prisma.driver.findUniqueOrThrow({ where: { id: imported.id } });
    expect(stored.companyId).toBe(companyId);
    expect(stored.status).toBe('Status note');
    const audit = await prisma.auditEvent.findFirst({ where: { entityType: 'DRIVER', entityId: imported.id, action: 'DRIVER_IMPORTED' } });
    expect(audit?.summary).toEqual({ reason: 'Import verified driver roster rows', source: 'CSV_IMPORT', rowNumber: 2 });
  });

  it('updates and archives through audited operations while retaining the driver record', async () => {
    const current = await prisma.driver.findFirstOrThrow({ where: { companyId } });
    const updated = await updateDriver(driverInput({
      fullName: 'Updated Integration Driver',
      qualifications: 'Verified in test fixture',
      reason: 'Correct synthetic test fixture details',
    }), fleetManagerId, companyId, current.id);
    expect(updated.fullName).toBe('Updated Integration Driver');
    expect(await prisma.auditEvent.count({ where: { entityId: current.id, action: 'DRIVER_UPDATED' } })).toBe(1);
    await archiveDriver({ actorId: fleetManagerId, companyId, driverId: current.id, reason: 'Archive synthetic integration record' });
    await expect(getDriver({ actorId: fleetManagerId, companyId, driverId: current.id })).rejects.toMatchObject({ code: 'DRIVER_NOT_FOUND' });
    expect(await prisma.driver.findUnique({ where: { id: current.id } })).not.toBeNull();
    expect(await prisma.auditEvent.count({ where: { entityId: current.id, action: 'DRIVER_ARCHIVED' } })).toBe(1);
  });
});
