// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestManager } from './request-manager';

const { router } = vi.hoisted(() => ({ router: { refresh: vi.fn(), push: vi.fn() } }));
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

describe('RequestManager', () => {
  it('records a partial enquiry as a Draft linked to an existing customer without assigning a vehicle', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.includes('/customers?')) {
        return new Response(JSON.stringify({ customers: [{ id: 'customer-1', displayName: 'Ama Transport', reference: 'C-1' }] }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/rental-requests') && init?.method === 'POST') {
        return new Response(JSON.stringify({ rentalRequest: { id: 'request-1', status: 'Draft' } }), {
          status: 201, headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<RequestManager companyId="company-1" />);
    await user.type(screen.getByLabelText('Search existing customers'), 'Ama');
    await user.click(await screen.findByRole('button', { name: /Ama Transport/ }));
    await user.type(screen.getByLabelText('Reason for recording or updating this Draft'), 'Capture phone enquiry');
    await user.selectOptions(screen.getByLabelText('Request source'), 'PHONE');
    await user.click(screen.getByRole('button', { name: 'Save Draft' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/companies/company-1/rental-requests', expect.objectContaining({ method: 'POST' }),
    ));
    const saveCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    const payload = JSON.parse(String(saveCall?.[1]?.body)) as Record<string, unknown>;
    expect(payload).toMatchObject({ customerId: 'customer-1', requestSource: 'PHONE', reason: 'Capture phone enquiry' });
    expect(payload.serviceDate).toBeNull();
    expect(payload.returnTime).toBeNull();
    expect(payload.durationMinutes).toBeNull();
    expect(payload).not.toHaveProperty('vehicleId');
    expect(payload).not.toHaveProperty('status');
    expect(await screen.findByText('Rental request saved as Draft.')).toBeTruthy();
    expect(router.refresh).toHaveBeenCalledOnce();
  });

  it('submits an existing Draft with an audited reason', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      if (String(input).endsWith('/request-2') && init?.method === 'PUT') {
        return new Response(JSON.stringify({ rentalRequest: { id: 'request-2', status: 'Draft' } }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      }
      if (String(input).endsWith('/submit') && init?.method === 'POST') {
        return new Response(JSON.stringify({ rentalRequest: { id: 'request-2', status: 'Submitted' } }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`Unexpected request: ${String(input)}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const request = {
      id: 'request-2', customerId: 'customer-1', customerName: 'Ama Transport', customerArchived: false,
      serviceDate: null, departureTime: null, returnTime: null, durationMinutes: null,
      pickupLocation: null, destination: null, intermediateStops: null, passengerCount: null,
      luggageSpecialNeeds: null, purpose: null, requestedVehicleType: null, driverRequirement: null,
      tripContactName: null, tripContactTelephone: null, tripContactEmail: null, notes: null,
      requestSource: null, status: 'Draft', createdAt: new Date(), updatedAt: new Date(),
    };

    render(<RequestManager companyId="company-1" request={request} />);
    await user.type(screen.getByLabelText('Reason for recording or updating this Draft'), 'Verified request details');
    await user.click(screen.getByRole('button', { name: 'Submit request' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/companies/company-1/rental-requests/request-2/submit', expect.objectContaining({ method: 'POST' }),
    ));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const saveCall = fetchMock.mock.calls[0];
    expect(saveCall?.[1]?.method).toBe('PUT');
    const submitCall = fetchMock.mock.calls[1];
    expect(JSON.parse(String(submitCall?.[1]?.body))).toEqual({ reason: 'Verified request details' });
    expect(await screen.findByText('Rental request submitted.')).toBeTruthy();
    expect(router.refresh).toHaveBeenCalledOnce();
  });
});
