import 'dotenv/config';
import { defineConfig } from '@playwright/test';

const baseURL = process.env.TMS_E2E_BASE_URL ?? 'http://localhost:3000';
const databaseUrl = process.env.DATABASE_URL;
const authSecret = process.env.AUTH_SECRET;
const email = process.env.TMS_E2E_EMAIL;
const password = process.env.TMS_E2E_PASSWORD;

if (!databaseUrl || !authSecret || authSecret.length < 32 || !email || !password) {
  throw new Error('Set DATABASE_URL, AUTH_SECRET (32+ characters), TMS_E2E_EMAIL, and TMS_E2E_PASSWORD in the local test environment.');
}

const parsedDatabaseUrl = new URL(databaseUrl);
if (!['localhost', '127.0.0.1', '::1'].includes(parsedDatabaseUrl.hostname)) {
  throw new Error('Browser tests are restricted to a local PostgreSQL database.');
}
const databaseName = decodeURIComponent(parsedDatabaseUrl.pathname.slice(1));
if (!databaseName.endsWith('_test')) {
  throw new Error('Browser tests refuse to run unless DATABASE_URL names a disposable database ending in _test.');
}

const parsedBaseURL = new URL(baseURL);
if (!['localhost', '127.0.0.1', '::1'].includes(parsedBaseURL.hostname)) {
  throw new Error('Browser tests are restricted to a local application URL.');
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    browserName: 'chromium',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev',
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: databaseUrl,
      AUTH_SECRET: authSecret,
      APP_URL: baseURL,
      NODE_ENV: 'development',
    },
  },
});
