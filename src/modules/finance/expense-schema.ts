import { z } from 'zod';
import { EXPENSE_CATEGORIES, EXPENSE_STATUSES } from './expense-transitions';

const idSchema = z.string().trim().min(1).max(128);
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

export const createExpenseSchema = z.object({
  actorId: idSchema,
  companyId: idSchema,
  expenseDate: z.string().date(),
  category: z.enum(EXPENSE_CATEGORIES),
  description: z.string().trim().min(3).max(500),
  supplier: optionalText(200),
  method: optionalText(80),
  receiptReference: optionalText(200),
  amountPesewas: z.number().int().positive().safe(),
  vehicleId: idSchema.nullable().optional(),
  tripId: idSchema.nullable().optional(),
  reason: z.string().trim().min(8).max(500),
}).strict();

export const updateExpenseSchema = z.object({
  actorId: idSchema,
  companyId: idSchema,
  expenseId: idSchema,
  expenseDate: z.string().date().optional(),
  category: z.enum(EXPENSE_CATEGORIES).optional(),
  description: z.string().trim().min(3).max(500).optional(),
  supplier: optionalText(200),
  method: optionalText(80),
  receiptReference: optionalText(200),
  amountPesewas: z.number().int().positive().safe().optional(),
  vehicleId: idSchema.nullable().optional(),
  tripId: idSchema.nullable().optional(),
  reason: z.string().trim().min(8).max(500),
}).strict().refine(
  (data) => ['expenseDate', 'category', 'description', 'supplier', 'method', 'receiptReference', 'amountPesewas', 'vehicleId', 'tripId']
    .some((key) => data[key as keyof typeof data] !== undefined),
  { message: 'At least one field must change.' },
);

export const transitionExpenseSchema = z.object({
  actorId: idSchema,
  companyId: idSchema,
  expenseId: idSchema,
  toStatus: z.enum(['Approved', 'Rejected']),
  reason: z.string().trim().min(8).max(500),
}).strict();

export const expenseListQuerySchema = z.object({
  status: z.enum(EXPENSE_STATUSES).optional(),
  category: z.enum(EXPENSE_CATEGORIES).optional(),
  vehicleId: idSchema.optional(),
  tripId: idSchema.optional(),
  fromDate: z.string().date().optional(),
  toDate: z.string().date().optional(),
  limit: z.number().int().min(1).max(200).optional(),
});
