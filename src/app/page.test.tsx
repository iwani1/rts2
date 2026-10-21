// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), findUser: vi.fn(), findCompanies: vi.fn(), findUserRoleAssignment: vi.fn(), resolvePermission: vi.fn(), isActiveSuperAdmin: vi.fn(), countNotifications: vi.fn() }));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`NEXT_REDIRECT:${path}`); } }));
vi.mock('next/link', () => ({ default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a> }));
vi.mock('@/server/auth', () => ({ getAuth: () => ({ api: { getSession: mocks.getSession } }) }));
vi.mock('@/server/prisma', () => ({ getPrisma: () => ({ user: { findUnique: mocks.findUser }, company: { findMany: mocks.findCompanies }, userRoleAssignment: { findFirst: mocks.findUserRoleAssignment }, notification: { count: mocks.countNotifications } }) }));
vi.mock('@/modules/auth/permissions', () => ({ resolvePermission: mocks.resolvePermission, isActiveSuperAdmin: mocks.isActiveSuperAdmin }));
vi.mock('./logout-button', () => ({ LogoutButton: () => <button type="button">Sign out</button> }));

import Home from './page';

afterEach(cleanup);
beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: 'user-1', name: 'Operations User', email: 'ops@example.invalid' } });
  mocks.findUser.mockResolvedValue({ status: 'ACTIVE' });
  mocks.findCompanies.mockResolvedValue([{ id: 'company-1' }]);
  mocks.resolvePermission.mockResolvedValue({ allowed: true, scopes: ['COMPANY'] });
  mocks.isActiveSuperAdmin.mockResolvedValue(false);
  mocks.findUserRoleAssignment.mockResolvedValue(null);
  mocks.countNotifications.mockResolvedValue(2);
});

describe('workspace company selection', () => {
  it('shows company register navigation when exactly one active company exists', async () => {
    const page = await Home();
    render(page);
    expect(screen.getByRole('link', { name: 'Vehicle register' }).getAttribute('href')).toBe('/fleet/vehicles');
    expect(screen.getByRole('link', { name: 'Rental requests' }).getAttribute('href')).toBe('/rentals/requests');
    expect(screen.getByRole('link', { name: 'Notifications (2 new)' }).getAttribute('href')).toBe('/notifications');
    expect(screen.queryByRole('status')).toBeNull();
    expect(mocks.findCompanies).toHaveBeenCalledWith(expect.objectContaining({ take: 2, where: { status: 'ACTIVE' } }));
  });

  it('does not guess a tenant when several active companies are provisioned', async () => {
    mocks.findCompanies.mockResolvedValue([{ id: 'company-1' }, { id: 'company-2' }]);
    const page = await Home();
    render(page);
    expect(screen.queryByRole('link', { name: 'Vehicle register' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Rental requests' })).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('exactly one active operator company');
    expect(mocks.resolvePermission).toHaveBeenCalledOnce();
    expect(mocks.resolvePermission).toHaveBeenCalledWith({ userId: 'user-1', permission: 'audit:read' });
  });

  it('does not show company registers before any active company is provisioned', async () => {
    mocks.findCompanies.mockResolvedValue([]);
    const page = await Home();
    render(page);
    expect(screen.queryByRole('link', { name: 'Vehicle register' })).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('exactly one active operator company');
    expect(mocks.resolvePermission).toHaveBeenCalledOnce();
    expect(mocks.resolvePermission).toHaveBeenCalledWith({ userId: 'user-1', permission: 'audit:read' });
  });
});
