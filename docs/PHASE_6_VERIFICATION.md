# Phase 6 verification — rental revenue recognition (D-091)

Phase 6 recognises rental revenue where finance already looks:
accrual on issue over the `RentalInvoice` ledger, combined with the
corporate stream on the finance dashboard under the rule
revenue = payments + outstanding (proved per stream and combined),
the estimated margin moves to the combined basis, RPT-03 gains a
Rentals line in revenue by service, and `/rentals/reports` reports
real rental revenue and outstanding. No schema change, no migration.

## Automated verification (Fedora)

```bash
cd ~/Videos/rts2/rts2
git fetch origin
git checkout arena/8922811c-rts2
git pull --ff-only
./scripts/verify-phase6.sh
```

Expected:

- 42/42 migrations (unchanged schema; still 42)
- typecheck and lint clean
- unit 491/491 including the revenue-stream combination tests
- integration green, including the D-091 assertions inside
  `rental-invoices` (dashboard streams + RPT-03 Rentals line) and
  `finance-dashboard` (no unavailable metrics remain)

> Status: **automated verification PASSED on Fedora 2026-10-21 at
> `fcfad47`** (database `richie_tms_p6_20261021225603_test`): 42/42
> migrations, typecheck + lint clean (0 errors), unit 491/491 (134
> files), integration 202/202 (48 suites) — including the D-091
> rental-stream assertions in `rental-invoices` (recognised 18,900 =
> payments 9,100 + outstanding 9,800) and the RPT-03 Rentals line.
> One fix round (`fcfad47`: two exact-shape test assertions now
> expect the new stream fields; values were already correct, and
> the real Fedora `tsc` passed first try). The manual walkthrough
> below remains outstanding.

## Manual walkthrough

1. Issue and part-pay a rental invoice (Phase 5 walkthrough). On
   /finance the combined headline rises by the invoice total,
   "Revenue by stream" shows the rental line reconciled, and the
   outstanding reflects the unpaid balance.
2. On /reports/finance, revenue by service shows a Rentals line and
   the totals strip breaks recognised revenue into corporate +
   rentals; the CSV/PDF exports carry the same split.
3. On /rentals/reports the invoicing block shows recognised rental
   revenue, payments and outstanding matching the dashboard's rental
   stream; the retired "not implemented" claims are gone.
4. Create an approved expense and confirm the estimated margin now
   uses combined revenue and is labelled as such (it reads larger
   than the Phase 5 corporate-only margin on the same data — that
   is the documented basis change, not an error).
5. Void an unpaid issued rental invoice and confirm recognised
   rental revenue falls by its total while the voided count rises.

## Known limitations (honest states)

- Credit notes are not modelled; "net of credits" (KPIS.md RPT-01)
  currently means the invoiced total.
- Cost per trip/passenger remains corporate-only: rentals have no
  Trip records to attribute costs to.
- `/rentals/reports` remains an all-time snapshot without a date
  window; it does not claim to be the full RPT-01 KPI set.
