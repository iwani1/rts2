import { describe, expect, it } from 'vitest';
import { passengerJourneyStatus } from './journey-status';

describe('passengerJourneyStatus (PAX-01 / D-065)', () => {
  it('maps the booking lifecycle onto the passenger vocabulary', () => {
    expect(passengerJourneyStatus('Pending', null)).toBe('Requested');
    expect(passengerJourneyStatus('Accepted', null)).toBe('Confirmed');
    expect(passengerJourneyStatus('Assigned', 'Planned')).toBe('Assigned to trip');
    expect(passengerJourneyStatus('Assigned', 'Ready for Dispatch')).toBe('Assigned to trip');
    expect(passengerJourneyStatus('Boarded', 'In Progress')).toBe('Picked up');
    expect(passengerJourneyStatus('Completed', 'Completed')).toBe('Completed');
    expect(passengerJourneyStatus('Cancelled', null)).toBe('Cancelled');
    expect(passengerJourneyStatus('Rejected', null)).toBe('Cancelled');
  });

  it('shows driver en route only after dispatch or start', () => {
    expect(passengerJourneyStatus('Assigned', 'Dispatched')).toBe('Driver en route');
    expect(passengerJourneyStatus('Assigned', 'In Progress')).toBe('Driver en route');
  });

  it('shows delayed for an assigned passenger on a delayed trip, but picked-up wins after boarding', () => {
    expect(passengerJourneyStatus('Assigned', 'Delayed')).toBe('Delayed');
    expect(passengerJourneyStatus('Boarded', 'Delayed')).toBe('Picked up');
  });

  it('falls back to Requested for unexpected states instead of inventing a label', () => {
    expect(passengerJourneyStatus('SomethingElse', null)).toBe('Requested');
  });
});
