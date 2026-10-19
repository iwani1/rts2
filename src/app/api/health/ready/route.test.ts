import { beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({ queryRaw: vi.fn() }));
vi.mock('@/server/prisma', () => ({ getPrisma: () => ({ $queryRaw: database.queryRaw }) }));

import { GET } from './route';

beforeEach(() => database.queryRaw.mockReset());

describe('GET /api/health/ready', () => {
  it('reports ready only when PostgreSQL responds', async () => {
    database.queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({
      status: 'ok', service: 'richie-tms', dependencies: { database: 'ok' },
    });
    expect(database.queryRaw).toHaveBeenCalledOnce();
  });

  it('returns a generic unavailable response without leaking database errors', async () => {
    database.queryRaw.mockRejectedValueOnce(new Error('sensitive connection detail'));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({
      status: 'unavailable', service: 'richie-tms', dependencies: { database: 'unavailable' },
    });
  });
});
