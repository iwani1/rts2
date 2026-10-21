import { describe, expect, it } from 'vitest';
import { buildRoutePlan } from './route-plan';

describe('route planning aid (RTE-04)', () => {
  it('derives stop times only from recorded offsets and labels the basis honestly', () => {
    const plan = buildRoutePlan({
      plannedStartTime: '05:30',
      expectedDurationMinutes: 90,
      capacityRequirement: 30,
      stops: [
        { sequence: 2, locationName: 'Depot', stopKind: 'DROPOFF', plannedOffsetMinutes: 60, hasCoordinates: true },
        { sequence: 1, locationName: 'Pickup A', stopKind: 'PICKUP', plannedOffsetMinutes: null, hasCoordinates: false },
      ],
      vehicles: [{ registrationNumber: 'GR-100-24', seatCount: 33 }],
    });
    expect(plan.basis).toBe('MANUAL_APPROXIMATE');
    expect(plan.legs.map((leg) => leg.sequence)).toEqual([1, 2]);
    expect(plan.legs[0].plannedArrivalTime).toBeNull();
    expect(plan.legs[0].offsetSource).toBe('NOT_RECORDED');
    expect(plan.legs[1].plannedArrivalTime).toBe('06:30');
    expect(plan.expectedEndTime).toBe('07:00');
    expect(plan.unmappedStops).toEqual(['Pickup A']);
    expect(plan.capacity.sufficient).toBe(true);
    expect(plan.notes.join(' ')).toContain('No map provider is configured');
    expect(plan.notes.join(' ')).not.toContain('optimal route');
  });

  it('reports insufficient and unassessable capacity without inventing numbers', () => {
    const insufficient = buildRoutePlan({
      plannedStartTime: null, expectedDurationMinutes: null, capacityRequirement: 40,
      stops: [], vehicles: [{ registrationNumber: 'GR-1', seatCount: 20 }],
    });
    expect(insufficient.capacity.sufficient).toBe(false);
    const unassessable = buildRoutePlan({
      plannedStartTime: null, expectedDurationMinutes: null, capacityRequirement: null,
      stops: [], vehicles: [],
    });
    expect(unassessable.capacity.sufficient).toBeNull();
    expect(unassessable.capacity.detail).toContain('cannot be assessed');
  });
});
