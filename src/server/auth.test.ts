import { afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('@/server/prisma', () => ({
  getPrisma: () => ({
    user: { findUnique: async () => null },
    auditEvent: { create: async () => null },
  }),
}));

vi.stubEnv('AUTH_SECRET', 'test-secret-that-is-long-enough-for-auth-06');
vi.stubEnv('APP_URL', 'http://localhost:3000');
vi.stubEnv('DATABASE_URL', 'postgresql://tms:tms_local_only@localhost:5432/richie_tms_sandbox_test');

describe('auth configuration (AUTH-06 / D-076)', () => {
  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it('registers the two-factor plugin and rate-limits verification', async () => {
    const { getAuth } = await import('./auth');
    const auth = getAuth();
    const pluginIds = (auth.options.plugins ?? []).map((plugin) => plugin.id);
    expect(pluginIds).toContain('two-factor');
    const rules = auth.options.rateLimit?.customRules ?? {};
    expect(rules).toHaveProperty('/two-factor/verify-totp');
    expect(rules).toHaveProperty('/two-factor/verify-backup-code');
  });
});
