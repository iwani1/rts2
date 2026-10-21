import { z } from 'zod';

export const bindUserClientSchema = z.object({
  userId: z.string().trim().min(1).max(128),
  clientId: z.string().trim().min(1).max(128),
  reason: z.string().trim().min(8).max(500),
}).strict();

export const corporateDashboardQuerySchema = z.object({
  fromDate: z.string().date().optional(),
  toDate: z.string().date().optional(),
}).strict().superRefine((data, context) => {
  if (data.fromDate && data.toDate && data.toDate < data.fromDate) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['toDate'], message: 'The end date must be on or after the start date.' });
  }
  if (data.fromDate && data.toDate) {
    const days = (Date.parse(data.toDate) - Date.parse(data.fromDate)) / 86_400_000 + 1;
    if (days > 366) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['toDate'], message: 'Dashboard windows are limited to 366 days.' });
    }
  }
});
