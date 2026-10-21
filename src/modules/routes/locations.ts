import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { getPrisma } from '@/server/prisma';
import { locationListQuerySchema, locationRequestSchema } from './location-schema';
import { routeAccessFor, routeCompanyIdSchema, routeIdSchema } from './route-access';

export class LocationNotFoundError extends Error {
  readonly code = 'LOCATION_NOT_FOUND';
  constructor() { super('Location not found.'); this.name = 'LocationNotFoundError'; }
}
export class InvalidLocationCursorError extends Error {
  readonly code = 'INVALID_LOCATION_CURSOR';
  constructor() { super('Invalid location cursor.'); this.name = 'InvalidLocationCursorError'; }
}

export type LocationRecord = {
  id: string;
  name: string;
  latitude: string | null;
  longitude: string | null;
  landmarkDescription: string | null;
  ghanaDigitalAddress: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type LocationDbShape = Omit<LocationRecord, 'latitude' | 'longitude'> & {
  latitude: Prisma.Decimal | null;
  longitude: Prisma.Decimal | null;
};

function presentLocation(row: LocationDbShape): LocationRecord {
  return {
    id: row.id,
    name: row.name,
    latitude: row.latitude?.toString() ?? null,
    longitude: row.longitude?.toString() ?? null,
    landmarkDescription: row.landmarkDescription,
    ghanaDigitalAddress: row.ghanaDigitalAddress,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toLocationData(input: z.infer<typeof locationRequestSchema>) {
  return {
    name: input.name,
    latitude: input.latitude,
    longitude: input.longitude,
    landmarkDescription: input.landmarkDescription || null,
    ghanaDigitalAddress: input.ghanaDigitalAddress || null,
    notes: input.notes || null,
  };
}

export async function listLocations(input: { actorId: string; companyId: string; search?: string; cursor?: string }): Promise<{
  locations: LocationRecord[]; nextCursor: string | null; canManage: boolean;
}> {
  const companyId = routeCompanyIdSchema.parse(input.companyId);
  const query = locationListQuerySchema.parse({ search: input.search, cursor: input.cursor });
  const access = await routeAccessFor(input.actorId, companyId);
  const prisma = getPrisma();
  if (query.cursor) {
    const cursorLocation = await prisma.location.findFirst({ where: { id: query.cursor, companyId, archivedAt: null }, select: { id: true } });
    if (!cursorLocation) throw new InvalidLocationCursorError();
  }
  const rows = await prisma.location.findMany({
    where: {
      companyId,
      archivedAt: null,
      ...(query.search ? { OR: [
        { name: { contains: query.search, mode: 'insensitive' as const } },
        { landmarkDescription: { contains: query.search, mode: 'insensitive' as const } },
        { ghanaDigitalAddress: { contains: query.search, mode: 'insensitive' as const } },
      ] } : {}),
    },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    take: 51,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });
  const locations = rows.slice(0, 50).map((row: LocationDbShape) => presentLocation(row));
  return { locations, nextCursor: rows.length > 50 ? locations.at(-1)?.id ?? null : null, canManage: access.canManage };
}

export async function getLocation(input: { actorId: string; companyId: string; locationId: string }): Promise<{
  location: LocationRecord; canManage: boolean;
}> {
  const companyId = routeCompanyIdSchema.parse(input.companyId);
  const locationId = routeIdSchema.parse(input.locationId);
  const access = await routeAccessFor(input.actorId, companyId);
  const row = await getPrisma().location.findFirst({ where: { id: locationId, companyId, archivedAt: null } });
  if (!row) throw new LocationNotFoundError();
  return { location: presentLocation(row), canManage: access.canManage };
}

export async function createLocation(input: unknown, actorId: string, companyIdInput: string) {
  const data = locationRequestSchema.parse(input);
  const companyId = routeCompanyIdSchema.parse(companyIdInput);
  await routeAccessFor(actorId, companyId);
  return getPrisma().$transaction(async (tx: Prisma.TransactionClient) => {
    const location = await tx.location.create({ data: { ...toLocationData(data), companyId } });
    await tx.auditEvent.create({
      data: {
        actorId, companyId, action: 'LOCATION_CREATED', entityType: 'LOCATION', entityId: location.id,
        summary: { reason: data.reason },
      },
    });
    return presentLocation(location);
  });
}

export async function updateLocation(input: unknown, actorId: string, companyIdInput: string, locationIdInput: string) {
  const data = locationRequestSchema.parse(input);
  const companyId = routeCompanyIdSchema.parse(companyIdInput);
  const locationId = routeIdSchema.parse(locationIdInput);
  await routeAccessFor(actorId, companyId);
  return getPrisma().$transaction(async (tx: Prisma.TransactionClient) => {
    const changed = await tx.location.updateMany({
      where: { id: locationId, companyId, archivedAt: null }, data: toLocationData(data),
    });
    if (changed.count !== 1) throw new LocationNotFoundError();
    const location = await tx.location.findUniqueOrThrow({ where: { id: locationId } });
    await tx.auditEvent.create({
      data: {
        actorId, companyId, action: 'LOCATION_UPDATED', entityType: 'LOCATION', entityId: location.id,
        summary: { reason: data.reason },
      },
    });
    return presentLocation(location);
  });
}

export async function archiveLocation(input: { actorId: string; companyId: string; locationId: string; reason: string }) {
  const data = z.object({
    actorId: z.string().min(1), companyId: routeCompanyIdSchema, locationId: routeIdSchema,
    reason: z.string().trim().min(8).max(500),
  }).strict().parse(input);
  await routeAccessFor(data.actorId, data.companyId);
  return getPrisma().$transaction(async (tx: Prisma.TransactionClient) => {
    const changed = await tx.location.updateMany({
      where: { id: data.locationId, companyId: data.companyId, archivedAt: null },
      data: { archivedAt: new Date() },
    });
    if (changed.count !== 1) throw new LocationNotFoundError();
    const location = await tx.location.findUniqueOrThrow({ where: { id: data.locationId }, select: { id: true, archivedAt: true } });
    await tx.auditEvent.create({
      data: {
        actorId: data.actorId, companyId: data.companyId, action: 'LOCATION_ARCHIVED', entityType: 'LOCATION', entityId: location.id,
        summary: { reason: data.reason },
      },
    });
    return { id: location.id, archivedAt: location.archivedAt };
  });
}
