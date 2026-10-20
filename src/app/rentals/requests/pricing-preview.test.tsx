// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RentalPricingPreview } from './pricing-preview';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('RentalPricingPreview', () => {
  it('loads configured rates, requests a temporary preview, and labels it as not a quotation', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ models: [
        { code: 'TRIP', label: 'Trip charge', unit: 'PER_TRIP', ratePesewas: 50000 },
        { code: 'DIST', label: 'Distance charge', unit: 'PER_KM', ratePesewas: 2500 },
      ] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        preview: { lines: [{ lineId: 'TRIP', label: 'Trip charge', amountPesewas: 50000 }], subtotalPesewas: 50000 },
        disclaimer: 'Internal pre-tax estimate only. Not a quotation.',
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ worksheet: { id: 'worksheet-1', version: 1, preTaxSubtotalPesewas: 50000 } }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ worksheets: [{
        id: 'worksheet-1', version: 1, preTaxSubtotalPesewas: 50000, reason: 'Prepared pricing worksheet', createdAt: '2026-10-19T12:00:00.000Z',
        lines: [{ lineId: 'TRIP', modelCode: 'TRIP', label: 'Trip charge', unit: 'PER_TRIP', ratePesewas: 50000, amountPesewas: 50000, quantity: {} }],
      }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<RentalPricingPreview companyId="company-1" requestId="request-1" />);

    const tripChoice = await screen.findByLabelText(/Trip charge/);
    fireEvent.click(tripChoice);
    fireEvent.click(screen.getByRole('button', { name: 'Calculate pre-tax preview' }));
    await waitFor(() => expect(screen.getByText('Pre-tax subtotal: GHS 500.00')).toBeTruthy());
    expect(screen.getByText('Internal pre-tax estimate only. Not a quotation.')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({ modelCodes: ['TRIP'] });
    fireEvent.change(screen.getByLabelText('Reason for saving an immutable internal worksheet'), { target: { value: 'Prepared pricing worksheet for manager review' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save internal worksheet version' }));
    expect(await screen.findByText(/Internal worksheet version 1 saved/)).toBeTruthy();
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain('/pricing-worksheets');
    expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toEqual({
      modelCodes: ['TRIP'], reason: 'Prepared pricing worksheet for manager review',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load saved worksheet history' }));
    expect(await screen.findByText(/Prepared pricing worksheet/)).toBeTruthy();
    expect(screen.getByText(/line total GHS 500.00/)).toBeTruthy();
    expect(String(fetchMock.mock.calls[3]?.[0])).toContain('/pricing-worksheets');
    expect(fetchMock.mock.calls[3]?.[1]).toMatchObject({ cache: 'no-store' });
  });

  it('requires a manually entered distance for kilometre-priced models', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ models: [
        { code: 'DIST', label: 'Distance charge', unit: 'PER_KM', ratePesewas: 2500 },
      ] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ preview: { lines: [], subtotalPesewas: 0 }, disclaimer: 'Not a quotation.' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<RentalPricingPreview companyId="company-1" requestId="request-1" />);
    fireEvent.click(await screen.findByLabelText(/Distance charge/));
    const calculate = screen.getByRole('button', { name: 'Calculate pre-tax preview' }) as HTMLButtonElement;
    expect(calculate.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Operator-entered distance (whole metres)'), { target: { value: '12000' } });
    expect(calculate.disabled).toBe(false);
    fireEvent.click(calculate);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({ modelCodes: ['DIST'], distanceMetres: 12000 });
  });
});
