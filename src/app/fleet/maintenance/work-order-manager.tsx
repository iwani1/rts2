'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { accraLocalDateTimeToISOString, formatAccraDateTime } from '@/modules/time/accra-date-time';
import { useRouter } from 'next/navigation';

type VehicleOption = { id: string; registrationNumber: string; make: string; model: string; odometerUnit: string | null };
type WorkOrder = {
  id: string; reference: string; vehicleId: string; reportedFault: string; workType: string | null; priority: string | null;
  dateReported: string; status: string; requiredWork: string | null; parts: string | null; completionDate: string | null;
  inspectionResults: string | null; labourCostPesewas: string | null; partsCostPesewas: string | null; otherCostPesewas: string | null;
  vehicle: { registrationNumber: string; make: string; model: string };
  statusHistory: Array<{ sequence: number; fromStatus: string | null; toStatus: string; reason: string; createdAt: string; actorName: string }>;
};

function dateOnly(value: string) { return value.slice(0, 10); }
function formatPesewas(value: string | null) {
  if (value === null) return 'Not recorded';
  const pesewas = BigInt(value);
  return `GHS ${pesewas / BigInt(100)}.${String(pesewas % BigInt(100)).padStart(2, '0')}`;
}
function dateTimeGhana(value: string) { return formatAccraDateTime(value); }
const workOrderStatuses = ['Reported', 'Awaiting Inspection', 'Approved', 'In Progress', 'Awaiting Parts', 'Awaiting Review', 'Completed', 'Closed', 'Cancelled'];
function workOrdersHref({ status, search, cursor, history }: { status?: string; search?: string; cursor?: string; history?: string[] }) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (search) params.set('q', search);
  if (cursor) params.set('cursor', cursor);
  if (history?.length) params.set('cursorHistory', history.join('.'));
  const query = params.toString();
  return `/fleet/maintenance${query ? `?${query}` : ''}`;
}
const nextStatuses: Record<string, string[]> = {
  Reported: ['Awaiting Inspection', 'Cancelled'], 'Awaiting Inspection': ['Approved', 'Cancelled'], Approved: ['In Progress'],
  'In Progress': ['Awaiting Parts', 'Awaiting Review'], 'Awaiting Parts': ['In Progress'], 'Awaiting Review': ['Completed'], Completed: ['Closed'], Closed: [], Cancelled: [],
};

export function WorkOrderManager({ companyId, vehicles, vehiclesHaveMore = false, initialWorkOrders, statusFilter, searchQuery, pageCursor, cursorHistory = [], nextCursor = null }: {
  companyId: string;
  vehicles: VehicleOption[];
  vehiclesHaveMore?: boolean;
  initialWorkOrders: WorkOrder[];
  statusFilter?: string;
  searchQuery?: string;
  pageCursor?: string;
  cursorHistory?: string[];
  nextCursor?: string | null;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [transitioningId, setTransitioningId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [selectedVehicleOption, setSelectedVehicleOption] = useState<VehicleOption | null>(null);
  const [vehicleOptions, setVehicleOptions] = useState(vehicles);
  const [optionsHaveMore, setOptionsHaveMore] = useState(vehiclesHaveMore);
  const [vehicleQuery, setVehicleQuery] = useState('');
  const [vehicleLoading, setVehicleLoading] = useState(false);
  const [vehicleSearchError, setVehicleSearchError] = useState('');
  const previousToken = cursorHistory[cursorHistory.length - 1];
  const previousHref = workOrdersHref({
    status: statusFilter, search: searchQuery,
    cursor: previousToken && previousToken !== 'ROOT' ? previousToken : undefined,
    history: cursorHistory.slice(0, -1),
  });
  const nextHistory = pageCursor
    ? [...cursorHistory.slice(-49), pageCursor]
    : ['ROOT'];
  const selectedVehicle = selectedVehicleOption;

  useEffect(() => {
    const search = vehicleQuery.trim();
    if (!search) {
      setVehicleOptions(selectedVehicle && !vehicles.some((vehicle) => vehicle.id === selectedVehicle.id) ? [selectedVehicle, ...vehicles] : vehicles);
      setOptionsHaveMore(vehiclesHaveMore);
      setVehicleSearchError('');
      setVehicleLoading(false);
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setVehicleLoading(true);
      setVehicleSearchError('');
      try {
        const response = await fetch(`/api/companies/${encodeURIComponent(companyId)}/maintenance/vehicle-options?q=${encodeURIComponent(search)}`, { signal: controller.signal, cache: 'no-store' });
        const body = await response.json() as { vehicles?: VehicleOption[]; hasMore?: boolean; error?: string };
        if (controller.signal.aborted) return;
        if (!response.ok) throw new Error(body.error || 'Unable to search active vehicles.');
        const matches = body.vehicles ?? [];
        setVehicleOptions(selectedVehicle && !matches.some((vehicle) => vehicle.id === selectedVehicle.id) ? [selectedVehicle, ...matches] : matches);
        setOptionsHaveMore(Boolean(body.hasMore));
      } catch (caught) {
        if (!controller.signal.aborted) setVehicleSearchError(caught instanceof Error ? caught.message : 'Unable to search active vehicles.');
      } finally {
        if (!controller.signal.aborted) setVehicleLoading(false);
      }
    }, 250);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [companyId, vehicleQuery, vehicles, vehiclesHaveMore, selectedVehicle]);

  async function transition(event: FormEvent<HTMLFormElement>, workOrder: WorkOrder) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const toStatus = String(form.get('toStatus') ?? '');
    const reason = String(form.get('transitionReason') ?? '').trim();
    setTransitioningId(workOrder.id); setError(''); setNotice('');
    const payload: Record<string, unknown> = { toStatus, reason };
    if (toStatus === 'Approved') {
      payload.requiredWork = String(form.get('requiredWork') ?? '').trim() || null;
      payload.parts = String(form.get('parts') ?? '').trim() || null;
    }
    if (toStatus === 'Completed') {
      const completionValue = String(form.get('completionDate') ?? '');
      payload.completionDate = completionValue ? accraLocalDateTimeToISOString(completionValue) : '';
      payload.inspectionResults = String(form.get('inspectionResults') ?? '').trim();
      for (const key of ['labourCostPesewas', 'partsCostPesewas', 'otherCostPesewas']) {
        const value = String(form.get(key) ?? '').trim();
        if (value !== '') payload[key] = Number(value);
      }
    }
    try {
      const response = await fetch(`/api/companies/${encodeURIComponent(companyId)}/maintenance/work-orders/${encodeURIComponent(workOrder.id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const body = await response.json() as { workOrder?: WorkOrder; error?: string };
      if (!response.ok) throw new Error(body.error || 'Unable to update this work order.');
      setNotice(`${workOrder.reference} moved to ${body.workOrder?.status ?? toStatus}.`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to update this work order.');
    } finally { setTransitioningId(''); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setSaving(true); setError(''); setNotice('');
    const odometer = String(form.get('odometerValue') ?? '').trim();
    const odometerUnit = String(form.get('odometerUnit') ?? '').trim();
    try {
      const response = await fetch(`/api/companies/${encodeURIComponent(companyId)}/maintenance/work-orders`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicleId,
          reportedFault: String(form.get('reportedFault') ?? '').trim(),
          workType: String(form.get('workType') ?? '').trim() || null,
          priority: String(form.get('priority') ?? '').trim() || null,
          dateReported: form.get('dateReported'),
          odometerValue: odometer === '' ? null : Number(odometer),
          odometerUnit: odometer === '' || odometerUnit === '' ? null : odometerUnit,
          safetyRelated: false,
          reason: String(form.get('reason') ?? '').trim(),
        }),
      });
      const body = await response.json() as { workOrder?: WorkOrder; error?: string };
      if (!response.ok) throw new Error(body.error || 'Unable to report this work order.');
      setNotice(`Work order ${body.workOrder?.reference ?? ''} recorded as Reported.`);
      formElement.reset();
      setVehicleId(''); setSelectedVehicleOption(null); setVehicleQuery('');
      setVehicleOptions(vehicles); setOptionsHaveMore(vehiclesHaveMore);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to report this work order.');
    } finally { setSaving(false); }
  }

  return <>
    <section className="vehicle-editor" aria-labelledby="work-order-create-title">
      <div className="vehicle-editor-heading"><div><p className="eyebrow">Maintenance intake</p><h2 id="work-order-create-title">Report non-safety maintenance</h2></div></div>
      <p className="form-help"><strong>Safety boundary:</strong> this intake accepts only faults explicitly confirmed as not safety-related. For a safety-related defect, apply a safety block from the vehicle register immediately; safety work-order linkage is not yet active.</p>
      {error && <p role="alert" className="form-error">{error}</p>}{notice && <p role="status" className="form-success">{notice}</p>}
      {vehicles.length === 0 ? <p className="fleet-empty">Add an active vehicle before reporting a work order.</p> : <form className="vehicle-form" onSubmit={(event) => void submit(event)}>
        <div className="vehicle-form-grid">
          <label htmlFor="work-order-vehicle-search">Find vehicle by registration, make or model<input id="work-order-vehicle-search" type="search" maxLength={100} value={vehicleQuery} onChange={(event) => {
            const query = event.target.value;
            setVehicleQuery(query); setVehicleOptions(selectedVehicleOption ? [selectedVehicleOption] : []);
            setVehicleLoading(Boolean(query.trim())); setVehicleSearchError('');
          }} placeholder="Search active vehicles" /></label>
          <label htmlFor="work-order-vehicle">Vehicle<select id="work-order-vehicle" required disabled={vehicleLoading} value={vehicleId} onChange={(event) => {
            const value = event.target.value;
            setVehicleId(value);
            setSelectedVehicleOption(vehicleOptions.find((vehicle) => vehicle.id === value) ?? null);
          }}><option value="">Choose a vehicle</option>{vehicleOptions.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.registrationNumber} — {vehicle.make} {vehicle.model}</option>)}</select></label>
          {vehicleLoading && <p className="form-help" role="status">Searching active vehicles…</p>}
          {vehicleSearchError && <p className="form-error" role="alert">{vehicleSearchError}</p>}
          {!vehicleLoading && optionsHaveMore && <p className="form-help">More than 50 active vehicles match. Search by registration, make or model to narrow the list.</p>}
          {!vehicleLoading && vehicleOptions.length === 0 && <p className="form-help">No active vehicles match this search.</p>}
          <label>Work type (optional)<input name="workType" maxLength={120} /></label>
          <label>Priority (optional; enter the operator’s priority label)<input name="priority" maxLength={40} /></label>
          <label>Date reported<input name="dateReported" type="date" required /></label>
          <label>Odometer reading (optional)<input name="odometerValue" type="number" min="0" step="0.01" aria-describedby="work-order-odometer-help" /></label>
          <label>Odometer unit (required when a reading is entered)<select name="odometerUnit" defaultValue=""><option value="">Not recorded</option><option value="KM">Kilometres</option><option value="MILE">Miles</option></select></label>
          <p id="work-order-odometer-help" className="form-help">Vehicle register unit: {selectedVehicle?.odometerUnit === 'KM' ? 'kilometres' : selectedVehicle?.odometerUnit === 'MILE' ? 'miles' : 'not recorded'}. Confirm the unit for this reading; it is never inferred.</p>
        </div>
        <label htmlFor="work-order-fault">Reported fault<textarea id="work-order-fault" name="reportedFault" minLength={8} maxLength={2000} required /></label>
        <label htmlFor="work-order-reason">Reason for creating this work order<textarea id="work-order-reason" name="reason" minLength={8} maxLength={500} required /></label>
        <label className="consent-check"><input type="checkbox" required />I confirm this fault is not safety-related. If it may affect safe operation, I will not submit it here.</label>
        <button className="button-primary" type="submit" disabled={saving}>{saving ? 'Recording…' : 'Record work order'}</button>
      </form>}
    </section>
    <section className="fleet-list-panel" aria-labelledby="work-order-list-title">
      <div className="fleet-list-heading">
        <div><h2 id="work-order-list-title">Work orders</h2><p className="muted">Showing up to the latest 100 matches{statusFilter ? ` at ${statusFilter}` : ''}{searchQuery ? ` for “${searchQuery}”` : ''}.</p></div>
        <form className="fleet-search work-order-search" method="get" aria-label="Search and filter work orders">
          <label htmlFor="work-order-search-query">Search reference, fault or registration</label>
          <input id="work-order-search-query" type="search" name="q" maxLength={100} defaultValue={searchQuery ?? ''} placeholder="Reference, fault or vehicle" />
          <label htmlFor="work-order-status-filter">Filter by current status</label>
          <div><select id="work-order-status-filter" name="status" defaultValue={statusFilter ?? ''}><option value="">All statuses</option>{workOrderStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select><button className="button-link" type="submit">Apply filters</button></div>
        </form>
      </div>
      {initialWorkOrders.length === 0 ? <div className="fleet-empty"><h3>{statusFilter || searchQuery ? 'No work orders match these filters' : 'No work orders recorded'}</h3><p>{statusFilter || searchQuery ? <>Change or clear the search and status filters to see other records. <Link className="button-link" href="/fleet/maintenance">Clear filters</Link></> : 'Non-safety maintenance reports will appear here.'}</p></div> : <div className="vehicle-table-wrap" role="region" aria-label="Maintenance work orders" tabIndex={0}>
        <table className="vehicle-table"><caption className="sr-only">Maintenance work orders</caption><thead><tr><th scope="col">Reference</th><th scope="col">Reported</th><th scope="col">Vehicle</th><th scope="col">Fault</th><th scope="col">Work type</th><th scope="col">Priority</th><th scope="col">Status</th></tr></thead>
          <tbody>{initialWorkOrders.map((item) => <tr key={item.id}><td><strong>{item.reference}</strong></td><td>{dateOnly(item.dateReported)}</td><td>{item.vehicle.registrationNumber} — {item.vehicle.make} {item.vehicle.model}</td><td>{item.reportedFault}</td><td>{item.workType ?? 'Not recorded'}</td><td>{item.priority ?? 'Not recorded'}</td><td>{item.status}</td></tr>)}</tbody>
        </table>
      </div>}
      {(pageCursor || nextCursor) && <nav className="fleet-pagination" aria-label="Work-order pages">
        {pageCursor && <Link className="button-link" href={previousHref}>Previous page</Link>}
        <span className="muted">Showing up to 100 records per page.</span>
        {nextCursor && <Link className="button-link" href={workOrdersHref({ status: statusFilter, search: searchQuery, cursor: nextCursor, history: nextHistory })}>Next page</Link>}
      </nav>}
      {initialWorkOrders.map((item) => <details key={`details-${item.id}`} className="vehicle-editor">
        <summary>{item.reference}: planned work, completion evidence and costs</summary>
        <dl className="work-order-detail-grid">
          <div><dt>Planned work</dt><dd>{item.requiredWork ?? 'Not recorded'}</dd></div>
          <div><dt>Parts</dt><dd>{item.parts ?? 'Not recorded'}</dd></div>
          <div><dt>Completion date</dt><dd>{item.completionDate ? dateTimeGhana(item.completionDate) : 'Not recorded'}</dd></div>
          <div><dt>Inspection results</dt><dd>{item.inspectionResults ?? 'Not recorded'}</dd></div>
          <div><dt>Labour cost</dt><dd>{formatPesewas(item.labourCostPesewas)}</dd></div>
          <div><dt>Parts cost</dt><dd>{formatPesewas(item.partsCostPesewas)}</dd></div>
          <div><dt>Other cost</dt><dd>{formatPesewas(item.otherCostPesewas)}</dd></div>
        </dl>
      </details>)}
      {initialWorkOrders.map((item) => <details key={`history-${item.id}`} className="vehicle-editor">
        <summary>{item.reference}: status audit history ({item.statusHistory.length} of up to 50 events)</summary>
        {item.statusHistory.length === 0 ? <p className="form-help">No status history is available for this record.</p> : <ol>
          {item.statusHistory.map((event) => <li key={event.sequence}>
            <strong>{event.fromStatus ? `${event.fromStatus} → ` : ''}{event.toStatus}</strong>
            <p>{event.reason}</p>
            <p className="muted">{event.actorName} · {dateTimeGhana(event.createdAt)} · event {event.sequence}</p>
          </li>)}
        </ol>}
      </details>)}
      {initialWorkOrders.filter((item) => (nextStatuses[item.status] ?? []).length > 0).map((item) => <details key={`transition-${item.id}`} className="vehicle-editor">
        <summary>{item.reference}: transition from {item.status}</summary>
        <form className="vehicle-form" onSubmit={(event) => void transition(event, item)}>
          <label>Next status<select name="toStatus" required defaultValue="">{<option value="" disabled>Choose allowed next status</option>}{nextStatuses[item.status]?.map((status) => <option key={status}>{status}</option>)}</select></label>
          <label>Reason for transition<textarea name="transitionReason" minLength={8} maxLength={500} required /></label>
          {nextStatuses[item.status]?.includes('Approved') && <><label>Planned work (optional)<textarea name="requiredWork" maxLength={4000} /></label><label>Parts (optional)<textarea name="parts" maxLength={4000} /></label></>}
          {nextStatuses[item.status]?.includes('Completed') && <><label>Completion date and time<input name="completionDate" type="datetime-local" required /></label><label>Inspection results<textarea name="inspectionResults" minLength={8} maxLength={4000} required /></label>
            <div className="vehicle-form-grid">{[['labourCostPesewas', 'Labour cost (pesewas)'], ['partsCostPesewas', 'Parts cost (pesewas)'], ['otherCostPesewas', 'Other cost (pesewas)']].map(([name, label]) => <label key={name}>{label} (optional)<input name={name} type="number" min="0" step="1" /></label>)}</div>
          </>}
          <button className="button-primary" type="submit" disabled={transitioningId === item.id}>{transitioningId === item.id ? 'Saving…' : 'Record transition'}</button>
        </form>
      </details>)}
    </section>
  </>;
}
