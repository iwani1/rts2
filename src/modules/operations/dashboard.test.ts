import { describe, expect, it } from 'vitest';
import { accraToday, addDays, bucketTripStatuses } from './dashboard';

describe('operations dashboard helpers (D-067)', () => {
  it('buckets trip statuses by count, then name', () => {
    expect(bucketTripStatuses(['Planned', 'Completed', 'Planned', 'In Progress', 'Planned']))
      .toEqual([
        { status: 'Planned', count: 3 },
        { status: 'Completed', count: 1 },
        { status: 'In Progress', count: 1 },
      ]);
    expect(bucketTripStatuses([])).toEqual([]);
  });

  it('computes the Africa/Accra date independent of server timezone', () => {
    // 23:30 UTC is already the next day in Accra (UTC+0, so same date) — and
    // 00:30 UTC is the same Accra date; the formatter must honour Accra.
    expect(accraToday(new Date('2028-03-01T23:30:00.000Z'))).toBe('2028-03-01');
    expect(accraToday(new Date('2028-03-01T00:30:00.000Z'))).toBe('2028-03-01');
  });

  it('adds days on date-only values', () => {
    expect(addDays('2028-02-28', 30)).toBe('2028-03-29');
    expect(addDays('2028-12-25', 10)).toBe('2029-01-04');
  });
});
