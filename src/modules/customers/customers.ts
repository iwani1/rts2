import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PermissionDeniedError, resolvePermission } from '@/modules/auth/permissions';
import { getPrisma } from '@/server/prisma';
import { customerInputSchema, customerListQuerySchema, customerRequestSchema } from './customer-schema';
import { parseCustomerImportCsv, type CustomerImportRow } from './customer-import';

const companyIdSchema = z.string().trim().min(1).max(128);
const customerIdSchema = z.string().trim().min(1).max(128);

export class CustomerCompanyNotFoundError extends Error {
  readonly code = 'COMPANY_NOT_FOUND';
  constructor() { super('Company not found.'); this.name = 'CustomerCompanyNotFoundError'; }
}
export class CustomerNotFoundError extends Error {
  readonly code = 'CUSTOMER_NOT_FOUND';
  constructor() { super('Customer not found.'); this.name = 'CustomerNotFoundError'; }
}
export class InvalidCustomerCursorError extends Error {
  readonly code = 'INVALID_CUSTOMER_CURSOR';
  constructor() { super('Invalid customer cursor.'); this.name = 'InvalidCustomerCursorError'; }
}

export type CustomerHistoryEntry = {
  action: string;
  createdAt: Date;
  actorName: string;
  reason: string;
};

export type CustomerRecord = {
  id: string;
  reference: string | null;
  displayName: string;
  contactPerson: string | null;
  telephone: string | null;
  email: string | null;
  billingDetails: string | null;
  customerType: string | null;
  status: string | null;
  notes: string | null;
  linkedUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type CustomerDbShape = Omit<CustomerRecord, 'linkedUserId'> & { userId: string | null };
function presentCustomer(row: CustomerDbShape): CustomerRecord {
  return {
    id: row.id,
    reference: row.reference,
    displayName: row.displayName,
    contactPerson: row.contactPerson,
    telephone: row.telephone,
    email: row.email,
    billingDetails: row.billingDetails,
    customerType: row.customerType,
    status: row.status,
    notes: row.notes,
    linkedUserId: row.userId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toCustomerData(input: z.infer<typeof customerInputSchema>) {
  return {
    reference: input.reference || null,
    displayName: input.displayName,
    contactPerson: input.contactPerson || null,
    telephone: input.telephone || null,
    email: input.email || null,
    billingDetails: input.billingDetails || null,
    customerType: input.customerType || null,
    status: input.status || null,
    notes: input.notes || null,
  };
}

export type CustomerImportPreview = {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  canImport: boolean;
  fileErrors: string[];
  rows: Array<Pick<CustomerImportRow,
    'rowNumber' | 'displayName' | 'reference' | 'contactPerson' | 'telephone' | 'email' | 'billingDetails' | 'customerType' | 'status' | 'notes' | 'errors'
  >>;
};

export class CustomerImportValidationError extends Error {
  readonly code = 'CUSTOMER_IMPORT_VALIDATION_FAILED';
  constructor(readonly preview: CustomerImportPreview) {
    super(preview.fileErrors.length > 0
      ? 'Fix the CSV file errors before importing; no customers were imported.'
      : `Fix all ${preview.invalidRows} invalid CSV row(s) before importing; no customers were imported.`);
    this.name = 'CustomerImportValidationError';
  }
}

async function accessFor(actorId: string, companyId: string) {
  const permission = await resolvePermission({ userId: actorId, companyId, permission: 'customer:manage' });
  if (!permission.allowed) throw new PermissionDeniedError();
  const company = await getPrisma().company.findUnique({ where: { id: companyId }, select: { status: true } });
  if (company?.status !== 'ACTIVE') throw new CustomerCompanyNotFoundError();
  const canManage = permission.scopes.includes('GLOBAL') || permission.scopes.includes('COMPANY');
  // Limited enquiry, billing, and own-profile projections need field rules; deny until those are implemented.
  if (!canManage) throw new PermissionDeniedError();
  return { canManage };
}

async function evaluateCustomerImport(
  db: Pick<Prisma.TransactionClient, 'customer'>,
  companyId: string,
  csv: string,
) {
  const parsed = parseCustomerImportCsv(csv);
  if (parsed.fileErrors.length > 0) {
    return { rows: parsed.rows, preview: {
      totalRows: 0, validRows: 0, invalidRows: 0, canImport: false,
      fileErrors: parsed.fileErrors, rows: [],
    } satisfies CustomerImportPreview };
  }

  const references = [...new Set(parsed.rows.flatMap((row) => row.data?.reference ? [row.data.reference] : []))];
  const existingReferences = references.length > 0
    ? await db.customer.findMany({ where: { companyId, reference: { in: references } }, select: { reference: true } })
    : [];
  const existingSet = new Set(existingReferences.flatMap((row: { reference: string | null }) => row.reference ? [row.reference] : []));
  for (const row of parsed.rows) {
    if (row.data?.reference && existingSet.has(row.data.reference)) {
      row.errors.push(`Reference "${row.data.reference}" already exists in this company.`);
    }
  }

  const validRows = parsed.rows.filter((row) => row.errors.length === 0 && row.data).length;
  const preview: CustomerImportPreview = {
    totalRows: parsed.rows.length,
    validRows,
    invalidRows: parsed.rows.length - validRows,
    canImport: parsed.rows.length > 0 && validRows === parsed.rows.length,
    fileErrors: [],
    rows: parsed.rows.map(({ rowNumber, displayName, reference, contactPerson, telephone, email, billingDetails, customerType, status, notes, errors }) => ({
      rowNumber, displayName, reference, contactPerson, telephone, email, billingDetails, customerType, status, notes, errors,
    })),
  };
  return { rows: parsed.rows, preview };
}

export async function previewCustomerImport(input: { actorId: string; companyId: string; csv: string }) {
  const data = z.object({
    actorId: z.string().trim().min(1).max(128),
    companyId: companyIdSchema,
    csv: z.string().min(1).max(2_000_000),
  }).strict().parse(input);
  await accessFor(data.actorId, data.companyId);
  return (await evaluateCustomerImport(getPrisma(), data.companyId, data.csv)).preview;
}

export async function importCustomersFromCsv(input: {
  actorId: string; companyId: string; csv: string; reason: string;
}) {
  const data = z.object({
    actorId: z.string().trim().min(1).max(128),
    companyId: companyIdSchema,
    csv: z.string().min(1).max(2_000_000),
    reason: z.string().trim().min(8).max(500),
  }).strict().parse(input);
  await accessFor(data.actorId, data.companyId);
  const prisma = getPrisma();

  try {
    return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const evaluated = await evaluateCustomerImport(tx, data.companyId, data.csv);
      if (!evaluated.preview.canImport || evaluated.preview.fileErrors.length > 0) {
        throw new CustomerImportValidationError(evaluated.preview);
      }
      const imported: Array<{ id: string; displayName: string; reference: string | null }> = [];
      for (const row of evaluated.rows) {
        if (!row.data) throw new Error('Validated import row is missing normalized data.');
        const customer = await tx.customer.create({ data: { ...toCustomerData(row.data), companyId: data.companyId } });
        await tx.auditEvent.create({
          data: {
            actorId: data.actorId,
            companyId: data.companyId,
            action: 'CUSTOMER_IMPORTED',
            entityType: 'CUSTOMER',
            entityId: customer.id,
            summary: { reason: data.reason, source: 'CSV_IMPORT', rowNumber: row.rowNumber },
          },
        });
        imported.push({ id: customer.id, displayName: customer.displayName, reference: customer.reference });
      }
      return { importedCount: imported.length, customers: imported };
    });
  } catch (error) {
    if (!isUniqueCustomerReferenceError(error)) throw error;
    const refreshed = await evaluateCustomerImport(prisma, data.companyId, data.csv);
    throw new CustomerImportValidationError(refreshed.preview);
  }
}

export async function listCustomers(input: { actorId: string; companyId: string; search?: string; cursor?: string }): Promise<{
  customers: CustomerRecord[]; nextCursor: string | null; canManage: boolean;
}> {
  const companyId = companyIdSchema.parse(input.companyId);
  const query = customerListQuerySchema.parse({ search: input.search, cursor: input.cursor });
  const access = await accessFor(input.actorId, companyId);
  const prisma = getPrisma();
  if (query.cursor) {
    const cursorCustomer = await prisma.customer.findFirst({ where: { id: query.cursor, companyId, archivedAt: null }, select: { id: true } });
    if (!cursorCustomer) throw new InvalidCustomerCursorError();
  }
  const where = {
    companyId,
    archivedAt: null,
    ...(query.search ? { OR: [
      { displayName: { contains: query.search, mode: 'insensitive' as const } },
      { reference: { contains: query.search, mode: 'insensitive' as const } },
      { contactPerson: { contains: query.search, mode: 'insensitive' as const } },
      { telephone: { contains: query.search, mode: 'insensitive' as const } },
      { email: { contains: query.search, mode: 'insensitive' as const } },
    ] } : {}),
  };
  const rows = await prisma.customer.findMany({
    where,
    orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
    take: 51,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > 50;
  const customers = rows.slice(0, 50).map(presentCustomer);
  return { customers, nextCursor: hasMore ? customers.at(-1)?.id ?? null : null, canManage: access.canManage };
}

export async function getCustomer(input: { actorId: string; companyId: string; customerId: string }): Promise<{
  customer: CustomerRecord; canManage: boolean; history: CustomerHistoryEntry[];
}> {
  const companyId = companyIdSchema.parse(input.companyId);
  const customerId = customerIdSchema.parse(input.customerId);
  const access = await accessFor(input.actorId, companyId);
  const prisma = getPrisma();
  const row = await prisma.customer.findFirst({ where: { id: customerId, companyId, archivedAt: null } });
  if (!row) throw new CustomerNotFoundError();
  const auditRows = await prisma.auditEvent.findMany({
    where: { companyId, entityType: 'CUSTOMER', entityId: customerId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { action: true, createdAt: true, summary: true, actor: { select: { name: true } } },
  });
  const history: CustomerHistoryEntry[] = auditRows.map((event: {
    action: string; createdAt: Date; summary: unknown; actor: { name: string } | null;
  }) => {
    const summary = event.summary;
    const reason = typeof summary === 'object' && summary !== null && !Array.isArray(summary)
      ? (summary as Record<string, unknown>).reason
      : undefined;
    return {
      action: event.action,
      createdAt: event.createdAt,
      actorName: event.actor?.name ?? 'Former or unavailable user',
      reason: typeof reason === 'string' ? reason : '',
    };
  });
  return { customer: presentCustomer(row), canManage: access.canManage, history };
}

export async function createCustomer(input: unknown, actorId: string, companyIdInput: string) {
  const data = customerRequestSchema.parse(input);
  const companyId = companyIdSchema.parse(companyIdInput);
  await accessFor(actorId, companyId);
  return getPrisma().$transaction(async (tx: Prisma.TransactionClient) => {
    const customer = await tx.customer.create({ data: { ...toCustomerData(data), companyId } });
    await tx.auditEvent.create({
      data: {
        actorId, companyId, action: 'CUSTOMER_CREATED', entityType: 'CUSTOMER', entityId: customer.id,
        summary: { reason: data.reason },
      },
    });
    return presentCustomer(customer);
  });
}

export async function updateCustomer(input: unknown, actorId: string, companyIdInput: string, customerIdInput: string) {
  const data = customerRequestSchema.parse(input);
  const companyId = companyIdSchema.parse(companyIdInput);
  const customerId = customerIdSchema.parse(customerIdInput);
  await accessFor(actorId, companyId);
  return getPrisma().$transaction(async (tx: Prisma.TransactionClient) => {
    const changed = await tx.customer.updateMany({ where: { id: customerId, companyId, archivedAt: null }, data: toCustomerData(data) });
    if (changed.count !== 1) throw new CustomerNotFoundError();
    const customer = await tx.customer.findUniqueOrThrow({ where: { id: customerId } });
    await tx.auditEvent.create({
      data: {
        actorId, companyId, action: 'CUSTOMER_UPDATED', entityType: 'CUSTOMER', entityId: customer.id,
        summary: { reason: data.reason },
      },
    });
    return presentCustomer(customer);
  });
}

export function isUniqueCustomerReferenceError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

export async function archiveCustomer(input: { actorId: string; companyId: string; customerId: string; reason: string }) {
  const data = z.object({
    actorId: z.string().min(1), companyId: companyIdSchema, customerId: customerIdSchema,
    reason: z.string().trim().min(8).max(500),
  }).strict().parse(input);
  await accessFor(data.actorId, data.companyId);
  return getPrisma().$transaction(async (tx: Prisma.TransactionClient) => {
    const changed = await tx.customer.updateMany({
      where: { id: data.customerId, companyId: data.companyId, archivedAt: null },
      data: { archivedAt: new Date() },
    });
    if (changed.count !== 1) throw new CustomerNotFoundError();
    const customer = await tx.customer.findUniqueOrThrow({ where: { id: data.customerId }, select: { id: true, archivedAt: true } });
    await tx.auditEvent.create({
      data: {
        actorId: data.actorId, companyId: data.companyId, action: 'CUSTOMER_ARCHIVED', entityType: 'CUSTOMER', entityId: customer.id,
        summary: { reason: data.reason },
      },
    });
    return { id: customer.id, archivedAt: customer.archivedAt };
  });
}
