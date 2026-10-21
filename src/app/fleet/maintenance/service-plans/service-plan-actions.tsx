'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ServiceReminder } from '@/modules/maintenance/service-plans';

const fieldClass = 'rounded-md border border-slate-300 px-3 py-2';

function usePost() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const post = (url: string, body: unknown, done: string) => {
    setMessage(null);
    startTransition(async () => {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        setMessage(payload?.message ?? 'The request could not be completed.');
        return;
      }
      setMessage(done);
      router.refresh();
    });
  };
  return { pending, message, post };
}

export function ServicePlanForms({ companyId, reminders }: {
  companyId: string;
  reminders: ServiceReminder[];
}) {
  const { pending, message, post } = usePost();
  const [vehicleId, setVehicleId] = useState(reminders[0]?.vehicleId ?? '');
  const [intervalDays, setIntervalDays] = useState('');
  const [intervalKm, setIntervalKm] = useState('');
  const [lastServiceDate, setLastServiceDate] = useState('');
  const [lastServiceOdometerKm, setLastServiceOdometerKm] = useState('');
  const [planReason, setPlanReason] = useState('');
  const [serviceDate, setServiceDate] = useState('');
  const [serviceOdometerKm, setServiceOdometerKm] = useState('');
  const [serviceReason, setServiceReason] = useState('');

  return (
    <div className="mt-4 grid gap-4">
      <form
        className="grid gap-3 rounded-lg border border-slate-200 bg-white p-5"
        onSubmit={(event) => {
          event.preventDefault();
          post(`/api/companies/${companyId}/maintenance/service-plans`, {
            vehicleId,
            intervalDays: intervalDays ? Number(intervalDays) : null,
            intervalKm: intervalKm ? Number(intervalKm) : null,
            lastServiceDate,
            lastServiceOdometerKm: lastServiceOdometerKm ? Number(lastServiceOdometerKm) : null,
            reason: planReason.trim(),
          }, 'Service plan saved.');
        }}
      >
        <h3 className="text-base font-semibold text-slate-950">Set a service plan</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm text-slate-700">
            Vehicle
            <select className={fieldClass} value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} required>
              {reminders.map((row) => (
                <option key={row.vehicleId} value={row.vehicleId}>{row.registrationNumber}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm text-slate-700">
            Last service date
            <input className={fieldClass} type="date" value={lastServiceDate} onChange={(e) => setLastServiceDate(e.target.value)} required />
          </label>
          <label className="grid gap-1 text-sm text-slate-700">
            Calendar interval (days, optional)
            <input className={fieldClass} type="number" min={1} value={intervalDays} onChange={(e) => setIntervalDays(e.target.value)} placeholder="e.g. 90" />
          </label>
          <label className="grid gap-1 text-sm text-slate-700">
            Mileage interval (km, optional)
            <input className={fieldClass} type="number" min={1} value={intervalKm} onChange={(e) => setIntervalKm(e.target.value)} placeholder="e.g. 10000" />
          </label>
          <label className="grid gap-1 text-sm text-slate-700">
            Odometer at last service (km, optional)
            <input className={fieldClass} type="number" min={0} value={lastServiceOdometerKm} onChange={(e) => setLastServiceOdometerKm(e.target.value)} />
          </label>
          <label className="grid gap-1 text-sm text-slate-700">
            Reason
            <input className={fieldClass} value={planReason} onChange={(e) => setPlanReason(e.target.value)} required minLength={8} maxLength={500} />
          </label>
        </div>
        <div>
          <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={pending} type="submit">
            {pending ? 'Saving…' : 'Save plan'}
          </button>
        </div>
      </form>

      <form
        className="grid gap-3 rounded-lg border border-slate-200 bg-white p-5"
        onSubmit={(event) => {
          event.preventDefault();
          post(`/api/companies/${companyId}/maintenance/record-service`, {
            vehicleId,
            serviceDate,
            odometerKm: serviceOdometerKm ? Number(serviceOdometerKm) : null,
            reason: serviceReason.trim(),
          }, 'Service recorded. The next due date has moved.');
        }}
      >
        <h3 className="text-base font-semibold text-slate-950">Record a completed service</h3>
        <p className="text-sm text-slate-600">
          A passed due date never completes maintenance by itself — record the service here when the work is done.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="grid gap-1 text-sm text-slate-700">
            Service date
            <input className={fieldClass} type="date" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} required />
          </label>
          <label className="grid gap-1 text-sm text-slate-700">
            Odometer (km, optional)
            <input className={fieldClass} type="number" min={0} value={serviceOdometerKm} onChange={(e) => setServiceOdometerKm(e.target.value)} />
          </label>
          <label className="grid gap-1 text-sm text-slate-700">
            Reason
            <input className={fieldClass} value={serviceReason} onChange={(e) => setServiceReason(e.target.value)} required minLength={8} maxLength={500} />
          </label>
        </div>
        <div>
          <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={pending} type="submit">
            {pending ? 'Saving…' : 'Record service'}
          </button>
        </div>
      </form>
      {message ? <p className="text-sm text-slate-700" role="status">{message}</p> : null}
    </div>
  );
}

export function NotifyFleetButton({ companyId }: { companyId: string }) {
  const { pending, message, post } = usePost();
  return (
    <div>
      <button
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        disabled={pending}
        onClick={() => post(
          `/api/companies/${companyId}/maintenance/service-reminders/notify`,
          {},
          'Fleet team alerted about due and overdue services.',
        )}
        type="button"
      >
        {pending ? 'Alerting…' : 'Notify fleet team'}
      </button>
      {message ? <p className="mt-2 text-sm text-slate-700" role="status">{message}</p> : null}
    </div>
  );
}
