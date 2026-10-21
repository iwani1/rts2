import { z } from 'zod';

const optionalText = (max: number) => z.string().trim().max(max).nullable();
const optionalEmail = z.string().trim().max(254).email().nullable();

const employeeFieldsSchema = z.object({
  clientId: z.string().trim().min(1).max(128),
  reference: optionalText(64),
  fullName: z.string().trim().min(1).max(160),
  telephone: optionalText(80),
  email: optionalEmail,
  homeAddress: optionalText(500),
  department: optionalText(120),
  workLocation: optionalText(300),
  shift: optionalText(120),
  approvedPickupLocation: optionalText(500),
  approvedDropoffLocation: optionalText(500),
  accountStatus: optionalText(80),
  transportEligible: z.boolean().nullable(),
  accessibilityNeeds: optionalText(1000),
  notes: optionalText(2000),
}).strict();

export const employeeInputSchema = employeeFieldsSchema;
export const employeeRequestSchema = employeeFieldsSchema.extend({
  reason: z.string().trim().min(8).max(500),
});
export const employeeListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  clientId: z.string().trim().min(1).max(128).optional(),
  transportEligible: z.enum(['true', 'false']).optional(),
  cursor: z.string().min(1).max(128).optional(),
}).strict();
