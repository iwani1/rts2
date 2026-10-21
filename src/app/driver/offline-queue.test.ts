import { describe, expect, it } from 'vitest';
import {
  DRIVER_QUEUE_KEY,
  enqueueEvent,
  flushQueue,
  loadQueue,
  removeEvent,
  type FetchImpl,
  type QueueStorage,
  type QueuedDriverEvent,
} from './offline-queue';

function memoryStorage(): QueueStorage & { raw: Map<string, string> } {
  const raw = new Map<string, string>();
  return {
    raw,
    getItem: (key) => raw.get(key) ?? null,
    setItem: (key, value) => { raw.set(key, value); },
  };
}

function entry(id: string, eventType = 'START'): QueuedDriverEvent {
  return {
    id, companyId: 'company-1', tripId: 'trip-1', eventType,
    payload: { eventType, idempotencyKey: id },
    queuedAt: '2027-08-04T08:00:00.000Z', state: 'pending', message: null,
  };
}

const okFetch = (duplicate = false): FetchImpl => async () => ({
  ok: true, status: duplicate ? 200 : 201,
  json: async () => ({ duplicate }),
});

describe('driver offline queue (DRV-05 / D-074)', () => {
  it('loads an empty queue for missing or corrupt storage', () => {
    const storage = memoryStorage();
    expect(loadQueue(storage)).toEqual([]);
    storage.setItem(DRIVER_QUEUE_KEY, '{not json');
    expect(loadQueue(storage)).toEqual([]);
  });

  it('enqueues once per idempotency key and removes by id', () => {
    const storage = memoryStorage();
    enqueueEvent(storage, entry('key-1'));
    const queue = enqueueEvent(storage, entry('key-1'));
    expect(queue).toHaveLength(1);
    expect(removeEvent(storage, 'key-1')).toEqual([]);
  });

  it('sends pending events in order and clears them on confirmation', async () => {
    const storage = memoryStorage();
    enqueueEvent(storage, entry('key-1'));
    enqueueEvent(storage, entry('key-2', 'BOARD'));
    const calls: string[] = [];
    const fetchImpl: FetchImpl = async (url, init) => {
      calls.push(`${url}:${(JSON.parse(init.body) as { eventType: string }).eventType}`);
      return { ok: true, status: 201, json: async () => ({ duplicate: false }) };
    };
    const { queue, summary } = await flushQueue({ storage, fetchImpl });
    expect(calls).toEqual([
      '/api/companies/company-1/driver/trips/trip-1/events:START',
      '/api/companies/company-1/driver/trips/trip-1/events:BOARD',
    ]);
    expect(queue).toEqual([]);
    expect(summary).toMatchObject({ sent: 2, stillPending: 0 });
  });

  it('treats duplicate confirmations as success (safe replay)', async () => {
    const storage = memoryStorage();
    enqueueEvent(storage, entry('key-1'));
    const { queue, summary } = await flushQueue({ storage, fetchImpl: okFetch(true) });
    expect(queue).toEqual([]);
    expect(summary).toMatchObject({ sent: 0, duplicates: 1 });
  });

  it('stops at the first network failure and keeps the rest pending', async () => {
    const storage = memoryStorage();
    enqueueEvent(storage, entry('key-1'));
    enqueueEvent(storage, entry('key-2'));
    let calls = 0;
    const fetchImpl: FetchImpl = async () => {
      calls += 1;
      throw new TypeError('Failed to fetch');
    };
    const { queue, summary } = await flushQueue({ storage, fetchImpl });
    expect(calls).toBe(1);
    expect(queue).toHaveLength(2);
    expect(summary.stillPending).toBe(2);
  });

  it('parks conflicts and rejections with the server message', async () => {
    const storage = memoryStorage();
    enqueueEvent(storage, entry('key-1'));
    enqueueEvent(storage, entry('key-2'));
    enqueueEvent(storage, entry('key-3'));
    const fetchImpl: FetchImpl = async (_url, init) => {
      const keyValue = (JSON.parse(init.body) as { idempotencyKey: string }).idempotencyKey;
      if (keyValue === 'key-1') {
        return { ok: false, status: 409, json: async () => ({ message: 'A different event already used this key.' }) };
      }
      if (keyValue === 'key-2') {
        return { ok: false, status: 400, json: async () => ({ message: 'Only an Assigned passenger can board.' }) };
      }
      return { ok: true, status: 201, json: async () => ({ duplicate: false }) };
    };
    const { queue, summary } = await flushQueue({ storage, fetchImpl });
    expect(summary).toMatchObject({ conflicts: 1, failed: 1, sent: 1 });
    expect(queue.find((row) => row.id === 'key-1')).toMatchObject({ state: 'conflict', message: 'A different event already used this key.' });
    expect(queue.find((row) => row.id === 'key-2')).toMatchObject({ state: 'failed' });
    expect(queue.some((row) => row.id === 'key-3')).toBe(false);
  });
});
