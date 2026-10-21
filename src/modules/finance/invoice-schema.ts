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
}).strict();
