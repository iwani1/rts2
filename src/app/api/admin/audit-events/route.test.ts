import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getPrisma: vi.fn(),
  isActiveSuperAdmin: vi.fn(),
}));

vi.mock('@/server/auth', () => ({ getAuth: () => ({ api: { getSession: mocks.getSession } }) }));
vi.mock('@/server/prisma', () => ({ getPrisma: mocks.getPrisma }));
vi.mock('@/modules/auth/permissions', () => ({ isActiveSuperAdmin: mocks.isActiveSuperAdmin }));

import { GET } from './route';

const session = { user: { id: 'admin-user' } };

describe('Super Administrator audit-event API', () => {
  beforeEach(() => vi.resetAllMocks());

  it('requires authentication', async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await GET(new Request('http://localhost/api/admin/audit-events'));
    expect(response.status).toBe(401);
    expect(mocks.getPrisma).not.toHaveBeenCalled();
  });

  it('denies users without an active global Super Administrator assignment', async () => {
    mocks.getSession.mockResolvedValue(session);
    mocks.isActiveSuperAdmin.mockResolvedValue(false);
    const response = await GET(new Request('http://localhost/api/admin/audit-events'));
    expect(response.status).toBe(403);
    expect(mocks.getPrisma).not.toHaveBeenCalled();
  });

  it('rejects unknown query parameters rather than silently ignoring filters', async () => {
    mocks.getSession.mockResolvedValue(session);
    mocks.isActiveSuperAdmin.mockResolvedValue(true);
    const response = await GET(new Request('http://localhost/api/admin/audit-events?companyId=other'));
    expect(response.status).toBe(400);
    expect(mocks.getPrisma).not.toHaveBeenCalled();
  });

  it('returns a bounded, private page and a cursor for older records', async () => {
    mocks.getSession.mockResolvedValue(session);
    mocks.isActiveSuperAdmin.mockResolvedValue(true);
    const events = Array.from({ length: 51 }, (_, index) => ({ id: `event-${index + 1}` }));
    const findMany = vi.fn().mockResolvedValue(events);
    mocks.getPrisma.mockReturnValue({ auditEvent: { findMany } });

    const response = await GET(new Request('http://localhost/api/admin/audit-events?before=older-event'));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    await expect(response.json()).resolves.toEqual({
      events: events.slice(0, 50),
      nextCursor: 'event-50',
    });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 51,
      cursor: { id: 'older-event' },
      skip: 1,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }));
  });
});
