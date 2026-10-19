import { describe, expect, it } from 'vitest';
import { buildRentalConflictWindow, conflictWindowsOverlap } from './resource-conflict-window';

describe('buildRentalConflictWindow', () => {
  it('uses the approved service date, departure and scheduled return time', () => {
    const result = buildRentalConflictWindow({
      serviceDate: '2026-11-01', departureTime: '08:30', returnTime: '10:00', returnDate: null, durationMinutes: null,
    });

    expect(result).toEqual({ ready: true, window: {
      startAt: new Date('2026-11-01T08:30:00.000Z'),
      endAt: new Date('2026-11-01T10:00:00.000Z'),
    } });
  });

  it('derives the end from positive duration and permits an exact duration to cross midnight', () => {
    const result = buildRentalConflictWindow({
      serviceDate: '2026-11-01', departureTime: '23:30', returnTime: null, durationMinutes: 90,
    });

    expect(result).toEqual({ ready: true, window: {
      startAt: new Date('2026-11-01T23:30:00.000Z'),
      endAt: new Date('2026-11-02T01:00:00.000Z'),
    } });
  });

  it('requires an explicit return date when a return time is earlier than departure', () => {
    const incomplete = buildRentalConflictWindow({
      serviceDate: '2026-11-01', departureTime: '22:00', returnTime: '01:00', returnDate: null, durationMinutes: null,
    });
    const overnight = buildRentalConflictWindow({
      serviceDate: '2026-11-01', departureTime: '22:00', returnTime: '01:00', returnDate: '2026-11-02', durationMinutes: null,
    });

    expect(incomplete).toEqual({ ready: false, reason: 'EXPLICIT_RETURN_DATE_REQUIRED' });
    expect(overnight).toEqual({ ready: true, window: {
      startAt: new Date('2026-11-01T22:00:00.000Z'),
      endAt: new Date('2026-11-02T01:00:00.000Z'),
    } });
  });

  it('fails closed when the start or return information is incomplete', () => {
    expect(buildRentalConflictWindow({ serviceDate: null, departureTime: '08:00', returnTime: '09:00', durationMinutes: null }))
      .toEqual({ ready: false, reason: 'MISSING_START' });
    expect(buildRentalConflictWindow({ serviceDate: '2026-11-01', departureTime: '08:00', returnTime: null, durationMinutes: null }))
      .toEqual({ ready: false, reason: 'MISSING_RETURN' });
  });

  it('rejects malformed dates and non-positive duration values', () => {
    expect(() => buildRentalConflictWindow({
      serviceDate: '2026-02-30', departureTime: '08:00', returnTime: null, durationMinutes: 30,
    })).toThrow();
    expect(() => buildRentalConflictWindow({
      serviceDate: '2026-11-01', departureTime: '08:00', returnTime: null, durationMinutes: 0,
    })).toThrow();
  });
});

describe('conflictWindowsOverlap', () => {
  it('detects overlapping windows but not adjacent ones', () => {
    const first = { startAt: new Date('2026-11-01T08:00:00Z'), endAt: new Date('2026-11-01T09:00:00Z') };
    const overlap = { startAt: new Date('2026-11-01T08:30:00Z'), endAt: new Date('2026-11-01T09:30:00Z') };
    const adjacent = { startAt: new Date('2026-11-01T09:00:00Z'), endAt: new Date('2026-11-01T10:00:00Z') };

    expect(conflictWindowsOverlap(first, overlap)).toBe(true);
    expect(conflictWindowsOverlap(first, adjacent)).toBe(false);
  });
});
