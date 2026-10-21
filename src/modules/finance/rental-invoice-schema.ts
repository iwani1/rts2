import { z } from 'zod';

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}, 'Use a valid calendar date.');

export const rentalInvoiceTransitionSchema = z.object({
  toStatus: z.enum(['ISSUED', 'PAID', 'VOID']),
  reason: z.string().trim().min(8).max(500),
  dueDate: dateOnly.optional().nullable(),
}).strict();

export const rentalInvoicePaymentSchema = z.object({
  amountPesewas: z.number().int().positive().max(2_147_483_647),
  method: z.string().trim().min(1).max(64).nullable().optional(),
  reference: z.string().trim().min(1).max(128).nullable().optional(),
  receivedAt: dateOnly,
  reason: z.string().trim().min(8).max(500),
}).strict();

export const rentalInvoiceListQuerySchema = z.object({
  status: z.enum(['DRAFT', 'ISSUED', 'PAID', 'VOID']).optional(),
  cursor: z.string().trim().min(1).max(128).optional(),
}).strict();
