import { z } from 'zod';

const optionalText = (max: number) => z.string().trim().max(max).nullable();
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}, 'Use a valid calendar date.').nullable();
const positiveSeatCount = z.number().int().min(1).max(10000).nullable();
const odometerValue = z.number().finite().min(0).max(9999999999.99).refine(
  (value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-7,
  'Odometer reading supports at most two decimal places.',
).nullable();

const vehicleFieldsSchema = z.object({
  registrationNumber: z.string().trim().min(1).max(40),
  make: z.string().trim().min(1).max(80),
  model: z.string().trim().min(1).max(80),
  category: z.string().trim().min(1).max(80),
  seatCount: positiveSeatCount,
  fuelType: optionalText(60),
  ownershipType: optionalText(60),
  odometerValue,
  odometerUnit: z.enum(['KM', 'MILE']).nullable(),
  insuranceExpiresAt: dateOnly,
  roadworthinessExpiresAt: dateOnly,
  registrationExpiresAt: dateOnly,
  nextServiceAt: dateOnly,
  usualDriverId: z.string().trim().min(1).max(128).nullable().optional(),
  notes: optionalText(2000),
}).strict();

function validateOdometerPair<T extends { odometerValue: number | null; odometerUnit: 'KM' | 'MILE' | null }>(data: T, context: z.RefinementCtx) {
  if ((data.odometerValue === null) !== (data.odometerUnit === null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['odometerUnit'], message: 'Enter both an odometer reading and its unit, or leave both blank.' });
  }
}

export const vehicleInputSchema = vehicleFieldsSchema.superRefine(validateOdometerPair);
export const vehicleRequestSchema = vehicleFieldsSchema.extend({
  reason: z.string().trim().min(8).max(500),
}).strict().superRefine(validateOdometerPair);

export const vehicleListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  cursor: z.string().min(1).max(128).optional(),
}).strict();

export type VehicleInput = z.infer<typeof vehicleInputSchema>;
