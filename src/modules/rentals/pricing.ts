import type { RentalPricingModel } from '@/modules/settings/registry';

export type RentalPricingQuantity = {
  /** Operator-entered or otherwise verified distance, expressed in whole metres. */
  distanceMetres?: number;
  /** Explicit request duration, expressed in whole minutes. */
  durationMinutes?: number;
};

export class PricingQuantityMissingError extends Error {
  constructor(unit: RentalPricingModel['unit']) {
    super(`A quantity is required for pricing unit ${unit}.`);
    this.name = 'PricingQuantityMissingError';
  }
}

export class InvalidPricingQuantityError extends Error {
  constructor() {
    super('Pricing quantities must be positive safe whole numbers.');
    this.name = 'InvalidPricingQuantityError';
  }
}

/**
 * Calculates one un-taxed price line in integer GHS pesewas. Variable-unit
 * quantities are prorated over exact metric/time units and rounded half-up once
 * per line. This helper does not select pricing lines or create a quotation.
 */
export function calculateRentalPricingLine(
  model: RentalPricingModel,
  quantity: RentalPricingQuantity = {},
): number {
  let numerator: bigint;
  let denominator: bigint;
  switch (model.unit) {
    case 'PER_TRIP':
      numerator = BigInt(model.ratePesewas);
      denominator = BigInt(1);
      break;
    case 'PER_KM': {
      const metres = quantity.distanceMetres;
      if (metres === undefined) throw new PricingQuantityMissingError(model.unit);
      if (!Number.isSafeInteger(metres) || metres <= 0) throw new InvalidPricingQuantityError();
      numerator = BigInt(model.ratePesewas) * BigInt(metres);
      denominator = BigInt(1000);
      break;
    }
    case 'PER_HOUR': {
      const minutes = quantity.durationMinutes;
      if (minutes === undefined) throw new PricingQuantityMissingError(model.unit);
      if (!Number.isSafeInteger(minutes) || minutes <= 0) throw new InvalidPricingQuantityError();
      numerator = BigInt(model.ratePesewas) * BigInt(minutes);
      denominator = BigInt(60);
      break;
    }
    case 'PER_DAY': {
      const minutes = quantity.durationMinutes;
      if (minutes === undefined) throw new PricingQuantityMissingError(model.unit);
      if (!Number.isSafeInteger(minutes) || minutes <= 0) throw new InvalidPricingQuantityError();
      numerator = BigInt(model.ratePesewas) * BigInt(minutes);
      denominator = BigInt(1440);
      break;
    }
  }

  const two = BigInt(2);
  const rounded = (numerator * two + denominator) / (denominator * two);
  const result = Number(rounded);
  if (!Number.isSafeInteger(result)) throw new RangeError('Calculated line amount exceeds the safe pesewa range.');
  return result;
}
