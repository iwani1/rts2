'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { BookingRecord } from '@/modules/bookings/bookings';
import { BOOKING_TYPES, allowedBookingTargets } from '@/modules/bookings/booking-transitions';

type Option = { id: string; label: string };
const STAFF_TARGETS = ['Accepted', 'Rejected', 'Cancelled'] as const;

function value(form: FormData, name: string) {
  const entry = form.get(name);
  return typeof entry === 'string' ? entry.trim() : '';
}

export function BookingManager({ companyId, employees, contracts, routes, locations, booking }: {
  companyId: string;
  employees: Option[];
  contracts: Option[];
  routes: Option[];
  locations: Array<{ id: string; name: string }>;
  booking?: BookingRecord;
}) {
  const router = useRouter();
  const [interactive, setInteractive] = useState(false);
  useEffect(() => setInteractive(true), []);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [targetStatus, setTargetStatus] = useState('');
  const targets = booking
    ? allowedBookingTargets(booking.status).filter((target) => (STAFF_TARGETS as readonly string[]).includes(target))
    : [];

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const targetForm = event.currentTarget;
    const form = new FormData(targetForm);
    setPending(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/companies/${encodeURIComponent(companyId)}/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: value(form, 'employeeId'),
          contractId: value(form, 'contractId') || null,
          routeId: value(form, 'routeId') || null,
          bookingType: value(form, 'bookingType'),
          journeyDate: value(form, 'journeyDate'),
          pickupLocationId: value(form, 'pickupLocationId') || null,
          dropoffLocationId: value(form, 'dropoffLocationId') || null,
          notes: value(form, 'notes') || null,
          reason: value(form, 'reason'),
        }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || 'Unable to create this booking.');
      setNotice('Booking created as Pending.');
      targetForm.reset();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to create this booking.');
    } finally {
      setPending(false);
    }
  }

  async function transition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!booking || !targetStatus) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/companies/${encodeURIComponent(companyId)}/bookings/${encodeURIComponent(booking.id)}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toStatus: targetStatus, reason: value(form, 'transitionReason') }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || 'Unable to change this booking.');
      setNotice(`Booking moved to ${targetStatus}.`);
      setTargetStatus('');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to change this booking.');
    } finally {
      setPending(false);
    }
  }

  return <section className="vehicle-editor" aria-labelledby="booking-editor-title">
    <div className="vehicle-editor-heading">
      <div><p className="eyebrow">Bookings</p><h2 id="booking-editor-title">{booking ? `${booking.reference} — ${booking.status}` : 'Create a booking'}</h2></div>
      {booking && <a className="button-link" href="/bookings">Close</a>}
    </div>
    {!booking && <>
      <p className="muted">The employee must be recorded as transport-eligible. If a contract is selected it must be in force for the employee&rsquo;s client; expired or suspended contracts follow the configured booking policy and block the booking while that policy is unset.</p>
      <form className="vehicle-form" onSubmit={create}>
        <div className="vehicle-form-grid">
          <label>Employee
            <select name="employeeId" required defaultValue="">
              <option value="" disabled>Select an employee</option>
              {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.label}</option>)}
            </select>
          </label>
          <label>Booking type
            <select name="bookingType" required defaultValue="HOME_TO_OFFICE">
              {BOOKING_TYPES.map((type) => <option key={type} value={type}>{type.replaceAll('_', ' ')}</option>)}
            </select>
          </label>
          <label>Journey date<input name="journeyDate" type="date" required /></label>
          <label>Contract (optional)
            <select name="contractId" defaultValue="">
              <option value="">No contract selected</option>
              {contracts.map((contract) => <option key={contract.id} value={contract.id}>{contract.label}</option>)}
            </select>
          </label>
          <label>Route (optional)
            <select name="routeId" defaultValue="">
              <option value="">No route selected</option>
              {routes.map((route) => <option key={route.id} value={route.id}>{route.label}</option>)}
            </select>
          </label>
          <label>Pickup location (optional)
            <select name="pickupLocationId" defaultValue="">
              <option value="">Not selected</option>
              {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
            </select>
          </label>
          <label>Drop-off location (optional)
            <select name="dropoffLocationId" defaultValue="">
              <option value="">Not selected</option>
              {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
            </select>
          </label>
        </div>
        <label>Notes<textarea name="notes" rows={2} maxLength={2000} /></label>
        <label>Reason for booking<input name="reason" required minLength={8} maxLength={500} /></label>
        <div className="vehicle-form-actions"><button className="button-primary" type="submit" disabled={!interactive || pending}>{pending ? 'Creating…' : 'Create booking'}</button></div>
      </form>
    </>}
    {booking && targets.length > 0 && <form className="vehicle-form" onSubmit={transition}>
      <h3>Decide this booking</h3>
      <p className="muted">{booking.employeeName} · {booking.journeyDate} · {booking.bookingType.replaceAll('_', ' ')}</p>
      <label>New status
        <select required value={targetStatus} onChange={(event) => setTargetStatus(event.target.value)}>
          <option value="" disabled>Select the next status</option>
          {targets.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
      </label>
      <label>Reason<input name="transitionReason" required minLength={8} maxLength={500} /></label>
      <div className="vehicle-form-actions"><button className="button-primary" type="submit" disabled={!interactive || pending || !targetStatus}>{pending ? 'Working…' : 'Apply decision'}</button></div>
    </form>}
    {booking && targets.length === 0 && <p className="muted">
      {booking.status === 'Assigned' || booking.status === 'Boarded'
        ? 'This booking is on a trip. Changes are made from the dispatch board or driver events.'
        : `This booking is ${booking.status}; no further staff decisions are available.`}
    </p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p className="form-success" role="status">{notice}</p>}
  </section>;
}
