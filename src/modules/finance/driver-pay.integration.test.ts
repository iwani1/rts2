import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '@/server/prisma';
import { createBooking, transitionBooking } from '../bookings/bookings';
import { assignBookingToTrip, createTrip, transitionTrip } from '../trips/trips';
import { linkDriverAccount, postDriverEvent } from '../driver/driver';
import {
  DriverPayPolicyError,
  createPayRule,
  createPayrollRun,
  getPayrollRunExport,
  transitionPayRule,
  transitionPayrollRun,
} from './driver-pay';

const prisma = getPrisma();
let companyId = '';
let financeAId = '';
let financeBId = '';
let managerId = '';
let driverName = '';

describe('FIN-06 driver pay with PostgreSQL (D-086)', () => {
  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL must point to a disposable PostgreSQL test database');
    const databaseName = new URL(databaseUrl).pathname.slice(1).split('?')[0];
    if (!databaseName.endsWith('_test')) throw new Error('Refusing integration tests unless the database name ends with _test');
    const [company, financeA, financeB, manager] = await Promise.all([
      prisma.company.create({ data: { name: `Driver pay ${randomUUID()}` } }),
      prisma.user.create({ data: { name: 'Pay Officer A', email: `pay-a-${randomUUID()}@example.invalid`, status: 'ACTIVE' } }),
      prisma.user.create({ data: { name: 'Pay Officer B', email: `pay-b-${randomUUID()}@example.invalid`, status: 'ACTIVE' } }),
      prisma.user.create({ data: { name: 'Pay Manager', email: `pay-m-${randomUUID()}@example.invalid`, status: 'ACTIVE' } }),
    ]);
    companyId = company.id;
    financeAId = financeA.id;
    financeBId = financeB.id;
    managerId = manager.id;
    for (const [userId, roleCode] of [[financeA.id, 'FINANCE_OFFICER'], [financeB.id, 'FINANCE_OFFICER'], [manager.id, 'OPS_MANAGER']] as const) {
      await prisma.userRoleAssignment.create({
        data: { userId, companyId, roleCode, reason: 'Integration setup', assignedById: null },
      });
    }
    const client = await prisma.client.create({ data: { companyId, name: `Pay Client ${randomUUID()}` } });
    const employee = await prisma.employee.create({
      data: { companyId, clientId: client.id, fullName: 'Pay Passenger', transportEligible: true },
    });
    driverName = `Pay Driver ${randomUUID().slice(0, 6)}`;
    const driverRecord = await prisma.driver.create({ data: { companyId, fullName: driverName, status: 'ACTIVE' } });
    const driverUser = await prisma.user.create({
      data: { name: 'Pay Trip Driver', email: `pay-d-${randomUUID()}@example.invalid`, status: 'ACTIVE' },
    });
    await prisma.userRoleAssignment.create({
      data: { userId: driverUser.id, companyId, roleCode: 'DRIVER', reason: 'Integration setup', assignedById: null },
    });
    await linkDriverAccount({
      actorId: managerId, companyId, driverId: driverRecord.id, userId: driverUser.id,
      reason: 'Linking the fixture driver login for event tests',
    });
    const trip = await createTrip({
      clientId: client.id, routeId: null, serviceType: null, tripDate: '2027-09-06',
      plannedStartTime: null, plannedDurationMinutes: null, capacityLimit: 40,
      reason: 'Driver pay fixture trip',
    }, managerId, companyId);
    const vehicle = await prisma.vehicle.create({
      data: {
        companyId, registrationNumber: `PAY-${randomUUID().slice(0, 8).toUpperCase()}`,
        make: 'Testbus', model: 'Coach', category: 'BUS', seatCount: 40,
      },
    });
    await prisma.trip.update({ where: { id: trip.id }, data: { vehicleId: vehicle.id, driverId: driverRecord.id } });
    const booking = await createBooking({
      employeeId: employee.id, contractId: null, routeId: null, bookingType: 'HOME_TO_OFFICE',
      journeyDate: '2027-09-06', pickupLocationId: null, dropoffLocationId: null, notes: null,
      reason: 'Driver pay fixture booking',
    }, managerId, companyId);
    await transitionBooking({ toStatus: 'Accepted', reason: 'Confirming fixture booking seat' }, managerId, companyId, booking.id);
    await assignBookingToTrip({ bookingId: booking.id, reason: 'Assigning passenger for fixture trip' }, managerId, companyId, trip.id);
    await transitionTrip({ toStatus: 'Ready for Dispatch', reason: 'Preparing fixture trip' }, managerId, companyId, trip.id);
    await transitionTrip({ toStatus: 'Dispatched', reason: 'Dispatching fixture trip' }, managerId, companyId, trip.id);
    await postDriverEvent({ eventType: 'START', idempotencyKey: 'pay-start' }, driverUser.id, companyId, trip.id);
    await postDriverEvent(
      { eventType: 'BOARD', idempotencyKey: 'pay-board', bookingId: booking.id }, driverUser.id, companyId, trip.id,
    );
    await postDriverEvent(
      { eventType: 'COMPLETE', idempotencyKey: 'pay-complete', notes: 'All passengers dropped.' }, driverUser.id, companyId, trip.id,
    );
  });

  afterAll(async () => { await prisma.$disconnect(); });

  it('requires independent activation and pays only under an active rule', async () => {
    const draft = await createPayRule({
      actorId: financeAId, companyId, name: 'Per-trip allowance Sep',
      basis: 'PER_COMPLETED_TRIP', ratePesewas: 5000,
      overtimeThresholdMinutesPerDay: 1, overtimeRatePesewasPerHour: 6000,
      effectiveFrom: '2027-09-01', effectiveTo: null,
      reason: 'September driver allowance rule',
    });
    expect(draft.status).toBe('DRAFT');
    await expect(createPayrollRun({
      actorId: financeAId, companyId, ruleId: draft.id,
      periodStart: '2027-09-01', periodEnd: '2027-09-30', reason: 'Trying to pay under a draft',
    })).rejects.toBeInstanceOf(DriverPayPolicyError);
    await expect(transitionPayRule({
      actorId: financeAId, companyId, ruleId: draft.id, toStatus: 'ACTIVE', reason: 'Activating my own rule',
    })).rejects.toBeInstanceOf(DriverPayPolicyError);
    await transitionPayRule({
      actorId: financeBId, companyId, ruleId: draft.id, toStatus: 'ACTIVE', reason: 'Rule reviewed and approved',
    });

    const run = await createPayrollRun({
      actorId: financeAId, companyId, ruleId: draft.id,
      periodStart: '2027-09-01', periodEnd: '2027-09-30', reason: 'September payroll run',
    });
    expect(run.lines).toHaveLength(1);
    expect(run.lines[0]).toMatchObject({
      driverName, completedTrips: 1, boardings: 1, activeDays: 1,
      basisUnits: 1, basePesewas: 5000, totalPesewas: 5000, tripsWithTiming: 1,
    });
    expect(run.totals.totalPesewas).toBe(5000);

    await expect(getPayrollRunExport({ actorId: financeAId, companyId, runId: run.id }))
      .rejects.toBeInstanceOf(DriverPayPolicyError);
    await transitionPayrollRun({
      actorId: financeBId, companyId, runId: run.id, toStatus: 'FINAL', reason: 'Payroll figures reviewed',
    });
    const exported = await getPayrollRunExport({ actorId: financeAId, companyId, runId: run.id });
    expect(exported.csv).toContain(driverName);
    expect(exported.csv).toContain(',5000');
  });
});
