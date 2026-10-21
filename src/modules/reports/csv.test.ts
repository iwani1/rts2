import { describe, expect, it } from 'vitest';
import { buildCsv } from './csv';

describe('buildCsv (RPT-04)', () => {
  const document = {
    title: 'Richie TMS staff transport and fleet report (RPT-02)',
    generatedAt: '2026-10-21T12:00:00.000Z',
    timezone: 'Africa/Accra (UTC)',
    windowLabel: '2028-01-01 to 2028-01-31',
    filtersLabel: 'clientId=abc',
    formulaNotes: ['Booking flow counts distinct bookings per transition.'],
    sections: [
      {
        title: 'Booking flow',
        columns: ['Metric', 'Count'],
        rows: [['Bookings received', 3], ['No-shows', 0]] as Array<Array<string | number | null>>,
      },
    ],
  };

  it('carries the required metadata header lines', () => {
    const csv = buildCsv(document);
    expect(csv).toContain('# Richie TMS staff transport and fleet report (RPT-02)');
    expect(csv).toContain('# Generated: 2026-10-21T12:00:00.000Z');
    expect(csv).toContain('# Timezone: Africa/Accra (UTC)');
    expect(csv).toContain('# Window: 2028-01-01 to 2028-01-31');
    expect(csv).toContain('# Filters: clientId=abc');
    expect(csv).toContain('# Formula: Booking flow counts distinct bookings per transition.');
    expect(csv).toContain('# Section: Booking flow');
    expect(csv).toContain('Metric,Count');
    expect(csv).toContain('Bookings received,3');
  });

  it('escapes commas, quotes and newlines, and blanks nulls', () => {
    const csv = buildCsv({
      ...document,
      sections: [{
        title: 'Notes',
        columns: ['Text', 'Value'],
        rows: [['He said "go, now"', 1], ['line one\nline two', null]],
      }],
    });
    expect(csv).toContain('"He said ""go, now""",1');
    expect(csv).toContain('"line one\nline two",');
    expect(csv.endsWith('\r\n')).toBe(true);
  });
});
