import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getPrisma: vi.fn(), resolvePermission: vi.fn() }));
vi.mock('@/server/prisma', () => ({ getPrisma: mocks.getPrisma }));
vi.mock('@/modules/auth/permissions', () => ({
  PermissionDeniedError: class PermissionDeniedError extends Error { constructor() { super('Access denied'); } },
  resolvePermission: mocks.resolvePermission,
}));

import { createRentalPricingWorksheet } from './pricing-worksheets';

function fixture({ allowed = true, status = 'Under Review', latestVersion = 1 } = {}) {
  const tx = {
    company: { findUnique: vi.fn().mockResolvedValue({ status: 'ACTIVE' }) },
    $queryRaw: vi.fn().mockResolvedValue([{ id: 'request-1' }]),
    rentalRequest: { findFirst: vi.fn().mockResolvedValue({
      id: 'request-1', status, serviceDate: new Date('2026-10-20T00:00:00Z'), departureTime: '08:00', returnDate: null, returnTime: null, durationMinutes: 90,
    }) },
    setting: { findUnique: vi.fn().mockResolvedValue({ configured: true, value: [
      { code: 'HOUR', label: 'Hourly service', unit: 'PER_HOUR', ratePesewas: 6000 },
    ] }) },
    rentalPricingWorksheet: {
      findFirst: vi.fn().mockResolvedValue(latestVersion ? { version: latestVersion } : null),
      create: vi.fn().mockResolvedValue({ id: 'worksheet-2', version: latestVersion + 1, preTaxSubtotalPesewas: BigInt(9000), createdAt: new Date('2026-10-20T10:00:00Z') }),
    },
    auditEvent: { create: vi.fn().mockResolvedValue({}) },
  };
  const transaction = vi.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
  mocks.getPrisma.mockReturnValue({ $transaction: transaction });
  mocks.resolvePermission.mockResolvedValue({ allowed, scopes: allowed ? ['COMPANY'] : [] });
  return { tx, transaction };
}

const input = { actorId: 'manager-1', companyId: 'company-1', requestId: 'request-1', modelCodes: ['HOUR'], reason: 'Prepared internal estimate for review' };

describe('createRentalPricingWorksheet', () => {
  beforeEach(() => vi.resetAllMocks());

  it('creates an immutable next version under a request lock and audits without storing rate details in the audit', async () => {
    const { tx, transaction } = fixture();
    const result = await createRentalPricingWorksheet(input);
    expect(transaction).toHaveBeenCalledOnce();
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.rentalPricingWorksheet.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ requestId: 'request-1', version: 2, preTaxSubtotalPesewas: BigInt(9000), reason: input.reason }),
    }));
    expect(tx.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'RENTAL_PRICING_WORKSHEET_CREATED',
        summary: { requestId: 'request-1', version: 2, lineCount: 1, reason: input.reason },
      }),
    }));
    expect(result).toMatchObject({ id: 'worksheet-2', version: 2, preTaxSubtotalPesewas: 9000 });
    expect(result).not.toHaveProperty('quoteNumber');
  });

  it('denies unauthorized users before opening a transaction', async () => {
    const { transaction } = fixture({ allowed: false });
    await expect(createRentalPricingWorksheet(input)).rejects.toThrow('Access denied');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('blocks a request no longer Under Review without creating a worksheet', async () => {
    const { tx } = fixture({ status: 'Declined' });
    await expect(createRentalPricingWorksheet(input)).rejects.toThrow('not available for this request');
    expect(tx.rentalPricingWorksheet.create).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });
});
