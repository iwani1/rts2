import { describe, expect, it } from 'vitest';
import { validateProductionEnv } from './production-env';

const valid = {
  DATABASE_URL: 'postgresql://tms:secret@db:5432/richie_tms',
  AUTH_SECRET: 'a'.repeat(32),
  APP_URL: 'https://tms.example.com',
};

describe('validateProductionEnv (D-092/7C)', () => {
  it('accepts a complete HTTPS production environment', () => {
    expect(validateProductionEnv(valid)).toEqual({ errors: [], warnings: [] });
  });

  it('refuses to boot without database, secret or origin, naming each one', () => {
    const result = validateProductionEnv({});
    expect(result.errors).toHaveLength(3);
    expect(result.errors.join(' ')).toContain('DATABASE_URL');
    expect(result.errors.join(' ')).toContain('AUTH_SECRET');
    expect(result.errors.join(' ')).toContain('APP_URL');
  });

  it('rejects a short secret and a malformed origin but only warns on plain HTTP', () => {
    const result = validateProductionEnv({ ...valid, AUTH_SECRET: 'short', APP_URL: 'not a url' });
    expect(result.errors).toHaveLength(2);

    const http = validateProductionEnv({ ...valid, APP_URL: 'http://localhost:3000' });
    expect(http.errors).toEqual([]);
    expect(http.warnings).toHaveLength(1);
    expect(http.warnings[0]).toContain('HTTPS');
  });
});
