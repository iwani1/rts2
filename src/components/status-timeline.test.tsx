// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StatusTimeline } from './status-timeline';

afterEach(() => cleanup());

const entries = [
  { sequence: 1, fromStatus: null, toStatus: 'Reported', reason: 'Door latch reported', actorName: 'Ama Manager', createdAt: '2026-10-01T08:30:00.000Z' },
  { sequence: 2, fromStatus: 'Reported', toStatus: 'Approved', reason: 'Repair approved', actorName: 'Kofi Lead', createdAt: '2026-10-02T09:00:00.000Z' },
];

describe('StatusTimeline (D-079)', () => {
  it('renders the governed sequence with transitions, reasons and actors', () => {
    const { container } = render(<StatusTimeline entries={entries} />);
    expect(screen.getByText('Reported')).toBeTruthy();
    expect(screen.getByText(/Approved/)).toBeTruthy();
    expect(screen.getByText('Door latch reported')).toBeTruthy();
    expect(screen.getByText(/Ama Manager/)).toBeTruthy();
    expect(screen.getByText(/event 2/)).toBeTruthy();
    // The final entry is the current standing and is highlighted.
    const items = container.querySelectorAll('.rt-timeline-item');
    expect(items).toHaveLength(2);
    expect(items[1].classList.contains('is-latest')).toBe(true);
    expect(items[0].classList.contains('is-latest')).toBe(false);
  });

  it('renders nothing for an empty history (callers show their own empty state)', () => {
    const { container } = render(<StatusTimeline entries={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
