export type StatusTimelineEntry = {
  sequence?: number;
  fromStatus: string | null;
  toStatus: string;
  reason: string;
  actorName: string;
  /** ISO timestamp; rendered in Africa/Accra. */
  createdAt: string;
};

/**
 * Status-history timeline (UI pilot, D-079): one vertical dotted rail
 * for the append-only history every governed record carries. Entries
 * render in the order supplied (services return them by sequence); the
 * final entry is the record's current standing and is highlighted.
 * Pure presentation — no data is derived beyond timestamp formatting.
 */
export function StatusTimeline({ entries }: { entries: StatusTimelineEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <ol className="rt-timeline">
      {entries.map((entry, index) => {
        const isLatest = index === entries.length - 1;
        return (
          <li className={`rt-timeline-item${isLatest ? ' is-latest' : ''}`} key={entry.sequence ?? index}>
            <span className="rt-timeline-dot" aria-hidden="true" />
            <span className="rt-timeline-status">
              {entry.fromStatus ? (
                <>
                  <span className="rt-timeline-from">{entry.fromStatus} → </span>
                  {entry.toStatus}
                </>
              ) : (
                entry.toStatus
              )}
            </span>
            <p className="rt-timeline-reason">{entry.reason}</p>
            <p className="rt-timeline-meta">
              {entry.actorName} ·{' '}
              {new Intl.DateTimeFormat('en-GB', {
                timeZone: 'Africa/Accra', day: '2-digit', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              }).format(new Date(entry.createdAt))}
              {entry.sequence !== undefined ? ` · event ${entry.sequence}` : ''}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
