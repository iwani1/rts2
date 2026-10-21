import { z } from 'zod';
import { PermissionDeniedError, resolvePermission } from '@/modules/auth/permissions';
import { getPrisma } from '@/server/prisma';
import { getTripManifest } from '@/modules/trips/trips';

const companyIdSchema = z.string().trim().min(1).max(128);
const tripIdSchema = z.string().trim().min(1).max(128);

export class WaitingListCompanyNotFoundError extends Error {
  readonly code = 'COMPANY_NOT_FOUND';
  constructor() { super('Company not found.'); this.name = 'WaitingListCompanyNotFoundError'; }
}
export class WaitingListTripNotFoundError extends Error {
  readonly code = 'TRIP_NOT_FOUND';
  constructor() { super('Trip not found.'); this.name = 'WaitingListTripNotFoundError'; }
}

export type WaitingListEntry = {
  bookingId: string;
  bookingReference: string;
  employeeName: string;
  bookingType: string;
  createdAt: Date;
  position: number;
};

export type WaitingList = {
  tripReference: string;
  tripDate: string;
  status: string;
  passengerCount: number;
  capacityBasis: number | null;
  capacityNote: string;
  seatsAvailable: boolean | null;
  entries: WaitingListEntry[];
};

async function accessFor(actorId: string, companyId: string) {
  const permission = await resolvePermission({ userId: actorId, companyId, permission: 'trip:dispatch' });
  if (!permission.allowed) throw new PermissionDeniedError();
  const company = await getPrisma().company.findUnique({ where: { id: companyId }, select: { status: true } });
  if (company?.status !== 'ACTIVE') throw new WaitingListCompanyNotFoundError();
  const canManage = permission.scopes.includes('GLOBAL') || permission.scopes.includes('COMPANY');
  if (!canManage) throw new PermissionDeniedError();
  return { canManage };
}

/**
 * BKG-05b waiting list (D-056): the operational queue of Accepted bookings
 * for the trip's date/client/route that are not yet on any trip, in request
 * order. Promotion is manual through the transactional assignment path;
 * `seatsAvailable` is null when no capacity basis exists so the UI never
 * implies a seat is free without a basis.
 */
export async function getTripWaitingList(input: {
  actorId: string; companyId: string; tripId: string;
}): Promise<WaitingList> {
  const companyId = companyIdSchema.parse(input.companyId);
  const tripId = tripIdSchema.parse(input.tripId);
  await accessFor(input.actorId, companyId);
  const prisma = getPrisma();
  const trip = await prisma.trip.findFirst({
    where: { id: tripId, companyId },
    select: { id: true, reference: true, tripDate: true, status: true, clientId: true, routeId: true },
  });
  if (!trip) throw new WaitingListTripNotFoundError();
  const manifest = await getTripManifest({ actorId: input.actorId, companyId, tripId });
  const rows = await prisma.booking.findMany({
    where: {
      companyId,
      status: 'Accepted',
      journeyDate: trip.tripDate,
      ...(trip.clientId ? { clientId: trip.clientId } : {}),
      ...(trip.routeId ? { routeId: trip.routeId } : {}),
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true, reference: true, bookingType: true, createdAt: true,
      employee: { select: { fullName: true } },
    },
    take: 200,
  });
  const seatsAvailable = manifest.capacityBasis === null
    ? null
    : manifest.passengerCount < manifest.capacityBasis;
  return {
    tripReference: trip.reference,
    tripDate: trip.tripDate.toISOString().slice(0, 10),
    status: trip.status,
    passengerCount: manifest.passengerCount,
    capacityBasis: manifest.capacityBasis,
    capacityNote: manifest.capacityNote,
    seatsAvailable,
    entries: rows.map((row: {
      id: string; reference: string; bookingType: string; createdAt: Date;
      employee: { fullName: string };
    }, index: number) => ({
      bookingId: row.id,
      bookingReference: row.reference,
      employeeName: row.employee.fullName,
      bookingType: row.bookingType,
      createdAt: row.createdAt,
      position: index + 1,
    })),
  };
}
