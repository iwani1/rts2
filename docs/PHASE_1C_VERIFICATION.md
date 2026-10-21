# Phase 1C verification — corporate invoice lifecycle and payments (FIN-02 extension, FIN-03)

Status: **SLICE BUILT, SANDBOX-VERIFIED — Fedora run required.** The Phase 1B gate is closed
(D-060, declared by the owner 2026-10-21); the owner authorized Phase 1C construction the same
day. D-061/D-062 await ratification at the Phase 1C gate.

Sandbox evidence already gathered (2026-10-21, PGlite = PostgreSQL in WASM plus a
driver-adapter-backed Prisma client): all 23 migrations apply in sequence; DB-guard assertions
pass; unit 375/375; `invoice-lifecycle.integration.test.ts` 6/6; pre-existing FIN-02 integration
4/4; corporate dashboard integration 4/4; `prisma validate` OK; typecheck clean; lint clean on
touched files; production build compiles (prerender needs a reachable database). Nine unrelated
integration tests failed in the sandbox only (single-backend transaction timeouts and error-class
identity through the adapter) — the full run below on real PostgreSQL is authoritative.

## Automated run (fresh disposable database)

From the repo root on Fedora:

```bash
./scripts/verify-phase1c.sh
```

Expect: 23 migrations applied; typecheck clean; lint clean; unit tests pass (375 at build time);
integration tests pass (111 + 6 new lifecycle tests at build time). The script creates a fresh
`richie_tms_p1c_*_test` database and never touches operational data.

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
