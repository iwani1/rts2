// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkOrderManager } from './work-order-manager';

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock('next/link', () => ({ default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a> }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('WorkOrderManager', () => {
  it('requires non-safety confirmation and creates an audited non-safety report with explicit fields', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ workOrder: {
      id: 'wo-1', reference: 'WO-AABBCCDDEEFF0011', status: 'Reported',
    } }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<WorkOrderManager companyId="company-1" vehicles={[{
      id: 'vehicle-1', registrationNumber: 'GT-1234-25', make: 'Toyota', model: 'Hiace', odometerUnit: 'KM',
    }]} initialWorkOrders={[]} />);

    fireEvent.change(screen.getByLabelText('Vehicle'), { target: { value: 'vehicle-1' } });
    fireEvent.change(screen.getByLabelText('Work type (optional)'), { target: { value: 'Inspection' } });
    fireEvent.change(screen.getByLabelText('Priority (optional; enter the operator’s priority label)'), { target: { value: 'Routine' } });
    fireEvent.change(screen.getByLabelText('Date reported'), { target: { value: '2026-10-20' } });
    fireEvent.change(screen.getByLabelText(/Odometer reading/), { target: { value: '34567.5' } });
    fireEvent.change(screen.getByLabelText('Odometer unit (required when a reading is entered)'), { target: { value: 'KM' } });
    fireEvent.change(screen.getByLabelText('Reported fault'), { target: { value: 'Front left door latch sticks when opened' } });
    fireEvent.change(screen.getByLabelText('Reason for creating this work order'), { target: { value: 'Record a routine non-safety door inspection' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Record work order' }));

    expect(await screen.findByText(/WO-AABBCCDDEEFF0011 recorded as Reported/)).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      vehicleId: 'vehicle-1', reportedFault: 'Front left door latch sticks when opened', workType: 'Inspection',
      priority: 'Routine', dateReported: '2026-10-20', odometerValue: 34567.5, odometerUnit: 'KM', safetyRelated: false,
      reason: 'Record a routine non-safety door inspection',
    });
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it('finds and selects an active vehicle beyond the initial bounded picker', async () => {
    const match = { id: 'vehicle-51', registrationNumber: 'GT-9999-26', make: 'Toyota', model: 'Hilux', odometerUnit: 'KM' };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ vehicles: [match], hasMore: false }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<WorkOrderManager companyId="company-1" vehicles={[{
      id: 'vehicle-1', registrationNumber: 'GT-0001-26', make: 'Toyota', model: 'Hiace', odometerUnit: 'KM',
    }]} vehiclesHaveMore initialWorkOrders={[]} />);
    fireEvent.change(screen.getByLabelText('Find vehicle by registration, make or model'), { target: { value: 'GT-9999' } });
    expect(await screen.findByRole('option', { name: /GT-9999-26/ })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Vehicle'), { target: { value: 'vehicle-51' } });
    expect(screen.getByLabelText('Vehicle')).toHaveProperty('value', 'vehicle-51');
    fireEvent.change(screen.getByLabelText('Find vehicle by registration, make or model'), { target: { value: '' } });
    await waitFor(() => expect(screen.getByLabelText('Vehicle')).toHaveProperty('value', 'vehicle-51'));
    expect(fetchMock).toHaveBeenCalledWith('/api/companies/company-1/maintenance/vehicle-options?q=GT-9999', expect.objectContaining({ signal: expect.any(AbortSignal), cache: 'no-store' }));
  });

  it('disables vehicle selection until the current search results arrive', async () => {
    const match = { id: 'vehicle-52', registrationNumber: 'GT-5555-26', make: 'Toyota', model: 'Hiace', odometerUnit: 'KM' };
    let resolveResponse!: (response: Response) => void;
    const pendingResponse = new Promise<Response>((resolve) => { resolveResponse = resolve; });
    const fetchMock = vi.fn<typeof fetch>().mockReturnValue(pendingResponse);
    vi.stubGlobal('fetch', fetchMock);
    render(<WorkOrderManager companyId="company-1" vehicles={[{
      id: 'vehicle-1', registrationNumber: 'GT-0001-26', make: 'Toyota', model: 'Hiace', odometerUnit: 'KM',
    }]} initialWorkOrders={[]} />);
    fireEvent.change(screen.getByLabelText('Find vehicle by registration, make or model'), { target: { value: 'GT-5555' } });
    expect(screen.getByLabelText('Vehicle')).toHaveProperty('disabled', true);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(screen.getByLabelText('Vehicle')).toHaveProperty('disabled', true);
    resolveResponse(new Response(JSON.stringify({ vehicles: [match], hasMore: false }), { status: 200 }));
    expect(await screen.findByRole('option', { name: /GT-5555-26/ })).toBeTruthy();
    expect(screen.getByLabelText('Vehicle')).toHaveProperty('disabled', false);
  });

  it('ignores a stale vehicle-search response that arrives after the latest query', async () => {
    const responses: Array<(response: Response) => void> = [];
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(() => new Promise<Response>((resolve) => { responses.push(resolve); }));
    vi.stubGlobal('fetch', fetchMock);
    render(<WorkOrderManager companyId="company-1" vehicles={[{
      id: 'vehicle-1', registrationNumber: 'GT-0001-26', make: 'Toyota', model: 'Hiace', odometerUnit: 'KM',
    }]} initialWorkOrders={[]} />);
    const search = screen.getByLabelText('Find vehicle by registration, make or model');
    fireEvent.change(search, { target: { value: 'GT-OLD' } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.change(search, { target: { value: 'GT-NEW' } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect((fetchMock.mock.calls[0]?.[1]?.signal as AbortSignal).aborted).toBe(true);
    responses[1]?.(new Response(JSON.stringify({ vehicles: [{
      id: 'vehicle-new', registrationNumber: 'GT-NEW-26', make: 'Toyota', model: 'Coaster', odometerUnit: 'KM',
    }], hasMore: false }), { status: 200 }));
    expect(await screen.findByRole('option', { name: /GT-NEW-26/ })).toBeTruthy();
    responses[0]?.(new Response(JSON.stringify({ vehicles: [{
      id: 'vehicle-old', registrationNumber: 'GT-OLD-26', make: 'Toyota', model: 'Coaster', odometerUnit: 'KM',
    }], hasMore: false }), { status: 200 }));
    await waitFor(() => expect(screen.queryByRole('option', { name: /GT-OLD-26/ })).toBeNull());
    expect(screen.getByRole('option', { name: /GT-NEW-26/ })).toBeTruthy();
  });

  it('records completion date-time as Africa/Accra wall time independent of browser timezone', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ workOrder: {
      id: 'wo-time', reference: 'WO-ACC0A1B2C3D4E5F6', status: 'Completed',
    } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<WorkOrderManager companyId="company-1" vehicles={[]} initialWorkOrders={[{
      id: 'wo-time', reference: 'WO-ACC0A1B2C3D4E5F6', vehicleId: 'vehicle-1', reportedFault: 'Routine hinge repair required',
      workType: null, priority: null, dateReported: '2026-10-20', status: 'Awaiting Review',
      requiredWork: null, parts: null, completionDate: null, inspectionResults: null,
      labourCostPesewas: null, partsCostPesewas: null, otherCostPesewas: null,
      vehicle: { registrationNumber: 'GT-1234-25', make: 'Toyota', model: 'Hiace' }, statusHistory: [{
        sequence: 6, fromStatus: 'In Progress', toStatus: 'Awaiting Review', reason: 'Work is ready for inspection',
        createdAt: '2026-10-20T10:00:00.000Z', actorName: 'Fleet Manager',
      }],
    }]} />);
    fireEvent.click(screen.getByText('WO-ACC0A1B2C3D4E5F6: transition from Awaiting Review'));
    fireEvent.change(screen.getByLabelText('Next status'), { target: { value: 'Completed' } });
    fireEvent.change(screen.getByLabelText('Reason for transition'), { target: { value: 'Inspection passed and work is complete' } });
    fireEvent.change(screen.getByLabelText('Completion date and time'), { target: { value: '2026-10-20T12:45' } });
    fireEvent.change(screen.getByLabelText('Inspection results'), { target: { value: 'Hinge operation tested and passed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record transition' }));
    expect(await screen.findByText(/moved to Completed/)).toBeTruthy();
    const payload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(payload.completionDate).toBe('2026-10-20T12:45:00.000Z');
  });

  it('submits a reasoned transition only to a displayed next status', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ workOrder: {
      id: 'wo-1', reference: 'WO-AABBCCDDEEFF0011', status: 'Awaiting Inspection',
    } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<WorkOrderManager companyId="company-1" vehicles={[]} initialWorkOrders={[{
      id: 'wo-1', reference: 'WO-AABBCCDDEEFF0011', vehicleId: 'vehicle-1', reportedFault: 'Front latch is sticking',
      workType: null, priority: null, dateReported: '2026-10-20', status: 'Reported',
      requiredWork: null, parts: null, completionDate: null, inspectionResults: null,
      labourCostPesewas: null, partsCostPesewas: null, otherCostPesewas: null,
      vehicle: { registrationNumber: 'GT-1234-25', make: 'Toyota', model: 'Hiace' }, statusHistory: [{
        sequence: 1, fromStatus: null, toStatus: 'Reported', reason: 'Record routine maintenance fault',
        createdAt: '2026-10-20T10:00:00.000Z', actorName: 'Fleet Manager',
      }],
    }]} statusFilter="Reported" searchQuery="door" />);
    expect(screen.getByLabelText('Filter by current status')).toHaveProperty('value', 'Reported');
    expect(screen.getByLabelText('Search reference, fault or registration')).toHaveProperty('value', 'door');
    expect(screen.getByText('Record routine maintenance fault')).toBeTruthy();
    expect(screen.getByText(/Fleet Manager ·/)).toBeTruthy();
    fireEvent.click(screen.getByText('WO-AABBCCDDEEFF0011: transition from Reported'));
    fireEvent.change(screen.getByLabelText('Next status'), { target: { value: 'Awaiting Inspection' } });
    fireEvent.change(screen.getByLabelText('Reason for transition'), { target: { value: 'Move the vehicle to inspection queue' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record transition' }));
    expect(await screen.findByText(/moved to Awaiting Inspection/)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith('/api/companies/company-1/maintenance/work-orders/wo-1', expect.objectContaining({
      method: 'PATCH', body: JSON.stringify({ toStatus: 'Awaiting Inspection', reason: 'Move the vehicle to inspection queue' }),
    }));
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it('offers a working clear-filters path when the maintenance register has no matches', () => {
    render(<WorkOrderManager companyId="company-1" vehicles={[]} initialWorkOrders={[]} statusFilter="Reported" searchQuery="no match" />);
    expect(screen.getByRole('heading', { name: 'No work orders match these filters' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Clear filters' }).getAttribute('href')).toBe('/fleet/maintenance');
  });

  it('preserves filters and validated cursor history across previous and next pages', () => {
    render(<WorkOrderManager companyId="company-1" vehicles={[]} initialWorkOrders={[]} statusFilter="Reported" searchQuery="door latch" pageCursor="current-cursor" cursorHistory={['ROOT', 'prior-cursor']} nextCursor="next-cursor" />);
    expect(screen.getByRole('link', { name: 'Previous page' }).getAttribute('href')).toBe('/fleet/maintenance?status=Reported&q=door+latch&cursor=prior-cursor&cursorHistory=ROOT');
    expect(screen.getByRole('link', { name: 'Next page' }).getAttribute('href')).toBe('/fleet/maintenance?status=Reported&q=door+latch&cursor=next-cursor&cursorHistory=ROOT.prior-cursor.current-cursor');
  });

  it('shows the persisted completion evidence and formats integer pesewas exactly', () => {
    render(<WorkOrderManager companyId="company-1" vehicles={[]} initialWorkOrders={[{
      id: 'wo-complete', reference: 'WO-1122334455667788', vehicleId: 'vehicle-1', reportedFault: 'Routine hinge repair required',
      workType: 'Repair', priority: null, dateReported: '2026-10-20', status: 'Completed',
      requiredWork: 'Adjust the hinge', parts: 'Seal kit', completionDate: '2026-10-21T10:00:00.000Z',
      inspectionResults: 'Hinge operation tested and passed', labourCostPesewas: '12500', partsCostPesewas: '0', otherCostPesewas: null,
      vehicle: { registrationNumber: 'GT-1234-25', make: 'Toyota', model: 'Hiace' }, statusHistory: [{
        sequence: 6, fromStatus: 'Awaiting Review', toStatus: 'Completed', reason: 'Inspection passed and work is complete',
        createdAt: '2026-10-21T10:00:00.000Z', actorName: 'Fleet Manager',
      }],
    }]} />);
    fireEvent.click(screen.getByText('WO-1122334455667788: planned work, completion evidence and costs'));
    expect(screen.getByText('Adjust the hinge')).toBeTruthy();
    expect(screen.getByText('Hinge operation tested and passed')).toBeTruthy();
    expect(screen.getByText('GHS 125.00')).toBeTruthy();
    expect(screen.getByText('GHS 0.00')).toBeTruthy();
    expect(screen.getAllByText('Not recorded')).toHaveLength(2);
  });
});
