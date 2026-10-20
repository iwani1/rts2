// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), resolvePermission: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() }));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`NEXT_REDIRECT:${path}`); } }));
vi.mock('next/link', () => ({ default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a> }));
vi.mock('@/server/auth', () => ({ getAuth: () => ({ api: { getSession: mocks.getSession } }) }));
vi.mock('@/modules/auth/permissions', () => ({ resolvePermission: mocks.resolvePermission }));
vi.mock('@/server/prisma', () => ({ getPrisma: () => ({ auditEvent: { findUnique: mocks.findUnique, findMany: mocks.findMany } }) }));
vi.mock('@/app/logout-button', () => ({ LogoutButton: () => <button type="button">Sign out</button> }));

import AuditPage from './page';

afterEach(cleanup);
beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: 'admin-1', name: 'Admin', email: 'admin@example.invalid' } });
  mocks.resolvePermission.mockResolvedValue({ allowed: true, scopes: ['GLOBAL'] });
  mocks.findUnique.mockResolvedValue({ id: 'event-anchor' });
  mocks.findMany.mockResolvedValue([]);
});

const auditEvent = (id: string) => ({
  id, createdAt: new Date('2026-10-20T10:00:00.000Z'), actor: { name: 'Admin', email: 'admin@example.invalid' },
  action: 'ROLE_ASSIGNED', entityType: 'USER_ROLE_ASSIGNMENT', entityId: `entity-${id}`,
  company: { name: 'Richie Transport Services' }, summary: { reason: 'Authorized test event' },
});

describe('AuditPage cursor navigation', () => {
  it('provides adjacent previous and next pages while preserving cursor history', async () => {
    mocks.findMany.mockResolvedValue(Array.from({ length: 51 }, (_, index) => auditEvent(`event-${index}`)));
    const page = await AuditPage({ searchParams: Promise.resolve({ before: 'event-current', cursorHistory: 'ROOT.event-prior' }) });
    render(page);

    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { id: 'event-current' }, select: { id: true } });
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ cursor: { id: 'event-current' }, skip: 1, take: 51 }));
    expect(screen.getByRole('link', { name: 'Previous page' }).getAttribute('href')).toBe('/admin/audit?before=event-prior&cursorHistory=ROOT');
    expect(screen.getByRole('link', { name: 'Next page' }).getAttribute('href')).toBe('/admin/audit?before=event-49&cursorHistory=ROOT.event-prior.event-current');
  });

  it('returns to the latest page when the cursor no longer exists', async () => {
    mocks.findUnique.mockResolvedValue(null);
    await expect(AuditPage({ searchParams: Promise.resolve({ before: 'stale-event' }) })).rejects.toThrow('NEXT_REDIRECT:/admin/audit');
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it('rejects malformed cursor history before querying the event page', async () => {
    await expect(AuditPage({ searchParams: Promise.resolve({ cursorHistory: 'ROOT.invalid.token!' }) })).rejects.toThrow('NEXT_REDIRECT:/admin/audit');
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
});
