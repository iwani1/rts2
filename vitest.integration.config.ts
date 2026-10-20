import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { assertIntegrationTestEnvironment, resolveTestDatabaseUrl } from './src/modules/testing/test-database-url';
import { defineConfig } from 'vitest/config';

process.env.DATABASE_URL = resolveTestDatabaseUrl(process.env.TMS_TEST_DATABASE_URL, process.env.DATABASE_URL);
assertIntegrationTestEnvironment(process.env.AUTH_SECRET, process.env.APP_URL);

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
