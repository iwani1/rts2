export type PickupDelaySummary = {
  sampleSize: number;
  latePickups: number;
  onTimeOrEarlyPickups: number;
  averageDelayAllMinutes: number | null;
  averageDelayLateOnlyMinutes: number | null;
};

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * RPT-02 pickup-delay statistics over samples of (actual − planned) minutes.
 * Both averages are always reported — docs/KPIS.md leaves the choice between
 * "late pickups only" and "all pickups" to management, so the report shows
 * each labelled figure instead of silently picking one.
 */
export function summarisePickupDelays(
  delayMinutes: number[],
  thresholdMinutes?: number | null,
): PickupDelaySummary {
  // With an owner threshold (D-078: 10 minutes) a pickup is late only when
  // it boards more than the threshold after the planned start; without one
  // the historical split (any positive delay) is kept and no rate is shown.
  const lateBound = thresholdMinutes ?? 0;
  const late = delayMinutes.filter((minutes) => minutes > lateBound);
  const mean = (values: number[]) => (values.length === 0
    ? null
    : round2(values.reduce((sum, value) => sum + value, 0) / values.length));
  return {
    sampleSize: delayMinutes.length,
    latePickups: late.length,
    onTimeOrEarlyPickups: delayMinutes.length - late.length,
    averageDelayAllMinutes: mean(delayMinutes),
    averageDelayLateOnlyMinutes: mean(late),
  };
}

/** Occupied / capacity seat ratio; null when there is no capacity evidence. */
export function seatUtilisation(occupiedSeats: number, capacitySeats: number): number | null {
  if (capacitySeats <= 0) return null;
  return Math.round((occupiedSeats / capacitySeats) * 10_000) / 10_000;
}
