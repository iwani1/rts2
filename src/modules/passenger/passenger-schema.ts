import { z } from 'zod';
import { BOOKING_TYPES } from '../bookings/booking-transitions';

const optionalId = z.string().trim().min(1).max(128).nullable();

/** Passenger journey request: the employee is always the linked record. */
export const passengerJourneyRequestSchema = z.object({
  contractId: optionalId,
  routeId: optionalId,
  bookingType: z.enum(BOOKING_TYPES),
  journeyDate: z.string().date(),
  pickupLocationId: optionalId,
  dropoffLocationId: optionalId,
  notes: z.string().trim().max(2000).nullable(),
}).strict();

export const passengerCancelSchema = z.object({
  reason: z.string().trim().min(8).max(500),
}).strict();

export const passengerFeedbackSchema = z.object({
  rating: z.number().int().min(1).max(5).nullable(),
  comment: z.string().trim().min(3).max(1000),
}).strict();

export const passengerLinkSchema = z.object({
  userId: z.string().trim().min(1).max(128),
  reason: z.string().trim().min(8).max(500),
}).strict();

export const passengerUnlinkSchema = z.object({
  reason: z.string().trim().min(8).max(500),
}).strict();
