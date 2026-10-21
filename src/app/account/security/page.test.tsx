// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SecurityPage from './page';

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), getTwoFactorGate: vi.fn() }));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => { throw new Error(`NEXT_REDIRECT:${path}`); },
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock('@/server/auth', () => ({ getAuth: () => ({ api: { getSession: mocks.getSession } }) }));
vi.mock('@/modules/auth/two-factor-gate', () => ({ getTwoFactorGate: mocks.getTwoFactorGate }));
vi.mock('@/lib/auth-client', () => ({ authClient: { twoFactor: {} } }));

afterEach(cleanup);
beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: 'admin-1' } });
});

describe('SecurityPage (AUTH-06 / D-076)', () => {
  it('renders the enrolment actions for a privileged user who must enrol', async () => {
    mocks.getTwoFactorGate.mockResolvedValue({ enabled: false, required: true, mustEnroll: true });
    render(await SecurityPage({ searchParams: Promise.resolve({ required: '1' }) }));
    expect(screen.getByRole('heading', { name: 'Two-factor authentication' })).toBeTruthy();
    expect(screen.getByText(/two-factor authentication is required/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start setup' })).toBeTruthy();
  });

  it('renders the removal actions when 2FA is already on', async () => {
    mocks.getTwoFactorGate.mockResolvedValue({ enabled: true, required: true, mustEnroll: false });
    render(await SecurityPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText(/Status:/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Turn off 2FA' })).toBeTruthy();
  });

  it('redirects anonymous users to login', async () => {
    mocks.getSession.mockResolvedValue(null);
    await expect(SecurityPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_REDIRECT:/login');
    expect(mocks.getTwoFactorGate).not.toHaveBeenCalled();
  });
});
