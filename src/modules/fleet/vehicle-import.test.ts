import { describe, expect, it } from 'vitest';
import { parseVehicleImportCsv, vehicleImportHeaders } from './vehicle-import';

type VehicleCsvField = typeof vehicleImportHeaders[number];
const row = (values: Partial<Record<VehicleCsvField, string>>) => vehicleImportHeaders.map((header) => values[header] ?? '').join(',');
const header = vehicleImportHeaders.join(',');

describe('vehicle CSV preview parser', () => {
  it('normalizes registration and validates only supplied vehicle facts without adding status or a driver', () => {
    const result = parseVehicleImportCsv(`${header}\n${row({
      registrationNumber: 'gh 001  ab', make: 'Toyota', model: 'Coaster', category: 'Bus', seatCount: '30',
      odometerValue: '12500.5', odometerUnit: 'KM', insuranceExpiresAt: '2027-01-31', notes: 'Imported from fleet list',
    })}`);
    expect(result.fileErrors).toEqual([]);
    expect(result.rows[0]).toMatchObject({ rowNumber: 2, registrationNumber: 'GH 001 AB', make: 'Toyota', model: 'Coaster', category: 'Bus', errors: [] });
    expect(result.rows[0]?.data).toMatchObject({ registrationNumber: 'GH 001 AB', seatCount: 30, odometerValue: 12500.5, odometerUnit: 'KM' });
    expect(result.rows[0]?.data).not.toHaveProperty('usualDriverId');
    expect(result.rows[0]?.data).not.toHaveProperty('status');
  });

  it('reports invalid number, date and odometer-pair values on the row', () => {
    const result = parseVehicleImportCsv(`${header}\n${row({
      registrationNumber: 'GH-002', make: 'Toyota', model: 'Coaster', category: 'Bus', seatCount: '4.5',
      odometerValue: '12', insuranceExpiresAt: '2026-02-30',
    })}`);
    expect(result.rows[0]?.errors.join(' ')).toContain('seatCount');
    expect(result.rows[0]?.errors.join(' ')).toContain('odometerUnit');
    expect(result.rows[0]?.errors.join(' ')).toContain('insuranceExpiresAt');
  });

  it('flags registrations that collide after the established normalization', () => {
    const result = parseVehicleImportCsv(`${header}\n${row({ registrationNumber: 'gh 001 ab', make: 'Toyota', model: 'Coaster', category: 'Bus' })}\n${row({ registrationNumber: 'GH 001  AB', make: 'Nissan', model: 'Civilian', category: 'Bus' })}`);
    expect(result.rows[0]?.registrationNumber).toBe('GH 001 AB');
    expect(result.rows[0]?.errors[0]).toContain('rows 2, 3');
    expect(result.rows[1]?.errors[0]).toContain('rows 2, 3');
  });

  it('rejects unapproved status headers and retains blank rows as visible errors', () => {
    expect(parseVehicleImportCsv(`${header},status\n`).fileErrors[0]).toContain('Unsupported column headers: status');
    const result = parseVehicleImportCsv(`${header}\n\n${row({ registrationNumber: 'GH-003', make: 'Toyota', model: 'Coaster', category: 'Bus' })}`);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]?.errors[0]).toContain('Expected 14 columns');
  });
});
