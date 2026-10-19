import { buildRentalConflictWindow } from './resource-conflict-window';

export type RentalRequestTimeInput = {
  serviceDate: Date | string | null;
  departureTime: string | null;
  returnDate?: Date | string | null;
  returnTime: string | null;
  durationMinutes: number | null;
};

export type RequestedDurationResult =
  | { ready: true; durationMinutes: number; source: 'EXPLICIT_DURATION' | 'SCHEDULED_INTERVAL' }
  | { ready: false; reason: 'MISSING_DURATION' | 'INVALID_TIME_DATA' | 'EXPLICIT_RETURN_DATE_REQUIRED' | 'DURATION_MISMATCH' };

function dateOnly(value: Date | string | null | undefined) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value ?? null;
}

/**
 * Resolves the requested trip duration for a future time-priced quote. When a
 * request records both duration and return time, they must describe the same
 * interval; ambiguity is reported rather than silently choosing one.
 */
export function resolveRequestedDuration(input: RentalRequestTimeInput): RequestedDurationResult {
  if (input.durationMinutes !== null && (!Number.isSafeInteger(input.durationMinutes) || input.durationMinutes <= 0)) {
    return { ready: false, reason: 'INVALID_TIME_DATA' };
  }

  const hasScheduledReturn = input.returnTime !== null;
  if (!hasScheduledReturn) {
    return input.durationMinutes === null
      ? { ready: false, reason: 'MISSING_DURATION' }
      : { ready: true, durationMinutes: input.durationMinutes, source: 'EXPLICIT_DURATION' };
  }

  try {
    const result = buildRentalConflictWindow({
      serviceDate: dateOnly(input.serviceDate),
      departureTime: input.departureTime,
      returnDate: dateOnly(input.returnDate),
      returnTime: input.returnTime,
      durationMinutes: input.durationMinutes,
    });
    if (!result.ready) {
      return result.reason === 'EXPLICIT_RETURN_DATE_REQUIRED'
        ? { ready: false, reason: 'EXPLICIT_RETURN_DATE_REQUIRED' }
        : { ready: false, reason: 'INVALID_TIME_DATA' };
    }
    const scheduledMinutes = (result.window.endAt.getTime() - result.window.startAt.getTime()) / 60_000;
    if (!Number.isSafeInteger(scheduledMinutes) || scheduledMinutes <= 0) {
      return { ready: false, reason: 'INVALID_TIME_DATA' };
    }
    if (input.durationMinutes !== null && input.durationMinutes !== scheduledMinutes) {
      return { ready: false, reason: 'DURATION_MISMATCH' };
    }
    return { ready: true, durationMinutes: scheduledMinutes, source: 'SCHEDULED_INTERVAL' };
  } catch {
    return { ready: false, reason: 'INVALID_TIME_DATA' };
  }
}
