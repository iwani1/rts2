import { z } from 'zod';
import { PermissionDeniedError, resolvePermission } from '@/modules/auth/permissions';
import { getPrisma } from '@/server/prisma';

export const routeCompanyIdSchema = z.string().trim().min(1).max(128);
export const routeIdSchema = z.string().trim().min(1).max(128);

export class RouteCompanyNotFoundError extends Error {
  readonly code = 'COMPANY_NOT_FOUND';
  constructor() { super('Company not found.'); this.name = 'RouteCompanyNotFoundError'; }
}

/**
 * Locations, routes and schedules are managed under `route:manage`.
 * Company-scoped grants (Super Administrator, Operations Manager, Dispatcher)
 * may manage them; narrower own-client/assigned scopes fail closed until
 * their projections are approved.
 */
export async function routeAccessFor(actorId: string, companyId: string) {
  const permission = await resolvePermission({ userId: actorId, companyId, permission: 'route:manage' });
  if (!permission.allowed) throw new PermissionDeniedError();
  const company = await getPrisma().company.findUnique({ where: { id: companyId }, select: { status: true } });
  if (company?.status !== 'ACTIVE') throw new RouteCompanyNotFoundError();
  const canManage = permission.scopes.includes('GLOBAL') || permission.scopes.includes('COMPANY');
  if (!canManage) throw new PermissionDeniedError();
  return { canManage };
}
