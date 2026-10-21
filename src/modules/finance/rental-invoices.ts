import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PermissionDeniedError, resolvePermission } from '@/modules/auth/permissions';
import { getPrisma } from '@/server/prisma';
import { taxLinesSchema, type TaxLine } from '@/modules/settings/registry';
import { calculateTaxLineAmount } from './tax';
import { isAllowedRentalInvoiceTransition } from './rental-invoice-transitions';
import {
  rentalInvoiceListQuerySchema,
  rentalInvoicePaymentSchema,
  rentalInvoiceTransitionSchema,
} from './rental-invoice-schema';

/**
 * FIN rental invoicing (D-090/5A). A RentalInvoice is created from the
 * APPROVED rental completion only; amounts come from the completion
 * snapshot (quoted subtotal + approved charges), configured tax lines
 * apply to that gross, and the recorded deposit is a post-tax deduction.
 * The lifecycle mirrors the corporate invoice discipline: guarded
 * transitions with history + audit, append-only payments, PAID reached
 * automatically when payments cover the total.
 */

export class RentalInvoiceNotFoundError extends Error {
  readonly code = 'RENTAL_INVOICE_NOT_FOUND';
  readonly statusCode = 404;
  constructor(message = 'The rental invoice was not found in this workspace.') {
    super(message);
    this.name = 'RentalInvoiceNotFoundError';
  }
}

export class RentalInvoiceTransitionError extends Error {
  readonly code = 'RENTAL_INVOICE_TRANSITION_NOT_ALLOWED';
  readonly statusCode = 409;
  constructor(fromStatus: string, toStatus: string) {
    super(`A rental invoice cannot move from ${fromStatus} to ${toStatus}.`);
    this.name = 'RentalInvoiceTransitionError';
  }
}

export class RentalInvoicePolicyError extends Error {
  readonly code: string;
  readonly statusCode = 422;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'RentalInvoicePolicyError';
    this.code = code;
  }
}

export class RentalInvoicePaymentExceedsError extends Error {
  readonly code = 'RENTAL_INVOICE_PAYMENT_EXCEEDS_BALANCE';
  readonly statusCode = 422;
  constructor(outstandingPesewas: number) {
    super(`The payment exceeds the outstanding balance of GH₵ ${(outstandingPesewas / 100).toFixed(2)}.`);
    this.name = 'RentalInvoicePaymentExceedsError';
  }
}

export function rentalInvoiceErrorStatus(error: unknown): number {
  if (error instanceof z.ZodError) return 400;
  if (error instanceof Error && error.name === 'PermissionDeniedError') return 403;
  if (error instanceof RentalInvoiceNotFoundError) return 404;
  if (error instanceof RentalInvoiceTransitionError) return 409;
  if (error instanceof RentalInvoicePolicyError || error instanceof RentalInvoicePaymentExceedsError) return 422;
  return 500;
}

const companyIdSchema = z.string().trim().min(1).max(128);
const idSchema = z.string().trim().min(1).max(128);

async function requireManage(actorId: string, companyId: string) {
  const permission = await resolvePermission({ userId: actorId, companyId, permission: 'invoice:manage' });
  if (!permission.allowed) throw new PermissionDeniedError();
  const canManage = permission.scopes.includes('GLOBAL') || permission.scopes.includes('COMPANY');
  if (!canManage) throw new PermissionDeniedError();
  const company = await getPrisma().company.findUnique({ where: { id: companyId }, select: { status: true } });
  if (company?.status !== 'ACTIVE') throw new RentalInvoiceNotFoundError('Company not found or not active.');
}

async function requireRead(actorId: string, companyId: string) {
  for (const permission of ['invoice:read', 'invoice:manage'] as const) {
    const access = await resolvePermission({ userId: actorId, companyId, permission });
    if (access.allowed) return;
  }
  throw new PermissionDeniedError();
}

type InvoiceRow = {
  id: string; reference: string; requestId: string; completionId: string; status: string;
  subtotalPesewas: number; taxPesewas: number; depositDeductionPesewas: number; totalPesewas: number;
  dueDate: Date | null; createdAt: Date;
  lines: Array<{ id: string; description: string; quantity: number; ratePesewas: number; amountPesewas: number }>;
  payments: Array<{ amountPesewas: number }>;
};

function presentInvoice(row: InvoiceRow) {
  const paidPesewas = row.payments.reduce((sum: number, payment: { amountPesewas: number }) => sum + payment.amountPesewas, 0);
  return {
    id: row.id,
    reference: row.reference,
    requestId: row.requestId,
    completionId: row.completionId,
    status: row.status,
    subtotalPesewas: row.subtotalPesewas,
    taxPesewas: row.taxPesewas,
    depositDeductionPesewas: row.depositDeductionPesewas,
    totalPesewas: row.totalPesewas,
    paidPesewas,
    outstandingPesewas: row.status === 'PAID' || row.status === 'VOID' ? 0 : row.totalPesewas - paidPesewas,
    dueDate: row.dueDate ? row.dueDate.toISOString().slice(0, 10) : null,
    createdAt: row.createdAt.toISOString(),
    lines: row.lines.map((line) => ({
      id: line.id,
      description: line.description,
      quantity: line.quantity,
      ratePesewas: line.ratePesewas,
      amountPesewas: line.amountPesewas,
    })),
  };
}

const invoiceInclude = {
  lines: { orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }] },
  payments: { select: { amountPesewas: true } },
} satisfies Prisma.RentalInvoiceInclude;

async function configuredTaxLines(companyId: string): Promise<TaxLine[]> {
  const row = await getPrisma().setting.findUnique({
    where: { companyId_key: { companyId, key: 'finance.tax_lines' } },
    select: { value: true, configured: true },
  });
  if (!row?.configured || row.value === null) return [];
  const parsed = taxLinesSchema.safeParse(row.value);
  return parsed.success ? parsed.data : [];
}

async function appendHistory(
  tx: Prisma.TransactionClient,
  input: { companyId: string; invoiceId: string; actorId: string; fromStatus: string | null; toStatus: string; reason: string },
) {
  const latest = await tx.rentalInvoiceStatusHistory.findFirst({
    where: { companyId: input.companyId, invoiceId: input.invoiceId },
    orderBy: { sequence: 'desc' },
    select: { sequence: true },
  });
  await tx.rentalInvoiceStatusHistory.create({
    data: {
      companyId: input.companyId, invoiceId: input.invoiceId,
      sequence: (latest?.sequence ?? 0) + 1, actorId: input.actorId,
      fromStatus: input.fromStatus, toStatus: input.toStatus, reason: input.reason,
    },
  });
}

async function lockInvoice(tx: Prisma.TransactionClient, companyId: string, invoiceId: string) {
  const rows = await tx.$queryRaw<Array<{
    id: string; reference: string; status: string; totalPesewas: number;
  }>>`
    SELECT "id", "reference", "status", "totalPesewas" FROM "RentalInvoice"
    WHERE "id" = ${invoiceId} AND "companyId" = ${companyId}
    FOR UPDATE
  `;
  const current = rows[0];
  if (!current) throw new RentalInvoiceNotFoundError();
  return current;
}

export type CreateRentalInvoiceResult = {
  invoice: ReturnType<typeof presentInvoice>;
  duplicate: boolean;
};

export async function createRentalInvoice(actorId: string, companyIdInput: string, requestIdInput: string): Promise<CreateRentalInvoiceResult> {
  const companyId = companyIdSchema.parse(companyIdInput);
  const requestId = idSchema.parse(requestIdInput);
  await requireManage(actorId, companyId);
  const taxLines = await configuredTaxLines(companyId);
  return getPrisma().$transaction(async (tx) => {
    const requestRows = await tx.$queryRaw<Array<{ id: string; status: string }>>`
      SELECT "id", "status" FROM "RentalRequest"
      WHERE "id" = ${requestId} AND "companyId" = ${companyId}
      FOR UPDATE
    `;
    const request = requestRows[0];
    if (!request) throw new RentalInvoiceNotFoundError('The rental request was not found in this workspace.');
    if (request.status !== 'Completed') {
      throw new RentalInvoicePolicyError(
        'RENTAL_INVOICE_REQUEST_NOT_COMPLETED',
        `Only a Completed rental can be invoiced (current: "${request.status}"). Approve the rental completion first.`,
      );
    }
    const existing = await tx.rentalInvoice.findFirst({
      where: { companyId, requestId, status: { not: 'VOID' } },
      include: invoiceInclude,
    });
    if (existing) return { invoice: presentInvoice(existing), duplicate: true };
    const completion = await tx.rentalCompletion.findFirst({
      where: { companyId, requestId, status: 'APPROVED' },
      orderBy: { decidedAt: 'desc' },
    });
    if (!completion) {
      throw new RentalInvoicePolicyError('RENTAL_INVOICE_NO_APPROVED_COMPLETION', 'No approved completion exists for this rental.');
    }
    const approvedCharges = completion.decisionChargesPesewas ?? completion.additionalChargesPesewas;
    const subtotal = Number(completion.quotedSubtotalPesewas) + approvedCharges;
    const taxPesewas = taxLines.reduce((sum, line) => sum + calculateTaxLineAmount(line, subtotal), 0);
    const depositDeduction = completion.depositReceivedPesewas;
    const total = subtotal + taxPesewas - depositDeduction;
    if (total < 0) {
      throw new RentalInvoicePolicyError(
        'RENTAL_INVOICE_DEPOSIT_EXCEEDS_TOTAL',
        `The recorded deposit (GH₵ ${(depositDeduction / 100).toFixed(2)}) exceeds the billable amount of GH₵ ${((subtotal + taxPesewas) / 100).toFixed(2)}. `
        + 'The system does not model refunds; settle the excess with the customer outside invoicing before invoicing this rental.',
      );
    }
    const reference = `RINV-${randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`;
    const invoice = await tx.rentalInvoice.create({
      data: {
        companyId, requestId, completionId: completion.id, reference,
        subtotalPesewas: subtotal, taxPesewas, depositDeductionPesewas: depositDeduction, totalPesewas: total,
        lines: {
          create: [
            {
              description: 'Rental service (approved quotation amount)',
              quantity: 1,
              ratePesewas: Number(completion.quotedSubtotalPesewas),
              amountPesewas: Number(completion.quotedSubtotalPesewas),
            },
            ...(approvedCharges > 0 ? [{
              description: `Additional charges — ${completion.chargesDescription}`,
              quantity: 1,
              ratePesewas: approvedCharges,
              amountPesewas: approvedCharges,
            }] : []),
          ],
        },
      },
      include: invoiceInclude,
    });
    await appendHistory(tx, {
      companyId, invoiceId: invoice.id, actorId, fromStatus: null, toStatus: 'DRAFT',
      reason: 'Invoice created from approved rental completion',
    });
    await tx.auditEvent.create({
      data: {
        actorId, companyId, action: 'RENTAL_INVOICE_CREATED', entityType: 'RENTAL_INVOICE', entityId: invoice.id,
        summary: {
          reference, requestId, completionId: completion.id, subtotalPesewas: subtotal, taxPesewas,
          depositDeductionPesewas: depositDeduction, totalPesewas: total,
          taxLineCodes: taxLines.map((line) => line.code),
        },
      },
    });
    return { invoice: presentInvoice(invoice), duplicate: false };
  });
}

export async function getRentalInvoice(actorId: string, companyIdInput: string, invoiceIdInput: string) {
  const companyId = companyIdSchema.parse(companyIdInput);
  const invoiceId = idSchema.parse(invoiceIdInput);
  await requireRead(actorId, companyId);
  const prisma = getPrisma();
  const row = await prisma.rentalInvoice.findFirst({
    where: { id: invoiceId, companyId },
    include: {
      ...invoiceInclude,
      payments: {
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        include: { recordedBy: { select: { name: true } } },
      },
      statusHistory: {
        orderBy: { sequence: 'asc' },
        include: { actor: { select: { name: true } } },
      },
    },
  });
  if (!row) throw new RentalInvoiceNotFoundError();
  return {
    invoice: presentInvoice(row),
    payments: row.payments.map((payment) => ({
      id: payment.id,
      amountPesewas: payment.amountPesewas,
      method: payment.method,
      reference: payment.reference,
      receivedAt: payment.receivedAt.toISOString().slice(0, 10),
      reason: payment.reason,
      recordedByName: payment.recordedBy.name,
      createdAt: payment.createdAt.toISOString(),
    })),
    history: row.statusHistory.map((entry) => ({
      sequence: entry.sequence,
      fromStatus: entry.fromStatus,
      toStatus: entry.toStatus,
      reason: entry.reason,
      actorName: entry.actor.name,
      createdAt: entry.createdAt.toISOString(),
    })),
  };
}

export async function getRentalInvoiceForRequest(actorId: string, companyIdInput: string, requestIdInput: string) {
  const companyId = companyIdSchema.parse(companyIdInput);
  const requestId = idSchema.parse(requestIdInput);
  await requireRead(actorId, companyId);
  const row = await getPrisma().rentalInvoice.findFirst({
    where: { companyId, requestId, status: { not: 'VOID' } },
    include: invoiceInclude,
  });
  return row ? presentInvoice(row) : null;
}

export async function listRentalInvoices(actorId: string, companyIdInput: string, rawQuery: { status?: string; cursor?: string }) {
  const companyId = companyIdSchema.parse(companyIdInput);
  const query = rentalInvoiceListQuerySchema.parse(rawQuery);
  await requireRead(actorId, companyId);
  const prisma = getPrisma();
  if (query.cursor) {
    const cursorInvoice = await prisma.rentalInvoice.findFirst({
      where: { id: query.cursor, companyId }, select: { id: true },
    });
    if (!cursorInvoice) throw new RentalInvoiceNotFoundError('Invalid invoice cursor.');
  }
  const rows = await prisma.rentalInvoice.findMany({
    where: { companyId, ...(query.status ? { status: query.status } : {}) },
    include: invoiceInclude,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 51,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });
  const invoices = rows.slice(0, 50).map((row) => presentInvoice(row));
  return { invoices, nextCursor: rows.length > 50 ? invoices.at(-1)?.id ?? null : null };
}

export async function transitionRentalInvoice(actorId: string, companyIdInput: string, invoiceIdInput: string, rawInput: unknown) {
  const data = rentalInvoiceTransitionSchema.parse(rawInput);
  const companyId = companyIdSchema.parse(companyIdInput);
  const invoiceId = idSchema.parse(invoiceIdInput);
  await requireManage(actorId, companyId);
  if (data.toStatus === 'ISSUED' && !data.dueDate) {
    throw new RentalInvoicePolicyError(
      'RENTAL_INVOICE_DUE_DATE_REQUIRED',
      'Record the payment due date when issuing the invoice; there is no default due date.',
    );
  }
  if (data.toStatus === 'PAID') {
    throw new RentalInvoicePolicyError(
      'RENTAL_INVOICE_PAID_VIA_PAYMENTS',
      'An invoice becomes PAID by recording payments that cover its total; it is never marked paid directly.',
    );
  }
  return getPrisma().$transaction(async (tx) => {
    const current = await lockInvoice(tx, companyId, invoiceId);
    if (!isAllowedRentalInvoiceTransition(current.status, data.toStatus)) {
      throw new RentalInvoiceTransitionError(current.status, data.toStatus);
    }
    if (data.toStatus === 'VOID' && current.status === 'ISSUED') {
      const paymentCount = await tx.rentalInvoicePayment.count({ where: { companyId, invoiceId } });
      if (paymentCount > 0) {
        throw new RentalInvoicePolicyError(
          'RENTAL_INVOICE_VOID_WITH_PAYMENTS',
          'This invoice has recorded payments and cannot be voided. Payments are append-only; collect the outstanding balance instead.',
        );
      }
    }
    const changed = await tx.rentalInvoice.updateMany({
      where: { id: invoiceId, companyId, status: current.status },
      data: {
        status: data.toStatus,
        ...(data.toStatus === 'ISSUED' ? { dueDate: new Date(`${data.dueDate}T00:00:00.000Z`) } : {}),
      },
    });
    if (changed.count !== 1) throw new RentalInvoiceTransitionError(current.status, data.toStatus);
    await appendHistory(tx, {
      companyId, invoiceId, actorId,
      fromStatus: current.status, toStatus: data.toStatus, reason: data.reason,
    });
    await tx.auditEvent.create({
      data: {
        actorId, companyId, action: 'RENTAL_INVOICE_STATUS_CHANGED', entityType: 'RENTAL_INVOICE', entityId: invoiceId,
        summary: {
          reference: current.reference, fromStatus: current.status, toStatus: data.toStatus,
          reason: data.reason, ...(data.toStatus === 'ISSUED' ? { dueDate: data.dueDate } : {}),
        },
      },
    });
    const invoice = await tx.rentalInvoice.findUniqueOrThrow({ where: { id: invoiceId }, include: invoiceInclude });
    return presentInvoice(invoice);
  });
}

export type RecordRentalInvoicePaymentResult = {
  invoice: ReturnType<typeof presentInvoice>;
  payment: { id: string; amountPesewas: number; receivedAt: string };
  outstandingPesewas: number;
};

export async function recordRentalInvoicePayment(
  actorId: string, companyIdInput: string, invoiceIdInput: string, rawInput: unknown,
): Promise<RecordRentalInvoicePaymentResult> {
  const data = rentalInvoicePaymentSchema.parse(rawInput);
  const companyId = companyIdSchema.parse(companyIdInput);
  const invoiceId = idSchema.parse(invoiceIdInput);
  await requireManage(actorId, companyId);
  return getPrisma().$transaction(async (tx) => {
    const current = await lockInvoice(tx, companyId, invoiceId);
    if (current.status !== 'ISSUED') {
      throw new RentalInvoicePolicyError('RENTAL_INVOICE_PAYMENTS_ON_ISSUED_ONLY', 'Payments may only be recorded against ISSUED invoices.');
    }
    const prior = await tx.rentalInvoicePayment.findMany({
      where: { companyId, invoiceId }, select: { amountPesewas: true },
    });
    const paidBefore = prior.reduce((sum: number, payment: { amountPesewas: number }) => sum + payment.amountPesewas, 0);
    const outstandingBefore = current.totalPesewas - paidBefore;
    if (data.amountPesewas > outstandingBefore) throw new RentalInvoicePaymentExceedsError(outstandingBefore);
    const payment = await tx.rentalInvoicePayment.create({
      data: {
        companyId, invoiceId, amountPesewas: data.amountPesewas,
        method: data.method ?? null, reference: data.reference ?? null,
        receivedAt: new Date(`${data.receivedAt}T00:00:00.000Z`),
        reason: data.reason, recordedById: actorId,
      },
    });
    const outstandingAfter = outstandingBefore - data.amountPesewas;
    await tx.auditEvent.create({
      data: {
        actorId, companyId, action: 'RENTAL_INVOICE_PAYMENT_RECORDED', entityType: 'RENTAL_INVOICE', entityId: invoiceId,
        summary: {
          reference: current.reference, paymentId: payment.id, amountPesewas: data.amountPesewas,
          method: data.method ?? null, paymentReference: data.reference ?? null, receivedAt: data.receivedAt,
          outstandingPesewas: outstandingAfter, reason: data.reason,
        },
      },
    });
    if (outstandingAfter === 0) {
      const changed = await tx.rentalInvoice.updateMany({
        where: { id: invoiceId, companyId, status: 'ISSUED' },
        data: { status: 'PAID' },
      });
      if (changed.count !== 1) {
        throw new RentalInvoicePolicyError('RENTAL_INVOICE_CHANGED', 'The invoice changed while the payment was being recorded; retry.');
      }
      await appendHistory(tx, {
        companyId, invoiceId, actorId,
        fromStatus: 'ISSUED', toStatus: 'PAID', reason: 'Paid in full by recorded payments',
      });
      await tx.auditEvent.create({
        data: {
          actorId, companyId, action: 'RENTAL_INVOICE_MARKED_PAID', entityType: 'RENTAL_INVOICE', entityId: invoiceId,
          summary: { reference: current.reference, paymentId: payment.id, totalPesewas: current.totalPesewas },
        },
      });
    }
    const invoice = await tx.rentalInvoice.findUniqueOrThrow({ where: { id: invoiceId }, include: invoiceInclude });
    return { invoice: presentInvoice(invoice), payment: { id: payment.id, amountPesewas: payment.amountPesewas, receivedAt: data.receivedAt }, outstandingPesewas: outstandingAfter };
  });
}
