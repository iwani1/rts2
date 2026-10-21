import { describe, expect, it } from 'vitest';
import { seatUtilisation, summarisePickupDelays } from './report-math';

describe('summarisePickupDelays (RPT-02)', () => {
  it('reports both averages and the late/on-time split', () => {
    const summary = summarisePickupDelays([-5, 0, 10, 20]);
    expect(summary).toEqual({
      sampleSize: 4,
      latePickups: 2,
      onTimeOrEarlyPickups: 2,
      averageDelayAllMinutes: 6.25,
      averageDelayLateOnlyMinutes: 15,
    });
  });

  it('returns null averages when there are no samples', () => {
    const summary = summarisePickupDelays([]);
    expect(summary.sampleSize).toBe(0);
    expect(summary.averageDelayAllMinutes).toBeNull();
    expect(summary.averageDelayLateOnlyMinutes).toBeNull();
  });

  it('applies the owner threshold when one is set (D-078)', () => {
    // 10-minute threshold: +10 still counts as on time, +20 is late.
    const summary = summarisePickupDelays([-5, 0, 10, 20], 10);
    expect(summary).toEqual({
      sampleSize: 4,
      latePickups: 1,
      onTimeOrEarlyPickups: 3,
      averageDelayAllMinutes: 6.25,
      averageDelayLateOnlyMinutes: 20,
    });
  });

  it('treats exactly-on-time pickups as not late', () => {
    const summary = summarisePickupDelays([0, 0]);
    expect(summary.latePickups).toBe(0);
    expect(summary.averageDelayLateOnlyMinutes).toBeNull();
    expect(summary.averageDelayAllMinutes).toBe(0);
  });
});

describe('seatUtilisation (RPT-02)', () => {
  it('computes a rounded ratio and refuses capacity-free evidence', () => {
    expect(seatUtilisation(30, 40)).toBe(0.75);
    expect(seatUtilisation(1, 3)).toBe(0.3333);
    expect(seatUtilisation(5, 0)).toBeNull();
  });
});
