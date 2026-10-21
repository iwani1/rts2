import { z } from 'zod';

/**
 * FIN-07 window: optional, at most 366 days. Africa/Accra keeps UTC
 * year-round, so the UTC day bounds the service derives from these dates are
 * the local day bounds docs/KPIS.md requires (D-063).
 */
export const financeDashboardQuerySchema = z.object({
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
