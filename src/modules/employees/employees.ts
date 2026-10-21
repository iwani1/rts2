import { csvCell } from '@/lib/csv-cell';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PermissionDeniedError, resolvePermission } from '@/modules/auth/permissions';
import { getPrisma } from '@/server/prisma';
import { employeeListQuerySchema, employeeRequestSchema } from './employee-schema';
import {
  employeeLikelyDuplicateKey,
  parseEmployeeImportCsv,
  type EmployeeImportRow,
} from './employee-import';

const companyIdSchema = z.string().trim().min(1).max(128);
const employeeIdSchema = z.string().trim().min(1).max(128);
const clientIdSchema = z.string().trim().min(1).max(128);

export class EmployeeCompanyNotFoundError extends Error {
  readonly code = 'COMPANY_NOT_FOUND';
  constructor() { super('Company not found.'); this.name = 'EmployeeCompanyNotFoundError'; }
}
export class EmployeeNotFoundError extends Error {
  readonly code = 'EMPLOYEE_NOT_FOUND';
  constructor() { super('Employee not found.'); this.name = 'EmployeeNotFoundError'; }
}
export class EmployeeClientNotFoundError extends Error {
  readonly code = 'EMPLOYEE_CLIENT_NOT_FOUND';
  constructor() { super('Active client not found in this company.'); this.name = 'EmployeeClientNotFoundError'; }
}
export class InvalidEmployeeCursorError extends Error {
  readonly code = 'INVALID_EMPLOYEE_CURSOR';
  constructor() { super('Invalid employee cursor.'); this.name = 'InvalidEmployeeCursorError'; }
}
export class EmployeeReferenceTakenError extends Error {
  readonly code = 'EMPLOYEE_REFERENCE_TAKEN';
  constructor(reference: string) { super(`Reference "${reference}" already exists in this company.`); this.name = 'EmployeeReferenceTakenError'; }
}

export type EmployeeHistoryEntry = {
  action: string;
  createdAt: Date;
  actorName: string;
  reason: string;
};

/**
 * Home address, contact details and voluntarily supplied accessibility needs
 * are restricted fields. They are returned only to company-scoped
 * `employee:manage` managers; narrower scopes (roster minimum, own-company HR,
 * own profile) fail closed in `accessFor` until their field projections and
 * client-binding rules are approved.
 */
export type EmployeeRecord = {
  id: string;
  clientId: string;
  clientName: string;
  reference: string | null;
  fullName: string;
  telephone: string | null;
  email: string | null;
  homeAddress: string | null;
  department: string | null;
  workLocation: string | null;
  shift: string | null;
  approvedPickupLocation: string | null;
  approvedDropoffLocation: string | null;
  accountStatus: string | null;
  transportEligible: boolean | null;
  accessibilityNeeds: string | null;
  notes: string | null;
  linkedUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type EmployeeDbShape = Omit<EmployeeRecord, 'clientName' | 'linkedUserId'> & { userId: string | null;
  client: { name: string };
};

function presentEmployee(row: EmployeeDbShape): EmployeeRecord {
  const { client, userId, ...rest } = row;
  return { ...rest, clientName: client.name, linkedUserId: userId };
}

function toEmployeeData(input: z.infer<typeof employeeRequestSchema>) {
  return {
    clientId: input.clientId,
    reference: input.reference || null,
    fullName: input.fullName,
    telephone: input.telephone || null,
    email: input.email || null,
    homeAddress: input.homeAddress || null,
    department: input.department || null,
    workLocation: input.workLocation || null,
    shift: input.shift || null,
    approvedPickupLocation: input.approvedPickupLocation || null,
    approvedDropoffLocation: input.approvedDropoffLocation || null,
    accountStatus: input.accountStatus || null,
    transportEligible: input.transportEligible,
    accessibilityNeeds: input.accessibilityNeeds || null,
    notes: input.notes || null,
  };
}

async function accessFor(actorId: string, companyId: string) {
  const permission = await resolvePermission({ userId: actorId, companyId, permission: 'employee:manage' });
  if (!permission.allowed) throw new PermissionDeniedError();
  const company = await getPrisma().company.findUnique({ where: { id: companyId }, select: { status: true } });
  if (company?.status !== 'ACTIVE') throw new EmployeeCompanyNotFoundError();
  const canManage = permission.scopes.includes('GLOBAL') || permission.scopes.includes('COMPANY');
  if (!canManage) throw new PermissionDeniedError();
  return { canManage };
}

async function requireActiveClient(db: Pick<Prisma.TransactionClient, 'client'>, companyId: string, clientId: string) {
  const client = await db.client.findFirst({ where: { id: clientId, companyId, archivedAt: null }, select: { id: true } });
  if (!client) throw new EmployeeClientNotFoundError();
}

function isUniqueReferenceError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'P2002';
}

export async function listEmployees(input: {
  actorId: string; companyId: string; search?: string; clientId?: string; transportEligible?: string; cursor?: string;
}): Promise<{ employees: EmployeeRecord[]; nextCursor: string | null; canManage: boolean }> {
  const companyId = companyIdSchema.parse(input.companyId);
  const query = employeeListQuerySchema.parse({
    search: input.search, clientId: input.clientId || undefined,
    transportEligible: input.transportEligible || undefined, cursor: input.cursor,
  });
  const access = await accessFor(input.actorId, companyId);
  const prisma = getPrisma();
  if (query.cursor) {
    const cursorEmployee = await prisma.employee.findFirst({ where: { id: query.cursor, companyId, archivedAt: null }, select: { id: true } });
    if (!cursorEmployee) throw new InvalidEmployeeCursorError();
  }
  const where = {
    companyId,
    archivedAt: null,
    ...(query.clientId ? { clientId: query.clientId } : {}),
    ...(query.transportEligible ? { transportEligible: query.transportEligible === 'true' } : {}),
    ...(query.search ? { OR: [
      { fullName: { contains: query.search, mode: 'insensitive' as const } },
      { reference: { contains: query.search, mode: 'insensitive' as const } },
      { department: { contains: query.search, mode: 'insensitive' as const } },
      { telephone: { contains: query.search, mode: 'insensitive' as const } },
      { email: { contains: query.search, mode: 'insensitive' as const } },
    ] } : {}),
  };
  const rows = await prisma.employee.findMany({
    where,
    include: { client: { select: { name: true } } },
    orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
    take: 51,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });
  const employees = rows.slice(0, 50).map((row: EmployeeDbShape) => presentEmployee(row));
  return { employees, nextCursor: rows.length > 50 ? employees.at(-1)?.id ?? null : null, canManage: access.canManage };
}

export async function getEmployee(input: { actorId: string; companyId: string; employeeId: string }): Promise<{
  employee: EmployeeRecord; canManage: boolean; history: EmployeeHistoryEntry[];
}> {
  const companyId = companyIdSchema.parse(input.companyId);
  const employeeId = employeeIdSchema.parse(input.employeeId);
  const access = await accessFor(input.actorId, companyId);
  const prisma = getPrisma();
  const row = await prisma.employee.findFirst({
    where: { id: employeeId, companyId, archivedAt: null },
    include: { client: { select: { name: true } } },
  });
  if (!row) throw new EmployeeNotFoundError();
  const auditRows = await prisma.auditEvent.findMany({
    where: { companyId, entityType: 'EMPLOYEE', entityId: employeeId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { action: true, createdAt: true, summary: true, actor: { select: { name: true } } },
  });
  const history: EmployeeHistoryEntry[] = auditRows.map((event: {
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
  return { employee: presentEmployee(row), canManage: access.canManage, history };
}

async function assertReferenceAvailable(
  db: Pick<Prisma.TransactionClient, 'employee'>, companyId: string, reference: string | null, excludeEmployeeId?: string,
) {
  if (!reference) return;
  const existing = await db.employee.findFirst({
    where: { companyId, reference, ...(excludeEmployeeId ? { id: { not: excludeEmployeeId } } : {}) },
    select: { id: true },
  });
  if (existing) throw new EmployeeReferenceTakenError(reference);
}

export async function createEmployee(input: unknown, actorId: string, companyIdInput: string) {
  const data = employeeRequestSchema.parse(input);
  const companyId = companyIdSchema.parse(companyIdInput);
  await accessFor(actorId, companyId);
  try {
    return await getPrisma().$transaction(async (tx: Prisma.TransactionClient) => {
      await requireActiveClient(tx, companyId, data.clientId);
      await assertReferenceAvailable(tx, companyId, data.reference || null);
      const employee = await tx.employee.create({
        data: { ...toEmployeeData(data), companyId },
        include: { client: { select: { name: true } } },
      });
      await tx.auditEvent.create({
        data: {
          actorId, companyId, action: 'EMPLOYEE_CREATED', entityType: 'EMPLOYEE', entityId: employee.id,
          summary: { reason: data.reason, clientId: data.clientId },
        },
      });
      return presentEmployee(employee);
    });
  } catch (error) {
    if (isUniqueReferenceError(error) && data.reference) throw new EmployeeReferenceTakenError(data.reference);
    throw error;
  }
}

export async function updateEmployee(input: unknown, actorId: string, companyIdInput: string, employeeIdInput: string) {
  const data = employeeRequestSchema.parse(input);
  const companyId = companyIdSchema.parse(companyIdInput);
  const employeeId = employeeIdSchema.parse(employeeIdInput);
  await accessFor(actorId, companyId);
  try {
    return await getPrisma().$transaction(async (tx: Prisma.TransactionClient) => {
      const current = await tx.employee.findFirst({
        where: { id: employeeId, companyId, archivedAt: null }, select: { clientId: true },
      });
      if (!current) throw new EmployeeNotFoundError();
      if (data.clientId !== current.clientId) await requireActiveClient(tx, companyId, data.clientId);
      await assertReferenceAvailable(tx, companyId, data.reference || null, employeeId);
      const changed = await tx.employee.updateMany({
        where: { id: employeeId, companyId, archivedAt: null }, data: toEmployeeData(data),
      });
      if (changed.count !== 1) throw new EmployeeNotFoundError();
      const employee = await tx.employee.findUniqueOrThrow({
        where: { id: employeeId }, include: { client: { select: { name: true } } },
      });
      await tx.auditEvent.create({
        data: {
          actorId, companyId, action: 'EMPLOYEE_UPDATED', entityType: 'EMPLOYEE', entityId: employee.id,
          summary: { reason: data.reason, clientId: data.clientId },
        },
      });
      return presentEmployee(employee);
    });
  } catch (error) {
    if (isUniqueReferenceError(error) && data.reference) throw new EmployeeReferenceTakenError(data.reference);
    throw error;
  }
}

export async function archiveEmployee(input: { actorId: string; companyId: string; employeeId: string; reason: string }) {
  const data = z.object({
    actorId: z.string().min(1), companyId: companyIdSchema, employeeId: employeeIdSchema,
    reason: z.string().trim().min(8).max(500),
  }).strict().parse(input);
  await accessFor(data.actorId, data.companyId);
  return getPrisma().$transaction(async (tx: Prisma.TransactionClient) => {
    const changed = await tx.employee.updateMany({
      where: { id: data.employeeId, companyId: data.companyId, archivedAt: null },
      data: { archivedAt: new Date() },
    });
    if (changed.count !== 1) throw new EmployeeNotFoundError();
    const employee = await tx.employee.findUniqueOrThrow({ where: { id: data.employeeId }, select: { id: true, archivedAt: true } });
    await tx.auditEvent.create({
      data: {
        actorId: data.actorId, companyId: data.companyId, action: 'EMPLOYEE_ARCHIVED', entityType: 'EMPLOYEE', entityId: employee.id,
        summary: { reason: data.reason },
      },
    });
    return { id: employee.id, archivedAt: employee.archivedAt };
  });
}

export type EmployeeImportPreview = {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  warningRows: number;
  canImport: boolean;
  fileErrors: string[];
  rows: Array<Pick<EmployeeImportRow, 'rowNumber' | 'reference' | 'fullName' | 'telephone' | 'email' | 'department' | 'errors' | 'warnings'>>;
};

export class EmployeeImportValidationError extends Error {
  readonly code = 'EMPLOYEE_IMPORT_VALIDATION_FAILED';
  constructor(readonly preview: EmployeeImportPreview) {
    super(preview.fileErrors.length > 0
      ? 'Fix the CSV file errors before importing; no employees were imported.'
      : `Fix all ${preview.invalidRows} invalid CSV row(s) before importing; no employees were imported.`);
    this.name = 'EmployeeImportValidationError';
  }
}

async function evaluateEmployeeImport(
  db: Pick<Prisma.TransactionClient, 'employee'>,
  companyId: string,
  clientId: string,
  csv: string,
) {
  const parsed = parseEmployeeImportCsv(csv, clientId);
  if (parsed.fileErrors.length > 0) {
    return { rows: parsed.rows, preview: {
      totalRows: 0, validRows: 0, invalidRows: 0, warningRows: 0, canImport: false,
      fileErrors: parsed.fileErrors, rows: [],
    } satisfies EmployeeImportPreview };
  }

  const references = [...new Set(parsed.rows.flatMap((row) => row.data?.reference ? [row.data.reference] : []))];
  const existingReferences = references.length > 0
    ? await db.employee.findMany({ where: { companyId, reference: { in: references } }, select: { reference: true } })
    : [];
  const existingReferenceSet = new Set(existingReferences.flatMap((row: { reference: string | null }) => row.reference ? [row.reference] : []));
  for (const row of parsed.rows) {
    if (row.data?.reference && existingReferenceSet.has(row.data.reference)) {
      row.errors.push(`Reference "${row.data.reference}" already exists in this company.`);
    }
  }

  const names = [...new Set(parsed.rows.flatMap((row) => row.data ? [row.data.fullName] : []))];
  const existingEmployees = names.length > 0
    ? await db.employee.findMany({
      where: {
        companyId, clientId, archivedAt: null,
        OR: names.map((name) => ({ fullName: { equals: name, mode: 'insensitive' as const } })),
      },
      select: { fullName: true, telephone: true, email: true, reference: true },
      take: 5000,
    })
    : [];
  const existingKeys = new Map<string, { fullName: string; reference: string | null }>();
  for (const existing of existingEmployees) {
    const key = employeeLikelyDuplicateKey(existing.fullName, existing.telephone, existing.email);
    if (key && !existingKeys.has(key)) existingKeys.set(key, { fullName: existing.fullName, reference: existing.reference });
  }
  for (const row of parsed.rows) {
    if (!row.data) continue;
    const key = employeeLikelyDuplicateKey(row.data.fullName, row.data.telephone, row.data.email);
    const match = key ? existingKeys.get(key) : undefined;
    if (match) {
      row.warnings.push(`Possible duplicate of the existing employee "${match.fullName}"${match.reference ? ` (${match.reference})` : ''} for this client (same name and contact). The row stays importable and is never merged automatically; check before importing.`);
    }
  }

  const validRows = parsed.rows.filter((row) => row.errors.length === 0 && row.data).length;
  const preview: EmployeeImportPreview = {
    totalRows: parsed.rows.length,
    validRows,
    invalidRows: parsed.rows.length - validRows,
    warningRows: parsed.rows.filter((row) => row.warnings.length > 0).length,
    canImport: parsed.rows.length > 0 && validRows === parsed.rows.length,
    fileErrors: [],
    rows: parsed.rows.map(({ rowNumber, reference, fullName, telephone, email, department, errors, warnings }) => ({
      rowNumber, reference, fullName, telephone, email, department, errors, warnings,
    })),
  };
  return { rows: parsed.rows, preview };
}

const importInputSchema = z.object({
  actorId: z.string().trim().min(1).max(128),
  companyId: companyIdSchema,
  clientId: clientIdSchema,
  csv: z.string().min(1).max(2_000_000),
}).strict();

export async function previewEmployeeImport(input: { actorId: string; companyId: string; clientId: string; csv: string }) {
  const data = importInputSchema.parse(input);
  await accessFor(data.actorId, data.companyId);
  const prisma = getPrisma();
  await requireActiveClient(prisma, data.companyId, data.clientId);
  return (await evaluateEmployeeImport(prisma, data.companyId, data.clientId, data.csv)).preview;
}

export async function importEmployeesFromCsv(input: {
  actorId: string; companyId: string; clientId: string; csv: string; reason: string;
}) {
  const data = importInputSchema.extend({ reason: z.string().trim().min(8).max(500) }).parse(input);
  await accessFor(data.actorId, data.companyId);
  const prisma = getPrisma();
  try {
    return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await requireActiveClient(tx, data.companyId, data.clientId);
      const evaluated = await evaluateEmployeeImport(tx, data.companyId, data.clientId, data.csv);
      if (!evaluated.preview.canImport || evaluated.preview.fileErrors.length > 0) {
        throw new EmployeeImportValidationError(evaluated.preview);
      }
      const imported: Array<{ id: string; fullName: string; reference: string | null }> = [];
      for (const row of evaluated.rows) {
        if (!row.data) throw new Error('Validated import row is missing normalized data.');
        const employee = await tx.employee.create({ data: { ...toEmployeeData({ ...row.data, reason: data.reason }), companyId: data.companyId } });
        await tx.auditEvent.create({
          data: {
            actorId: data.actorId,
            companyId: data.companyId,
            action: 'EMPLOYEE_IMPORTED',
            entityType: 'EMPLOYEE',
            entityId: employee.id,
            summary: { reason: data.reason, source: 'CSV_IMPORT', rowNumber: row.rowNumber, clientId: data.clientId },
          },
        });
        imported.push({ id: employee.id, fullName: employee.fullName, reference: employee.reference });
      }
      return { importedCount: imported.length, employees: imported };
    });
  } catch (error) {
    if (!isUniqueReferenceError(error)) throw error;
    const refreshed = await evaluateEmployeeImport(prisma, data.companyId, data.clientId, data.csv);
    throw new EmployeeImportValidationError(refreshed.preview);
  }
}



/**
 * Manager-only operational export. Restricted fields (home address and
 * accessibility needs) are deliberately excluded; the export is audited.
 */
export async function exportEmployeesCsv(input: { actorId: string; companyId: string; clientId?: string }) {
  const companyId = companyIdSchema.parse(input.companyId);
  const clientId = input.clientId ? clientIdSchema.parse(input.clientId) : undefined;
  await accessFor(input.actorId, companyId);
  const prisma = getPrisma();
  const rows = await prisma.employee.findMany({
    where: { companyId, archivedAt: null, ...(clientId ? { clientId } : {}) },
    orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
    take: 5000,
    select: {
      reference: true, fullName: true, telephone: true, email: true, department: true,
      workLocation: true, shift: true, approvedPickupLocation: true, approvedDropoffLocation: true,
      accountStatus: true, transportEligible: true,
      client: { select: { name: true } },
    },
  });
  const header = ['client', 'reference', 'fullName', 'telephone', 'email', 'department', 'workLocation', 'shift', 'approvedPickupLocation', 'approvedDropoffLocation', 'accountStatus', 'transportEligible'];
  const lines = rows.map((row: {
    reference: string | null; fullName: string; telephone: string | null; email: string | null; department: string | null;
    workLocation: string | null; shift: string | null; approvedPickupLocation: string | null; approvedDropoffLocation: string | null;
    accountStatus: string | null; transportEligible: boolean | null; client: { name: string };
  }) => [
    row.client.name, row.reference, row.fullName, row.telephone, row.email, row.department, row.workLocation,
    row.shift, row.approvedPickupLocation, row.approvedDropoffLocation, row.accountStatus,
    row.transportEligible === null ? '' : row.transportEligible ? 'TRUE' : 'FALSE',
  ].map(csvCell).join(','));
  await prisma.auditEvent.create({
    data: {
      actorId: input.actorId, companyId, action: 'EMPLOYEE_REGISTER_EXPORTED', entityType: 'EMPLOYEE_REGISTER', entityId: companyId,
      summary: { clientId: clientId ?? null, exportedRows: rows.length, restrictedFieldsExcluded: ['homeAddress', 'accessibilityNeeds'] },
    },
  });
  return { filename: 'employees-export.csv', csv: [header.join(','), ...lines].join('\n') };
}
