import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  submitRentalRequest: vi.fn(),
  PermissionDeniedError: class PermissionDeniedError extends Error {},
  RentalCompanyNotFoundError: class RentalCompanyNotFoundError extends Error {},
  RentalRequestMissingSubmissionFieldsError: class RentalRequestMissingSubmissionFieldsError extends Error {
    constructor(readonly missingFields: string[]) { super('Required details are missing.'); }
  },
  RentalRequestNotDraftError: class RentalRequestNotDraftError extends Error {},
  RentalRequestNotFoundError: class RentalRequestNotFoundError extends Error {},
}));

vi.mock('@/server/auth', () => ({ getAuth: () => ({ api: { getSession: mocks.getSession } }) }));
vi.mock('@/modules/auth/permissions', () => ({ PermissionDeniedError: mocks.PermissionDeniedError }));
vi.mock('@/modules/rentals/rental-requests', () => ({
  submitRentalRequest: mocks.submitRentalRequest,
  RentalCompanyNotFoundError: mocks.RentalCompanyNotFoundError,
  RentalRequestMissingSubmissionFieldsError: mocks.RentalRequestMissingSubmissionFieldsError,
  RentalRequestNotDraftError: mocks.RentalRequestNotDraftError,
  RentalRequestNotFoundError: mocks.RentalRequestNotFoundError,
}));

import { POST } from './route';

const context = { params: Promise.resolve({ companyId: 'company-1', requestId: 'request-1' }) };

describe('submit rental request API', () => {
  beforeEach(() => vi.resetAllMocks());

  it('requires authentication before submission', async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(new Request('http://localhost/api/companies/company-1/rental-requests/request-1/submit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'Submit after review' }),
    }), context);
    expect(response.status).toBe(401);
    expect(mocks.submitRentalRequest).not.toHaveBeenCalled();
  });

  it('uses the authenticated actor and route identifiers', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'user-1' } });
    mocks.submitRentalRequest.mockResolvedValue({ id: 'request-1', status: 'Submitted' });
    const response = await POST(new Request('http://localhost/api/companies/company-1/rental-requests/request-1/submit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'Submit after review' }),
    }), context);
    expect(response.status).toBe(200);
    expect(mocks.submitRentalRequest).toHaveBeenCalledWith({ reason: 'Submit after review' }, 'user-1', 'company-1', 'request-1');
  });

  it('denies a session whose role cannot submit rental requests', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'dispatcher-1' } });
    mocks.submitRentalRequest.mockRejectedValue(new mocks.PermissionDeniedError());
    const response = await POST(new Request('http://localhost/api/companies/company-1/rental-requests/request-1/submit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'Dispatcher attempt' }),
    }), context);
    expect(response.status).toBe(403);
    expect(mocks.submitRentalRequest).toHaveBeenCalledWith({ reason: 'Dispatcher attempt' }, 'dispatcher-1', 'company-1', 'request-1');
  });

  it('explains which required fields are missing', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'user-1' } });
    mocks.submitRentalRequest.mockRejectedValue(new mocks.RentalRequestMissingSubmissionFieldsError(['service date', 'passenger count']));
    const response = await POST(new Request('http://localhost/api/companies/company-1/rental-requests/request-1/submit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'Submission attempt reason' }),
    }), context);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ missingFields: ['service date', 'passenger count'] });
  });
});
