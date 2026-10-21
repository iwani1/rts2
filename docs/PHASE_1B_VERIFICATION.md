# Phase 1B verification on Fedora (owner-run, 2026-10-21)

**Status: NOT YET RUN.** Everything below is expected output for slices that
are implemented locally and pushed, but unverified until these commands run:
CLI-02 (`6c2ba81`), EMP (`9520371`), RTE (`ef83d47`), BKG (`2e63cc8`), TRP
(`d06532b`), DSP (`d2e9573`), DRV (`d54faaf`), BKG-05/06 (`aae103e`), FIN-02
(`6bb733f`), CLI-03 (`f55be6f`). Do not treat any of them as working until
this checklist passes.

## 0. Pull and generate

```bash
cd ~/rts2
git pull --ff-only origin arena/8922811c-rts2
npm ci
npm run db:generate
```

## 1. Fresh disposable test database (never an operational one)

```bash
docker compose up -d db        # or: podman compose up -d db
docker compose exec -T db createdb -U tms -T template0 richie_tms_phase1b_test
export TMS_TEST_DATABASE_URL="postgresql://tms:<local-dev-password>@localhost:5432/richie_tms_phase1b_test"
```

`db:test:migrate` refuses non-`_test`, non-local, or non-empty databases by
design — always start from a fresh one.

## 2. Migrate and run the suites

```bash
npm run db:test:migrate        # expect: 20 migrations applied cleanly
npm run typecheck              # expect: no errors
npm run lint                   # expect: no errors
npm test                       # unit suite incl. full 7x7 booking and 8x8 trip state matrices
npm run test:integration       # PostgreSQL-backed suites
```

Expected integration highlights (each is an exit criterion in code form):

- Trips: schedule generation creates 5 weekday trips, rerun skips 5; capacity-1
  assignment race — exactly one of two parallel assigns succeeds.
- Dispatch: safety-blocked vehicle and expired licence hard-block even with
  override; same-day driver conflict requires override; no-show frees the seat.
- Driver: own trips only; START replayed with the same idempotency key is a
  no-op duplicate; key reuse for another event conflicts; unlinked driver
  accounts are denied (CLI-03-style binding: second driver sees nothing).
- Invoices: no-rate refusal; per-passenger totals; duplicate generation
  returns the same invoice; cross-company denial.
- Corporate dashboard: bound HR sees only its client's records; restricted
  employee fields absent; double-bind refused; revoke ends access.

## 3. E2E (separate fresh `_test` database)

Follow `docs/SETUP_AND_DEPLOYMENT.md` step 47–55 with a fresh
`richie_tms_e2e_phase1b_test`, bootstrap a super admin and the Richie
Transport Services company, then run `npm run test:e2e`.

## 4. Report back

Paste the tail of each suite (files/tests passed counts) into the session.
Any failure: keep the full error output; do not fix tests to hide product
bugs. After a green run, the owner records verification in `docs/PROGRESS.md`
(slice status → Verified) and rules on the Phase 1B gate decisions:

- **D-059** — HR-to-client binding via `UserClientBinding` (approve/reshape).
- **Settings registry rows** — `bookings.creation_cutoff` (D-056) and
  `finance.corporate_rates` (D-058) need labels/categories approved before the
  settings UI can configure them (see `docs/OPEN_QUESTIONS.md`).
- **DRV-03 / DRV-05** — still undefined in the approved documents; define or
  formally descope.
- **Invoice lifecycle** — DRAFT-only today; issuing/payment/voiding is a
  Phase 1C finance decision and must not be assumed.

No Phase 1C work begins before the owner approves this gate.
