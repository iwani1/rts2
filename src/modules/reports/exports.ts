import { buildCsv, type CsvDocument } from './csv';
import type { TransportReport } from './transport-reports';
import type { FinanceReport } from './finance-reports';

function windowLabel(window: { fromDate: string | null; toDate: string | null }) {
  return window.fromDate || window.toDate
    ? `${window.fromDate ?? '…'} to ${window.toDate ?? '…'}`
    : 'All time';
}

function cedis(pesewas: number) {
  return (pesewas / 100).toFixed(2);
}

/**
 * RPT-04 exports serialize exactly the permission-scoped service result the
 * caller could already see — no export path runs its own queries — and carry
 * the filter period, timezone and formula/coverage metadata docs/KPIS.md
 * requires.
 */
export function transportReportCsv(report: TransportReport): string {
  const filters = report.filters;
  const activeFilters = Object.entries(filters)
    .filter(([, value]) => value !== null)
    .map(([key, value]) => `${key}=${value}`)
    .join('; ') || 'none';
  const document: CsvDocument = {
    title: 'Richie TMS staff transport and fleet report (RPT-02)',
    generatedAt: report.generatedAt,
    timezone: 'Africa/Accra (UTC)',
    windowLabel: windowLabel(report.window),
    filtersLabel: activeFilters,
    formulaNotes: [
      'Booking flow counts distinct bookings per status-history transition inside the window (docs/KPIS.md RPT-02).',
      'No-shows are cancellations recorded as passenger no-shows. Passengers transported = bookings reaching Completed.',
      'Route utilisation = boarded/completed passengers over capacityLimit for Completed trips with capacity and a manifest; excluded trips are counted in the coverage note.',
      `Utilisation coverage: ${report.routeUtilisation.excludedCompletedTrips} completed trip(s) excluded for missing capacity or manifest.`,
      report.pickups.onTimeRate !== null
        ? `Pickup coverage: ${report.pickups.pickupsWithPlannedAndActual} of ${report.pickups.eligibleBoardedPickups} boarded pickups have both planned and actual times; the on-time rate counts boardings within ${report.pickups.thresholdMinutes} minutes of the planned start as on time.`
        : `Pickup coverage: ${report.pickups.pickupsWithPlannedAndActual} of ${report.pickups.eligibleBoardedPickups} boarded pickups have both planned and actual times; the on-time rate is not published until the owner sets the threshold.`,
      'Maintenance costs are recorded work-order costs only (labour + parts + other where present); fuel, downtime and margin are insufficient-data and never estimated.',
    ],
    sections: [
      {
        title: 'Booking flow',
        columns: ['Metric', 'Count'],
        rows: [
          ['Bookings received', report.bookings.received],
          ['Bookings confirmed', report.bookings.confirmed],
          ['Passengers boarded', report.bookings.boarded],
          ['Journeys completed', report.bookings.completed],
          ['Bookings cancelled', report.bookings.cancelled],
          ['Bookings rejected', report.bookings.rejected],
          ['Passenger no-shows', report.bookings.noShows],
          ['Passengers transported', report.bookings.passengersTransported],
        ],
      },
      {
        title: 'Pickup delay',
        columns: ['Metric', 'Value'],
        rows: [
          ['Boarded pickups (eligible)', report.pickups.eligibleBoardedPickups],
          ['Pickups with planned and actual times', report.pickups.pickupsWithPlannedAndActual],
          ['Late pickups', report.pickups.latePickups],
          ['On-time or early pickups', report.pickups.onTimeOrEarlyPickups],
          ['Average delay, all samples (minutes)', report.pickups.averageDelayAllMinutes],
          ['Average delay, late pickups only (minutes)', report.pickups.averageDelayLateOnlyMinutes],
          ['On-time pickup rate', report.pickups.onTimeRate !== null
            ? report.pickups.onTimeRate
            : report.pickups.thresholdMinutes === null
              ? 'INSUFFICIENT_DATA - threshold unset'
              : 'INSUFFICIENT_DATA - no pickup samples'],
        ],
      },
      {
        title: 'Trips by status',
        columns: ['Status', 'Trips'],
        rows: report.trips.byStatus.map((row) => [row.status, row.count]),
      },
      {
        title: 'Route utilisation',
        columns: ['Route', 'Trips', 'Passengers', 'Capacity seats', 'Utilisation'],
        rows: [
          ...report.routeUtilisation.routes.map((row) => [
            row.routeLabel, row.trips, row.occupiedSeats, row.capacitySeats, row.utilisation,
          ]),
          ['TOTAL', report.trips.completedTrips, report.routeUtilisation.occupiedSeats, report.routeUtilisation.capacitySeats, report.routeUtilisation.utilisation],
        ],
      },
      {
        title: 'Fleet',
        columns: ['Category', 'Vehicles'],
        rows: [
          ...report.fleet.byCategory.map((row) => [row.category, row.count]),
          ['TOTAL (non-archived)', report.fleet.totalVehicles],
          ['Archived', report.fleet.archivedVehicles],
          ...report.fleet.activeSafetyBlocks.map((row) => [`Safety blocked: ${row.status}`, row.count]),
        ],
      },
      {
        title: 'Document expiry',
        columns: ['Document', `Expiring in window`, 'Already expired'],
        rows: report.documentExpiry.documents.map((row) => [row.document, row.expiringInWindow, row.alreadyExpired]),
      },
      {
        title: 'Maintenance',
        columns: ['Status or metric', 'Value'],
        rows: [
          ...report.maintenance.byStatus.map((row) => [row.status, row.count]),
          ['Work orders in scope', report.maintenance.workOrdersInScope],
          ['With complete cost data', report.maintenance.withCompleteCostData],
          ['With any cost data', report.maintenance.withAnyCostData],
          ['Recorded costs (GHS)', cedis(report.maintenance.recordedCostPesewas)],
        ],
      },
      {
        title: 'Unavailable metrics',
        columns: ['Metric', 'Reason'],
        rows: report.unavailableMetrics.map((item) => [item.metric, item.reason]),
      },
    ],
  };
  return buildCsv(document);
}

export function financeReportCsv(report: FinanceReport): string {
  const document: CsvDocument = {
    title: 'Richie TMS financial report (RPT-03)',
    generatedAt: report.generatedAt,
    timezone: 'Africa/Accra (UTC)',
    windowLabel: windowLabel(report.window),
    filtersLabel: report.clientId ? `clientId=${report.clientId}` : 'none',
    formulaNotes: [
      'Recognised revenue = ISSUED + PAID invoice totals; payments = recorded invoice payments; outstanding is derived per issued invoice (docs/KPIS.md RPT-03, FIN-07).',
      `Reconciliation: revenue ${cedis(report.totals.recognizedRevenuePesewas)} = payments ${cedis(report.totals.paymentsReceivedPesewas)} + outstanding ${cedis(report.totals.outstandingPesewas)} -> ${report.totals.reconciles ? 'RECONCILED' : 'MISMATCH'}.`,
      'Windowed revenue counts standing invoices by their ISSUED history timestamp; payments are dated by receivedAt.',
      `Coverage: issued invoices with timestamp ${report.coverage.issuedInvoicesWithTimestamp.numerator}/${report.coverage.issuedInvoicesWithTimestamp.denominator}; payments with method ${report.coverage.paymentsWithMethod.numerator}/${report.coverage.paymentsWithMethod.denominator}; payments with reference ${report.coverage.paymentsWithReference.numerator}/${report.coverage.paymentsWithReference.denominator}.`,
      `Outstanding list shows ${report.outstandingInvoices.listedCount} of ${report.outstandingInvoices.totalCount} invoices with a balance.`,
      report.margin.status === 'ESTIMATED'
        ? `Estimated gross margin (${report.margin.basis}): revenue GHS ${cedis(report.margin.revenuePesewas)} minus approved expenses GHS ${cedis(report.margin.approvedCostsPesewas)} = GHS ${cedis(report.margin.marginPesewas)}. Estimated only, never audited profit (D-082).`
        : `Estimated gross margin is not shown: ${report.margin.reason}`,
    ],
    sections: [
      {
        title: 'Totals (all time, reconciled)',
        columns: ['Metric', 'GHS'],
        rows: [
          ['Recognised revenue', cedis(report.totals.recognizedRevenuePesewas)],
          ['Payments received', cedis(report.totals.paymentsReceivedPesewas)],
          ['Outstanding', cedis(report.totals.outstandingPesewas)],
        ],
      },
      {
        title: 'Revenue by client (window)',
        columns: ['Client', 'Invoices', 'Revenue (GHS)'],
        rows: report.revenueByClient.map((row) => [row.clientName, row.invoiceCount, cedis(row.revenuePesewas)]),
      },
      {
        title: 'Revenue by service (window)',
        columns: ['Service', 'Invoices', 'Revenue (GHS)'],
        rows: report.revenueByService.map((row) => [row.serviceType, row.invoiceCount, cedis(row.revenuePesewas)]),
      },
      {
        title: 'Payments received (window)',
        columns: ['Method', 'Payments', 'Amount (GHS)'],
        rows: [
          ...report.paymentsInWindow.byMethod.map((row) => [row.method, row.paymentCount, cedis(row.amountPesewas)]),
          ['TOTAL', report.paymentsInWindow.paymentCount, cedis(report.paymentsInWindow.totalPesewas)],
        ],
      },
      {
        title: 'Outstanding invoices',
        columns: ['Reference', 'Client', 'Period start', 'Period end', 'Total (GHS)', 'Paid (GHS)', 'Outstanding (GHS)'],
        rows: report.outstandingInvoices.invoices.map((row) => [
          row.reference, row.clientName, row.periodStart, row.periodEnd,
          cedis(row.totalPesewas), cedis(row.paidPesewas), cedis(row.outstandingPesewas),
        ]),
      },
      {
        title: 'Unavailable metrics',
        columns: ['Metric', 'Reason'],
        rows: report.unavailableMetrics.map((item) => [item.metric, item.reason]),
      },
    ],
  };
  return buildCsv(document);
}
