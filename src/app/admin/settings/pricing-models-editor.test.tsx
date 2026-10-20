// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PricingModelsEditor } from './pricing-models-editor';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('PricingModelsEditor', () => {
  it('starts blank and saves only an explicitly entered rate and basis with an audit reason', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ models: null }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ setting: { configured: true } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<PricingModelsEditor companyId="company-1" />);

    expect(await screen.findByText('Current state: Not configured')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add pricing line' }));
    fireEvent.change(screen.getByLabelText('Unique code'), { target: { value: 'CITY_TRIP' } });
    fireEvent.change(screen.getByLabelText('Operator-facing label'), { target: { value: 'City trip' } });
    fireEvent.change(screen.getByLabelText('Charging basis'), { target: { value: 'PER_TRIP' } });
    fireEvent.change(screen.getByLabelText('Rate (GHS pesewas)'), { target: { value: '12500' } });
    fireEvent.change(screen.getByLabelText('Reason for change'), { target: { value: 'Operator approved city trip rate' } });
    fireEvent.submit(screen.getByLabelText('Reason for change').closest('form')!);
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Pricing models saved.'));
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      key: 'rental.pricing_models',
      value: [{ code: 'CITY_TRIP', label: 'City trip', unit: 'PER_TRIP', ratePesewas: 12500 }],
      reason: 'Operator approved city trip rate',
    });
  });
});
