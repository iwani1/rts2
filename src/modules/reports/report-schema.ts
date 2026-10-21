import { z } from 'zod';

const idSchema = z.string().trim().min(1).max(128).optional();

/**
 * RPT-04 shared report filters. The window is optional (open-ended bounds are
 * allowed) but a closed window may span at most 366 days, matching the other
 * dashboards. Africa/Accra keeps UTC year-round, so the UTC day bounds the
 * services derive are the local day bounds docs/KPIS.md requires.
 */
export const reportQuerySchema = z.object({
  fromDate: z.string().date().optional(),
  toDate: z.string().date().optional(),
  clientId: idSchema,
  routeId: idSchema,
  driverId: idSchema,
  vehicleId: idSchema,
  serviceType: z.string().trim().min(1).max(120).optional(),
  status: z.string().trim().min(1).max(60).optional(),
}).strict().superRefine((data, context) => {
  if (data.fromDate && data.toDate && data.toDate < data.fromDate) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['toDate'], message: 'The end date must be on or after the start date.' });
  }
  if (data.fromDate && data.toDate) {
    const days = (Date.parse(data.toDate) - Date.parse(data.fromDate)) / 86_400_000 + 1;
    if (days > 366) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['toDate'], message: 'Report windows are limited to 366 days.' });
    }
  }
});

export type ReportQuery = z.infer<typeof reportQuerySchema>;

export function reportWindow(query: ReportQuery) {
  const start = query.fromDate ? new Date(`${query.fromDate}T00:00:00.000Z`) : undefined;
  const endExclusive = query.toDate
    ? new Date(new Date(`${query.toDate}T00:00:00.000Z`).getTime() + 86_400_000)
    : undefined;
  return {
    start,
    endExclusive,
    dateTimeFilter: start || endExclusive ? {
      ...(start ? { gte: start } : {}),
      ...(endExclusive ? { lt: endExclusive } : {}),
    } : undefined,
    dateFilter: start || endExclusive ? {
      ...(start ? { gte: start } : {}),
      ...(endExclusive ? { lt: endExclusive } : {}),
    } : undefined,
  };
}

/** Extracts the RPT-04 filters from an API route URL's query string. */
export function reportFiltersFrom(url: URL) {
  const param = (name: string) => url.searchParams.get(name) ?? undefined;
  return {
    fromDate: param('fromDate'), toDate: param('toDate'),
    clientId: param('clientId'), routeId: param('routeId'),
    driverId: param('driverId'), vehicleId: param('vehicleId'),
    serviceType: param('serviceType'), status: param('status'),
  };
}
