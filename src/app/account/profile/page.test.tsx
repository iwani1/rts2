// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AccountProfilePage from './page';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  findUnique: vi.fn(),
  mayStartSession: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`NEXT_REDIRECT:${path}`); } }));
vi.mock('@/server/auth', () => ({ getAuth: () => ({ api: { getSession: mocks.getSession } }) }));
vi.mock('@/server/prisma', () => ({ getPrisma: () => ({ user: { findUnique: mocks.findUnique } }) }));
vi.mock('@/modules/auth/policy', () => ({ mayStartSession: mocks.mayStartSession }));

afterEach(cleanup);
beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: 'user-self' } });
  mocks.mayStartSession.mockReturnValue(true);
  mocks.findUnique.mockResolvedValue({
    name: 'Ama Example',
    email: 'ama@example.invalid',
    status: 'ACTIVE',
    createdAt: new Date('2025-03-14T12:00:00.000Z'),
  });
});

describe('AccountProfilePage', () => {
  it('redirects anonymous users before looking up a profile', async () => {
    mocks.getSession.mockResolvedValue(null);

    await expect(AccountProfilePage()).rejects.toThrow('NEXT_REDIRECT:/login');
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it('redirects accounts that cannot start a session', async () => {
    mocks.mayStartSession.mockReturnValue(false);

    await expect(AccountProfilePage()).rejects.toThrow('NEXT_REDIRECT:/login');
    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-self' },
      select: { name: true, email: true, status: true, createdAt: true },
    });
  });

  it('shows only the authenticated user profile with account and password links', async () => {
    const page = await AccountProfilePage();
    render(page);

    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-self' },
      select: { name: true, email: true, status: true, createdAt: true },
    });
    expect(screen.getByRole('heading', { name: 'My profile' })).toBeTruthy();
    expect(screen.getByText('Ama Example')).toBeTruthy();
    expect(screen.getByText('ama@example.invalid')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Change password' }).getAttribute('href')).toBe('/account/security');
    expect(screen.getByRole('link', { name: 'Back to workspace' }).getAttribute('href')).toBe('/');
    expect(screen.getByText(/Profile editing and login-history views are not available/)).toBeTruthy();
  });
});
