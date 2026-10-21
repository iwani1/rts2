import { describe, expect, it } from 'vitest';
import { computeServiceReminder } from './service-plans';

const today = new Date('2027-08-10T00:00:00.000Z');

describe('computeServiceReminder (MNT-03 / D-075)', () => {
  it('marks a vehicle overdue by calendar and never completes it', () => {
    const result = computeServiceReminder({
      intervalDays: 90, intervalKm: null,
      lastServiceDate: new Date('2027-01-01T00:00:00.000Z'),
      lastServiceOdometerKm: null, storedNextServiceAt: null,
      currentOdometerKm: null, today,
    });
    expect(result.status).toBe('OVERDUE');
    expect(result.dueDate).toBe('2027-04-01');
    expect(result.daysRemaining).toBeLessThan(0);
  });

  it('flags due soon within 14 days and OK beyond it', () => {
    const soon = computeServiceReminder({
      intervalDays: 30, intervalKm: null,
      lastServiceDate: new Date('2027-07-20T00:00:00.000Z'),
      lastServiceOdometerKm: null, storedNextServiceAt: null,
      currentOdometerKm: null, today,
    });
    expect(soon.status).toBe('DUE_SOON');
    const ok = computeServiceReminder({
      intervalDays: 180, intervalKm: null,
      lastServiceDate: new Date('2027-07-20T00:00:00.000Z'),
      lastServiceOdometerKm: null, storedNextServiceAt: null,
      currentOdometerKm: null, today,
    });
    expect(ok.status).toBe('OK');
  });

  it('uses mileage when the odometer approaches the interval', () => {
    const result = computeServiceReminder({
      intervalDays: null, intervalKm: 10_000,
      lastServiceDate: new Date('2027-07-01T00:00:00.000Z'),
      lastServiceOdometerKm: 50_000, storedNextServiceAt: null,
      currentOdometerKm: 59_700, today,
    });
    expect(result.status).toBe('DUE_SOON');
    expect(result.dueOdometerKm).toBe(60_000);
    expect(result.kmRemaining).toBe(300);
  });

  it('falls back to the stored next-service date without a plan, and reports NO_PLAN otherwise', () => {
    const stored = computeServiceReminder({
      intervalDays: null, intervalKm: null, lastServiceDate: null,
      lastServiceOdometerKm: null,
      storedNextServiceAt: new Date('2027-08-01T00:00:00.000Z'),
      currentOdometerKm: null, today,
    });
    expect(stored.status).toBe('OVERDUE');
    const none = computeServiceReminder({
      intervalDays: null, intervalKm: null, lastServiceDate: null,
      lastServiceOdometerKm: null, storedNextServiceAt: null,
      currentOdometerKm: null, today,
    });
    expect(none.status).toBe('NO_PLAN');
  });
});
