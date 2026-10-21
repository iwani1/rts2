import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PermissionDeniedError, resolvePermission } from '@/modules/auth/permissions';
import { getPrisma } from '@/server/prisma';
import { getCorporateRate, taxLinesSchema, type TaxLine } from '@/modules/settings/registry';
import { calculateTaxLineAmount } from './tax';
import {
  corporateInvoiceListQuerySchema,
  corporateInvoiceRequestSchema,
  corporateInvoiceTransitionSchema,
  invoicePaymentRequestSchema,
} from './invoice-schema';
import { isAllowedCorporateInvoiceTransition } from './invoice-transitions';

const companyIdSchema = z.string().trim().min(1).max(128);
const invoiceIdSchema = z.string().trim().min(1).max(128);
const taxLinesKey = 'finance.tax_lines';

export class InvoiceCompanyNotFoundError extends Error {
  readonly code = 'COMPANY_NOT_FOUND';
  constructor() { super('Company not found.'); this.name = 'InvoiceCompanyNotFoundError'; }
}
export class InvoiceNotFoundError extends Error {
  readonly code = 'INVOICE_NOT_FOUND';
  constructor() { super('Invoice not found.'); this.name = 'InvoiceNotFoundError'; }
}
export class InvoiceValidationError extends Error {
  readonly code = 'INVOICE_VALIDATION';
  constructor(message: string) { super(message); this.name = 'InvoiceValidationError'; }
}
export class InvoicePolicyError extends Error {
  readonly code = 'INVOICE_POLICY';
  constructor(message: string) { super(message); this.name = 'InvoicePolicyError'; }
}
export class InvalidInvoiceCursorError extends Error {
  readonly code = 'INVALID_INVOICE_CURSOR';
  constructor() { super('Invalid invoice cursor.'); this.name = 'InvalidInvoiceCursorError'; }
}
export class InvoiceTransitionNotAllowedError extends Error {
  readonly code = 'INVOICE_TRANSITION_NOT_ALLOWED';
  readonly statusCode = 409;
  constructor(fromStatus: string, toStatus: string) {
    super(`An invoice cannot move from ${fromStatus} to ${toStatus}.`);
    this.name = 'InvoiceTransitionNotAllowedError';
  }
}
export class PaymentExceedsBalanceError extends Error {
  readonly code = 'PAYMENT_EXCEEDS_BALANCE';
  readonly statusCode = 422;
  constructor(outstandingPesewas: number) {
    super(`The payment exceeds the outstanding balance of GH₵ ${(outstandingPesewas / 100).toFixed(2)}.`);
    this.name = 'PaymentExceedsBalanceError';
  }
}

export type CorporateInvoiceLineRecord = {
  id: string;
  tripId: string | null;
  description: string;
  unit: string;
  quantity: number;
  ratePesewas: number;
  amountPesewas: number;
};

export type CorporateInvoiceRecord = {
  id: string;
  reference: string;
  clientId: string;
  clientName: string;
  contractId: string;
  contractReference: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string | null;
  status: string;
  subtotalPesewas: number;
  taxPesewas: number;
  totalPesewas: number;
  paidPesewas: number;
  outstandingPesewas: number;
  createdAt: Date;
  lines: CorporateInvoiceLineRecord[];
};

export type CorporateInvoiceStatusHistoryRecord = {
  sequence: number;
  fromStatus: string | null;
  toStatus: string;
  reason: string;
  actorName: string;
  createdAt: Date;
};

export type CorporateInvoicePaymentRecord = {
  id: string;
  amountPesewas: number;
  method: string | null;
  reference: string | null;
  receivedAt: string;
  reason: string;
  recordedByName: string;
  createdAt: Date;
};

type InvoiceDbShape = {
  id: string; reference: string; clientId: string; contractId: string;
  periodStart: Date; periodEnd: Date; dueDate: Date | null; status: string;
  subtotalPesewas: number; taxPesewas: number; totalPesewas: number; createdAt: Date;
  client: { name: string };
  contract: { reference: string };
  lines: Array<{
    id: string; tripId: string | null; description: string; unit: string;
    quantity: number; ratePesewas: number; amountPesewas: number;
  }>;
  payments: Array<{ amountPesewas: number }>;
};

const invoiceInclude = {
  client: { select: { name: true } },
  contract: { select: { reference: true } },
  lines: { orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }] },
  payments: { select: { amountPesewas: true } },
};

function presentInvoice(row: InvoiceDbShape): CorporateInvoiceRecord {
  // Outstanding is always derived from the append-only payments, never stored.
  const paidPesewas = row.payments.reduce((sum, payment) => sum + payment.amountPesewas, 0);
  return {
    id: row.id,
    reference: row.reference,
    clientId: row.clientId,
    clientName: row.client.name,
    contractId: row.contractId,
    contractReference: row.contract.reference,
    periodStart: row.periodStart.toISOString().slice(0, 10),
    periodEnd: row.periodEnd.toISOString().slice(0, 10),
    dueDate: row.dueDate ? row.dueDate.toISOString().slice(0, 10) : null,
    status: row.status,
    subtotalPesewas: row.subtotalPesewas,
    taxPesewas: row.taxPesewas,
    totalPesewas: row.totalPesewas,
    paidPesewas,
    outstandingPesewas: row.status === 'PAID' || row.status === 'VOID'
      ? 0
      : row.totalPesewas - paidPesewas,
    createdAt: row.createdAt,
    lines: row.lines.map((line) => ({
      id: line.id,
      tripId: line.tripId,
      description: line.description,
      unit: line.unit,
      quantity: line.quantity,
      ratePesewas: line.ratePesewas,
      amountPesewas: line.amountPesewas,
    })),
  };
}

async function accessFor(actorId: string, companyId: string) {
  const permission = await resolvePermission({ userId: actorId, companyId, permission: 'invoice:manage' });
  if (!permission.allowed) throw new PermissionDeniedError();
  const company = await getPrisma().company.findUnique({ where: { id: companyId }, select: { status: true } });
  if (company?.status !== 'ACTIVE') throw new InvoiceCompanyNotFoundError();
  const canManage = permission.scopes.includes('GLOBAL') || permission.scopes.includes('COMPANY');
  if (!canManage) throw new PermissionDeniedError();
  return { canManage };
}

export async function listCorporateInvoices(input: {
  actorId: string; companyId: string; clientId?: string; cursor?: string; status?: string;
}): Promise<{ invoices: CorporateInvoiceRecord[]; nextCursor: string | null; canManage: boolean }> {
  const companyId = companyIdSchema.parse(input.companyId);
  const query = corporateInvoiceListQuerySchema.parse({
    clientId: input.clientId || undefined, cursor: input.cursor, status: input.status || undefined,
  });
  const access = await accessFor(input.actorId, companyId);
  const prisma = getPrisma();
  if (query.cursor) {
    const cursorInvoice = await prisma.corporateInvoice.findFirst({
      where: { id: query.cursor, companyId }, select: { id: true },
    });
    if (!cursorInvoice) throw new InvalidInvoiceCursorError();
  }
  const rows = await prisma.corporateInvoice.findMany({
    where: {
      companyId,
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(query.status ? { status: query.status } : {}),
    },
    include: invoiceInclude,
    orderBy: [{ periodStart: 'desc' }, { id: 'desc' }],
    take: 51,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });
  const invoices = rows.slice(0, 50).map((row: InvoiceDbShape) => presentInvoice(row));
  return { invoices, nextCursor: rows.length > 50 ? invoices.at(-1)?.id ?? null : null, canManage: access.canManage };
}

export type CorporateInvoiceDetail = {
  invoice: CorporateInvoiceRecord;
  history: CorporateInvoiceStatusHistoryRecord[];
  payments: CorporateInvoicePaymentRecord[];
};

export async function getCorporateInvoice(input: {
  actorId: string; companyId: string; invoiceId: string;
}): Promise<CorporateInvoiceDetail> {
  const companyId = companyIdSchema.parse(input.companyId);
  const invoiceId = invoiceIdSchema.parse(input.invoiceId);
  await accessFor(input.actorId, companyId);
  const row = await getPrisma().corporateInvoice.findFirst({
    where: { id: invoiceId, companyId },
    include: {
      ...invoiceInclude,
      payments: {
        orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
        include: { recordedBy: { select: { name: true } } },
      },
      statusHistory: {
        orderBy: { sequence: 'asc' as const },
        include: { actor: { select: { name: true } } },
      },
    },
  });
  if (!row) throw new InvoiceNotFoundError();
  return {
    invoice: presentInvoice(row),
    history: row.statusHistory.map((entry) => ({
      sequence: entry.sequence,
      fromStatus: entry.fromStatus,
      toStatus: entry.toStatus,
      reason: entry.reason,
      actorName: entry.actor.name,
      createdAt: entry.createdAt,
    })),
    payments: row.payments.map((payment) => ({
      id: payment.id,
      amountPesewas: payment.amountPesewas,
      method: payment.method,
      reference: payment.reference,
      receivedAt: payment.receivedAt.toISOString().slice(0, 10),
      reason: payment.reason,
      recordedByName: payment.recordedBy.name,
      createdAt: payment.createdAt,
    })),
  };
}

async function configuredTaxLines(companyId: string): Promise<TaxLine[]> {
  const row = await getPrisma().setting.findUnique({
    where: { companyId_key: { companyId, key: taxLinesKey } },
    select: { value: true, configured: true },
  });
  if (!row?.configured || row.value === null) return [];
  const parsed = taxLinesSchema.safeParse(row.value);
  return parsed.success ? parsed.data : [];
}

export type GenerateInvoiceResult = {
  invoice: CorporateInvoiceRecord;
  duplicate: boolean;
};

/**
 * FIN-02 (D-057/D-058): builds a DRAFT corporate invoice for one contract and
 * period from Completed trips carrying that contract's Completed bookings.
 * Rates come only from the typed `finance.corporate_rates` setting. The
 * status-aware contract+period unique index (non-VOID invoices, plus the
 * contract row lock) makes generation idempotent, and the partial unique
 * index on billing-active invoice lines guarantees a trip is never billed
 * twice while its invoice stands. Note: regenerating an existing period
 * returns the stored invoice, so trips completed later for that period need
 * a fresh period (recorded in docs/PROGRESS.md); voiding the invoice first
 * releases both the period and its trips.
 */
export async function generateCorporateInvoice(
  input: unknown, actorId: string, companyIdInput: string,
): Promise<GenerateInvoiceResult> {
  const data = corporateInvoiceRequestSchema.parse(input);
  const companyId = companyIdSchema.parse(companyIdInput);
  await accessFor(actorId, companyId);
  const rate = await getCorporateRate(companyId, data.contractId);
  if (!rate) {
    throw new InvoicePolicyError(
      'No corporate rate is configured for this contract. Set finance.corporate_rates first; invoices are never priced from free text.',
    );
  }
  const taxLines = await configuredTaxLines(companyId);
  const prisma = getPrisma();
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const contractRows = await tx.$queryRaw<Array<{ id: string; clientId: string; reference: string; status: string }>>`
      SELECT "id", "clientId", "reference", "status" FROM "Contract"
      WHERE "id" = ${data.contractId} AND "companyId" = ${companyId}
      FOR UPDATE
    `;
    const contract = contractRows[0];
    if (!contract) throw new InvoiceValidationError('Contract not found in this company.');
    const client = await tx.client.findFirst({
      where: { id: contract.clientId, companyId, archivedAt: null },
      select: { id: true },
    });
    if (!client) throw new InvoiceValidationError('The contract\u2019s client is archived or missing.');

    const periodStart = new Date(`${data.periodStart}T00:00:00.000Z`);
    const periodEnd = new Date(`${data.periodEnd}T00:00:00.000Z`);
    const existing = await tx.corporateInvoice.findFirst({
      where: { companyId, contractId: data.contractId, periodStart, periodEnd, status: { not: 'VOID' } },
      include: invoiceInclude,
    });
    if (existing) return { invoice: presentInvoice(existing), duplicate: true };

    const billableTrips = await tx.trip.findMany({
      where: {
        companyId,
        status: 'Completed',
        tripDate: { gte: periodStart, lte: periodEnd },
        bookings: { some: { companyId, contractId: data.contractId, status: 'Completed' } },
      },
      orderBy: [{ tripDate: 'asc' }, { id: 'asc' }],
      select: {
        id: true, reference: true, tripDate: true,
        _count: { select: { bookings: { where: { companyId, contractId: data.contractId, status: 'Completed' } } } },
      },
      take: 500,
    });
    if (billableTrips.length === 0) {
      throw new InvoiceValidationError('No Completed trips with Completed bookings for this contract exist in the period.');
    }
    // A trip counts as billed while its line is billing-active, i.e. while
    // the invoice carrying it is not VOID (D-061). Voiding an invoice
    // releases its trips back into the billable pool.
    const alreadyBilled = await tx.corporateInvoiceLine.findMany({
      where: {
        companyId, billingActive: true,
        tripId: { in: billableTrips.map((trip: { id: string }) => trip.id) },
      },
      select: { tripId: true },
    });
    const billedIds = new Set(alreadyBilled.map((line: { tripId: string | null }) => line.tripId));
    const freshTrips = billableTrips.filter((trip: { id: string }) => !billedIds.has(trip.id));
    if (freshTrips.length === 0) {
      throw new InvoiceValidationError('Every Completed trip in this period has already been billed on another invoice.');
    }

    let subtotal = 0;
    for (const trip of freshTrips) {
      subtotal += (rate.unit === 'PER_TRIP' ? 1 : trip._count.bookings) * rate.ratePesewas;
    }
    if (!Number.isSafeInteger(subtotal)) throw new InvoiceValidationError('The invoice subtotal exceeds the supported pesewa range.');
    let tax = 0;
    for (const line of taxLines) {
      tax += calculateTaxLineAmount(line, subtotal);
    }
    const total = subtotal + tax;
    if (!Number.isSafeInteger(total)) throw new InvoiceValidationError('The invoice total exceeds the supported pesewa range.');

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const reference = `INV-${randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`;
      try {
        const invoice = await tx.corporateInvoice.create({
          data: {
            companyId, clientId: contract.clientId, contractId: data.contractId,
            reference, periodStart, periodEnd, status: 'DRAFT',
            subtotalPesewas: subtotal, taxPesewas: tax, totalPesewas: total,
            lines: {
              create: freshTrips.map((trip: { id: string; reference: string; tripDate: Date; _count: { bookings: number } }) => {
                const quantity = rate.unit === 'PER_TRIP' ? 1 : trip._count.bookings;
                return {
                  tripId: trip.id,
                  description: `${trip.reference} on ${trip.tripDate.toISOString().slice(0, 10)} (${rate.unit === 'PER_TRIP' ? rate.unit : `${quantity} passenger(s)`})`,
                  unit: rate.unit,
                  quantity,
                  ratePesewas: rate.ratePesewas,
                  amountPesewas: quantity * rate.ratePesewas,
                };
              }),
            },
          },
          include: invoiceInclude,
        });
        await tx.corporateInvoiceStatusHistory.create({
          data: {
            companyId, invoiceId: invoice.id, sequence: 1, actorId,
            fromStatus: null, toStatus: 'DRAFT', reason: data.reason,
          },
        });
        await tx.auditEvent.create({
          data: {
            actorId, companyId, action: 'CORPORATE_INVOICE_GENERATED', entityType: 'CORPORATE_INVOICE', entityId: invoice.id,
            summary: {
              reference, contractReference: contract.reference,
              periodStart: data.periodStart, periodEnd: data.periodEnd,
              trips: freshTrips.length, subtotalPesewas: subtotal, taxPesewas: tax, totalPesewas: total,
              reason: data.reason,
            },
          },
        });
        return { invoice: presentInvoice(invoice), duplicate: false };
      } catch (error) {
        const code = typeof error === 'object' && error !== null && 'code' in error
          ? (error as { code?: unknown }).code
          : undefined;
        if (code !== 'P2002' || attempt === 2) throw error;
        const raced = await tx.corporateInvoice.findFirst({
          where: { companyId, contractId: data.contractId, periodStart, periodEnd, status: { not: 'VOID' } },
          include: invoiceInclude,
        });
        if (raced) return { invoice: presentInvoice(raced), duplicate: true };
      }
    }
    throw new InvoiceValidationError('A unique invoice reference could not be allocated; retry.');
  });
}

async function paymentAccessFor(actorId: string, companyId: string) {
  const company = await getPrisma().company.findUnique({ where: { id: companyId }, select: { status: true } });
  if (company?.status !== 'ACTIVE') throw new InvoiceCompanyNotFoundError();
  // Recording a payment is authorised by the dedicated payment:record grant
  // or by full invoice management; read-only invoice scopes never qualify.
  for (const permission of ['payment:record', 'invoice:manage'] as const) {
    const decision = await resolvePermission({ userId: actorId, companyId, permission });
    if (decision.allowed && (decision.scopes.includes('GLOBAL') || decision.scopes.includes('COMPANY'))) {
      return;
    }
  }
  throw new PermissionDeniedError();
}

async function lockInvoice(
  tx: Prisma.TransactionClient, companyId: string, invoiceId: string,
): Promise<{ status: string; reference: string; totalPesewas: number }> {
  const rows = await tx.$queryRaw<Array<{ status: string; reference: string; totalPesewas: number }>>`
    SELECT "status", "reference", "totalPesewas" FROM "CorporateInvoice"
    WHERE "id" = ${invoiceId} AND "companyId" = ${companyId}
    FOR UPDATE
  `;
  const current = rows[0];
  if (!current) throw new InvoiceNotFoundError();
  return current;
}

async function appendStatusHistory(
  tx: Prisma.TransactionClient,
  input: { companyId: string; invoiceId: string; actorId: string; fromStatus: string; toStatus: string; reason: string },
) {
  const latest = await tx.corporateInvoiceStatusHistory.findFirst({
    where: { companyId: input.companyId, invoiceId: input.invoiceId },
    orderBy: { sequence: 'desc' },
    select: { sequence: true },
  });
  await tx.corporateInvoiceStatusHistory.create({
    data: {
      companyId: input.companyId, invoiceId: input.invoiceId,
      sequence: (latest?.sequence ?? 0) + 1, actorId: input.actorId,
      fromStatus: input.fromStatus, toStatus: input.toStatus, reason: input.reason,
    },
  });
}

/**
 * D-061 lifecycle transition (issue / mark paid / void). Row-locked and
 * history-backed like contract transitions; the database re-checks the
 * transition table, the history pairing, and the rule that an invoice with
 * payments can never be voided.
 */
export async function transitionCorporateInvoice(
  input: unknown, actorId: string, companyIdInput: string, invoiceIdInput: string,
): Promise<CorporateInvoiceRecord> {
  const data = corporateInvoiceTransitionSchema.parse(input);
  const companyId = companyIdSchema.parse(companyIdInput);
  const invoiceId = invoiceIdSchema.parse(invoiceIdInput);
  await accessFor(actorId, companyId);
  const prisma = getPrisma();
  if (data.toStatus === 'ISSUED' && !data.dueDate) {
    throw new InvoicePolicyError('Record the payment due date when issuing the invoice; there is no default due date.');
  }
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const current = await lockInvoice(tx, companyId, invoiceId);
    if (!isAllowedCorporateInvoiceTransition(current.status, data.toStatus)) {
      throw new InvoiceTransitionNotAllowedError(current.status, data.toStatus);
    }
    if (data.toStatus === 'VOID' && current.status === 'ISSUED') {
      const paymentCount = await tx.invoicePayment.count({ where: { companyId, invoiceId } });
      if (paymentCount > 0) {
        throw new InvoicePolicyError(
          'This invoice has recorded payments and cannot be voided. Payments are append-only; '
          + 'collect the outstanding balance or raise a correction through a future process.',
        );
      }
    }
    const changed = await tx.corporateInvoice.updateMany({
      where: { id: invoiceId, companyId, status: current.status },
      data: {
        status: data.toStatus,
        ...(data.toStatus === 'ISSUED' ? { dueDate: new Date(`${data.dueDate}T00:00:00.000Z`) } : {}),
      },
    });
    if (changed.count !== 1) throw new InvoiceTransitionNotAllowedError(current.status, data.toStatus);
    await appendStatusHistory(tx, {
      companyId, invoiceId, actorId,
      fromStatus: current.status, toStatus: data.toStatus, reason: data.reason,
    });
    await tx.auditEvent.create({
      data: {
        actorId, companyId, action: 'CORPORATE_INVOICE_STATUS_CHANGED', entityType: 'CORPORATE_INVOICE', entityId: invoiceId,
        summary: {
          reference: current.reference, fromStatus: current.status, toStatus: data.toStatus, reason: data.reason,
        },
      },
    });
    const invoice = await tx.corporateInvoice.findUniqueOrThrow({ where: { id: invoiceId }, include: invoiceInclude });
    return presentInvoice(invoice);
  });
}

export type RecordInvoicePaymentResult = {
  invoice: CorporateInvoiceRecord;
  payment: { id: string; amountPesewas: number; receivedAt: string };
  outstandingPesewas: number;
};

/**
 * D-062 / FIN-03: records an append-only manual payment against an ISSUED
 * invoice. The invoice row lock serialises concurrent payments, the balance
 * is recomputed inside the transaction so overpayment is impossible, and
 * reaching the full total flips the invoice to PAID atomically with its
 * history row.
 */
export async function recordInvoicePayment(
  input: unknown, actorId: string, companyIdInput: string, invoiceIdInput: string,
): Promise<RecordInvoicePaymentResult> {
  const data = invoicePaymentRequestSchema.parse(input);
  const companyId = companyIdSchema.parse(companyIdInput);
  const invoiceId = invoiceIdSchema.parse(invoiceIdInput);
  await paymentAccessFor(actorId, companyId);
  const prisma = getPrisma();
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const current = await lockInvoice(tx, companyId, invoiceId);
    if (current.status !== 'ISSUED') {
      throw new InvoicePolicyError('Payments may only be recorded against ISSUED invoices.');
    }
    const prior = await tx.invoicePayment.findMany({
      where: { companyId, invoiceId }, select: { amountPesewas: true },
    });
    const paidBefore = prior.reduce((sum: number, payment: { amountPesewas: number }) => sum + payment.amountPesewas, 0);
    const outstandingBefore = current.totalPesewas - paidBefore;
    if (data.amountPesewas > outstandingBefore) throw new PaymentExceedsBalanceError(outstandingBefore);
    const payment = await tx.invoicePayment.create({
      data: {
        companyId, invoiceId, amountPesewas: data.amountPesewas,
        method: data.method, reference: data.reference,
        receivedAt: new Date(`${data.receivedAt}T00:00:00.000Z`),
        reason: data.reason, recordedById: actorId,
      },
    });
    const outstandingAfter = outstandingBefore - data.amountPesewas;
    await tx.auditEvent.create({
      data: {
        actorId, companyId, action: 'INVOICE_PAYMENT_RECORDED', entityType: 'CORPORATE_INVOICE', entityId: invoiceId,
        summary: {
          reference: current.reference, paymentId: payment.id, amountPesewas: data.amountPesewas,
          method: data.method, paymentReference: data.reference, receivedAt: data.receivedAt,
          outstandingPesewas: outstandingAfter, reason: data.reason,
        },
      },
    });
    if (outstandingAfter === 0) {
      const changed = await tx.corporateInvoice.updateMany({
        where: { id: invoiceId, companyId, status: 'ISSUED' },
        data: { status: 'PAID' },
      });
      if (changed.count !== 1) {
        throw new InvoicePolicyError('The invoice changed while the payment was being recorded; retry.');
      }
      await appendStatusHistory(tx, {
        companyId, invoiceId, actorId,
        fromStatus: 'ISSUED', toStatus: 'PAID', reason: 'Paid in full by recorded payments',
      });
      await tx.auditEvent.create({
        data: {
          actorId, companyId, action: 'INVOICE_MARKED_PAID', entityType: 'CORPORATE_INVOICE', entityId: invoiceId,
          summary: { reference: current.reference, paymentId: payment.id, totalPesewas: current.totalPesewas },
        },
      });
    }
    const invoice = await tx.corporateInvoice.findUniqueOrThrow({ where: { id: invoiceId }, include: invoiceInclude });
    return {
      invoice: presentInvoice(invoice),
      payment: { id: payment.id, amountPesewas: payment.amountPesewas, receivedAt: data.receivedAt },
      outstandingPesewas: outstandingAfter,
    };
  });
}
