import { z } from 'zod';
import { PermissionDeniedError, resolvePermission } from '@/modules/auth/permissions';
import { getPrisma } from '@/server/prisma';
import { driverInputSchema, driverListQuerySchema, driverRequestSchema } from './driver-schema';

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
