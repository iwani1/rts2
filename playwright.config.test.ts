import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const withoutBrowserSecrets = {
  ...process.env,
  DATABASE_URL: '',
  AUTH_SECRET: '',
  TMS_E2E_EMAIL: '',
  TMS_E2E_PASSWORD: '',
};

describe('Playwright command safety', () => {
  it('lists E2E specs without database or authentication configuration', () => {
    const result = spawnSync('npm', ['run', 'test:e2e', '--', '--list'], {
      cwd: process.cwd(),
      env: withoutBrowserSecrets,
      encoding: 'utf8',
      timeout: 30_000,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Total: 4 tests in 4 files');
  });

  it('refuses to execute browser tests without local database and authentication configuration', () => {
    const result = spawnSync('npm', ['run', 'test:e2e', '--', '--grep', '__no_test_matches__'], {
      cwd: process.cwd(),
      env: withoutBrowserSecrets,
      encoding: 'utf8',
      timeout: 30_000,
    });

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain('Set DATABASE_URL, AUTH_SECRET (32+ characters), TMS_E2E_EMAIL, and TMS_E2E_PASSWORD');
  });
});
