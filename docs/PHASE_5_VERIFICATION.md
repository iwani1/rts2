# Phase 5 verification — rental invoicing, quotations, riders (D-090)

Phase 5 closes the rental money loop and the Phase 3 rider bundle:
finance raises a rental invoice from an approved completion (5A), staff
issue customer quotations that the linked customer accepts or declines
in the portal (5B), and the rider bundle adds the two missing policy
editors, invoice due dates and dashboard ageing (5C). Automated checks
run on Fedora in a disposable `*_test` database.

## Automated verification (Fedora)

```bash
cd ~/Videos/rts2/rts2
git fetch origin
git checkout arena/8922811c-rts2
git pull --ff-only
./scripts/verify-phase5.sh
```

Expected:

- 42/42 migrations (new: `20261021240000_rental_invoicing`,
  `20261021241000_rental_quotations`, `20261021242000_invoice_due_dates`)
- typecheck and lint clean
- unit suite green, including the rental-invoice 4×4 transition matrix,
  the quotation transition matrix, the ageing bucket tests and the two
  new settings-editor component tests
- integration suite green, including `rental-invoices` (idempotent
  create from an approved completion, deposit-exceeds refusal,
  payment-driven PAID flip, void-with-payments refusal),
  `rental-quotations` (validity fail-closed, supersede-on-reissue,
  portal accept/decline receipts, confirm citing an accepted quotation)
  and the finance-dashboard ageing scenario

> Status: built in the sandbox (PGlite migration sweep 42/42, unit
> 489/489, production build clean, tsc clean at `4bfa1d2`). Fedora
> automated verification is **outstanding**; the manual walkthrough
> below also remains outstanding.

## Manual walkthrough

1. Complete and approve a rental (Phase 4 walkthrough). In the request's
   rental-invoice panel, create the invoice: gross, configured tax,
   deposit deduction and total match the completion snapshot. Create it
   again — the existing invoice is returned and flagged as a duplicate.
2. Issue the invoice with a due date; record a partial payment, then
   the balance — the invoice flips to PAID automatically. A manual
   "mark paid" attempt without covering payments is refused.
3. On a fresh `Under Review` request with a saved worksheet, issue a
   quotation (set `rental.quote_validity` in Admin settings first —
   unset must block issuance). Sign in as the linked customer: the
   quotation appears on the portal home; accept it. Confirm the rental
   citing the quotation reference. Decline another quotation with a
   reason (8–500 characters) and confirm the decision is recorded.
4. In Admin settings, set corporate rates for a contract and the
   booking-creation cutoff; each save demands a reason of at least 8
   characters and the current value is shown. Corporate invoice
   generation and booking creation behaviour change accordingly.
5. On /invoices, issue a corporate invoice — the due-date field is
   required and the issued date shows in the list. On /finance, the
   ageing section buckets issued invoices by days past due, with
   undated invoices counted separately.
6. Paystack sandbox live test (carried over): top up a wallet, verify
   the webhook credits exactly once, and run a refund webhook;
   confirm balances reconcile on the finance dashboard.

## Known limitations (honest states)

- Deposit-exceeds-total invoices are refused with the figures shown;
  refunds are not modelled yet.
- Headline dashboard revenue remains corporate (FIN-07); rental
  invoices appear in ageing until a rental-revenue recognition rule is
  defined. The dashboard states this.
- GRA e-VAT invoicing remains unconfirmed and is not claimed anywhere.
