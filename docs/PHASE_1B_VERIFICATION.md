# Phase 1B verification on Fedora (owner-run, 2026-10-21)

**Status: ALL STEPS PASSED — Phase 1B gate evidence complete (2026-10-21).**
`./scripts/verify-phase1b.sh` completed 7/7 on fresh disposable databases
(most recently at gate commit `d540c68` on `richie_tms_p1b_20261021014258_test`;
first pass at `3e32798` on `richie_tms_p1b_20261021011206_test`): Prisma
generate, 21/21 migrations, typecheck, lint (0 errors), unit 373/373,
integration 105/105 against real PostgreSQL. Gate decisions approved and
recorded as D-060. **E2E (§3): 4/4 specs pass** on the fresh
`richie_tms_e2e_phase1b_test` database, after fixing a spec defect in
`vehicle-safety-blocks.spec.ts` (commit `44a7e93`): the spec had filled
work-completed with the test host's local wall clock (~1h behind
Africa/Accra, minute-truncated), so the instant preceded `appliedAt` and
the service correctly refused the release. The helper now emits
Africa/Accra wall time with seconds precision; no service change was
needed. The owner declared the Phase 1B gate closed on 2026-10-21.

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
npm run db:test:migrate        # expect: 21 migrations applied cleanly
npm run typecheck              # expect: no errors
npm run lint                   # expect: no errors
npm test                       # unit suite incl. full 7x7 booking and 8x8 trip state matrices
npm run test:integration       # PostgreSQL-backed suites
```

Expected integration highlights (each is an exit criterion in code form),
including `workflow.integration.test.ts`, which chains contract → bookings →
schedule trip generation → dispatch resources → booking assignment → no-show →
driver START/BOARD/COMPLETE → one-time invoice → bound corporate dashboard in
a single database-backed run:

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
