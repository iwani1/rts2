import { z } from 'zod';

const optionalText = (max: number) => z.string().trim().max(max).nullable();
const optionalEmail = z.string().trim().max(254).email().nullable();

const customerFieldsSchema = z.object({
  reference: optionalText(80),
  displayName: z.string().trim().min(1).max(160),
  contactPerson: optionalText(160),
  telephone: optionalText(80),
  email: optionalEmail,
  billingDetails: optionalText(2000),
  customerType: optionalText(80),
  status: optionalText(80),
  notes: optionalText(2000),
}).strict();

export const customerInputSchema = customerFieldsSchema;
export const customerRequestSchema = customerFieldsSchema.extend({
  reason: z.string().trim().min(8).max(500),
}).strict();
export const customerListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  cursor: z.string().min(1).max(128).optional(),
}).strict();
