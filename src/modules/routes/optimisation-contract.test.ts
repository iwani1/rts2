import { describe, expect, it } from 'vitest';
import {
  OptimisationNotConfiguredError,
  getRouteOptimisationService,
  optimisationRequestSchema,
} from './optimisation-contract';

const validRequest = {
  problemId: 'problem-1',
  depot: { latitude: 5.6037, longitude: -0.187 },
  stops: [
    { stopId: 's1', location: { latitude: 5.65, longitude: -0.2 }, passengers: 3 },
    { stopId: 's2', location: { latitude: 5.7, longitude: -0.25 }, passengers: 1, earliestMinuteOfDay: 360, latestMinuteOfDay: 480 },
  ],
  vehicles: [{ vehicleId: 'v1', capacity: 30 }],
  objectives: ['MINIMISE_TOTAL_DISTANCE'],
};

describe('route optimisation contract (RTE-05 / D-087)', () => {
  it('accepts a well-formed problem', () => {
    expect(optimisationRequestSchema.safeParse(validRequest).success).toBe(true);
  });

  it('rejects empty fleets, empty stops and inverted time windows', () => {
    expect(optimisationRequestSchema.safeParse({ ...validRequest, vehicles: [] }).success).toBe(false);
    expect(optimisationRequestSchema.safeParse({ ...validRequest, stops: [] }).success).toBe(false);
    expect(optimisationRequestSchema.safeParse({
      ...validRequest,
      stops: [{ stopId: 's1', location: { latitude: 5.6, longitude: -0.2 }, passengers: 1, earliestMinuteOfDay: 600, latestMinuteOfDay: 300 }],
    }).success).toBe(false);
    expect(optimisationRequestSchema.safeParse({
      ...validRequest, depot: { latitude: 95, longitude: 0 },
    }).success).toBe(false);
  });

  it('refuses honestly while no optimisation service is configured', async () => {
    await expect(getRouteOptimisationService().proposePlan(
      optimisationRequestSchema.parse(validRequest),
    )).rejects.toBeInstanceOf(OptimisationNotConfiguredError);
  });
});
