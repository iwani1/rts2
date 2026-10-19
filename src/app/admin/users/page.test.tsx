// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminUsersPage from './page';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  isActiveSuperAdmin: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => { throw new Error(`NEXT_REDIRECT:${path}`); },
}));
vi.mock('@/server/auth', () => ({ getAuth: () => ({ api: { getSession: mocks.getSession } }) }));
vi.mock('@/modules/auth/permissions', () => ({ isActiveSuperAdmin: mocks.isActiveSuperAdmin }));
vi.mock('@/server/prisma', () => ({ getPrisma: () => ({ user: { findMany: mocks.findMany } }) }));
vi.mock('@/app/logout-button', () => ({ LogoutButton: () => <button type="button">Sign out</button> }));

afterEach(cleanup);
beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: 'admin-1', name: 'Admin', email: 'admin@example.invalid' } });
  mocks.isActiveSuperAdmin.mockResolvedValue(true);
  mocks.findMany.mockResolvedValue([]);
});

describe('AdminUsersPage', () => {
  it('redirects anonymous users before querying accounts', async () => {
    mocks.getSession.mockResolvedValue(null);

    await expect(AdminUsersPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_REDIRECT:/login');
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it('denies non-super-administrators before querying accounts', async () => {
    mocks.isActiveSuperAdmin.mockResolvedValue(false);

    await expect(AdminUsersPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_REDIRECT:/');
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it('searches by name or email and preserves the query across pagination', async () => {
    mocks.findMany.mockResolvedValue(Array.from({ length: 51 }, (_, index) => ({
      id: `user-${index}`,
      name: `Test User ${index}`,
      email: `user-${index}@example.invalid`,
      status: 'ACTIVE',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    })));
    const page = await AdminUsersPage({ searchParams: Promise.resolve({ q: '  driver  ', page: '2' }) });
    render(page);

    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { OR: [
        { name: { contains: 'driver', mode: 'insensitive' } },
        { email: { contains: 'driver', mode: 'insensitive' } },
      ] },
      skip: 100,
      take: 51,
    }));
    expect(screen.getByRole('heading', { name: 'User roles' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Previous page' }).getAttribute('href')).toBe('/admin/users?q=driver&page=1');
    expect(screen.getByRole('link', { name: 'Next page' }).getAttribute('href')).toBe('/admin/users?q=driver&page=3');
  });

  it('offers a clear-search link when no account matches', async () => {
    const page = await AdminUsersPage({ searchParams: Promise.resolve({ q: 'missing@example.invalid' }) });
    render(page);

    expect(screen.getByRole('heading', { name: 'No users found' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Clear search' }).getAttribute('href')).toBe('/admin/users');
  });
});
