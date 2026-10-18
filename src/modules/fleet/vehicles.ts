import { z } from 'zod';
import { resolvePermission, PermissionDeniedError } from '@/modules/auth/permissions';
import { getPrisma } from '@/server/prisma';
import { vehicleInputSchema, vehicleListQuerySchema, vehicleRequestSchema } from './vehicle-schema';

const companyIdSchema = z.string().trim().min(1).max(128);
const vehicleIdSchema = z.string().trim().min(1).max(128);

export class FleetCompanyNotFoundError extends Error {
  readonly code = 'COMPANY_NOT_FOUND';
  constructor() { super('Company not found.'); this.name = 'FleetCompanyNotFoundError'; }
}
export class VehicleNotFoundError extends Error {
  readonly code = 'VEHICLE_NOT_FOUND';
  constructor() { super('Vehicle not found.'); this.name = 'VehicleNotFoundError'; }
}
export class InvalidVehicleCursorError extends Error {
  readonly code = 'INVALID_VEHICLE_CURSOR';
  constructor() { super('Invalid vehicle cursor.'); this.name = 'InvalidVehicleCursorError'; }
}

function normalizeRegistrationNumber(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLocaleUpperCase('en');
}

async function accessFor(actorId: string, companyId: string) {
  const access = await resolvePermission({ userId: actorId, companyId, permission: 'fleet:manage' });
  if (!access.allowed) throw new PermissionDeniedError();
  const company = await getPrisma().company.findUnique({ where: { id: companyId }, select: { status: true } });
  if (company?.status !== 'ACTIVE') throw new FleetCompanyNotFoundError();
  return {
    scopes: access.scopes,
    canManage: access.scopes.includes('GLOBAL') || access.scopes.includes('COMPANY'),
  };
}

function asVehicleInput(input: z.infer<typeof vehicleInputSchema>) {
  return {
    registrationNumber: normalizeRegistrationNumber(input.registrationNumber),
    make: input.make,
    model: input.model,
    category: input.category,
    seatCount: input.seatCount,
    fuelType: input.fuelType || null,
    ownershipType: input.ownershipType || null,
    odometerValue: input.odometerValue,
    odometerUnit: input.odometerUnit,
    insuranceExpiresAt: input.insuranceExpiresAt ? new Date(`${input.insuranceExpiresAt}T00:00:00.000Z`) : null,
    roadworthinessExpiresAt: input.roadworthinessExpiresAt ? new Date(`${input.roadworthinessExpiresAt}T00:00:00.000Z`) : null,
    registrationExpiresAt: input.registrationExpiresAt ? new Date(`${input.registrationExpiresAt}T00:00:00.000Z`) : null,
    nextServiceAt: input.nextServiceAt ? new Date(`${input.nextServiceAt}T00:00:00.000Z`) : null,
    notes: input.notes || null,
  };
}

export type VehicleRecord = {
  id: string; registrationNumber: string; make: string; model: string; category: string;
  seatCount: number | null; fuelType: string | null; ownershipType: string | null;
  odometerValue: string | null; odometerUnit: string | null;
  insuranceExpiresAt: string | null; roadworthinessExpiresAt: string | null;
  registrationExpiresAt: string | null; nextServiceAt: string | null; notes: string | null;
  createdAt: Date; updatedAt: Date;
};

function presentVehicle<T extends {
  id: string; registrationNumber: string; make: string; model: string; category: string;
  seatCount: number | null; createdAt: Date; updatedAt: Date;
}>(vehicle: T): VehicleRecord {
  const row = vehicle as T & {
    fuelType?: string | null; ownershipType?: string | null; odometerValue?: { toString(): string } | null;
    odometerUnit?: string | null; insuranceExpiresAt?: Date | null; roadworthinessExpiresAt?: Date | null;
    registrationExpiresAt?: Date | null; nextServiceAt?: Date | null; notes?: string | null;
  };
  return {
    id: row.id,
    registrationNumber: row.registrationNumber,
    make: row.make,
    model: row.model,
    category: row.category,
    seatCount: row.seatCount,
    fuelType: row.fuelType ?? null,
    ownershipType: row.ownershipType ?? null,
    odometerValue: row.odometerValue?.toString() ?? null,
    odometerUnit: row.odometerUnit ?? null,
    insuranceExpiresAt: row.insuranceExpiresAt?.toISOString().slice(0, 10) ?? null,
    roadworthinessExpiresAt: row.roadworthinessExpiresAt?.toISOString().slice(0, 10) ?? null,
    registrationExpiresAt: row.registrationExpiresAt?.toISOString().slice(0, 10) ?? null,
    nextServiceAt: row.nextServiceAt?.toISOString().slice(0, 10) ?? null,
    notes: row.notes ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listVehicles(input: {
  actorId: string; companyId: string; search?: string; cursor?: string;
}): Promise<{ vehicles: VehicleRecord[]; nextCursor: string | null; canManage: boolean }> {
  const companyId = companyIdSchema.parse(input.companyId);
  const query = vehicleListQuerySchema.parse({ search: input.search, cursor: input.cursor });
  const access = await accessFor(input.actorId, companyId);
  const prisma = getPrisma();
  if (query.cursor) {
    const cursorVehicle = await prisma.vehicle.findFirst({
      where: { id: query.cursor, companyId, archivedAt: null }, select: { id: true },
    });
    if (!cursorVehicle) throw new InvalidVehicleCursorError();
  }
  const where = {
    companyId,
    archivedAt: null,
    ...(query.search ? { OR: [
      { registrationNumber: { contains: query.search, mode: 'insensitive' as const } },
      { make: { contains: query.search, mode: 'insensitive' as const } },
      { model: { contains: query.search, mode: 'insensitive' as const } },
      { category: { contains: query.search, mode: 'insensitive' as const } },
    ] } : {}),
  };
  const take = 51;
  if (!access.canManage) {
    const rows = await prisma.vehicle.findMany({
      where, orderBy: [{ registrationNumber: 'asc' }, { id: 'asc' }], take,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: { id: true, registrationNumber: true, make: true, model: true, category: true, seatCount: true, createdAt: true, updatedAt: true },
    });
    const hasMore = rows.length > 50;
    const vehicles = rows.slice(0, 50).map(presentVehicle);
    return { vehicles, nextCursor: hasMore ? vehicles.at(-1)?.id ?? null : null, canManage: false };
  }
  const rows = await prisma.vehicle.findMany({
    where, orderBy: [{ registrationNumber: 'asc' }, { id: 'asc' }], take,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > 50;
  const vehicles = rows.slice(0, 50).map(presentVehicle);
  return { vehicles, nextCursor: hasMore ? vehicles.at(-1)?.id ?? null : null, canManage: true };
}

export async function getVehicle(input: { actorId: string; companyId: string; vehicleId: string }) {
  const companyId = companyIdSchema.parse(input.companyId);
  const vehicleId = vehicleIdSchema.parse(input.vehicleId);
  const access = await accessFor(input.actorId, companyId);
  const prisma = getPrisma();
  if (!access.canManage) {
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, companyId, archivedAt: null },
      select: { id: true, registrationNumber: true, make: true, model: true, category: true, seatCount: true, createdAt: true, updatedAt: true },
    });
    if (!vehicle) throw new VehicleNotFoundError();
    return { vehicle: presentVehicle(vehicle), canManage: false };
  }
  const vehicle = await prisma.vehicle.findFirst({ where: { id: vehicleId, companyId, archivedAt: null } });
  if (!vehicle) throw new VehicleNotFoundError();
  return { vehicle: presentVehicle(vehicle), canManage: true };
}

export async function createVehicle(input: unknown, actorId: string, companyIdInput: string) {
  const data = vehicleRequestSchema.parse(input);
  const companyId = companyIdSchema.parse(companyIdInput);
  const access = await accessFor(actorId, companyId);
  if (!access.canManage) throw new PermissionDeniedError();
  const prisma = getPrisma();
  const vehicle = asVehicleInput(data);
  return prisma.$transaction(async (tx) => {
    const created = await tx.vehicle.create({ data: { ...vehicle, companyId } });
    await tx.auditEvent.create({
      data: {
        actorId, companyId, action: 'VEHICLE_CREATED', entityType: 'VEHICLE', entityId: created.id,
        summary: { registrationNumber: created.registrationNumber, reason: data.reason },
      },
    });
    return presentVehicle(created);
  });
}

export async function updateVehicle(input: unknown, actorId: string, companyIdInput: string, vehicleIdInput: string) {
  const data = vehicleRequestSchema.parse(input);
  const companyId = companyIdSchema.parse(companyIdInput);
  const vehicleId = vehicleIdSchema.parse(vehicleIdInput);
  const access = await accessFor(actorId, companyId);
  if (!access.canManage) throw new PermissionDeniedError();
  const prisma = getPrisma();
  const values = asVehicleInput(data);
  return prisma.$transaction(async (tx) => {
    const changed = await tx.vehicle.updateMany({ where: { id: vehicleId, companyId, archivedAt: null }, data: values });
    if (changed.count !== 1) throw new VehicleNotFoundError();
    const updated = await tx.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });
    await tx.auditEvent.create({
      data: {
        actorId, companyId, action: 'VEHICLE_UPDATED', entityType: 'VEHICLE', entityId: updated.id,
        summary: { registrationNumber: updated.registrationNumber, reason: data.reason },
      },
    });
    return presentVehicle(updated);
  });
}

export async function archiveVehicle(input: { actorId: string; companyId: string; vehicleId: string; reason: string }) {
  const data = z.object({
    actorId: z.string().min(1), companyId: companyIdSchema, vehicleId: vehicleIdSchema,
    reason: z.string().trim().min(8).max(500),
  }).strict().parse(input);
  const access = await accessFor(data.actorId, data.companyId);
  if (!access.canManage) throw new PermissionDeniedError();
  const prisma = getPrisma();
  return prisma.$transaction(async (tx) => {
    const vehicle = await tx.vehicle.findFirst({ where: { id: data.vehicleId, companyId: data.companyId, archivedAt: null } });
    if (!vehicle) throw new VehicleNotFoundError();
    const archivedAt = new Date();
    const result = await tx.vehicle.updateMany({ where: { id: vehicle.id, companyId: data.companyId, archivedAt: null }, data: { archivedAt } });
    if (result.count !== 1) throw new VehicleNotFoundError();
    await tx.auditEvent.create({
      data: {
        actorId: data.actorId, companyId: data.companyId, action: 'VEHICLE_ARCHIVED', entityType: 'VEHICLE', entityId: vehicle.id,
        summary: { registrationNumber: vehicle.registrationNumber, reason: data.reason },
      },
    });
    return { id: vehicle.id, archivedAt };
  });
}

export function isUniqueVehicleError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
