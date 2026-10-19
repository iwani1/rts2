// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomerManager } from './customer-manager';
import type { CustomerRecord } from '@/modules/customers/customers';

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

const existingCustomer: CustomerRecord = {
  id: 'customer-1', reference: 'GH-REF-01', displayName: 'Accra Shuttle Services', contactPerson: 'Ama Owusu',
  telephone: '+233 20 000 0000', email: 'ama@example.invalid', billingDetails: 'Accounts office',
  customerType: 'Organisation', status: 'Active', notes: 'Verified record',
  createdAt: new Date('2026-10-19T08:00:00.000Z'), updatedAt: new Date('2026-10-19T08:00:00.000Z'),
};

describe('CustomerManager', () => {
  it('creates a customer with no type or status defaults and sends only entered approved fields', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<CustomerManager companyId="company-1" />);

    expect((screen.getByLabelText('Customer type (optional)') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Status (optional)') as HTMLInputElement).value).toBe('');
    await user.type(screen.getByLabelText('Customer or organisation name'), 'Coastal Coach Hire');
    await user.type(screen.getByLabelText('Reason for creation'), 'Verified customer registration details');
    await user.click(screen.getByRole('button', { name: 'Add customer' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('/api/companies/company-1/customers');
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST');
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      reference: null, displayName: 'Coastal Coach Hire', contactPerson: null, telephone: null, email: null,
      billingDetails: null, customerType: null, status: null, notes: null, reason: 'Verified customer registration details',
    });
    expect((await screen.findByRole('status')).textContent).toContain('Customer record saved.');
    expect(router.refresh).toHaveBeenCalledOnce();
  });

  it('keeps the entered data and reports a duplicate-reference rejection without showing success', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      error: 'That customer reference is already in use for this company.',
    }), { status: 409 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<CustomerManager companyId="company-1" />);

    const nameInput = screen.getByLabelText('Customer or organisation name') as HTMLInputElement;
    const referenceInput = screen.getByLabelText('Customer reference (optional)') as HTMLInputElement;
    await user.type(nameInput, 'Coastal Coach Hire');
    await user.type(referenceInput, 'GH-REF-01');
    await user.type(screen.getByLabelText('Reason for creation'), 'Verify new customer reference');
    await user.click(screen.getByRole('button', { name: 'Add customer' }));

    expect((await screen.findByRole('alert')).textContent).toContain('already in use');
    expect(nameInput.value).toBe('Coastal Coach Hire');
    expect(referenceInput.value).toBe('GH-REF-01');
    expect(screen.queryByRole('status')).toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('updates an existing customer with an audited reason', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<CustomerManager companyId="company-1" customer={existingCustomer} />);

    expect((screen.getByLabelText('Customer or organisation name') as HTMLInputElement).value).toBe('Accra Shuttle Services');
    await user.clear(screen.getByLabelText('Notes'));
    await user.type(screen.getByLabelText('Notes'), 'Updated billing contact confirmed');
    await user.type(screen.getByLabelText('Reason for change'), 'Owner confirmed updated notes');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('/api/companies/company-1/customers/customer-1');
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('PUT');
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      displayName: 'Accra Shuttle Services', reference: 'GH-REF-01', notes: 'Updated billing contact confirmed',
      reason: 'Owner confirmed updated notes',
    });
    expect((await screen.findByRole('status')).textContent).toContain('Customer record saved.');
    expect(router.refresh).toHaveBeenCalledOnce();
  });

  it('reports archive failures and stays on the customer record', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      error: 'The request could not be completed.',
    }), { status: 500 })));
    render(<CustomerManager companyId="company-1" customer={existingCustomer} />);

    await user.click(screen.getByText('Archive this customer'));
    await user.type(screen.getByLabelText('Reason for archiving'), 'Customer relationship ended');
    await user.click(screen.getByRole('button', { name: 'Archive customer' }));
    expect((await screen.findByRole('alert')).textContent).toContain('could not be completed');
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Edit Accra Shuttle Services' })).toBeTruthy();
  });

  it('requires an archive reason and archives without deleting the record in the UI', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<CustomerManager companyId="company-1" customer={existingCustomer} />);

    await user.click(screen.getByText('Archive this customer'));
    const archiveButton = screen.getByRole('button', { name: 'Archive customer' }) as HTMLButtonElement;
    expect(archiveButton.disabled).toBe(false);
    const archiveReason = screen.getByLabelText('Reason for archiving') as HTMLInputElement;
    expect(archiveReason.required).toBe(true);
    await user.click(archiveButton);
    expect(fetchMock).not.toHaveBeenCalled();
    await user.type(archiveReason, 'Customer relationship ended');
    await user.click(archiveButton);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('/api/companies/company-1/customers/customer-1');
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('DELETE');
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ reason: 'Customer relationship ended' });
    expect(router.push).toHaveBeenCalledWith('/customers');
  });
});
