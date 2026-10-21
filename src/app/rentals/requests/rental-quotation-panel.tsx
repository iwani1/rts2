'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Quotation = {
  id: string;
  reference: string;
  status: string;
  displayStatus: string;
  subtotalPesewas: number;
  taxPesewas: number;
  totalPesewas: number;
  worksheetVersion: number;
  expiresAt: string;
  decisionReason: string | null;
};

function ghs(pesewas: number) {
  return `GH₵ ${(pesewas / 100).toFixed(2)}`;
}

const day = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'Africa/Accra' });

export function RentalQuotationPanel({ companyId, requestId }: { companyId: string; requestId: string }) {
  const router = useRouter();
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(false);

  const base = `/api/companies/${encodeURIComponent(companyId)}/rental-requests/${encodeURIComponent(requestId)}/quotations`;

  const load = useCallback(async () => {
    try {
      const response = await fetch(base);
      if (response.ok) setQuotations((await response.json() as { quotations: Quotation[] }).quotations);
    } catch {
      // surfaced on action
    }
  }, [base]);

  useEffect(() => { void load(); }, [load]);

  async function issue() {
    setError(''); setNotice(''); setPending(true);
    try {
      const response = await fetch(base, { method: 'POST' });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || 'Unable to issue the quotation.');
      setNotice('Quotation issued to the customer.');
      await load();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to issue the quotation.');
    } finally { setPending(false); }
  }

  const live = quotations[0];
  return <section className="vehicle-editor" aria-labelledby="rental-quotation-title">
    <div className="vehicle-editor-heading"><div><p className="eyebrow">Customer quotation</p><h2 id="rental-quotation-title">Quotation</h2></div></div>
    {quotations.length === 0 && <p className="form-help">No quotation issued yet. Issuing uses the latest pricing worksheet, applies the configured tax lines, and is valid for the configured quotation-validity period. The customer decides in their portal.</p>}
    {quotations.length > 0 && <ol className="customer-history-list">
      {quotations.map((quote) => <li key={quote.id}>
        <strong>{quote.reference} · {quote.displayStatus}</strong>
        <span>Total {ghs(quote.totalPesewas)} (pre-tax {ghs(quote.subtotalPesewas)} + tax {ghs(quote.taxPesewas)}) · worksheet v{quote.worksheetVersion} · valid until {day.format(new Date(quote.expiresAt))}</span>
        {quote.decisionReason && <p>Customer: {quote.decisionReason}</p>}
      </li>)}
    </ol>}
    {live?.displayStatus === 'ACCEPTED' && <p className="form-help">The customer accepted this quotation in the portal. When confirming below, cite {live.reference} as the acceptance reference.</p>}
    <button className="button-primary" type="button" disabled={pending} onClick={() => void issue()}>
      {pending ? 'Issuing…' : quotations.length > 0 ? 'Issue a fresh quotation (supersedes the live one)' : 'Issue quotation to customer'}
    </button>
    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p className="form-success" role="status">{notice}</p>}
  </section>;
}
