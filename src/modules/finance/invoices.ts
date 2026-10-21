import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PermissionDeniedError, resolvePermission } from '@/modules/auth/permissions';
import { getPrisma } from '@/server/prisma';
import { getCorporateRate, taxLinesSchema, type TaxLine } from '@/modules/settings/registry';
import { calculateTaxLineAmount } from './tax';
import { corporateInvoiceListQuerySchema, corporateInvoiceRequestSchema } from './invoice-schema';

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
  status: string;
  subtotalPesewas: number;
  taxPesewas: number;
  totalPesewas: number;
  createdAt: Date;
  lines: CorporateInvoiceLineRecord[];
};

type InvoiceDbShape = {
  id: string; reference: string; clientId: string; contractId: string;
  periodStart: Date; periodEnd: Date; status: string;
  subtotalPesewas: number; taxPesewas: number; totalPesewas: number; createdAt: Date;
  client: { name: string };
  contract: { reference: string };
  lines: Array<{
    id: string; tripId: string | null; description: string; unit: string;
    quantity: number; ratePesewas: number; amountPesewas: number;
  }>;
};

const invoiceInclude = {
  client: { select: { name: true } },
  contract: { select: { reference: true } },
  lines: { orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }] },
};

function presentInvoice(row: InvoiceDbShape): CorporateInvoiceRecord {
  return {
    id: row.id,
    reference: row.reference,
    clientId: row.clientId,
    clientName: row.client.name,
    contractId: row.contractId,
    contractReference: row.contract.reference,
    periodStart: row.periodStart.toISOString().slice(0, 10),
    periodEnd: row.periodEnd.toISOString().slice(0, 10),
    status: row.status,
    subtotalPesewas: row.subtotalPesewas,
    taxPesewas: row.taxPesewas,
    totalPesewas: row.totalPesewas,
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
  actorId: string; companyId: string; clientId?: string; cursor?: string;
}): Promise<{ invoices: CorporateInvoiceRecord[]; nextCursor: string | null; canManage: boolean }> {
  const companyId = companyIdSchema.parse(input.companyId);
  const query = corporateInvoiceListQuerySchema.parse({ clientId: input.clientId || undefined, cursor: input.cursor });
  const access = await accessFor(input.actorId, companyId);
  const prisma = getPrisma();
  if (query.cursor) {
    const cursorInvoice = await prisma.corporateInvoice.findFirst({
      where: { id: query.cursor, companyId }, select: { id: true },
    });
    if (!cursorInvoice) throw new InvalidInvoiceCursorError();
  }
  const rows = await prisma.corporateInvoice.findMany({
    where: { companyId, ...(query.clientId ? { clientId: query.clientId } : {}) },
    include: invoiceInclude,
    orderBy: [{ periodStart: 'desc' }, { id: 'desc' }],
    take: 51,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });
  const invoices = rows.slice(0, 50).map((row: InvoiceDbShape) => presentInvoice(row));
  return { invoices, nextCursor: rows.length > 50 ? invoices.at(-1)?.id ?? null : null, canManage: access.canManage };
}

export async function getCorporateInvoice(input: { actorId: string; companyId: string; invoiceId: string }) {
  const companyId = companyIdSchema.parse(input.companyId);
  const invoiceId = invoiceIdSchema.parse(input.invoiceId);
  await accessFor(input.actorId, companyId);
  const row = await getPrisma().corporateInvoice.findFirst({
    where: { id: invoiceId, companyId },
    include: invoiceInclude,
  });
  if (!row) throw new InvoiceNotFoundError();
  return { invoice: presentInvoice(row) };
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
 * contract+period unique key (plus the contract row lock) makes generation
 * idempotent, and the partial unique index on invoice lines guarantees a
 * trip is never billed twice. Note: regenerating an existing period returns
 * the stored invoice, so trips completed later for that period need a fresh
 * period (recorded in docs/PROGRESS.md).
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
      where: { companyId, contractId: data.contractId, periodStart, periodEnd },
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
    const alreadyBilled = await tx.corporateInvoiceLine.findMany({
      where: { companyId, tripId: { in: billableTrips.map((trip: { id: string }) => trip.id) } },
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
                  companyId,
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
          where: { companyId, contractId: data.contractId, periodStart, periodEnd },
          include: invoiceInclude,
        });
        if (raced) return { invoice: presentInvoice(raced), duplicate: true };
      }
    }
    throw new InvoiceValidationError('A unique invoice reference could not be allocated; retry.');
  });
}
