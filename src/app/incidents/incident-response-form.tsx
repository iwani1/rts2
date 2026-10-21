'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { IncidentResponsePlan } from '@/modules/incidents/incident-response';

const fieldClass = 'rounded-md border border-slate-300 px-3 py-2';

/**
 * INC-02 (D-072): the breakdown response — affected trips, eligible
 * replacements, and the audited confirmation with follow-ups.
 */
export function IncidentResponseForm({ companyId, plan }: {
  companyId: string;
  plan: IncidentResponsePlan;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const primary = plan.affectedTrips.find((trip) => trip.isIncidentTrip) ?? null;
  const [vehicleId, setVehicleId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [blockOriginal, setBlockOriginal] = useState(true);
  const [createOrder, setCreateOrder] = useState(true);
  const [override, setOverride] = useState(false);
  const [reason, setReason] = useState('');

  if (!primary) {
    return <p className="mt-3 text-sm text-slate-600">This incident is not linked to a trip, so there is no replacement to arrange.</p>;
  }

  return (
    <div className="mt-4">
      <ul className="grid gap-2 text-sm text-slate-700">
        {plan.affectedTrips.map((trip) => (
          <li className="rounded-md bg-slate-50 px-3 py-2" key={trip.tripId}>
            {trip.reference} — {trip.status} · {trip.passengerCount} passenger(s)
            {trip.vehicleRegistration ? ` · Vehicle ${trip.vehicleRegistration}` : ''}
            {trip.driverName ? ` · Driver ${trip.driverName}` : ''}
            {trip.isIncidentTrip ? ' (this incident)' : ' (same vehicle/driver that day)'}
          </li>
        ))}
      </ul>

      {!plan.canConfirm ? (
        <p className="mt-3 text-sm text-slate-600">
          Replacements can be confirmed while the incident is open and the trip is active. This incident is
          {' '}{plan.incidentStatus} and the trip is {primary.status}.
        </p>
      ) : (
        <form
          className="mt-4 grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            setMessage(null);
            startTransition(async () => {
              const response = await fetch(
                `/api/companies/${companyId}/incidents/${plan.incidentId}/replacement`,
                {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({
                    tripId: primary.tripId,
                    newVehicleId: vehicleId || null,
                    newDriverId: driverId || null,
                    override,
                    reason: reason.trim(),
                    blockOriginalVehicle: blockOriginal,
                    createWorkOrder: createOrder,
                  }),
                },
              );
              const payload = (await response.json().catch(() => null)) as {
                message?: string;
                data?: { notifiedPassengers: number; warnings: string[]; workOrderReference: string | null; safetyBlockApplied: boolean };
              } | null;
              if (!response.ok || !payload?.data) {
                setMessage(payload?.message ?? 'The replacement could not be confirmed.');
                return;
              }
              const parts = [
                'Replacement confirmed.',
                `${payload.data.notifiedPassengers} passenger login(s) notified.`,
                payload.data.safetyBlockApplied ? 'Original vehicle safety-blocked.' : null,
                payload.data.workOrderReference ? `Work order ${payload.data.workOrderReference} created.` : null,
                ...payload.data.warnings,
              ].filter(Boolean);
              setMessage(parts.join(' '));
              router.refresh();
            });
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm text-slate-700">
              Replacement vehicle
              <select className={fieldClass} value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                <option value="">Keep current vehicle</option>
                {plan.replacementVehicles.map((vehicle) => (
                  <option key={vehicle.vehicleId} value={vehicle.vehicleId}>
                    {vehicle.registrationNumber} — {vehicle.seatCount} seats{vehicle.fitsPassengers ? '' : ' (too small for all passengers)'}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm text-slate-700">
              Replacement driver
              <select className={fieldClass} value={driverId} onChange={(e) => setDriverId(e.target.value)}>
                <option value="">Keep current driver</option>
                {plan.replacementDrivers.map((driver) => (
                  <option key={driver.driverId} value={driver.driverId}>{driver.fullName}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={blockOriginal} onChange={(e) => setBlockOriginal(e.target.checked)} />
            Take the original vehicle out of service (safety block)
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={createOrder} onChange={(e) => setCreateOrder(e.target.checked)} />
            Open a maintenance work order for the original vehicle
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
            Override conflicts (vehicle/driver already busy that day, or too few seats)
          </label>
          <label className="grid gap-1 text-sm text-slate-700">
            Reason
            <input className={fieldClass} value={reason} onChange={(e) => setReason(e.target.value)} required minLength={8} maxLength={500} placeholder="e.g. Replacement coach sent from depot" />
          </label>
          <div>
            <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={pending} type="submit">
              {pending ? 'Confirming…' : 'Confirm replacement'}
            </button>
            {message ? <p className="mt-2 text-sm text-slate-700" role="status">{message}</p> : null}
          </div>
          <p className="text-xs text-slate-500">
            Only vehicles that are not safety-blocked and drivers with a valid licence are listed.
            The original assignment stays in the audit history.
          </p>
        </form>
      )}
    </div>
  );
}
