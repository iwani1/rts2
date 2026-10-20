// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(), findUser: vi.fn(), findCompanies: vi.fn(), listRentalRequests: vi.fn(),
  getRentalRequest: vi.fn(), resolvePermission: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => { throw new Error(`NEXT_REDIRECT:${path}`); },
  notFound: () => { throw new Error('NEXT_NOT_FOUND'); },
}));
vi.mock('next/link', () => ({ default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a> }));
vi.mock('@/server/auth', () => ({ getAuth: () => ({ api: { getSession: mocks.getSession } }) }));
vi.mock('@/server/prisma', () => ({ getPrisma: () => ({ user: { findUnique: mocks.findUser }, company: { findMany: mocks.findCompanies } }) }));
vi.mock('@/modules/auth/permissions', () => ({
  PermissionDeniedError: class PermissionDeniedError extends Error {},
  isActiveSuperAdmin: vi.fn(),
  resolvePermission: mocks.resolvePermission,
}));
vi.mock('@/modules/rentals/rental-requests', () => ({
  RentalCompanyNotFoundError: class RentalCompanyNotFoundError extends Error {},
  RentalRequestNotFoundError: class RentalRequestNotFoundError extends Error {},
  getRentalRequest: mocks.getRentalRequest,
  listRentalRequests: mocks.listRentalRequests,
}));
vi.mock('@/modules/settings/registry', () => ({ listCompanySettingStatus: vi.fn() }));
vi.mock('./request-manager', () => ({ RequestManager: () => <div>Draft request form</div> }));
vi.mock('./rental-request-transition-manager', () => ({ RentalRequestTransitionManager: () => <div>Transition controls</div> }));
vi.mock('./rental-request-details', () => ({ RentalRequestDetails: () => <div>Request detail</div> }));
vi.mock('./quotation-readiness', () => ({ QuotationReadiness: () => <div>Quotation readiness</div> }));
vi.mock('./pricing-preview', () => ({ RentalPricingPreview: () => <div>Pricing preview</div> }));

import RentalRequestsPage from './page';

afterEach(cleanup);
beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: 'manager-1' } });
  mocks.findUser.mockResolvedValue({ status: 'ACTIVE' });
  mocks.findCompanies.mockResolvedValue([{ id: 'company-1', name: 'Richie Transport Services' }]);
  mocks.listRentalRequests.mockResolvedValue({ requests: [], nextCursor: 'request-next', canManage: true });
  mocks.resolvePermission.mockResolvedValue({ allowed: true, scopes: ['COMPANY'] });
});

describe('RentalRequestsPage pagination', () => {
  it('preserves search and cursor history when moving between result pages', async () => {
    mocks.listRentalRequests.mockResolvedValue({ requests: [{
      id: 'request-1', customerName: 'Test Customer', serviceDate: null, departureTime: null,
      pickupLocation: null, destination: null, status: 'Submitted', returnTime: null, returnDate: null,
    }], nextCursor: 'request-next', canManage: true });
    const page = await RentalRequestsPage({ searchParams: Promise.resolve({ q: 'Accra', cursor: 'request-current', cursorHistory: 'ROOT.request-prior' }) });
    render(page);

    expect(screen.getByRole('link', { name: 'Previous page' }).getAttribute('href')).toBe('/rentals/requests?q=Accra&cursor=request-prior&cursorHistory=ROOT');
    expect(screen.getByRole('link', { name: 'Next page' }).getAttribute('href')).toBe('/rentals/requests?q=Accra&cursor=request-next&cursorHistory=ROOT.request-prior.request-current');
    expect(screen.getByRole('link', { name: 'View / edit' }).getAttribute('href')).toBe('/rentals/requests?q=Accra&cursor=request-current&cursorHistory=ROOT.request-prior&edit=request-1');
  });

  it('offers a clear-search action when no request matches', async () => {
    mocks.listRentalRequests.mockResolvedValue({ requests: [], nextCursor: null, canManage: true });
    const page = await RentalRequestsPage({ searchParams: Promise.resolve({ q: 'no match' }) });
    render(page);

    expect(screen.getByRole('heading', { name: 'No rental requests found' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Clear search' }).getAttribute('href')).toBe('/rentals/requests');
  });

  it('rejects malformed cursor-history tokens before listing requests', async () => {
    await expect(RentalRequestsPage({ searchParams: Promise.resolve({ cursorHistory: 'ROOT.bad.token!' }) })).rejects.toThrow('NEXT_REDIRECT:/rentals/requests');
    expect(mocks.listRentalRequests).not.toHaveBeenCalled();
  });
});
