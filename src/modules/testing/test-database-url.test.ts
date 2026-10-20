import { describe, expect, it } from 'vitest';
import { resolveTestDatabaseUrl } from './test-database-url';

describe('integration-test database safety', () => {
  it('prefers the dedicated disposable URL over a normal application database URL', () => {
    const testUrl = 'postgresql://user:pass@localhost:5432/richie_tms_test?schema=public';
    expect(resolveTestDatabaseUrl(testUrl, 'postgresql://user:pass@localhost:5432/richie_tms?schema=public')).toBe(testUrl);
  });

  it('accepts CI configuration when DATABASE_URL itself names a local test database', () => {
    const testUrl = 'postgresql://user:pass@127.0.0.1:5432/ci_test';
    expect(resolveTestDatabaseUrl(undefined, testUrl)).toBe(testUrl);
  });

  it.each([
    ['missing URL', undefined, undefined],
    ['normal development database', undefined, 'postgresql://user:pass@localhost:5432/richie_tms'],
    ['remote test-named database', undefined, 'postgresql://user:pass@db.example.test:5432/richie_tms_test'],
    ['remote dedicated test URL', 'postgresql://user:pass@db.example.test:5432/richie_tms_test', undefined],
    ['malformed URL', undefined, 'not-a-url'],
  ])('rejects %s', (_label, dedicated, fallback) => {
    expect(() => resolveTestDatabaseUrl(dedicated, fallback)).toThrow();
  });
});
