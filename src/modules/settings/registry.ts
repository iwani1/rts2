import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PermissionDeniedError } from '@/modules/auth/permissions';
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
  { key: 'fleet.vehicle_between_job_buffer_minutes', label: 'Vehicle between-job buffer (minutes)', category: 'fleet', blockedFeatures: ['RNT-03'] },
  { key: 'fleet.driver_between_job_buffer_minutes', label: 'Driver between-job buffer (minutes)', category: 'fleet', blockedFeatures: ['RNT-03'] },
  { key: 'reports.on_time_threshold', label: 'On-time reporting threshold', category: 'operations', blockedFeatures: ['RPT-01'] },
  { key: 'contracts.inactive_booking_policy', label: 'Booking policy for expired or suspended contracts', category: 'contracts', blockedFeatures: ['BKG-01'] },
  { key: 'trips.boarding_code_policy', label: 'Boarding-code policy', category: 'dispatch', blockedFeatures: ['DSP-03', 'PAX-01'] },
] as const;

export type SettingKey = (typeof settingRegistry)[number]['key'];
const settingKeySchema = z.enum(settingRegistry.map(({ key }) => key) as [SettingKey, ...SettingKey[]]);
const companyIdSchema = z.string().trim().min(1).max(128);
type SettingJsonValue = string | number | boolean | null | SettingJsonValue[] | { [key: string]: SettingJsonValue };
function isJsonValue(value: unknown): value is SettingJsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value);
    return (prototype === Object.prototype || prototype === null) && Object.values(value).every(isJsonValue);
  }
  return false;
}
const settingValueSchema = z.custom<SettingJsonValue>((value) => isJsonValue(value) && value !== null);
const resourceBufferMinutesSchema = z.number().int().nonnegative().safe();
const quoteValidityDaysSchema = z.number().int().positive().safe();
const quoteValidityKey: SettingKey = 'rental.quote_validity';
const resourceBufferKeys = new Set<SettingKey>([
  'fleet.vehicle_between_job_buffer_minutes',
  'fleet.driver_between_job_buffer_minutes',
]);
const registryByKey = new Map(settingRegistry.map((definition) => [definition.key, definition]));

function validateRegisteredValue(key: SettingKey, value: SettingJsonValue): SettingJsonValue {
  if (resourceBufferKeys.has(key)) return resourceBufferMinutesSchema.parse(value);
  if (key === quoteValidityKey) return quoteValidityDaysSchema.parse(value);
  return value;
}

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
  const prisma = getPrisma();
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
  if (!company) throw new CompanyNotFoundError();
  const rows = await prisma.setting.findMany({
    where: { companyId, key: { in: settingRegistry.map(({ key }) => key) } },
    select: { key: true, configured: true, value: true, updatedAt: true },
  });
  const byKey = new Map(rows.map((row) => [row.key, row]));
  return settingRegistry.map((definition) => {
    const row = byKey.get(definition.key);
    let configured = Boolean(row?.configured && row.value !== null);
    if (configured && row) {
      try {
        if (resourceBufferKeys.has(definition.key)) resourceBufferMinutesSchema.parse(row.value);
        if (definition.key === quoteValidityKey) quoteValidityDaysSchema.parse(row.value);
      } catch { configured = false; }
    }
    return {
      ...definition,
      configured,
      updatedAt: configured && row ? row.updatedAt : null,
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
  if (resourceBufferKeys.has(key)) return resourceBufferMinutesSchema.parse(row.value);
  if (key === quoteValidityKey) return quoteValidityDaysSchema.parse(row.value);
  return row.value;
}

/** Returns the explicitly configured quote-validity duration, or null when unset. */
export async function getCompanyQuoteValidityDays(companyIdInput: string) {
  const companyId = companyIdSchema.parse(companyIdInput);
  const prisma = getPrisma();
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
  if (!company) throw new CompanyNotFoundError();
  const row = await prisma.setting.findUnique({
    where: { companyId_key: { companyId, key: quoteValidityKey } },
    select: { value: true, configured: true },
  });
  if (!row?.configured || row.value === null) return null;
  return quoteValidityDaysSchema.parse(row.value);
}

/** Returns only the two typed buffer values needed by their dedicated admin form. */
export async function getCompanyResourceBuffers(companyIdInput: string) {
  const companyId = companyIdSchema.parse(companyIdInput);
  const prisma = getPrisma();
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
  if (!company) throw new CompanyNotFoundError();
  const rows = await prisma.setting.findMany({
    where: { companyId, key: { in: [...resourceBufferKeys] } },
    select: { key: true, value: true, configured: true },
  });
  const byKey = new Map(rows.map((row) => [row.key, row]));
  function value(key: SettingKey) {
    const row = byKey.get(key);
    if (!row?.configured || row.value === null) return null;
    return resourceBufferMinutesSchema.parse(row.value);
  }
  return {
    vehicleBufferMinutes: value('fleet.vehicle_between_job_buffer_minutes'),
    driverBufferMinutes: value('fleet.driver_between_job_buffer_minutes'),
  };
}

export class CompanyNotFoundError extends Error {
  readonly code = 'COMPANY_NOT_FOUND';
  constructor() {
    super('Company not found.');
    this.name = 'CompanyNotFoundError';
  }
}

const writeSettingSchema = z.object({
  actorId: z.string().min(1),
  companyId: companyIdSchema,
  key: settingKeySchema,
  value: settingValueSchema,
  reason: z.string().trim().min(8).max(500),
}).strict();

/** Only a global Super Administrator can write policy until per-setting grants are approved. */
export async function setCompanySetting(input: unknown) {
  const data = writeSettingSchema.parse(input);
  const value = validateRegisteredValue(data.key, data.value);
  const prisma = getPrisma();
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('richie_tms_super_admin_roles'))`;
    const actor = await tx.user.findUnique({ where: { id: data.actorId }, select: { status: true } });
    const activeAdmin = actor?.status === 'ACTIVE' ? await tx.userRoleAssignment.findFirst({
      where: { userId: data.actorId, roleCode: 'SUPER_ADMIN', companyId: null, revokedAt: null },
      select: { id: true },
    }) : null;
    if (!activeAdmin) throw new PermissionDeniedError();

    const company = await tx.company.findUnique({ where: { id: data.companyId }, select: { id: true } });
    if (!company) throw new CompanyNotFoundError();
    const setting = await tx.setting.upsert({
      where: { companyId_key: { companyId: data.companyId, key: data.key } },
      create: {
        companyId: data.companyId,
        key: data.key,
        value: value as Prisma.InputJsonValue,
        configured: true,
        updatedById: data.actorId,
      },
      update: {
        value: value as Prisma.InputJsonValue,
        configured: true,
        updatedById: data.actorId,
      },
      select: { id: true, key: true, updatedAt: true },
    });
    await tx.auditEvent.create({
      data: {
        actorId: data.actorId,
        companyId: data.companyId,
        action: 'SETTING_UPDATED',
        entityType: 'SETTING',
        entityId: setting.id,
        summary: { key: setting.key, reason: data.reason },
      },
    });
    return { key: setting.key, configured: true, updatedAt: setting.updatedAt };
  });
}
