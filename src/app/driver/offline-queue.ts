/**
 * DRV-05 (D-074): the on-phone queue for driver events. Pure storage +
 * replay logic with injected storage/fetch so it is unit-testable; the
 * server remains the judge of duplicates and conflicts.
 */

export type QueuedEventState = 'pending' | 'conflict' | 'failed';

export type QueuedDriverEvent = {
  /** The idempotency key generated once for the driver's tap. */
  id: string;
  companyId: string;
  tripId: string;
  eventType: string;
  /** Full request body, including the idempotency key. */
  payload: Record<string, unknown>;
  queuedAt: string;
  state: QueuedEventState;
  message: string | null;
};

export type QueueStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export const DRIVER_QUEUE_KEY = 'richie-driver-event-queue-v1';

export function loadQueue(storage: QueueStorage): QueuedDriverEvent[] {
  try {
    const raw = storage.getItem(DRIVER_QUEUE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is QueuedDriverEvent => typeof entry === 'object' && entry !== null
        && typeof (entry as QueuedDriverEvent).id === 'string'
        && typeof (entry as QueuedDriverEvent).companyId === 'string'
        && typeof (entry as QueuedDriverEvent).tripId === 'string',
    );
  } catch {
    return [];
  }
}

export function saveQueue(storage: QueueStorage, queue: QueuedDriverEvent[]): void {
  try {
    storage.setItem(DRIVER_QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Storage full or blocked: the in-memory UI state still shows the tap
    // failed; nothing here may crash the driver view.
  }
}

export function enqueueEvent(storage: QueueStorage, entry: QueuedDriverEvent): QueuedDriverEvent[] {
  const queue = loadQueue(storage);
  if (!queue.some((queued) => queued.id === entry.id)) queue.push(entry);
  saveQueue(storage, queue);
  return queue;
}

export function removeEvent(storage: QueueStorage, id: string): QueuedDriverEvent[] {
  const queue = loadQueue(storage).filter((entry) => entry.id !== id);
  saveQueue(storage, queue);
  return queue;
}

type FetchResponse = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
};

export type FetchImpl = (url: string, init: {
  method: string;
  headers: Record<string, string>;
  body: string;
}) => Promise<FetchResponse>;

export type FlushSummary = {
  sent: number;
  duplicates: number;
  conflicts: number;
  failed: number;
  stillPending: number;
};

/**
 * Replays pending entries in order. Stops at the first network failure
 * (still offline). Confirmed and duplicate entries are removed; conflicts
 * (409) and rejections (other 4xx) are parked with the server's message.
 */
export async function flushQueue(input: {
  storage: QueueStorage;
  fetchImpl: FetchImpl;
}): Promise<{ queue: QueuedDriverEvent[]; summary: FlushSummary }> {
  const summary: FlushSummary = { sent: 0, duplicates: 0, conflicts: 0, failed: 0, stillPending: 0 };
  let queue = loadQueue(input.storage);
  for (const entry of [...queue]) {
    if (entry.state !== 'pending') continue;
    let response: FetchResponse;
    try {
      response = await input.fetchImpl(
        `/api/companies/${entry.companyId}/driver/trips/${entry.tripId}/events`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entry.payload),
        },
      );
    } catch {
      break; // Still offline: keep this and everything after it pending.
    }
    const body: unknown = await response.json().catch(() => null);
    const serverMessage = typeof body === 'object' && body !== null
      && typeof (body as { message?: unknown }).message === 'string'
      ? (body as { message: string }).message
      : null;
    if (response.ok) {
      const duplicate = typeof body === 'object' && body !== null
        && (body as { duplicate?: unknown }).duplicate === true;
      if (duplicate) summary.duplicates += 1;
      else summary.sent += 1;
      queue = queue.filter((queued) => queued.id !== entry.id);
    } else if (response.status === 409) {
      summary.conflicts += 1;
      queue = queue.map((queued) => (queued.id === entry.id
        ? { ...queued, state: 'conflict' as const, message: serverMessage ?? 'The server already has a different event with this key.' }
        : queued));
    } else if (response.status >= 400 && response.status < 500) {
      summary.failed += 1;
      queue = queue.map((queued) => (queued.id === entry.id
        ? { ...queued, state: 'failed' as const, message: serverMessage ?? 'The server could not apply this event.' }
        : queued));
    } else {
      break; // 5xx: treat as still-unavailable and stop.
    }
    saveQueue(input.storage, queue);
  }
  summary.stillPending = queue.filter((entry) => entry.state === 'pending').length;
  saveQueue(input.storage, queue);
  return { queue, summary };
}
