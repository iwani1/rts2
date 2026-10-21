'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CustomerRecord } from '@/modules/customers/customers';

type CustomerFormValues = Omit<CustomerRecord, 'id' | 'createdAt' | 'updatedAt' | 'linkedUserId'>;
const emptyCustomer: CustomerFormValues = {
  reference: null, displayName: '', contactPerson: null, telephone: null, email: null,
  billingDetails: null, customerType: null, status: null, notes: null,
};

function value(form: FormData, name: string) {
  const entry = form.get(name);
  return typeof entry === 'string' ? entry.trim() : '';
}

type RentalUserOption = { id: string; label: string };

export function CustomerManager({ companyId, customer, rentalUsers = [] }: {
  companyId: string; customer?: CustomerRecord; rentalUsers?: RentalUserOption[];
}) {
  const router = useRouter();
  const [interactive, setInteractive] = useState(false);
  useEffect(() => setInteractive(true), []);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [archiveReason, setArchiveReason] = useState('');
  const values: CustomerFormValues = customer ? {
    reference: customer.reference,
    displayName: customer.displayName,
    contactPerson: customer.contactPerson,
    telephone: customer.telephone,
    email: customer.email,
    billingDetails: customer.billingDetails,
    customerType: customer.customerType,
    status: customer.status,
    notes: customer.notes,
  } : emptyCustomer;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const targetForm = event.currentTarget;
    const form = new FormData(targetForm);
    setPending(true);
    setError('');
    setNotice('');
    const payload = {
      reference: value(form, 'reference') || null,
      displayName: value(form, 'displayName'),
      contactPerson: value(form, 'contactPerson') || null,
      telephone: value(form, 'telephone') || null,
      email: value(form, 'email') || null,
      billingDetails: value(form, 'billingDetails') || null,
      customerType: value(form, 'customerType') || null,
      status: value(form, 'status') || null,
      notes: value(form, 'notes') || null,
      reason: value(form, 'reason'),
    };
    try {
      const response = await fetch(customer
        ? `/api/companies/${encodeURIComponent(companyId)}/customers/${encodeURIComponent(customer.id)}`
        : `/api/companies/${encodeURIComponent(companyId)}/customers`, {
        method: customer ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || 'Unable to save this customer record.');
      setNotice('Customer record saved.');
      router.refresh();
      if (!customer) targetForm.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save this customer record.');
    } finally {
      setPending(false);
    }
  }

  const [linkUserId, setLinkUserId] = useState('');
  const [linkReason, setLinkReason] = useState('');

  async function linkCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!customer) return;
    setPending(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/companies/${encodeURIComponent(companyId)}/customers/${encodeURIComponent(customer.id)}/customer-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: linkUserId, reason: linkReason }),
      });
      const body = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(body.message || body.error || 'Unable to link this customer login.');
      setNotice('Customer login linked. The user can now open My rentals.');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to link this customer login.');
    } finally {
      setPending(false);
    }
  }

  async function unlinkCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!customer) return;
    setPending(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/companies/${encodeURIComponent(companyId)}/customers/${encodeURIComponent(customer.id)}/customer-unlink`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: linkReason }),
      });
      const body = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(body.message || body.error || 'Unable to unlink this customer login.');
      setNotice('Customer login unlinked.');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to unlink this customer login.');
    } finally {
      setPending(false);
    }
  }

  async function archive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!customer) return;
    setPending(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/companies/${encodeURIComponent(companyId)}/customers/${encodeURIComponent(customer.id)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: archiveReason }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || 'Unable to archive this customer record.');
      router.push('/customers');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to archive this customer record.');
    } finally {
      setPending(false);
    }
  }

  return <section className="vehicle-editor" aria-labelledby="customer-editor-title">
    <div className="vehicle-editor-heading">
      <div><p className="eyebrow">Customer records</p><h2 id="customer-editor-title">{customer ? `Edit ${customer.displayName}` : 'Add a customer'}</h2></div>
      {customer && <a className="button-link" href="/customers">Cancel editing</a>}
    </div>
    <p className="muted">Enter confirmed customer details only. Reference is optional; type and status remain company-defined free text with no preset values.</p>
    <form className="vehicle-form" onSubmit={save}>
      <div className="vehicle-form-grid">
        <label>Customer or organisation name<input name="displayName" required maxLength={160} autoComplete="organization" defaultValue={values.displayName} /></label>
        <label>Customer reference (optional)<input name="reference" maxLength={80} autoComplete="off" defaultValue={values.reference ?? ''} /></label>
        <label>Customer type (optional)<input name="customerType" maxLength={80} defaultValue={values.customerType ?? ''} aria-describedby="customer-terms-help" /></label>
        <label>Status (optional)<input name="status" maxLength={80} defaultValue={values.status ?? ''} aria-describedby="customer-terms-help" /></label>
        <label>Contact person<input name="contactPerson" maxLength={160} autoComplete="name" defaultValue={values.contactPerson ?? ''} /></label>
        <label>Telephone<input name="telephone" type="tel" maxLength={80} autoComplete="tel" defaultValue={values.telephone ?? ''} /></label>
        <label>Email<input name="email" type="email" maxLength={254} autoComplete="email" defaultValue={values.email ?? ''} /></label>
      </div>
      <label>Billing details<textarea name="billingDetails" rows={3} maxLength={2000} defaultValue={values.billingDetails ?? ''} /></label>
      <label>Notes<textarea name="notes" rows={3} maxLength={2000} defaultValue={values.notes ?? ''} /></label>
      <label>Reason for {customer ? 'change' : 'creation'}<input name="reason" required minLength={8} maxLength={500} /></label>
      <p id="customer-terms-help" className="form-help">No customer type or status is preloaded. Use only values agreed by your company.</p>
      <p className="form-help">The reason is recorded in audit history; do not include customer personal or billing details in it.</p>
      <div className="vehicle-form-actions"><button className="button-primary" type="submit" disabled={!interactive || pending}>{pending ? 'Saving…' : customer ? 'Save changes' : 'Add customer'}</button></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="form-success" role="status">{notice}</p>}
    </form>
    {customer && <details className="vehicle-archive" open>
      <summary>Rental customer portal login</summary>
      {customer.linkedUserId ? <>
        <p className="form-help">This record is linked to a customer login (My rentals). Unlink before linking a different login.</p>
        <form onSubmit={unlinkCustomer}>
          <label>Reason for unlinking<input value={linkReason} onChange={(event) => setLinkReason(event.target.value)} required minLength={8} maxLength={500} /></label>
          <button type="submit" className="button-danger" disabled={!interactive || pending}>{pending ? 'Working…' : 'Unlink customer login'}</button>
        </form>
      </> : <>
        <p className="form-help">Link this record to a login that holds the Rental Customer role so the customer can send enquiries and track requests in My rentals.</p>
        <form onSubmit={linkCustomer}>
          <label>Rental customer login
            <select required value={linkUserId} onChange={(event) => setLinkUserId(event.target.value)}>
              <option value="" disabled>Select a customer login</option>
              {rentalUsers.map((user) => <option key={user.id} value={user.id}>{user.label}</option>)}
            </select>
          </label>
          <label>Reason for linking<input value={linkReason} onChange={(event) => setLinkReason(event.target.value)} required minLength={8} maxLength={500} /></label>
          <button type="submit" className="button-primary" disabled={!interactive || pending || rentalUsers.length === 0}>{pending ? 'Working…' : 'Link customer login'}</button>
          {rentalUsers.length === 0 && <p className="form-help">No unlinked Rental Customer logins exist yet. Create the login and assign the Rental Customer role first.</p>}
        </form>
      </>}
    </details>}
    {customer && <details className="vehicle-archive">
      <summary>Archive this customer</summary>
      <p className="form-help">Archiving hides the record from the active customer register without deleting its retained history.</p>
      <form onSubmit={archive}>
        <label>Reason for archiving<input value={archiveReason} onChange={(event) => setArchiveReason(event.target.value)} required minLength={8} maxLength={500} /></label>
        <button type="submit" className="button-danger" disabled={!interactive || pending}>{pending ? 'Working…' : 'Archive customer'}</button>
      </form>
    </details>}
  </section>;
}
