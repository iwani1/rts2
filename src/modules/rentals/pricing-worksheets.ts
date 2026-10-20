import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PermissionDeniedError, resolvePermission } from '@/modules/auth/permissions';
import { getPrisma } from '@/server/prisma';
import { rentalPricingModelsSchema } from '@/modules/settings/registry';
import { buildRentalPricingPreview } from './pricing-preview';
import { resolveRequestedDuration } from './pricing-quantities';

const companyIdSchema = z.string().trim().min(1).max(128);
const requestIdSchema = z.string().trim().min(1).max(128);
const createSchema = z.object({
  actorId: z.string().trim().min(1).max(128),
  companyId: companyIdSchema,
  requestId: requestIdSchema,
  modelCodes: z.array(z.string().trim().regex(/^[A-Z0-9_-]{2,32}$/)).min(1).max(50),
  distanceMetres: z.number().int().positive().safe().optional(),
  reason: z.string().trim().min(8).max(500),
}).strict().refine(({ modelCodes }) => new Set(modelCodes).size === modelCodes.length, {
  message: 'Choose each pricing model only once.', path: ['modelCodes'],
});

export class PricingWorksheetUnavailableError extends Error {
  constructor() { super('Rental pricing worksheet is not available for this request.'); this.name = 'PricingWorksheetUnavailableError'; }
}
export class PricingWorksheetPolicyError extends Error {
  constructor(message: string) { super(message); this.name = 'PricingWorksheetPolicyError'; }
}

type WorksheetPersistence = {
  rentalPricingWorksheet: {
    findFirst(args: unknown): Promise<{ version: number } | null>;
    findMany(args: unknown): Promise<Array<{ id: string; version: number; lines: unknown; preTaxSubtotalPesewas: bigint; reason: string; createdAt: Date }>>;
    create(args: unknown): Promise<{ id: string; version: number; preTaxSubtotalPesewas: bigint; createdAt: Date }>;
  };
};

/** Creates an immutable, versioned internal worksheet. It is not a quotation. */
export async function listRentalPricingWorksheets(actorIdInput: string, companyIdInput: string, requestIdInput: string) {
  const actorId = z.string().trim().min(1).max(128).parse(actorIdInput);
  const companyId = companyIdSchema.parse(companyIdInput);
  const requestId = requestIdSchema.parse(requestIdInput);
  const access = await resolvePermission({ userId: actorId, companyId, permission: 'rental:manage' });
  if (!access.allowed) throw new PermissionDeniedError();
  const prisma = getPrisma();
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { status: true } });
  if (!company || company.status !== 'ACTIVE') throw new PricingWorksheetUnavailableError();
  const request = await prisma.rentalRequest.findFirst({ where: { id: requestId, companyId }, select: { status: true } });
  if (!request || request.status !== 'Under Review') throw new PricingWorksheetUnavailableError();
  const store = prisma as unknown as WorksheetPersistence;
  const rows = await store.rentalPricingWorksheet.findMany({
    where: { companyId, requestId }, orderBy: { version: 'desc' }, take: 20,
  });
  return rows.map((row) => ({ ...row, preTaxSubtotalPesewas: Number(row.preTaxSubtotalPesewas) }));
}

export async function createRentalPricingWorksheet(input: unknown) {
  const data = createSchema.parse(input);
  const access = await resolvePermission({ userId: data.actorId, companyId: data.companyId, permission: 'rental:manage' });
  if (!access.allowed) throw new PermissionDeniedError();
  const prisma = getPrisma();

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const worksheetStore = tx as unknown as WorksheetPersistence;
    const company = await tx.company.findUnique({ where: { id: data.companyId }, select: { status: true } });
    if (company?.status !== 'ACTIVE') throw new PricingWorksheetUnavailableError();
    const lockedRows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "RentalRequest"
      WHERE "companyId" = ${data.companyId} AND "id" = ${data.requestId}
      FOR UPDATE
    `;
    if (lockedRows.length === 0) throw new PricingWorksheetUnavailableError();
    const request = await tx.rentalRequest.findFirst({
      where: { id: data.requestId, companyId: data.companyId },
      select: { id: true, status: true, serviceDate: true, departureTime: true, returnDate: true, returnTime: true, durationMinutes: true },
    });
    if (!request || request.status !== 'Under Review') throw new PricingWorksheetUnavailableError();

    const setting = await tx.setting.findUnique({
      where: { companyId_key: { companyId: data.companyId, key: 'rental.pricing_models' } },
      select: { configured: true, value: true },
    }) as { configured: boolean; value: unknown } | null;
    if (!setting?.configured || setting.value === null) throw new PricingWorksheetPolicyError('Rental pricing models are not configured.');
    const models = rentalPricingModelsSchema.parse(setting.value);
    if (models.length === 0) throw new PricingWorksheetPolicyError('Rental pricing models are not configured.');

    const selected = data.modelCodes.map((code) => {
      const model = models.find((candidate) => candidate.code === code);
      if (!model) throw new PricingWorksheetPolicyError(`Pricing model "${code}" is not configured.`);
      return model;
    });
    const needsDistance = selected.some((model) => model.unit === 'PER_KM');
    if (!needsDistance && data.distanceMetres !== undefined) throw new PricingWorksheetPolicyError('Distance is accepted only when a per-kilometre line is selected.');
    const needsDuration = selected.some((model) => model.unit === 'PER_HOUR' || model.unit === 'PER_DAY');
    const duration = needsDuration ? resolveRequestedDuration(request) : null;
    if (duration && !duration.ready) throw new PricingWorksheetPolicyError(`Time-priced line blocked: ${duration.reason.toLowerCase().replaceAll('_', ' ')}.`);
    const lines = selected.map((model) => ({
      lineId: model.code,
      modelCode: model.code,
      quantity: {
        ...(model.unit === 'PER_KM' ? { distanceMetres: data.distanceMetres } : {}),
        ...(model.unit === 'PER_HOUR' || model.unit === 'PER_DAY' ? { durationMinutes: duration?.ready ? duration.durationMinutes : undefined } : {}),
      },
    }));
    const preview = buildRentalPricingPreview(models, lines);
    const latest = await worksheetStore.rentalPricingWorksheet.findFirst({
      where: { companyId: data.companyId, requestId: data.requestId },
      orderBy: { version: 'desc' }, select: { version: true },
    });
    const version = (latest?.version ?? 0) + 1;
    const worksheet = await worksheetStore.rentalPricingWorksheet.create({
      data: {
        companyId: data.companyId,
        requestId: data.requestId,
        version,
        createdById: data.actorId,
        lines: preview.lines,
        preTaxSubtotalPesewas: BigInt(preview.subtotalPesewas),
        distanceMetres: data.distanceMetres ?? null,
        durationMinutes: duration?.ready ? duration.durationMinutes : null,
        reason: data.reason,
      },
      select: { id: true, version: true, preTaxSubtotalPesewas: true, createdAt: true },
    });
    await tx.auditEvent.create({
      data: {
        actorId: data.actorId,
        companyId: data.companyId,
        action: 'RENTAL_PRICING_WORKSHEET_CREATED',
        entityType: 'RENTAL_PRICING_WORKSHEET',
        entityId: worksheet.id,
        summary: { requestId: data.requestId, version, lineCount: preview.lines.length, reason: data.reason },
      },
    });
    return { ...worksheet, preTaxSubtotalPesewas: Number(worksheet.preTaxSubtotalPesewas), lines: preview.lines };
  });
}
