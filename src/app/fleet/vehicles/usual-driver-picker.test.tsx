// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UsualDriverPicker } from './usual-driver-picker';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('UsualDriverPicker search races', () => {
  it('ignores a stale response after a newer driver search has completed', async () => {
    const responses: Array<(response: Response) => void> = [];
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(() => new Promise<Response>((resolve) => { responses.push(resolve); }));
    vi.stubGlobal('fetch', fetchMock);
    render(<UsualDriverPicker companyId="company-1" current={null} />);
    const search = screen.getByLabelText('Search active drivers');
    fireEvent.change(search, { target: { value: 'old' } });
    expect(screen.getByText('Searching…')).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.change(search, { target: { value: 'new' } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect((fetchMock.mock.calls[0]?.[1]?.signal as AbortSignal).aborted).toBe(true);
    responses[1]?.(new Response(JSON.stringify({ drivers: [{
      id: 'driver-new', fullName: 'New Driver', licenceClass: 'D', licenceExpiresAt: null,
    }] }), { status: 200 }));
    expect(await screen.findByRole('button', { name: /New Driver/ })).toBeTruthy();
    responses[0]?.(new Response(JSON.stringify({ drivers: [{
      id: 'driver-old', fullName: 'Old Driver', licenceClass: 'C', licenceExpiresAt: null,
    }] }), { status: 200 }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /Old Driver/ })).toBeNull());
    expect(screen.getByRole('button', { name: /New Driver/ })).toBeTruthy();
  });
});
