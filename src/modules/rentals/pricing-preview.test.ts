import { describe, expect, it } from 'vitest';
import { buildRentalPricingPreview, InvalidPricingPreviewError, UnknownPricingModelError } from './pricing-preview';
import type { RentalPricingModel } from '@/modules/settings/registry';

const models: RentalPricingModel[] = [
  { code: 'TRIP', label: 'Trip charge', unit: 'PER_TRIP', ratePesewas: 50_000 },
  { code: 'DIST', label: 'Distance charge', unit: 'PER_KM', ratePesewas: 2_500 },
  { code: 'TIME', label: 'Time charge', unit: 'PER_HOUR', ratePesewas: 6_000 },
];

describe('buildRentalPricingPreview', () => {
  it('snapshots selected model details and sums exact pre-tax line amounts', () => {
    expect(buildRentalPricingPreview(models, [
      { lineId: 'line-trip', modelCode: 'TRIP' },
      { lineId: 'line-distance', modelCode: 'DIST', quantity: { distanceMetres: 12_000 } },
      { lineId: 'line-time', modelCode: 'TIME', quantity: { durationMinutes: 90 } },
    ])).toEqual({
      lines: [
        { lineId: 'line-trip', modelCode: 'TRIP', label: 'Trip charge', unit: 'PER_TRIP', ratePesewas: 50_000, quantity: {}, amountPesewas: 50_000 },
        { lineId: 'line-distance', modelCode: 'DIST', label: 'Distance charge', unit: 'PER_KM', ratePesewas: 2_500, quantity: { distanceMetres: 12_000 }, amountPesewas: 30_000 },
        { lineId: 'line-time', modelCode: 'TIME', label: 'Time charge', unit: 'PER_HOUR', ratePesewas: 6_000, quantity: { durationMinutes: 90 }, amountPesewas: 9_000 },
      ],
      subtotalPesewas: 89_000,
    });
  });

  it('rejects empty selections, duplicate line IDs and unconfigured models', () => {
    expect(() => buildRentalPricingPreview(models, [])).toThrow(InvalidPricingPreviewError);
    expect(() => buildRentalPricingPreview(models, [
      { lineId: 'same', modelCode: 'TRIP' }, { lineId: 'same', modelCode: 'TRIP' },
    ])).toThrow(InvalidPricingPreviewError);
    expect(() => buildRentalPricingPreview(models, [{ lineId: 'line-1', modelCode: 'UNKNOWN' }])).toThrow(UnknownPricingModelError);
  });

  it('does not calculate taxes or invent missing variable quantities', () => {
    expect(() => buildRentalPricingPreview(models, [{ lineId: 'distance', modelCode: 'DIST' }])).toThrow();
    const preview = buildRentalPricingPreview(models, [{ lineId: 'trip', modelCode: 'TRIP' }]);
    expect(preview).not.toHaveProperty('taxAmountPesewas');
    expect(preview).not.toHaveProperty('discountPesewas');
  });
});
