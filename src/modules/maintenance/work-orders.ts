import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PermissionDeniedError, resolvePermission } from '@/modules/auth/permissions';
import { getPrisma } from '@/server/prisma';

const idSchema = z.string().trim().min(1).max(128);
export const WORK_ORDER_STATUSES = ['Reported', 'Awaiting Inspection', 'Approved', 'In Progress', 'Awaiting Parts', 'Awaiting Review', 'Completed', 'Closed', 'Cancelled'] as const;
const workOrderStatusSchema = z.enum(WORK_ORDER_STATUSES);
const transitionSchema = z.object({
  actorId: idSchema,
  companyId: idSchema,
  workOrderId: idSchema,
  toStatus: z.enum(['Awaiting Inspection', 'Approved', 'In Progress', 'Awaiting Parts', 'Awaiting Review', 'Completed', 'Closed', 'Cancelled']),
  reason: z.string().trim().min(8).max(500),
  requiredWork: z.string().trim().max(4000).nullable().optional(),
  parts: z.string().trim().max(4000).nullable().optional(),
  completionDate: z.string().datetime({ offset: true }).optional(),
  inspectionResults: z.string().trim().min(8).max(4000).optional(),
  labourCostPesewas: z.number().int().nonnegative().safe().nullable().optional(),
  partsCostPesewas: z.number().int().nonnegative().safe().nullable().optional(),
  otherCostPesewas: z.number().int().nonnegative().safe().nullable().optional(),
}).strict().superRefine((data, context) => {
  const completionFields = [data.completionDate, data.inspectionResults, data.labourCostPesewas, data.partsCostPesewas, data.otherCostPesewas];
  if (data.toStatus === 'Completed') {
    if (!data.completionDate || !data.inspectionResults) context.addIssue({ code: z.ZodIssueCode.custom, path: ['completionDate'], message: 'Completion requires a date and inspection results.' });
  } else if (completionFields.some((value) => value !== undefined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['completionDate'], message: 'Completion details may only be supplied when completing the work order.' });
  }
  if (data.toStatus !== 'Approved' && (data.requiredWork !== undefined || data.parts !== undefined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['requiredWork'], message: 'Planned work and parts may only be supplied at approval.' });
  }
});

const createSchema = z.object({
  actorId: idSchema,
  companyId: idSchema,
  vehicleId: idSchema,
  reportedFault: z.string().trim().min(8).max(2000),
  workType: z.string().trim().max(120).nullable().optional(),
  priority: z.string().trim().max(40).nullable().optional(),
  dateReported: z.string().date(),
  odometerValue: z.number().finite().nonnegative().multipleOf(0.01).max(9999999999.99).nullable().optional(),
  odometerUnit: z.enum(['KM', 'MILE']).nullable().optional(),
  safetyRelated: z.boolean(),
  reason: z.string().trim().min(8).max(500),
}).strict().refine((data) => (data.odometerValue == null) === (data.odometerUnit == null), {
  message: 'Record an odometer unit whenever a reading is entered.', path: ['odometerUnit'],
});

export class WorkOrderNotFoundError extends Error {
  constructor() { super('Vehicle or work-order register is not available.'); this.name = 'WorkOrderNotFoundError'; }
}
export class WorkOrderPolicyError extends Error {
  constructor(message: string) { super(message); this.name = 'WorkOrderPolicyError'; }
}
export class InvalidWorkOrderCursorError extends Error {
  constructor() { super('Invalid work-order page cursor.'); this.name = 'InvalidWorkOrderCursorError'; }
}

export type WorkOrderRecord = {
  id: string;
  reference: string;
  vehicleId: string;
  reportedFault: string;
  workType: string | null;
  priority: string | null;
  dateReported: string;
  status: string;
  requiredWork: string | null;
  parts: string | null;
  completionDate: string | null;
  inspectionResults: string | null;
  labourCostPesewas: string | null;
  partsCostPesewas: string | null;
  otherCostPesewas: string | null;
  vehicle: { registrationNumber: string; make: string; model: string };
  statusHistory: Array<{ sequence: number; fromStatus: string | null; toStatus: string; reason: string; createdAt: string; actorName: string }>;
};
type CreatedWorkOrderRecord = {
  id: string;
  reference: string;
  status: string;
  safetyRelated: boolean;
  workType: string | null;
  priority: string | null;
  odometerValue: unknown;
  odometerUnit: string | null;
};
type WorkOrderStore = {
  maintenanceWorkOrder: {
    create(args: unknown): Promise<CreatedWorkOrderRecord>;
    findMany(args: unknown): Promise<unknown[]>;
    findFirst(args: unknown): Promise<{ id: string } | null>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  maintenanceWorkOrderStatusHistory: {
    create(args: unknown): Promise<unknown>;
    findFirst(args: unknown): Promise<{ sequence: number } | null>;
  };
};

async function requireMaintenanceManager(actorId: string, companyId: string) {
  const access = await resolvePermission({ userId: actorId, companyId, permission: 'maintenance:manage' });
  if (!access.allowed || !access.scopes.some((scope) => ['COMPANY', 'GLOBAL', 'APPROVE_RELEASE'].includes(scope))) {
    throw new PermissionDeniedError();
  }
}

/** Lists work orders for authorized company maintenance managers. */
export async function listWorkOrders(actorIdInput: string, companyIdInput: string, statusInput?: string, searchInput?: string, cursorInput?: string) {
  const actorId = idSchema.parse(actorIdInput);
  const companyId = idSchema.parse(companyIdInput);
  const status = statusInput ? workOrderStatusSchema.parse(statusInput) : undefined;
  const search = searchInput === undefined ? undefined : z.string().trim().max(100).parse(searchInput) || undefined;
  const cursor = cursorInput ? idSchema.parse(cursorInput) : undefined;
  await requireMaintenanceManager(actorId, companyId);
  const prisma = getPrisma();
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { status: true } });
  if (company?.status !== 'ACTIVE') throw new WorkOrderNotFoundError();
  const store = prisma as unknown as WorkOrderStore;
  if (cursor && !(await store.maintenanceWorkOrder.findFirst({ where: { id: cursor, companyId }, select: { id: true } }))) {
    throw new InvalidWorkOrderCursorError();
  }
  const rows = await store.maintenanceWorkOrder.findMany({
    where: {
      companyId,
      ...(status ? { status } : {}),
      ...(search ? { OR: [
        { reference: { contains: search, mode: 'insensitive' } },
        { reportedFault: { contains: search, mode: 'insensitive' } },
        { vehicle: { is: { registrationNumber: { contains: search, mode: 'insensitive' } } } },
      ] } : {}),
    },
    orderBy: [{ dateReported: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    take: 101,
    select: {
      id: true, reference: true, vehicleId: true, reportedFault: true, workType: true, priority: true,
      dateReported: true, status: true, requiredWork: true, parts: true, completionDate: true, inspectionResults: true,
      labourCostPesewas: true, partsCostPesewas: true, otherCostPesewas: true,
      vehicle: { select: { registrationNumber: true, make: true, model: true } },
      statusHistory: {
        take: 50, orderBy: { sequence: 'desc' },
        select: { sequence: true, fromStatus: true, toStatus: true, reason: true, createdAt: true, actor: { select: { name: true } } },
      },
    },
  }) as Array<Omit<WorkOrderRecord, 'dateReported' | 'statusHistory' | 'completionDate' | 'labourCostPesewas' | 'partsCostPesewas' | 'otherCostPesewas'> & {
    dateReported: Date;
    completionDate: Date | null;
    labourCostPesewas: bigint | null;
    partsCostPesewas: bigint | null;
    otherCostPesewas: bigint | null;
    statusHistory: Array<Omit<WorkOrderRecord['statusHistory'][number], 'createdAt' | 'actorName'> & { createdAt: Date; actor: { name: string } }>;
  }>;
  const pageRows = rows.slice(0, 100);
  return {
    workOrders: pageRows.map((row) => ({
      ...row,
      dateReported: row.dateReported.toISOString().slice(0, 10),
      completionDate: row.completionDate?.toISOString() ?? null,
      labourCostPesewas: row.labourCostPesewas?.toString() ?? null,
      partsCostPesewas: row.partsCostPesewas?.toString() ?? null,
      otherCostPesewas: row.otherCostPesewas?.toString() ?? null,
      statusHistory: row.statusHistory.map(({ actor, ...event }) => ({ ...event, createdAt: event.createdAt.toISOString(), actorName: actor.name })),
    })),
    nextCursor: rows.length > 100 ? pageRows[pageRows.length - 1]?.id ?? null : null,
  };
}

/** Creates a reported non-safety work order. Safety-blocked defects are refused until MNT-02 is active. */
const workOrderTransitions: Record<string, readonly string[]> = {
  Reported: ['Awaiting Inspection', 'Cancelled'],
  'Awaiting Inspection': ['Approved', 'Cancelled'],
  Approved: ['In Progress'],
  'In Progress': ['Awaiting Parts', 'Awaiting Review'],
  'Awaiting Parts': ['In Progress'],
  'Awaiting Review': ['Completed'],
  Completed: ['Closed'],
  Closed: [],
  Cancelled: [],
};

export async function createWorkOrder(input: unknown) {
  const data = createSchema.parse(input);
  if (data.safetyRelated) throw new WorkOrderPolicyError('Safety-related work orders cannot be entered until safety blocking and release controls are active.');
  await requireMaintenanceManager(data.actorId, data.companyId);
  const prisma = getPrisma();
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const company = await tx.company.findUnique({ where: { id: data.companyId }, select: { status: true } });
    if (company?.status !== 'ACTIVE') throw new WorkOrderNotFoundError();
    const vehicle = await tx.vehicle.findFirst({
      where: { id: data.vehicleId, companyId: data.companyId, archivedAt: null },
      select: { id: true },
    });
    if (!vehicle) throw new WorkOrderNotFoundError();
    const reference = `WO-${randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`;
    const store = tx as unknown as WorkOrderStore;
    const workOrder = await store.maintenanceWorkOrder.create({
      data: {
        companyId: data.companyId,
        vehicleId: vehicle.id,
        reference,
        reportedFault: data.reportedFault,
        workType: data.workType?.trim() || null,
        priority: data.priority?.trim() || null,
        dateReported: new Date(`${data.dateReported}T00:00:00.000Z`),
        odometerValue: data.odometerValue ?? null,
        odometerUnit: data.odometerUnit ?? null,
        safetyRelated: false,
        reason: data.reason,
        status: 'Reported',
        createdById: data.actorId,
      },
      include: { vehicle: { select: { registrationNumber: true, make: true, model: true } } },
    });
    await store.maintenanceWorkOrderStatusHistory.create({
      data: {
        companyId: data.companyId, workOrderId: String(workOrder.id), sequence: 1,
        actorId: data.actorId, fromStatus: null, toStatus: 'Reported', reason: data.reason,
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId: data.actorId,
        companyId: data.companyId,
        action: 'MAINTENANCE_WORK_ORDER_REPORTED',
        entityType: 'MAINTENANCE_WORK_ORDER',
        entityId: String(workOrder.id),
        summary: { reference, vehicleId: vehicle.id, status: 'Reported', safetyRelated: false, reason: data.reason },
      },
    });
    return workOrder;
  });
}

/** Advances only the approved work-order lifecycle, with a locked row, append-only history, and transactional audit. */
export async function transitionWorkOrder(input: unknown) {
  const data = transitionSchema.parse(input);
  const completionDate = data.completionDate ? new Date(data.completionDate) : undefined;
  if (completionDate && completionDate.getTime() > Date.now()) throw new WorkOrderPolicyError('Completion date cannot be in the future.');
  await requireMaintenanceManager(data.actorId, data.companyId);
  const prisma = getPrisma();
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const company = await tx.company.findUnique({ where: { id: data.companyId }, select: { status: true } });
    if (company?.status !== 'ACTIVE') throw new WorkOrderNotFoundError();
    const locked = await tx.$queryRaw<Array<{ id: string; status: string; createdById: string; reference: string }>>`
      SELECT "id", "status", "createdById", "reference" FROM "MaintenanceWorkOrder"
      WHERE "id" = ${data.workOrderId} AND "companyId" = ${data.companyId}
      FOR UPDATE
    `;
    const current = locked[0];
    if (!current) throw new WorkOrderNotFoundError();
    if (!workOrderTransitions[current.status]?.includes(data.toStatus)) {
      throw new WorkOrderPolicyError(`The work-order transition from ${current.status} to ${data.toStatus} is not allowed.`);
    }
    if (current.status === 'Awaiting Inspection' && data.toStatus === 'Approved' && data.actorId === current.createdById) {
      throw new WorkOrderPolicyError('A different authorized manager must approve a work order than the person who reported it.');
    }
    const store = tx as unknown as WorkOrderStore;
    const latest = await store.maintenanceWorkOrderStatusHistory.findFirst({
      where: { companyId: data.companyId, workOrderId: data.workOrderId },
      orderBy: { sequence: 'desc' }, select: { sequence: true },
    });
    const updateData: Record<string, unknown> = { status: data.toStatus };
    if (data.toStatus === 'Approved') {
      if (data.requiredWork !== undefined) updateData.requiredWork = data.requiredWork;
      if (data.parts !== undefined) updateData.parts = data.parts;
    }
    if (data.toStatus === 'Completed') {
      updateData.completionDate = completionDate;
      updateData.inspectionResults = data.inspectionResults;
      for (const field of ['labourCostPesewas', 'partsCostPesewas', 'otherCostPesewas'] as const) {
        if (data[field] !== undefined) updateData[field] = data[field] === null ? null : BigInt(data[field]!);
      }
    }
    const changed = await store.maintenanceWorkOrder.updateMany({
      where: { id: data.workOrderId, companyId: data.companyId, status: current.status }, data: updateData,
    });
    if (changed.count !== 1) throw new WorkOrderPolicyError('The work-order status changed concurrently; reload and retry.');
    await store.maintenanceWorkOrderStatusHistory.create({
      data: {
        companyId: data.companyId, workOrderId: data.workOrderId, sequence: (latest?.sequence ?? 0) + 1,
        actorId: data.actorId, fromStatus: current.status, toStatus: data.toStatus, reason: data.reason,
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId: data.actorId, companyId: data.companyId, action: 'MAINTENANCE_WORK_ORDER_STATUS_CHANGED',
        entityType: 'MAINTENANCE_WORK_ORDER', entityId: data.workOrderId,
        summary: {
          reference: current.reference, fromStatus: current.status, toStatus: data.toStatus, reason: data.reason,
          ...(data.toStatus === 'Completed' ? { costBreakdownRecorded: ['labourCostPesewas', 'partsCostPesewas', 'otherCostPesewas'].some((key) => data[key as keyof typeof data] !== undefined) } : {}),
        },
      },
    });
    return { id: data.workOrderId, reference: current.reference, fromStatus: current.status, status: data.toStatus };
  });
}
