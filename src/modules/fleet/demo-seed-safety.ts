export class DemoSeedSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DemoSeedSafetyError';
  }
}

const localHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** Demo records may only be inserted by an explicitly confirmed local development command. */
export function assertDemoSeedEnvironment(input: {
  nodeEnv: string | undefined;
  appUrl: string | undefined;
  databaseUrl: string | undefined;
  confirmed: boolean;
}) {
  if (!input.confirmed) throw new DemoSeedSafetyError('Pass --confirm-demo to create synthetic data.');
  if (input.nodeEnv !== 'development') throw new DemoSeedSafetyError('Demo seeding is allowed only when NODE_ENV=development.');
  if (!input.appUrl || !input.databaseUrl) throw new DemoSeedSafetyError('APP_URL and DATABASE_URL must be configured.');

  let app: URL;
  let database: URL;
  try {
    app = new URL(input.appUrl);
    database = new URL(input.databaseUrl);
  } catch {
    throw new DemoSeedSafetyError('APP_URL or DATABASE_URL is invalid.');
  }
  if (!['http:', 'https:'].includes(app.protocol) || !localHosts.has(app.hostname)) {
    throw new DemoSeedSafetyError('Demo seeding requires APP_URL to use a local host.');
  }
  if (!['postgresql:', 'postgres:'].includes(database.protocol)) {
    throw new DemoSeedSafetyError('Demo seeding requires a PostgreSQL DATABASE_URL.');
  }
  if (!localHosts.has(database.hostname)) {
    throw new DemoSeedSafetyError('Demo seeding refuses non-local database hosts.');
  }
  const databaseName = decodeURIComponent(database.pathname.slice(1));
  if (!databaseName || /(^|[_-])(prod|production|live)([_-]|$)/i.test(databaseName)) {
    throw new DemoSeedSafetyError('Demo seeding refuses production-named databases.');
  }
  return { databaseName };
}
