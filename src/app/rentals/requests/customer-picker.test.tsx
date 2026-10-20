// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomerPicker } from './customer-picker';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('CustomerPicker search races', () => {
  it('ignores a stale response after a newer customer search has completed', async () => {
    const responses: Array<(response: Response) => void> = [];
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(() => new Promise<Response>((resolve) => { responses.push(resolve); }));
    vi.stubGlobal('fetch', fetchMock);
    render(<CustomerPicker companyId="company-1" current={null} />);
    const search = screen.getByLabelText('Search existing customers');
    fireEvent.change(search, { target: { value: 'old' } });
    expect(screen.getByText('Searching…')).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.change(search, { target: { value: 'new' } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect((fetchMock.mock.calls[0]?.[1]?.signal as AbortSignal).aborted).toBe(true);
    responses[1]?.(new Response(JSON.stringify({ customers: [{
      id: 'customer-new', displayName: 'New Customer', reference: 'CUS-NEW',
    }] }), { status: 200 }));
    expect(await screen.findByRole('button', { name: /New Customer/ })).toBeTruthy();
    responses[0]?.(new Response(JSON.stringify({ customers: [{
      id: 'customer-old', displayName: 'Old Customer', reference: 'CUS-OLD',
    }] }), { status: 200 }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /Old Customer/ })).toBeNull());
    expect(screen.getByRole('button', { name: /New Customer/ })).toBeTruthy();
  });
});
