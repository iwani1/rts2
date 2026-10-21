'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ContractRecord } from '@/modules/contracts/contracts';
import { allowedContractTargets } from '@/modules/contracts/contract-transitions';

type ClientOption = { id: string; name: string };

function value(form: FormData, name: string) {
  const entry = form.get(name);
  return typeof entry === 'string' ? entry.trim() : '';
}

export function ContractManager({ companyId, clients, contract }: {
  companyId: string; clients: ClientOption[]; contract?: ContractRecord;
}) {
  const router = useRouter();
  const [interactive, setInteractive] = useState(false);
  useEffect(() => setInteractive(true), []);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [targetStatus, setTargetStatus] = useState('');
  const targets = contract ? allowedContractTargets(contract.status) : [];
  const isDraft = !contract || contract.status === 'Draft';
  const showRenewalDates = contract?.status === 'Expired' && targetStatus === 'Active';

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const targetForm = event.currentTarget;
    const form = new FormData(targetForm);
    setPending(true);
    setError('');
    setNotice('');
    const payload = {
      clientId: value(form, 'clientId'),
      serviceType: value(form, 'serviceType') || null,
      startDate: value(form, 'startDate') || null,
      endDate: value(form, 'endDate') || null,
      renewalDate: value(form, 'renewalDate') || null,
      routesAndStops: value(form, 'routesAndStops') || null,
      serviceDaysAndShifts: value(form, 'serviceDaysAndShifts') || null,
      vehicleRequirements: value(form, 'vehicleRequirements') || null,
      pricingModel: value(form, 'pricingModel') || null,
      billingFrequency: value(form, 'billingFrequency') || null,
      paymentTerms: value(form, 'paymentTerms') || null,
      serviceLevelTargets: value(form, 'serviceLevelTargets') || null,
      notes: value(form, 'notes') || null,
      reason: value(form, 'reason'),
    };
    try {
      const response = await fetch(contract
        ? `/api/companies/${encodeURIComponent(companyId)}/contracts/${encodeURIComponent(contract.id)}`
        : `/api/companies/${encodeURIComponent(companyId)}/contracts`, {
        method: contract ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || 'Unable to save this contract.');
      setNotice('Contract saved as Draft.');
      router.refresh();
      if (!contract) targetForm.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save this contract.');
    } finally {
      setPending(false);
    }
  }

  async function transition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!contract || !targetStatus) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/companies/${encodeURIComponent(companyId)}/contracts/${encodeURIComponent(contract.id)}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toStatus: targetStatus,
          reason: value(form, 'transitionReason'),
          renewalStartDate: value(form, 'renewalStartDate') || null,
          renewalEndDate: value(form, 'renewalEndDate') || null,
        }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || 'Unable to change this contract status.');
      setNotice(`Contract moved to ${targetStatus}.`);
      setTargetStatus('');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to change this contract status.');
    } finally {
      setPending(false);
    }
  }

  return <section className="vehicle-editor" aria-labelledby="contract-editor-title">
    <div className="vehicle-editor-heading">
      <div><p className="eyebrow">Corporate contracts</p><h2 id="contract-editor-title">{contract ? `Contract ${contract.reference} — ${contract.status}` : 'Add a contract'}</h2></div>
      {contract && <a className="button-link" href="/contracts">Close</a>}
    </div>
    {contract && contract.warnings.length > 0 && <ul>{contract.warnings.map((warning) => <li key={warning} role="status">{warning}</li>)}</ul>}
    {isDraft ? <>
      <p className="muted">Enter only terms confirmed with the client. A client is required; dates, pricing model, billing frequency and payment terms stay empty until agreed — nothing is prefilled. Contracts can be amended only while in Draft.</p>
      <form className="vehicle-form" onSubmit={save}>
        <div className="vehicle-form-grid">
          <label>Client
            <select name="clientId" required defaultValue={contract?.clientId ?? ''}>
              <option value="" disabled>Select a client</option>
              {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
            </select>
          </label>
          <label>Service type (optional)<input name="serviceType" maxLength={120} defaultValue={contract?.serviceType ?? ''} /></label>
          <label>Start date<input name="startDate" type="date" defaultValue={contract?.startDate ?? ''} /></label>
          <label>End date<input name="endDate" type="date" defaultValue={contract?.endDate ?? ''} /></label>
          <label>Renewal review date (optional)<input name="renewalDate" type="date" defaultValue={contract?.renewalDate ?? ''} /></label>
        </div>
        <label>Routes and stops (optional)<textarea name="routesAndStops" rows={3} maxLength={4000} defaultValue={contract?.routesAndStops ?? ''} /></label>
        <label>Service days and shifts (optional)<textarea name="serviceDaysAndShifts" rows={2} maxLength={2000} defaultValue={contract?.serviceDaysAndShifts ?? ''} /></label>
        <label>Vehicle requirements (optional)<textarea name="vehicleRequirements" rows={2} maxLength={2000} defaultValue={contract?.vehicleRequirements ?? ''} /></label>
        <div className="vehicle-form-grid">
          <label>Pricing model as agreed (optional)<input name="pricingModel" maxLength={500} defaultValue={contract?.pricingModel ?? ''} /></label>
          <label>Billing frequency as agreed (optional)<input name="billingFrequency" maxLength={200} defaultValue={contract?.billingFrequency ?? ''} /></label>
        </div>
        <label>Payment terms as agreed (optional)<textarea name="paymentTerms" rows={2} maxLength={2000} defaultValue={contract?.paymentTerms ?? ''} /></label>
        <label>Service-level targets as agreed (optional)<textarea name="serviceLevelTargets" rows={2} maxLength={2000} defaultValue={contract?.serviceLevelTargets ?? ''} /></label>
        <label>Notes<textarea name="notes" rows={3} maxLength={2000} defaultValue={contract?.notes ?? ''} /></label>
        <label>Reason for {contract ? 'change' : 'creation'}<input name="reason" required minLength={8} maxLength={500} /></label>
        <p className="form-help">The reason is recorded in audit history; do not include client personal or billing details in it.</p>
        <div className="vehicle-form-actions"><button className="button-primary" type="submit" disabled={!interactive || pending}>{pending ? 'Saving…' : contract ? 'Save Draft changes' : 'Add contract as Draft'}</button></div>
      </form>
    </> : <p className="muted">This contract is {contract?.status} and can no longer be edited directly. Return it to Draft (from Pending Approval) or renew it (from Expired) through the status controls below; every change is recorded with a reason.</p>}
    {contract && targets.length > 0 && <form className="vehicle-form" onSubmit={transition}>
      <h3>Change contract status</h3>
      <label>New status
        <select required value={targetStatus} onChange={(event) => setTargetStatus(event.target.value)}>
          <option value="" disabled>Select the next status</option>
          {targets.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
      </label>
      {showRenewalDates && <div className="vehicle-form-grid">
        <label>Renewal start date (optional)<input name="renewalStartDate" type="date" /></label>
        <label>Renewal end date<input name="renewalEndDate" type="date" required /></label>
      </div>}
      {showRenewalDates && <p className="form-help">Renewing an expired contract requires a new end date that has not passed. The old dates are never silently reused.</p>}
      <label>Reason for status change<input name="transitionReason" required minLength={8} maxLength={500} /></label>
      <div className="vehicle-form-actions"><button className="button-primary" type="submit" disabled={!interactive || pending || !targetStatus}>{pending ? 'Working…' : 'Apply status change'}</button></div>
    </form>}
    {contract && targets.length === 0 && <p className="muted">This contract is Terminated. No further status changes are possible.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p className="form-success" role="status">{notice}</p>}
  </section>;
}
