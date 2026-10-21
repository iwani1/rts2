import { describe, expect, it, vi } from 'vitest';
import nextConfig from './next.config';

describe('global HTTP response headers', () => {
  it('sets privacy and MIME-sniffing protections without blocking the application preview', async () => {
    const rules = await nextConfig.headers?.();
    expect(rules).toHaveLength(1);
    expect(rules?.[0]?.source).toBe('/:path*');
    expect(rules?.[0]?.headers).toContainEqual({ key: 'Referrer-Policy', value: 'no-referrer' });
    expect(rules?.[0]?.headers).toContainEqual({ key: 'X-Content-Type-Options', value: 'nosniff' });
    expect(rules?.[0]?.headers).toContainEqual({ key: 'X-Robots-Tag', value: 'noindex, nofollow' });
    expect(rules?.[0]?.headers?.some(({ key }) => key === 'X-Frame-Options')).toBe(false);
    const csp = rules?.[0]?.headers?.find(({ key }) => key === 'Content-Security-Policy')?.value ?? '';
    expect(csp).toContain("default-src 'self'");
    expect(csp).not.toContain('frame-ancestors');
  });

  it('adds frame blocking in production without losing the baseline headers (D-092/7B)', async () => {
    // process.env.NODE_ENV is read-only in @types/node; stub it via Vitest
    // instead (the header builder reads it at call time, so this is enough).
    vi.stubEnv('NODE_ENV', 'production');
    try {
      const productionConfig = nextConfig;
      const rules = await productionConfig.headers?.();
      expect(rules?.[0]?.headers).toContainEqual({ key: 'X-Frame-Options', value: 'DENY' });
      const csp = rules?.[0]?.headers?.find(({ key }) => key === 'Content-Security-Policy')?.value ?? '';
      expect(csp).toContain("frame-ancestors 'none'");
      expect(rules?.[0]?.headers).toContainEqual({ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
