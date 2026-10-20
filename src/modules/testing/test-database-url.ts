const LOCAL_DATABASE_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

/** Selects only a disposable local `_test` DB, preferring the dedicated test URL over app configuration. */
export function assertIntegrationTestEnvironment(authSecret?: string, appUrl?: string): void {
  if (!authSecret || authSecret.length < 32) throw new Error('AUTH_SECRET must be configured with at least 32 characters for integration tests.');
  if (!appUrl) throw new Error('APP_URL must be configured for integration tests.');
  let parsed: URL;
  try {
    parsed = new URL(appUrl);
  } catch {
    throw new Error('APP_URL must be a local application URL for integration tests.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || !['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) {
    throw new Error('Refusing integration tests against a non-local application URL.');
  }
}

export function resolveTestDatabaseUrl(testDatabaseUrl?: string, databaseUrl?: string): string {
  const connectionString = testDatabaseUrl?.trim() || databaseUrl?.trim();
  if (!connectionString) {
    throw new Error('Set TMS_TEST_DATABASE_URL or DATABASE_URL to a disposable local PostgreSQL database ending in _test.');
  }

  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error('Integration tests require a valid local PostgreSQL URL ending in _test.');
  }
  const databaseName = decodeURIComponent(parsed.pathname.slice(1));
  if (!LOCAL_DATABASE_HOSTS.has(parsed.hostname) || !databaseName.endsWith('_test')) {
    throw new Error('Refusing integration tests: database must be local and its name must end in _test.');
  }
  return connectionString;
}
