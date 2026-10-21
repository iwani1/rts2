import { z } from 'zod';

export const dispatchBoardQuerySchema = z.object({
  date: z.string().date(),
}).strict();

export const tripResourceAssignmentSchema = z.object({
  vehicleId: z.string().trim().min(1).max(128).nullable().optional(),
  driverId: z.string().trim().min(1).max(128).nullable().optional(),
  override: z.boolean().optional().default(false),
  reason: z.string().trim().min(8).max(500),
}).strict().refine(
  (data) => data.vehicleId !== undefined || data.driverId !== undefined,
  { message: 'Provide a vehicle and/or a driver (null clears the resource).' },
);

export const tripNoShowSchema = z.object({
  bookingId: z.string().trim().min(1).max(128),
  reason: z.string().trim().min(8).max(500),
}).strict();
