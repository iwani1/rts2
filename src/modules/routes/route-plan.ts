export type RoutePlanStopInput = {
  sequence: number;
  locationName: string;
  stopKind: string;
  plannedOffsetMinutes: number | null;
  hasCoordinates: boolean;
};

export type RoutePlanInput = {
  plannedStartTime: string | null;
  expectedDurationMinutes: number | null;
  capacityRequirement: number | null;
  stops: RoutePlanStopInput[];
  vehicles: Array<{ registrationNumber: string; seatCount: number | null }>;
};

export type RoutePlanLeg = {
  sequence: number;
  locationName: string;
  stopKind: string;
  plannedArrivalTime: string | null;
  offsetSource: 'RECORDED' | 'NOT_RECORDED';
};

export type RoutePlan = {
  basis: 'MANUAL_APPROXIMATE';
  notes: string[];
  startTime: string | null;
  expectedEndTime: string | null;
  legs: RoutePlanLeg[];
  capacity: {
    requirement: number | null;
    largestVehicleSeats: number | null;
    largestVehicleRegistration: string | null;
    sufficient: boolean | null;
    detail: string;
  };
  unmappedStops: string[];
};

function addMinutes(time: string, minutes: number): string {
  const [hours, mins] = time.split(':').map(Number);
  const total = hours * 60 + mins + minutes;
  const dayOffset = Math.floor(total / 1440);
  const within = ((total % 1440) + 1440) % 1440;
  const hh = String(Math.floor(within / 60)).padStart(2, '0');
  const mm = String(within % 60).padStart(2, '0');
  return dayOffset > 0 ? `${hh}:${mm} (+${dayOffset}d)` : `${hh}:${mm}`;
}

/**
 * Explainable manual planning aid (RTE-04). It never calls a route "optimal":
 * no map provider is configured, so no distances or travel times are
 * estimated. It reports the approved stop order, times derived only from
 * recorded planned offsets, unmapped stops, and whether the largest recorded
 * vehicle seat count meets the route's capacity requirement.
 */
export function buildRoutePlan(input: RoutePlanInput): RoutePlan {
  const stops = [...input.stops].sort((a, b) => a.sequence - b.sequence);
  const legs: RoutePlanLeg[] = stops.map((stop) => ({
    sequence: stop.sequence,
    locationName: stop.locationName,
    stopKind: stop.stopKind,
    plannedArrivalTime: input.plannedStartTime && stop.plannedOffsetMinutes !== null
      ? addMinutes(input.plannedStartTime, stop.plannedOffsetMinutes)
      : null,
    offsetSource: stop.plannedOffsetMinutes !== null ? 'RECORDED' : 'NOT_RECORDED',
  }));
  const unmappedStops = stops.filter((stop) => !stop.hasCoordinates).map((stop) => stop.locationName);
  const seated = input.vehicles.filter((vehicle) => vehicle.seatCount !== null) as Array<{ registrationNumber: string; seatCount: number }>;
  const largest = seated.length > 0 ? seated.reduce((best, vehicle) => (vehicle.seatCount > best.seatCount ? vehicle : best)) : null;
  const capacity: RoutePlan['capacity'] = input.capacityRequirement === null
    ? {
      requirement: null, largestVehicleSeats: largest?.seatCount ?? null,
      largestVehicleRegistration: largest?.registrationNumber ?? null, sufficient: null,
      detail: 'No capacity requirement is recorded for this route, so capacity cannot be assessed.',
    }
    : largest === null
      ? {
        requirement: input.capacityRequirement, largestVehicleSeats: null, largestVehicleRegistration: null,
        sufficient: null, detail: 'No vehicle seat counts are recorded, so capacity cannot be assessed.',
      }
      : {
        requirement: input.capacityRequirement,
        largestVehicleSeats: largest.seatCount,
        largestVehicleRegistration: largest.registrationNumber,
        sufficient: largest.seatCount >= input.capacityRequirement,
        detail: largest.seatCount >= input.capacityRequirement
          ? `Largest recorded vehicle (${largest.registrationNumber}, ${largest.seatCount} seats) meets the requirement of ${input.capacityRequirement}. This checks seat count only; vehicle availability at the trip time is checked during dispatch.`
          : `Largest recorded vehicle (${largest.registrationNumber}, ${largest.seatCount} seats) is below the requirement of ${input.capacityRequirement}.`,
      };
  const notes = [
    'Manual planning aid only. No map provider is configured, so distances and travel times are not estimated and this order is not described as optimal.',
    'Stop times are calculated only from the route start time and recorded planned offsets; stops without a recorded offset show no time.',
  ];
  if (unmappedStops.length > 0) notes.push(`Stops without recorded coordinates cannot be mapped: ${unmappedStops.join(', ')}.`);
  return {
    basis: 'MANUAL_APPROXIMATE',
    notes,
    startTime: input.plannedStartTime,
    expectedEndTime: input.plannedStartTime && input.expectedDurationMinutes !== null
      ? addMinutes(input.plannedStartTime, input.expectedDurationMinutes)
      : null,
    legs,
    capacity,
    unmappedStops,
  };
}
