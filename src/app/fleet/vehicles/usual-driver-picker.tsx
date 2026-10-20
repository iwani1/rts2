'use client';

import { useEffect, useState } from 'react';

type DriverOption = { id: string; fullName: string; licenceClass: string | null; licenceExpiresAt: string | null };
type SelectedDriver = { id: string; fullName: string; archived: boolean };

export function UsualDriverPicker({
  companyId,
  current,
}: {
  companyId: string;
  current: SelectedDriver | null;
}) {
  const [selected, setSelected] = useState<SelectedDriver | null>(current);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<DriverOption[]>([]);
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
        const response = await fetch(`/api/companies/${encodeURIComponent(companyId)}/drivers?search=${encodeURIComponent(term)}`, {
          signal: controller.signal,
          cache: 'no-store',
        });
        const body = await response.json() as { drivers?: DriverOption[]; error?: string };
        if (controller.signal.aborted) return;
        if (!response.ok) throw new Error(body.error || 'Unable to search active drivers.');
        setMatches(body.drivers ?? []);
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        setMatches([]);
        setError(caught instanceof Error ? caught.message : 'Unable to search active drivers.');
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [companyId, query]);

  return <div className="usual-driver-picker">
    <input type="hidden" name="usualDriverId" value={selected?.id ?? ''} readOnly />
    <div className="usual-driver-selected" aria-live="polite">
      {selected ? <>
        <span>{selected.fullName}{selected.archived ? ' — archived record' : ''}</span>
        <button type="button" className="button-link" onClick={() => setSelected(null)}>Clear usual driver</button>
      </> : <span className="muted">No usual driver selected</span>}
    </div>
    <label htmlFor="usual-driver-search">Search active drivers<input
      id="usual-driver-search"
      type="search"
      maxLength={100}
      autoComplete="off"
      value={query}
      onChange={(event) => {
        const value = event.target.value;
        setQuery(value);
        setMatches([]);
        setBusy(Boolean(value.trim()));
        setError('');
      }}
      aria-describedby="usual-driver-help usual-driver-search-status"
      placeholder="Search by name, licence class or qualification"
    /></label>
    <p id="usual-driver-search-status" className="form-help" role="status">
      {busy ? 'Searching…' : query.trim() ? `${matches.length} active driver${matches.length === 1 ? '' : 's'} shown, up to 50 matches per search.` : 'Enter a search term to find an active driver.'}
    </p>
    {error && <p className="form-error" role="alert">{error}</p>}
    {matches.length > 0 && <ul className="usual-driver-results" aria-label="Matching active drivers" aria-busy={busy}>
      {matches.map((driver) => <li key={driver.id}>
        <button type="button" className="usual-driver-option" onClick={() => {
          setSelected({ id: driver.id, fullName: driver.fullName, archived: false });
          setQuery('');
          setMatches([]);
        }}>
          <span>{driver.fullName}</span>
          <span className="vehicle-secondary">{driver.licenceClass ?? 'Licence class not recorded'}{driver.licenceExpiresAt ? ` · Expires ${driver.licenceExpiresAt}` : ''}</span>
        </button>
      </li>)}
    </ul>}
  </div>;
}
