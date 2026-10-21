import { z } from 'zod';
import { CONTRACT_STATUSES } from './contract-transitions';

const optionalText = (max: number) => z.string().trim().max(max).nullable();
const optionalDate = z.string().date().nullable();

const contractFieldsSchema = z.object({
  clientId: z.string().trim().min(1).max(128),
  serviceType: optionalText(120),
  startDate: optionalDate,
  endDate: optionalDate,
  renewalDate: optionalDate,
  routesAndStops: optionalText(4000),
  serviceDaysAndShifts: optionalText(2000),
  vehicleRequirements: optionalText(2000),
  pricingModel: optionalText(500),
  billingFrequency: optionalText(200),
  paymentTerms: optionalText(2000),
  serviceLevelTargets: optionalText(2000),
  notes: optionalText(2000),
}).strict().superRefine((data, context) => {
  if (data.startDate && data.endDate && data.endDate < data.startDate) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['endDate'], message: 'The end date must be on or after the start date.' });
  }
});

export const contractInputSchema = contractFieldsSchema;
export const contractRequestSchema = contractFieldsSchema.and(z.object({
  reason: z.string().trim().min(8).max(500),
}));
export const contractListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(CONTRACT_STATUSES).optional(),
  clientId: z.string().trim().min(1).max(128).optional(),
  cursor: z.string().min(1).max(128).optional(),
}).strict();

export const contractTransitionSchema = z.object({
  toStatus: z.enum(CONTRACT_STATUSES),
  reason: z.string().trim().min(8).max(500),
  renewalStartDate: z.string().date().nullable().optional(),
  renewalEndDate: z.string().date().nullable().optional(),
}).strict().superRefine((data, context) => {
  if (data.toStatus !== 'Active' && (data.renewalStartDate || data.renewalEndDate)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['renewalEndDate'], message: 'Renewal dates may only be supplied when renewing a contract to Active.' });
  }
  if (data.renewalStartDate && data.renewalEndDate && data.renewalEndDate < data.renewalStartDate) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['renewalEndDate'], message: 'The renewal end date must be on or after the renewal start date.' });
  }
});
