// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BookingCutoffEditor } from './booking-cutoff-editor';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('BookingCutoffEditor (BKG-05, D-090/5C)', () => {
  it('starts unconfigured and saves an explicit hours cutoff with an audit reason', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ cutoff: null }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ setting: { configured: true } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ cutoff: { mode: 'HOURS_BEFORE_JOURNEY', hours: 24 } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<BookingCutoffEditor companyId="company-1" />);

    expect(await screen.findByText('Current value: Not configured (no cutoff applies)')).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/Close creation a set number of hours before the journey date/));
    fireEvent.change(screen.getByLabelText('Hours before the journey date (0–720)'), { target: { value: '24' } });
    fireEvent.change(screen.getByLabelText('Reason for change'), { target: { value: 'Operations needs a day of planning lead time' } });
    fireEvent.submit(screen.getByLabelText('Reason for change').closest('form')!);
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Booking creation cutoff saved.'));
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      key: 'bookings.creation_cutoff',
      value: { mode: 'HOURS_BEFORE_JOURNEY', hours: 24 },
      reason: 'Operations needs a day of planning lead time',
    });
  });

  it('refuses to save before a mode is chosen', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ cutoff: null }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<BookingCutoffEditor companyId="company-1" />);
    expect(await screen.findByText('Current value: Not configured (no cutoff applies)')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Reason for change'), { target: { value: 'Trying to save without a mode' } });
    fireEvent.submit(screen.getByLabelText('Reason for change').closest('form')!);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
