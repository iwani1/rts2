// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResourceBuffersEditor } from './resource-buffers-editor';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('ResourceBuffersEditor', () => {
  it('shows unset buffers without defaults and saves an explicit value with a reason', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ vehicleBufferMinutes: null, driverBufferMinutes: null }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ setting: { configured: true } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ vehicleBufferMinutes: 0, driverBufferMinutes: null }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<ResourceBuffersEditor companyId="company-1" />);

    expect(await screen.findAllByText(/Current value: Not configured/)).toHaveLength(2);
    const vehicleInput = screen.getByLabelText('Buffer minutes', { selector: '#vehicleBufferMinutes-minutes' });
    fireEvent.change(vehicleInput, { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Reason for change', { selector: '#vehicleBufferMinutes-reason' }), { target: { value: 'Owner confirmed zero buffer' } });
    fireEvent.submit(vehicleInput.closest('form')!);

    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Vehicle buffer saved.'));
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      key: 'fleet.vehicle_between_job_buffer_minutes', value: 0, reason: 'Owner confirmed zero buffer',
    });
    expect(screen.getByText('Current value: 0 minutes')).toBeTruthy();
  });
});
