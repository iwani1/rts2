import { describe, expect, it } from 'vitest';
import {
  allowedCorporateInvoiceTargets,
  isAllowedCorporateInvoiceTransition,
  CORPORATE_INVOICE_STATUSES,
} from './invoice-transitions';

describe('corporate invoice transitions (D-061)', () => {
  it('produces the full approved from-to matrix', () => {
    const approved = new Set(['DRAFT>ISSUED', 'DRAFT>VOID', 'ISSUED>PAID', 'ISSUED>VOID']);
    for (const from of CORPORATE_INVOICE_STATUSES) {
      for (const to of CORPORATE_INVOICE_STATUSES) {
        expect(isAllowedCorporateInvoiceTransition(from, to)).toBe(approved.has(`${from}>${to}`));
      }
    }
  });

  it('lists the allowed targets per status and terminates PAID and VOID', () => {
    expect(allowedCorporateInvoiceTargets('DRAFT')).toEqual(['ISSUED', 'VOID']);
    expect(allowedCorporateInvoiceTargets('ISSUED')).toEqual(['PAID', 'VOID']);
    expect(allowedCorporateInvoiceTargets('PAID')).toEqual([]);
    expect(allowedCorporateInvoiceTargets('VOID')).toEqual([]);
  });
});
