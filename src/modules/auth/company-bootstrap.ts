import { z } from 'zod';
import { PermissionDeniedError } from './permissions';
import { getPrisma } from '@/server/prisma';

export const initialOperatorCompanyName = 'Richie Transport Services';
const actorSchema = z.object({
  actorEmail: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
}).strict();

export class CompanyAlreadyProvisionedError extends Error {
  readonly code = 'COMPANY_ALREADY_PROVISIONED';
  constructor() {
    super('A company record already exists; initial company bootstrap is one-time only.');
    this.name = 'CompanyAlreadyProvisionedError';
  }
}

/** Creates the one operator tenant confirmed by management; it creates no settings or business records. */
export async function bootstrapOperatorCompany(input: unknown) {
  const { actorEmail } = actorSchema.parse(input);
  const prisma = getPrisma();
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('richie_tms_company_bootstrap'))`;
    const actor = await tx.user.findUnique({ where: { email: actorEmail }, select: { id: true, status: true } });
    if (!actor || actor.status !== 'ACTIVE') throw new PermissionDeniedError();
    const adminAssignment = await tx.userRoleAssignment.findFirst({
      where: { userId: actor.id, roleCode: 'SUPER_ADMIN', companyId: null, revokedAt: null },
      select: { id: true },
    });
    if (!adminAssignment) throw new PermissionDeniedError();
    if (await tx.company.count() > 0) throw new CompanyAlreadyProvisionedError();

    const company = await tx.company.create({ data: { name: initialOperatorCompanyName } });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        companyId: company.id,
        action: 'OPERATOR_COMPANY_BOOTSTRAPPED',
        entityType: 'COMPANY',
        entityId: company.id,
        summary: { provisioning: 'one_time_local_cli' },
      },
    });
    return { id: company.id, name: company.name };
  });
}
