import { z } from 'zod';

/**
 * RTE-05 / D-087: the interface to a FUTURE route-optimisation service.
 * Nothing here computes or claims an "optimal" route: outputs are
 * candidate plans, and the only wired implementation refuses honestly
 * until a real service — and an agreed objective — exists.
 */

export class OptimisationNotConfiguredError extends Error {
  readonly code = 'OPTIMISATION_NOT_CONFIGURED';
  readonly statusCode = 503;
  constructor() {
    super('Route optimisation is not configured. No optimisation service is connected, so no plan can be proposed.');
    this.name = 'OptimisationNotConfiguredError';
  }
}

const coordinateSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const optimisationRequestSchema = z.object({
  problemId: z.string().trim().min(1).max(128),
  depot: coordinateSchema,
  stops: z.array(z.object({
    stopId: z.string().trim().min(1).max(128),
    location: coordinateSchema,
    passengers: z.number().int().nonnegative().safe(),
    earliestMinuteOfDay: z.number().int().min(0).max(1440).optional(),
    latestMinuteOfDay: z.number().int().min(0).max(1440).optional(),
  }).refine(
    (stop) => stop.earliestMinuteOfDay === undefined
      || stop.latestMinuteOfDay === undefined
      || stop.earliestMinuteOfDay <= stop.latestMinuteOfDay,
    { message: 'A stop time window must not end before it starts.' },
  )).min(1).max(500),
  vehicles: z.array(z.object({
    vehicleId: z.string().trim().min(1).max(128),
    capacity: z.number().int().positive().safe(),
  })).min(1).max(100),
  objectives: z.array(z.enum(['MINIMISE_TOTAL_DISTANCE', 'MINIMISE_TOTAL_DURATION', 'BALANCE_VEHICLE_LOAD']))
    .min(1),
}).strict();

export const candidatePlanSchema = z.object({
  problemId: z.string().trim().min(1).max(128),
  assignments: z.array(z.object({
    vehicleId: z.string().trim().min(1).max(128),
    orderedStopIds: z.array(z.string().trim().min(1).max(128)).min(1),
  })),
  unassignedStopIds: z.array(z.string().trim().min(1).max(128)),
  evaluation: z.object({
    objective: z.string().trim().min(1).max(120),
    totalDistanceMetres: z.number().nonnegative().safe().nullable(),
    totalDurationMinutes: z.number().nonnegative().safe().nullable(),
    note: z.string().trim().min(1).max(500),
  }),
}).strict();

export type OptimisationRequest = z.infer<typeof optimisationRequestSchema>;
export type CandidatePlan = z.infer<typeof candidatePlanSchema>;

/** The port a future provider implements. Deliberately returns candidates. */
export interface RouteOptimisationService {
  proposePlan(request: OptimisationRequest): Promise<CandidatePlan>;
}

/** The only implementation wired today: an honest refusal (D-087). */
export class UnconfiguredOptimisationService implements RouteOptimisationService {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async proposePlan(_request: OptimisationRequest): Promise<CandidatePlan> {
    throw new OptimisationNotConfiguredError();
  }
}

export function getRouteOptimisationService(): RouteOptimisationService {
  return new UnconfiguredOptimisationService();
}
