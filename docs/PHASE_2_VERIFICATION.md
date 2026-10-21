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

# Phase 2 verification — incidents (INC-01; D-071)

Status: **SLICE BUILT — Fedora run required.** The verification script includes
`incidents/incidents.integration.test.ts` and applies migration 28
(`20261021160000_incidents`).

## Manual workflow (browser)

1. As an operations/dispatch login, open **Incidents**: record an incident
   (e.g. a complaint) — a second dispatcher login receives an in-app alert
   (Notifications), the reporter does not.
2. As a linked driver with an active trip, open **My trips** and use
   **Report a problem**: the incident appears in the register with the trip,
   vehicle and driver already attached.
3. Open the incident: affected passengers are listed, restricted people
   information is visible to incident managers, and status moves
   Open → Acknowledged → In Progress → Resolved (resolution notes required)
   → Closed, with every step in the status history. Trying to resolve without
   notes is refused.

# Phase 2 verification — breakdown response (INC-02; D-072)

Status: **SLICE BUILT — Fedora run required.** The verification script includes
`incidents/incident-response.integration.test.ts`. No new migrations in this slice.

## Manual workflow (browser)

1. A driver reports a breakdown from **My trips** (or record one in **Incidents**
   linked to an active trip).
2. Open the incident: **Breakdown response** lists the affected trip and
   passengers. Safety-blocked vehicles and expired-licence drivers never appear
   as replacement options; busy ones are excluded too.
3. Confirm a replacement vehicle/driver: the trip keeps its original assignment
   in the audit history, linked passengers are notified, and with the boxes
   ticked the original vehicle is safety-blocked and a work order (`WO-…`) is
   opened. Resolve the incident afterwards from the same page.

# Phase 2 verification — boarding verification (DRV-03; D-073)

Status: **SLICE BUILT — Fedora run required.** The verification script includes
`driver/boarding.integration.test.ts` and applies migration 29
(`20261021170000_boarding_verification`).

## Manual workflow (browser)

1. Assign a booking to a trip: the passenger's **My journeys** now shows a
   6-digit boarding code (theirs only). The driver manifest never shows codes.
2. In **Settings**, set `trips.boarding_code_policy` to `{"mode": "REQUIRED"}`.
3. As the driver, board the passenger: the wrong code is refused and recorded;
   the correct code boards them once; without a code, boarding asks for a
   manual-verification reason. With the policy unset/`DISABLED`, tap-to-board
   works exactly as before.

# Phase 2 verification — driver offline queue (DRV-05; D-074)

Status: **SLICE BUILT — Fedora run required.** No new migrations. The queue
logic is unit-tested (`driver/offline-queue.test.ts`); the server idempotency
it relies on is covered by the existing driver integration suite.

## Manual workflow (browser)

1. Open **My trips** on a phone (or devtools with network throttling set to
   Offline). Start a trip or board a passenger: the action reports "saved on
   this phone (pending sync)" and appears in **Events on this phone**.
2. Restore connectivity (or press **Sync now**): the panel confirms the events
   and clears; the trip reflects them after refresh.
3. Repeat the same event online afterwards (retry the sync): the server
   answers duplicate and nothing is applied twice.

# Phase 2 verification — preventive maintenance reminders (MNT-03; D-075)

Status: **SLICE BUILT — Fedora run required.** Migration 30
(`20261021180000_service_plans`); the verification script includes
`maintenance/service-plans.integration.test.ts`.

## Manual workflow (browser)

1. Open **Maintenance → Service reminders**: every vehicle shows its computed
   state (overdue / due soon / up to date / no plan).
2. Set a plan (calendar and/or mileage interval with the last-service
   baseline) and watch the due date and remaining km update. **Notify fleet
   team** alerts other maintenance managers once per due cycle.
3. Record a completed service: the baseline (and next due date) moves. Note
   that waiting past a due date changes nothing by itself.
