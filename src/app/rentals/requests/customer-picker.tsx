'use client';

import { useEffect, useState } from 'react';

type CustomerOption = { id: string; displayName: string; reference: string | null };
type SelectedCustomer = CustomerOption & { archived?: boolean };

export function CustomerPicker({ companyId, current }: { companyId: string; current: SelectedCustomer | null }) {
  const [selected, setSelected] = useState<SelectedCustomer | null>(current);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<CustomerOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setMatches([]);
      setBusy(false);
      setError('');
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setBusy(true);
      setError('');
      try {
        const response = await fetch(`/api/companies/${encodeURIComponent(companyId)}/customers?search=${encodeURIComponent(term)}`, {
          signal: controller.signal,
          cache: 'no-store',
        });
        const body = await response.json() as { customers?: CustomerOption[]; error?: string };
        if (!response.ok) throw new Error(body.error || 'Unable to search customer records.');
        setMatches(body.customers ?? []);
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        setMatches([]);
        setError(caught instanceof Error ? caught.message : 'Unable to search customer records.');
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [companyId, query]);

  return <div className="customer-picker">
    <input type="hidden" name="customerId" value={selected?.id ?? ''} readOnly />
    <div className="customer-picker-selected" aria-live="polite">
      {selected ? <><span>{selected.displayName}{selected.reference ? ` · ${selected.reference}` : ''}{selected.archived ? ' — archived record' : ''}</span>
        <button type="button" className="button-link" onClick={() => setSelected(null)}>Clear customer</button></>
        : <span className="muted">No customer selected</span>}
    </div>
    <label htmlFor="request-customer-search">Search existing customers<input
      id="request-customer-search" type="search" maxLength={100} autoComplete="off" value={query}
      onChange={(event) => { setQuery(event.target.value); setMatches([]); setError(''); }}
      aria-describedby="request-customer-status" placeholder="Search by customer name or reference"
    /></label>
    <p id="request-customer-status" className="form-help" role="status">
      {busy ? 'Searching…' : query.trim() ? `${matches.length} customer${matches.length === 1 ? '' : 's'} shown, up to 50 matches.` : 'Select a customer-register record for this enquiry.'}
    </p>
    {error && <p className="form-error" role="alert">{error}</p>}
    {matches.length > 0 && <ul className="customer-picker-results" aria-label="Matching customers" aria-busy={busy}>
      {matches.map((customer) => <li key={customer.id}>
        <button type="button" className="customer-picker-option" onClick={() => { setSelected(customer); setQuery(''); setMatches([]); }}>
          <span>{customer.displayName}</span><span className="vehicle-secondary">{customer.reference ?? 'No reference recorded'}</span>
        </button>
      </li>)}
    </ul>}
  </div>;
}
