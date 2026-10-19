// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomerImportManager } from './customer-import-manager';

const { router } = vi.hoisted(() => ({ router: { refresh: vi.fn() } }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
beforeEach(() => router.refresh.mockReset());

const csv = 'displayName,reference,contactPerson,telephone,email,billingDetails,customerType,status,notes\nAma Transport,AC-1,,,,Organisation,,Active,';
const validPreview = {
  totalRows: 1, validRows: 1, invalidRows: 0, canImport: true, fileErrors: [],
  rows: [{ rowNumber: 2, displayName: 'Ama Transport', reference: 'AC-1', errors: [] }],
};

function uploadedCsv() {
  const file = new File([csv], 'customers.csv', { type: 'text/csv' });
  Object.defineProperty(file, 'text', { value: async () => csv });
  return file;
}

describe('CustomerImportManager', () => {
  it('previews, requires a reason, and submits the complete validated batch', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ preview: validPreview }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: { importedCount: 1 } }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<CustomerImportManager companyId="company-1" />);

    await user.upload(screen.getByLabelText('Customer CSV file'), uploadedCsv());
    await user.click(screen.getByRole('button', { name: 'Preview CSV' }));
    expect(await screen.findByText('Ama Transport')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Import 1 customer' }) as HTMLButtonElement).disabled).toBe(true);
    await user.type(screen.getByLabelText('Reason for this import'), 'Verified existing customer records');
    await user.click(screen.getByRole('button', { name: 'Import 1 customer' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/customers/import/preview');
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/customers/import');
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({ csv, reason: 'Verified existing customer records' });
    expect(await screen.findByText('1 customer records imported.')).toBeTruthy();
    expect(router.refresh).toHaveBeenCalledOnce();
  });

  it('does not expose an import action when any row is invalid', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      preview: {
        totalRows: 2, validRows: 1, invalidRows: 1, canImport: false, fileErrors: [],
        rows: [
          { rowNumber: 2, displayName: 'Valid', reference: null, errors: [] },
          { rowNumber: 3, displayName: '', reference: null, errors: ['displayName: required'] },
        ],
      },
    }), { status: 200 })));
    render(<CustomerImportManager companyId="company-1" />);
    await user.upload(screen.getByLabelText('Customer CSV file'), uploadedCsv());
    await user.click(screen.getByRole('button', { name: 'Preview CSV' }));
    expect(await screen.findByText('All-or-nothing import: correct every file or row error and preview the corrected CSV again. No records have been imported.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Import all/ })).toBeNull();
  });
});
