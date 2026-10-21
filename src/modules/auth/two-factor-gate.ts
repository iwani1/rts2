import { getPrisma } from '@/server/prisma';

export type TwoFactorGate = {
  /** A role is currently required to enrol (suspended by D-080). */
  required: boolean;
  enabled: boolean;
  mustEnroll: boolean;
}

/**
 * AUTH-06 (D-076) built this gate so privileged roles must enrol in
 * two-factor authentication. D-080 (owner direction, 2026-10-21)
 * suspends that requirement for now: enrolment stays available to
 * everyone from Account security, and anyone already enrolled still
 * gets the sign-in challenge, but no role is forced to enrol.
 * Reinstate by restoring `required` (global Super Administrator) here;
 * every caller already honours `mustEnroll`.
 */
export async function getTwoFactorGate(userId: string): Promise<TwoFactorGate> {
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { id: userId }, select: { twoFactorEnabled: true },
  });
  const enabled = user?.twoFactorEnabled === true;
  return { required: false, enabled, mustEnroll: false };
}
