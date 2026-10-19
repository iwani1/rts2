// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuoteValidityEditor } from './quote-validity-editor';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('QuoteValidityEditor', () => {
  it('starts unset, then saves a positive whole-day value with an audit reason', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ validityDays: null }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ setting: { configured: true } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ validityDays: 14 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<QuoteValidityEditor companyId="company-1" />);

    expect(await screen.findByText('Current value: Not configured')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Validity duration (whole days)'), { target: { value: '14' } });
    fireEvent.change(screen.getByLabelText('Reason for change'), { target: { value: 'Owner approved fourteen day quote window' } });
    fireEvent.submit(screen.getByLabelText('Validity duration (whole days)').closest('form')!);
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Quotation validity saved.'));
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      key: 'rental.quote_validity', value: 14, reason: 'Owner approved fourteen day quote window',
    });
    expect(screen.getByText('Current value: 14 days')).toBeTruthy();
  });
});
