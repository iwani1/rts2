// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DriverToastStack, dismissDriverToast, pushDriverToast } from './driver-toasts';

beforeEach(() => {
  // Clear any toasts leaked between tests via the public API ids 1..20.
  for (let id = 1; id <= 20; id += 1) dismissDriverToast(id);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('DriverToastStack (DRV-05 / D-079)', () => {
  it('renders pushed toasts with their tone semantics', () => {
    render(<DriverToastStack />);
    act(() => { pushDriverToast({ tone: 'success', title: 'BOARD recorded' }); });
    expect(screen.getByText('BOARD recorded')).toBeTruthy();
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('auto-dismisses success toasts but keeps errors until dismissed', () => {
    vi.useFakeTimers();
    render(<DriverToastStack />);
    act(() => {
      pushDriverToast({ tone: 'success', title: 'Synced' });
      pushDriverToast({ tone: 'error', title: 'BOARD could not be recorded', body: 'Code did not match.' });
    });
    act(() => { vi.advanceTimersByTime(5_000); });
    expect(screen.queryByText('Synced')).toBeNull();
    expect(screen.getByText('BOARD could not be recorded')).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Dismiss notification'));
    expect(screen.queryByText('BOARD could not be recorded')).toBeNull();
  });

  it('keeps at most three toasts, dropping the oldest', () => {
    render(<DriverToastStack />);
    act(() => {
      pushDriverToast({ tone: 'error', title: 'One' });
      pushDriverToast({ tone: 'error', title: 'Two' });
      pushDriverToast({ tone: 'error', title: 'Three' });
      pushDriverToast({ tone: 'error', title: 'Four' });
    });
    expect(screen.queryByText('One')).toBeNull();
    expect(screen.getByText('Four')).toBeTruthy();
  });
});
