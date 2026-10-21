// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RentalRequestRecord } from '@/modules/rentals/rental-requests';

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
import { RentalRequestTransitionManager } from './rental-request-transition-manager';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const request = (status: string) => ({ id: 'request-1', status }) as RentalRequestRecord;

describe('RentalRequestTransitionManager', () => {
  it('moves a submitted request to review with a required reason and makes no reservation request', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ rentalRequest: { status: 'Under Review' } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<RentalRequestTransitionManager companyId="company-1" request={request('Submitted')} />);
    expect(screen.getByText(/prepare pricing and then confirm the booking from the lifecycle panel/i)).toBeTruthy();
    const button = screen.getByRole('button', { name: 'Start review' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Reason for this status change'), { target: { value: 'Review request details' } });
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Rental request moved to Under Review.'));
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ toStatus: 'Under Review', reason: 'Review request details' });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/transition');
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it('offers only a reasoned decline from Under Review and explains its terminal effect', () => {
    render(<RentalRequestTransitionManager companyId="company-1" request={request('Under Review')} />);
    expect(screen.getByRole('button', { name: 'Decline request' })).toBeTruthy();
    expect(screen.getByText(/Declining is terminal in this workflow/i)).toBeTruthy();
  });

  it('offers no transition for other states', () => {
    const { container } = render(<RentalRequestTransitionManager companyId="company-1" request={request('Confirmed')} />);
    expect(container.firstChild).toBeNull();
  });
});
