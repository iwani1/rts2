'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { VehicleRecord } from '@/modules/fleet/vehicles';
import { UsualDriverPicker } from './usual-driver-picker';

type VehicleFormValues = Omit<VehicleRecord, 'id' | 'createdAt' | 'updatedAt' | 'usualDriverId' | 'usualDriverName' | 'usualDriverArchived' | 'safetyBlock'>;

const emptyVehicle: VehicleFormValues = {
  registrationNumber: '', make: '', model: '', category: '', seatCount: null,
  fuelType: null, ownershipType: null, odometerValue: null, odometerUnit: null,
  insuranceExpiresAt: null, roadworthinessExpiresAt: null, registrationExpiresAt: null,
  nextServiceAt: null, notes: null,
};

function field(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

export function VehicleManager({ companyId, vehicle, canAssignUsualDriver }: {
  companyId: string;
  vehicle?: VehicleRecord;
  canAssignUsualDriver: boolean;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [archiveReason, setArchiveReason] = useState('');
  const [pickerResetKey, setPickerResetKey] = useState(0);
  const values: VehicleFormValues = vehicle ? {
    registrationNumber: vehicle.registrationNumber,
    make: vehicle.make,
    model: vehicle.model,
    category: vehicle.category,
    seatCount: vehicle.seatCount,
    fuelType: vehicle.fuelType,
    ownershipType: vehicle.ownershipType,
    odometerValue: vehicle.odometerValue,
    odometerUnit: vehicle.odometerUnit,
    insuranceExpiresAt: vehicle.insuranceExpiresAt,
    roadworthinessExpiresAt: vehicle.roadworthinessExpiresAt,
    registrationExpiresAt: vehicle.registrationExpiresAt,
    nextServiceAt: vehicle.nextServiceAt,
    notes: vehicle.notes,
  } : emptyVehicle;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const targetForm = event.currentTarget;
    setSaving(true);
    setError('');
    setNotice('');
    const form = new FormData(event.currentTarget);
    const seat = field(form, 'seatCount');
    const odometer = field(form, 'odometerValue');
    const rawUnit = field(form, 'odometerUnit');
    const payload = {
      registrationNumber: field(form, 'registrationNumber'),
      make: field(form, 'make'),
      model: field(form, 'model'),
      category: field(form, 'category'),
      seatCount: seat === '' ? null : Number(seat),
      fuelType: field(form, 'fuelType') || null,
      ownershipType: field(form, 'ownershipType') || null,
      odometerValue: odometer === '' ? null : Number(odometer),
      odometerUnit: rawUnit === '' ? null : rawUnit,
      insuranceExpiresAt: field(form, 'insuranceExpiresAt') || null,
      roadworthinessExpiresAt: field(form, 'roadworthinessExpiresAt') || null,
      registrationExpiresAt: field(form, 'registrationExpiresAt') || null,
      nextServiceAt: field(form, 'nextServiceAt') || null,
      notes: field(form, 'notes') || null,
      ...(canAssignUsualDriver ? { usualDriverId: field(form, 'usualDriverId') || null } : {}),
      reason: field(form, 'reason'),
    };
    try {
      const response = await fetch(vehicle
        ? `/api/companies/${encodeURIComponent(companyId)}/vehicles/${encodeURIComponent(vehicle.id)}`
        : `/api/companies/${encodeURIComponent(companyId)}/vehicles`, {
        method: vehicle ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || 'Unable to save this vehicle.');
      setNotice('Vehicle record saved.');
      router.refresh();
      if (!vehicle) {
        targetForm.reset();
        setPickerResetKey((key) => key + 1);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save this vehicle.');
    } finally {
      setSaving(false);
    }
  }

  async function archive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!vehicle) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/companies/${encodeURIComponent(companyId)}/vehicles/${encodeURIComponent(vehicle.id)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: archiveReason }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || 'Unable to archive this vehicle.');
      router.push('/fleet/vehicles');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to archive this vehicle.');
    } finally {
      setSaving(false);
    }
  }

  return <section className="vehicle-editor" aria-labelledby="vehicle-editor-title">
    <div className="vehicle-editor-heading">
      <div>
        <p className="eyebrow">Fleet records</p>
        <h2 id="vehicle-editor-title">{vehicle ? `Edit ${vehicle.registrationNumber}` : 'Add a vehicle'}</h2>
      </div>
      {vehicle && <a className="button-link" href="/fleet/vehicles">Cancel editing</a>}
    </div>
    <p className="muted">Enter verified vehicle information. Unknown details can remain blank; no category, fuel, ownership or odometer unit is assumed.</p>
    <form className="vehicle-form" onSubmit={save}>
      <div className="vehicle-form-grid">
        <label>Registration number<input name="registrationNumber" required maxLength={40} defaultValue={values.registrationNumber} autoComplete="off" /></label>
        <label>Make<input name="make" required maxLength={80} defaultValue={values.make} /></label>
        <label>Model<input name="model" required maxLength={80} defaultValue={values.model} /></label>
        <label>Vehicle category<input name="category" required maxLength={80} defaultValue={values.category} aria-describedby="category-help" /></label>
        {canAssignUsualDriver && <fieldset className="usual-driver-field">
          <legend>Usual driver</legend>
          <UsualDriverPicker
            key={pickerResetKey}
            companyId={companyId}
            current={vehicle?.usualDriverId && vehicle.usualDriverName ? {
              id: vehicle.usualDriverId,
              fullName: vehicle.usualDriverName,
              archived: vehicle.usualDriverArchived,
            } : null}
          />
        </fieldset>}
        <label>Seat capacity<input name="seatCount" type="number" min="1" max="10000" step="1" defaultValue={values.seatCount ?? ''} /></label>
        <label>Fuel type<input name="fuelType" maxLength={60} defaultValue={values.fuelType ?? ''} /></label>
        <label>Ownership / lease<input name="ownershipType" maxLength={60} defaultValue={values.ownershipType ?? ''} /></label>
        <label>Odometer reading<input name="odometerValue" type="number" min="0" max="9999999999.99" step="0.01" defaultValue={values.odometerValue ?? ''} /></label>
        <label>Odometer unit<select name="odometerUnit" defaultValue={values.odometerUnit ?? ''}><option value="">Not specified</option><option value="KM">Kilometres</option><option value="MILE">Miles</option></select></label>
        <label>Insurance expiry<input name="insuranceExpiresAt" type="date" defaultValue={values.insuranceExpiresAt ?? ''} /></label>
        <label>Roadworthiness expiry<input name="roadworthinessExpiresAt" type="date" defaultValue={values.roadworthinessExpiresAt ?? ''} /></label>
        <label>Registration document expiry<input name="registrationExpiresAt" type="date" defaultValue={values.registrationExpiresAt ?? ''} /></label>
        <label>Next service date<input name="nextServiceAt" type="date" defaultValue={values.nextServiceAt ?? ''} /></label>
      </div>
      {canAssignUsualDriver && <p id="usual-driver-help" className="form-help">Choose an active driver from this company, or leave blank if no usual driver is recorded. An existing archived driver link is shown so it can be preserved or cleared.</p>}
      <label>Notes<textarea name="notes" rows={3} maxLength={2000} defaultValue={values.notes ?? ''} /></label>
      <label>Reason for {vehicle ? 'change' : 'creation'}<input name="reason" required minLength={8} maxLength={500} /></label>
      <p id="category-help" className="form-help">Use the company’s current category naming. Categories are not preloaded.</p>
      <div className="vehicle-form-actions"><button className="button-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : vehicle ? 'Save changes' : 'Add vehicle'}</button></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="form-success" role="status">{notice}</p>}
    </form>
    {vehicle && <details className="vehicle-archive">
      <summary>Archive this vehicle</summary>
      <p className="form-help">Archiving hides it from the active register without deleting its record. Assignment safety checks are not yet implemented.</p>
      <form onSubmit={archive}>
        <label>Reason for archiving<input value={archiveReason} onChange={(event) => setArchiveReason(event.target.value)} required minLength={8} maxLength={500} /></label>
        <button type="submit" className="button-danger" disabled={saving}>{saving ? 'Working…' : 'Archive vehicle'}</button>
      </form>
    </details>}
  </section>;
}
