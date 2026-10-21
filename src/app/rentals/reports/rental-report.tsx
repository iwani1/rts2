import Link from 'next/link';

type Report = {
  generatedAt: string;
  scope: string;
  totalRequests: number;
  submittedRequestsEver: number;
  statuses: Array<{ status: string; count: number }>;
  sources: Array<{ source: string; count: number }>;
  invoicing: {
    recognizedRevenuePesewas: number;
    paymentsReceivedPesewas: number;
    outstandingPesewas: number;
    standingInvoiceCount: number;
    draftInvoiceCount: number;
    voidedInvoiceCount: number;
    reconciles: boolean;
  };
  unavailableMetrics: Array<{ metric: string; reason: string }>;
};

function cedis(pesewas: number) {
  return `GH₵ ${(pesewas / 100).toFixed(2)}`;
}

const reportTime = new Intl.DateTimeFormat('en-GH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Accra' });

export function RentalReport({ report }: { report: Report }) {
  return <main className="fleet-page">
    <header className="fleet-page-header"><Link className="wordmark fleet-wordmark" href="/" aria-label="Richie TMS home">R<span>.</span>TS</Link>
      <nav aria-label="Rental reports navigation"><Link href="/">Workspace</Link><Link href="/rentals/requests">Rental requests</Link><span aria-current="page">Rental report</span></nav>
    </header>
    <div className="fleet-content">
      <div className="fleet-title-row"><div><p className="eyebrow">Persisted operations data</p><h1>Rental request report</h1><p className="muted">All-time aggregate snapshot · generated {reportTime.format(new Date(report.generatedAt))} (Africa/Accra)</p></div>
        <Link className="button-link" href="/rentals/requests">Rental requests</Link>
      </div>
      <section className="fleet-list-panel" aria-labelledby="request-summary-title">
        <div className="fleet-list-heading"><div><h2 id="request-summary-title">Rental request records</h2><p className="muted">All persisted requests across every status; Drafts are included. This is not the submitted-enquiry KPI.</p></div></div>
        <p className="rental-report-total" aria-label={`${report.totalRequests} total rental requests`}>{report.totalRequests}</p>
        <p><strong>Requests ever submitted:</strong> {report.submittedRequestsEver}</p>
        <p className="muted">Counts audited Draft → Submitted events across all time, including requests later declined; this is not a date-filtered KPI.</p>
        <h3>Requests by current status</h3>
        {report.statuses.length === 0 ? <p className="fleet-empty">No rental requests have been recorded.</p> : <ul>{report.statuses.map((item) => <li key={item.status}><strong>{item.status}:</strong> {item.count}</li>)}</ul>}
        <h3>Recorded request sources</h3>
        {report.sources.length === 0 ? <p className="muted">No request-source records.</p> : <ul>{report.sources.map((item) => <li key={item.source}><strong>{item.source}:</strong> {item.count}</li>)}</ul>}
      </section>
      <section className="fleet-list-panel" aria-labelledby="rental-invoicing-title">
        <div className="fleet-list-heading"><div><h2 id="rental-invoicing-title">Rental invoicing (all time)</h2><p className="muted">From the rental invoice ledger. Revenue is recognised on issue (D-091); quotation values are never revenue.</p></div></div>
        <ul>
          <li><strong>Recognised rental revenue:</strong> {cedis(report.invoicing.recognizedRevenuePesewas)} across {report.invoicing.standingInvoiceCount} issued invoice(s)</li>
          <li><strong>Payments received:</strong> {cedis(report.invoicing.paymentsReceivedPesewas)}</li>
          <li><strong>Outstanding:</strong> {cedis(report.invoicing.outstandingPesewas)}</li>
          <li><strong>Draft invoices:</strong> {report.invoicing.draftInvoiceCount} (pipeline, not revenue)</li>
          <li><strong>Voided invoices:</strong> {report.invoicing.voidedInvoiceCount} (excluded)</li>
        </ul>
        <p className="muted">{report.invoicing.reconciles
          ? 'Revenue = payments + outstanding on this ledger.'
          : 'Warning: revenue does not equal payments + outstanding on this ledger; investigate before relying on these figures.'}</p>
      </section>
      <section className="fleet-list-panel" aria-labelledby="unavailable-metrics-title">
        <div className="fleet-list-heading"><div><h2 id="unavailable-metrics-title">Metrics not available yet</h2><p className="muted">These are shown as unavailable, not as zero; the supporting lifecycle or financial records do not exist yet.</p></div></div>
        <ul>{report.unavailableMetrics.map((item) => <li key={item.metric}><strong>{item.metric}:</strong> {item.reason}</li>)}</ul>
      </section>
      <p className="fleet-limits">This snapshot is all-time. Quotation outcomes, utilisation and cancellation breakdowns are not computed here. No financial or operational values are inferred.</p>
    </div>
  </main>;
}
