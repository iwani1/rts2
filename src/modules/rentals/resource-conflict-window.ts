import { z } from 'zod';

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}, 'Use a valid calendar date.');
const timeOfDay = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Use a valid 24-hour time.');
const windowInputSchema = z.object({
  serviceDate: dateOnly.nullable(),
  departureTime: timeOfDay.nullable(),
  returnTime: timeOfDay.nullable(),
  returnDate: dateOnly.nullable().optional(),
  durationMinutes: z.number().int().positive().nullable(),
}).strict();

export type RentalConflictWindow = { startAt: Date; endAt: Date };
export type RentalConflictWindowResult =
  | { ready: true; window: RentalConflictWindow }
  | { ready: false; reason: 'MISSING_START' | 'MISSING_RETURN' | 'EXPLICIT_RETURN_DATE_REQUIRED' | 'RETURN_NOT_AFTER_DEPARTURE' };

function localDateTime(date: string, time: string) {
  // Africa/Accra is UTC+00:00; Date.UTC preserves the approved local wall-clock values
  // without depending on the machine's timezone.
  return new Date(`${date}T${time}:00.000Z`);
}

/**
 * Builds only the raw trip interval approved by D-027. It does not check resource
 * assignments, apply a buffer, or authorize any reservation. Callers must keep
 * resource commitment disabled until all remaining RNT-03 rules are configured.
 */
export function buildRentalConflictWindow(input: unknown): RentalConflictWindowResult {
  const data = windowInputSchema.parse(input);
  if (!data.serviceDate || !data.departureTime) return { ready: false, reason: 'MISSING_START' };
  const startAt = localDateTime(data.serviceDate, data.departureTime);

  let endAt: Date;
  if (data.returnTime) {
    const returnDate = data.returnDate ?? data.serviceDate;
    if (!data.returnDate && data.returnTime < data.departureTime) {
      return { ready: false, reason: 'EXPLICIT_RETURN_DATE_REQUIRED' };
    }
    endAt = localDateTime(returnDate, data.returnTime);
  } else if (data.durationMinutes !== null) {
    endAt = new Date(startAt.getTime() + data.durationMinutes * 60_000);
  } else {
    return { ready: false, reason: 'MISSING_RETURN' };
  }

  if (endAt.getTime() <= startAt.getTime()) return { ready: false, reason: 'RETURN_NOT_AFTER_DEPARTURE' };
  return { ready: true, window: { startAt, endAt } };
}

/** Half-open interval overlap; adjacent trips do not overlap absent an approved buffer. */
export function conflictWindowsOverlap(first: RentalConflictWindow, second: RentalConflictWindow) {
  return first.startAt < second.endAt && second.startAt < first.endAt;
}
