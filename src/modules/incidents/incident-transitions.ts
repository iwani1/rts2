export const INCIDENT_TYPES = [
  'BREAKDOWN', 'ACCIDENT', 'DRIVER_UNAVAILABLE', 'TRAFFIC_DELAY',
  'MISSED_PICKUP', 'COMPLAINT', 'VEHICLE_DEFECT', 'SAFETY_CONCERN', 'OTHER',
] as const;
export type IncidentType = (typeof INCIDENT_TYPES)[number];

export const INCIDENT_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];

export const INCIDENT_STATUSES = [
  'Open', 'Acknowledged', 'In Progress', 'Resolved', 'Closed',
] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

/**
 * Incident lifecycle (D-071), mirrored by the database transition guard in
 * migration 20261021160000_incidents. Closed is terminal; Resolved may
 * reopen to In Progress.
 */
export const incidentTransitions: ReadonlyArray<{ from: IncidentStatus; to: IncidentStatus }> = [
  { from: 'Open', to: 'Acknowledged' },
  { from: 'Open', to: 'In Progress' },
  { from: 'Acknowledged', to: 'In Progress' },
  { from: 'Acknowledged', to: 'Resolved' },
  { from: 'In Progress', to: 'Resolved' },
  { from: 'Resolved', to: 'Closed' },
  { from: 'Resolved', to: 'In Progress' },
];

export function isAllowedIncidentTransition(from: string, to: string): boolean {
  return incidentTransitions.some((transition) => transition.from === from && transition.to === to);
}

export function allowedIncidentTargets(from: string): IncidentStatus[] {
  return incidentTransitions
    .filter((transition) => transition.from === from)
    .map((transition) => transition.to);
}

export const INCIDENT_TYPE_LABELS: Record<IncidentType, string> = {
  BREAKDOWN: 'Breakdown',
  ACCIDENT: 'Accident',
  DRIVER_UNAVAILABLE: 'Driver unavailable',
  TRAFFIC_DELAY: 'Traffic delay',
  MISSED_PICKUP: 'Missed pickup',
  COMPLAINT: 'Complaint',
  VEHICLE_DEFECT: 'Vehicle defect',
  SAFETY_CONCERN: 'Safety concern',
  OTHER: 'Other',
};
