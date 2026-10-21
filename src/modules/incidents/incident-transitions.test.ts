import { describe, expect, it } from 'vitest';
import {
  INCIDENT_STATUSES,
  allowedIncidentTargets,
  incidentTransitions,
  isAllowedIncidentTransition,
} from './incident-transitions';

describe('incident transition table', () => {
  it('covers every status pair exactly per the table', () => {
    const allowed = new Set(incidentTransitions.map((t) => `${t.from}->${t.to}`));
    for (const from of INCIDENT_STATUSES) {
      for (const to of INCIDENT_STATUSES) {
        expect(isAllowedIncidentTransition(from, to), `${from} -> ${to}`)
          .toBe(allowed.has(`${from}->${to}`));
      }
    }
  });

  it('Closed is terminal and Open cannot resolve directly', () => {
    expect(allowedIncidentTargets('Closed')).toEqual([]);
    expect(isAllowedIncidentTransition('Open', 'Resolved')).toBe(false);
    expect(isAllowedIncidentTransition('Open', 'Closed')).toBe(false);
  });

  it('supports acknowledge, work, resolve, close and reopen', () => {
    expect(isAllowedIncidentTransition('Open', 'Acknowledged')).toBe(true);
    expect(isAllowedIncidentTransition('Open', 'In Progress')).toBe(true);
    expect(isAllowedIncidentTransition('Acknowledged', 'Resolved')).toBe(true);
    expect(isAllowedIncidentTransition('In Progress', 'Resolved')).toBe(true);
    expect(isAllowedIncidentTransition('Resolved', 'Closed')).toBe(true);
    expect(isAllowedIncidentTransition('Resolved', 'In Progress')).toBe(true);
  });
});
