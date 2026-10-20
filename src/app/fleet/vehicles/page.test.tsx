// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(), findUser: vi.fn(), findCompanies: vi.fn(), listVehicles: vi.fn(), getVehicle: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => { throw new Error(`NEXT_REDIRECT:${path}`); },
  notFound: () => { throw new Error('NEXT_NOT_FOUND'); },
}));
vi.mock('next/link', () => ({ default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a> }));
vi.mock('@/server/auth', () => ({ getAuth: () => ({ api: { getSession: mocks.getSession } }) }));
vi.mock('@/server/prisma', () => ({ getPrisma: () => ({ user: { findUnique: mocks.findUser }, company: { findMany: mocks.findCompanies } }) }));
vi.mock('@/modules/auth/permissions', () => ({ PermissionDeniedError: class PermissionDeniedError extends Error {} }));
vi.mock('@/modules/fleet/vehicles', () => ({
  FleetCompanyNotFoundError: class FleetCompanyNotFoundError extends Error {},
  InvalidVehicleCursorError: class InvalidVehicleCursorError extends Error {},
  VehicleNotFoundError: class VehicleNotFoundError extends Error {},
  getVehicle: mocks.getVehicle,
  listVehicles: mocks.listVehicles,
}));
vi.mock('./vehicle-manager', () => ({ VehicleManager: () => <div>Vehicle form</div> }));
vi.mock('./safety-block-controls', () => ({ SafetyBlockControls: () => <div>Safety block controls</div> }));

import { InvalidVehicleCursorError } from '@/modules/fleet/vehicles';
import VehiclesPage from './page';

afterEach(cleanup);
beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: 'manager-1' } });
  mocks.findUser.mockResolvedValue({ status: 'ACTIVE' });
  mocks.findCompanies.mockResolvedValue([{ id: 'company-1', name: 'Richie Transport Services' }]);
  mocks.listVehicles.mockResolvedValue({ vehicles: [], nextCursor: 'vehicle-next', canManage: true, canManageDrivers: true });
});

const vehicle = {
  id: 'vehicle-1', registrationNumber: 'GT-1234-25', make: 'Toyota', model: 'Hiace', category: 'Passenger van',
  seatCount: 12, fuelType: null, ownershipType: null, odometerValue: null, odometerUnit: null,
  insuranceExpiresAt: null, roadworthinessExpiresAt: null, registrationExpiresAt: null, nextServiceAt: null,
  notes: null, usualDriverId: null, usualDriverName: null, usualDriverArchived: false, safetyBlock: null,
  createdAt: new Date('2026-10-20T10:00:00.000Z'), updatedAt: new Date('2026-10-20T10:00:00.000Z'),
};

describe('VehiclesPage pagination', () => {
  it('preserves search and cursor history through navigation and opening a vehicle record', async () => {
    mocks.listVehicles.mockResolvedValue({ vehicles: [vehicle], nextCursor: 'vehicle-next', canManage: true, canManageDrivers: true });
    const page = await VehiclesPage({ searchParams: Promise.resolve({ q: 'Toyota', cursor: 'vehicle-current', cursorHistory: 'ROOT.vehicle-prior' }) });
    render(page);

    expect(mocks.listVehicles).toHaveBeenCalledWith({ actorId: 'manager-1', companyId: 'company-1', search: 'Toyota', cursor: 'vehicle-current' });
    expect(screen.getByRole('link', { name: 'Previous page' }).getAttribute('href')).toBe('/fleet/vehicles?q=Toyota&cursor=vehicle-prior&cursorHistory=ROOT');
    expect(screen.getByRole('link', { name: 'Next page' }).getAttribute('href')).toBe('/fleet/vehicles?q=Toyota&cursor=vehicle-next&cursorHistory=ROOT.vehicle-prior.vehicle-current');
    expect(screen.getByRole('link', { name: 'Edit' }).getAttribute('href')).toBe('/fleet/vehicles?q=Toyota&cursor=vehicle-current&cursorHistory=ROOT.vehicle-prior&edit=vehicle-1');
  });

  it('offers a clear-search action when no vehicle matches', async () => {
    mocks.listVehicles.mockResolvedValue({ vehicles: [], nextCursor: null, canManage: true, canManageDrivers: true });
    const page = await VehiclesPage({ searchParams: Promise.resolve({ q: 'no match' }) });
    render(page);
    expect(screen.getByRole('link', { name: 'Clear search' }).getAttribute('href')).toBe('/fleet/vehicles');
  });

  it('redirects from stale or foreign cursors instead of surfacing a server error', async () => {
    mocks.listVehicles.mockRejectedValue(new InvalidVehicleCursorError());
    await expect(VehiclesPage({ searchParams: Promise.resolve({ cursor: 'stale-cursor' }) })).rejects.toThrow('NEXT_REDIRECT:/fleet/vehicles');
  });

  it('rejects malformed cursor history before querying the vehicle register', async () => {
    await expect(VehiclesPage({ searchParams: Promise.resolve({ cursorHistory: 'ROOT.bad.token!' }) })).rejects.toThrow('NEXT_REDIRECT:/fleet/vehicles');
    expect(mocks.listVehicles).not.toHaveBeenCalled();
  });
});
