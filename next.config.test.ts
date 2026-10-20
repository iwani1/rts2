import { describe, expect, it } from 'vitest';
import nextConfig from './next.config';

describe('global HTTP response headers', () => {
  it('sets privacy and MIME-sniffing protections without blocking the application preview', async () => {
    const rules = await nextConfig.headers?.();
    expect(rules).toHaveLength(1);
    expect(rules?.[0]?.source).toBe('/:path*');
    expect(rules?.[0]?.headers).toContainEqual({ key: 'Referrer-Policy', value: 'no-referrer' });
    expect(rules?.[0]?.headers).toContainEqual({ key: 'X-Content-Type-Options', value: 'nosniff' });
    expect(rules?.[0]?.headers?.some(({ key }) => key === 'X-Frame-Options')).toBe(false);
  });
});
