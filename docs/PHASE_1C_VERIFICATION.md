# Phase 1C verification — corporate invoice lifecycle and payments (FIN-02 extension, FIN-03)

Status: **FEDORA-VERIFIED 2026-10-21 at commit `51bfbd6`** (log
`verification-logs/phase1c-20261021132250.log`): 23/23 migrations applied, typecheck clean, lint
0 errors (2 pre-existing warnings in `customer-picker.tsx`), unit **375/375**, integration
**111/111** including `invoice-lifecycle.integration.test.ts` 6/6 on real PostgreSQL. The nine
sandbox-only failures did not reproduce. The Phase 1B gate is closed (D-060, declared by the
owner 2026-10-21); the owner authorized Phase 1C construction the same day. D-061/D-062 await
ratification at the Phase 1C gate. Manual browser checks below remain available for acceptance
testing but are no longer a verification blocker.

## Automated run (fresh disposable database)

From the repo root on Fedora:

```bash
./scripts/verify-phase1c.sh
```

Expect: 23 migrations applied; typecheck clean; lint clean; unit tests pass (375 at build time);
integration tests pass (111 total at verification time, including the 6 lifecycle tests). The
script creates a fresh `richie_tms_p1c_*_test` database and never touches operational data.

## Focused checks (optional, same database)

```bash
DATABASE_URL="$TMS_TEST_DATABASE_URL" npm run test:integration -- src/modules/finance/invoice-lifecycle.integration.test.ts
DATABASE_URL="$TMS_TEST_DATABASE_URL" npm run test:integration -- src/modules/finance/invoices.integration.test.ts
```

## Manual workflow (browser, any running instance with a configured corporate rate)

1. Sign in as a Finance Officer, open **Invoices**, generate an invoice for a contract/period with
   Completed trips. Confirm it appears as DRAFT with the expected total, and that regenerating the
   same contract/period returns the same invoice.
2. Open the invoice, enter a reason, and **Issue invoice**. Status becomes ISSUED; the status
   history shows DRAFT then ISSUED.
3. Record a part payment below the total: the Paid figure rises and Outstanding falls; the invoice
   stays ISSUED. Try to overpay: the request is refused with the outstanding balance shown. Void is
   now refused because payments exist.
4. Record the remainder: the invoice becomes PAID automatically and the history ends with PAID.
5. Generate a second invoice, void it as a draft, then regenerate the same contract/period: a new
   invoice (different reference) is created containing the same trip.
6. Sign in as a corporate HR user bound to the client and open the corporate dashboard: the invoice
   shows its status and outstanding balance.
7. As an Operations Manager (read-only invoice scope), confirm the lifecycle controls report
   read-only access.

## Known limits

No credit notes or payment adjustments (void-with-payments is refused), no verification or
reconciliation status on payments (FIN-08, Phase 3), no overdue tracking, no PDF export
(RPT-05, Phase 3), and corporate rates are still configured through the settings service rather
than a dedicated editor.

---

# Phase 1C verification — finance dashboard (FIN-07; D-063)

Status: **SLICE BUILT — Fedora run required.** Same automated run as above
(`./scripts/verify-phase1c.sh` executes the whole suite, including
`finance-dashboard.integration.test.ts` and the `dashboard-summary` unit tests).

## Manual workflow (browser)

1. Sign in as a Finance Officer and open **Finance dashboard** from the home page (or from the
   Invoices header). The green reconciliation banner must read
   "recognised revenue = payments received + outstanding" for your data.
2. Compare the three headline figures against the Invoices register: revenue equals the totals of
   ISSUED + PAID invoices, outstanding equals what those invoices still owe, and the per-client
   rows add up to the same numbers.
3. Set an activity window covering the day you issued an invoice: "Invoices issued" and "Revenue
   recognised" reflect it, while the balance cards do not move.
4. Confirm the "Not shown — insufficient data" panel lists margin and the other unsupported
   metrics with reasons, and that no margin percentage appears anywhere.
5. Sign in as an Operations Manager: the dashboard reports that access is not permitted
   (read-only invoice scope does not include finance totals).
