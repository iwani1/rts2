import { z } from 'zod';

export const corporateInvoiceRequestSchema = z.object({
  contractId: z.string().trim().min(1).max(128),
  periodStart: z.string().date(),
  periodEnd: z.string().date(),
  reason: z.string().trim().min(8).max(500),
}).strict().superRefine((data, context) => {
  if (data.periodEnd < data.periodStart) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['periodEnd'], message: 'The period end must be on or after the period start.' });
  }
});

export const corporateInvoiceListQuerySchema = z.object({
  clientId: z.string().trim().min(1).max(128).optional(),
  cursor: z.string().min(1).max(128).optional(),
  status: z.enum(['DRAFT', 'ISSUED', 'PAID', 'VOID']).optional(),
}).strict();

const invoiceDateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}, 'Use a valid calendar date.');

export const corporateInvoiceTransitionSchema = z.object({
  toStatus: z.enum(['ISSUED', 'PAID', 'VOID']),
  reason: z.string().trim().min(8).max(500),
  dueDate: invoiceDateOnly.optional().nullable(),
}).strict();

export const invoicePaymentRequestSchema = z.object({
  amountPesewas: z.number().int().positive().safe(),
  method: z.string().trim().max(120).nullable(),
  reference: z.string().trim().max(200).nullable(),
  receivedAt: z.string().date(),
  reason: z.string().trim().min(8).max(500),
}).strict();
