# Phase 3 verification (Fedora)

> **Automated gate PASSED 2026-10-21 at `f71aba9`**: 36/36 migrations,
> typecheck clean, lint 0 errors, unit 475/475 (129 files), integration
> 183/183 (45 suites). Manual walkthrough below still outstanding.

Phase 3 builds FIN-04, FIN-05, FIN-05R (reporting integration), FIN-06,
FIN-08, MNT-04, RTE-05 (interface only) and RPT-05. Decisions D-081–D-088
in `docs/DECISIONS.md`. GRA e-VAT is **excluded**: `docs/OPEN_QUESTIONS.md`
still lists it as an open question (phase rule).

## Automated gate

    ./scripts/verify-phase3.sh

It creates a **fresh** disposable `*_test` database (previous verification
databases are polluted by design — integration fixtures never clean up),
then runs, in order:

1. `npm ci` + Prisma generate
2. PostgreSQL up + fresh DB
3. Test migrations — **expect 36 applied**
4. Typecheck — clean
5. Lint — 0 errors
6. Unit — **expect 475 passed (129 files)**, including the 3×3 expense
   transition matrix, provider signature/planning tests, reconciliation
   matcher, driver-pay computation and the PDF writer checks
7. Integration (PostgreSQL) — **expect 183 passed (45 suites)**, including:
   - `expenses.integration.test.ts` — Pending lifecycle, self-decision
     refused, independent approval, decided records immutable, read-only
     role writes refused, history rows immutable at SQL level
   - `provider-payments.integration.test.ts` — tampered webhook rejected,
     repeated delivery records exactly one event and zero payments, staged
     event applied to the invoice exactly once (PAID flip)
   - `reconciliations.integration.test.ts` — unapplied provider money is
     a discrepancy until applied; independent close stores a reconciling
     snapshot; double close rejected
   - `driver-pay.integration.test.ts` — draft rule pays nobody,
     self-activation refused, export refused before FINAL, finalised CSV
     contains the driver's computed pay
   - `cost-analytics.integration.test.ts` — governed work orders feed
     spend/turnaround/recurrence; windowing works
   - `finance-dashboard.integration.test.ts` — approved expenses count as
     cost, estimated margin present, pending never counts

Safety: the script refuses any database whose name does not end in
`_test`, and all suites re-check the suffix themselves.

Sandbox-side signals already obtained (not a substitute for the run
above): typecheck clean, lint 0 errors, unit 475/475, production build
green, all 36 migrations applied + FIN-05 guards exercised on a PGlite
sweep.

## Manual walkthrough (after the automated gate)

Use the manual-verification database as before (`richie_tms_app_p2_test`
or a `richie_tms_app_p3_test` created the same way). Sign in as the Super
Admin; where "a second user" appears, use a Finance Officer account.

1. **Expenses (FIN-05).** Open Finance → Expenses. Record a FUEL
   expense → appears under "Awaiting decision" with an `EXP-…`
   reference. As the same user, Approve → refused (independent-review
   message). As the second user with a reason < 8 chars → validation
   error; with a proper reason → Approved, moves to "Decided" with the
   history timeline. Record another and Reject it. Edit a Pending expense
   (amount) → saved; try editing a decided one via the API → 422.
2. **Dashboard costs & margin (FIN-05R).** Finance dashboard: an
   "Approved expenses" card and an "Estimated gross margin" card appear
   (before any approved expense exists it must read insufficient-data —
   never a number). Record/approve an expense dated inside a chosen
   window and re-check with that window applied: totals move only on the
   matched basis. "Cost per completed trip" stays empty until a Completed
   trip carries an approved trip-linked expense.
3. **Provider payments (FIN-04).** Finance → Provider payments: banner
   must say **Not configured** (no `PAYSTACK_SECRET_KEY` set). Do NOT set
   a live key. The integration is not called live until a sandbox
   (test-mode) Paystack secret exists and a test transaction succeeds end
   to end: webhook → inbox → apply → PAID invoice. Until then this
   feature verifies on code + integration tests only.
4. **Reconciliation (FIN-08).** Only meaningful after step 3 has data;
   with manual payments only: open a run for a past period → zero
   provider discrepancies, recorded totals shown; close it as a second
   user; self-close must refuse. Closed run lists the OPEN → CLOSED
   history with names and reasons.
5. **Driver pay (FIN-06).** Draft a per-completed-trip rule → try a
   payroll run → refused (rule not active). Activate **as a different
   user** (self-activation refuses). Open the run for a period containing
   a completed trip → line shows trips/boardings/days and the configured
   rate only. Export before finalising → refused. Finalise as the second
   user → CSV downloads with the driver row. Retire the rule → new runs
   under it refuse.
6. **Maintenance analytics (MNT-04).** Complete a work order with costs
   via the normal lifecycle → Fleet → Maintenance → Cost analytics shows
   its recorded spend by vehicle/type, parts vs labour, and repair days.
   A work order without costs raises the "with costs" coverage gap, never
   the spend. Open work orders list as an ageing backlog.
7. **PDF reports (RPT-05).** Reports → Finance → Export PDF and Reports →
   Transport → Export PDF download PDFs whose figures match the on-screen
   report for the same filters, including the margin line (or its
   insufficient-data wording) and the formula notes.
8. **Route optimisation (RTE-05).** Nothing to click: the endpoint
   refuses with 503 NOT_CONFIGURED by design. Confirm only that no screen
   anywhere promises an "optimal" route.

## Still outstanding from earlier gates

- Phase 1C Fedora verification (`scripts/verify-phase1c.sh`, 25
  migrations) and the Phase 1C/Phase 2 manual checklists
  (`docs/PHASE_1C_VERIFICATION.md`, `docs/PHASE_2_VERIFICATION.md`).
- Owner action: save the on-time threshold **10** minutes in Settings on
  Fedora (built in `35d6721`; status unknown).
- Phase 3 automated gate above, at the pushed Phase 3 HEAD.

## Honest limits

- Paystack is implemented and tested against fabricated-but-valid signed
  payloads. It is **not verified live**; per the phase rule it must not
  be described as live until a real sandbox-credential test transaction
  succeeds.
- PDF output is functional text-table PDF (in-repo writer, D-088), not a
  designed document; figures, periods and formula notes are the content.
- Repair "downtime" is report→completion repair days (D-083); no true
  availability metric exists because out-of-service intervals are not
  recorded.
