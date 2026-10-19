// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import VehicleDocumentsPage from './page';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  findUser: vi.fn(),
  findCompanies: vi.fn(),
  listVehicles: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => { throw new Error(`NEXT_REDIRECT:${path}`); },
  notFound: () => { throw new Error('NEXT_NOT_FOUND'); },
}));
vi.mock('@/server/auth', () => ({ getAuth: () => ({ api: { getSession: mocks.getSession } }) }));
vi.mock('@/server/prisma', () => ({
  getPrisma: () => ({
    user: { findUnique: mocks.findUser },
    company: { findMany: mocks.findCompanies },
  }),
}));
vi.mock('@/modules/fleet/vehicles', () => ({
  listVehicles: mocks.listVehicles,
  FleetCompanyNotFoundError: class FleetCompanyNotFoundError extends Error {},
}));

afterEach(cleanup);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: 'fleet-manager-1' } });
  mocks.findUser.mockResolvedValue({ status: 'ACTIVE' });
  mocks.findCompanies.mockResolvedValue([{ id: 'company-1', name: 'Richie Transport Services' }]);
  mocks.listVehicles.mockResolvedValue({
    canManage: true,
    nextCursor: null,
    vehicles: [{
      id: 'vehicle-1', registrationNumber: 'GR 1234-25', make: 'Toyota', model: 'Hiace',
      insuranceExpiresAt: '2027-07-01', roadworthinessExpiresAt: '2026-12-30', registrationExpiresAt: '2027-01-15',
    }],
  });
});

describe('VehicleDocumentsPage', () => {
  it('redirects anonymous users before loading the company or vehicles', async () => {
    mocks.getSession.mockResolvedValue(null);

    await expect(VehicleDocumentsPage({ searchParams: Promise.resolve({}) }))
      .rejects.toThrow('NEXT_REDIRECT:/login');
    expect(mocks.findCompanies).not.toHaveBeenCalled();
    expect(mocks.listVehicles).not.toHaveBeenCalled();
  });

  it('passes search and pagination cursors to the tenant-scoped vehicle service', async () => {
    await VehicleDocumentsPage({ searchParams: Promise.resolve({ q: 'Toyota', cursor: 'vehicle-cursor' }) });

    expect(mocks.listVehicles).toHaveBeenCalledWith({
      actorId: 'fleet-manager-1', companyId: 'company-1', search: 'Toyota', cursor: 'vehicle-cursor',
    });
  });

  it('shows only manually recorded document dates and makes no reminder claims', async () => {
    const page = await VehicleDocumentsPage({ searchParams: Promise.resolve({}) });
    render(page);

    expect(screen.getByRole('heading', { name: 'Vehicle document dates' })).toBeTruthy();
    const table = screen.getByRole('table', { name: 'Recorded vehicle document expiry dates, earliest first' });
    const documentCells = Array.from(table.querySelectorAll('tbody tr td:nth-child(2)'));
    expect(documentCells.map((cell) => cell.textContent)).toEqual(['Roadworthiness', 'Vehicle Registration', 'Insurance']);
    expect(screen.getByText('2026-12-30')).toBeTruthy();
    expect(screen.getByText(/does not classify expiry status or send reminders/i)).toBeTruthy();
  });

  it('filters by the selected document type and preserves it when paging', async () => {
    mocks.listVehicles.mockResolvedValue({
      canManage: true,
      nextCursor: 'vehicle-2',
      vehicles: [{
        id: 'vehicle-1', registrationNumber: 'GR 1234-25', make: 'Toyota', model: 'Hiace',
        insuranceExpiresAt: '2027-07-01', roadworthinessExpiresAt: '2026-12-30', registrationExpiresAt: '2027-01-15',
      }],
    });
    const page = await VehicleDocumentsPage({ searchParams: Promise.resolve({ q: 'Toyota', type: 'Insurance' }) });
    render(page);

    expect(screen.getByLabelText('Document type')).toHaveProperty('value', 'Insurance');
    const table = screen.getByRole('table', { name: 'Recorded insurance expiry dates, earliest first' });
    const rows = table.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.textContent).toContain('Insurance');
    expect(rows[0]?.textContent).not.toContain('Roadworthiness');
    const nextPage = screen.getByRole('link', { name: 'Next page' });
    expect(nextPage.getAttribute('href')).toContain('q=Toyota');
    expect(nextPage.getAttribute('href')).toContain('type=Insurance');
    expect(nextPage.getAttribute('href')).toContain('cursor=vehicle-2');
  });

  it('offers a clear-filters link when a search and document filter find no vehicles', async () => {
    mocks.listVehicles.mockResolvedValue({ canManage: true, nextCursor: null, vehicles: [] });
    const page = await VehicleDocumentsPage({ searchParams: Promise.resolve({ q: 'missing', type: 'Insurance' }) });
    render(page);

    expect(screen.getByRole('heading', { name: 'No vehicles found' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Clear filters' }).getAttribute('href')).toBe('/fleet/vehicles/documents');
  });

  it('redirects limited fleet views before displaying document dates', async () => {
    mocks.listVehicles.mockResolvedValue({ canManage: false, nextCursor: null, vehicles: [] });

    await expect(VehicleDocumentsPage({ searchParams: Promise.resolve({}) }))
      .rejects.toThrow('NEXT_REDIRECT:/fleet/vehicles');
  });
});
