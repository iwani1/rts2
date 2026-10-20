// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FleetDashboardPage from './page';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  findUser: vi.fn(),
  findCompanies: vi.fn(),
  getSummary: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => { throw new Error(`NEXT_REDIRECT:${path}`); },
  notFound: () => { throw new Error('NEXT_NOT_FOUND'); },
}));
vi.mock('@/server/auth', () => ({ getAuth: () => ({ api: { getSession: mocks.getSession } }) }));
vi.mock('@/server/prisma', () => ({
  getPrisma: () => ({ user: { findUnique: mocks.findUser }, company: { findMany: mocks.findCompanies } }),
}));
vi.mock('@/modules/auth/policy', () => ({ mayStartSession: (status: string | undefined) => status === 'ACTIVE' }));
vi.mock('@/modules/auth/permissions', () => ({ PermissionDeniedError: class PermissionDeniedError extends Error {} }));
vi.mock('@/modules/fleet/vehicles', () => ({
  FleetCompanyNotFoundError: class FleetCompanyNotFoundError extends Error {},
  getVehicleRegisterSummary: mocks.getSummary,
}));

afterEach(cleanup);
beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: 'fleet-manager-1' } });
  mocks.findUser.mockResolvedValue({ status: 'ACTIVE' });
  mocks.findCompanies.mockResolvedValue([{ id: 'company-1', name: 'Richie Transport Services' }]);
  mocks.getSummary.mockResolvedValue({
    registeredVehicleCount: 5,
    byCategory: [{ category: 'Coach', count: 2 }, { category: 'Minibus', count: 3 }],
  });
});

describe('FleetDashboardPage', () => {
  it('redirects anonymous users before querying vehicle summaries', async () => {
    mocks.getSession.mockResolvedValue(null);

    await expect(FleetDashboardPage()).rejects.toThrow('NEXT_REDIRECT:/login');
    expect(mocks.getSummary).not.toHaveBeenCalled();
  });

  it('shows factual registered totals and labels unsupported operational metrics', async () => {
    const page = await FleetDashboardPage();
    render(page);

    expect(mocks.getSummary).toHaveBeenCalledWith({ actorId: 'fleet-manager-1', companyId: 'company-1' });
    expect(screen.getByRole('heading', { name: 'Fleet overview' })).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Non-archived vehicle record counts by supplied category' })).toBeTruthy();
    expect(screen.getByText(/does not represent operational availability/i)).toBeTruthy();
    expect(screen.getByText(/Availability, assignments, trips, maintenance/)).toBeTruthy();
  });

  it('does not query a vehicle summary when the operator company is not uniquely provisioned', async () => {
    mocks.findCompanies.mockResolvedValue([]);
    const page = await FleetDashboardPage();
    render(page);

    expect(screen.getByRole('heading', { name: 'Fleet overview unavailable' })).toBeTruthy();
    expect(mocks.getSummary).not.toHaveBeenCalled();
  });
});
