// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OnTimeThresholdEditor } from './on-time-threshold-editor';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('OnTimeThresholdEditor (RPT-02 / D-078)', () => {
  it('starts unset, then saves the owner-approved 10 minutes with an audit reason', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ thresholdMinutes: null }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ setting: { configured: true } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ thresholdMinutes: 10 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<OnTimeThresholdEditor companyId="company-1" />);

    expect(await screen.findByText('Current value: Not configured')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Threshold (whole minutes, 1–120)'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Reason for change'), { target: { value: 'Owner ratified a ten minute on-time threshold' } });
    fireEvent.submit(screen.getByLabelText('Threshold (whole minutes, 1–120)').closest('form')!);
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('On-time threshold saved.'));
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      key: 'reports.on_time_threshold', value: 10, reason: 'Owner ratified a ten minute on-time threshold',
    });
    expect(screen.getByText('Current value: 10 minutes')).toBeTruthy();
  });
});
