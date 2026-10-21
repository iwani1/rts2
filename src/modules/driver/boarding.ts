import { randomInt } from 'node:crypto';
import type { Prisma } from '@prisma/client';

/**
 * DRV-03 (D-073): issue (or re-issue) the per-booking boarding code.
 * Six digits from a cryptographically secure source; expires at the end of
 * the trip day (Africa/Accra keeps UTC); single-use — verification consumes
 * it. Reassignment regenerates the code and clears consumption.
 */
export async function issueBoardingCode(
  tx: Prisma.TransactionClient,
  input: { companyId: string; bookingId: string; tripId: string; tripDate: Date },
): Promise<{ code: string; expiresAt: Date }> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const expiresAt = new Date(input.tripDate);
  expiresAt.setUTCHours(23, 59, 59, 999);
  await tx.bookingBoardingCode.upsert({
    where: { companyId_bookingId: { companyId: input.companyId, bookingId: input.bookingId } },
    create: {
      companyId: input.companyId, bookingId: input.bookingId, tripId: input.tripId,
      code, expiresAt, usedAt: null,
    },
    update: { tripId: input.tripId, code, expiresAt, usedAt: null },
  });
  return { code, expiresAt };
}
