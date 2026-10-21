import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { getPrisma } from '@/server/prisma';
import { routeListQuerySchema, routeRequestSchema, routeStopsRequestSchema } from './route-schema';
import { routeAccessFor, routeCompanyIdSchema, routeIdSchema } from './route-access';
import { buildRoutePlan, type RoutePlan } from './route-plan';

export class RouteNotFoundError extends Error {
  readonly code = 'ROUTE_NOT_FOUND';
  constructor() { super('Route not found.'); this.name = 'RouteNotFoundError'; }
}
export class RouteClientNotFoundError extends Error {
  readonly code = 'ROUTE_CLIENT_NOT_FOUND';
  constructor() { super('Active client not found in this company.'); this.name = 'RouteClientNotFoundError'; }
}
export class RouteLocationNotFoundError extends Error {
  readonly code = 'ROUTE_LOCATION_NOT_FOUND';
  constructor() { super('Active location not found in this company.'); this.name = 'RouteLocationNotFoundError'; }
}
export class InvalidRouteCursorError extends Error {
  readonly code = 'INVALID_ROUTE_CURSOR';
  constructor() { super('Invalid route cursor.'); this.name = 'InvalidRouteCursorError'; }
}

export type RouteStopRecord = {
  id: string;
  locationId: string;
  locationName: string;
  sequence: number;
  stopKind: string;
  plannedOffsetMinutes: number | null;
};

export type RouteRecord = {
  id: string;
  reference: string;
  clientId: string;
  clientName: string;
  name: string;
  serviceType: string | null;
  originLocationId: string;
  originName: string;
  destinationLocationId: string;
  destinationName: string;
  plannedStartTime: string | null;
  expectedDurationMinutes: number | null;
  capacityRequirement: number | null;
  operatingDays: string[];
  shift: string | null;
  active: boolean;
  notes: string | null;
  stops: RouteStopRecord[];
  createdAt: Date;
  updatedAt: Date;
};

type RouteDbShape = Omit<RouteRecord, 'clientName' | 'originName' | 'destinationName' | 'stops'> & {
  client: { name: string };
  originLocation: { name: string };
  destinationLocation: { name: string };
  stops: Array<Omit<RouteStopRecord, 'locationName'> & { location: { name: string } }>;
};

function presentRoute(row: RouteDbShape): RouteRecord {
  return {
    id: row.id,
    reference: row.reference,
    clientId: row.clientId,
    clientName: row.client.name,
    name: row.name,
    serviceType: row.serviceType,
    originLocationId: row.originLocationId,
    originName: row.originLocation.name,
    destinationLocationId: row.destinationLocationId,
    destinationName: row.destinationLocation.name,
    plannedStartTime: row.plannedStartTime,
    expectedDurationMinutes: row.expectedDurationMinutes,
    capacityRequirement: row.capacityRequirement,
    operatingDays: row.operatingDays,
    shift: row.shift,
    active: row.active,
    notes: row.notes,
    stops: [...row.stops]
      .sort((a, b) => a.sequence - b.sequence)
      .map((stop) => ({
        id: stop.id, locationId: stop.locationId, locationName: stop.location.name,
        sequence: stop.sequence, stopKind: stop.stopKind, plannedOffsetMinutes: stop.plannedOffsetMinutes,
      })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const routeInclude = {
  client: { select: { name: true } },
  originLocation: { select: { name: true } },
  destinationLocation: { select: { name: true } },
  stops: { include: { location: { select: { name: true } } } },
} as const;

function toRouteData(input: z.infer<typeof routeRequestSchema>) {
  return {
    clientId: input.clientId,
    name: input.name,
    serviceType: input.serviceType || null,
    originLocationId: input.originLocationId,
    destinationLocationId: input.destinationLocationId,
    plannedStartTime: input.plannedStartTime,
    expectedDurationMinutes: input.expectedDurationMinutes,
    capacityRequirement: input.capacityRequirement,
    operatingDays: input.operatingDays,
    shift: input.shift || null,
    active: input.active,
    notes: input.notes || null,
  };
}

async function requireActiveClient(db: Pick<Prisma.TransactionClient, 'client'>, companyId: string, clientId: string) {
  const client = await db.client.findFirst({ where: { id: clientId, companyId, archivedAt: null }, select: { id: true } });
  if (!client) throw new RouteClientNotFoundError();
}

async function requireActiveLocations(db: Pick<Prisma.TransactionClient, 'location'>, companyId: string, locationIds: string[]) {
  const unique = [...new Set(locationIds)];
  if (unique.length === 0) return;
  const found = await db.location.findMany({
    where: { id: { in: unique }, companyId, archivedAt: null }, select: { id: true },
  });
  if (found.length !== unique.length) throw new RouteLocationNotFoundError();
}

export async function listRoutes(input: {
  actorId: string; companyId: string; search?: string; clientId?: string; active?: string; cursor?: string;
}): Promise<{ routes: RouteRecord[]; nextCursor: string | null; canManage: boolean }> {
  const companyId = routeCompanyIdSchema.parse(input.companyId);
  const query = routeListQuerySchema.parse({
    search: input.search, clientId: input.clientId || undefined, active: input.active || undefined, cursor: input.cursor,
  });
  const access = await routeAccessFor(input.actorId, companyId);
  const prisma = getPrisma();
  if (query.cursor) {
    const cursorRoute = await prisma.route.findFirst({ where: { id: query.cursor, companyId, archivedAt: null }, select: { id: true } });
    if (!cursorRoute) throw new InvalidRouteCursorError();
  }
  const rows = await prisma.route.findMany({
    where: {
      companyId,
      archivedAt: null,
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(query.active ? { active: query.active === 'true' } : {}),
      ...(query.search ? { OR: [
        { reference: { contains: query.search, mode: 'insensitive' as const } },
        { name: { contains: query.search, mode: 'insensitive' as const } },
        { serviceType: { contains: query.search, mode: 'insensitive' as const } },
        { client: { is: { name: { contains: query.search, mode: 'insensitive' as const } } } },
      ] } : {}),
    },
    include: routeInclude,
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    take: 51,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });
  const routes = rows.slice(0, 50).map((row: RouteDbShape) => presentRoute(row));
  return { routes, nextCursor: rows.length > 50 ? routes.at(-1)?.id ?? null : null, canManage: access.canManage };
}

export async function getRoute(input: { actorId: string; companyId: string; routeId: string }): Promise<{
  route: RouteRecord; canManage: boolean;
}> {
  const companyId = routeCompanyIdSchema.parse(input.companyId);
  const routeId = routeIdSchema.parse(input.routeId);
  const access = await routeAccessFor(input.actorId, companyId);
  const row = await getPrisma().route.findFirst({
    where: { id: routeId, companyId, archivedAt: null },
    include: routeInclude,
  });
  if (!row) throw new RouteNotFoundError();
  return { route: presentRoute(row), canManage: access.canManage };
}

export async function createRoute(input: unknown, actorId: string, companyIdInput: string) {
  const data = routeRequestSchema.parse(input);
  const companyId = routeCompanyIdSchema.parse(companyIdInput);
  await routeAccessFor(actorId, companyId);
  const prisma = getPrisma();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const reference = `RTE-${randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`;
    try {
      return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await requireActiveClient(tx, companyId, data.clientId);
        await requireActiveLocations(tx, companyId, [data.originLocationId, data.destinationLocationId]);
        const route = await tx.route.create({
          data: { ...toRouteData(data), companyId, reference },
          include: routeInclude,
        });
        await tx.auditEvent.create({
          data: {
            actorId, companyId, action: 'ROUTE_CREATED', entityType: 'ROUTE', entityId: route.id,
            summary: { reference, clientId: data.clientId, reason: data.reason },
          },
        });
        return presentRoute(route);
      });
    } catch (error) {
      const isReferenceCollision = typeof error === 'object' && error !== null && 'code' in error
        && (error as { code?: unknown }).code === 'P2002';
      if (!isReferenceCollision || attempt === 2) throw error;
    }
  }
  throw new RouteNotFoundError();
}

export async function updateRoute(input: unknown, actorId: string, companyIdInput: string, routeIdInput: string) {
  const data = routeRequestSchema.parse(input);
  const companyId = routeCompanyIdSchema.parse(companyIdInput);
  const routeId = routeIdSchema.parse(routeIdInput);
  await routeAccessFor(actorId, companyId);
  const prisma = getPrisma();
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const current = await tx.route.findFirst({
      where: { id: routeId, companyId, archivedAt: null }, select: { clientId: true },
    });
    if (!current) throw new RouteNotFoundError();
    if (data.clientId !== current.clientId) await requireActiveClient(tx, companyId, data.clientId);
    await requireActiveLocations(tx, companyId, [data.originLocationId, data.destinationLocationId]);
    const changed = await tx.route.updateMany({
      where: { id: routeId, companyId, archivedAt: null }, data: toRouteData(data),
    });
    if (changed.count !== 1) throw new RouteNotFoundError();
    const route = await tx.route.findUniqueOrThrow({ where: { id: routeId }, include: routeInclude });
    await tx.auditEvent.create({
      data: {
        actorId, companyId, action: 'ROUTE_UPDATED', entityType: 'ROUTE', entityId: route.id,
        summary: { reference: route.reference, reason: data.reason },
      },
    });
    return presentRoute(route);
  });
}

export async function archiveRoute(input: { actorId: string; companyId: string; routeId: string; reason: string }) {
  const data = z.object({
    actorId: z.string().min(1), companyId: routeCompanyIdSchema, routeId: routeIdSchema,
    reason: z.string().trim().min(8).max(500),
  }).strict().parse(input);
  await routeAccessFor(data.actorId, data.companyId);
  return getPrisma().$transaction(async (tx: Prisma.TransactionClient) => {
    const changed = await tx.route.updateMany({
      where: { id: data.routeId, companyId: data.companyId, archivedAt: null },
      data: { archivedAt: new Date() },
    });
    if (changed.count !== 1) throw new RouteNotFoundError();
    const route = await tx.route.findUniqueOrThrow({ where: { id: data.routeId }, select: { id: true, archivedAt: true, reference: true } });
    await tx.auditEvent.create({
      data: {
        actorId: data.actorId, companyId: data.companyId, action: 'ROUTE_ARCHIVED', entityType: 'ROUTE', entityId: route.id,
        summary: { reference: route.reference, reason: data.reason },
      },
    });
    return { id: route.id, archivedAt: route.archivedAt };
  });
}

/**
 * Replaces the route's approved stop order (dispatcher override). The full
 * ordered list is stored as given; every location must be an active
 * same-company location. The change is audited with its reason.
 */
export async function setRouteStops(input: unknown, actorId: string, companyIdInput: string, routeIdInput: string) {
  const data = routeStopsRequestSchema.parse(input);
  const companyId = routeCompanyIdSchema.parse(companyIdInput);
  const routeId = routeIdSchema.parse(routeIdInput);
  await routeAccessFor(actorId, companyId);
  const prisma = getPrisma();
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const route = await tx.route.findFirst({
      where: { id: routeId, companyId, archivedAt: null }, select: { id: true, reference: true },
    });
    if (!route) throw new RouteNotFoundError();
    await requireActiveLocations(tx, companyId, data.stops.map((stop) => stop.locationId));
    await tx.routeStop.deleteMany({ where: { companyId, routeId } });
    for (const [index, stop] of data.stops.entries()) {
      await tx.routeStop.create({
        data: {
          companyId, routeId, locationId: stop.locationId,
          sequence: index + 1, stopKind: stop.stopKind, plannedOffsetMinutes: stop.plannedOffsetMinutes,
        },
      });
    }
    await tx.auditEvent.create({
      data: {
        actorId, companyId, action: 'ROUTE_STOPS_SET', entityType: 'ROUTE', entityId: routeId,
        summary: {
          reference: route.reference, reason: data.reason,
          stopCount: data.stops.length, locationIds: data.stops.map((stop) => stop.locationId),
        },
      },
    });
    const updated = await tx.route.findUniqueOrThrow({ where: { id: routeId }, include: routeInclude });
    return presentRoute(updated);
  });
}

/** Manual planning aid for one route; see buildRoutePlan for its limits. */
export async function getRoutePlan(input: { actorId: string; companyId: string; routeId: string }): Promise<{ plan: RoutePlan }> {
  const { route } = await getRoute(input);
  const prisma = getPrisma();
  const companyId = routeCompanyIdSchema.parse(input.companyId);
  const stops = await prisma.routeStop.findMany({
    where: { companyId, routeId: route.id },
    orderBy: { sequence: 'asc' },
    include: { location: { select: { name: true, latitude: true, longitude: true } } },
  });
  const vehicles = await prisma.vehicle.findMany({
    where: { companyId, archivedAt: null },
    select: { registrationNumber: true, seatCount: true },
    take: 500,
  });
  return {
    plan: buildRoutePlan({
      plannedStartTime: route.plannedStartTime,
      expectedDurationMinutes: route.expectedDurationMinutes,
      capacityRequirement: route.capacityRequirement,
      stops: stops.map((stop: {
        sequence: number; stopKind: string; plannedOffsetMinutes: number | null;
        location: { name: string; latitude: Prisma.Decimal | null; longitude: Prisma.Decimal | null };
      }) => ({
        sequence: stop.sequence,
        locationName: stop.location.name,
        stopKind: stop.stopKind,
        plannedOffsetMinutes: stop.plannedOffsetMinutes,
        hasCoordinates: stop.location.latitude !== null && stop.location.longitude !== null,
      })),
      vehicles,
    }),
  };
}
