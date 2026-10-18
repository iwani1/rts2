// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VehicleManager } from './vehicle-manager';

const { router } = vi.hoisted(() => ({
  router: { refresh: vi.fn(), push: vi.fn() },
}));

vi.mock('next/navigation', () => ({ useRouter: () => router }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

beforeEach(() => {
  router.refresh.mockReset();
  router.push.mockReset();
});

describe('VehicleManager create form', () => {
  it('submits the selected usual driver, then clears both the form and picker after a successful create', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.includes('/drivers?')) {
        return new Response(JSON.stringify({
          drivers: [{
            id: 'driver-1',
            fullName: 'Maya Mensah',
            licenceClass: 'D',
            licenceExpiresAt: null,
          }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (init?.method === 'POST') {
        return new Response(JSON.stringify({ vehicle: { id: 'vehicle-1' } }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<VehicleManager companyId="company-1" canAssignUsualDriver />);
    await user.type(screen.getByLabelText('Registration number'), 'GR 1234-25');
    await user.type(screen.getByLabelText('Make'), 'Toyota');
    await user.type(screen.getByLabelText('Model'), 'Hiace');
    await user.type(screen.getByLabelText('Vehicle category'), 'Minibus');
    await user.type(screen.getByLabelText('Reason for creation'), 'Test vehicle setup');
    await user.type(screen.getByLabelText('Search active drivers'), 'Maya');
    await user.click(await screen.findByRole('button', { name: /Maya Mensah/ }));

    expect(screen.getByDisplayValue('driver-1')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Add vehicle' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/companies/company-1/vehicles',
      expect.objectContaining({ method: 'POST' }),
    ));
    const saveCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(saveCall).toBeDefined();
    expect(JSON.parse(String(saveCall?.[1]?.body))).toMatchObject({
      registrationNumber: 'GR 1234-25',
      usualDriverId: 'driver-1',
    });

    await screen.findByText('Vehicle record saved.');
    expect((screen.getByLabelText('Registration number') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Search active drivers') as HTMLInputElement).value).toBe('');
    expect(screen.getByText('No usual driver selected')).toBeTruthy();
    expect((document.querySelector('input[name="usualDriverId"]') as HTMLInputElement).value).toBe('');
    expect(router.refresh).toHaveBeenCalledOnce();
  });
});
