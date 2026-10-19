// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QuotationReadiness } from './quotation-readiness';

const settings = [
  { key: 'rental.pricing_models', label: 'Rental pricing models', configured: false },
  { key: 'rental.distance_time_policy', label: 'Distance and time pricing policy', configured: false },
  { key: 'finance.tax_lines', label: 'Tax and levy lines', configured: true },
  { key: 'rental.deposit_policy', label: 'Rental deposit policy', configured: false },
  { key: 'rental.quote_validity', label: 'Quotation validity', configured: false },
] as const;

describe('QuotationReadiness', () => {
  it('lists missing policy keys without exposing values or allowing non-admin policy edits', () => {
    render(<QuotationReadiness settings={[...settings]} canEditPolicies={false} />);
    expect(screen.getByRole('heading', { name: 'Quotation is not available yet' })).toBeTruthy();
    expect(screen.getByText('Pricing, tax, deposit and validity policies must be explicitly entered and validated before a quote can be prepared. A recorded setting value alone does not mean it is valid or approved.')).toBeTruthy();
    expect(screen.getByText(/4 required policies are not configured/)).toBeTruthy();
    expect(screen.getByText('Tax and levy lines').closest('li')?.textContent).toContain('Value recorded; validation still required');
    expect(screen.queryByRole('link', { name: 'Review policy settings' })).toBeNull();
  });

  it('links Super Administrators to settings while still withholding quote availability', () => {
    render(<QuotationReadiness settings={[...settings]} canEditPolicies />);
    expect(screen.getByRole('link', { name: 'Review policy settings' }).getAttribute('href')).toBe('/admin/settings');
  });
});
