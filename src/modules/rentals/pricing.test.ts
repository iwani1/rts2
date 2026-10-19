import { describe, expect, it } from 'vitest';
import { InvalidPricingQuantityError, PricingQuantityMissingError, calculateRentalPricingLine } from './pricing';
import type { RentalPricingModel } from '@/modules/settings/registry';

function model(unit: RentalPricingModel['unit'], ratePesewas: number): RentalPricingModel {
  return { code: 'RATE', label: 'Operator rate', unit, ratePesewas };
}

describe('calculateRentalPricingLine', () => {
  it('charges exactly one configured rate per trip', () => {
    expect(calculateRentalPricingLine(model('PER_TRIP', 12345))).toBe(12345);
  });

  it('prorates per-kilometre rates against whole metres and rounds half-up per line', () => {
    expect(calculateRentalPricingLine(model('PER_KM', 10000), { distanceMetres: 500 })).toBe(5000);
    expect(calculateRentalPricingLine(model('PER_KM', 1), { distanceMetres: 499 })).toBe(0);
    expect(calculateRentalPricingLine(model('PER_KM', 1), { distanceMetres: 500 })).toBe(1);
  });

  it('prorates hourly and daily rates over exact minute quantities', () => {
    expect(calculateRentalPricingLine(model('PER_HOUR', 6000), { durationMinutes: 30 })).toBe(3000);
    expect(calculateRentalPricingLine(model('PER_DAY', 144000), { durationMinutes: 720 })).toBe(72000);
    expect(calculateRentalPricingLine(model('PER_HOUR', 1), { durationMinutes: 30 })).toBe(1);
  });

  it('requires the relevant positive whole-number quantity', () => {
    expect(() => calculateRentalPricingLine(model('PER_KM', 100))).toThrow(PricingQuantityMissingError);
    expect(() => calculateRentalPricingLine(model('PER_HOUR', 100))).toThrow(PricingQuantityMissingError);
    for (const bad of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => calculateRentalPricingLine(model('PER_KM', 100), { distanceMetres: bad })).toThrow(InvalidPricingQuantityError);
    }
  });

  it('uses BigInt intermediates and refuses amounts beyond safe integer pesewas', () => {
    expect(calculateRentalPricingLine(model('PER_KM', 2_000_000), { distanceMetres: 4_000_000 })).toBe(8_000_000_000);
    expect(() => calculateRentalPricingLine(model('PER_KM', Number.MAX_SAFE_INTEGER), { distanceMetres: Number.MAX_SAFE_INTEGER })).toThrow(RangeError);
  });
});
