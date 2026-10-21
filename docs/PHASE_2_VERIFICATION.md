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

---

# Phase 2 verification — SMS (NTF-02; D-069)

Status: **SLICE BUILT — Fedora run required.** `./scripts/verify-phase2.sh` now applies
**27 migrations** and includes `notifications/sms.integration.test.ts` plus the SMS unit
tests.

## Manual workflow (browser + optional live provider)

1. Without SMS env vars: sign in as a linked passenger with a telephone on their
   employee record, have Operations create a booking, and open **Notifications**:
   the SMS section says *not configured*, and the message waits as "Waiting to send".
   Nothing is claimed as sent.
2. As Super Admin, `POST /api/notifications/sms/dispatch`: the response reports
   `configured: false` and zero attempts.
3. (Optional, needs a real vendor account) Set `SMS_PROVIDER=arkesel`,
   `ARKESEL_API_KEY`, `ARKESEL_SENDER_ID` and `SMS_WEBHOOK_SECRET` in the
   environment, restart, dispatch again: the row moves to "Sent — awaiting delivery
   confirmation". Point the provider's delivery reports at
   `/api/notifications/sms/dlr` with header `x-webhook-secret`: only then does the
   row show "Delivered". Verify pricing/sender-id rules with the vendor first.

---

# Phase 2 verification — email (NTF-03; D-070)

Status: **SLICE BUILT — Fedora run required.** The verification script includes
`notifications/email.integration.test.ts`. No new migrations in this slice.

## Manual workflow (browser + optional live SMTP)

1. Without email env vars: trigger any booking notification for a linked passenger
   and open **Notifications**: the Email section says *not configured* and the copy
   waits as "Waiting to send".
2. `POST /api/notifications/email/dispatch` as Super Admin reports
   `configured: false`.
3. (Optional, needs a real SMTP account) Set `EMAIL_PROVIDER=smtp`, `SMTP_HOST`,
   `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, restart and
   dispatch: the row moves to "Sent to mail server" — never "Delivered" — and the
   message lands in the recipient's mailbox.
