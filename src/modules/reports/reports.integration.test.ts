import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '@/server/prisma';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import { createContract, transitionContract } from '../contracts/contracts';
import { createBooking, transitionBooking } from '../bookings/bookings';
import { assignBookingToTrip, createTrip, transitionTrip } from '../trips/trips';
import { linkDriverAccount, postDriverEvent } from '../driver/driver';
import {
  generateCorporateInvoice,
  recordInvoicePayment,
  transitionCorporateInvoice,
} from '../finance/invoices';
import { createWorkOrder, transitionWorkOrder } from '../maintenance/work-orders';
import { getTransportReport } from './transport-reports';
import { getFinanceReport } from './finance-reports';
import { financeReportCsv, transportReportCsv } from './exports';

const prisma = getPrisma();
let companyId = '';
let otherCompanyId = '';
let opsId = '';
let financeId = '';
let dispatcherId = '';
let driverUserId = '';
let clientId = '';
let vehicleOneId = '';

async function assignRole(userId: string, roleCode: string, targetCompanyId = companyId) {
  await prisma.userRoleAssignment.create({
    data: { userId, companyId: targetCompanyId, roleCode, reason: 'Integration setup', assignedById: null },
  });
}

async function makeUser(name: string) {
  return prisma.user.create({
    data: { name, email: `rpt-${randomUUID()}@example.invalid`, status: 'ACTIVE' },
  });
}

/** Drives one trip to completion with the given passengers boarding. */
async function completeTripWithPassengers(input: {
  journeyDate: string; plannedStartTime: string | null; capacityLimit: number | null;
  routeId: string | null; employeeIds: string[]; contractId: string; keyPrefix: string;
}) {
  const trip = await createTrip({
    clientId, routeId: input.routeId, serviceType: 'Staff busing', tripDate: input.journeyDate,
    plannedStartTime: input.plannedStartTime, plannedDurationMinutes: 60,
    capacityLimit: input.capacityLimit, reason: 'Report fixture trip',
  }, opsId, companyId);
  const driverRecord = await prisma.driver.findFirstOrThrow({ where: { companyId }, select: { id: true } });
  await prisma.trip.update({
    where: { id: trip.id }, data: { vehicleId: vehicleOneId, driverId: driverRecord.id },
  });
  const bookingIds: string[] = [];
  for (const [index, employeeId] of input.employeeIds.entries()) {
    const booking = await createBooking({
      employeeId, contractId: input.contractId, routeId: input.routeId, bookingType: 'HOME_TO_OFFICE',
      journeyDate: input.journeyDate, pickupLocationId: null, dropoffLocationId: null, notes: null,
      reason: 'Report fixture booking',
    }, opsId, companyId);
    await transitionBooking({ toStatus: 'Accepted', reason: 'Confirming fixture booking seat' }, opsId, companyId, booking.id);
    await assignBookingToTrip({ bookingId: booking.id, reason: 'Assigning passenger for report trip' }, opsId, companyId, trip.id);
    bookingIds.push(booking.id);
    void index;
  }
  await transitionTrip({ toStatus: 'Ready for Dispatch', reason: 'Preparing report fixture trip' }, opsId, companyId, trip.id);
  await transitionTrip({ toStatus: 'Dispatched', reason: 'Dispatching report fixture trip' }, opsId, companyId, trip.id);
  await postDriverEvent({ eventType: 'START', idempotencyKey: `${input.keyPrefix}-start` }, driverUserId, companyId, trip.id);
  for (const [index, bookingId] of bookingIds.entries()) {
    await postDriverEvent(
      { eventType: 'BOARD', idempotencyKey: `${input.keyPrefix}-board-${index}`, bookingId }, driverUserId, companyId, trip.id,
    );
  }
  await postDriverEvent(
    { eventType: 'COMPLETE', idempotencyKey: `${input.keyPrefix}-complete`, notes: 'All passengers dropped.' }, driverUserId, companyId, trip.id,
  );
  return trip.id;
}

describe('staff transport, fleet and financial reports with exports (RPT-02/03/04, D-064)', () => {
  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL must point to a disposable PostgreSQL test database');
    const databaseName = new URL(databaseUrl).pathname.slice(1).split('?')[0];
    if (!databaseName.endsWith('_test')) throw new Error('Refusing integration tests unless the database name ends with _test');
    const [company, otherCompany, ops, finance, dispatcher, driverUser] = await Promise.all([
      prisma.company.create({ data: { name: `Reports ${randomUUID()}` } }),
      prisma.company.create({ data: { name: `Other reports ${randomUUID()}` } }),
      makeUser('Reports Ops Manager'),
      makeUser('Reports Finance Officer'),
      makeUser('Reports Dispatcher'),
      makeUser('Reports Trip Driver'),
    ]);
    companyId = company.id;
    otherCompanyId = otherCompany.id;
    opsId = ops.id;
    financeId = finance.id;
    dispatcherId = dispatcher.id;
    driverUserId = driverUser.id;
    await assignRole(opsId, 'OPS_MANAGER');
    const fleetManager = await makeUser('Reports Fleet Manager');
    await assignRole(fleetManager.id, 'FLEET_MANAGER');
    await assignRole(financeId, 'FINANCE_OFFICER');
    await assignRole(dispatcherId, 'DISPATCHER');
    await assignRole(driverUserId, 'DRIVER');
    const driverRecord = await prisma.driver.create({ data: { companyId, fullName: 'Reports Driver', status: 'ACTIVE' } });
    await linkDriverAccount({
      actorId: opsId, companyId, driverId: driverRecord.id, userId: driverUserId,
      reason: 'Linking the fixture driver login for event tests',
    });

    const client = await prisma.client.create({ data: { companyId, name: `Reports Client ${randomUUID().slice(0, 6)}` } });
    clientId = client.id;
    const draft = await createContract({
      clientId, serviceType: 'Staff busing', startDate: '2026-01-01', endDate: '2028-12-31', renewalDate: null,
      routesAndStops: null, serviceDaysAndShifts: null, vehicleRequirements: null, pricingModel: null,
      billingFrequency: null, paymentTerms: null, serviceLevelTargets: null, notes: null,
      reason: 'Reports test contract fixture',
    }, opsId, companyId);
    await transitionContract({ toStatus: 'Pending Approval', reason: 'Submitting fixture for approval' }, opsId, companyId, draft.id);
    const contract = await transitionContract({ toStatus: 'Active', reason: 'Fixture contract approved' }, opsId, companyId, draft.id);

    const [employeeOne, employeeTwo] = await Promise.all([
      prisma.employee.create({ data: { companyId, clientId, fullName: 'Reports Passenger One', transportEligible: true } }),
      prisma.employee.create({ data: { companyId, clientId, fullName: 'Reports Passenger Two', transportEligible: true } }),
    ]);

    const [origin, destination] = await Promise.all([
      prisma.location.create({ data: { companyId, name: 'Depot' } }),
      prisma.location.create({ data: { companyId, name: 'Office' } }),
    ]);
    const route = await prisma.route.create({
      data: {
        companyId, clientId, reference: `RPT-R-${randomUUID().slice(0, 6).toUpperCase()}`,
        name: 'Depot to Office', originLocationId: origin.id, destinationLocationId: destination.id, active: true,
        operatingDays: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
      },
    });

    const vehicleOne = await prisma.vehicle.create({
      data: {
        companyId, registrationNumber: `RPT-${randomUUID().slice(0, 8).toUpperCase()}`,
        make: 'Testbus', model: 'Coach', category: 'BUS', seatCount: 40,
        insuranceExpiresAt: new Date('2020-01-01'), roadworthinessExpiresAt: new Date('2099-01-01'),
      },
    });
    vehicleOneId = vehicleOne.id;
    const vehicleTwo = await prisma.vehicle.create({
      data: {
        companyId, registrationNumber: `RPT-${randomUUID().slice(0, 8).toUpperCase()}`,
        make: 'Testvan', model: 'Mini', category: 'MINIBUS', seatCount: 15,
      },
    });
    await prisma.vehicleSafetyBlock.create({
      data: {
        companyId, vehicleId: vehicleTwo.id, status: 'Out of Service',
        reason: 'Failed brake inspection in fixture', appliedById: opsId,
      },
    });
    const costedWorkOrder = await createWorkOrder({
      actorId: opsId, companyId, vehicleId: vehicleOneId, reportedFault: 'Brake pads worn',
      dateReported: '2028-01-10', safetyRelated: false, reason: 'Report fixture work order',
    });
    await transitionWorkOrder({
      actorId: opsId, companyId, workOrderId: costedWorkOrder.id, toStatus: 'Awaiting Inspection',
      reason: 'Report fixture inspection request',
    });
    await transitionWorkOrder({
      actorId: fleetManager.id, companyId, workOrderId: costedWorkOrder.id, toStatus: 'Approved',
      reason: 'Report fixture repair approval', requiredWork: 'Replace worn brake pads', parts: 'Brake pad set',
    });
    await transitionWorkOrder({
      actorId: opsId, companyId, workOrderId: costedWorkOrder.id, toStatus: 'In Progress',
      reason: 'Report fixture repair started',
    });
    await transitionWorkOrder({
      actorId: opsId, companyId, workOrderId: costedWorkOrder.id, toStatus: 'Awaiting Review',
      reason: 'Report fixture repair finished',
    });
    await transitionWorkOrder({
      actorId: opsId, companyId, workOrderId: costedWorkOrder.id, toStatus: 'Completed',
      reason: 'Report fixture completion recorded',
      completionDate: new Date(Date.now() - 60_000).toISOString(),
      inspectionResults: 'Brake pads replaced and braking verified',
      labourCostPesewas: 10000, partsCostPesewas: 5000,
    });
    await createWorkOrder({
      actorId: opsId, companyId, vehicleId: vehicleOneId, reportedFault: 'Mirror cracked',
      dateReported: '2028-01-11', safetyRelated: false, reason: 'Report fixture work order without costs',
    });

    // T1: two passengers, planned start, capacity -> boarded + completed.
    await completeTripWithPassengers({
      journeyDate: '2028-01-06', plannedStartTime: '06:30', capacityLimit: 40, routeId: route.id,
      employeeIds: [employeeOne.id, employeeTwo.id], contractId: contract.id, keyPrefix: 'rpt-t1',
    });
    // T3: one passenger, no capacity -> completed but excluded from utilisation.
    await completeTripWithPassengers({
      journeyDate: '2028-01-08', plannedStartTime: null, capacityLimit: null, routeId: null,
      employeeIds: [employeeOne.id], contractId: contract.id, keyPrefix: 'rpt-t3',
    });
    // T2: one assigned passenger who never shows.
    const tripTwo = await createTrip({
      clientId, routeId: route.id, serviceType: 'Staff busing', tripDate: '2028-01-07',
      plannedStartTime: '06:30', plannedDurationMinutes: 60, capacityLimit: 40,
      reason: 'Report fixture no-show trip',
    }, opsId, companyId);
    await prisma.trip.update({ where: { id: tripTwo.id }, data: { vehicleId: vehicleOneId, driverId: driverRecord.id } });
    const noShowBooking = await createBooking({
      employeeId: employeeTwo.id, contractId: contract.id, routeId: route.id, bookingType: 'HOME_TO_OFFICE',
      journeyDate: '2028-01-07', pickupLocationId: null, dropoffLocationId: null, notes: null,
      reason: 'Report fixture no-show booking',
    }, opsId, companyId);
    await transitionBooking({ toStatus: 'Accepted', reason: 'Confirming fixture booking seat' }, opsId, companyId, noShowBooking.id);
    await assignBookingToTrip({ bookingId: noShowBooking.id, reason: 'Assigning passenger for report trip' }, opsId, companyId, tripTwo.id);
    await transitionTrip({ toStatus: 'Ready for Dispatch', reason: 'Preparing report fixture trip' }, opsId, companyId, tripTwo.id);
    await transitionTrip({ toStatus: 'Dispatched', reason: 'Dispatching report fixture trip' }, opsId, companyId, tripTwo.id);
    await postDriverEvent({ eventType: 'START', idempotencyKey: 'rpt-t2-start' }, driverUserId, companyId, tripTwo.id);
    await postDriverEvent(
      { eventType: 'NO_SHOW', idempotencyKey: 'rpt-t2-noshow', bookingId: noShowBooking.id, reason: 'Passenger not at pickup point' },
      driverUserId, companyId, tripTwo.id,
    );

    // Finance fixture: the January invoice covers both completed trips (T1, T3).
    await prisma.setting.upsert({
      where: { companyId_key: { companyId, key: 'finance.corporate_rates' } },
      create: {
        companyId, key: 'finance.corporate_rates', configured: true,
        value: [{ contractId: contract.id, unit: 'PER_TRIP', ratePesewas: 20000 }] as never,
      },
      update: {
        configured: true,
        value: [{ contractId: contract.id, unit: 'PER_TRIP', ratePesewas: 20000 }] as never,
      },
    });
    const invoice = (await generateCorporateInvoice(
      { contractId: contract.id, periodStart: '2028-01-01', periodEnd: '2028-01-31', reason: 'Generating report invoice' },
      financeId, companyId,
    )).invoice;
    expect(invoice.totalPesewas).toBe(40000);
    await transitionCorporateInvoice({ toStatus: 'ISSUED', dueDate: '2026-12-31', reason: 'Issuing report invoice' }, financeId, companyId, invoice.id);
    await recordInvoicePayment(
      {
        amountPesewas: 15000, method: 'Bank transfer', reference: 'FT-RPT-1',
        receivedAt: '2028-01-20', reason: 'Recording a client payment',
      },
      financeId, companyId, invoice.id,
    );
  }, 120_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('counts booking flow, no-shows and transported passengers from history events', async () => {
    const report = await getTransportReport({ actorId: opsId, companyId });
    expect(report.bookings).toEqual({
      received: 4, confirmed: 4, boarded: 3, completed: 3,
      cancelled: 1, rejected: 0, noShows: 1, passengersTransported: 3,
    });
    expect(report.trips.byStatus).toEqual(expect.arrayContaining([
      { status: 'Completed', count: 2 },
      { status: 'In Progress', count: 1 },
    ]));
    expect(report.trips.completedTrips).toBe(2);
  });

  it('computes route utilisation only from trips with capacity and a manifest', async () => {
    const report = await getTransportReport({ actorId: dispatcherId, companyId });
    expect(report.routeUtilisation.occupiedSeats).toBe(2);
    expect(report.routeUtilisation.capacitySeats).toBe(40);
    expect(report.routeUtilisation.utilisation).toBe(0.05);
    expect(report.routeUtilisation.excludedCompletedTrips).toBe(1);
    expect(report.routeUtilisation.routes).toHaveLength(1);
    expect(report.routeUtilisation.routes[0].trips).toBe(1);
  });

  it('reports pickup delay coverage but no on-time rate while the threshold is unset', async () => {
    const report = await getTransportReport({ actorId: opsId, companyId });
    expect(report.pickups.eligibleBoardedPickups).toBe(3);
    expect(report.pickups.pickupsWithPlannedAndActual).toBe(2);
    expect(report.pickups.latePickups).toBe(0);
    expect(report.pickups.averageDelayAllMinutes).not.toBeNull();
    expect(report.pickups.onTimeRate).toBeNull();
    expect(report.pickups.onTimeStatus).toBe('INSUFFICIENT_DATA');
  });

  it('publishes the on-time rate once the owner threshold is set (D-078)', async () => {
    await prisma.setting.upsert({
      where: { companyId_key: { companyId, key: 'reports.on_time_threshold' } },
      create: { companyId, key: 'reports.on_time_threshold', configured: true, value: 10 },
      update: { configured: true, value: 10 },
    });
    try {
      const report = await getTransportReport({ actorId: opsId, companyId });
      expect(report.pickups.thresholdMinutes).toBe(10);
      expect(report.pickups.pickupsWithPlannedAndActual).toBe(2);
      // Both sampled boardings happened long before their 2028 planned
      // starts, so every sample is inside the 10-minute threshold.
      expect(report.pickups.onTimeRate).toBe(1);
      expect(report.pickups.onTimeStatus).toBe('OK');
      expect(report.unavailableMetrics.map((item) => item.metric)).not.toContain('On-time pickup rate');
    } finally {
      await prisma.setting.deleteMany({ where: { companyId, key: 'reports.on_time_threshold' } });
    }
  });

  it('summarises fleet, document expiry and recorded maintenance costs', async () => {
    const report = await getTransportReport({ actorId: opsId, companyId });
    expect(report.fleet.totalVehicles).toBe(2);
    expect(report.fleet.byCategory).toEqual([
      { category: 'BUS', count: 1 },
      { category: 'MINIBUS', count: 1 },
    ]);
    expect(report.fleet.activeSafetyBlocks).toEqual([{ status: 'Out of Service', count: 1 }]);
    const insurance = report.documentExpiry.documents.find((row) => row.document === 'Vehicle insurance');
    expect(insurance?.alreadyExpired).toBe(1);
    expect(insurance?.expiringInWindow).toBeNull();
    expect(report.maintenance.workOrdersInScope).toBe(2);
    expect(report.maintenance.withAnyCostData).toBe(1);
    expect(report.maintenance.withCompleteCostData).toBe(0);
    expect(report.maintenance.recordedCostPesewas).toBe(15000);
    expect(report.unavailableMetrics.map((item) => item.metric)).toEqual(expect.arrayContaining([
      'On-time pickup rate', 'Vehicle downtime', 'Fuel cost and mileage', 'Contract performance',
    ]));

    const windowed = await getTransportReport({
      actorId: opsId, companyId, fromDate: '2020-01-01', toDate: '2020-12-31',
    });
    const windowedInsurance = windowed.documentExpiry.documents.find((row) => row.document === 'Vehicle insurance');
    expect(windowedInsurance?.expiringInWindow).toBe(1);
  });

  it('reconciles the financial report and breaks revenue down by client and service', async () => {
    const report = await getFinanceReport({ actorId: financeId, companyId });
    expect(report.totals).toEqual({
      recognizedRevenuePesewas: 40000, paymentsReceivedPesewas: 15000,
      outstandingPesewas: 25000, reconciles: true,
      // D-091: totals carry the explicit stream split; none is rental here.
      corporateRevenuePesewas: 40000, rentalRevenuePesewas: 0,
    });
    expect(report.revenueByClient).toHaveLength(1);
    expect(report.revenueByClient[0]).toMatchObject({ invoiceCount: 1, revenuePesewas: 40000 });
    expect(report.revenueByService).toEqual([{ serviceType: 'Staff busing', invoiceCount: 1, revenuePesewas: 40000 }]);
    expect(report.paymentsInWindow.totalPesewas).toBe(15000);
    expect(report.outstandingInvoices.totalCount).toBe(1);
    expect(report.outstandingInvoices.invoices[0].outstandingPesewas).toBe(25000);
    expect(report.margin.status).toBe('INSUFFICIENT_DATA');

    const january = await getFinanceReport({
      actorId: financeId, companyId, fromDate: '2028-01-01', toDate: '2028-01-31',
    });
    expect(january.paymentsInWindow.totalPesewas).toBe(15000);
    // Issuance is timestamped today, not in January 2028, so no windowed revenue.
    expect(january.revenueByClient).toEqual([]);
    const february = await getFinanceReport({
      actorId: financeId, companyId, fromDate: '2028-02-01', toDate: '2028-02-29',
    });
    expect(february.paymentsInWindow.totalPesewas).toBe(0);
  });

  it('enforces report permission scopes and company isolation', async () => {
    await expect(getTransportReport({ actorId: financeId, companyId }))
      .rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(getFinanceReport({ actorId: opsId, companyId }))
      .rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(getTransportReport({ actorId: driverUserId, companyId }))
      .rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(getFinanceReport({ actorId: driverUserId, companyId }))
      .rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(getTransportReport({ actorId: opsId, companyId: otherCompanyId }))
      .rejects.toBeInstanceOf(PermissionDeniedError);
    // The dispatcher holds dispatch-scope report access but no finance scope.
    const dispatchReport = await getTransportReport({ actorId: dispatcherId, companyId });
    expect(dispatchReport.bookings.received).toBe(4);
    await expect(getFinanceReport({ actorId: dispatcherId, companyId }))
      .rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it('serializes exports from the same scoped results, with metadata', async () => {
    const transport = await getTransportReport({ actorId: opsId, companyId });
    const transportCsv = transportReportCsv(transport);
    expect(transportCsv).toContain('# Richie TMS staff transport and fleet report (RPT-02)');
    expect(transportCsv).toContain('# Timezone: Africa/Accra (UTC)');
    expect(transportCsv).toContain('Passenger no-shows,1');
    expect(transportCsv).toContain('Passengers transported,3');

    const finance = await getFinanceReport({ actorId: financeId, companyId });
    const financeCsv = financeReportCsv(finance);
    expect(financeCsv).toContain('# Richie TMS financial report (RPT-03)');
    expect(financeCsv).toContain('RECONCILED');
    expect(financeCsv).toContain('Recognised revenue,400.00');
    expect(financeCsv).toContain('Staff busing,1,400.00');
  });
});
