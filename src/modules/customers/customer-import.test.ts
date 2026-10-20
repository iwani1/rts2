import { describe, expect, it } from 'vitest';
import { parseCustomerImportCsv } from './customer-import';

const header = 'displayName,reference,contactPerson,telephone,email,billingDetails,customerType,status,notes';

describe('customer CSV preview parser', () => {
  it('parses quoted commas and normalizes blank optional fields without applying defaults', () => {
    const result = parseCustomerImportCsv(`\uFEFF${header}\r\n"Ama, K. Transport",CUS-01,,,,,,,
\n`);
    expect(result.fileErrors).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      rowNumber: 2,
      displayName: 'Ama, K. Transport',
      reference: 'CUS-01',
      errors: [],
      data: {
        displayName: 'Ama, K. Transport',
        reference: 'CUS-01',
        contactPerson: null,
        telephone: null,
        email: null,
        billingDetails: null,
        customerType: null,
        status: null,
        notes: null,
      },
    });
  });

  it('retains every approved customer field for complete preview before commit', () => {
    const result = parseCustomerImportCsv(`${header}\nExample Transport,CUS-42,Ama Contact,+233 20 000 0000,ama@example.invalid,Accounts Office,Organisation,Active,Verified import row`);
    expect(result.rows[0]).toMatchObject({
      rowNumber: 2,
      displayName: 'Example Transport',
      reference: 'CUS-42',
      contactPerson: 'Ama Contact',
      telephone: '+233 20 000 0000',
      email: 'ama@example.invalid',
      billingDetails: 'Accounts Office',
      customerType: 'Organisation',
      status: 'Active',
      notes: 'Verified import row',
      errors: [],
    });
  });

  it('returns row-level validation errors and preserves every parsed row', () => {
    const result = parseCustomerImportCsv(`${header}\n,REF-1,,,,,,,\nGood Customer,REF-2,,,,,business,,\nBad Email,REF-3,,,not-an-email,,,,\n`);
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0]?.errors[0]).toContain('displayName');
    expect(result.rows[1]?.errors).toEqual([]);
    expect(result.rows[2]?.errors[0]).toContain('email');
  });

  it('marks repeated file references on every conflicting row', () => {
    const result = parseCustomerImportCsv(`${header}\nFirst,REF-DUP,,,,,,,\nSecond,REF-DUP,,,,,,,\n`);
    expect(result.rows[0]?.errors[0]).toContain('rows 2, 3');
    expect(result.rows[1]?.errors[0]).toContain('rows 2, 3');
  });

  it('rejects unsupported or duplicate headers before returning data rows', () => {
    expect(parseCustomerImportCsv('displayName,displayName\nA,B').fileErrors[0]).toContain('Duplicate column headers');
    expect(parseCustomerImportCsv('displayName,vehicleStatus\nA,Available').fileErrors[0]).toContain('Unsupported column headers');
    expect(parseCustomerImportCsv('reference,telephone\nREF-1,024').fileErrors[0]).toContain('displayName');
  });

  it('keeps blank lines as visible invalid rows instead of silently discarding them', () => {
    const result = parseCustomerImportCsv(`${header}\n\nValid Customer,,,,,,,,`);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]?.rowNumber).toBe(2);
    expect(result.rows[0]?.errors[0]).toContain('Expected 9 columns but found 1');
    expect(result.rows[1]?.rowNumber).toBe(3);
  });

  it('reports CSV syntax errors and row column-count mismatches instead of discarding data', () => {
    expect(parseCustomerImportCsv(`${header}\n"Unclosed,REF-1`).fileErrors).toEqual([
      'CSV syntax is invalid. Check the delimiter and quoted fields.',
    ]);
    const result = parseCustomerImportCsv(`${header}\nToo few,REF-1\n`);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.errors[0]).toContain('Expected 9 columns but found 2');
  });
});
