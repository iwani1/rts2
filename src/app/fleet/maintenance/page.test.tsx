// @vitest-environment jsdom
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(), findUser: vi.fn(), findCompanies: vi.fn(), listWorkOrders: vi.fn(), listVehicles: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => { throw new Error(`NEXT_REDIRECT:${path}`); },
}));
vi.mock('next/link', () => ({ default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a> }));
vi.mock('@/server/auth', () => ({ getAuth: () => ({ api: { getSession: mocks.getSession } }) }));
vi.mock('@/server/prisma', () => ({ getPrisma: () => ({ user: { findUnique: mocks.findUser }, company: { findMany: mocks.findCompanies } }) }));
vi.mock('@/modules/auth/permissions', () => ({ PermissionDeniedError: class PermissionDeniedError extends Error {} }));
vi.mock('@/modules/maintenance/work-orders', () => ({
  InvalidWorkOrderCursorError: class InvalidWorkOrderCursorError extends Error {},
  WorkOrderNotFoundError: class WorkOrderNotFoundError extends Error {},
  listWorkOrders: mocks.listWorkOrders,
}));
vi.mock('@/modules/fleet/vehicles', () => ({ listVehicles: mocks.listVehicles }));
vi.mock('./work-order-manager', () => ({ WorkOrderManager: () => <div>Maintenance register</div> }));

import { InvalidWorkOrderCursorError } from '@/modules/maintenance/work-orders';
import MaintenancePage from './page';

afterEach(cleanup);
beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: 'manager-1' } });
  mocks.findUser.mockResolvedValue({ status: 'ACTIVE' });
  mocks.findCompanies.mockResolvedValue([{ id: 'company-1', name: 'Richie Transport Services' }]);
  mocks.listWorkOrders.mockResolvedValue({ workOrders: [], nextCursor: null });
  mocks.listVehicles.mockResolvedValue({ canManage: true, vehicles: [] });
});

describe('MaintenancePage cursor recovery', () => {
  it('returns to the first register page when the cursor is stale or outside the company', async () => {
    mocks.listWorkOrders.mockRejectedValue(new InvalidWorkOrderCursorError());
    await expect(MaintenancePage({ searchParams: Promise.resolve({ cursor: 'stale-cursor' }) }))
      .rejects.toThrow('NEXT_REDIRECT:/fleet/maintenance');
  });

  it('rejects malformed cursor-history tokens before listing work orders', async () => {
    await expect(MaintenancePage({ searchParams: Promise.resolve({ cursorHistory: 'ROOT.invalid.token!' }) }))
      .rejects.toThrow('NEXT_REDIRECT:/fleet/maintenance');
    expect(mocks.listWorkOrders).not.toHaveBeenCalled();
  });
});
