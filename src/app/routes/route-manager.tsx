'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LocationRecord } from '@/modules/routes/locations';
import type { RouteRecord } from '@/modules/routes/routes';
import type { RouteScheduleRecord } from '@/modules/routes/route-schedules';
import type { RoutePlan } from '@/modules/routes/route-plan';

type ClientOption = { id: string; name: string };
type StopDraft = { key: number; locationId: string; stopKind: string; plannedOffsetMinutes: string };
const DAY_CODES = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;

function value(form: FormData, name: string) {
  const entry = form.get(name);
  return typeof entry === 'string' ? entry.trim() : '';
}

export function RouteManager({ companyId, clients, locations, route, schedules, plan }: {
  companyId: string;
  clients: ClientOption[];
  locations: LocationRecord[];
  route?: RouteRecord;
  schedules: RouteScheduleRecord[];
  plan?: RoutePlan;
}) {
  const router = useRouter();
  const [interactive, setInteractive] = useState(false);
  useEffect(() => setInteractive(true), []);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [archiveReason, setArchiveReason] = useState('');
  const [stops, setStops] = useState<StopDraft[]>(() => (route?.stops ?? []).map((stop, index) => ({
    key: index, locationId: stop.locationId, stopKind: stop.stopKind,
    plannedOffsetMinutes: stop.plannedOffsetMinutes === null ? '' : String(stop.plannedOffsetMinutes),
  })));
  useEffect(() => {
    setStops((route?.stops ?? []).map((stop, index) => ({
      key: index, locationId: stop.locationId, stopKind: stop.stopKind,
      plannedOffsetMinutes: stop.plannedOffsetMinutes === null ? '' : String(stop.plannedOffsetMinutes),
    })));
  }, [route?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [scheduleReason, setScheduleReason] = useState('');
  const [copyDates, setCopyDates] = useState<Record<string, string>>({});

  async function callApi(url: string, method: string, payload: unknown, fallback: string) {
    const response = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    const body = await response.json() as { error?: string };
    if (!response.ok) throw new Error(body.error || fallback);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const targetForm = event.currentTarget;
    const form = new FormData(targetForm);
    setPending(true);
    setError('');
    setNotice('');
    const operatingDays = DAY_CODES.filter((day) => form.get(`day-${day}`) === 'on');
    const duration = value(form, 'expectedDurationMinutes');
    const capacity = value(form, 'capacityRequirement');
    const payload = {
      clientId: value(form, 'clientId'),
      name: value(form, 'name'),
      serviceType: value(form, 'serviceType') || null,
      originLocationId: value(form, 'originLocationId'),
      destinationLocationId: value(form, 'destinationLocationId'),
      plannedStartTime: value(form, 'plannedStartTime') || null,
      expectedDurationMinutes: duration === '' ? null : Number(duration),
      capacityRequirement: capacity === '' ? null : Number(capacity),
      operatingDays,
      shift: value(form, 'shift') || null,
      active: form.get('active') === 'on',
      notes: value(form, 'notes') || null,
      reason: value(form, 'reason'),
    };
    try {
      await callApi(
        route
          ? `/api/companies/${encodeURIComponent(companyId)}/routes/${encodeURIComponent(route.id)}`
          : `/api/companies/${encodeURIComponent(companyId)}/routes`,
        route ? 'PUT' : 'POST', payload, 'Unable to save this route.',
      );
      setNotice('Route saved.');
      router.refresh();
      if (!route) targetForm.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save this route.');
    } finally {
      setPending(false);
    }
  }

  async function saveStops(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!route) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError('');
    setNotice('');
    try {
      await callApi(`/api/companies/${encodeURIComponent(companyId)}/routes/${encodeURIComponent(route.id)}/stops`, 'PUT', {
        stops: stops.map((stop) => ({
          locationId: stop.locationId,
          stopKind: stop.stopKind,
          plannedOffsetMinutes: stop.plannedOffsetMinutes === '' ? null : Number(stop.plannedOffsetMinutes),
        })),
        reason: value(form, 'stopsReason'),
      }, 'Unable to save the stop order.');
      setNotice('Approved stop order saved.');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save the stop order.');
    } finally {
      setPending(false);
    }
  }

  async function addSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!route) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError('');
    setNotice('');
    const kind = value(form, 'kind');
    try {
      await callApi(`/api/companies/${encodeURIComponent(companyId)}/routes/${encodeURIComponent(route.id)}/schedules`, 'POST', {
        kind,
        daysOfWeek: DAY_CODES.filter((day) => form.get(`sday-${day}`) === 'on'),
        scheduleDate: kind === 'ONE_TIME' ? value(form, 'scheduleDate') || null : null,
        shift: value(form, 'scheduleShift') || null,
        plannedStartTime: value(form, 'scheduleStartTime') || null,
        notes: value(form, 'scheduleNotes') || null,
        reason: value(form, 'scheduleAddReason'),
      }, 'Unable to add this schedule.');
      setNotice('Schedule added.');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to add this schedule.');
    } finally {
      setPending(false);
    }
  }

  async function toggleSchedule(schedule: RouteScheduleRecord) {
    setPending(true);
    setError('');
    setNotice('');
    try {
      await callApi(`/api/companies/${encodeURIComponent(companyId)}/route-schedules/${encodeURIComponent(schedule.id)}`, 'PUT', {
        active: !schedule.active, reason: scheduleReason,
      }, 'Unable to change this schedule.');
      setNotice(schedule.active ? 'Schedule deactivated.' : 'Schedule reactivated.');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to change this schedule.');
    } finally {
      setPending(false);
    }
  }

  async function copySchedule(schedule: RouteScheduleRecord) {
    setPending(true);
    setError('');
    setNotice('');
    try {
      await callApi(`/api/companies/${encodeURIComponent(companyId)}/route-schedules/${encodeURIComponent(schedule.id)}/copy`, 'POST', {
        scheduleDate: copyDates[schedule.id] || null,
        reason: scheduleReason,
      }, 'Unable to copy this schedule.');
      setNotice('Schedule copied.');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to copy this schedule.');
    } finally {
      setPending(false);
    }
  }

  async function archive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!route) return;
    setPending(true);
    setError('');
    setNotice('');
    try {
      await callApi(`/api/companies/${encodeURIComponent(companyId)}/routes/${encodeURIComponent(route.id)}`, 'DELETE', {
        reason: archiveReason,
      }, 'Unable to archive this route.');
      router.push('/routes');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to archive this route.');
    } finally {
      setPending(false);
    }
  }

  return <section className="vehicle-editor" aria-labelledby="route-editor-title">
    <div className="vehicle-editor-heading">
      <div><p className="eyebrow">Routes</p><h2 id="route-editor-title">{route ? `${route.reference} — ${route.name}` : 'Add a route'}</h2></div>
      {route && <a className="button-link" href="/routes">Close</a>}
    </div>
    <form className="vehicle-form" onSubmit={save}>
      <div className="vehicle-form-grid">
        <label>Client
          <select name="clientId" required defaultValue={route?.clientId ?? ''}>
            <option value="" disabled>Select a client</option>
            {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
          </select>
        </label>
        <label>Route name<input name="name" required maxLength={160} defaultValue={route?.name ?? ''} /></label>
        <label>Service type (optional)<input name="serviceType" maxLength={120} defaultValue={route?.serviceType ?? ''} /></label>
        <label>Origin
          <select name="originLocationId" required defaultValue={route?.originLocationId ?? ''}>
            <option value="" disabled>Select origin</option>
            {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
          </select>
        </label>
        <label>Destination
          <select name="destinationLocationId" required defaultValue={route?.destinationLocationId ?? ''}>
            <option value="" disabled>Select destination</option>
            {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
          </select>
        </label>
        <label>Planned start (HH:MM, optional)<input name="plannedStartTime" pattern="[0-9]{2}:[0-9]{2}" placeholder="05:30" defaultValue={route?.plannedStartTime ?? ''} /></label>
        <label>Expected duration, minutes (optional)<input name="expectedDurationMinutes" type="number" min={1} defaultValue={route?.expectedDurationMinutes ?? ''} /></label>
        <label>Capacity requirement, seats (optional)<input name="capacityRequirement" type="number" min={1} defaultValue={route?.capacityRequirement ?? ''} /></label>
        <label>Shift as supplied (optional)<input name="shift" maxLength={120} defaultValue={route?.shift ?? ''} /></label>
      </div>
      <fieldset>
        <legend>Operating days</legend>
        {DAY_CODES.map((day) => <label key={day}><input type="checkbox" name={`day-${day}`} defaultChecked={route?.operatingDays.includes(day)} /> {day}</label>)}
      </fieldset>
      <label><input type="checkbox" name="active" defaultChecked={route?.active ?? true} /> Route active</label>
      <label>Notes<textarea name="notes" rows={2} maxLength={2000} defaultValue={route?.notes ?? ''} /></label>
      <label>Reason for {route ? 'change' : 'creation'}<input name="reason" required minLength={8} maxLength={500} /></label>
      <div className="vehicle-form-actions"><button className="button-primary" type="submit" disabled={!interactive || pending}>{pending ? 'Saving…' : route ? 'Save route changes' : 'Add route'}</button></div>
    </form>

    {route && <>
      <h3>Approved stop order</h3>
      <p className="form-help">Stops run in the order listed. This stored order is what dispatch and drivers use; changing it is an audited override. Planned offsets (minutes after the route start) feed the manual plan only.</p>
      <form className="vehicle-form" onSubmit={saveStops}>
        {stops.map((stop, index) => <div className="vehicle-form-grid" key={stop.key}>
          <label>Stop {index + 1} location
            <select value={stop.locationId} onChange={(event) => setStops(stops.map((entry, i) => i === index ? { ...entry, locationId: event.target.value } : entry))}>
              {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
            </select>
          </label>
          <label>Kind
            <select value={stop.stopKind} onChange={(event) => setStops(stops.map((entry, i) => i === index ? { ...entry, stopKind: event.target.value } : entry))}>
              <option value="PICKUP">Pickup</option>
              <option value="DROPOFF">Drop-off</option>
              <option value="PICKUP_AND_DROPOFF">Pickup and drop-off</option>
            </select>
          </label>
          <label>Planned offset, minutes (optional)<input type="number" min={0} value={stop.plannedOffsetMinutes} onChange={(event) => setStops(stops.map((entry, i) => i === index ? { ...entry, plannedOffsetMinutes: event.target.value } : entry))} /></label>
          <button type="button" className="button-link" onClick={() => setStops(stops.filter((_, i) => i !== index))}>Remove stop</button>
        </div>)}
        <button type="button" className="button-link" onClick={() => setStops([...stops, { key: Date.now(), locationId: locations[0]?.id ?? '', stopKind: 'PICKUP', plannedOffsetMinutes: '' }])} disabled={locations.length === 0}>Add stop</button>
        <label>Reason for stop-order change<input name="stopsReason" required minLength={8} maxLength={500} /></label>
        <div className="vehicle-form-actions"><button className="button-primary" type="submit" disabled={!interactive || pending}>{pending ? 'Saving…' : 'Save stop order'}</button></div>
      </form>

      <h3>Manual plan (approximate)</h3>
      {plan ? <div>
        <ul>{plan.notes.map((note) => <li key={note}>{note}</li>)}</ul>
        <p>{plan.capacity.detail}</p>
        {plan.legs.length === 0 ? <p className="muted">No stops recorded yet.</p> : <ol>
          {plan.legs.map((leg) => <li key={leg.sequence}>{leg.locationName} — {leg.stopKind}{leg.plannedArrivalTime ? ` at ${leg.plannedArrivalTime}` : ' (no recorded offset; time not estimated)'}</li>)}
        </ol>}
        {plan.expectedEndTime && <p>Planned {plan.startTime} → {plan.expectedEndTime} using the recorded expected duration.</p>}
      </div> : <p className="muted">Plan unavailable.</p>}

      <h3>Schedules</h3>
      <label>Reason for schedule copy or activation changes<input value={scheduleReason} onChange={(event) => setScheduleReason(event.target.value)} minLength={8} maxLength={500} /></label>
      {schedules.length === 0 ? <p className="muted">No schedules recorded for this route.</p> : <ul>
        {schedules.map((schedule) => <li key={schedule.id}>
          <strong>{schedule.kind === 'RECURRING' ? `Every ${schedule.daysOfWeek.join(', ')}` : `On ${schedule.scheduleDate}`}</strong>
          {schedule.plannedStartTime ? ` at ${schedule.plannedStartTime}` : ' (start time not recorded)'}
          {schedule.shift ? ` · ${schedule.shift}` : ''} · {schedule.active ? 'Active' : 'Inactive'}
          <button type="button" className="button-link" disabled={!interactive || pending || scheduleReason.trim().length < 8} onClick={() => toggleSchedule(schedule)}>{schedule.active ? 'Deactivate' : 'Reactivate'}</button>
          {schedule.kind === 'ONE_TIME' && <>
            <label>Copy to date<input type="date" value={copyDates[schedule.id] ?? ''} onChange={(event) => setCopyDates({ ...copyDates, [schedule.id]: event.target.value })} /></label>
            <button type="button" className="button-link" disabled={!interactive || pending || scheduleReason.trim().length < 8 || !copyDates[schedule.id]} onClick={() => copySchedule(schedule)}>Copy schedule</button>
          </>}
        </li>)}
      </ul>}
      <form className="vehicle-form" onSubmit={addSchedule}>
        <div className="vehicle-form-grid">
          <label>Schedule kind
            <select name="kind" defaultValue="RECURRING">
              <option value="RECURRING">Recurring</option>
              <option value="ONE_TIME">One-time</option>
            </select>
          </label>
          <label>One-time date (one-time only)<input name="scheduleDate" type="date" /></label>
          <label>Start (HH:MM, optional)<input name="scheduleStartTime" pattern="[0-9]{2}:[0-9]{2}" placeholder="05:30" /></label>
          <label>Shift as supplied (optional)<input name="scheduleShift" maxLength={120} /></label>
        </div>
        <fieldset>
          <legend>Recurring days (recurring only)</legend>
          {DAY_CODES.map((day) => <label key={day}><input type="checkbox" name={`sday-${day}`} /> {day}</label>)}
        </fieldset>
        <label>Notes<textarea name="scheduleNotes" rows={2} maxLength={2000} /></label>
        <label>Reason for adding schedule<input name="scheduleAddReason" required minLength={8} maxLength={500} /></label>
        <div className="vehicle-form-actions"><button className="button-primary" type="submit" disabled={!interactive || pending}>{pending ? 'Working…' : 'Add schedule'}</button></div>
      </form>

      <details className="vehicle-archive">
        <summary>Archive this route</summary>
        <p className="form-help">Archiving hides the route from new planning. Its schedules and history are retained.</p>
        <form onSubmit={archive}>
          <label>Reason for archiving<input value={archiveReason} onChange={(event) => setArchiveReason(event.target.value)} required minLength={8} maxLength={500} /></label>
          <button type="submit" className="button-danger" disabled={!interactive || pending}>{pending ? 'Working…' : 'Archive route'}</button>
        </form>
      </details>
    </>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p className="form-success" role="status">{notice}</p>}
  </section>;
}
