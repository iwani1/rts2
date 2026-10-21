'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  flushQueue,
  loadQueue,
  removeEvent,
  type QueuedDriverEvent,
} from './offline-queue';

/**
 * DRV-05 (D-074): shows driver events waiting on this phone and syncs them
 * when connectivity returns. Server confirmations (including duplicates)
 * clear entries; conflicts/rejections stay visible until dismissed.
 */
export function DriverSyncPanel() {
  const router = useRouter();
  const [queue, setQueue] = useState<QueuedDriverEvent[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      const { queue: next, summary } = await flushQueue({
        storage: window.localStorage,
        fetchImpl: (url, init) => fetch(url, init),
      });
      setQueue(next);
      if (summary.sent + summary.duplicates > 0) {
        setNote(`${summary.sent + summary.duplicates} queued event(s) confirmed by the server.`);
        router.refresh();
      } else if (summary.stillPending > 0) {
        setNote('Still offline — queued events will send when connection returns.');
      }
    } finally {
      setSyncing(false);
    }
  }, [router]);

  useEffect(() => {
    setQueue(loadQueue(window.localStorage));
    void sync();
    const onOnline = () => { void sync(); };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [sync]);

  if (queue.length === 0 && !note) return null;

  return (
    <section className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-950">
          Events on this phone ({queue.length})
        </h2>
        <button
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          disabled={syncing}
          onClick={() => void sync()}
          type="button"
        >
          {syncing ? 'Syncing…' : 'Sync now'}
        </button>
      </div>
      <p className="mt-1 text-sm text-slate-600">
        Trip events made without connection stay here as <strong>pending sync</strong> until the server
        confirms them. Nothing is lost if you close the page.
      </p>
      {note ? <p className="mt-2 text-sm text-slate-700" role="status">{note}</p> : null}
      <ul className="mt-3 grid gap-2">
        {queue.map((entry) => (
          <li className="rounded-md bg-white px-3 py-2 text-sm text-slate-700" key={entry.id}>
            <span className="font-medium">{entry.eventType}</span>
            {' — '}
            {entry.state === 'pending' ? 'pending sync' : entry.state}
            {entry.message ? ` — ${entry.message}` : ''}
            {' '}
            <span className="text-slate-500">
              ({new Date(entry.queuedAt).toLocaleString('en-GB', { timeZone: 'Africa/Accra' })})
            </span>
            {entry.state !== 'pending' ? (
              <button
                className="ml-2 font-medium text-slate-900 underline"
                onClick={() => setQueue(removeEvent(window.localStorage, entry.id))}
                type="button"
              >
                Dismiss
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
