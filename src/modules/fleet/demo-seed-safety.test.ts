import { describe, expect, it } from 'vitest';
import { assertDemoSeedEnvironment, DemoSeedSafetyError } from './demo-seed-safety';

const safeEnvironment = {
  nodeEnv: 'development',
  appUrl: 'http://localhost:3000',
  databaseUrl: 'postgresql://tms:local@127.0.0.1:5432/richie_tms?schema=public',
  confirmed: true,
};

describe('demo vehicle seed safety', () => {
  it('allows only an explicitly confirmed local development target', () => {
    expect(assertDemoSeedEnvironment(safeEnvironment)).toEqual({ databaseName: 'richie_tms' });
    expect(assertDemoSeedEnvironment({
      ...safeEnvironment,
      appUrl: 'http://[::1]:3000',
      databaseUrl: 'postgresql://tms:local@[::1]:5432/richie_tms',
    })).toEqual({ databaseName: 'richie_tms' });
  });

  it.each([
    { ...safeEnvironment, confirmed: false },
    { ...safeEnvironment, nodeEnv: 'production' },
    { ...safeEnvironment, appUrl: 'https://richie.example.com' },
    { ...safeEnvironment, databaseUrl: 'postgresql://tms:local@db.example.com:5432/richie_tms' },
    { ...safeEnvironment, databaseUrl: 'postgresql://tms:local@localhost:5432/richie_production' },
  ])('rejects unsafe seed target configuration', (environment) => {
    expect(() => assertDemoSeedEnvironment(environment)).toThrow(DemoSeedSafetyError);
  });
});
