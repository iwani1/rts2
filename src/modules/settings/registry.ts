import { z } from 'zod';
import { getPrisma } from '@/server/prisma';

export const settingRegistry = [
  { key: 'rental.pricing_models', label: 'Rental pricing models', category: 'rental', blockedFeatures: ['RNT-04', 'FIN-01'] },
  { key: 'rental.distance_time_policy', label: 'Distance and time pricing policy', category: 'rental', blockedFeatures: ['RNT-04', 'FIN-01'] },
  { key: 'finance.tax_lines', label: 'Tax and levy lines', category: 'finance', blockedFeatures: ['RNT-04', 'FIN-01'] },
  { key: 'rental.deposit_policy', label: 'Rental deposit policy', category: 'finance', blockedFeatures: ['RNT-04', 'RNT-05'] },
  { key: 'rental.quote_validity', label: 'Quotation validity', category: 'rental', blockedFeatures: ['RNT-04'] },
  { key: 'rental.cancellation_windows', label: 'Cancellation windows', category: 'rental', blockedFeatures: ['RNT-08'] },
  { key: 'operations.shift_definitions', label: 'Shift definitions', category: 'operations', blockedFeatures: ['EMP-01', 'RTE-01'] },
  { key: 'documents.reminder_lead_times', label: 'Document reminder lead times', category: 'fleet', blockedFeatures: ['FLT-04', 'MNT-01'] },
  { key: 'reports.on_time_threshold', label: 'On-time reporting threshold', category: 'operations', blockedFeatures: ['RPT-01'] },
  { key: 'contracts.inactive_booking_policy', label: 'Booking policy for expired or suspended contracts', category: 'contracts', blockedFeatures: ['BKG-01'] },
  { key: 'trips.boarding_code_policy', label: 'Boarding-code policy', category: 'dispatch', blockedFeatures: ['DSP-03', 'PAX-01'] },
] as const;

export type SettingKey = (typeof settingRegistry)[number]['key'];
const settingKeySchema = z.enum(settingRegistry.map(({ key }) => key) as [SettingKey, ...SettingKey[]]);
const companyIdSchema = z.string().trim().min(1).max(128);
const registryByKey = new Map(settingRegistry.map((definition) => [definition.key, definition]));

export class SettingNotConfiguredError extends Error {
  readonly code = 'SETTING_NOT_CONFIGURED';
  readonly blockedFeatures: readonly string[];

  constructor(key: SettingKey) {
    const definition = registryByKey.get(key);
    super(`Required setting "${key}" has not been configured.`);
    this.name = 'SettingNotConfiguredError';
    this.blockedFeatures = definition?.blockedFeatures ?? [];
  }
}

/** Lists registry status only; this function never creates rows or supplies defaults. */
export async function listCompanySettingStatus(companyIdInput: string) {
  const companyId = companyIdSchema.parse(companyIdInput);
  const rows = await getPrisma().setting.findMany({
    where: { companyId, key: { in: settingRegistry.map(({ key }) => key) } },
    select: { key: true, configured: true, value: true, updatedAt: true },
  });
  const byKey = new Map(rows.map((row) => [row.key, row]));
  return settingRegistry.map((definition) => {
    const row = byKey.get(definition.key);
    const configured = Boolean(row?.configured && row.value !== null);
    return {
      ...definition,
      configured,
      updatedAt: configured ? row.updatedAt : null,
    };
  });
}

/**
 * Reads a required policy value without providing a fallback. Domain services
 * must stop the dependent operation when this throws.
 */
export async function requireCompanySetting(companyIdInput: string, keyInput: string) {
  const companyId = companyIdSchema.parse(companyIdInput);
  const key = settingKeySchema.parse(keyInput);
  const row = await getPrisma().setting.findUnique({
    where: { companyId_key: { companyId, key } },
    select: { value: true, configured: true },
  });
  if (!row?.configured || row.value === null) throw new SettingNotConfiguredError(key);
  return row.value;
}
