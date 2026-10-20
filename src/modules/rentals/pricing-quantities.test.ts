import { describe, expect, it } from 'vitest';
import { resolveRequestedDuration } from './pricing-quantities';

describe('resolveRequestedDuration', () => {
  it('uses an explicitly entered duration when no return time was recorded', () => {
    expect(resolveRequestedDuration({ serviceDate: null, departureTime: null, returnTime: null, durationMinutes: 95 }))
      .toEqual({ ready: true, durationMinutes: 95, source: 'EXPLICIT_DURATION' });
  });

  it('derives duration from a same-day scheduled return', () => {
    expect(resolveRequestedDuration({ serviceDate: '2026-10-20', departureTime: '08:15', returnTime: '10:45', durationMinutes: null }))
      .toEqual({ ready: true, durationMinutes: 150, source: 'SCHEDULED_INTERVAL' });
  });

  it('requires the explicitly stored return date for an overnight schedule', () => {
    const input = { serviceDate: '2026-10-20', departureTime: '23:00', returnTime: '02:00', durationMinutes: null };
    expect(resolveRequestedDuration(input)).toEqual({ ready: false, reason: 'EXPLICIT_RETURN_DATE_REQUIRED' });
    expect(resolveRequestedDuration({ ...input, returnDate: '2026-10-21' }))
      .toEqual({ ready: true, durationMinutes: 180, source: 'SCHEDULED_INTERVAL' });
  });

  it('fails closed when explicit duration and scheduled interval disagree', () => {
    expect(resolveRequestedDuration({ serviceDate: '2026-10-20', departureTime: '08:00', returnTime: '10:00', durationMinutes: 90 }))
      .toEqual({ ready: false, reason: 'DURATION_MISMATCH' });
  });

  it('rejects missing, zero, and malformed time data rather than guessing', () => {
    expect(resolveRequestedDuration({ serviceDate: null, departureTime: null, returnTime: null, durationMinutes: null }))
      .toEqual({ ready: false, reason: 'MISSING_DURATION' });
    expect(resolveRequestedDuration({ serviceDate: null, departureTime: null, returnTime: null, durationMinutes: 0 }))
      .toEqual({ ready: false, reason: 'INVALID_TIME_DATA' });
    expect(resolveRequestedDuration({ serviceDate: 'not-a-date', departureTime: '08:00', returnTime: '09:00', durationMinutes: null }))
      .toEqual({ ready: false, reason: 'INVALID_TIME_DATA' });
  });
});
