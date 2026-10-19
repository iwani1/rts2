import { z } from 'zod';

const text = (max: number) => z.string().trim().max(max).nullable();
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}, 'Use a valid calendar date.').nullable();

const driverFieldsSchema = z.object({
  fullName: z.string().trim().min(1).max(160),
  licenceClass: text(80),
  licenceExpiresAt: dateOnly,
  qualifications: text(1000),
  availability: text(120),
  status: text(80),
}).strict();

export const driverInputSchema = driverFieldsSchema;
export const driverRequestSchema = driverFieldsSchema.extend({
  reason: z.string().trim().min(8).max(500),
}).strict();
export const driverListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  cursor: z.string().min(1).max(128).optional(),
}).strict();

export type DriverInput = z.infer<typeof driverInputSchema>;
