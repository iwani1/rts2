import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '@/server/prisma';
import { createClient } from '../clients/clients';
import { createContract, transitionContract } from '../contracts/contracts';
import { createBooking, transitionBooking } from '../bookings/bookings';
import { assignBookingToTrip, generateTripsFromSchedules, transitionTrip } from '../trips/trips';
import { assignTripResources, getDispatchBoard, recordTripNoShow } from '../dispatch/dispatch';
import { linkDriverAccount, listDriverTrips, postDriverEvent } from '../driver/driver';
import { generateCorporateInvoice } from '../finance/invoices';
import { bindUserClient, getCorporateDashboard } from '../clients/dashboard';

const prisma = getPrisma();
let companyId = '';
let managerId = '';
let financeId = '';
let driverUserId = '';
let hrUserId = '';
let clientId = '';
let contractId = '';
let DAY = '';
let generatedTripId = '';

function nextMonthMonday(): string {
  const now = new Date();
  const candidate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  while (candidate.getUTCDay() !== 1) candidate.setUTCDate(candidate.getUTCDate() + 1);
  return candidate.toISOString().slice(0, 10);
}

describe('Phase 1B workflow: booking to invoice and corporate dashboard', () => {
  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL must point to a disposable PostgreSQL test database');
    const databaseName = new URL(databaseUrl).pathname.slice(1).split('?')[0];
    if (!databaseName.endsWith('_test')) throw new Error('Refusing integration tests unless the database name ends with _test');
    DAY = nextMonthMonday();
    const company = await prisma.company.create({ data: { name: `Workflow ${randomUUID()}` } });
    companyId = company.id;
    const makeUser = async (name: string) => prisma.user.create({
      data: { name, email: `${name.toLowerCase().replaceAll(' ', '-')}-${randomUUID()}@example.invalid`, status: 'ACTIVE' },
    });
    const [manager, finance, driverUser, hrUser] = await Promise.all([
      makeUser('Workflow Manager'), makeUser('Workflow Finance'), makeUser('Workflow Driver'), makeUser('Workflow HR'),
    ]);
    managerId = manager.id;
    financeId = finance.id;
    driverUserId = driverUser.id;
    hrUserId = hrUser.id;
    await prisma.userRoleAssignment.create({
      data: { userId: managerId, companyId, roleCode: 'OPS_MANAGER', reason: 'Integration setup', assignedById: null },
    });
    await prisma.userRoleAssignment.create({
      data: { userId: financeId, companyId, roleCode: 'FINANCE_OFFICER', reason: 'Integration setup', assignedById: null },
    });
    await prisma.userRoleAssignment.create({
      data: { userId: driverUserId, companyId, roleCode: 'DRIVER', reason: 'Integration setup', assignedById: null },
    });
    await prisma.userRoleAssignment.create({
      data: { userId: hrUserId, companyId, roleCode: 'CORP_HR_ADMIN', reason: 'Integration setup', assignedById: null },
    });
    const client = await createClient(
      {
        name: `Workflow Client ${randomUUID()}`, registrationDetails: null, contactPerson: 'Workflow HR Lead',
        telephone: null, email: null, billingAddress: null, status: null, notes: null,
        reason: 'Creating workflow fixture client',
      },
      managerId, companyId,
    );
    clientId = client.id;
    const draft = await createContract({
      clientId, serviceType: 'Staff busing', startDate: '2026-01-01', endDate: '2028-12-31', renewalDate: null,
      routesAndStops: null, serviceDaysAndShifts: null, vehicleRequirements: null, pricingModel: null,
      billingFrequency: null, paymentTerms: null, serviceLevelTargets: null, notes: null,
      reason: 'Workflow fixture contract',
    }, managerId, companyId);
    await transitionContract({ toStatus: 'Pending Approval', reason: 'Submitting workflow fixture' }, managerId, companyId, draft.id);
    const active = await transitionContract({ toStatus: 'Active', reason: 'Workflow fixture approved' }, managerId, companyId, draft.id);
    contractId = active.id;
    const [origin, destination] = await Promise.all([
      prisma.location.create({ data: { companyId, name: 'Depot', type: 'DEPOT', clientId } }),
      prisma.location.create({ data: { companyId, name: 'Client HQ', type: 'CLIENT_PREMISES', clientId } }),
    ]);
    const route = await prisma.route.create({
      data: {
        companyId, clientId, name: 'Morning inbound', transportMode: 'BUS',
        originLocationId: origin.id, destinationLocationId: destination.id,
        capacityRequirement: 40, plannedStartTime: '06:30', active: true,
      },
    });
    await prisma.routeSchedule.create({
      data: {
        companyId, routeId: route.id, name: 'Weekday mornings', kind: 'RECURRING',
        daysOfWeek: ['MON', 'TUE', 'WED', 'THU', 'FRI'], scheduleDate: null,
        plannedStartTime: '06:30', active: true,
      },
    });
    const vehicle = await prisma.vehicle.create({
      data: {
        companyId, registrationNumber: `FLOW-${randomUUID().slice(0, 8)}`,
        make: 'Testbus', model: 'Coach', category: 'BUS', seatCount: 40,
      },
    });
    const driver = await prisma.driver.create({ data: { companyId, fullName: 'Workflow Driver', status: 'ACTIVE' } });
    await linkDriverAccount({
      actorId: managerId, companyId, driverId: driver.id, userId: driverUserId,
      reason: 'Linking workflow driver login',
    });
    const [employee1, employee2] = await Promise.all([
      prisma.employee.create({ data: { companyId, clientId, fullName: 'Workflow Rider One', transportEligible: true } }),
      prisma.employee.create({ data: { companyId, clientId, fullName: 'Workflow Rider Two', transportEligible: true } }),
    ]);
    const acceptedBooking = async (employeeId: string) => {
      const booking = await createBooking({
        employeeId, contractId, routeId: null, bookingType: 'HOME_TO_OFFICE', journeyDate: DAY,
        pickupLocationId: null, dropoffLocationId: null, notes: null, reason: 'Workflow fixture booking',
      }, managerId, companyId);
      await transitionBooking({ toStatus: 'Accepted', reason: 'Confirming workflow booking seat' }, managerId, companyId, booking.id);
      return booking.id;
    };
    const booking1Id = await acceptedBooking(employee1.id);
    const booking2Id = await acceptedBooking(employee2.id);
    // Trips originate from schedules (workflow F), then bookings are assigned.
    const generated = await generateTripsFromSchedules(
      { fromDate: DAY, toDate: DAY, reason: 'Generating trips for the workflow week' }, managerId, companyId,
    );
    expect(generated.created).toBe(1);
    const board0 = await getDispatchBoard({ actorId: managerId, companyId, date: DAY });
    const trip = board0.trips[0];
    generatedTripId = trip.id;
    await assignTripResources(
      { vehicleId: vehicle.id, reason: 'Assigning the vehicle for the workflow trip' }, managerId, companyId, trip.id,
    );
    await assignTripResources(
      { driverId: driver.id, reason: 'Assigning the driver for the workflow trip' }, managerId, companyId, trip.id,
    );
    await assignBookingToTrip({ bookingId: booking1Id, reason: 'Assigning rider one' }, managerId, companyId, trip.id);
    await assignBookingToTrip({ bookingId: booking2Id, reason: 'Assigning rider two' }, managerId, companyId, trip.id);
    await transitionTrip({ toStatus: 'Ready for Dispatch', reason: 'Preparing workflow trip' }, managerId, companyId, trip.id);
    await transitionTrip({ toStatus: 'Dispatched', reason: 'Dispatching workflow trip' }, managerId, companyId, trip.id);
    await recordTripNoShow(
      { bookingId: booking2Id, reason: 'Second rider did not arrive at the stop' }, managerId, companyId, trip.id,
    );
    // Driver-side flow: Start, Board remaining rider, Complete.
    const driverTrips = await listDriverTrips({ actorId: driverUserId, companyId, date: DAY });
    expect(driverTrips.trips.map((entry) => entry.id)).toEqual([generatedTripId]);
    await postDriverEvent({ eventType: 'START', idempotencyKey: 'flow-start-0001' }, driverUserId, companyId, generatedTripId);
    await postDriverEvent(
      { eventType: 'BOARD', idempotencyKey: 'flow-board-0001', bookingId: booking1Id }, driverUserId, companyId, generatedTripId,
    );
    const completed = await postDriverEvent(
      { eventType: 'COMPLETE', idempotencyKey: 'flow-complete-1', notes: 'One passenger delivered; one no-show.' },
      driverUserId, companyId, generatedTripId,
    );
    expect(completed.tripStatus).toBe('Completed');
    const statuses = await prisma.booking.findMany({
      where: { id: { in: [booking1Id, booking2Id] },
      select: { id: true, status: true },
    });
    const byId = new Map(statuses.map((row: { id: string; status: string }) => [row.id, row.status]));
    expect(byId.get(booking1Id)).toBe('Completed');
    expect(byId.get(booking2Id)).toBe('Cancelled');
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('bills the completed workflow trip exactly once and shows it to the bound client', async () => {
    await prisma.setting.upsert({
      where: { companyId_key: { companyId, key: 'finance.corporate_rates' } },
      create: {
        companyId, key: 'finance.corporate_rates',
        value: [{ contractId, unit: 'PER_PASSENGER', ratePesewas: 20000 }], configured: true,
      },
      update: { value: [{ contractId, unit: 'PER_PASSENGER', ratePesewas: 20000 }], configured: true },
    });
    const month = DAY.slice(0, 7);
    const period = { periodStart: `${month}-01`, periodEnd: `${month}-28` };
    const first = await generateCorporateInvoice(
      { contractId, ...period, reason: 'Billing the workflow month' }, financeId, companyId,
    );
    expect(first.duplicate).toBe(false);
    expect(first.invoice.subtotalPesewas).toBe(20000); // one Completed passenger
    expect(first.invoice.lines).toHaveLength(1);
    expect(first.invoice.lines[0].tripId).toBe(generatedTripId);
    const duplicate = await generateCorporateInvoice(
      { contractId, ...period, reason: 'Accidental duplicate billing attempt' }, financeId, companyId,
    );
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.invoice.id).toBe(first.invoice.id);

    await bindUserClient(
      { userId: hrUserId, clientId, reason: 'Binding workflow HR to its client' }, managerId, companyId,
    );
    const dashboard = await getCorporateDashboard({ actorId: hrUserId, companyId });
    expect(dashboard.invoices.map((invoice) => invoice.reference)).toEqual([first.invoice.reference]);
    expect(dashboard.bookings.map((booking) => booking.status).sort()).toEqual(['Cancelled', 'Completed']);
  });
});
