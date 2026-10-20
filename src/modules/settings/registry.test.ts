import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getPrisma: vi.fn() }));
vi.mock('@/server/prisma', () => ({ getPrisma: mocks.getPrisma }));

import { CompanyNotFoundError, getCompanyQuoteValidityDays, getCompanyRentalPricingModels, getCompanyTaxLines, getCompanyDepositPolicy, listCompanySettingStatus, requireCompanySetting, setCompanySetting, settingRegistry } from './registry';

function mockTransaction({ admin = true, company = true }: { admin?: boolean; company?: boolean } = {}) {
  const tx = {
    $executeRaw: vi.fn(),
    user: { findUnique: vi.fn().mockResolvedValue({ status: 'ACTIVE' }) },
    userRoleAssignment: { findFirst: vi.fn().mockResolvedValue(admin ? { id: 'global-admin-role' } : null) },
    company: { findUnique: vi.fn().mockResolvedValue(company ? { id: 'company-a' } : null) },
    setting: { upsert: vi.fn().mockResolvedValue({ id: 'setting-1', key: 'finance.tax_lines', updatedAt: new Date('2026-10-18T12:00:00Z') }) },
    auditEvent: { create: vi.fn().mockResolvedValue({}) },
  };
  const transaction = vi.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
  mocks.getPrisma.mockReturnValue({ $transaction: transaction });
  return { tx, transaction };
}

describe('company settings registry', () => {
  beforeEach(() => vi.resetAllMocks());

  it('registers required policy keys without inventing configured defaults', () => {
    const keys = settingRegistry.map(({ key }) => key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(expect.arrayContaining([
      'rental.pricing_models',
      'rental.distance_time_policy',
      'finance.tax_lines',
      'rental.deposit_policy',
      'rental.quote_validity',
      'rental.cancellation_windows',
      'operations.shift_definitions',
      'documents.reminder_lead_times',
      'fleet.vehicle_between_job_buffer_minutes',
      'fleet.driver_between_job_buffer_minutes',
      'reports.on_time_threshold',
      'contracts.inactive_booking_policy',
      'trips.boarding_code_policy',
    ]));
    expect(settingRegistry.every((setting) => !('defaultValue' in setting))).toBe(true);
  });

  it('lists unconfigured settings without creating database rows', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    mocks.getPrisma.mockReturnValue({
      company: { findUnique: vi.fn().mockResolvedValue({ id: 'company-a' }) },
      setting: { findMany },
    });
    const status = await listCompanySettingStatus('company-a');
    expect(status).toHaveLength(settingRegistry.length);
    expect(status.every((setting) => !setting.configured && setting.updatedAt === null)).toBe(true);
    expect(findMany).toHaveBeenCalledOnce();
    expect(findMany.mock.calls[0]?.[0].where.companyId).toBe('company-a');
  });

  it('returns typed buffer settings without inventing defaults', async () => {
    mocks.getPrisma.mockReturnValue({
      company: { findUnique: vi.fn().mockResolvedValue({ id: 'company-a' }) },
      setting: { findMany: vi.fn().mockResolvedValue([
        { key: 'fleet.vehicle_between_job_buffer_minutes', configured: true, value: 0 },
        { key: 'fleet.driver_between_job_buffer_minutes', configured: false, value: 15 },
      ]) },
    });
    const { getCompanyResourceBuffers } = await import('./registry');
    await expect(getCompanyResourceBuffers('company-a')).resolves.toEqual({ vehicleBufferMinutes: 0, driverBufferMinutes: null });
  });

  it('returns quotation validity only when the positive day count was explicitly configured', async () => {
    const findUnique = vi.fn().mockResolvedValue({ configured: true, value: 30 });
    mocks.getPrisma.mockReturnValue({
      company: { findUnique: vi.fn().mockResolvedValue({ id: 'company-a' }) },
      setting: { findUnique },
    });
    await expect(getCompanyQuoteValidityDays('company-a')).resolves.toBe(30);
    expect(findUnique).toHaveBeenCalledWith({
      where: { companyId_key: { companyId: 'company-a', key: 'rental.quote_validity' } },
      select: { value: true, configured: true },
    });
  });

  it('reads operator-entered pricing models without supplying example rates', async () => {
    const models = [{ code: 'EXECUTIVE', label: 'Executive vehicle', unit: 'PER_DAY', ratePesewas: 275000 }];
    mocks.getPrisma.mockReturnValue({
      company: { findUnique: vi.fn().mockResolvedValue({ id: 'company-a' }) },
      setting: { findUnique: vi.fn().mockResolvedValue({ configured: true, value: models }) },
    });
    await expect(getCompanyRentalPricingModels('company-a')).resolves.toEqual(models);
  });

  it('reads an explicitly selected no-deposit policy as configured', async () => {
    mocks.getPrisma.mockReturnValue({
      company: { findUnique: vi.fn().mockResolvedValue({ id: 'company-a' }) },
      setting: { findUnique: vi.fn().mockResolvedValue({ configured: true, value: { kind: 'NOT_REQUIRED' } }) },
    });
    await expect(getCompanyDepositPolicy('company-a')).resolves.toEqual({ kind: 'NOT_REQUIRED' });
  });

  it('rejects incomplete or invalid deposit policies before any database write', async () => {
    mockTransaction();
    const invalid = [
      { kind: 'FIXED_AMOUNT', amountPesewas: 100, collectionStage: 'BEFORE_DEPARTURE', extra: true },
      { kind: 'FIXED_AMOUNT', amountPesewas: 0, collectionStage: 'BEFORE_DEPARTURE' },
      { kind: 'PERCENTAGE', rateBasisPoints: 250, collectionStage: 'UNDEFINED_STAGE' },
      { kind: 'PERCENTAGE', rateBasisPoints: 250 },
      { kind: 'UNKNOWN' },
    ];
    for (const value of invalid) {
      await expect(setCompanySetting({ actorId: 'admin-user', companyId: 'company-a', key: 'rental.deposit_policy', value, reason: 'Owner approved explicit deposit rule' })).rejects.toThrow();
    }
    expect(mocks.getPrisma).not.toHaveBeenCalled();
  });

  it('reads accountant-entered tax lines without inventing a rate or calculation rule', async () => {
    const lines = [{ code: 'VAT', label: 'Accountant-approved VAT', rateBasisPoints: 1500 }];
    mocks.getPrisma.mockReturnValue({
      company: { findUnique: vi.fn().mockResolvedValue({ id: 'company-a' }) },
      setting: { findUnique: vi.fn().mockResolvedValue({ configured: true, value: lines }) },
    });
    await expect(getCompanyTaxLines('company-a')).resolves.toEqual(lines);
  });

  it('rejects malformed tax lines before any database write', async () => {
    mockTransaction();
    const base = { code: 'LEVY', label: 'Approved levy', rateBasisPoints: 250 };
    for (const value of [
      [base, base],
      [{ ...base, rateBasisPoints: -1 }],
      [{ ...base, rateBasisPoints: 1.5 }],
      [{ ...base, extra: true }],
    ]) {
      await expect(setCompanySetting({ actorId: 'admin-user', companyId: 'company-a', key: 'finance.tax_lines', value, reason: 'Accountant approved levy line' })).rejects.toThrow();
    }
    expect(mocks.getPrisma).not.toHaveBeenCalled();
  });

  it('treats a deliberately cleared pricing-model list as unconfigured', async () => {
    mocks.getPrisma.mockReturnValue({
      setting: { findUnique: vi.fn().mockResolvedValue({ configured: true, value: [] }) },
    });
    await expect(requireCompanySetting('company-a', 'rental.pricing_models')).rejects.toMatchObject({ name: 'SettingNotConfiguredError' });
  });

  it('rejects malformed pricing models, duplicate codes, and non-positive rates before any write', async () => {
    mockTransaction();
    const base = { code: 'STANDARD', label: 'Standard vehicle', unit: 'PER_TRIP', ratePesewas: 100 };
    for (const value of [
      [base, base],
      [{ ...base, ratePesewas: 0 }],
      [{ ...base, unit: 'PER_WEEK' }],
      [{ ...base, extra: true }],
    ]) {
      await expect(setCompanySetting({ actorId: 'admin-user', companyId: 'company-a', key: 'rental.pricing_models', value, reason: 'Operator approved pricing model' })).rejects.toThrow();
    }
    expect(mocks.getPrisma).not.toHaveBeenCalled();
  });

  it('marks invalid stored quotation validity as unconfigured instead of reporting it ready', async () => {
    mocks.getPrisma.mockReturnValue({
      company: { findUnique: vi.fn().mockResolvedValue({ id: 'company-a' }) },
      setting: { findMany: vi.fn().mockResolvedValue([{
        key: 'rental.quote_validity', configured: true, value: 0, updatedAt: new Date(),
      }]) },
    });
    const status = await listCompanySettingStatus('company-a');
    expect(status.find((setting) => setting.key === 'rental.quote_validity')).toMatchObject({
      configured: false, updatedAt: null,
    });
  });

  it('treats a row with configured=true but no value as unconfigured', async () => {
    mocks.getPrisma.mockReturnValue({
      company: { findUnique: vi.fn().mockResolvedValue({ id: 'company-a' }) },
      setting: {
        findMany: vi.fn().mockResolvedValue([{
          key: 'finance.tax_lines', configured: true, value: null, updatedAt: new Date(),
        }]),
      },
    });
    const status = await listCompanySettingStatus('company-a');
    expect(status.find((setting) => setting.key === 'finance.tax_lines')).toMatchObject({
      configured: false,
      updatedAt: null,
    });
  });

  it('blocks required business actions when a setting is absent', async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    mocks.getPrisma.mockReturnValue({ setting: { findUnique } });
    await expect(requireCompanySetting('company-a', 'rental.deposit_policy'))
      .rejects.toMatchObject({
        name: 'SettingNotConfiguredError',
        blockedFeatures: ['RNT-04', 'RNT-05'],
      });
  });

  it('blocks rows explicitly marked unconfigured even if a value remains in storage', async () => {
    mocks.getPrisma.mockReturnValue({
      setting: { findUnique: vi.fn().mockResolvedValue({ configured: false, value: { stale: true } }) },
    });
    await expect(requireCompanySetting('company-a', 'finance.tax_lines'))
      .rejects.toBeInstanceOf(Error);
  });

  it('rejects unknown setting keys instead of silently defaulting them', async () => {
    mocks.getPrisma.mockReturnValue({ setting: { findUnique: vi.fn() } });
    await expect(requireCompanySetting('company-a', 'unknown.setting')).rejects.toThrow();
    expect(mocks.getPrisma).not.toHaveBeenCalled();
  });

  it('allows a global Super Administrator to set a registered policy and audits it atomically', async () => {
    const { tx, transaction } = mockTransaction();
    const updated = await setCompanySetting({
      actorId: 'admin-user',
      companyId: 'company-a',
      key: 'finance.tax_lines',
      value: [{ code: 'OWNER_VALUE', label: 'Owner entered value', rateBasisPoints: 0 }],
      reason: 'Owner confirmed tax configuration',
    });
    expect(transaction).toHaveBeenCalledOnce();
    expect(tx.setting.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { companyId_key: { companyId: 'company-a', key: 'finance.tax_lines' } },
      create: expect.objectContaining({ configured: true, updatedById: 'admin-user' }),
      update: expect.objectContaining({ configured: true, updatedById: 'admin-user' }),
    }));
    expect(tx.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        actorId: 'admin-user', companyId: 'company-a', action: 'SETTING_UPDATED',
        summary: { key: 'finance.tax_lines', reason: 'Owner confirmed tax configuration' },
      }),
    }));
    expect(updated).toMatchObject({ key: 'finance.tax_lines', configured: true });
  });

  it('rejects invalid resource buffers and quote-validity periods before any database write', async () => {
    mockTransaction();
    const invalidSettings = [
      { key: 'fleet.vehicle_between_job_buffer_minutes', value: -1 },
      { key: 'fleet.vehicle_between_job_buffer_minutes', value: 2.5 },
      { key: 'rental.quote_validity', value: 0 },
      { key: 'rental.quote_validity', value: 1.5 },
    ];
    for (const setting of invalidSettings) {
      await expect(setCompanySetting({
        actorId: 'admin-user', companyId: 'company-a', ...setting,
        reason: 'Owner confirmed explicit policy value',
      })).rejects.toThrow();
    }
    expect(mocks.getPrisma).not.toHaveBeenCalled();
  });

  it('denies setting changes by a non-Super-Administrator', async () => {
    const { tx } = mockTransaction({ admin: false });
    await expect(setCompanySetting({
      actorId: 'ops-user', companyId: 'company-a', key: 'finance.tax_lines',
      value: [], reason: 'Attempted unapproved policy change',
    })).rejects.toThrow('Access denied');
    expect(tx.setting.upsert).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it('does not store a policy for a nonexistent company', async () => {
    const { tx } = mockTransaction({ company: false });
    await expect(setCompanySetting({
      actorId: 'admin-user', companyId: 'missing-company', key: 'finance.tax_lines',
      value: [], reason: 'Owner confirmed tax configuration',
    })).rejects.toBeInstanceOf(CompanyNotFoundError);
    expect(tx.setting.upsert).not.toHaveBeenCalled();
  });

  it('rejects null and non-JSON policy values instead of marking them configured', async () => {
    mockTransaction();
    await expect(setCompanySetting({
      actorId: 'admin-user', companyId: 'company-a', key: 'finance.tax_lines',
      value: null, reason: 'Owner confirmed tax configuration',
    })).rejects.toThrow();
    expect(mocks.getPrisma).not.toHaveBeenCalled();
  });
});
