import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { getPrisma } from '@/server/prisma';
import { PermissionDeniedError, resolvePermission } from '@/modules/auth/permissions';
import { notifyUserInTransaction } from '@/modules/notifications/notifications';
import {
  driverIncidentReportSchema,
  incidentReportSchema,
  incidentTransitionSchema,
} from './incident-schema';
import {
  INCIDENT_TYPE_LABELS,
  isAllowedIncidentTransition,
  type IncidentType,
} from './incident-transitions';

export class IncidentCompanyNotFoundError extends Error {
  constructor() { super('Company not found.'); this.name = 'IncidentCompanyNotFoundError'; }
}
export class IncidentNotFoundError extends Error {
  constructor() { super('Incident not found in this company.'); this.name = 'IncidentNotFoundError'; }
}
export class IncidentValidationError extends Error {
  constructor(message: string) { super(message); this.name = 'IncidentValidationError'; }
}
export class IncidentTransitionNotAllowedError extends Error {
  constructor(from: string, to: string) {
    super(`An incident cannot move from ${from} to ${to}.`);
    this.name = 'IncidentTransitionNotAllowedError';
  }
}
export class IncidentDriverNotLinkedError extends Error {
  constructor() {
    super('This login is not linked to a driver record yet. Ask operations to link your account.');
    this.name = 'IncidentDriverNotLinkedError';
  }
}

const companyIdSchema = z.string().trim().min(1).max(128);
const idSchema = z.string().trim().min(1).max(128);

async function accessFor(actorId: string, companyId: string) {
  const permission = await resolvePermission({ userId: actorId, companyId, permission: 'trip:manage' });
  if (!permission.allowed) throw new PermissionDeniedError();
  if (!(permission.scopes.includes('GLOBAL') || permission.scopes.includes('COMPANY'))) {
    throw new PermissionDeniedError();
  }
  const company = await getPrisma().company.findUnique({ where: { id: companyId }, select: { status: true } });
  if (company?.status !== 'ACTIVE') throw new IncidentCompanyNotFoundError();
}

export type IncidentRecord = {
  id: string;
  reference: string;
  incidentType: string;
  severity: string;
  status: string;
  tripId: string | null;
  tripReference: string | null;
  vehicleId: string | null;
  vehicleRegistration: string | null;
  driverId: string | null;
  driverName: string | null;
  occurredAt: Date;
  locationText: string | null;
  description: string;
  immediateAction: string | null;
  reportedByName: string;
  assignedResponderId: string | null;
  assignedResponderName: string | null;
  resolutionNotes: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const incidentInclude = {
  trip: { select: { reference: true } },
  vehicle: { select: { registrationNumber: true } },
  driver: { select: { fullName: true } },
  reportedBy: { select: { name: true } },
  assignedResponder: { select: { name: true } },
} satisfies Prisma.IncidentInclude;

type IncidentRow = Prisma.IncidentGetPayload<{ include: typeof incidentInclude }>;

function presentIncident(row: IncidentRow): IncidentRecord {
  return {
    id: row.id,
    reference: row.reference,
    incidentType: row.incidentType,
    severity: row.severity,
    status: row.status,
    tripId: row.tripId,
    tripReference: row.trip?.reference ?? null,
    vehicleId: row.vehicleId,
    vehicleRegistration: row.vehicle?.registrationNumber ?? null,
    driverId: row.driverId,
    driverName: row.driver?.fullName ?? null,
    occurredAt: row.occurredAt,
    locationText: row.locationText,
    description: row.description,
    immediateAction: row.immediateAction,
    reportedByName: row.reportedBy.name,
    assignedResponderId: row.assignedResponderId,
    assignedResponderName: row.assignedResponder?.name ?? null,
    resolutionNotes: row.resolutionNotes,
    resolvedAt: row.resolvedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * D-071: alerts every login holding trip:manage at GLOBAL/COMPANY scope in
 * the company. notifyUserInTransaction suppresses the reporter themselves
 * and honours each recipient's preferences; dedupe is per incident+user.
 */
async function alertDispatchers(
  tx: Prisma.TransactionClient,
  input: { companyId: string; actorId: string; incidentId: string; reference: string; incidentType: string; severity: string; tripReference: string | null },
) {
  const assignments = await tx.userRoleAssignment.findMany({
    where: {
      companyId: input.companyId,
      revokedAt: null,
      role: {
        grants: {
          some: { permission: 'trip:manage', scope: { in: ['GLOBAL', 'COMPANY'] } },
        },
      },
    },
    select: { userId: true },
    distinct: ['userId'],
  });
  const label = INCIDENT_TYPE_LABELS[input.incidentType as IncidentType] ?? input.incidentType;
  for (const assignment of assignments) {
    await notifyUserInTransaction(tx, {
      companyId: input.companyId,
      userId: assignment.userId,
      actorId: input.actorId,
      type: 'INCIDENT_REPORTED',
      title: `${label} reported (${input.reference})`,
      body: `Severity ${input.severity.toLowerCase()}${input.tripReference ? ` on trip ${input.tripReference}` : ''}. Open Incidents to respond.`,
      entityType: 'INCIDENT',
      entityId: input.incidentId,
      dedupeKey: `incident:${input.incidentId}:alert`,
    });
  }
}

type IncidentCreateFields = {
  incidentType: string;
  severity: string;
  tripId: string | null;
  vehicleId: string | null;
  driverId: string | null;
  occurredAt: Date;
  locationText: string | null;
  description: string;
  peopleAffected: string | null;
  immediateAction: string | null;
  assignedResponderId: string | null;
};

async function createIncidentCore(
  tx: Prisma.TransactionClient,
  input: { companyId: string; actorId: string; reportedById: string; reason: string } & IncidentCreateFields,
): Promise<IncidentRow> {
  const reference = `INC-${randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`;
  const incident = await tx.incident.create({
    data: {
      companyId: input.companyId,
      reference,
      incidentType: input.incidentType,
      severity: input.severity,
      status: 'Open',
      tripId: input.tripId,
      vehicleId: input.vehicleId,
      driverId: input.driverId,
      occurredAt: input.occurredAt,
      locationText: input.locationText,
      description: input.description,
      peopleAffected: input.peopleAffected,
      immediateAction: input.immediateAction,
      reportedById: input.reportedById,
      assignedResponderId: input.assignedResponderId,
    },
    include: incidentInclude,
  });
  await tx.incidentStatusHistory.create({
    data: {
      companyId: input.companyId, incidentId: incident.id, sequence: 1,
      actorId: input.actorId, fromStatus: null, toStatus: 'Open', reason: input.reason,
    },
  });
  await tx.auditEvent.create({
    data: {
      actorId: input.actorId, companyId: input.companyId, action: 'INCIDENT_REPORTED',
      entityType: 'INCIDENT', entityId: incident.id,
      summary: {
        reference, incidentType: input.incidentType, severity: input.severity,
        tripId: input.tripId, vehicleId: input.vehicleId, driverId: input.driverId,
        reason: input.reason,
      },
    },
  });
  await alertDispatchers(tx, {
    companyId: input.companyId,
    actorId: input.actorId,
    incidentId: incident.id,
    reference,
    incidentType: input.incidentType,
    severity: input.severity,
    tripReference: incident.trip?.reference ?? null,
  });
  return incident;
}

/** INC-01: an operations/dispatch manager records an incident. */
export async function reportIncident(input: unknown, actorId: string, companyIdInput: string) {
  const data = incidentReportSchema.parse(input);
  const companyId = companyIdSchema.parse(companyIdInput);
  await accessFor(actorId, companyId);
  const prisma = getPrisma();
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    if (data.tripId) {
      const trip = await tx.trip.findFirst({ where: { id: data.tripId, companyId }, select: { id: true } });
      if (!trip) throw new IncidentValidationError('Trip not found in this company.');
    }
    if (data.vehicleId) {
      const vehicle = await tx.vehicle.findFirst({ where: { id: data.vehicleId, companyId }, select: { id: true } });
      if (!vehicle) throw new IncidentValidationError('Vehicle not found in this company.');
    }
    if (data.driverId) {
      const driver = await tx.driver.findFirst({ where: { id: data.driverId, companyId }, select: { id: true } });
      if (!driver) throw new IncidentValidationError('Driver not found in this company.');
    }
    if (data.assignedResponderId) {
      const responder = await tx.user.findUnique({ where: { id: data.assignedResponderId }, select: { id: true } });
      if (!responder) throw new IncidentValidationError('Assigned responder login not found.');
    }
    const incident = await createIncidentCore(tx, {
      companyId,
      actorId,
      reportedById: actorId,
      reason: data.reason,
      incidentType: data.incidentType,
      severity: data.severity,
      tripId: data.tripId,
      vehicleId: data.vehicleId,
      driverId: data.driverId,
      occurredAt: new Date(data.occurredAt),
      locationText: data.locationText ?? null,
      description: data.description,
      peopleAffected: data.peopleAffected ?? null,
      immediateAction: data.immediateAction ?? null,
      assignedResponderId: data.assignedResponderId ?? null,
    });
    return presentIncident(incident);
  });
}

/**
 * INC-01/02 entry point: a driver reports against their own active trip.
 * Vehicle and driver are derived from the trip, never supplied by the client.
 */
export async function reportIncidentAsDriver(input: unknown, driverUserId: string, companyIdInput: string) {
  const data = driverIncidentReportSchema.parse(input);
  const companyId = companyIdSchema.parse(companyIdInput);
  const prisma = getPrisma();
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { status: true } });
  if (company?.status !== 'ACTIVE') throw new IncidentCompanyNotFoundError();
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const driver = await tx.driver.findFirst({
      where: { companyId, userId: driverUserId, archivedAt: null },
      select: { id: true },
    });
    if (!driver) throw new IncidentDriverNotLinkedError();
    const trip = await tx.trip.findFirst({
      where: { id: data.tripId, companyId, driverId: driver.id },
      select: { id: true, status: true, vehicleId: true },
    });
    if (!trip) {
      throw new IncidentValidationError('That trip is not assigned to you, so the incident cannot be attached to it.');
    }
    if (!['Ready for Dispatch', 'Dispatched', 'In Progress', 'Delayed', 'Interrupted'].includes(trip.status)) {
      throw new IncidentValidationError(`Incidents can only be reported against an active trip; this trip is ${trip.status}.`);
    }
    const incident = await createIncidentCore(tx, {
      companyId,
      actorId: driverUserId,
      reportedById: driverUserId,
      reason: data.reason,
      incidentType: data.incidentType,
      severity: data.severity,
      tripId: trip.id,
      vehicleId: trip.vehicleId,
      driverId: driver.id,
      occurredAt: new Date(data.occurredAt),
      locationText: data.locationText ?? null,
      description: data.description,
      peopleAffected: null,
      immediateAction: data.immediateAction ?? null,
      assignedResponderId: null,
    });
    return presentIncident(incident);
  });
}

export async function listIncidents(input: {
  actorId: string; companyId: string; status?: string; incidentType?: string;
}) {
  const companyId = companyIdSchema.parse(input.companyId);
  await accessFor(input.actorId, companyId);
  const prisma = getPrisma();
  const [rows, totalCount] = await Promise.all([
    prisma.incident.findMany({
      where: {
        companyId,
        ...(input.status ? { status: input.status } : {}),
        ...(input.incidentType ? { incidentType: input.incidentType } : {}),
      },
      include: incidentInclude,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: 100,
    }),
    prisma.incident.count({
      where: {
        companyId,
        ...(input.status ? { status: input.status } : {}),
        ...(input.incidentType ? { incidentType: input.incidentType } : {}),
      },
    }),
  ]);
  return { incidents: rows.map(presentIncident), totalCount };
}

export type IncidentDetail = {
  incident: IncidentRecord & { peopleAffected: string | null };
  history: Array<{
    sequence: number; fromStatus: string | null; toStatus: string;
    reason: string; actorName: string; createdAt: Date;
  }>;
  affectedPassengers: Array<{
    bookingId: string; reference: string; status: string; employeeName: string;
  }>;
};

/** Incident-manager detail: restricted peopleAffected is included here only. */
export async function getIncidentDetail(input: {
  actorId: string; companyId: string; incidentId: string;
}): Promise<IncidentDetail> {
  const companyId = companyIdSchema.parse(input.companyId);
  const incidentId = idSchema.parse(input.incidentId);
  await accessFor(input.actorId, companyId);
  const prisma = getPrisma();
  const incident = await prisma.incident.findFirst({
    where: { id: incidentId, companyId },
    include: {
      ...incidentInclude,
      statusHistory: {
        orderBy: { sequence: 'asc' },
        include: { actor: { select: { name: true } } },
      },
    },
  });
  if (!incident) throw new IncidentNotFoundError();
  const affectedPassengers = incident.tripId
    ? await prisma.booking.findMany({
      where: {
        companyId, tripId: incident.tripId, status: { in: ['Assigned', 'Boarded', 'Completed'] },
      },
      orderBy: [{ employee: { fullName: 'asc' } }, { id: 'asc' }],
      take: 200,
      select: {
        id: true, reference: true, status: true,
        employee: { select: { fullName: true } },
      },
    })
    : [];
  const { statusHistory, ...rest } = incident;
  return {
    incident: {
      ...presentIncident(rest as IncidentRow),
      peopleAffected: incident.peopleAffected,
    },
    history: statusHistory.map((row) => ({
      sequence: row.sequence,
      fromStatus: row.fromStatus,
      toStatus: row.toStatus,
      reason: row.reason,
      actorName: row.actor.name,
      createdAt: row.createdAt,
    })),
    affectedPassengers: affectedPassengers.map((row) => ({
      bookingId: row.id,
      reference: row.reference,
      status: row.status,
      employeeName: row.employee.fullName,
    })),
  };
}

/** The single governed path for incident status changes (D-071). */
export async function transitionIncident(input: unknown, actorId: string, companyIdInput: string, incidentIdInput: string) {
  const data = incidentTransitionSchema.parse(input);
  const companyId = companyIdSchema.parse(companyIdInput);
  const incidentId = idSchema.parse(incidentIdInput);
  await accessFor(actorId, companyId);
  const prisma = getPrisma();
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const rows = await tx.$queryRaw<Array<{ status: string; reference: string; reportedById: string }>>`
      SELECT "status", "reference", "reportedById" FROM "Incident"
      WHERE "id" = ${incidentId} AND "companyId" = ${companyId}
      FOR UPDATE
    `;
    const current = rows[0];
    if (!current) throw new IncidentNotFoundError();
    if (!isAllowedIncidentTransition(current.status, data.toStatus)) {
      throw new IncidentTransitionNotAllowedError(current.status, data.toStatus);
    }
    if (data.toStatus === 'Resolved' && !data.resolutionNotes) {
      throw new IncidentValidationError('Resolution notes are required to resolve an incident.');
    }
    const changed = await tx.incident.updateMany({
      where: { id: incidentId, companyId, status: current.status },
      data: {
        status: data.toStatus,
        ...(data.toStatus === 'Resolved'
          ? { resolvedAt: new Date(), resolutionNotes: data.resolutionNotes }
          : {}),
        ...(current.status === 'Resolved' && data.toStatus === 'In Progress'
          ? { resolvedAt: null }
          : {}),
      },
    });
    if (changed.count !== 1) throw new IncidentTransitionNotAllowedError(current.status, data.toStatus);
    const latest = await tx.incidentStatusHistory.findFirst({
      where: { companyId, incidentId },
      orderBy: { sequence: 'desc' },
      select: { sequence: true },
    });
    const nextSequence = (latest?.sequence ?? 0) + 1;
    await tx.incidentStatusHistory.create({
      data: {
        companyId, incidentId, sequence: nextSequence, actorId,
        fromStatus: current.status, toStatus: data.toStatus, reason: data.reason,
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId, companyId, action: 'INCIDENT_STATUS_CHANGED', entityType: 'INCIDENT', entityId: incidentId,
        summary: { reference: current.reference, fromStatus: current.status, toStatus: data.toStatus, reason: data.reason },
      },
    });
    if (current.reportedById !== actorId) {
      await notifyUserInTransaction(tx, {
        companyId,
        userId: current.reportedById,
        actorId,
        type: 'INCIDENT_UPDATED',
        title: `Incident update (${current.reference})`,
        body: `The incident you reported is now ${data.toStatus}.`,
        entityType: 'INCIDENT',
        entityId: incidentId,
        dedupeKey: `incident:${incidentId}:history:${nextSequence}`,
      });
    }
    const incident = await tx.incident.findUniqueOrThrow({
      where: { id: incidentId }, include: incidentInclude,
    });
    return presentIncident(incident);
  });
}
