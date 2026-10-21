import { z } from 'zod';

export const DRIVER_EVENT_TYPES = [
  'START', 'DELAY', 'RESUME', 'INTERRUPT', 'COMPLETE', 'BOARD', 'NO_SHOW', 'REPORT_DEFECT',
] as const;
export type DriverEventType = (typeof DRIVER_EVENT_TYPES)[number];

export const driverEventSchema = z.object({
  eventType: z.enum(DRIVER_EVENT_TYPES),
  idempotencyKey: z.string().trim().min(8).max(128),
  reason: z.string().trim().max(500).nullable().optional(),
  bookingId: z.string().trim().min(1).max(128).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
}).strict().superRefine((data, context) => {
  if (['DELAY', 'INTERRUPT', 'NO_SHOW', 'REPORT_DEFECT'].includes(data.eventType) && (!data.reason || data.reason.trim().length < 8)) {
    context.addIssue({
      code: z.ZodIssueCode.custom, path: ['reason'],
      message: `A reason of at least 8 characters is required for ${data.eventType}.`,
    });
  }
  if (['BOARD', 'NO_SHOW'].includes(data.eventType) && !data.bookingId) {
    context.addIssue({
      code: z.ZodIssueCode.custom, path: ['bookingId'],
      message: `A booking is required for ${data.eventType}.`,
    });
  }
});

export const driverTripListQuerySchema = z.object({
  date: z.string().date().optional(),
}).strict();
