# Phase 4 verification — rental lifecycle (D-089)

Phase 4 moves a reviewed rental request through confirmation (vehicle
reserved), driver assignment, two-step completion and pre-trip
cancellation. Automated checks run on Fedora in a disposable `*_test`
database; the parallel double-booking proof (PostgreSQL exclusion
constraints) is the critical behaviour — treat any conflict-test failure
as a stop-ship.

## Automated verification (Fedora)

```bash
cd ~/Videos/rts2/rts2
git fetch origin
git checkout arena/8922811c-rts2
git pull --ff-only
./scripts/verify-phase4.sh
```

Expected:

- 39/39 migrations (new: `20261021234000_rental_reservations`, `20261021235000_rental_lifecycle_transitions`,
  `20261021234000_rental_confirmation_facts`)
- typecheck and lint clean
- unit suite green (includes the full 8×8 rental transition-matrix test)
- integration suite green, including `rental-lifecycle` (fail-closed
  deposit/buffer checks, double-booking rejection, assignment
  replacement, started-trip cancellation refusal, two-step completion
  with separation of duties)

> Status: **automated verification PASSED on Fedora 2026-10-21 at
> `1245e02`** (database `richie_tms_p4_20261021215930_test`): 39/39
> migrations, typecheck + lint clean (0 errors), unit 480/480 (130
> files), integration 191/191 (46 suites) including `rental-lifecycle`
> 8/8. The three fix rounds (deposit-policy key, DB-transition trigger
> widening, retire-before-replace ordering) are exactly the
> PostgreSQL-only behaviour the gate exists to catch. The manual
> walkthrough below remains outstanding.

## Manual walkthrough

1. Settings → confirm a deposit policy and both resource buffers exist
   (confirmation must fail closed with a named policy error when either
   is missing).
2. Rentals → Requests: submit a request, begin review, save a pricing
   worksheet, then confirm from the Booking lifecycle panel with the
   deposit + evidence reference; the reservation summary should show the
   vehicle and window.
3. Try confirming a second request for the same vehicle in the same
   window — it must be refused with a conflict message.
4. Assign a driver, reassign to another driver; the ledger shows the
   replaced row.
5. Submit a completion as one user, try to decide it as the same user
   (refused), then approve as a second user with corrected charges; the
   request becomes Completed and the outstanding figure is shown.
6. Cancel a future confirmed booking before its start; the reservation
   is released and can be re-booked.
