import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PermissionDeniedError, resolvePermission } from '@/modules/auth/permissions';
import { getPrisma } from '@/server/prisma';
import { getCompanyQuoteValidityDays, taxLinesSchema, type TaxLine } from '@/modules/settings/registry';
import { calculateTaxLineAmount } from '@/modules/finance/tax';
import { notifyLinkedCustomer, rentalQuotationIssuedNotification } from '@/modules/notifications/notifications';
import { isAllowedRentalQuotationTransition } from './rental-quotation-transitions';

/**
 * RNT quotations (D-090/5B). Staff issue a customer quotation from the
 * latest pricing worksheet while the request is Under Review; the quote
 * snapshots the worksheet version, the configured tax lines and the
 * total, and expires after the configured validity (unset blocks
 * issuance — fail closed). The linked customer accepts or declines in
 * the portal; reissuing supersedes the previous live quote.
 */

export class RentalQuotationNotFoundError extends Error {
  readonly code = 'RENTAL_QUOTATION_NOT_FOUND';
  readonly statusCode = 404;
  constructor(message = 'The quotation was not found.') {
    super(message);
    this.name = 'RentalQuotationNotFoundError';
  }
}

export class RentalQuotationPolicyError extends Error {
  readonly code: string;
  readonly statusCode = 422;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'RentalQuotationPolicyError';
    this.code = code;
  }
}

export function rentalQuotationErrorStatus(error: unknown): number {
  if (error instanceof z.ZodError) return 400;
  if (error instanceof Error && error.name === 'PermissionDeniedError') return 403;
  if (error instanceof RentalQuotationNotFoundError) return 404;
  if (error instanceof RentalQuotationPolicyError) return 422;
  return 500;
}

const decideQuotationSchema = z.object({
  decision: z.enum(['ACCEPTED', 'DECLINED']),
  reason: z.string().trim().min(8).max(500),
});

type QuotationRow = {
  id: string; reference: string; requestId: string; worksheetVersion: number; status: string;
  subtotalPesewas: bigint; taxPesewas: bigint; totalPesewas: bigint;
  taxSnapshot: Prisma.JsonValue;
  expiresAt: Date; decidedAt: Date | null; decisionReason: string | null; createdAt: Date;
};

export function presentQuotation(row: QuotationRow, now = new Date()) {
  const expired = row.status === 'ISSUED' && row.expiresAt.getTime() <= now.getTime();
  return {
    id: row.id,
    reference: row.reference,
    requestId: row.requestId,
    worksheetVersion: row.worksheetVersion,
    status: row.status,
    displayStatus: expired ? 'EXPIRED' : row.status,
    subtotalPesewas: Number(row.subtotalPesewas),
    taxPesewas: Number(row.taxPesewas),
    totalPesewas: Number(row.totalPesewas),
    taxLines: Array.isArray(row.taxSnapshot) ? row.taxSnapshot : [],
    expiresAt: row.expiresAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
    decisionReason: row.decisionReason,
    createdAt: row.createdAt.toISOString(),
  };
}

async function requireStaffRead(actorId: string, companyId: string) {
  for (const permission of ['rental:read', 'rental:manage'] as const) {
    const access = await resolvePermission({ userId: actorId, companyId, permission });
    if (access.allowed) return;
  }
  throw new PermissionDeniedError();
}

export async function issueRentalQuotation(actorId: string, companyId: string, requestId: string) {
  const access = await resolvePermission({ userId: actorId, companyId, permission: 'rental:manage' });
  if (!access.allowed) throw new PermissionDeniedError();
  const validityDays = await getCompanyQuoteValidityDays(companyId);
  if (validityDays === null) {
    throw new RentalQuotationPolicyError(
      'QTN_VALIDITY_NOT_CONFIGURED',
      'Quotation validity is not configured under Settings (rental.quote_validity). Configure it before issuing customer quotations.',
    );
  }
  const now = new Date();
  const result = await getPrisma().$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string; status: string; customerId: string }>>`
      SELECT "id", "status", "customerId" FROM "RentalRequest"
      WHERE "id" = ${requestId} AND "companyId" = ${companyId}
      FOR UPDATE
    `;
    const request = locked[0];
    if (!request) throw new RentalQuotationNotFoundError('The rental request was not found in this workspace.');
    if (request.status !== 'Under Review') {
      throw new RentalQuotationPolicyError(
        'QTN_REQUEST_NOT_UNDER_REVIEW',
        `Quotations are issued while a request is Under Review (current: "${request.status}").`,
      );
    }
    const worksheet = await tx.rentalPricingWorksheet.findFirst({
      where: { companyId, requestId },
      orderBy: { version: 'desc' },
    });
    if (!worksheet) {
      throw new RentalQuotationPolicyError('QTN_NO_WORKSHEET', 'Save a pricing worksheet before issuing a quotation.');
    }
    const setting = await tx.setting.findUnique({
      where: { companyId_key: { companyId, key: 'finance.tax_lines' } },
      select: { value: true, configured: true },
    });
    let taxLines: TaxLine[] = [];
    if (setting?.configured && setting.value !== null) {
      const parsed = taxLinesSchema.safeParse(setting.value);
      if (parsed.success) taxLines = parsed.data;
    }
    const subtotal = worksheet.preTaxSubtotalPesewas;
    const taxSnapshot = taxLines.map((line) => ({
      code: line.code,
      label: line.label,
      rateBasisPoints: line.rateBasisPoints,
      amountPesewas: calculateTaxLineAmount(line, Number(subtotal)),
    }));
    const taxPesewas = BigInt(taxSnapshot.reduce((sum, line) => sum + line.amountPesewas, 0));
    const reference = `QUO-${randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`;
    await tx.rentalQuotation.updateMany({
      where: { companyId, requestId, status: 'ISSUED' },
      data: { status: 'SUPERSEDED' },
    });
    const quotation = await tx.rentalQuotation.create({
      data: {
        companyId, requestId,
        worksheetId: worksheet.id, worksheetVersion: worksheet.version,
        reference, subtotalPesewas: subtotal, taxPesewas,
        taxSnapshot: taxSnapshot as Prisma.InputJsonValue,
        totalPesewas: subtotal + taxPesewas,
        expiresAt: new Date(now.getTime() + validityDays * 86_400_000),
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId, companyId, action: 'RENTAL_QUOTATION_ISSUED', entityType: 'RENTAL_REQUEST', entityId: requestId,
        summary: {
          quotationId: quotation.id, reference, worksheetId: worksheet.id, worksheetVersion: worksheet.version,
          subtotalPesewas: subtotal.toString(), taxPesewas: taxPesewas.toString(),
          totalPesewas: (subtotal + taxPesewas).toString(), expiresAt: quotation.expiresAt.toISOString(),
        },
      },
    });
    const content = rentalQuotationIssuedNotification({
      reference,
      totalPesewas: Number(subtotal + taxPesewas),
      expiresAt: quotation.expiresAt,
    });
    await notifyLinkedCustomer(tx, {
      customerId: request.customerId,
      companyId,
      type: 'RENTAL_QUOTATION_ISSUED',
      title: content.title,
      body: content.body,
      entityType: 'RentalQuotation',
      entityId: quotation.id,
      dedupeKey: `rental-quotation:${quotation.id}`,
    });
    return presentQuotation(quotation, now);
  });
  return result;
}

export async function listRentalQuotations(actorId: string, companyId: string, requestId: string) {
  await requireStaffRead(actorId, companyId);
  const rows = await getPrisma().rentalQuotation.findMany({
    where: { companyId, requestId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  return rows.map((row) => presentQuotation(row));
}

/**
 * Customer decision from the rental portal. The actor must be the login
 * linked to the customer who owns the request (same rule as the rest of
 * the portal). Decisions are final; expired quotes cannot be decided.
 */
export async function decideOwnRentalQuotation(
  actorId: string,
  companyId: string,
  quotationId: string,
  rawInput: { decision: 'ACCEPTED' | 'DECLINED'; reason: string },
) {
  const input = decideQuotationSchema.parse(rawInput);
  const prisma = getPrisma();
  const customer = await prisma.customer.findFirst({
    where: { userId: actorId, companyId, archivedAt: null },
    select: { id: true },
  });
  if (!customer) {
    throw new RentalQuotationNotFoundError('That quotation was not found for your customer record.');
  }
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const quotation = await tx.rentalQuotation.findFirst({
      where: { id: quotationId, companyId },
      include: { request: { select: { status: true, customerId: true } } },
    });
    if (!quotation || quotation.request.customerId !== customer.id) {
      throw new RentalQuotationNotFoundError('That quotation was not found for your customer record.');
    }
    if (!isAllowedRentalQuotationTransition(quotation.status, input.decision)) {
      throw new RentalQuotationPolicyError('QTN_ALREADY_DECIDED', 'This quotation has already been decided or replaced by a newer one.');
    }
    if (quotation.expiresAt.getTime() <= now.getTime()) {
      throw new RentalQuotationPolicyError('QTN_EXPIRED', 'This quotation has expired. Ask us for a fresh quotation before deciding.');
    }
    if (quotation.request.status !== 'Under Review') {
      throw new RentalQuotationPolicyError(
        'QTN_REQUEST_MOVED_ON',
        'This request has already moved past quotation. Please contact us and we will help from here.',
      );
    }
    await tx.rentalQuotation.update({
      where: { id: quotation.id },
      data: {
        status: input.decision,
        decidedAt: now,
        decidedById: actorId,
        decisionReason: input.reason,
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId, companyId,
        action: input.decision === 'ACCEPTED' ? 'RENTAL_QUOTATION_ACCEPTED' : 'RENTAL_QUOTATION_DECLINED',
        entityType: 'RENTAL_REQUEST', entityId: quotation.requestId,
        summary: { quotationId: quotation.id, reference: quotation.reference, reason: input.reason },
      },
    });
    return presentQuotation({ ...quotation, status: input.decision, decidedAt: now, decisionReason: input.reason }, now);
  });
}
