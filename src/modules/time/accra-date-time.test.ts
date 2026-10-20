import { describe, expect, it } from 'vitest';
import { accraLocalDateTimeToISOString, formatAccraDateTime, InvalidAccraDateTimeError } from './accra-date-time';

describe('Africa/Accra local date-time conversion', () => {
  it('converts date-time input to an explicit UTC instant without consulting host timezone', () => {
    expect(accraLocalDateTimeToISOString('2026-10-18T11:30')).toBe('2026-10-18T11:30:00.000Z');
    expect(accraLocalDateTimeToISOString('2026-10-18T11:30:45.12')).toBe('2026-10-18T11:30:45.120Z');
  });

  it.each(['', '2026-02-30T12:00', '2026-10-18T25:00', '2026-10-18T12:60', '2026-10-18T12:00:00.1234'])
    ('rejects malformed or impossible local time %s', (value) => {
      expect(() => accraLocalDateTimeToISOString(value)).toThrow(InvalidAccraDateTimeError);
    });

  it('formats instants using the operator timezone', () => {
    const expected = new Intl.DateTimeFormat('en-GH', {
      dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Accra',
    }).format(new Date('2026-10-18T11:30:00.000Z'));
    expect(formatAccraDateTime('2026-10-18T11:30:00.000Z')).toBe(expected);
  });
});
