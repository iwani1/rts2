# KPI definitions — Phase 0

All reports use the selected local-date range in `Africa/Accra`, store/query instants as UTC, expose numerator/denominator and data coverage, and label incomplete evidence. Exclude voided/cancelled records as specified. Do not show a verified value when source fields are missing; show “insufficient data” and coverage counts. These are proposed formulas pending management approval of on-time threshold and metric semantics.

## RPT-01 Rentals
- Enquiries: count Submitted requests created in range; coverage = requests with creation date / all requests in scope.
- Quotations issued: count unique quotation versions first issued in range; identify request separately.
- Acceptance rate: accepted quotations / issued quotations eligible for an outcome; omit open and expired-with-no-outcome until policy defines treatment; show counts.
- Confirmed/completed rentals: count distinct rental requests whose corresponding transition occurred in range.
- Revenue: sum issued rental invoice line totals net of credits for invoice issue dates in range; never equate quotation value or unverified payments with revenue.
- Outstanding balance: sum issued invoice total minus verified payments and approved credits, as-of report end.
- Vehicle utilisation: assigned rental hours / eligible available fleet hours in range. Suppress if availability calendar/category data is missing; prevent overlapping assignment double count.
- Cancellation reasons: count cancelled requests grouped by recorded reason; unknown is its own bucket.

## RPT-02 Transport and fleet
- Booking received/confirmed/completed/cancelled: distinct bookings by event timestamp, one count per relevant transition.
- No-shows: distinct explicitly recorded passenger no-show events / expected passenger pickups with outcome recorded.
- On-time pickup rate: pickups within configured threshold of planned pickup / pickups with both planned and actual timestamps. Threshold remains unset until owner approval. Coverage is eligible pickups with both times / all eligible pickups.
- Average delay: arithmetic mean of actual minus planned pickup minutes for recorded late pickups (or all completed pickups—management must choose); display sample size and coverage.
- Passengers transported: count unique completed passenger journey events, avoid counting repeat boarding updates.
- Route utilisation: occupied passenger-seat segments / available capacity-seat segments for trips with capacity and manifests; no estimate without both.
- Contract performance: only agreed service-level measures with defined denominator, target, period and source fields; otherwise insufficient data.
- Vehicles by status: persisted status count at report snapshot; status timestamps required for historical snapshots.
- Downtime: duration in configured unavailable statuses / reporting interval; avoid overlapping unavailable periods.
- Maintenance: work orders and approved costs by completion/report dates clearly labeled.
- Fuel cost/mileage: only recorded fuel transactions/odometer readings; no inferred missing values. Validate odometer progression.
- Document expiry: count active vehicle documents whose expiry lies inside configurable lead window; lead time unset pending policy.

## RPT-03 Finance
- Revenue by service/customer: issued invoices less posted credit notes grouped by source service/customer and invoice date.
- Payments received: sum verified, non-reversed payments by received date and method; pending/unverified excluded.
- Outstanding invoices: remaining balance on issued invoices as of end date, grouped by due status/customer.
- Expenses by category: sum approved expense records by date/category. Phase 1A only has maintenance costs, not full expense workflow; show unavailable/incomplete until supported.
- Cost per trip: attributable recorded costs / completed trips with cost data. Do not impute shared fleet costs.
- Cost per passenger: attributable costs / completed passenger journeys on same supported scope.
- Estimated margin: (recognized revenue − attributable costs) / recognized revenue only with complete matched periods and adequate coverage; else “insufficient data”. Never present as audited profit.

Filters must preserve permission scope. CSV exports carry filter period, generation time, timezone, formula/coverage metadata, and only authorized rows.
