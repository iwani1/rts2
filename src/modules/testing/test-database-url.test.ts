import { describe, expect, it } from 'vitest';
import { assertIntegrationTestEnvironment, resolveTestDatabaseUrl } from './test-database-url';

describe('integration-test environment safety', () => {
  it('accepts a sufficiently long secret and local application URL', () => {
    expect(() => assertIntegrationTestEnvironment('a'.repeat(32), 'http://localhost:3000')).not.toThrow();
    expect(() => assertIntegrationTestEnvironment('a'.repeat(32), 'http://[::1]:3000')).not.toThrow();
  });

  it.each([
    ['short secret', 'too-short-secret', 'http://localhost:3000'],
    ['missing secret', undefined, 'http://localhost:3000'],
    ['missing app URL', 'a'.repeat(32), undefined],
    ['non-local app URL', 'a'.repeat(32), 'https://production.example.com'],
    ['malformed app URL', 'a'.repeat(32), 'not-a-url'],
  ])('rejects %s before test suites can mutate records', (_label, secret, appUrl) => {
    expect(() => assertIntegrationTestEnvironment(secret, appUrl)).toThrow();
  });
});

describe('integration-test database safety', () => {
  it('prefers the dedicated disposable URL over a normal application database URL', () => {
    const testUrl = 'postgresql://user:pass@localhost:5432/richie_tms_test?schema=public';
    expect(resolveTestDatabaseUrl(testUrl, 'postgresql://user:pass@localhost:5432/richie_tms?schema=public')).toBe(testUrl);
  });

  it('accepts CI configuration when DATABASE_URL itself names a local test database', () => {
    const testUrl = 'postgresql://user:pass@127.0.0.1:5432/ci_test';
    expect(resolveTestDatabaseUrl(undefined, testUrl)).toBe(testUrl);
  });

  it('accepts the bracketed IPv6 loopback address', () => {
    const testUrl = 'postgres://user:pass@[::1]:5432/local_test';
    expect(resolveTestDatabaseUrl(testUrl)).toBe(testUrl);
  });

  it.each([
    ['missing URL', undefined, undefined],
    ['normal development database', undefined, 'postgresql://user:pass@localhost:5432/richie_tms'],
    ['remote test-named database', undefined, 'postgresql://user:pass@db.example.test:5432/richie_tms_test'],
    ['remote dedicated test URL', 'postgresql://user:pass@db.example.test:5432/richie_tms_test', undefined],
    ['non-PostgreSQL URL', undefined, 'http://localhost/richie_tms_test'],
    ['malformed URL', undefined, 'not-a-url'],
  ])('rejects %s', (_label, dedicated, fallback) => {
    expect(() => resolveTestDatabaseUrl(dedicated, fallback)).toThrow();
  });
});
