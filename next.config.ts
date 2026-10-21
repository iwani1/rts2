import type { NextConfig } from 'next';

// D-092/7B: conservative security headers for an internal system.
// Frame-blocking is production-only: the development preview embeds the
// app in an iframe (see next.config.test.ts), and CSP keeps 'unsafe-inline'
// for Next's bootstrap scripts — this is a hardening baseline, not a
// claim that inline script injection is impossible.
function buildSecurityHeaders() {
  const isProduction = process.env.NODE_ENV === 'production';
  return [
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      ...(isProduction ? ["frame-ancestors 'none'"] : []),
    ].join('; '),
  },
    ...(isProduction ? [{ key: 'X-Frame-Options', value: 'DENY' }] : []),
  ];
}

const nextConfig: NextConfig = {
  output: 'standalone',
  async headers() {
    return [{
      source: '/:path*',
      headers: buildSecurityHeaders(),
    }];
  },
};

export default nextConfig;
