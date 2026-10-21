'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { RentalRequestRecord } from '@/modules/rentals/rental-requests';

type Target = 'Under Review' | 'Declined';

export function RentalRequestTransitionManager({ companyId, request }: { companyId: string; request: RentalRequestRecord }) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const target: Target | null = request.status === 'Submitted' ? 'Under Review' : request.status === 'Under Review' ? 'Declined' : null;
  if (!target) return null;

  async function transition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(''); setNotice(''); setPending(true);
    try {
      const response = await fetch(`/api/companies/${encodeURIComponent(companyId)}/rental-requests/${encodeURIComponent(request.id)}/transition`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toStatus: target, reason }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || 'Unable to update rental request status.');
      setNotice(target === 'Declined' ? 'Rental request marked as declined.' : 'Rental request moved to Under Review.');
      setReason('');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to update rental request status.');
    } finally { setPending(false); }
  }

  return <section className="vehicle-editor" aria-labelledby="request-transition-title">
    <div className="vehicle-editor-heading"><div><p className="eyebrow">Request status</p><h2 id="request-transition-title">{target === 'Declined' ? 'Decline request' : 'Begin review'}</h2></div></div>
    {target === 'Declined' && <p className="form-help">Declining is terminal in this workflow. No quotation, vehicle/driver reservation, or customer notification is performed.</p>}
    {target === 'Under Review' && <p className="form-help">Starting review lets staff prepare pricing and then confirm the booking from the lifecycle panel below.</p>}
    <form className="vehicle-form" onSubmit={(event) => void transition(event)}>
      <label htmlFor="rental-transition-reason">Reason for this status change<input id="rental-transition-reason" required minLength={8} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      <button className={target === 'Declined' ? 'button-danger' : 'button-primary'} type="submit" disabled={pending || reason.trim().length < 8}>
        {pending ? 'Saving…' : target === 'Declined' ? 'Decline request' : 'Start review'}
      </button>
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="form-success" role="status">{notice}</p>}
    </form>
  </section>;
}
