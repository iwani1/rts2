'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

export function QuotationActions({ companyId, quotationId }: { companyId: string; quotationId: string }) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function decide(event: FormEvent<HTMLFormElement>, decision: 'ACCEPTED' | 'DECLINED') {
    event.preventDefault();
    setError('');
    setPending(true);
    try {
      const response = await fetch(`/api/companies/${encodeURIComponent(companyId)}/rental-portal/quotations/${encodeURIComponent(quotationId)}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, reason }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || 'Unable to record your decision.');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to record your decision.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <label>
        Your note
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          minLength={8}
          maxLength={500}
          required
          placeholder="e.g. Happy with the price, please proceed"
        />
      </label>
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
        <form onSubmit={(event) => void decide(event, 'ACCEPTED')}>
          <button className="button-primary" type="submit" disabled={pending || reason.trim().length < 8}>
            {pending ? 'Saving…' : 'Accept quotation'}
          </button>
        </form>
        <form onSubmit={(event) => void decide(event, 'DECLINED')}>
          <button className="button-danger" type="submit" disabled={pending || reason.trim().length < 8}>
            Decline
          </button>
        </form>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}
