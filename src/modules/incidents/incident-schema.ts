import { z } from 'zod';
import { INCIDENT_SEVERITIES, INCIDENT_STATUSES, INCIDENT_TYPES } from './incident-transitions';

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

export const incidentReportSchema = z.object({
  incidentType: z.enum(INCIDENT_TYPES),
  severity: z.enum(INCIDENT_SEVERITIES),
  tripId: z.string().trim().min(1).max(128).nullable(),
  vehicleId: z.string().trim().min(1).max(128).nullable(),
  driverId: z.string().trim().min(1).max(128).nullable(),
  occurredAt: z.string().datetime({ offset: true }),
  locationText: optionalText(300),
  description: z.string().trim().min(8).max(2000),
  peopleAffected: optionalText(1000),
  immediateAction: optionalText(1000),
  assignedResponderId: z.string().trim().min(1).max(128).nullable().optional(),
  reason: z.string().trim().min(8).max(500),
}).strict();

export const incidentTransitionSchema = z.object({
  toStatus: z.enum(INCIDENT_STATUSES),
  reason: z.string().trim().min(8).max(500),
  resolutionNotes: z.string().trim().min(8).max(2000).nullable().optional(),
}).strict();

/** Driver-portal report: the trip (and therefore vehicle/driver) is derived. */
export const driverIncidentReportSchema = z.object({
  tripId: z.string().trim().min(1).max(128),
  incidentType: z.enum(INCIDENT_TYPES),
  severity: z.enum(INCIDENT_SEVERITIES),
  occurredAt: z.string().datetime({ offset: true }),
  locationText: optionalText(300),
  description: z.string().trim().min(8).max(2000),
  immediateAction: optionalText(1000),
  reason: z.string().trim().min(8).max(500),
}).strict();

/** INC-02 (D-072): dispatcher confirms a replacement on an active trip. */
export const incidentReplacementSchema = z.object({
  tripId: z.string().trim().min(1).max(128),
  newVehicleId: z.string().trim().min(1).max(128).nullable(),
  newDriverId: z.string().trim().min(1).max(128).nullable(),
  override: z.boolean(),
  reason: z.string().trim().min(8).max(500),
  blockOriginalVehicle: z.boolean(),
  createWorkOrder: z.boolean(),
}).strict().refine((data) => data.newVehicleId !== null || data.newDriverId !== null, {
  message: 'Choose a replacement vehicle, a replacement driver, or both.',
});
