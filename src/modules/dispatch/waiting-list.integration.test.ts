import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '@/server/prisma';
import { BookingPolicyError } from '../bookings/bookings';
import { createBooking, transitionBooking } from '../bookings/bookings';
import { assignBookingToTrip, createTrip } from '../trips/trips';
import { getTripWaitingList } from './waiting-list';

const prisma = getPrisma();
let companyId = '';
let managerId = '';
let clientId = '';
let employee1Id = '';
let employee2Id = '';
let tripId = '';
let booking1Id = '';
let booking2Id = '';
const DAY = '2027-09-06'; // Monday

async function setCutoff(value: { mode: string; hours?: number } | null) {
  if (value === null) {
    await prisma.setting.deleteMany({ where: { companyId, key: 'bookings.creation_cutoff' } });
    return;
  }
  await prisma.setting.upsert({
    where: { companyId_key: { companyId, key: 'bookings.creation_cutoff' } },
    create: { companyId, key: 'bookings.creation_cutoff', value, configured: true },
    update: { value, configured: true },
  });
}

describe('booking cut-off and trip waiting list with PostgreSQL persistence', () => {
  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL must point to a disposable PostgreSQL test database');
    const databaseName = new URL(databaseUrl).pathname.slice(1).split('?')[0];
    if (!databaseName.endsWith('_test')) throw new Error('Refusing integration tests unless the database name ends with _test');
    const company = await prisma.company.create({ data: { name: `Waiting ${randomUUID()}` } });
    companyId = company.id;
    const manager = await prisma.user.create({
      data: { name: 'Waiting Ops Manager', email: `waiting-${randomUUID()}@example.invalid`, status: 'ACTIVE' },
    });
    managerId = manager.id;
    await prisma.userRoleAssignment.create({
      data: { userId: managerId, companyId, roleCode: 'OPS_MANAGER', reason: 'Integration setup', assignedById: null },
    });
    const client = await prisma.client.create({ data: { companyId, name: `Waiting Client ${randomUUID()}` } });
    clientId = client.id;
    const [employee1, employee2, employee3] = await Promise.all([
      prisma.employee.create({ data: { companyId, clientId, fullName: 'Waiting One', transportEligible: true } }),
      prisma.employee.create({ data: { companyId, clientId, fullName: 'Waiting Two', transportEligible: true } }),
      prisma.employee.create({ data: { companyId, clientId: clientId, fullName: 'Cutoff Person', transportEligible: true } }),
    ]);
    employee1Id = employee1.id;
    employee2Id = employee2.id;
    void employee3;
    const trip = await createTrip({
      clientId, routeId: null, serviceType: null, tripDate: DAY, plannedStartTime: null,
      plannedDurationMinutes: null, capacityLimit: 1, reason: 'Waiting list fixture trip',
    }, managerId, companyId);
    tripId = trip.id;
    const accepted = async (employeeId: string) => {
      const booking = await createBooking({
        employeeId, contractId: null, routeId: null, bookingType: 'HOME_TO_OFFICE', journeyDate: DAY,
        pickupLocationId: null, dropoffLocationId: null, notes: null, reason: 'Waiting list fixture booking',
      }, managerId, companyId);
      await transitionBooking({ toStatus: 'Accepted', reason: 'Confirming fixture booking seat' }, managerId, companyId, booking.id);
      return booking.id;
    };
    booking1Id = await accepted(employee1Id);
    booking2Id = await accepted(employee2Id);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('lists accepted bookings in order and shrinks as seats are assigned', async () => {
    const before = await getTripWaitingList({ actorId: managerId, companyId, tripId });
    expect(before.entries.map((entry) => entry.bookingId)).toEqual([booking1Id, booking2Id]);
    expect(before.entries.map((entry) => entry.position)).toEqual([1, 2]);
    expect(before.seatsAvailable).toBe(true);
    await assignBookingToTrip({ bookingId: booking1Id, reason: 'Promoting first waiting booking' }, managerId, companyId, tripId);
    const after = await getTripWaitingList({ actorId: managerId, companyId, tripId });
    expect(after.entries.map((entry) => entry.bookingId)).toEqual([booking2Id]);
    expect(after.passengerCount).toBe(1);
    expect(after.seatsAvailable).toBe(false);
  });

  it('enforces the configured creation cut-off and stays open while unset', async () => {
    await setCutoff({ mode: 'HOURS_BEFORE_JOURNEY', hours: 720 });
    const employee3 = await prisma.employee.findFirstOrThrow({ where: { companyId, fullName: 'Cutoff Person' } });
    // Tomorrow is inside the 720-hour (30-day) cut-off window, so it blocks.
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    await expect(createBooking({
      employeeId: employee3.id, contractId: null, routeId: null, bookingType: 'ONE_TIME', journeyDate: tomorrow,
      pickupLocationId: null, dropoffLocationId: null, notes: null, reason: 'Cutoff enforcement fixture',
    }, managerId, companyId)).rejects.toBeInstanceOf(BookingPolicyError);
    await setCutoff({ mode: 'NONE' });
    const allowed = await createBooking({
      employeeId: employee3.id, contractId: null, routeId: null, bookingType: 'ONE_TIME', journeyDate: tomorrow,
      pickupLocationId: null, dropoffLocationId: null, notes: null, reason: 'Cutoff cleared fixture booking',
    }, managerId, companyId);
    expect(allowed.status).toBe('Pending');
    await setCutoff(null);
  });
});
