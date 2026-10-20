import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PermissionDeniedError, resolvePermission } from '@/modules/auth/permissions';
import { getPrisma } from '@/server/prisma';

const idSchema = z.string().trim().min(1).max(128);
const statusSchema = z.enum(['Under Maintenance', 'Out of Service', 'Pending Inspection']);
const applySchema = z.object({
  actorId: idSchema,
  companyId: idSchema,
  vehicleId: idSchema,
  status: statusSchema,
  reason: z.string().trim().min(8).max(500),
}).strict();
const releaseSchema = z.object({
  actorId: idSchema,
  companyId: idSchema,
  vehicleId: idSchema,
  blockId: idSchema,
  workCompletedAt: z.string().datetime({ offset: true }),
  inspectionResults: z.string().trim().min(8).max(4000),
  inspectionPassed: z.literal(true),
  reason: z.string().trim().min(8).max(500),
}).strict();

export class SafetyBlockVehicleNotFoundError extends Error {
  constructor() { super('Vehicle or safety-block record is not available.'); this.name = 'SafetyBlockVehicleNotFoundError'; }
}
export class ActiveSafetyBlockExistsError extends Error {
  constructor(readonly status: string) { super(`Vehicle already has an active ${status} safety block.`); this.name = 'ActiveSafetyBlockExistsError'; }
}
export class SafetyBlockNotFoundError extends Error {
  constructor() { super('Active safety block not found for this vehicle.'); this.name = 'SafetyBlockNotFoundError'; }
}
export class SafetyBlockReleasePolicyError extends Error {
  constructor(message: string) { super(message); this.name = 'SafetyBlockReleasePolicyError'; }
}

type Block = { id: string; status: string; reason: string; appliedAt: Date };
type ReleasedBlock = Block & { releasedAt: Date | null };
export type ActiveSafetyStatus = { id: string; status: string; appliedAt: Date; reason?: string };
type SafetyPersistence = {
  vehicleSafetyBlock: {
    findFirst(args: unknown): Promise<Block | null>;
    findMany(args: unknown): Promise<Array<{ id: string; vehicleId: string; status: string; appliedAt: Date; reason?: string }>>;
    create(args: unknown): Promise<Block>;
    update(args: unknown): Promise<ReleasedBlock>;
  };
};

async function requireApplyPermission(actorId: string, companyId: string) {
  const access = await resolvePermission({ userId: actorId, companyId, permission: 'fleet:manage' });
  if (!access.allowed || !access.scopes.some((scope) => ['COMPANY', 'GLOBAL'].includes(scope))) throw new PermissionDeniedError();
}
async function requireReleasePermission(actorId: string, companyId: string) {
  const access = await resolvePermission({ userId: actorId, companyId, permission: 'maintenance:manage' });
  if (!access.allowed || !access.scopes.some((scope) => ['COMPANY', 'GLOBAL', 'APPROVE_RELEASE'].includes(scope))) throw new PermissionDeniedError();
}

export async function applyVehicleSafetyBlock(input: unknown) {
  const data = applySchema.parse(input);
  await requireApplyPermission(data.actorId, data.companyId);
  const prisma = getPrisma();
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const company = await tx.company.findUnique({ where: { id: data.companyId }, select: { status: true } });
    if (company?.status !== 'ACTIVE') throw new SafetyBlockVehicleNotFoundError();
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Vehicle"
      WHERE "id" = ${data.vehicleId} AND "companyId" = ${data.companyId} AND "archivedAt" IS NULL
      FOR UPDATE
    `;
    if (locked.length === 0) throw new SafetyBlockVehicleNotFoundError();
    const store = tx as unknown as SafetyPersistence;
    const current = await store.vehicleSafetyBlock.findFirst({
      where: { companyId: data.companyId, vehicleId: data.vehicleId, releasedAt: null },
      select: { id: true, status: true, reason: true, appliedAt: true },
    });
    if (current) throw new ActiveSafetyBlockExistsError(current.status);
    const block = await store.vehicleSafetyBlock.create({
      data: { companyId: data.companyId, vehicleId: data.vehicleId, status: data.status, reason: data.reason, appliedById: data.actorId },
      select: { id: true, status: true, reason: true, appliedAt: true },
    });
    await tx.auditEvent.create({
      data: {
        actorId: data.actorId, companyId: data.companyId, action: 'VEHICLE_SAFETY_BLOCK_APPLIED',
        entityType: 'VEHICLE_SAFETY_BLOCK', entityId: block.id,
        summary: { vehicleId: data.vehicleId, status: data.status, reason: data.reason },
      },
    });
    return block;
  });
}

export async function releaseVehicleSafetyBlock(input: unknown) {
  const data = releaseSchema.parse(input);
  const workCompletedAt = new Date(data.workCompletedAt);
  if (workCompletedAt.getTime() > Date.now()) throw new SafetyBlockReleasePolicyError('Work completion time cannot be in the future.');
  await requireReleasePermission(data.actorId, data.companyId);
  const prisma = getPrisma();
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const company = await tx.company.findUnique({ where: { id: data.companyId }, select: { status: true } });
    if (company?.status !== 'ACTIVE') throw new SafetyBlockVehicleNotFoundError();
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Vehicle"
      WHERE "id" = ${data.vehicleId} AND "companyId" = ${data.companyId} AND "archivedAt" IS NULL
      FOR UPDATE
    `;
    if (locked.length === 0) throw new SafetyBlockVehicleNotFoundError();
    const store = tx as unknown as SafetyPersistence;
    const current = await store.vehicleSafetyBlock.findFirst({
      where: { id: data.blockId, companyId: data.companyId, vehicleId: data.vehicleId, releasedAt: null },
      select: { id: true, status: true, reason: true, appliedAt: true },
    });
    if (!current) throw new SafetyBlockNotFoundError();
    if (workCompletedAt.getTime() < current.appliedAt.getTime()) {
      throw new SafetyBlockReleasePolicyError('Work completion must be recorded after the safety block was applied.');
    }
    const releasedAt = new Date();
    const block = await store.vehicleSafetyBlock.update({
      where: { id: data.blockId },
      data: {
        releasedById: data.actorId, releasedAt, releaseReason: data.reason,
        workCompletedAt, inspectionResults: data.inspectionResults, inspectionPassed: true,
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId: data.actorId, companyId: data.companyId, action: 'VEHICLE_SAFETY_BLOCK_RELEASED',
        entityType: 'VEHICLE_SAFETY_BLOCK', entityId: block.id,
        summary: {
          vehicleId: data.vehicleId, status: current.status, workCompletedAt: workCompletedAt.toISOString(),
          inspectionPassed: true, reason: data.reason,
        },
      },
    });
    return block;
  });
}

/** Caller must already have authorized the vehicle list; limited fleet projections never receive block reasons. */
export async function safetyStatusForVehicles(companyId: string, vehicleIds: string[], includeReason = false) {
  if (vehicleIds.length === 0) return new Map<string, ActiveSafetyStatus>();
  const prisma = getPrisma();
  const store = prisma as unknown as SafetyPersistence;
  const blocks = await store.vehicleSafetyBlock.findMany({
    where: { companyId, vehicleId: { in: vehicleIds }, releasedAt: null },
    select: { id: true, vehicleId: true, status: true, appliedAt: true, ...(includeReason ? { reason: true } : {}) },
  });
  return new Map(blocks.map((block) => [block.vehicleId, {
    id: block.id, status: block.status, appliedAt: block.appliedAt,
    ...(includeReason && typeof block.reason === 'string' ? { reason: block.reason } : {}),
  }]));
}
