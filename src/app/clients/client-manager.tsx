'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ClientRecord } from '@/modules/clients/clients';

type ClientFormValues = Omit<ClientRecord, 'id' | 'createdAt' | 'updatedAt'>;
const emptyClient: ClientFormValues = {
  name: '', registrationDetails: null, contactPerson: null, telephone: null, email: null,
  billingAddress: null, status: null, notes: null,
};

function value(form: FormData, name: string) {
  const entry = form.get(name);
  return typeof entry === 'string' ? entry.trim() : '';
}

export function ClientManager({ companyId, client }: { companyId: string; client?: ClientRecord }) {
  const router = useRouter();
  const [interactive, setInteractive] = useState(false);
  useEffect(() => setInteractive(true), []);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [archiveReason, setArchiveReason] = useState('');
  const values: ClientFormValues = client ? {
    name: client.name,
    registrationDetails: client.registrationDetails,
    contactPerson: client.contactPerson,
    telephone: client.telephone,
    email: client.email,
    billingAddress: client.billingAddress,
    status: client.status,
    notes: client.notes,
  } : emptyClient;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const targetForm = event.currentTarget;
    const form = new FormData(targetForm);
    setPending(true);
    setError('');
    setNotice('');
    const payload = {
      name: value(form, 'name'),
      registrationDetails: value(form, 'registrationDetails') || null,
      contactPerson: value(form, 'contactPerson') || null,
      telephone: value(form, 'telephone') || null,
      email: value(form, 'email') || null,
      billingAddress: value(form, 'billingAddress') || null,
      status: value(form, 'status') || null,
      notes: value(form, 'notes') || null,
      reason: value(form, 'reason'),
    };
    try {
      const response = await fetch(client
        ? `/api/companies/${encodeURIComponent(companyId)}/clients/${encodeURIComponent(client.id)}`
        : `/api/companies/${encodeURIComponent(companyId)}/clients`, {
        method: client ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || 'Unable to save this client record.');
      setNotice('Client record saved.');
      router.refresh();
      if (!client) targetForm.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save this client record.');
    } finally {
      setPending(false);
    }
  }

  async function archive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client) return;
    setPending(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/companies/${encodeURIComponent(companyId)}/clients/${encodeURIComponent(client.id)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: archiveReason }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || 'Unable to archive this client record.');
      router.push('/clients');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to archive this client record.');
    } finally {
      setPending(false);
    }
  }

  return <section className="vehicle-editor" aria-labelledby="client-editor-title">
    <div className="vehicle-editor-heading">
      <div><p className="eyebrow">Corporate client records</p><h2 id="client-editor-title">{client ? `Edit ${client.name}` : 'Add a corporate client'}</h2></div>
      {client && <a className="button-link" href="/clients">Cancel editing</a>}
    </div>
    <p className="muted">Enter confirmed client details only. Name is required; registration details, contact person and billing address are optional and should only be supplied when the business needs them.</p>
    <form className="vehicle-form" onSubmit={save}>
      <div className="vehicle-form-grid">
        <label>Client or organisation name<input name="name" required maxLength={160} autoComplete="organization" defaultValue={values.name} /></label>
        <label>Registration details (optional)<input name="registrationDetails" maxLength={200} autoComplete="off" defaultValue={values.registrationDetails ?? ''} /></label>
        <label>Contact person<input name="contactPerson" maxLength={160} autoComplete="name" defaultValue={values.contactPerson ?? ''} /></label>
        <label>Telephone<input name="telephone" type="tel" maxLength={80} autoComplete="tel" defaultValue={values.telephone ?? ''} /></label>
        <label>Email<input name="email" type="email" maxLength={254} autoComplete="email" defaultValue={values.email ?? ''} /></label>
      </div>
      <label>Billing address<textarea name="billingAddress" rows={3} maxLength={500} defaultValue={values.billingAddress ?? ''} /></label>
      <label>Status (optional)<input name="status" maxLength={80} defaultValue={values.status ?? ''} aria-describedby="client-terms-help" /></label>
      <label>Notes<textarea name="notes" rows={3} maxLength={2000} defaultValue={values.notes ?? ''} /></label>
      <label>Reason for {client ? 'change' : 'creation'}<input name="reason" required minLength={8} maxLength={500} /></label>
      <p id="client-terms-help" className="form-help">No client status is preloaded. Use only values agreed by your company.</p>
      <p className="form-help">The reason is recorded in audit history; do not include client personal or billing details in it.</p>
      <div className="vehicle-form-actions"><button className="button-primary" type="submit" disabled={!interactive || pending}>{pending ? 'Saving…' : client ? 'Save changes' : 'Add client'}</button></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="form-success" role="status">{notice}</p>}
    </form>
    {client && <details className="vehicle-archive">
      <summary>Archive this client</summary>
      <p className="form-help">Archiving hides the record from the active client register without deleting its retained history.</p>
      <form onSubmit={archive}>
        <label>Reason for archiving<input value={archiveReason} onChange={(event) => setArchiveReason(event.target.value)} required minLength={8} maxLength={500} /></label>
        <button type="submit" className="button-danger" disabled={!interactive || pending}>{pending ? 'Working…' : 'Archive client'}</button>
      </form>
    </details>}
  </section>;
}
