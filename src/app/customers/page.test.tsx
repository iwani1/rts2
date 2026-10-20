// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(), findUser: vi.fn(), findCompanies: vi.fn(), listCustomers: vi.fn(),
  getCustomer: vi.fn(), resolvePermission: vi.fn(),
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
vi.mock('@/modules/customers/customers', () => ({
  CustomerCompanyNotFoundError: class CustomerCompanyNotFoundError extends Error {},
  CustomerNotFoundError: class CustomerNotFoundError extends Error {},
  InvalidCustomerCursorError: class InvalidCustomerCursorError extends Error {},
  getCustomer: mocks.getCustomer,
  listCustomers: mocks.listCustomers,
}));
vi.mock('./customer-manager', () => ({ CustomerManager: () => <div>Customer form</div> }));

import { InvalidCustomerCursorError } from '@/modules/customers/customers';
import CustomersPage from './page';

afterEach(cleanup);
beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: 'manager-1' } });
  mocks.findUser.mockResolvedValue({ status: 'ACTIVE' });
  mocks.findCompanies.mockResolvedValue([{ id: 'company-1', name: 'Richie Transport Services' }]);
  mocks.listCustomers.mockResolvedValue({ customers: [], nextCursor: 'customer-next', canManage: true });
  mocks.resolvePermission.mockResolvedValue({ allowed: true, scopes: ['COMPANY'] });
});

const customer = {
  id: 'customer-1', reference: 'CUS-001', displayName: 'Test Customer', contactPerson: null,
  telephone: null, email: null, billingDetails: null, customerType: null, status: null, notes: null,
  createdAt: new Date('2026-10-20T10:00:00.000Z'), updatedAt: new Date('2026-10-20T10:00:00.000Z'),
};

describe('CustomersPage pagination', () => {
  it('preserves search and cursor history through navigation and opening a customer record', async () => {
    mocks.listCustomers.mockResolvedValue({ customers: [customer], nextCursor: 'customer-next', canManage: true });
    const page = await CustomersPage({ searchParams: Promise.resolve({ q: 'Test', cursor: 'customer-current', cursorHistory: 'ROOT.customer-prior' }) });
    render(page);

    expect(mocks.listCustomers).toHaveBeenCalledWith({ actorId: 'manager-1', companyId: 'company-1', search: 'Test', cursor: 'customer-current' });
    expect(screen.getByRole('link', { name: 'Previous page' }).getAttribute('href')).toBe('/customers?q=Test&cursor=customer-prior&cursorHistory=ROOT');
    expect(screen.getByRole('link', { name: 'Next page' }).getAttribute('href')).toBe('/customers?q=Test&cursor=customer-next&cursorHistory=ROOT.customer-prior.customer-current');
    expect(screen.getByRole('link', { name: 'Edit / history' }).getAttribute('href')).toBe('/customers?q=Test&cursor=customer-current&cursorHistory=ROOT.customer-prior&edit=customer-1');
  });

  it('offers a clear-search action when no customer matches', async () => {
    mocks.listCustomers.mockResolvedValue({ customers: [], nextCursor: null, canManage: true });
    const page = await CustomersPage({ searchParams: Promise.resolve({ q: 'no match' }) });
    render(page);
    expect(screen.getByRole('link', { name: 'Clear search' }).getAttribute('href')).toBe('/customers');
  });

  it('redirects from stale or foreign cursors instead of surfacing a server error', async () => {
    mocks.listCustomers.mockRejectedValue(new InvalidCustomerCursorError());
    await expect(CustomersPage({ searchParams: Promise.resolve({ cursor: 'stale-cursor' }) })).rejects.toThrow('NEXT_REDIRECT:/customers');
  });

  it('rejects malformed cursor history before querying the customer register', async () => {
    await expect(CustomersPage({ searchParams: Promise.resolve({ cursorHistory: 'ROOT.bad.token!' }) })).rejects.toThrow('NEXT_REDIRECT:/customers');
    expect(mocks.listCustomers).not.toHaveBeenCalled();
  });
});
