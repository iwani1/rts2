import { describe, expect, it } from 'vitest';
import { locationRequestSchema } from './location-schema';
import { routeScheduleRequestSchema } from './route-schema';

describe('location schema (RTE-01)', () => {
  const base = {
    name: 'Accra Mall', latitude: null, longitude: null,
    landmarkDescription: null, ghanaDigitalAddress: null, notes: null, reason: 'Location recorded by dispatch',
  };

  it('accepts an unmapped location described by landmark only', () => {
    expect(locationRequestSchema.parse({ ...base, landmarkDescription: 'Opposite the mall entrance' }).latitude).toBeNull();
  });

  it('requires coordinates as a pair within range', () => {
    expect(() => locationRequestSchema.parse({ ...base, latitude: 5.6 })).toThrow();
    expect(() => locationRequestSchema.parse({ ...base, latitude: 95, longitude: -0.2 })).toThrow();
    expect(locationRequestSchema.parse({ ...base, latitude: 5.6, longitude: -0.2 }).longitude).toBe(-0.2);
  });
});

describe('route schedule schema (RTE-03)', () => {
  const base = {
    kind: 'RECURRING' as const, daysOfWeek: ['MON', 'TUE'], scheduleDate: null,
    shift: null, plannedStartTime: '05:30', notes: null, reason: 'Schedule recorded by dispatch',
  };

  it('accepts recurring days and rejects a carried date', () => {
    expect(routeScheduleRequestSchema.parse(base).daysOfWeek).toEqual(['MON', 'TUE']);
    expect(() => routeScheduleRequestSchema.parse({ ...base, scheduleDate: '2026-10-26' })).toThrow();
    expect(() => routeScheduleRequestSchema.parse({ ...base, daysOfWeek: [] })).toThrow();
  });

  it('requires a date for one-time schedules and rejects recurring days', () => {
    expect(() => routeScheduleRequestSchema.parse({ ...base, kind: 'ONE_TIME', daysOfWeek: [], scheduleDate: null })).toThrow();
    expect(routeScheduleRequestSchema.parse({ ...base, kind: 'ONE_TIME', daysOfWeek: [], scheduleDate: '2026-10-26' }).scheduleDate).toBe('2026-10-26');
    expect(() => routeScheduleRequestSchema.parse({ ...base, plannedStartTime: '5:30' })).toThrow();
  });
});
