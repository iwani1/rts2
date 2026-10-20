// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VehicleImportManager } from './vehicle-import-manager';

const { router } = vi.hoisted(() => ({ router: { refresh: vi.fn() } }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
beforeEach(() => router.refresh.mockReset());

const csv = 'registrationNumber,make,model,category,seatCount,fuelType,ownershipType,odometerValue,odometerUnit,insuranceExpiresAt,roadworthinessExpiresAt,registrationExpiresAt,nextServiceAt,notes\nGW-1234-25,Toyota,Hiace,Minibus,14,Diesel,,102.5,KM,,,,,Imported';
const vehicleValues = {
  registrationNumber: 'GW-1234-25', make: 'Toyota', model: 'Hiace', category: 'Minibus', seatCount: '14', fuelType: 'Diesel',
  ownershipType: '', odometerValue: '102.5', odometerUnit: 'KM', insuranceExpiresAt: '', roadworthinessExpiresAt: '',
  registrationExpiresAt: '', nextServiceAt: '', notes: 'Imported',
};
const validPreview = {
  totalRows: 1, validRows: 1, invalidRows: 0, canImport: true, fileErrors: [],
  rows: [{ rowNumber: 2, values: vehicleValues, registrationNumber: 'GW-1234-25', make: 'Toyota', model: 'Hiace', category: 'Minibus', errors: [] }],
};
function uploadedCsv() {
  const file = new File([csv], 'vehicles.csv', { type: 'text/csv' });
  Object.defineProperty(file, 'text', { value: async () => csv });
  return file;
}

describe('VehicleImportManager', () => {
  it('previews then imports the complete valid batch with an audit reason', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ preview: validPreview }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: { importedCount: 1, vehicles: [{ id: 'vehicle-1', registrationNumber: 'GW-1234-25', make: 'Toyota', model: 'Hiace' }] } }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<VehicleImportManager companyId="company-1" />);
    await user.upload(screen.getByLabelText('Vehicle CSV file'), uploadedCsv());
    await user.click(screen.getByRole('button', { name: 'Preview CSV' }));
    expect(await screen.findByText('GW-1234-25')).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Seats' })).toBeTruthy();
    expect(screen.getByText('14')).toBeTruthy();
    expect(screen.getByText('102.5')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Import 1 vehicle' }) as HTMLButtonElement).disabled).toBe(true);
    await user.type(screen.getByLabelText('Reason for this import'), 'Verified vehicle register data');
    await user.click(screen.getByRole('button', { name: 'Import 1 vehicle' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/vehicles/import/preview');
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/vehicles/import');
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({ csv, reason: 'Verified vehicle register data' });
    expect(await screen.findByText('1 vehicle record imported.')).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Imported vehicle records' })).toBeTruthy();
    expect(screen.getByText('Toyota Hiace')).toBeTruthy();
    expect((screen.getByLabelText('Vehicle CSV file') as HTMLInputElement).value).toBe('');
    expect((screen.getByRole('button', { name: 'Preview CSV' }) as HTMLButtonElement).disabled).toBe(true);
    expect(router.refresh).toHaveBeenCalledOnce();
  });

  it('does not offer import if any row has errors', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      preview: {
        totalRows: 2, validRows: 1, invalidRows: 1, canImport: false, fileErrors: [],
        rows: [
          { rowNumber: 2, values: vehicleValues, registrationNumber: 'GW-1234-25', make: 'Toyota', model: 'Hiace', category: 'Minibus', errors: [] },
          { rowNumber: 3, values: { ...vehicleValues, registrationNumber: '', make: '', model: '', category: '' }, registrationNumber: '', make: '', model: '', category: '', errors: ['registrationNumber: required'] },
        ],
      },
    }), { status: 200 })));
    render(<VehicleImportManager companyId="company-1" />);
    await user.upload(screen.getByLabelText('Vehicle CSV file'), uploadedCsv());
    await user.click(screen.getByRole('button', { name: 'Preview CSV' }));
    expect(await screen.findByText(/All-or-nothing import/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Import all/ })).toBeNull();
  });
});
