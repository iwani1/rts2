import { z } from 'zod';
import { getPrisma } from '@/server/prisma';

const permissionSchema = z.string().regex(/^[a-z_]+:[a-z_]+$/);
const ownerLimitedScopes = new Set([
  'OWN', 'OWN_PROFILE', 'OWN_TRIP_STATUS', 'OWN_INVOICE', 'OWN_DATA',
  'OWN_ACCEPT_DECLINE', 'OWN_CREATE_READ_RESPOND', 'OWN_REPORT',
]);
const assignedLimitedScopes = new Set([
  'ASSIGNED_EXECUTION', 'ASSIGNED_TRIP_EVENT', 'ASSIGNED_MANIFEST_MINIMUM', 'OWN_TRIP_EVENTS',
  'REPORT_UPDATE_ASSIGNED', 'REPORT_DEFECT',
]);

export interface PermissionRequest {
  userId: string;
  companyId?: string;
  permission: string;
  ownerUserId?: string;
  assignedUserId?: string;
}

export interface PermissionDecision {
  allowed: boolean;
  /**
   * Granted scope labels are returned to domain services so their repository
   * queries can apply the approved data filter. A label alone is never a data query.
   */
  scopes: string[];
}

export class PermissionDeniedError extends Error {
  readonly statusCode = 403;
  constructor() {
    super('Access denied');
    this.name = 'PermissionDeniedError';
  }
}

export async function resolvePermission(request: PermissionRequest): Promise<PermissionDecision> {
  const permission = permissionSchema.parse(request.permission);
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { id: request.userId },
    select: { status: true },
  });
  if (!user || user.status !== 'ACTIVE') return { allowed: false, scopes: [] };

  const assignments = await prisma.userRoleAssignment.findMany({
    where: {
      userId: request.userId,
      revokedAt: null,
      OR: [
        ...(request.companyId ? [{ companyId: request.companyId }] : []),
        { companyId: null, roleCode: 'SUPER_ADMIN' },
      ],
    },
    include: {
      role: { include: { grants: { where: { permission } } } },
    },
  });

  const scopes = new Set<string>();
  for (const assignment of assignments) {
    const systemAdmin = assignment.roleCode === 'SUPER_ADMIN' && assignment.companyId === null;
    const companyMembership = Boolean(request.companyId && assignment.companyId === request.companyId);
    if (!systemAdmin && !companyMembership) continue;

    for (const grant of assignment.role.grants) {
      if (grant.scope === 'GLOBAL' && !systemAdmin) continue;
      // The delegated quotation policy is not defined yet; fail closed even for this conditional grant.
      if (grant.scope === 'DELEGATED_APPROVAL') continue;
      if (ownerLimitedScopes.has(grant.scope) && request.ownerUserId !== request.userId) continue;
      if (assignedLimitedScopes.has(grant.scope) && request.assignedUserId !== request.userId) continue;
      scopes.add(grant.scope);
    }
  }
  return { allowed: scopes.size > 0, scopes: [...scopes] };
}

export async function requirePermission(request: PermissionRequest): Promise<PermissionDecision> {
  const decision = await resolvePermission(request);
  if (!decision.allowed) throw new PermissionDeniedError();
  return decision;
}

export async function isActiveSuperAdmin(userId: string): Promise<boolean> {
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { status: true } });
  if (user?.status !== 'ACTIVE') return false;
  const assignment = await prisma.userRoleAssignment.findFirst({
    where: { userId, roleCode: 'SUPER_ADMIN', companyId: null, revokedAt: null },
    select: { id: true },
  });
  return Boolean(assignment);
}

export interface AssignRoleInput {
  actorId: string;
  targetUserId: string;
  roleCode: string;
  companyId?: string;
  reason: string;
}

const assignRoleSchema = z.object({
  actorId: z.string().min(1),
  targetUserId: z.string().min(1),
  roleCode: z.string().regex(/^[A-Z_]+$/),
  companyId: z.string().min(1).optional(),
  reason: z.string().trim().min(8).max(500),
}).refine((input) => input.actorId !== input.targetUserId, {
  message: 'Users may not grant themselves roles',
  path: ['targetUserId'],
});

export async function assignRole(input: AssignRoleInput) {
  const data = assignRoleSchema.parse(input);
  if ((data.roleCode === 'SUPER_ADMIN') !== (data.companyId === undefined)) {
    throw new PermissionDeniedError();
  }
  const prisma = getPrisma();
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('richie_tms_super_admin_roles'))`;
    const actorUser = await tx.user.findUnique({ where: { id: data.actorId }, select: { status: true } });
    if (actorUser?.status !== 'ACTIVE') throw new PermissionDeniedError();
    const actor = await tx.userRoleAssignment.findFirst({
      where: { userId: data.actorId, roleCode: 'SUPER_ADMIN', companyId: null, revokedAt: null },
      select: { id: true },
    });
    if (!actor) throw new PermissionDeniedError();
    const target = await tx.user.findUnique({ where: { id: data.targetUserId }, select: { id: true, status: true } });
    if (!target || target.status !== 'ACTIVE') throw new PermissionDeniedError();
    const role = await tx.role.findUnique({ where: { code: data.roleCode }, select: { code: true } });
    if (!role) throw new PermissionDeniedError();

    const assignment = await tx.userRoleAssignment.create({
      data: {
        userId: target.id,
        companyId: data.companyId,
        roleCode: data.roleCode,
        assignedById: data.actorId,
        reason: data.reason,
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId: data.actorId,
        companyId: data.companyId,
        action: 'ROLE_ASSIGNED',
        entityType: 'USER_ROLE_ASSIGNMENT',
        entityId: assignment.id,
        summary: { roleCode: data.roleCode, targetUserId: target.id, reason: data.reason },
      },
    });
    return assignment;
  });
}

export async function revokeRoleAssignment(input: {
  actorId: string;
  assignmentId: string;
  reason: string;
}) {
  const data = z.object({
    actorId: z.string().min(1),
    assignmentId: z.string().min(1),
    reason: z.string().trim().min(8).max(500),
  }).parse(input);
  const prisma = getPrisma();
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('richie_tms_super_admin_roles'))`;
    const actorUser = await tx.user.findUnique({ where: { id: data.actorId }, select: { status: true } });
    if (actorUser?.status !== 'ACTIVE') throw new PermissionDeniedError();
    const actor = await tx.userRoleAssignment.findFirst({
      where: { userId: data.actorId, roleCode: 'SUPER_ADMIN', companyId: null, revokedAt: null },
      select: { id: true },
    });
    if (!actor) throw new PermissionDeniedError();
    const assignment = await tx.userRoleAssignment.findUnique({ where: { id: data.assignmentId } });
    if (!assignment || assignment.revokedAt || assignment.userId === data.actorId) throw new PermissionDeniedError();
    if (assignment.roleCode === 'SUPER_ADMIN' && assignment.companyId === null) {
      const activeAdmins = await tx.userRoleAssignment.count({
        where: { roleCode: 'SUPER_ADMIN', companyId: null, revokedAt: null },
      });
      if (activeAdmins <= 1) throw new PermissionDeniedError();
    }
    const updated = await tx.userRoleAssignment.update({
      where: { id: assignment.id },
      data: { revokedAt: new Date() },
    });
    await tx.auditEvent.create({
      data: {
        actorId: data.actorId,
        companyId: assignment.companyId,
        action: 'ROLE_REVOKED',
        entityType: 'USER_ROLE_ASSIGNMENT',
        entityId: assignment.id,
        summary: { roleCode: assignment.roleCode, targetUserId: assignment.userId, reason: data.reason },
      },
    });
    return updated;
  });
}

export function isUniqueRoleAssignmentError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'P2002';
}
