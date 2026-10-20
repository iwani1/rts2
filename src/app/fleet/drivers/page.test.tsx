// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(), findUser: vi.fn(), findCompanies: vi.fn(), listDrivers: vi.fn(),
  getDriver: vi.fn(), resolvePermission: vi.fn(),
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
  resolvePermission: mocks.resolvePermission,
}));
vi.mock('@/modules/fleet/drivers', () => ({
  DriverCompanyNotFoundError: class DriverCompanyNotFoundError extends Error {},
  DriverNotFoundError: class DriverNotFoundError extends Error {},
  InvalidDriverCursorError: class InvalidDriverCursorError extends Error {},
  getDriver: mocks.getDriver,
  listDrivers: mocks.listDrivers,
}));
vi.mock('./driver-manager', () => ({ DriverManager: () => <div>Driver form</div> }));

import { InvalidDriverCursorError } from '@/modules/fleet/drivers';
import DriversPage from './page';

afterEach(cleanup);
beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: 'manager-1' } });
  mocks.findUser.mockResolvedValue({ status: 'ACTIVE' });
  mocks.findCompanies.mockResolvedValue([{ id: 'company-1', name: 'Richie Transport Services' }]);
  mocks.listDrivers.mockResolvedValue({ drivers: [], nextCursor: 'driver-next', canManage: true });
  mocks.resolvePermission.mockResolvedValue({ allowed: true, scopes: ['COMPANY'] });
});

const driver = {
  id: 'driver-1', fullName: 'Test Driver', licenceClass: null, licenceExpiresAt: null,
  qualifications: null, availability: null, status: null,
  createdAt: new Date('2026-10-20T10:00:00.000Z'), updatedAt: new Date('2026-10-20T10:00:00.000Z'),
};

describe('DriversPage pagination', () => {
  it('preserves search and cursor history through navigation and opening a driver record', async () => {
    mocks.listDrivers.mockResolvedValue({ drivers: [driver], nextCursor: 'driver-next', canManage: true });
    const page = await DriversPage({ searchParams: Promise.resolve({ q: 'Test', cursor: 'driver-current', cursorHistory: 'ROOT.driver-prior' }) });
    render(page);

    expect(mocks.listDrivers).toHaveBeenCalledWith({ actorId: 'manager-1', companyId: 'company-1', search: 'Test', cursor: 'driver-current' });
    expect(screen.getByRole('link', { name: 'Previous page' }).getAttribute('href')).toBe('/fleet/drivers?q=Test&cursor=driver-prior&cursorHistory=ROOT');
    expect(screen.getByRole('link', { name: 'Next page' }).getAttribute('href')).toBe('/fleet/drivers?q=Test&cursor=driver-next&cursorHistory=ROOT.driver-prior.driver-current');
    expect(screen.getByRole('link', { name: 'Edit' }).getAttribute('href')).toBe('/fleet/drivers?q=Test&cursor=driver-current&cursorHistory=ROOT.driver-prior&edit=driver-1');
  });

  it('offers a clear-search action when no driver matches', async () => {
    mocks.listDrivers.mockResolvedValue({ drivers: [], nextCursor: null, canManage: true });
    const page = await DriversPage({ searchParams: Promise.resolve({ q: 'no match' }) });
    render(page);
    expect(screen.getByRole('link', { name: 'Clear search' }).getAttribute('href')).toBe('/fleet/drivers');
  });

  it('redirects from stale or foreign cursors instead of surfacing a server error', async () => {
    mocks.listDrivers.mockRejectedValue(new InvalidDriverCursorError());
    await expect(DriversPage({ searchParams: Promise.resolve({ cursor: 'stale-cursor' }) })).rejects.toThrow('NEXT_REDIRECT:/fleet/drivers');
  });

  it('rejects malformed cursor history before querying the driver register', async () => {
    await expect(DriversPage({ searchParams: Promise.resolve({ cursorHistory: 'ROOT.bad.token!' }) })).rejects.toThrow('NEXT_REDIRECT:/fleet/drivers');
    expect(mocks.listDrivers).not.toHaveBeenCalled();
  });
});
