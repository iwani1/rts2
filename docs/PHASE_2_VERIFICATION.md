# Phase 2 verification (Fedora)

Phase 2 opened on 2026-10-21 by owner direction (D-068). Phase 1C Fedora verification
(`./scripts/verify-phase1c.sh`) and ratification of D-061–D-067 remain outstanding and
run in parallel — a green Phase 2 run does not close the Phase 1C gate.

Run everything from the repository root on Fedora:

```bash
./scripts/verify-phase2.sh
```

The script creates a **fresh disposable `*_test` database** (never reuse one — audit
history is append-only by design), applies all migrations (**expect: 26 applied**),
then runs typecheck, lint, the unit suite and the full PostgreSQL integration suite,
including `notifications/notifications.integration.test.ts`.

---

# Phase 2 verification — in-app notifications (NTF-01; D-068)

Status: **SLICE BUILT — Fedora run required.**

## Manual workflow (browser)

1. Ensure a passenger login is linked (Customers/Employees linking from Phase 1C). As an
   Operations Manager, create a booking for that passenger's employee: the workspace
   header now shows **Notifications (1 new)** for the passenger login.
2. Sign in as the passenger and open **Notifications**: the "Journey requested" item is
   there. Confirm the booking as Operations: a "Journey confirmed" item arrives. Assign
   it to a trip from Dispatch: a "Bus assigned" item arrives. Mark one read, then
   "Mark all as read" — the header counter clears.
3. In Notification preferences, switch **In-app** off. Have Operations cancel another
   booking for the passenger: no new notification appears. Switch it back on.
4. As the rental customer from Phase 1C: submit an enquiry, then have Operations move it
   to Under Review and Decline it: two "Rental request" items arrive in the customer's
   inbox. Confirm no other login can see or mark them (each inbox is strictly its own).
5. Confirm the SMS/email preference switches save, with the note that those channels
   switch on with NTF-02/03 — nothing is claimed as sent by SMS or email yet.
