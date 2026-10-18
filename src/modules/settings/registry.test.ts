import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getPrisma: vi.fn() }));
vi.mock('@/server/prisma', () => ({ getPrisma: mocks.getPrisma }));

import { listCompanySettingStatus, requireCompanySetting, settingRegistry } from './registry';

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
      'reports.on_time_threshold',
      'contracts.inactive_booking_policy',
      'trips.boarding_code_policy',
    ]));
    expect(settingRegistry.every((setting) => !('defaultValue' in setting))).toBe(true);
  });

  it('lists unconfigured settings without creating database rows', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    mocks.getPrisma.mockReturnValue({ setting: { findMany } });
    const status = await listCompanySettingStatus('company-a');
    expect(status).toHaveLength(settingRegistry.length);
    expect(status.every((setting) => !setting.configured && setting.updatedAt === null)).toBe(true);
    expect(findMany).toHaveBeenCalledOnce();
    expect(findMany.mock.calls[0]?.[0].where.companyId).toBe('company-a');
  });

  it('treats a row with configured=true but no value as unconfigured', async () => {
    mocks.getPrisma.mockReturnValue({
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
});
