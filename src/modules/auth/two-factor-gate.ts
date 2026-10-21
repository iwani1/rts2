import { getPrisma } from '@/server/prisma';
import { isActiveSuperAdmin } from './permissions';

export type TwoFactorGate = {
  /** Privileged account (global Super Administrator) that must enrol. */
  required: boolean;
  enabled: boolean;
  mustEnroll: boolean;
};

/**
 * AUTH-06 (D-076): privileged roles must enrol in two-factor
 * authentication. Enforced at sign-in routing and the workspace home
 * (see the limitation recorded in D-076).
 */
export async function getTwoFactorGate(userId: string): Promise<TwoFactorGate> {
  const prisma = getPrisma();
  const [required, user] = await Promise.all([
    isActiveSuperAdmin(userId),
    prisma.user.findUnique({
      where: { id: userId }, select: { twoFactorEnabled: true },
    }),
  ]);
  const enabled = user?.twoFactorEnabled === true;
  return { required, enabled, mustEnroll: required && !enabled };
}
