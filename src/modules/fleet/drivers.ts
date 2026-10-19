import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PermissionDeniedError, resolvePermission } from '@/modules/auth/permissions';
import { getPrisma } from '@/server/prisma';
import { driverInputSchema, driverListQuerySchema, driverRequestSchema } from './driver-schema';
import { createDriverImportNameWarnings, parseDriverImportCsv } from './driver-import';

const companyIdSchema = z.string().trim().min(1).max(128);
const driverIdSchema = z.string().trim().min(1).max(128);

export class DriverCompanyNotFoundError extends Error {
  readonly code = 'COMPANY_NOT_FOUND';
  constructor() { super('Company not found.'); this.name = 'DriverCompanyNotFoundError'; }
}
export class DriverNotFoundError extends Error {
  readonly code = 'DRIVER_NOT_FOUND';
  constructor() { super('Driver not found.'); this.name = 'DriverNotFoundError'; }
}
export class InvalidDriverCursorError extends Error {
  readonly code = 'INVALID_DRIVER_CURSOR';
  constructor() { super('Invalid driver cursor.'); this.name = 'InvalidDriverCursorError'; }
}

export type DriverImportPreview = {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  canImport: boolean;
  fileErrors: string[];
  rows: Array<{
    rowNumber: number; fullName: string; licenceClass: string; licenceExpiresAt: string;
    qualifications: string; availability: string; status: string; errors: string[]; warnings: string[];
  }>;
};

export class DriverImportValidationError extends Error {
  readonly code = 'DRIVER_IMPORT_VALIDATION_FAILED';
  constructor(readonly preview: DriverImportPreview) {
    super(preview.fileErrors.length > 0
      ? 'Fix the driver CSV file errors before importing; no drivers were imported.'
      : `Fix all ${preview.invalidRows} invalid driver CSV row(s) before importing; no drivers were imported.`);
    this.name = 'DriverImportValidationError';
  }
}

export type DriverRecord = {
  id: string; fullName: string; licenceClass: string | null; licenceExpiresAt: string | null;
  qualifications: string | null; availability: string | null; status: string | null;
  createdAt: Date; updatedAt: Date;
};

type DriverDbShape = {
  id: string; fullName: string; createdAt: Date; updatedAt: Date;
  licenceClass?: string | null; licenceExpiresAt?: Date | null; qualifications?: string | null;
  availability?: string | null; status?: string | null;
};

function presentDriver(row: DriverDbShape): DriverRecord {
  return {
    id: row.id,
    fullName: row.fullName,
    licenceClass: row.licenceClass ?? null,
    licenceExpiresAt: row.licenceExpiresAt?.toISOString().slice(0, 10) ?? null,
    qualifications: row.qualifications ?? null,
    availability: row.availability ?? null,
    status: row.status ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toDriverData(input: z.infer<typeof driverInputSchema>) {
  return {
    fullName: input.fullName,
    licenceClass: input.licenceClass || null,
    licenceExpiresAt: input.licenceExpiresAt ? new Date(`${input.licenceExpiresAt}T00:00:00.000Z`) : null,
    qualifications: input.qualifications || null,
    availability: input.availability || null,
    status: input.status || null,
  };
}

async function accessFor(actorId: string, companyId: string) {
  const permission = await resolvePermission({ userId: actorId, companyId, permission: 'driver:manage' });
  if (!permission.allowed) throw new PermissionDeniedError();
  const company = await getPrisma().company.findUnique({ where: { id: companyId }, select: { status: true } });
  if (company?.status !== 'ACTIVE') throw new DriverCompanyNotFoundError();
  const canManage = permission.scopes.includes('GLOBAL') || permission.scopes.includes('COMPANY');
  // Dispatcher field-level projection and driver/user linking remain unresolved; fail closed for non-manager scopes.
  if (!canManage) throw new PermissionDeniedError();
  return { canManage };
}

function evaluateDriverImport(
  parsed: ReturnType<typeof parseDriverImportCsv>, existingNames: readonly string[] = [],
): { rows: ReturnType<typeof parseDriverImportCsv>['rows']; preview: DriverImportPreview } {
  if (parsed.fileErrors.length > 0) return {
    rows: parsed.rows,
    preview: { totalRows: 0, validRows: 0, invalidRows: 0, canImport: false, fileErrors: parsed.fileErrors, rows: [] },
  };
  const validRows = parsed.rows.filter((row) => row.errors.length === 0 && row.data).length;
  const warningsForName = createDriverImportNameWarnings(parsed.rows.map(({ fullName }) => fullName), existingNames);
  return {
    rows: parsed.rows,
    preview: {
      totalRows: parsed.rows.length,
      validRows,
      invalidRows: parsed.rows.length - validRows,
      canImport: parsed.rows.length > 0 && validRows === parsed.rows.length,
      fileErrors: [],
      rows: parsed.rows.map(({ rowNumber, fullName, licenceClass, licenceExpiresAt, qualifications, availability, status, errors }) => ({
        rowNumber, fullName, licenceClass, licenceExpiresAt, qualifications, availability, status, errors,
        warnings: warningsForName(fullName),
      })),
    },
  };
}

async function evaluateDriverImportForCompany(csv: string, companyId: string) {
  const parsed = parseDriverImportCsv(csv);
  if (parsed.fileErrors.length > 0 || !parsed.rows.some(({ fullName }) => fullName.trim().length > 0)) {
    return evaluateDriverImport(parsed);
  }
  const existing: Array<{ fullName: string }> = await getPrisma().driver.findMany({
    where: { companyId }, select: { fullName: true },
  });
  return evaluateDriverImport(parsed, existing.map(({ fullName }) => fullName));
}

export async function previewDriverImport(input: { actorId: string; companyId: string; csv: string }) {
  const data = z.object({
    actorId: z.string().trim().min(1).max(128),
    companyId: companyIdSchema,
    csv: z.string().min(1).max(2_000_000),
  }).strict().parse(input);
  await accessFor(data.actorId, data.companyId);
  return (await evaluateDriverImportForCompany(data.csv, data.companyId)).preview;
}

export async function importDriversFromCsv(input: { actorId: string; companyId: string; csv: string; reason: string }) {
  const data = z.object({
    actorId: z.string().trim().min(1).max(128),
    companyId: companyIdSchema,
    csv: z.string().min(1).max(2_000_000),
    reason: z.string().trim().min(8).max(500),
  }).strict().parse(input);
  await accessFor(data.actorId, data.companyId);
  const evaluated = await evaluateDriverImportForCompany(data.csv, data.companyId);
  const prisma = getPrisma();
  if (!evaluated.preview.canImport) throw new DriverImportValidationError(evaluated.preview);
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const imported: Array<{ id: string; fullName: string }> = [];
    for (const row of evaluated.rows) {
      if (!row.data) throw new Error('Validated driver import row is missing normalized data.');
      const driver = await tx.driver.create({ data: { ...toDriverData(row.data), companyId: data.companyId } });
      await tx.auditEvent.create({
        data: {
          actorId: data.actorId,
          companyId: data.companyId,
          action: 'DRIVER_IMPORTED',
          entityType: 'DRIVER',
          entityId: driver.id,
          summary: { reason: data.reason, source: 'CSV_IMPORT', rowNumber: row.rowNumber },
        },
      });
      imported.push({ id: driver.id, fullName: driver.fullName });
    }
    return { importedCount: imported.length, drivers: imported };
  });
}

export async function listDrivers(input: { actorId: string; companyId: string; search?: string; cursor?: string }): Promise<{
  drivers: DriverRecord[]; nextCursor: string | null; canManage: boolean;
}> {
  const companyId = companyIdSchema.parse(input.companyId);
  const query = driverListQuerySchema.parse({ search: input.search, cursor: input.cursor });
  const access = await accessFor(input.actorId, companyId);
  const prisma = getPrisma();
  if (query.cursor) {
    const cursorDriver = await prisma.driver.findFirst({ where: { id: query.cursor, companyId, archivedAt: null }, select: { id: true } });
    if (!cursorDriver) throw new InvalidDriverCursorError();
  }
  const where = {
    companyId,
    archivedAt: null,
    ...(query.search ? { OR: [
      { fullName: { contains: query.search, mode: 'insensitive' as const } },
      { licenceClass: { contains: query.search, mode: 'insensitive' as const } },
      { qualifications: { contains: query.search, mode: 'insensitive' as const } },
    ] } : {}),
  };
  const pagination = {
    where,
    orderBy: [{ fullName: 'asc' as const }, { id: 'asc' as const }],
    take: 51,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  };
  const rows = await prisma.driver.findMany(pagination);
  const hasMore = rows.length > 50;
  const drivers = rows.slice(0, 50).map((row) => presentDriver(row));
  return { drivers, nextCursor: hasMore ? drivers.at(-1)?.id ?? null : null, canManage: access.canManage };
}

export async function getDriver(input: { actorId: string; companyId: string; driverId: string }) {
  const companyId = companyIdSchema.parse(input.companyId);
  const driverId = driverIdSchema.parse(input.driverId);
  const access = await accessFor(input.actorId, companyId);
  const prisma = getPrisma();
  const row = await prisma.driver.findFirst({ where: { id: driverId, companyId, archivedAt: null } });
  if (!row) throw new DriverNotFoundError();
  return { driver: presentDriver(row), canManage: access.canManage };
}

export async function createDriver(input: unknown, actorId: string, companyIdInput: string) {
  const data = driverRequestSchema.parse(input);
  const companyId = companyIdSchema.parse(companyIdInput);
  const access = await accessFor(actorId, companyId);
  if (!access.canManage) throw new PermissionDeniedError();
  const prisma = getPrisma();
  return prisma.$transaction(async (tx) => {
    const driver = await tx.driver.create({ data: { ...toDriverData(data), companyId } });
    await tx.auditEvent.create({
      data: {
        actorId, companyId, action: 'DRIVER_CREATED', entityType: 'DRIVER', entityId: driver.id,
        summary: { reason: data.reason },
      },
    });
    return presentDriver(driver);
  });
}

export async function updateDriver(input: unknown, actorId: string, companyIdInput: string, driverIdInput: string) {
  const data = driverRequestSchema.parse(input);
  const companyId = companyIdSchema.parse(companyIdInput);
  const driverId = driverIdSchema.parse(driverIdInput);
  const access = await accessFor(actorId, companyId);
  if (!access.canManage) throw new PermissionDeniedError();
  const prisma = getPrisma();
  return prisma.$transaction(async (tx) => {
    const changed = await tx.driver.updateMany({ where: { id: driverId, companyId, archivedAt: null }, data: toDriverData(data) });
    if (changed.count !== 1) throw new DriverNotFoundError();
    const driver = await tx.driver.findUniqueOrThrow({ where: { id: driverId } });
    await tx.auditEvent.create({
      data: {
        actorId, companyId, action: 'DRIVER_UPDATED', entityType: 'DRIVER', entityId: driver.id,
        summary: { reason: data.reason },
      },
    });
    return presentDriver(driver);
  });
}

export async function archiveDriver(input: { actorId: string; companyId: string; driverId: string; reason: string }) {
  const data = z.object({
    actorId: z.string().min(1), companyId: companyIdSchema, driverId: driverIdSchema,
    reason: z.string().trim().min(8).max(500),
  }).strict().parse(input);
  const access = await accessFor(data.actorId, data.companyId);
  if (!access.canManage) throw new PermissionDeniedError();
  const prisma = getPrisma();
  return prisma.$transaction(async (tx) => {
    const changed = await tx.driver.updateMany({
      where: { id: data.driverId, companyId: data.companyId, archivedAt: null },
      data: { archivedAt: new Date() },
    });
    if (changed.count !== 1) throw new DriverNotFoundError();
    const driver = await tx.driver.findUniqueOrThrow({ where: { id: data.driverId }, select: { id: true, archivedAt: true } });
    await tx.auditEvent.create({
      data: {
        actorId: data.actorId, companyId: data.companyId, action: 'DRIVER_ARCHIVED', entityType: 'DRIVER', entityId: driver.id,
        summary: { reason: data.reason },
      },
    });
    return { id: driver.id, archivedAt: driver.archivedAt };
  });
}
