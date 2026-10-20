import { describe, expect, it } from 'vitest';
import { InvalidTaxInputError, calculateTaxLineAmount } from './tax';
import type { TaxLine } from '@/modules/settings/registry';

const line = (rateBasisPoints: number): TaxLine => ({ code: 'TAX', label: 'Configured tax line', rateBasisPoints });

describe('calculateTaxLineAmount', () => {
  it('calculates a rate against the explicitly supplied base in pesewas', () => {
    expect(calculateTaxLineAmount(line(1500), 100_000)).toBe(15_000);
  });

  it('rounds half-up to the nearest pesewa and supports an explicit zero rate', () => {
    expect(calculateTaxLineAmount(line(5000), 1)).toBe(1);
    expect(calculateTaxLineAmount(line(4999), 1)).toBe(0);
    expect(calculateTaxLineAmount(line(0), 99_999)).toBe(0);
  });

  it('rejects negative, fractional, unsafe, or overflow inputs', () => {
    expect(() => calculateTaxLineAmount(line(-1), 100)).toThrow(InvalidTaxInputError);
    expect(() => calculateTaxLineAmount(line(100), -1)).toThrow(InvalidTaxInputError);
    expect(() => calculateTaxLineAmount(line(1.5), 100)).toThrow(InvalidTaxInputError);
    expect(() => calculateTaxLineAmount(line(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER)).toThrow(RangeError);
  });
});
