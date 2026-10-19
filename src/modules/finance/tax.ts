import type { TaxLine } from '@/modules/settings/registry';

export class InvalidTaxInputError extends Error {
  constructor() {
    super('Tax rate and supplied tax base must be non-negative safe whole-number units.');
    this.name = 'InvalidTaxInputError';
  }
}

/**
 * Computes one percentage tax line against an explicitly supplied integer
 * pesewa base. It deliberately does not determine taxability, compounding,
 * exemptions, ordering, or which subtotal the caller should supply.
 */
export function calculateTaxLineAmount(line: TaxLine, suppliedTaxBasePesewas: number): number {
  if (!Number.isSafeInteger(line.rateBasisPoints) || line.rateBasisPoints < 0
    || !Number.isSafeInteger(suppliedTaxBasePesewas) || suppliedTaxBasePesewas < 0) {
    throw new InvalidTaxInputError();
  }
  const numerator = BigInt(line.rateBasisPoints) * BigInt(suppliedTaxBasePesewas);
  const denominator = BigInt(10_000);
  const rounded = (numerator * BigInt(2) + denominator) / (denominator * BigInt(2));
  const result = Number(rounded);
  if (!Number.isSafeInteger(result)) throw new RangeError('Calculated tax amount exceeds the safe pesewa range.');
  return result;
}
