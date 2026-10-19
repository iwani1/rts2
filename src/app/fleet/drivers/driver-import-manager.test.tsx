// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DriverImportManager } from './driver-import-manager';

const { router } = vi.hoisted(() => ({ router: { refresh: vi.fn() } }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
beforeEach(() => router.refresh.mockReset());

const csv = 'fullName,licenceClass,licenceExpiresAt,qualifications,availability,status\nAma Driver,B,2027-09-30,,,Active';
const validPreview = {
  totalRows: 1, validRows: 1, invalidRows: 0, canImport: true, fileErrors: [],
  rows: [{ rowNumber: 2, fullName: 'Ama Driver', errors: [], warnings: ['Possible name match in another row in this CSV. This is advisory only; every valid row remains a separate record.'] }],
};
function uploadedCsv() {
  const file = new File([csv], 'drivers.csv', { type: 'text/csv' });
  Object.defineProperty(file, 'text', { value: async () => csv });
  return file;
}

describe('DriverImportManager', () => {
  it('previews and imports all valid rows with an audit reason', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ preview: validPreview }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: { importedCount: 1, drivers: [{ id: 'driver-1', fullName: 'Ama Driver' }] } }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<DriverImportManager companyId="company-1" />);
    await user.upload(screen.getByLabelText('Driver CSV file'), uploadedCsv());
    await user.click(screen.getByRole('button', { name: 'Preview CSV' }));
    expect(await screen.findByText('Ama Driver')).toBeTruthy();
    expect(await screen.findByText(/Possible name match in another row in this CSV/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Import 1 driver' })).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Import 1 driver' }) as HTMLButtonElement).disabled).toBe(true);
    await user.type(screen.getByLabelText('Reason for this import'), 'Verified driver roster data');
    expect((screen.getByRole('button', { name: 'Import 1 driver' }) as HTMLButtonElement).disabled).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Import 1 driver' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/drivers/import/preview');
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/drivers/import');
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({ csv, reason: 'Verified driver roster data' });
    expect(await screen.findByText('1 driver record imported.')).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Imported driver records' })).toBeTruthy();
    expect((screen.getByLabelText('Driver CSV file') as HTMLInputElement).value).toBe('');
    expect((screen.getByRole('button', { name: 'Preview CSV' }) as HTMLButtonElement).disabled).toBe(true);
    expect(router.refresh).toHaveBeenCalledOnce();
  });

  it('does not offer import while any row is invalid', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ preview: {
      totalRows: 2, validRows: 1, invalidRows: 1, canImport: false, fileErrors: [],
      rows: [
        { rowNumber: 2, fullName: 'Ama Driver', errors: [], warnings: [] },
        { rowNumber: 3, fullName: '', errors: ['fullName: required'], warnings: [] },
      ],
    } }), { status: 200 })));
    render(<DriverImportManager companyId="company-1" />);
    await user.upload(screen.getByLabelText('Driver CSV file'), uploadedCsv());
    await user.click(screen.getByRole('button', { name: 'Preview CSV' }));
    expect(await screen.findByText(/All-or-nothing import/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Import all/ })).toBeNull();
  });
});
