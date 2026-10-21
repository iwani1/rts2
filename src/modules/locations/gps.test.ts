import { describe, expect, it } from 'vitest';
import {
  classifyFreshness,
  createGenericGpsProvider,
  gpsConfiguration,
} from './gps';

describe('generic GPS provider (GPS-01 / D-077)', () => {
  it('normalises a documented generic report', () => {
    const provider = createGenericGpsProvider();
    const report = provider.parseReport({
      registrationNumber: 'gr-1234-27',
      latitude: 5.6037,
      longitude: -0.187,
      recordedAt: '2027-08-04T08:30:00.000Z',
    });
    expect(report.vehicleReference).toBe('GR-1234-27');
    expect(report.source).toBe('GPS_DEVICE');
    expect(report.recordedAt.toISOString()).toBe('2027-08-04T08:30:00.000Z');
  });

  it('rejects impossible coordinates', () => {
    const provider = createGenericGpsProvider();
    expect(() => provider.parseReport({
      registrationNumber: 'GR-1', latitude: 123, longitude: 0,
      recordedAt: '2027-08-04T08:30:00.000Z',
    })).toThrow();
  });

  it('is only configured with a provider name and a real secret', () => {
    expect(gpsConfiguration({})).toEqual({ configured: false, providerName: null });
    expect(gpsConfiguration({ GPS_PROVIDER: 'generic', GPS_WEBHOOK_SECRET: 'short' }).configured).toBe(false);
    expect(gpsConfiguration({ GPS_PROVIDER: 'generic', GPS_WEBHOOK_SECRET: 'a-very-long-secret' }))
      .toEqual({ configured: true, providerName: 'generic' });
  });
});

describe('classifyFreshness (GPS-01 / D-077)', () => {
  const now = new Date('2027-08-04T09:00:00.000Z');
  it('distinguishes live, stale, simulated and missing', () => {
    expect(classifyFreshness({ source: 'GPS_DEVICE', recordedAt: new Date('2027-08-04T08:57:00.000Z'), now })).toBe('LIVE');
    expect(classifyFreshness({ source: 'GPS_DEVICE', recordedAt: new Date('2027-08-04T08:20:00.000Z'), now })).toBe('STALE');
    expect(classifyFreshness({ source: 'SIMULATED', recordedAt: new Date('2027-08-04T08:59:00.000Z'), now })).toBe('SIMULATED');
    expect(classifyFreshness({ source: null, recordedAt: null, now })).toBe('NONE');
  });
});
