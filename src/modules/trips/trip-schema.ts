import { z } from 'zod';
import { TRIP_STATUSES } from './trip-transitions';

const timeSchema = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, 'Enter a 24-hour time as HH:MM.');
const optionalId = z.string().trim().min(1).max(128).nullable();

export const tripRequestSchema = z.object({
  clientId: optionalId,
  routeId: optionalId,
  serviceType: z.string().trim().max(120).nullable(),
  tripDate: z.string().date(),
  plannedStartTime: timeSchema.nullable(),
  plannedDurationMinutes: z.number().int().positive().max(10080).nullable(),
  capacityLimit: z.number().int().positive().max(10000).nullable(),
  reason: z.string().trim().min(8).max(500),
}).strict();

export const tripGenerateSchema = z.object({
  fromDate: z.string().date(),
  toDate: z.string().date(),
  reason: z.string().trim().min(8).max(500),
}).strict().superRefine((data, context) => {
  if (data.toDate < data.fromDate) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['toDate'], message: 'The end date must be on or after the start date.' });
  }
  const days = (Date.parse(data.toDate) - Date.parse(data.fromDate)) / 86_400_000 + 1;
  if (days > 31) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['toDate'], message: 'Generate at most 31 days of trips at a time.' });
  }
});

export const tripListQuerySchema = z.object({
  status: z.enum(TRIP_STATUSES).optional(),
  clientId: z.string().trim().min(1).max(128).optional(),
  routeId: z.string().trim().min(1).max(128).optional(),
  driverId: z.string().trim().min(1).max(128).optional(),
  date: z.string().date().optional(),
  fromDate: z.string().date().optional(),
  toDate: z.string().date().optional(),
  cursor: z.string().min(1).max(128).optional(),
}).strict();

export const tripTransitionSchema = z.object({
  toStatus: z.enum(TRIP_STATUSES),
  reason: z.string().trim().min(8).max(500),
  delayReason: z.string().trim().max(500).nullable().optional(),
  completionNotes: z.string().trim().max(2000).nullable().optional(),
}).strict();

export const tripAssignBookingSchema = z.object({
  bookingId: z.string().trim().min(1).max(128),
  reason: z.string().trim().min(8).max(500),
}).strict();

export const tripUnassignBookingSchema = tripAssignBookingSchema;
