import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '@/server/prisma';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import {
  ServicePlanValidationError,
  listServiceReminders,
  notifyServiceReminders,
  recordVehicleService,
  upsertServicePlan,
} from './service-plans';

const prisma = getPrisma();
let companyId = '';
let fleetId = '';
let otherUserId = '';
let vehicleId = '';
let secondManagerId = '';

async function makeUser(name: string) {
  return prisma.user.create({
    data: { name, email: `mnt03-${randomUUID()}@example.invalid`, status: 'ACTIVE' },
  });
}

describe('preventive service plans and reminders (MNT-03 / D-075)', () => {
  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL must point to a disposable PostgreSQL test database');
    const databaseName = new URL(databaseUrl).pathname.slice(1).split('?')[0];
    if (!databaseName.endsWith('_test')) throw new Error('Refusing integration tests unless the database name ends with _test');
    const company = await prisma.company.create({ data: { name: `Service Plans ${randomUUID()}` } });
    companyId = company.id;
    const [fleet, secondManager, otherUser] = await Promise.all([
      makeUser('Fleet Manager One'), makeUser('Fleet Manager Two'), makeUser('Unrelated User'),
    ]);
    fleetId = fleet.id;
    secondManagerId = secondManager.id;
    otherUserId = otherUser.id;
    for (const userId of [fleetId, secondManagerId]) {
      await prisma.userRoleAssignment.create({
        data: { userId, companyId, roleCode: 'OPS_MANAGER', reason: 'Integration setup', assignedById: null },
      });
    }
    const vehicle = await prisma.vehicle.create({
      data: {
        companyId, registrationNumber: `SVC-${randomUUID().slice(0, 8).toUpperCase()}`,
        make: 'Testbus', model: 'Coach', category: 'BUS', seatCount: 40,
        odometerValue: 60_500, odometerUnit: 'KM',
      },
    });
    vehicleId = vehicle.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('requires at least one interval and maintenance access', async () => {
    await expect(upsertServicePlan({
      vehicleId, intervalDays: null, intervalKm: null,
      lastServiceDate: '2027-01-01', lastServiceOdometerKm: null,
      reason: 'Plan without any interval at all',
    }, fleetId, companyId)).rejects.toThrow();
    await expect(listServiceReminders({ actorId: otherUserId, companyId }))
      .rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it('computes overdue by mileage and calendar from the plan baseline', async () => {
    await upsertServicePlan({
      vehicleId, intervalDays: 90, intervalKm: 10_000,
      lastServiceDate: '2027-01-01', lastServiceOdometerKm: 50_000,
      reason: 'Quarterly and 10k km service plan',
    }, fleetId, companyId);
    const { reminders } = await listServiceReminders({ actorId: fleetId, companyId });
    const row = reminders.find((entry) => entry.vehicleId === vehicleId);
    expect(row?.status).toBe('OVERDUE');
    expect(row?.kmRemaining).toBe(-500);
    const vehicle = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });
    expect(vehicle.nextServiceAt?.toISOString().slice(0, 10)).toBe('2027-04-01');
  });

  it('alerts the fleet team once per due cycle, then recording the service moves the baseline', async () => {
    const first = await notifyServiceReminders({ actorId: fleetId, companyId });
    expect(first.vehicles).toBe(1);
    expect(first.notifiedUsers).toBe(1); // second manager; the actor is not self-notified
    const second = await notifyServiceReminders({ actorId: fleetId, companyId });
    expect(second.notifiedUsers).toBe(0); // dedupe: same vehicle + due date + severity

    await recordVehicleService({
      vehicleId, serviceDate: '2027-08-09', odometerKm: 59_800,
      reason: 'Full preventive service completed at the depot',
    }, fleetId, companyId);
    const { reminders } = await listServiceReminders({ actorId: fleetId, companyId });
    const row = reminders.find((entry) => entry.vehicleId === vehicleId);
    expect(row?.status).toBe('OK');
    expect(row?.dueDate).toBe('2027-11-07');
    const audit = await prisma.auditEvent.findMany({
      where: { companyId, entityId: vehicleId, action: 'VEHICLE_SERVICE_RECORDED' },
    });
    expect(audit).toHaveLength(1);
    expect(secondManagerId).toBeTruthy();
  });

  it('refuses plans for vehicles outside the company', async () => {
    await expect(upsertServicePlan({
      vehicleId: randomUUID(), intervalDays: 90, intervalKm: null,
      lastServiceDate: '2027-01-01', lastServiceOdometerKm: null,
      reason: 'Plan for a vehicle that does not exist',
    }, fleetId, companyId)).rejects.toBeInstanceOf(ServicePlanValidationError);
  });
});
