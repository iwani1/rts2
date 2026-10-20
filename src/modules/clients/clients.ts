import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PermissionDeniedError, resolvePermission } from '@/modules/auth/permissions';
import { getPrisma } from '@/server/prisma';
import { clientInputSchema, clientListQuerySchema, clientRequestSchema } from './client-schema';

const companyIdSchema = z.string().trim().min(1).max(128);
const clientIdSchema = z.string().trim().min(1).max(128);

export class ClientCompanyNotFoundError extends Error {
  readonly code = 'COMPANY_NOT_FOUND';
  constructor() { super('Company not found.'); this.name = 'ClientCompanyNotFoundError'; }
}
export class ClientNotFoundError extends Error {
  readonly code = 'CLIENT_NOT_FOUND';
  constructor() { super('Client not found.'); this.name = 'ClientNotFoundError'; }
}
export class InvalidClientCursorError extends Error {
  readonly code = 'INVALID_CLIENT_CURSOR';
  constructor() { super('Invalid client cursor.'); this.name = 'InvalidClientCursorError'; }
}

export type ClientHistoryEntry = {
  action: string;
  createdAt: Date;
  actorName: string;
  reason: string;
};

export type ClientRecord = {
  id: string;
  name: string;
  registrationDetails: string | null;
  contactPerson: string | null;
  telephone: string | null;
  email: string | null;
  billingAddress: string | null;
  status: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type ClientDbShape = ClientRecord;
function presentClient(row: ClientDbShape): ClientRecord {
  return {
    id: row.id,
    name: row.name,
    registrationDetails: row.registrationDetails,
    contactPerson: row.contactPerson,
    telephone: row.telephone,
    email: row.email,
    billingAddress: row.billingAddress,
    status: row.status,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toClientData(input: z.infer<typeof clientInputSchema>) {
  return {
    name: input.name,
    registrationDetails: input.registrationDetails || null,
    contactPerson: input.contactPerson || null,
    telephone: input.telephone || null,
    email: input.email || null,
    billingAddress: input.billingAddress || null,
    status: input.status || null,
    notes: input.notes || null,
  };
}

async function accessFor(actorId: string, companyId: string) {
  const permission = await resolvePermission({ userId: actorId, companyId, permission: 'client:manage' });
  if (!permission.allowed) throw new PermissionDeniedError();
  const company = await getPrisma().company.findUnique({ where: { id: companyId }, select: { status: true } });
  if (company?.status !== 'ACTIVE') throw new ClientCompanyNotFoundError();
  const canManage = permission.scopes.includes('GLOBAL') || permission.scopes.includes('COMPANY');
  if (!canManage) throw new PermissionDeniedError();
  return { canManage };
}

export async function listClients(input: { actorId: string; companyId: string; search?: string; cursor?: string }): Promise<{
  clients: ClientRecord[]; nextCursor: string | null; canManage: boolean;
}> {
  const companyId = companyIdSchema.parse(input.companyId);
  const query = clientListQuerySchema.parse({ search: input.search, cursor: input.cursor });
  const access = await accessFor(input.actorId, companyId);
  const prisma = getPrisma();
  if (query.cursor) {
    const cursorClient = await prisma.client.findFirst({ where: { id: query.cursor, companyId, archivedAt: null }, select: { id: true } });
    if (!cursorClient) throw new InvalidClientCursorError();
  }
  const where = {
    companyId,
    archivedAt: null,
    ...(query.search ? { OR: [
      { name: { contains: query.search, mode: 'insensitive' as const } },
      { contactPerson: { contains: query.search, mode: 'insensitive' as const } },
      { telephone: { contains: query.search, mode: 'insensitive' as const } },
      { email: { contains: query.search, mode: 'insensitive' as const } },
    ] } : {}),
  };
  const rows = await prisma.client.findMany({
    where,
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    take: 51,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > 50;
  const clients = rows.slice(0, 50).map(presentClient);
  return { clients, nextCursor: hasMore ? clients.at(-1)?.id ?? null : null, canManage: access.canManage };
}

export async function getClient(input: { actorId: string; companyId: string; clientId: string }): Promise<{
  client: ClientRecord; canManage: boolean; history: ClientHistoryEntry[];
}> {
  const companyId = companyIdSchema.parse(input.companyId);
  const clientId = clientIdSchema.parse(input.clientId);
  const access = await accessFor(input.actorId, companyId);
  const prisma = getPrisma();
  const row = await prisma.client.findFirst({ where: { id: clientId, companyId, archivedAt: null } });
  if (!row) throw new ClientNotFoundError();
  const auditRows = await prisma.auditEvent.findMany({
    where: { companyId, entityType: 'CLIENT', entityId: clientId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { action: true, createdAt: true, summary: true, actor: { select: { name: true } } },
  });
  const history: ClientHistoryEntry[] = auditRows.map((event: {
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
  return { client: presentClient(row), canManage: access.canManage, history };
}

export async function createClient(input: unknown, actorId: string, companyIdInput: string) {
  const data = clientRequestSchema.parse(input);
  const companyId = companyIdSchema.parse(companyIdInput);
  await accessFor(actorId, companyId);
  return getPrisma().$transaction(async (tx: Prisma.TransactionClient) => {
    const client = await tx.client.create({ data: { ...toClientData(data), companyId } });
    await tx.auditEvent.create({
      data: {
        actorId, companyId, action: 'CLIENT_CREATED', entityType: 'CLIENT', entityId: client.id,
        summary: { reason: data.reason },
      },
    });
    return presentClient(client);
  });
}

export async function updateClient(input: unknown, actorId: string, companyIdInput: string, clientIdInput: string) {
  const data = clientRequestSchema.parse(input);
  const companyId = companyIdSchema.parse(companyIdInput);
  const clientId = clientIdSchema.parse(clientIdInput);
  await accessFor(actorId, companyId);
  return getPrisma().$transaction(async (tx: Prisma.TransactionClient) => {
    const changed = await tx.client.updateMany({ where: { id: clientId, companyId, archivedAt: null }, data: toClientData(data) });
    if (changed.count !== 1) throw new ClientNotFoundError();
    const client = await tx.client.findUniqueOrThrow({ where: { id: clientId } });
    await tx.auditEvent.create({
      data: {
        actorId, companyId, action: 'CLIENT_UPDATED', entityType: 'CLIENT', entityId: client.id,
        summary: { reason: data.reason },
      },
    });
    return presentClient(client);
  });
}

export async function archiveClient(input: { actorId: string; companyId: string; clientId: string; reason: string }) {
  const data = z.object({
    actorId: z.string().min(1), companyId: companyIdSchema, clientId: clientIdSchema,
    reason: z.string().trim().min(8).max(500),
  }).strict().parse(input);
  await accessFor(data.actorId, data.companyId);
  return getPrisma().$transaction(async (tx: Prisma.TransactionClient) => {
    const changed = await tx.client.updateMany({
      where: { id: data.clientId, companyId: data.companyId, archivedAt: null },
      data: { archivedAt: new Date() },
    });
    if (changed.count !== 1) throw new ClientNotFoundError();
    const client = await tx.client.findUniqueOrThrow({ where: { id: data.clientId }, select: { id: true, archivedAt: true } });
    await tx.auditEvent.create({
      data: {
        actorId: data.actorId, companyId: data.companyId, action: 'CLIENT_ARCHIVED', entityType: 'CLIENT', entityId: client.id,
        summary: { reason: data.reason },
      },
    });
    return { id: client.id, archivedAt: client.archivedAt };
  });
}
