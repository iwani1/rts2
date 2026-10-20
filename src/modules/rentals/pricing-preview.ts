import type { RentalPricingModel } from '@/modules/settings/registry';
import { calculateRentalPricingLine, type RentalPricingQuantity } from './pricing';

export type RentalPricingPreviewInput = {
  lineId: string;
  modelCode: string;
  quantity?: RentalPricingQuantity;
};

export type RentalPricingPreviewLine = {
  lineId: string;
  modelCode: string;
  label: string;
  unit: RentalPricingModel['unit'];
  ratePesewas: number;
  quantity: RentalPricingQuantity;
  amountPesewas: number;
};

export class UnknownPricingModelError extends Error {
  constructor(code: string) {
    super(`Pricing model "${code}" is not configured.`);
    this.name = 'UnknownPricingModelError';
  }
}

export class InvalidPricingPreviewError extends Error {
  constructor(message = 'Pricing preview needs at least one uniquely identified line.') {
    super(message);
    this.name = 'InvalidPricingPreviewError';
  }
}

/** Builds an internal pre-tax line preview from explicit selections and quantities only. */
export function buildRentalPricingPreview(
  configuredModels: readonly RentalPricingModel[],
  requestedLines: readonly RentalPricingPreviewInput[],
) {
  if (requestedLines.length === 0) throw new InvalidPricingPreviewError();
  const knownModels = new Map(configuredModels.map((model) => [model.code, model]));
  const seenIds = new Set<string>();
  let total = BigInt(0);
  const lines = requestedLines.map((requested) => {
    const lineId = requested.lineId.trim();
    if (!lineId || seenIds.has(lineId)) throw new InvalidPricingPreviewError('Pricing line identifiers must be non-empty and unique.');
    seenIds.add(lineId);
    const model = knownModels.get(requested.modelCode);
    if (!model) throw new UnknownPricingModelError(requested.modelCode);
    const amountPesewas = calculateRentalPricingLine(model, requested.quantity);
    total += BigInt(amountPesewas);
    return {
      lineId,
      modelCode: model.code,
      label: model.label,
      unit: model.unit,
      ratePesewas: model.ratePesewas,
      quantity: requested.quantity ?? {},
      amountPesewas,
    } satisfies RentalPricingPreviewLine;
  });
  const subtotalPesewas = Number(total);
  if (!Number.isSafeInteger(subtotalPesewas)) throw new RangeError('Pricing preview subtotal exceeds the safe pesewa range.');
  return { lines, subtotalPesewas };
}
