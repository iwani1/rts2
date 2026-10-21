'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Assignment = {
  id: string; vehicleLabel: string | null; driverLabel: string | null;
  startsAt: string; endsAt: string; status: string; releaseKind: string | null;
};
type Completion = {
  id: string; status: string; outstandingPesewas: number; quotedSubtotalPesewas: number;
  depositReceivedPesewas: number; additionalChargesPesewas: number; chargesDescription: string;
  decisionChargesPesewas: number | null; decisionReason: string | null;
};
type Lifecycle = {
  request: {
    status: string; acceptedByName: string | null; acceptanceReference: string | null;
    depositDuePesewas: number | null; depositReceivedPesewas: number | null;
  };
  assignments: Assignment[];
  completions: Completion[];
};
type Option = { id: string; label: string };

function pesewas(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

function ghs(pesewasValue: number): string {
  return `GHS ${(pesewasValue / 100).toFixed(2)}`;
}

const when = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Accra' });

export function RentalLifecycleManager({ companyId, requestId, status }: { companyId: string; requestId: string; status: string }) {
  const router = useRouter();
  const [lifecycle, setLifecycle] = useState<Lifecycle | null>(null);
  const [vehicles, setVehicles] = useState<Option[]>([]);
  const [drivers, setDrivers] = useState<Option[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(false);

  const base = `/api/companies/${encodeURIComponent(companyId)}/rental-requests/${encodeURIComponent(requestId)}/lifecycle`;

  const load = useCallback(async () => {
    try {
      const [lifecycleResponse, vehicleResponse, driverResponse] = await Promise.all([
        fetch(base), fetch(`/api/companies/${encodeURIComponent(companyId)}/vehicles`), fetch(`/api/companies/${encodeURIComponent(companyId)}/drivers`),
      ]);
      if (lifecycleResponse.ok) setLifecycle((await lifecycleResponse.json() as { lifecycle: Lifecycle }).lifecycle);
      if (vehicleResponse.ok) {
        const body = await vehicleResponse.json() as { vehicles?: Array<{ id: string; registrationNumber?: string; make?: string; model?: string }> };
        setVehicles((body.vehicles ?? []).map((row) => ({ id: row.id, label: `${row.registrationNumber ?? row.id} ${row.make && row.model ? `(${row.make} ${row.model})` : ''}`.trim() })));
      }
      if (driverResponse.ok) {
        const body = await driverResponse.json() as { drivers?: Array<{ id: string; fullName?: string }> };
        setDrivers((body.drivers ?? []).map((row) => ({ id: row.id, label: row.fullName ?? row.id })));
      }
    } catch {
      // The forms remain usable; errors surface on submit.
    }
  }, [base, companyId]);

  useEffect(() => { void load(); }, [load]);

  async function post(path: string, payload: unknown, success: string) {
    setError(''); setNotice(''); setPending(true);
    try {
      const response = await fetch(`${base}${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || 'Unable to save.');
      setNotice(success);
      await load();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save.');
    } finally { setPending(false); }
  }

  const active = lifecycle?.assignments.find((row) => row.status === 'ACTIVE');
  const pendingCompletion = lifecycle?.completions.find((row) => row.status === 'SUBMITTED');

  return <section className="vehicle-editor" aria-labelledby="rental-lifecycle-title">
    <div className="vehicle-editor-heading"><div><p className="eyebrow">Booking lifecycle</p><h2 id="rental-lifecycle-title">Confirmation, assignment &amp; completion</h2></div></div>
    {lifecycle?.request.depositDuePesewas !== null && lifecycle?.request.depositDuePesewas !== undefined && (
      <p className="form-help">Accepted by {lifecycle.request.acceptedByName ?? '—'} ({lifecycle.request.acceptanceReference ?? '—'}). Deposit due {ghs(lifecycle.request.depositDuePesewas)} · received {ghs(lifecycle.request.depositReceivedPesewas ?? 0)}.</p>
    )}
    {active && <p className="form-help">Reserved: {active.vehicleLabel ?? 'vehicle pending'}{active.driverLabel ? ` · driver ${active.driverLabel}` : ' · no driver yet'} · {when.format(new Date(active.startsAt))} → {when.format(new Date(active.endsAt))}.</p>}
    {lifecycle && lifecycle.assignments.length > 0 && (
      <ol className="customer-history-list">
        {lifecycle.assignments.map((row) => <li key={row.id}><strong>{row.status}{row.releaseKind ? ` (${row.releaseKind.toLowerCase()})` : ''}</strong><span>{row.vehicleLabel ?? '—'}{row.driverLabel ? ` · ${row.driverLabel}` : ''}</span></li>)}
      </ol>
    )}
    {lifecycle && lifecycle.completions.length > 0 && (
      <ol className="customer-history-list">
        {lifecycle.completions.map((row) => <li key={row.id}><strong>Completion {row.status.toLowerCase()}</strong><span>Quoted {ghs(row.quotedSubtotalPesewas)} · charges {ghs(row.decisionChargesPesewas ?? row.additionalChargesPesewas)} · deposit {ghs(row.depositReceivedPesewas)} · outstanding {ghs(row.outstandingPesewas)}</span>{row.decisionReason && <p>{row.decisionReason}</p>}</li>)}
      </ol>
    )}

    {status === 'Under Review' && (
      <form className="vehicle-form" onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        void post('/confirm', {
          vehicleId: String(form.get('vehicleId') ?? ''),
          acceptedByName: String(form.get('acceptedByName') ?? ''),
          acceptanceAt: String(form.get('acceptanceAt') ?? ''),
          acceptanceReference: String(form.get('acceptanceReference') ?? ''),
          depositReceivedPesewas: pesewas(String(form.get('depositReceived') ?? '')),
          depositEvidenceReference: String(form.get('depositEvidenceReference') ?? '') || null,
          reason: String(form.get('reason') ?? ''),
        }, 'Rental confirmed and vehicle reserved.');
      }}>
        <h3>Confirm booking (RNT-05)</h3>
        <label>Vehicle<select name="vehicleId" required defaultValue=""><option value="" disabled>Select a vehicle</option>{vehicles.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}</select></label>
        <label>Accepted by (customer name)<input name="acceptedByName" required minLength={2} maxLength={200} /></label>
        <label>Acceptance date<input name="acceptanceAt" type="date" required /></label>
        <label>Acceptance reference<input name="acceptanceReference" required minLength={2} maxLength={200} placeholder="Email / call reference" /></label>
        <label>Deposit received (GHS)<input name="depositReceived" inputMode="decimal" placeholder="0.00" /></label>
        <label>Deposit evidence reference<input name="depositEvidenceReference" maxLength={200} placeholder="Receipt or payment reference" /></label>
        <label>Reason<input name="reason" required minLength={8} maxLength={500} /></label>
        <button className="button-primary" type="submit" disabled={pending}>{pending ? 'Saving…' : 'Confirm booking'}</button>
      </form>
    )}

    {(status === 'Confirmed' || status === 'Assigned') && (
      <>
        <form className="vehicle-form" onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          void post('/assign-driver', { driverId: String(form.get('driverId') ?? '') }, status === 'Confirmed' ? 'Driver assigned.' : 'Driver reassigned.');
        }}>
          <h3>{status === 'Confirmed' ? 'Assign driver (RNT-06)' : 'Reassign driver'}</h3>
          <label>Driver<select name="driverId" required defaultValue=""><option value="" disabled>Select a driver</option>{drivers.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}</select></label>
          <button className="button-primary" type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save driver'}</button>
        </form>
        <form className="vehicle-form" onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          void post('/reassign-vehicle', { vehicleId: String(form.get('vehicleId') ?? ''), reason: String(form.get('vehicleReason') ?? '') }, 'Vehicle reassigned.');
        }}>
          <h3>Reassign vehicle</h3>
          <label>Vehicle<select name="vehicleId" required defaultValue=""><option value="" disabled>Select a vehicle</option>{vehicles.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}</select></label>
          <label>Reason<input name="vehicleReason" required minLength={8} maxLength={500} /></label>
          <button className="button-primary" type="submit" disabled={pending}>{pending ? 'Saving…' : 'Reassign vehicle'}</button>
        </form>
        <form className="vehicle-form" onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          void post('/cancel', { reason: String(form.get('cancelReason') ?? '') }, 'Rental cancelled and reservation released.');
        }}>
          <h3>Cancel booking (RNT-08)</h3>
          <label>Reason<input name="cancelReason" required minLength={8} maxLength={500} /></label>
          <button className="button-danger" type="submit" disabled={pending}>{pending ? 'Saving…' : 'Cancel booking'}</button>
        </form>
        {!pendingCompletion && (
          <form className="vehicle-form" onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const toIso = (value: FormDataEntryValue | null) => value ? new Date(String(value)).toISOString() : '';
            void post('/completions', {
              actualDepartureAt: toIso(form.get('actualDepartureAt')),
              actualReturnAt: toIso(form.get('actualReturnAt')),
              vehicleReturnedAt: toIso(form.get('vehicleReturnedAt')),
              actualDistanceMetres: String(form.get('actualDistanceKm') ?? '').trim() ? Math.round(Number(form.get('actualDistanceKm')) * 1000) : null,
              damageNotes: String(form.get('damageNotes') ?? '') || null,
              customerFeedback: String(form.get('customerFeedback') ?? '') || null,
              depositReceivedPesewas: pesewas(String(form.get('completionDeposit') ?? '')) ?? 0,
              additionalChargesPesewas: pesewas(String(form.get('additionalCharges') ?? '')) ?? 0,
              chargesDescription: String(form.get('chargesDescription') ?? ''),
            }, 'Completion submitted for approval.');
          }}>
            <h3>Submit completion (RNT-07, step 1)</h3>
            <label>Actual departure<input name="actualDepartureAt" type="datetime-local" required /></label>
            <label>Actual return<input name="actualReturnAt" type="datetime-local" required /></label>
            <label>Vehicle returned at<input name="vehicleReturnedAt" type="datetime-local" required /></label>
            <label>Actual distance (km)<input name="actualDistanceKm" inputMode="decimal" placeholder="Optional" /></label>
            <label>Damage notes<input name="damageNotes" maxLength={500} placeholder="None recorded" /></label>
            <label>Customer feedback<input name="customerFeedback" maxLength={500} /></label>
            <label>Deposit received (GHS)<input name="completionDeposit" inputMode="decimal" placeholder="0.00" /></label>
            <label>Additional charges (GHS)<input name="additionalCharges" inputMode="decimal" placeholder="0.00" /></label>
            <label>Charges description<input name="chargesDescription" maxLength={500} /></label>
            <button className="button-primary" type="submit" disabled={pending}>{pending ? 'Saving…' : 'Submit completion'}</button>
          </form>
        )}
      </>
    )}

    {pendingCompletion && (status === 'Confirmed' || status === 'Assigned') && (
      <form className="vehicle-form" onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        void post(`/completions/${encodeURIComponent(pendingCompletion.id)}/decide`, {
          decision: String(form.get('decision') ?? 'APPROVE'),
          reason: String(form.get('decisionReason') ?? ''),
          correctedChargesPesewas: pesewas(String(form.get('correctedCharges') ?? '')),
        }, 'Completion decided.');
      }}>
        <h3>Decide completion (RNT-07, step 2)</h3>
        <p className="form-help">A different authorised user must decide. Approving completes the rental and releases the vehicle and driver.</p>
        <label>Decision<select name="decision" defaultValue="APPROVE"><option value="APPROVE">Approve</option><option value="RETURN">Return for correction</option></select></label>
        <label>Corrected charges (GHS, optional)<input name="correctedCharges" inputMode="decimal" placeholder="Leave blank to accept proposed" /></label>
        <label>Reason<input name="decisionReason" required minLength={8} maxLength={500} /></label>
        <button className="button-primary" type="submit" disabled={pending}>{pending ? 'Saving…' : 'Record decision'}</button>
      </form>
    )}

    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p className="form-success" role="status">{notice}</p>}
  </section>;
}
