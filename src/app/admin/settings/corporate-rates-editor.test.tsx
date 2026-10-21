// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CorporateRatesEditor } from './corporate-rates-editor';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('CorporateRatesEditor (FIN-02, D-090/5C)', () => {
  it('starts unconfigured and saves only an explicitly entered rate with an audit reason', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        rates: null,
        contracts: [{ id: 'contract-1', label: 'Acme — Staff busing (Active)' }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ setting: { configured: true } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<CorporateRatesEditor companyId="company-1" />);

    expect(await screen.findByText('Current state: Not configured')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add rate line' }));
    fireEvent.change(screen.getByLabelText('Contract'), { target: { value: 'contract-1' } });
    fireEvent.change(screen.getByLabelText('Charging basis'), { target: { value: 'PER_TRIP' } });
    fireEvent.change(screen.getByLabelText('Rate (GHS pesewas)'), { target: { value: '20000' } });
    fireEvent.change(screen.getByLabelText('Reason for change'), { target: { value: 'Operator approved Acme trip rate' } });
    fireEvent.submit(screen.getByLabelText('Reason for change').closest('form')!);
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Corporate rates saved.'));
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      key: 'finance.corporate_rates',
      value: [{ contractId: 'contract-1', unit: 'PER_TRIP', ratePesewas: 20000 }],
      reason: 'Operator approved Acme trip rate',
    });
  });
});
