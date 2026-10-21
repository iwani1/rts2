'use client';

import { useSyncExternalStore } from 'react';

export type DriverToastTone = 'success' | 'info' | 'error';
export type DriverToast = {
  id: number;
  tone: DriverToastTone;
  title: string;
  body?: string;
};

/**
 * Driver feedback toasts (UI pilot, D-079): a module-level store so a
 * toast raised just before an in-page navigation (submit -> trip view)
 * is still seen. Success/info toasts dismiss themselves; errors stay
 * until the driver dismisses them. Nothing here queues or retries
 * events — it only reports what the server/queue already decided.
 */
let toasts: DriverToast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function pushDriverToast(toast: Omit<DriverToast, 'id'>): number {
  const id = nextId++;
  toasts = [...toasts.slice(-2), { ...toast, id }];
  emit();
  if (toast.tone !== 'error') {
    window.setTimeout(() => dismissDriverToast(id), toast.tone === 'success' ? 5_000 : 7_000);
  }
  return id;
}

export function dismissDriverToast(id: number) {
  toasts = toasts.filter((toast) => toast.id !== id);
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function snapshot() {
  return toasts;
}

export function DriverToastStack() {
  const items = useSyncExternalStore(subscribe, snapshot, snapshot);
  if (items.length === 0) return null;
  return (
    <div className="rt-toasts" aria-live="polite">
      {items.map((toast) => (
        <div className={`rt-toast rt-toast-${toast.tone}`} key={toast.id} role={toast.tone === 'error' ? 'alert' : 'status'}>
          <span className="rt-toast-dot" aria-hidden="true" />
          <div className="rt-toast-body">
            <p className="rt-toast-title">{toast.title}</p>
            {toast.body ? <p className="rt-toast-text">{toast.body}</p> : null}
          </div>
          <button
            className="rt-toast-close"
            aria-label="Dismiss notification"
            onClick={() => dismissDriverToast(toast.id)}
            type="button"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
