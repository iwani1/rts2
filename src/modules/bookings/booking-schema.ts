import { z } from 'zod';
import { BOOKING_STATUSES, BOOKING_TYPES } from './booking-transitions';

const optionalId = z.string().trim().min(1).max(128).nullable();

export const bookingRequestSchema = z.object({
  employeeId: z.string().trim().min(1).max(128),
  contractId: optionalId,
  routeId: optionalId,
  bookingType: z.enum(BOOKING_TYPES),
  journeyDate: z.string().date(),
  pickupLocationId: optionalId,
  dropoffLocationId: optionalId,
  notes: z.string().trim().max(2000).nullable(),
  reason: z.string().trim().min(8).max(500),
}).strict();

export const bookingListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(BOOKING_STATUSES).optional(),
  bookingType: z.enum(BOOKING_TYPES).optional(),
  clientId: z.string().trim().min(1).max(128).optional(),
  employeeId: z.string().trim().min(1).max(128).optional(),
  journeyDate: z.string().date().optional(),
  cursor: z.string().min(1).max(128).optional(),
}).strict();

export const bookingTransitionSchema = z.object({
  toStatus: z.enum(BOOKING_STATUSES),
  reason: z.string().trim().min(8).max(500),
}).strict();
