import { z } from 'zod';

export const DAY_CODES = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;
const dayCodeSchema = z.enum(DAY_CODES);
const timeSchema = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, 'Enter a 24-hour time as HH:MM.');
const optionalText = (max: number) => z.string().trim().max(max).nullable();

function refineOperatingDays(data: { operatingDays: string[] }, context: z.RefinementCtx) {
  if (new Set(data.operatingDays).size !== data.operatingDays.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['operatingDays'], message: 'Operating days must not repeat.' });
  }
}

const routeFieldsObject = z.object({
  clientId: z.string().trim().min(1).max(128),
  name: z.string().trim().min(1).max(160),
  serviceType: optionalText(120),
  originLocationId: z.string().trim().min(1).max(128),
  destinationLocationId: z.string().trim().min(1).max(128),
  plannedStartTime: timeSchema.nullable(),
  expectedDurationMinutes: z.number().int().positive().max(10080).nullable(),
  capacityRequirement: z.number().int().positive().max(10000).nullable(),
  operatingDays: z.array(dayCodeSchema).max(7),
  shift: optionalText(120),
  active: z.boolean(),
  notes: optionalText(2000),
}).strict();

export const routeInputSchema = routeFieldsObject.superRefine(refineOperatingDays);
export const routeRequestSchema = routeFieldsObject.extend({
  reason: z.string().trim().min(8).max(500),
}).strict().superRefine(refineOperatingDays);
export const routeListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  clientId: z.string().trim().min(1).max(128).optional(),
  active: z.enum(['true', 'false']).optional(),
  cursor: z.string().min(1).max(128).optional(),
}).strict();

export const routeStopsRequestSchema = z.object({
  stops: z.array(z.object({
    locationId: z.string().trim().min(1).max(128),
    stopKind: z.enum(['PICKUP', 'DROPOFF', 'PICKUP_AND_DROPOFF']),
    plannedOffsetMinutes: z.number().int().nonnegative().max(10080).nullable(),
  }).strict()).max(200),
  reason: z.string().trim().min(8).max(500),
}).strict();

export const routeScheduleRequestSchema = z.object({
  kind: z.enum(['RECURRING', 'ONE_TIME']),
  daysOfWeek: z.array(dayCodeSchema).max(7),
  scheduleDate: z.string().date().nullable(),
  shift: optionalText(120),
  plannedStartTime: timeSchema.nullable(),
  notes: optionalText(2000),
  reason: z.string().trim().min(8).max(500),
}).superRefine((data, context) => {
  if (data.kind === 'RECURRING') {
    if (data.daysOfWeek.length === 0) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['daysOfWeek'], message: 'A recurring schedule needs at least one operating day.' });
    }
    if (data.scheduleDate !== null) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['scheduleDate'], message: 'A recurring schedule must not carry a single date.' });
    }
    if (new Set(data.daysOfWeek).size !== data.daysOfWeek.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['daysOfWeek'], message: 'Operating days must not repeat.' });
    }
  } else {
    if (!data.scheduleDate) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['scheduleDate'], message: 'A one-time schedule needs its date.' });
    }
    if (data.daysOfWeek.length > 0) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['daysOfWeek'], message: 'A one-time schedule must not carry recurring days.' });
    }
  }
});

export const routeScheduleCopySchema = z.object({
  scheduleDate: z.string().date().nullable().optional(),
  plannedStartTime: timeSchema.nullable().optional(),
  shift: optionalText(120).optional(),
  reason: z.string().trim().min(8).max(500),
}).strict();

export const routeScheduleActiveSchema = z.object({
  active: z.boolean(),
  reason: z.string().trim().min(8).max(500),
}).strict();
