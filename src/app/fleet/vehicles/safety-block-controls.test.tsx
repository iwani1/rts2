// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SafetyBlockControls } from './safety-block-controls';

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('SafetyBlockControls', () => {
  it('applies an immediate selected safety status with a required reason', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ block: { id: 'block-1' } }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<SafetyBlockControls companyId="company-1" vehicleId="vehicle-1" activeBlock={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Apply safety block' }));
    fireEvent.change(screen.getByLabelText('Safety status'), { target: { value: 'Under Maintenance' } });
    fireEvent.change(screen.getByLabelText('Reason for immediate block'), { target: { value: 'Repair required after engine warning' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply safety block' }));
    expect(await screen.findByText(/Safety block applied/)).toBeTruthy();
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ status: 'Under Maintenance', reason: 'Repair required after engine warning' });
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it('releases only after explicit work completion and passed-inspection details', async () => {
    const releasedAt = '2026-10-18T12:30:00.000Z';
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ block: { id: 'block-1', status: 'Pending Inspection', releasedAt } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<SafetyBlockControls companyId="company-1" vehicleId="vehicle-1" activeBlock={{ id: 'block-1', status: 'Pending Inspection', appliedAt: '2026-10-18T10:00:00.000Z' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Record inspection and release' }));
    fireEvent.change(screen.getByLabelText('Work completed at'), { target: { value: '2026-10-18T11:00' } });
    fireEvent.change(screen.getByLabelText('Inspection results'), { target: { value: 'Brake test passed after replacement' } });
    fireEvent.change(screen.getByLabelText('Release reason'), { target: { value: 'Release after completed repair inspection' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Record inspection and release' }));
    expect(await screen.findByText((text) => text.includes(`safety block released at ${new Date(releasedAt).toLocaleString()}`))).toBeTruthy();
    const payload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(payload).toMatchObject({
      inspectionResults: 'Brake test passed after replacement', inspectionPassed: true,
      reason: 'Release after completed repair inspection',
    });
    expect(typeof payload.workCompletedAt).toBe('string');
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/safety-blocks/block-1');
  });
});
