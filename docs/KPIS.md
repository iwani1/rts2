# KPI definitions — Phase 0

All reports use the selected local-date range in `Africa/Accra`, store/query instants as UTC, expose numerator/denominator and data coverage, and label incomplete evidence. Exclude voided/cancelled records as specified. Do not show a verified value when source fields are missing; show “insufficient data” and coverage counts. These are proposed formulas pending management approval of on-time threshold and metric semantics.

## RPT-01 Rentals
- Enquiries: count Submitted requests created in range; coverage = requests with creation date / all requests in scope. The current read-only `/rentals/reports` page also shows an all-time count of audited `Draft → Submitted` history events (including later-declined requests), but this is not the date-filtered submitted-enquiry KPI. The page's request/status/source snapshot includes Drafts and has no date filter; it must not be described as RPT-01-complete.
- Quotations issued: count unique quotation versions first issued in range; identify request separately.
- Acceptance rate: accepted quotations / issued quotations eligible for an outcome; omit open and expired-with-no-outcome until policy defines treatment; show counts.
- Confirmed/completed rentals: count distinct rental requests whose corresponding transition occurred in range.
- Revenue: sum issued rental invoice line totals net of credits for invoice issue dates in range; never equate quotation value or unverified payments with revenue. (Implemented D-091: the finance dashboard and the all-time rental report recognise issued + paid rental invoice totals; credit notes are not modelled, so no credits are deducted yet.)
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

Implementation (Phase 1C, D-064): booking flow counts distinct bookings per `BookingStatusHistory` transition inside the window; no-shows are cancellations recorded with a passenger no-show reason (dispatch and driver paths both write it); passengers transported = bookings reaching Completed. Pickup delay uses BOARD history timestamps against `tripDate` + `plannedStartTime`; both average-delay variants above are displayed with sample size and coverage (boarded pickups lacking a planned start are excluded and counted), and the on-time rate is withheld while the threshold is unset. Route utilisation sums boarded/completed passengers over `capacityLimit` for Completed trips having both capacity and a manifest; other completed trips are counted as excluded. Vehicles have no persisted operational status, so the fleet section reports recorded category counts, active safety blocks and document-expiry counts (vehicle insurance/roadworthiness/registration date fields and driver licences, in-window and already-expired); downtime, fuel and mileage remain insufficient-data. Maintenance reports recorded work-order costs only, with a cost-data coverage pair.

## RPT-03 Finance
- Finance dashboard (FIN-07, D-063): recognised revenue = Σ totals of ISSUED + PAID corporate invoices. **Amended by D-091 (Phase 6):** recognised revenue combines both invoice families (corporate + rental), the identity holds per stream and combined, and the estimated margin uses the combined revenue basis; payments received = Σ recorded invoice payments; outstanding = Σ (total − payments) over ISSUED invoices. The identity revenue = payments + outstanding must hold on every response. Margin is insufficient-data until attributable cost records exist. No credit notes exist yet, so none are deducted.
- Revenue by service/customer: issued invoices less posted credit notes grouped by source service/customer and invoice date.
- Payments received: sum verified, non-reversed payments by received date and method; pending/unverified excluded.
- Outstanding invoices: remaining balance on issued invoices as of end date, grouped by due status/customer.
- Expenses by category: sum approved expense records by date/category. Phase 1A only has maintenance costs, not full expense workflow; show unavailable/incomplete until supported.
- Cost per trip: attributable recorded costs / completed trips with cost data. Do not impute shared fleet costs.
- Cost per passenger: attributable costs / completed passenger journeys on same supported scope.
- Estimated margin: (recognized revenue − attributable costs) / recognized revenue only with complete matched periods and adequate coverage; else “insufficient data”. Never present as audited profit.

Filters must preserve permission scope. CSV exports carry filter period, generation time, timezone, formula/coverage metadata, and only authorized rows.
