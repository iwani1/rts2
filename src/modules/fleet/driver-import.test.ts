import { describe, expect, it } from 'vitest';
import { driverImportHeaders } from './driver-import-constants';
import { createDriverImportNameWarnings, parseDriverImportCsv } from './driver-import';

type DriverCsvField = typeof driverImportHeaders[number];
const row = (values: Partial<Record<DriverCsvField, string>>) => driverImportHeaders.map((header) => values[header] ?? '').join(',');
const header = driverImportHeaders.join(',');

describe('driver CSV preview parser', () => {
  it('validates the approved driver fields without supplying status or availability defaults', () => {
    const result = parseDriverImportCsv(`${header}\n${row({
      fullName: 'Verified Driver Name', licenceClass: 'B', licenceExpiresAt: '2027-08-31',
      qualifications: 'Company-supplied qualification',
    })}`);
    expect(result.fileErrors).toEqual([]);
    expect(result.rows[0]).toMatchObject({ rowNumber: 2, fullName: 'Verified Driver Name', errors: [] });
    expect(result.rows[0]?.data).toMatchObject({
      fullName: 'Verified Driver Name', licenceClass: 'B', licenceExpiresAt: '2027-08-31',
      qualifications: 'Company-supplied qualification', availability: null, status: null,
    });
  });

  it('reports missing names and invalid licence expiry dates at their CSV row numbers', () => {
    const result = parseDriverImportCsv(`${header}\n,Class A,2026-02-30,,,\nValid Driver,Class B,2027-03-01,,,`);
    expect(result.rows[0]).toMatchObject({ rowNumber: 2, errors: expect.arrayContaining([expect.stringContaining('fullName'), expect.stringContaining('licenceExpiresAt')]) });
    expect(result.rows[1]).toMatchObject({ rowNumber: 3, errors: [] });
  });

  it('rejects unsupported columns, malformed rows, and does not silently drop blank rows', () => {
    expect(parseDriverImportCsv(`${header},telephone\n`).fileErrors[0]).toContain('Unsupported column headers: telephone');
    const result = parseDriverImportCsv(`${header}\n\n${row({ fullName: 'Verified Driver Name' })}`);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({ rowNumber: 2, errors: [expect.stringContaining('Expected 6 columns')] });
  });
});


describe('driver import possible-duplicate warnings', () => {
  it('matches case-insensitively with normalized whitespace and warns without implying identity', () => {
    const warningsForName = createDriverImportNameWarnings(
      [' Ama   Mensah ', 'ama mensah', 'Unrelated Driver'],
      ['Kofi Anane'],
    );

    expect(warningsForName('AMA Mensah')).toEqual([
      'Possible name match in another row in this CSV. This is advisory only; every valid row remains a separate record.',
    ]);
    expect(warningsForName('  kofi   anane ')).toEqual([
      'Possible name match in an existing company driver record. This is advisory only; no record will be merged or updated.',
    ]);
    expect(warningsForName('Unique Driver')).toEqual([]);
  });

  it('shows both warning sources when the name matches a CSV row and an existing company record', () => {
    const warningsForName = createDriverImportNameWarnings(
      ['Amina Owusu', ' amina   owusu '],
      ['AMINA OWUSU'],
    );

    expect(warningsForName('Amina Owusu')).toHaveLength(2);
  });
});
