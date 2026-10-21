'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
// Kept in step with RETENTION_DAYS in modules/locations/gps (D-077).
const RETENTION_DAYS = 90;

/** GPS-01 (D-077): explicit retention purge — nothing runs on a hidden schedule. */
export function PurgeLocationsButton({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div>
      <button
        className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
        disabled={pending}
        onClick={() => {
          setMessage(null);
          startTransition(async () => {
            const response = await fetch(`/api/companies/${companyId}/locations/purge`, { method: 'POST' });
            const payload = (await response.json().catch(() => null)) as {
              message?: string; data?: { deleted: number };
            } | null;
            if (!response.ok || !payload?.data) {
              setMessage(payload?.message ?? 'The purge could not be completed.');
              return;
            }
            setMessage(`Removed ${payload.data.deleted} report(s) older than ${RETENTION_DAYS} days.`);
            router.refresh();
          });
        }}
        type="button"
      >
        {pending ? 'Purging…' : `Remove reports older than ${RETENTION_DAYS} days`}
      </button>
      {message ? <p className="mt-2 text-sm text-slate-700" role="status">{message}</p> : null}
    </div>
  );
}
