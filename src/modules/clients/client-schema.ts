import { z } from 'zod';

const optionalText = (max: number) => z.string().trim().max(max).nullable();
const optionalEmail = z.string().trim().max(254).email().nullable();

const clientFieldsSchema = z.object({
  name: z.string().trim().min(1).max(160),
  registrationDetails: optionalText(200),
  contactPerson: optionalText(160),
  telephone: optionalText(80),
  email: optionalEmail,
  billingAddress: optionalText(500),
  status: optionalText(80),
  notes: optionalText(2000),
}).strict();

export const clientInputSchema = clientFieldsSchema;
export const clientRequestSchema = clientFieldsSchema.extend({
  reason: z.string().trim().min(8).max(500),
}).strict();
export const clientListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  cursor: z.string().min(1).max(128).optional(),
}).strict();
