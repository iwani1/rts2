import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(), transitionRentalRequest: vi.fn(),
  PermissionDeniedError: class PermissionDeniedError extends Error {},
  RentalCompanyNotFoundError: class RentalCompanyNotFoundError extends Error {},
  RentalRequestNotFoundError: class RentalRequestNotFoundError extends Error {},
  RentalRequestTransitionNotAllowedError: class RentalRequestTransitionNotAllowedError extends Error {},
}));
vi.mock('@/server/auth', () => ({ getAuth: () => ({ api: { getSession: mocks.getSession } }) }));
vi.mock('@/modules/auth/permissions', () => ({ PermissionDeniedError: mocks.PermissionDeniedError }));
vi.mock('@/modules/rentals/rental-requests', () => ({
  transitionRentalRequest: mocks.transitionRentalRequest,
  RentalCompanyNotFoundError: mocks.RentalCompanyNotFoundError,
  RentalRequestNotFoundError: mocks.RentalRequestNotFoundError,
  RentalRequestTransitionNotAllowedError: mocks.RentalRequestTransitionNotAllowedError,
}));

import { POST } from './route';

const context = { params: Promise.resolve({ companyId: 'company-1', requestId: 'request-1' }) };
function post(body: unknown) {
  return new Request('http://localhost/api/companies/company-1/rental-requests/request-1/transition', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

describe('rental request review transition API', () => {
  beforeEach(() => vi.resetAllMocks());

  it('requires an authenticated actor', async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await POST(post({ toStatus: 'Under Review', reason: 'Review request details' }), context)).status).toBe(401);
    expect(mocks.transitionRentalRequest).not.toHaveBeenCalled();
  });

  it('derives actor and tenant identifiers from trusted context', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'ops-user' } });
    mocks.transitionRentalRequest.mockResolvedValue({ id: 'request-1', status: 'Under Review' });
    const response = await POST(post({ toStatus: 'Under Review', reason: 'Review request details' }), context);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(mocks.transitionRentalRequest).toHaveBeenCalledWith({ toStatus: 'Under Review', reason: 'Review request details' }, 'ops-user', 'company-1', 'request-1');
  });

  it('returns conflict when the source status does not permit the requested action', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'ops-user' } });
    mocks.transitionRentalRequest.mockRejectedValue(new mocks.RentalRequestTransitionNotAllowedError());
    const response = await POST(post({ toStatus: 'Declined', reason: 'Not suitable for requirements' }), context);
    expect(response.status).toBe(409);
  });
});
