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

export type BufferedConflictResult =
  | { ready: true; conflict: boolean; gapMinutes: number }
  | { ready: false; reason: 'BUFFER_NOT_CONFIGURED' | 'INVALID_BUFFER' | 'INVALID_WINDOW' };

/**
 * Applies the explicit between-job buffer after whichever trip finishes first.
 * It is a pure policy helper only; callers must not use it as a reservation or
 * availability claim until the authoritative resource ledger is implemented.
 */
export function conflictWindowsOverlapWithBuffer(
  first: RentalConflictWindow,
  second: RentalConflictWindow,
  bufferMinutes: number | null,
): BufferedConflictResult {
  if (bufferMinutes === null) return { ready: false, reason: 'BUFFER_NOT_CONFIGURED' };
  if (!Number.isSafeInteger(bufferMinutes) || bufferMinutes < 0 || !Number.isSafeInteger(bufferMinutes * 60_000)) {
    return { ready: false, reason: 'INVALID_BUFFER' };
  }
  const windows = [first, second];
  if (windows.some(({ startAt, endAt }) => !Number.isFinite(startAt.getTime()) || !Number.isFinite(endAt.getTime()) || endAt <= startAt)) {
    return { ready: false, reason: 'INVALID_WINDOW' };
  }
  if (conflictWindowsOverlap(first, second)) return { ready: true, conflict: true, gapMinutes: 0 };
  const [earlier, later] = first.startAt <= second.startAt ? [first, second] : [second, first];
  const gapMs = later.startAt.getTime() - earlier.endAt.getTime();
  const gapMinutes = gapMs / 60_000;
  return { ready: true, conflict: gapMs < bufferMinutes * 60_000, gapMinutes };
}
