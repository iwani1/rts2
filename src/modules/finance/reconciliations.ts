import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { PermissionDeniedError, resolvePermission } from '@/modules/auth/permissions';
import { getPrisma } from '@/server/prisma';
import { matchReconciliation, type ReconciliationSummary } from './reconciliation-matcher';
import { isAllowedReconciliationTransition } from './reconciliation-transitions';

export class ReconciliationCompanyNotFoundError extends Error {
  readonly code = 'COMPANY_NOT_FOUND';
  constructor() { super('Company not found.'); this.name = 'ReconciliationCompanyNotFoundError'; }
}
export class ReconciliationNotFoundError extends Error {
  readonly code = 'RECONCILIATION_NOT_FOUND';
  constructor() { super('Reconciliation run not found.'); this.name = 'ReconciliationNotFoundError'; }
}
export class ReconciliationPolicyError extends Error {
  readonly code = 'RECONCILIATION_POLICY';
  readonly statusCode = 422;
  constructor(message: string) { super(message); this.name = 'ReconciliationPolicyError'; }
}
export class ReconciliationTransitionNotAllowedError extends Error {
  readonly code = 'RECONCILIATION_TRANSITION_NOT_ALLOWED';
  readonly statusCode = 409;
  constructor(fromStatus: string, toStatus: string) {
    super(`A reconciliation run cannot move from ${fromStatus} to ${toStatus}.`);
    this.name = 'ReconciliationTransitionNotAllowedError';
  }
}

const READ_SCOPES = ['GLOBAL', 'COMPANY', 'READ_ONLY'] as const;
const WRITE_SCOPES = ['GLOBAL', 'COMPANY'] as const;
const PROVIDER_METHOD_LABEL = 'Paystack';

async function requireReconcileAccess(actorId: string, companyId: string, scopes: readonly string[]) {
  const access = await resolvePermission({ userId: actorId, companyId, permission: 'payment:reconcile' });
  if (!access.allowed || !access.scopes.some((scope) => scopes.includes(scope))) {
    throw new PermissionDeniedError();
  }
}

const periodSchema = z.object({
  periodStart: z.string().date(),
  periodEnd: z.string().date(),
}).refine((data) => data.periodStart <= data.periodEnd, {
  message: 'The period end must not precede its start.',
});

const createSchema = z.object({
  actorId: z.string().trim().min(1).max(128),
  companyId: z.string().trim().min(1).max(128),
  periodStart: z.string().date(),
  periodEnd: z.string().date(),
  reason: z.string().trim().min(8).max(500),
}).strict().refine((data) => data.periodStart <= data.periodEnd, {
  message: 'The period end must not precede its start.',
});

const closeSchema = z.object({
  actorId: z.string().trim().min(1).max(128),
  companyId: z.string().trim().min(1).max(128),
  reconciliationId: z.string().trim().min(1).max(128),
  toStatus: z.literal('CLOSED'),
  reason: z.string().trim().min(8).max(500),
}).strict();

async function computeSummary(companyId: string, periodStart: Date, periodEndInclusive: Date) {
  const prisma = getPrisma();
  const periodEndExclusive = new Date(periodEndInclusive.getTime() + 86_400_000);
  const [events, payments] = await Promise.all([
    prisma.paymentProviderEvent.findMany({
      where: {
        companyId,
        eventType: 'charge.success',
        OR: [
          { paidDate: { gte: periodStart, lt: periodEndExclusive } },
          { paidDate: null, createdAt: { gte: periodStart, lt: periodEndExclusive } },
        ],
      },
      select: {
        id: true, providerReference: true, amountPesewas: true, status: true, appliedPaymentId: true,
      },
    }),
    prisma.invoicePayment.findMany({
      where: { companyId, receivedAt: { gte: periodStart, lt: periodEndExclusive } },
      select: { id: true, method: true, reference: true, amountPesewas: true },
    }),
  ]);
  return matchReconciliation({
    providerEvents: events,
    payments,
    providerMethodLabel: PROVIDER_METHOD_LABEL,
  });
}

export type ReconciliationRecord = {
  id: string;
  reference: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  summary: ReconciliationSummary;
  createdById: string;
  createdAt: string;
  statusHistory: Array<{
    sequence: number; fromStatus: string | null; toStatus: string;
    reason: string; createdAt: string; actorName: string;
  }>;
};

function toRecord(row: {
  id: string; reference: string; periodStart: Date; periodEnd: Date; status: string;
  summary: unknown; createdById: string; createdAt: Date;
  statusHistory: Array<{
    sequence: number; fromStatus: string | null; toStatus: string; reason: string;
    createdAt: Date; actor: { name: string };
  }>;
}): ReconciliationRecord {
  return {
    id: row.id,
    reference: row.reference,
    periodStart: row.periodStart.toISOString().slice(0, 10),
    periodEnd: row.periodEnd.toISOString().slice(0, 10),
    status: row.status,
    summary: row.summary as ReconciliationSummary,
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
    statusHistory: row.statusHistory.map(({ actor, ...event }) => ({
      ...event, createdAt: event.createdAt.toISOString(), actorName: actor.name,
    })),
  };
}

const include = {
  statusHistory: {
    orderBy: { sequence: 'asc' as const }, take: 50,
    include: { actor: { select: { name: true } } },
  },
};

export async function createReconciliation(input: unknown): Promise<ReconciliationRecord> {
  const data = createSchema.parse(input);
  periodSchema.parse({ periodStart: data.periodStart, periodEnd: data.periodEnd });
  await requireReconcileAccess(data.actorId, data.companyId, WRITE_SCOPES);
  const prisma = getPrisma();
  const company = await prisma.company.findUnique({ where: { id: data.companyId }, select: { status: true } });
  if (company?.status !== 'ACTIVE') throw new ReconciliationCompanyNotFoundError();
  const summary = await computeSummary(
    data.companyId,
    new Date(`${data.periodStart}T00:00:00.000Z`),
    new Date(`${data.periodEnd}T00:00:00.000Z`),
  );
  return prisma.$transaction(async (tx) => {
    const reference = `REC-${randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`;
    const run = await tx.paymentReconciliation.create({
      data: {
        companyId: data.companyId,
        reference,
        periodStart: new Date(`${data.periodStart}T00:00:00.000Z`),
        periodEnd: new Date(`${data.periodEnd}T00:00:00.000Z`),
        status: 'OPEN',
        summary: summary as never,
        createdById: data.actorId,
      },
      include,
    });
    await tx.paymentReconciliationStatusHistory.create({
      data: {
        companyId: data.companyId, reconciliationId: run.id, sequence: 1,
        actorId: data.actorId, fromStatus: null, toStatus: 'OPEN', reason: data.reason,
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId: data.actorId, companyId: data.companyId,
        action: 'RECONCILIATION_OPENED', entityType: 'PAYMENT_RECONCILIATION', entityId: run.id,
        summary: {
          reference, periodStart: data.periodStart, periodEnd: data.periodEnd,
          reconciles: summary.reconciles, reason: data.reason,
        },
      },
    });
    return toRecord(run as never);
  });
}

/**
 * Closes a run with a freshly computed snapshot; the closer must differ from
 * the creator (independent sign-off, D-085). Discrepancies may remain —
 * closing records that they were seen and accepted, never that they vanished.
 */
export async function transitionReconciliation(input: unknown) {
  const data = closeSchema.parse(input);
  await requireReconcileAccess(data.actorId, data.companyId, WRITE_SCOPES);
  const prisma = getPrisma();
  return prisma.$transaction(async (tx) => {
    const company = await tx.company.findUnique({ where: { id: data.companyId }, select: { status: true } });
    if (company?.status !== 'ACTIVE') throw new ReconciliationCompanyNotFoundError();
    const locked = await tx.$queryRaw<Array<{
      id: string; status: string; createdById: string; reference: string; periodStart: Date; periodEnd: Date;
    }>>`
      SELECT "id", "status", "createdById", "reference", "periodStart", "periodEnd" FROM "PaymentReconciliation"
      WHERE "id" = ${data.reconciliationId} AND "companyId" = ${data.companyId}
      FOR UPDATE
    `;
    const current = locked[0];
    if (!current) throw new ReconciliationNotFoundError();
    if (!isAllowedReconciliationTransition(current.status, data.toStatus)) {
      throw new ReconciliationTransitionNotAllowedError(current.status, data.toStatus);
    }
    if (data.actorId === current.createdById) {
      throw new ReconciliationPolicyError('A different authorised user must close a reconciliation run than the person who opened it.');
    }
    const summary = await computeSummary(
      data.companyId,
      new Date(current.periodStart),
      new Date(current.periodEnd),
    );
    const latest = await tx.paymentReconciliationStatusHistory.findFirst({
      where: { companyId: data.companyId, reconciliationId: data.reconciliationId },
      orderBy: { sequence: 'desc' }, select: { sequence: true },
    });
    await tx.paymentReconciliation.update({
      where: { id: data.reconciliationId },
      data: { status: 'CLOSED', summary: summary as never },
    });
    await tx.paymentReconciliationStatusHistory.create({
      data: {
        companyId: data.companyId, reconciliationId: data.reconciliationId, sequence: (latest?.sequence ?? 0) + 1,
        actorId: data.actorId, fromStatus: current.status, toStatus: 'CLOSED', reason: data.reason,
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId: data.actorId, companyId: data.companyId,
        action: 'RECONCILIATION_CLOSED', entityType: 'PAYMENT_RECONCILIATION', entityId: data.reconciliationId,
        summary: {
          reference: current.reference, reconciles: summary.reconciles,
          unapplied: summary.discrepancies.unappliedProviderEvents.length,
          amountMismatches: summary.discrepancies.amountMismatches.length,
          unknownProviderPayments: summary.discrepancies.unknownProviderPayments.length,
          reason: data.reason,
        },
      },
    });
    return { id: data.reconciliationId, reference: current.reference, status: 'CLOSED', summary };
  });
}

export async function listReconciliations(input: { actorId: string; companyId: string }) {
  await requireReconcileAccess(input.actorId, input.companyId, READ_SCOPES);
  const prisma = getPrisma();
  const rows = await prisma.paymentReconciliation.findMany({
    where: { companyId: input.companyId },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include,
  });
  return { reconciliations: rows.map((row) => toRecord(row as never)) };
}
