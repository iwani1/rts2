import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PermissionDeniedError, resolvePermission } from '@/modules/auth/permissions';
import { getPrisma } from '@/server/prisma';
import { contractListQuerySchema, contractRequestSchema, contractTransitionSchema } from './contract-schema';
import { isAllowedContractTransition } from './contract-transitions';

const companyIdSchema = z.string().trim().min(1).max(128);
const contractIdSchema = z.string().trim().min(1).max(128);

export class ContractCompanyNotFoundError extends Error {
  readonly code = 'COMPANY_NOT_FOUND';
  constructor() { super('Company not found.'); this.name = 'ContractCompanyNotFoundError'; }
}
export class ContractNotFoundError extends Error {
  readonly code = 'CONTRACT_NOT_FOUND';
  constructor() { super('Contract not found.'); this.name = 'ContractNotFoundError'; }
}
export class ContractClientNotFoundError extends Error {
  readonly code = 'CONTRACT_CLIENT_NOT_FOUND';
  constructor() { super('Active client not found in this company.'); this.name = 'ContractClientNotFoundError'; }
}
export class InvalidContractCursorError extends Error {
  readonly code = 'INVALID_CONTRACT_CURSOR';
  constructor() { super('Invalid contract cursor.'); this.name = 'InvalidContractCursorError'; }
}
export class ContractNotDraftError extends Error {
  readonly code = 'CONTRACT_NOT_DRAFT';
  constructor() { super('Only a Draft contract may be changed. Return it to Draft before amending it.'); this.name = 'ContractNotDraftError'; }
}
export class ContractTransitionNotAllowedError extends Error {
  readonly code = 'CONTRACT_TRANSITION_NOT_ALLOWED';
  constructor(readonly fromStatus: string, readonly toStatus: string) {
    super(`The transition from ${fromStatus} to ${toStatus} is not allowed.`);
    this.name = 'ContractTransitionNotAllowedError';
  }
}
export class ContractPolicyError extends Error {
  readonly code = 'CONTRACT_POLICY';
  constructor(message: string) { super(message); this.name = 'ContractPolicyError'; }
}

export type ContractStatusHistoryRecord = {
  fromStatus: string | null;
  toStatus: string;
  reason: string;
  actorName: string;
  createdAt: Date;
};

export type ContractRecord = {
  id: string;
  reference: string;
  clientId: string;
  clientName: string;
  clientArchived: boolean;
  serviceType: string | null;
  startDate: string | null;
  endDate: string | null;
  renewalDate: string | null;
  routesAndStops: string | null;
  serviceDaysAndShifts: string | null;
  vehicleRequirements: string | null;
  pricingModel: string | null;
  billingFrequency: string | null;
  paymentTerms: string | null;
  serviceLevelTargets: string | null;
  notes: string | null;
  status: string;
  warnings: string[];
  createdAt: Date;
  updatedAt: Date;
};

type ContractDbShape = Omit<ContractRecord, 'startDate' | 'endDate' | 'renewalDate' | 'clientName' | 'clientArchived' | 'warnings'> & {
  startDate: Date | null;
  endDate: Date | null;
  renewalDate: Date | null;
  client: { name: string; archivedAt: Date | null };
};

const accraDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Accra', year: 'numeric', month: '2-digit', day: '2-digit',
});

export function contractWarningsFor(status: string, endDate: string | null, renewalDate: string | null, today: string): string[] {
  const warnings: string[] = [];
  if (status === 'Suspended') {
    warnings.push('This contract is suspended. Whether bookings are allowed under it depends on the configured booking policy for inactive contracts.');
  }
  if (status === 'Expired') {
    warnings.push('This contract is expired. Whether bookings are allowed under it depends on the configured booking policy for inactive contracts.');
  }
  if (status === 'Active' && endDate && endDate < today) {
    warnings.push('The end date has passed while this contract is still marked Active. Review it, move it to Expired, or renew it.');
  }
  if ((status === 'Active' || status === 'Suspended') && renewalDate && renewalDate <= today) {
    warnings.push('The recorded renewal review date has been reached.');
  }
  return warnings;
}

function presentContract(row: ContractDbShape): ContractRecord {
  const startDate = row.startDate?.toISOString().slice(0, 10) ?? null;
  const endDate = row.endDate?.toISOString().slice(0, 10) ?? null;
  const renewalDate = row.renewalDate?.toISOString().slice(0, 10) ?? null;
  return {
    id: row.id,
    reference: row.reference,
    clientId: row.clientId,
    clientName: row.client.name,
    clientArchived: row.client.archivedAt !== null,
    serviceType: row.serviceType,
    startDate,
    endDate,
    renewalDate,
    routesAndStops: row.routesAndStops,
    serviceDaysAndShifts: row.serviceDaysAndShifts,
    vehicleRequirements: row.vehicleRequirements,
    pricingModel: row.pricingModel,
    billingFrequency: row.billingFrequency,
    paymentTerms: row.paymentTerms,
    serviceLevelTargets: row.serviceLevelTargets,
    notes: row.notes,
    status: row.status,
    warnings: contractWarningsFor(row.status, endDate, renewalDate, accraDate.format(new Date())),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toContractData(input: z.infer<typeof contractRequestSchema>) {
  return {
    clientId: input.clientId,
    serviceType: input.serviceType || null,
    startDate: input.startDate ? new Date(`${input.startDate}T00:00:00.000Z`) : null,
    endDate: input.endDate ? new Date(`${input.endDate}T00:00:00.000Z`) : null,
    renewalDate: input.renewalDate ? new Date(`${input.renewalDate}T00:00:00.000Z`) : null,
    routesAndStops: input.routesAndStops || null,
    serviceDaysAndShifts: input.serviceDaysAndShifts || null,
    vehicleRequirements: input.vehicleRequirements || null,
    pricingModel: input.pricingModel || null,
    billingFrequency: input.billingFrequency || null,
    paymentTerms: input.paymentTerms || null,
    serviceLevelTargets: input.serviceLevelTargets || null,
    notes: input.notes || null,
  };
}

async function accessFor(actorId: string, companyId: string) {
  const permission = await resolvePermission({ userId: actorId, companyId, permission: 'client:manage' });
  if (!permission.allowed) throw new PermissionDeniedError();
  const company = await getPrisma().company.findUnique({ where: { id: companyId }, select: { status: true } });
  if (company?.status !== 'ACTIVE') throw new ContractCompanyNotFoundError();
  const canManage = permission.scopes.includes('GLOBAL') || permission.scopes.includes('COMPANY');
  if (!canManage) throw new PermissionDeniedError();
  return { canManage };
}

async function requireActiveClient(tx: Prisma.TransactionClient, companyId: string, clientId: string) {
  const client = await tx.client.findFirst({ where: { id: clientId, companyId, archivedAt: null }, select: { id: true } });
  if (!client) throw new ContractClientNotFoundError();
}

export async function listContracts(input: {
  actorId: string; companyId: string; search?: string; status?: string; clientId?: string; cursor?: string;
}): Promise<{ contracts: ContractRecord[]; nextCursor: string | null; canManage: boolean }> {
  const companyId = companyIdSchema.parse(input.companyId);
  const query = contractListQuerySchema.parse({
    search: input.search, status: input.status || undefined, clientId: input.clientId || undefined, cursor: input.cursor,
  });
  const access = await accessFor(input.actorId, companyId);
  const prisma = getPrisma();
  if (query.cursor) {
    const cursorContract = await prisma.contract.findFirst({ where: { id: query.cursor, companyId }, select: { id: true } });
    if (!cursorContract) throw new InvalidContractCursorError();
  }
  const where = {
    companyId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.clientId ? { clientId: query.clientId } : {}),
    ...(query.search ? { OR: [
      { reference: { contains: query.search, mode: 'insensitive' as const } },
      { serviceType: { contains: query.search, mode: 'insensitive' as const } },
      { client: { is: { name: { contains: query.search, mode: 'insensitive' as const } } } },
    ] } : {}),
  };
  const rows = await prisma.contract.findMany({
    where,
    include: { client: { select: { name: true, archivedAt: true } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 51,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });
  const contracts = rows.slice(0, 50).map((row: ContractDbShape) => presentContract(row));
  return { contracts, nextCursor: rows.length > 50 ? contracts.at(-1)?.id ?? null : null, canManage: access.canManage };
}

export async function getContract(input: { actorId: string; companyId: string; contractId: string }): Promise<{
  contract: ContractRecord; canManage: boolean; history: ContractStatusHistoryRecord[];
}> {
  const companyId = companyIdSchema.parse(input.companyId);
  const contractId = contractIdSchema.parse(input.contractId);
  const access = await accessFor(input.actorId, companyId);
  const prisma = getPrisma();
  const row = await prisma.contract.findFirst({
    where: { id: contractId, companyId },
    include: {
      client: { select: { name: true, archivedAt: true } },
      statusHistory: { orderBy: { sequence: 'desc' }, take: 50, include: { actor: { select: { name: true } } } },
    },
  });
  if (!row) throw new ContractNotFoundError();
  return {
    contract: presentContract(row),
    canManage: access.canManage,
    history: row.statusHistory.map((entry: {
      fromStatus: string | null; toStatus: string; reason: string; createdAt: Date; actor: { name: string };
    }) => ({
      fromStatus: entry.fromStatus,
      toStatus: entry.toStatus,
      reason: entry.reason,
      actorName: entry.actor.name,
      createdAt: entry.createdAt,
    })),
  };
}

export async function createContract(input: unknown, actorId: string, companyIdInput: string) {
  const data = contractRequestSchema.parse(input);
  const companyId = companyIdSchema.parse(companyIdInput);
  await accessFor(actorId, companyId);
  const prisma = getPrisma();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const reference = `CON-${randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`;
    try {
      return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await requireActiveClient(tx, companyId, data.clientId);
        const contract = await tx.contract.create({
          data: { ...toContractData(data), companyId, reference, status: 'Draft' },
          include: { client: { select: { name: true, archivedAt: true } } },
        });
        await tx.contractStatusHistory.create({
          data: { companyId, contractId: contract.id, sequence: 1, actorId, fromStatus: null, toStatus: 'Draft', reason: data.reason },
        });
        await tx.auditEvent.create({
          data: {
            actorId, companyId, action: 'CONTRACT_CREATED', entityType: 'CONTRACT', entityId: contract.id,
            summary: { reference, clientId: data.clientId, status: 'Draft', reason: data.reason },
          },
        });
        return presentContract(contract);
      });
    } catch (error) {
      const isReferenceCollision = error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === 'P2002'
        && JSON.stringify(error.meta?.target ?? '').includes('reference');
      if (!isReferenceCollision || attempt === 2) throw error;
    }
  }
  throw new ContractPolicyError('A unique contract reference could not be allocated; retry.');
}

export async function updateContractDraft(input: unknown, actorId: string, companyIdInput: string, contractIdInput: string) {
  const data = contractRequestSchema.parse(input);
  const companyId = companyIdSchema.parse(companyIdInput);
  const contractId = contractIdSchema.parse(contractIdInput);
  await accessFor(actorId, companyId);
  const prisma = getPrisma();
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const current = await tx.contract.findFirst({
      where: { id: contractId, companyId }, select: { status: true, clientId: true },
    });
    if (!current) throw new ContractNotFoundError();
    if (current.status !== 'Draft') throw new ContractNotDraftError();
    if (data.clientId !== current.clientId) await requireActiveClient(tx, companyId, data.clientId);
    const changed = await tx.contract.updateMany({
      where: { id: contractId, companyId, status: 'Draft' },
      data: toContractData(data),
    });
    if (changed.count !== 1) {
      const exists = await tx.contract.findFirst({ where: { id: contractId, companyId }, select: { status: true } });
      if (!exists) throw new ContractNotFoundError();
      throw new ContractNotDraftError();
    }
    const contract = await tx.contract.findUniqueOrThrow({
      where: { id: contractId }, include: { client: { select: { name: true, archivedAt: true } } },
    });
    await tx.auditEvent.create({
      data: {
        actorId, companyId, action: 'CONTRACT_DRAFT_UPDATED', entityType: 'CONTRACT', entityId: contract.id,
        summary: { reference: contract.reference, reason: data.reason },
      },
    });
    return presentContract(contract);
  });
}

/**
 * Applies one D-049 contract transition: row-locked, permission-checked,
 * precondition-checked, and recorded in status history plus the audit log in
 * the same transaction. Renewal (Expired → Active) requires a new end date
 * that has not passed; reactivation from Suspended is refused once the end
 * date has passed so an expired term is never silently extended.
 */
export async function transitionContract(input: unknown, actorId: string, companyIdInput: string, contractIdInput: string) {
  const data = contractTransitionSchema.parse(input);
  const companyId = companyIdSchema.parse(companyIdInput);
  const contractId = contractIdSchema.parse(contractIdInput);
  await accessFor(actorId, companyId);
  const prisma = getPrisma();
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const rows = await tx.$queryRaw<Array<{
      status: string; clientId: string; startDate: Date | null; endDate: Date | null;
    }>>`
      SELECT "status", "clientId", "startDate", "endDate" FROM "Contract"
      WHERE "id" = ${contractId} AND "companyId" = ${companyId}
      FOR UPDATE
    `;
    const current = rows[0];
    if (!current) throw new ContractNotFoundError();
    if (!isAllowedContractTransition(current.status, data.toStatus)) {
      throw new ContractTransitionNotAllowedError(current.status, data.toStatus);
    }
    const today = accraDate.format(new Date());
    const updateData: Prisma.ContractUpdateManyMutationInput = { status: data.toStatus };
    if (data.renewalStartDate || data.renewalEndDate) {
      if (current.status !== 'Expired' || data.toStatus !== 'Active') {
        throw new ContractPolicyError('Renewal dates may only be used when renewing an Expired contract to Active.');
      }
    }
    if (data.toStatus === 'Active') {
      await requireActiveClient(tx, companyId, current.clientId);
      if (current.status === 'Pending Approval') {
        const start = current.startDate?.toISOString().slice(0, 10) ?? null;
        const end = current.endDate?.toISOString().slice(0, 10) ?? null;
        if (!start || !end || end < start) {
          throw new ContractPolicyError('Add a start date and an end date on or after it before approving this contract.');
        }
      } else if (current.status === 'Suspended') {
        const end = current.endDate?.toISOString().slice(0, 10) ?? null;
        if (end && end < today) {
          throw new ContractPolicyError('This contract is past its end date. Move it to Expired and renew it with a new end date instead of reactivating it.');
        }
      } else if (current.status === 'Expired') {
        if (!data.renewalEndDate) {
          throw new ContractPolicyError('Renewal requires a new end date. An expired contract is never reactivated with its old dates.');
        }
        if (data.renewalEndDate < today) {
          throw new ContractPolicyError('The renewal end date must not be in the past.');
        }
        const effectiveStart = data.renewalStartDate ?? current.startDate?.toISOString().slice(0, 10) ?? null;
        if (effectiveStart && data.renewalEndDate < effectiveStart) {
          throw new ContractPolicyError('The renewal end date must be on or after the renewal start date.');
        }
        updateData.endDate = new Date(`${data.renewalEndDate}T00:00:00.000Z`);
        if (data.renewalStartDate) updateData.startDate = new Date(`${data.renewalStartDate}T00:00:00.000Z`);
      }
    }
    if (data.toStatus === 'Pending Approval') {
      await requireActiveClient(tx, companyId, current.clientId);
    }
    const changed = await tx.contract.updateMany({
      where: { id: contractId, companyId, status: current.status },
      data: updateData,
    });
    if (changed.count !== 1) throw new ContractTransitionNotAllowedError(current.status, data.toStatus);
    const latest = await tx.contractStatusHistory.findFirst({
      where: { companyId, contractId },
      orderBy: { sequence: 'desc' },
      select: { sequence: true },
    });
    await tx.contractStatusHistory.create({
      data: {
        companyId, contractId, sequence: (latest?.sequence ?? 0) + 1, actorId,
        fromStatus: current.status, toStatus: data.toStatus, reason: data.reason,
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId, companyId, action: 'CONTRACT_STATUS_CHANGED', entityType: 'CONTRACT', entityId: contractId,
        summary: {
          fromStatus: current.status, toStatus: data.toStatus, reason: data.reason,
          ...(data.renewalEndDate ? { renewalEndDate: data.renewalEndDate } : {}),
          ...(data.renewalStartDate ? { renewalStartDate: data.renewalStartDate } : {}),
        },
      },
    });
    const contract = await tx.contract.findUniqueOrThrow({
      where: { id: contractId }, include: { client: { select: { name: true, archivedAt: true } } },
    });
    return presentContract(contract);
  });
}
