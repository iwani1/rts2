import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  listRentalRequests: vi.fn(),
  createRentalRequest: vi.fn(),
  PermissionDeniedError: class PermissionDeniedError extends Error {},
  RentalCompanyNotFoundError: class RentalCompanyNotFoundError extends Error {},
  RentalCustomerNotFoundError: class RentalCustomerNotFoundError extends Error {},
  InvalidRentalRequestCursorError: class InvalidRentalRequestCursorError extends Error {},
}));

vi.mock('@/server/auth', () => ({ getAuth: () => ({ api: { getSession: mocks.getSession } }) }));
vi.mock('@/modules/auth/permissions', () => ({ PermissionDeniedError: mocks.PermissionDeniedError }));
vi.mock('@/modules/rentals/rental-requests', () => ({
  listRentalRequests: mocks.listRentalRequests,
  createRentalRequest: mocks.createRentalRequest,
  RentalCompanyNotFoundError: mocks.RentalCompanyNotFoundError,
  RentalCustomerNotFoundError: mocks.RentalCustomerNotFoundError,
  InvalidRentalRequestCursorError: mocks.InvalidRentalRequestCursorError,
}));

import { GET, POST } from './route';

const context = { params: Promise.resolve({ companyId: 'company-1' }) };

describe('company rental request collection API', () => {
  beforeEach(() => vi.resetAllMocks());

  it('requires authentication before listing requests', async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await GET(new Request('http://localhost/api/companies/company-1/rental-requests'), context);
    expect(response.status).toBe(401);
    expect(mocks.listRentalRequests).not.toHaveBeenCalled();
  });

  it('passes tenant, search and session actor to the listing service', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'user-1' } });
    mocks.listRentalRequests.mockResolvedValue({ requests: [], nextCursor: null, canManage: true });
    const response = await GET(new Request('http://localhost/api/companies/company-1/rental-requests?search=Kumasi&status=Submitted'), context);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(mocks.listRentalRequests).toHaveBeenCalledWith({ actorId: 'user-1', companyId: 'company-1', search: 'Kumasi', status: 'Submitted', cursor: undefined });
  });

  it('creates a request only using the actor from the authenticated session', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'user-1' } });
    mocks.createRentalRequest.mockResolvedValue({ id: 'request-1', status: 'Draft' });
    const body = { customerId: 'customer-1', reason: 'Record phone enquiry' };
    const response = await POST(new Request('http://localhost/api/companies/company-1/rental-requests', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }), context);
    expect(response.status).toBe(201);
    expect(mocks.createRentalRequest).toHaveBeenCalledWith(body, 'user-1', 'company-1');
  });
});
