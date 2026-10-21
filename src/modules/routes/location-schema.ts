import { z } from 'zod';

const optionalText = (max: number) => z.string().trim().max(max).nullable();

const locationFieldsSchema = z.object({
  name: z.string().trim().min(1).max(160),
  latitude: z.number().finite().min(-90).max(90).nullable(),
  longitude: z.number().finite().min(-180).max(180).nullable(),
  landmarkDescription: optionalText(500),
  ghanaDigitalAddress: optionalText(120),
  notes: optionalText(2000),
}).strict().superRefine((data, context) => {
  if ((data.latitude === null) !== (data.longitude === null)) {
    context.addIssue({
      code: z.ZodIssueCode.custom, path: ['latitude'],
      message: 'Record latitude and longitude together, or leave both blank when the location is not mapped.',
    });
  }
});

export const locationInputSchema = locationFieldsSchema;
export const locationRequestSchema = locationFieldsSchema.extend({
  reason: z.string().trim().min(8).max(500),
});
export const locationListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  cursor: z.string().min(1).max(128).optional(),
}).strict();
