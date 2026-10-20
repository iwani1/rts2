// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TaxLinesEditor } from './tax-lines-editor';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('TaxLinesEditor', () => {
  it('starts blank and saves an explicitly entered accountant-approved rate with an audit reason', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ lines: null }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ setting: { configured: true } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<TaxLinesEditor companyId="company-1" />);

    expect(await screen.findByText('Current state: Not configured')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add tax or levy line' }));
    fireEvent.change(screen.getByLabelText('Unique code'), { target: { value: 'VAT' } });
    fireEvent.change(screen.getByLabelText('Accountant-approved label'), { target: { value: 'Approved VAT' } });
    fireEvent.change(screen.getByLabelText('Rate (percent)'), { target: { value: '15' } });
    fireEvent.change(screen.getByLabelText('Reason for change'), { target: { value: 'Accountant confirmed this tax line' } });
    fireEvent.submit(screen.getByLabelText('Reason for change').closest('form')!);
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Tax lines saved.'));
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      key: 'finance.tax_lines',
      value: [{ code: 'VAT', label: 'Approved VAT', rateBasisPoints: 1500 }],
      reason: 'Accountant confirmed this tax line',
    });
  });
});
