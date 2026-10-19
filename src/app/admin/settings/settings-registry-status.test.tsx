// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsRegistryStatus } from './settings-registry-status';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('SettingsRegistryStatus', () => {
  it('shows configured state and dependent feature blockers without requesting policy values', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ settings: [
      { key: 'rental.pricing_models', label: 'Rental pricing models', category: 'rental', configured: false, updatedAt: null, blockedFeatures: ['RNT-04', 'FIN-01'] },
      { key: 'finance.tax_lines', label: 'Tax and levy lines', category: 'finance', configured: true, updatedAt: '2026-10-19T10:00:00.000Z', blockedFeatures: ['RNT-04'] },
    ] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<SettingsRegistryStatus companyId="company-1" companyName="Richie Transport Services" />);

    expect(await screen.findByText('Rental pricing models')).toBeTruthy();
    expect(screen.getByText('1 of 2 settings configured. A configured flag does not mean the policy value has been reviewed or approved.')).toBeTruthy();
    const unsetRow = screen.getByRole('row', { name: /Rental pricing models/ });
    expect(unsetRow.textContent).toContain('Not configured');
    expect(unsetRow.textContent).toContain('RNT-04, FIN-01');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ cache: 'no-store' });
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('value');
  });

  it('surfaces a status-loading failure instead of showing stale defaults', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ error: 'Access denied.' }), { status: 403 })));
    render(<SettingsRegistryStatus companyId="company-1" companyName="Richie Transport Services" />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Access denied.'));
    expect(screen.queryByText('0 of 0 settings configured.')).toBeNull();
  });
});
