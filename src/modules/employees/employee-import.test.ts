import { describe, expect, it } from 'vitest';
import { employeeImportHeaders, parseEmployeeImportCsv } from './employee-import';

const header = employeeImportHeaders.join(',');
const row = (overrides: Record<string, string> = {}) => {
  const values: Record<string, string> = {
    reference: '', fullName: 'Ama Serwaa', telephone: '+233 20 000 0001', email: '', homeAddress: '',
    department: 'Operations', workLocation: '', shift: '', approvedPickupLocation: '', approvedDropoffLocation: '',
    accountStatus: '', transportEligible: '', accessibilityNeeds: '', notes: '', ...overrides,
  };
  return employeeImportHeaders.map((field) => values[field]).join(',');
};

describe('employee CSV import parsing (EMP-02)', () => {
  it('parses a valid row and keeps eligibility unset when blank', () => {
    const parsed = parseEmployeeImportCsv(`${header}\n${row()}`, 'client-1');
    expect(parsed.fileErrors).toEqual([]);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].errors).toEqual([]);
    expect(parsed.rows[0].data?.transportEligible).toBeNull();
    expect(parsed.rows[0].data?.clientId).toBe('client-1');
  });

  it('parses TRUE/FALSE eligibility and rejects other values', () => {
    expect(parseEmployeeImportCsv(`${header}\n${row({ transportEligible: 'TRUE' })}`, 'client-1').rows[0].data?.transportEligible).toBe(true);
    expect(parseEmployeeImportCsv(`${header}\n${row({ transportEligible: 'false' })}`, 'client-1').rows[0].data?.transportEligible).toBe(false);
    const invalid = parseEmployeeImportCsv(`${header}\n${row({ transportEligible: 'yes' })}`, 'client-1');
    expect(invalid.rows[0].data).toBeUndefined();
    expect(invalid.rows[0].errors[0]).toContain('transportEligible');
  });

  it('flags a repeated reference in the file as a row error', () => {
    const csv = `${header}\n${row({ reference: 'EMP-001' })}\n${row({ reference: 'EMP-001', fullName: 'Kofi Mensah' })}`;
    const parsed = parseEmployeeImportCsv(csv, 'client-1');
    expect(parsed.rows.every((entry) => entry.errors.some((error) => error.includes('EMP-001')))).toBe(true);
  });

  it('warns about likely duplicates without blocking the rows', () => {
    const csv = `${header}\n${row()}\n${row({ reference: 'EMP-002' })}`;
    const parsed = parseEmployeeImportCsv(csv, 'client-1');
    expect(parsed.rows.every((entry) => entry.errors.length === 0)).toBe(true);
    expect(parsed.rows.every((entry) => entry.warnings.some((warning) => warning.includes('Possible duplicate')))).toBe(true);
  });

  it('reports file errors for missing required headers and invalid emails per row', () => {
    expect(parseEmployeeImportCsv('reference,telephone\nEMP-1,123', 'client-1').fileErrors[0]).toContain('fullName');
    const badEmail = parseEmployeeImportCsv(`${header}\n${row({ email: 'not-an-email' })}`, 'client-1');
    expect(badEmail.rows[0].errors[0]).toContain('email');
  });
});
