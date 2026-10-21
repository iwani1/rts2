# Phase 1C hardening pass — findings and fixes

Date: 2026-10-21. Scope per `richie-tms-phase-prompts.md`: data isolation, financial
calculations, booking conflicts, mobile usability, error handling and accessibility,
reviewed over the Phase 1C surface (FIN-07, RPT-02/03/04, PAX-01, RNT-09, D-067
operations dashboard) plus the export paths it touches. **Fedora verification of every
Phase 1C slice is still pending; this pass does not change that.**

## Defects found and fixed

1. **Spreadsheet formula injection in CSV exports (fixed).** Report exports (RPT-04)
   and the employee register export quoted commas/quotes/newlines but did not
   neutralise formula prefixes. A client, employee or place name beginning with `=`,
   `+`, `-`, `@`, tab or CR would execute as a formula when opened in a spreadsheet.
   Both serializers now share `src/lib/csv-cell.ts`, which prefixes such cells with a
   single quote (text stays visible, becomes inert). Covered by
   `src/lib/csv-cell.test.ts` and the existing `csv.test.ts`.
2. **Uniqueness races surfaced as HTTP 500 (fixed).** Account linking (passenger and
   rental customer) and passenger feedback rely on database unique constraints;
   the pre-checks made the normal path safe, but two simultaneous requests could hit
   the constraint (Prisma `P2002`) and bubble up as a bare 500. The three write sites
   now translate `P2002` into the same domain validation/policy errors as the
   pre-checks. Booking creation already had this mapping (D-052 lineage); invoice
   payments are serialised by row lock (D-062) and needed no change.
3. **Silent list truncation in the portals (fixed).** The passenger portal caps
   upcoming/history lists at 50 and the rental portal at 100 without saying so.
   Both homes now return their totals and the pages state "Showing the next N of M"
   whenever a list is truncated.
4. **Misleading column label on the operations dashboard (fixed).** "Passengers"
   counted every booking ever assigned to today's trips, including later-cancelled
   ones; the column is now labelled "Bookings assigned".
5. **Missing server-side error logging on rental-portal routes (fixed).** Their 500
   branches now `console.error` the underlying error, matching the other portal
   routes, so Fedora failures are diagnosable from server logs.

## Areas reviewed with no defect found

- **Data isolation.** Every Phase 1C read/write is company-scoped; both portals
  resolve the caller exclusively through the unique account link and never accept an
  employee/customer id from the client; cross-customer and cross-company attempts
  return not-found (integration-covered). Report and export queries apply permission
  scopes inside the query layer (`FINANCE_SCOPES`/`TRANSPORT_SCOPES`), and CSV
  serializers only ever receive the scoped DTOs. `createBookingForLinkedEmployee`
  intentionally skips the staff `accessFor` gate and is reachable only from the
  passenger module after link resolution.
- **Financial calculations.** FIN-07/RPT-03 keep the computed identity
  `recognised = payments + outstanding` in the DTO (never stored), outstanding is
  derived over ISSUED invoices only, and window semantics are labelled. No path in
  the slice writes financial state except the already-governed invoice/payment
  services.
- **Booking conflicts.** Passenger requests run the extracted shared creation core;
  staff behaviour is unchanged (the pre-existing booking suites pass unchanged).
  Rental withdrawal is confined to Draft/Submitted by service check plus the DB
  transition guard (migration-proven).
- **Mobile usability and accessibility.** New pages reuse the established responsive
  patterns: labelled form controls (wrapping labels), `scope="col"` table headers,
  scrollable table regions with `tabIndex={0}`, status pills with text (not colour
  alone), and full-text status names in both portals.
- **Error handling (general).** All new API routes map Zod/domain/permission errors
  to stable JSON shapes; no raw Prisma or database errors are returned to clients.

## Residual risks (for the gate)

- All Phase 1C integration suites (FIN-07, reports, passenger, rental portal,
  operations) have been written but **not yet executed**; only the Fedora run in
  `docs/PHASE_1C_VERIFICATION.md` executes them. Do not treat the MVP gate as passed
  before that run is green.
- Browser-level checks (Playwright/manual) for the new pages are listed per slice in
  `docs/PHASE_1C_VERIFICATION.md`; none have run yet.
- Live ETAs/maps (PAX-02), formal rental quotation issuance/acceptance and rental
  invoicing (RNT-04/05) remain unbuilt by design; the portals state this explicitly.
