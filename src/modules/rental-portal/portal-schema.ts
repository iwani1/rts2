import { z } from 'zod';

const optionalText = (max: number) => z.string().trim().max(max).nullable();
const timeOfDay = z.string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Use a 24-hour time such as 09:30.')
  .nullable();
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}, 'Use a valid calendar date.').nullable();
const positiveInteger = z.number().int().min(1).max(2_147_483_647).nullable();
const reason = z.string().trim().min(8).max(500);

/**
 * RNT-09/D-066 portal request fields. The customer and the request source are
 * never accepted from the client: the service forces the linked customer and
 * the `APP` source.
 */
export const ownRentalRequestSchema = z.object({
  serviceDate: dateOnly,
  departureTime: timeOfDay,
  returnTime: timeOfDay,
  returnDate: dateOnly.optional(),
  durationMinutes: positiveInteger,
  pickupLocation: optionalText(500),
  destination: optionalText(500),
  intermediateStops: optionalText(2000),
  passengerCount: positiveInteger,
  luggageSpecialNeeds: optionalText(2000),
  purpose: optionalText(500),
  requestedVehicleType: optionalText(100),
  driverRequirement: optionalText(300),
  tripContactName: optionalText(160),
  tripContactTelephone: optionalText(80),
  tripContactEmail: z.string().trim().max(254).email().nullable(),
  notes: optionalText(2000),
  reason,
}).strict();

export const portalReasonSchema = z.object({ reason }).strict();

export const customerLinkSchema = z.object({
  userId: z.string().trim().min(1).max(128),
  reason,
}).strict();

export const customerUnlinkSchema = z.object({ reason }).strict();
