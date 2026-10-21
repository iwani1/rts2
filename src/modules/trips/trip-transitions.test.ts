import { describe, expect, it } from 'vitest';
import { TRIP_STATUSES, allowedTripTargets, isAllowedTripTransition, tripTransitions } from './trip-transitions';

describe('trip state machine', () => {
  it('produces the exact approved state matrix for every from-state', () => {
    expect(TRIP_STATUSES).toHaveLength(8);
    for (const from of TRIP_STATUSES) {
      const expected = tripTransitions.filter((transition) => transition.from === from).map((transition) => transition.to);
      expect(allowedTripTargets(from)).toEqual(expected);
      for (const to of TRIP_STATUSES) {
        expect(isAllowedTripTransition(from, to)).toBe(expected.includes(to));
      }
    }
  });

  it('approves exactly the documented transitions', () => {
    expect([...tripTransitions].map(({ from, to }) => `${from} -> ${to}`).sort()).toEqual([
      'Delayed -> Completed',
      'Delayed -> In Progress',
      'Delayed -> Interrupted',
      'Dispatched -> Delayed',
      'Dispatched -> In Progress',
      'Dispatched -> Interrupted',
      'In Progress -> Completed',
      'In Progress -> Delayed',
      'In Progress -> Interrupted',
      'Interrupted -> Cancelled',
      'Interrupted -> Completed',
      'Interrupted -> In Progress',
      'Planned -> Cancelled',
      'Planned -> Ready for Dispatch',
      'Ready for Dispatch -> Cancelled',
      'Ready for Dispatch -> Dispatched',
      'Ready for Dispatch -> Planned',
    ]);
  });

  it('has no transitions out of the terminal states', () => {
    expect(allowedTripTargets('Completed')).toEqual([]);
    expect(allowedTripTargets('Cancelled')).toEqual([]);
  });
});
