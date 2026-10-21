# Consolidated manual walkthrough — Phases 1C–6 (browser acceptance)

One continuous scenario that walks every phase's manual checklist in an
order where each part creates the data the next part uses. Automated
verification (`scripts/verify-phase*.sh`) is already green for every
phase; this document is the remaining **human** acceptance pass. Work
through it top to bottom, tick each box, and note any step whose result
differs from its "Expect" line (step number + what happened) — that list
is the acceptance report.

Everything runs against a disposable walkthrough database on your
Fedora machine. Nothing here touches production data.

## Step 0 — environment and accounts

```bash
cd ~/Videos/rts2/rts2
git pull --ff-only
podman compose up -d db
podman compose exec -T db createdb -U tms -T template0 richie_tms_walkthrough
export DATABASE_URL="postgresql://tms:tms_local_only@localhost:5432/richie_tms_walkthrough"
export APP_URL="http://localhost:3000"
export AUTH_SECRET="$(openssl rand -hex 32)"
npm ci && npm run db:generate && npm run db:migrate:deploy   # 42 migrations
npm run bootstrap:super-admin -- --confirm                   # interactive; strong password
npm run bootstrap:company -- --confirm                       # creates the operator company
npm run dev                                                   # http://localhost:3000
```

Create these users under **Admin → Users** (one login each) and assign
the company roles shown; every later step names the persona to use:

| Persona | Role in the company |
|---|---|
| Admin | Super Admin (from bootstrap) |
| Olivia Ops | OPS_MANAGER |
| Oliver Ops-Two | OPS_MANAGER (second pair of hands) |
| Fiona Finance | FINANCE_OFFICER |
| Harry HR | client HR binding for the walkthrough client (Part B) |
| Daniel Driver | DRIVER, linked to the driver record (Part A) |
| Efua Passenger | linked employee login (Part B) |
| Kwame Customer | rental customer login (Part F) |

- [ ] **0.1** Sign in as each persona once; the workspace loads with no
  errors. Sign out between personas (or use separate browser profiles).
  Expect: role-appropriate navigation only; no persona sees admin
  screens they should not.

## Part A — fleet and people registers (Phase 1B/1C)

As **Olivia Ops**:

- [ ] **A.1** Fleet → Vehicles: register a 30-seat coach (`GR-WALK-1`).
  Expect: it appears in the register; no operational status or history
  is invented for it.
- [ ] **A.2** Add vehicle documents with expiry dates (insurance,
  roadworthiness). Expect: only the dates you typed are shown; nothing
  claims a reminder was sent.
- [ ] **A.3** Apply a safety block with a reason, then lift it. Expect:
  the block and its release both show in the record history.
- [ ] **A.4** Fleet → Drivers: register a driver and link Daniel
  Driver's login. Expect: the driver shows as linked.

## Part B — clients, employees, contracts (Phase 1C)

As **Olivia Ops**, then **Admin**:

- [ ] **B.1** Clients: create "Walkthrough Ltd"; add two employees,
  one of them Efua, and link Efua's login. Link Harry HR to the client
  as its HR user.
- [ ] **B.2** Contracts: create a staff-busing contract for Walkthrough
  Ltd and activate it through its lifecycle buttons.
- [ ] **B.3** Admin → Settings: in **Corporate contract rates**, before
  saving anything it reads "Not configured". Enter a per-trip rate for
  the contract with an 8+ character reason; save. Expect: re-opening
  shows the rate; the audit trail (Admin → Audit activity) contains
  the change with your reason.
- [ ] **B.4** In **Tax lines**, add VAT 10% with a reason. (Later parts
  rely on this; the rental invoice in Part F must show the tax.)
- [ ] **B.5** Routes: create a morning route with stops for the
  contract.

## Part C — bookings, dispatch, driver and passenger (Phase 1C/2)

- [ ] **C.1** As **Olivia Ops**, create tomorrow's trip on the route
  and a booking for Efua on it. As **Efua** (passenger portal): a
  "Journey requested" notification is present. Confirm the booking as
  Olivia; Efua's inbox gains "Journey confirmed".
- [ ] **C.2** Dispatch: assign Efua's booking to the trip, assign the
  vehicle and Daniel as driver. Efua gains "Bus assigned".
- [ ] **C.3** As **Daniel** (driver view): start the trip, board Efua,
  complete the trip. Expect: each event appears once; repeating an
  action is refused rather than duplicated.
- [ ] **C.4** As **Efua**: mark one notification read, then
  mark-all-read — the header counter clears. Turn **In-app**
  notifications off in preferences, have Olivia cancel a second
  booking for Efua, and confirm no new item appears; turn it back on.
- [ ] **C.5** Honest states: leave SMS/email providers unconfigured.
  Expect: notification preferences say those channels are not
  configured; nothing anywhere claims an SMS or email was sent.

## Part D — corporate invoicing (Phase 1C)

As **Fiona Finance**:

- [ ] **D.1** Invoices → generate for the contract and the period
  covering Part C's completed trip. Expect: a DRAFT with the rate from
  B.3; generating again returns the same invoice (no duplicate).
- [ ] **D.2** Try to issue **without** a due date. Expect: refusal
  naming the missing due date. Issue with a due date 30 days out;
  history shows DRAFT → ISSUED and the due date is displayed.
- [ ] **D.3** Record a part payment; Paid rises, Outstanding falls,
  status stays ISSUED. Overpay → refused with the balance shown. Void
  → refused (payments exist). Record the remainder → status flips to
  PAID automatically, history ends ISSUED → PAID.
- [ ] **D.4** Generate a second invoice for another period, void it as
  a draft, regenerate the same period. Expect: a new invoice with a
  different reference containing the same journeys.
- [ ] **D.5** As **Harry HR**, open the corporate dashboard: the PAID
  invoice and its zero balance show. As **Olivia Ops**, open an
  invoice's controls. Expect: read-only messaging, no action buttons.

## Part E — finance depth (Phase 3 + 6)

- [ ] **E.1** Finance → Expenses as Fiona: record a FUEL expense.
  Approve it as Fiona → refused (independent reviewer). As **Olivia**
  with a <8-character reason → validation error; with a proper reason
  → Approved with timeline entries. Edit is possible while Pending,
  refused once decided.
- [ ] **E.2** Finance → Provider payments. Expect: banner **Not
  configured** (no Paystack keys in this environment). Do not set any
  keys here — the live test is Part H.
- [ ] **E.3** Finance dashboard: the green reconciliation banner reads
  "recognised revenue = payments received + outstanding"; the three
  headline figures match the Invoices register; **Revenue by stream**
  shows the corporate line reconciled and rentals at zero; the
  margin card either shows an estimated figure on the combined basis
  (labelled, Phase 6) or an insufficient-data explanation — never an
  unexplained number.
- [ ] **E.4** Reports → Financial: revenue by service shows the
  contract's service; totals break out "corporate + rentals"; export
  CSV and PDF and confirm both carry the same figures and the
  corporate/rental split lines.

## Part F — rentals end to end (Phases 4–6)

Settings first (as **Admin**): set **quotation validity** (7 days),
**rental pricing models** (a per-day coach rate) and both **resource
buffers** — but deliberately leave the **deposit policy** unset for
F.4's fail-closed check.

- [ ] **F.1** As **Kwame Customer** (rental portal): submit an enquiry
  for the coach for a date next week. As **Olivia Ops**: begin review
  and save a pricing worksheet from the configured model.
- [ ] **F.2** Issue a quotation from the worksheet. Expect: the quote
  shows subtotal, VAT 10% (from B.4), total, and an expiry 7 days out;
  the pricing snapshot matches the worksheet.
- [ ] **F.3** As **Kwame**: the quotation appears on the portal home
  (not "none issued"). Accept it. Decline path: on a second enquiry,
  decline a quotation with a reason; staff see the recorded decision
  and reason. An expired or already-decided quote refuses action.
- [ ] **F.4** With the deposit policy still unset, confirm the rental
  citing the accepted quotation reference. Expect: refusal —
  "The rental deposit policy is not configured under Settings" (it
  fails closed; nothing is reserved). Now set a fixed-amount deposit
  policy in Admin → Settings and confirm again, recording the deposit
  received. Expect: confirmation succeeds; the reservation exists.
- [ ] **F.5** Confirm a second overlapping request for the same
  vehicle/window. Expect: refusal with a conflict message (this is
  the double-booking proof in the browser).
- [ ] **F.6** Assign Daniel as driver, then reassign to a second
  driver. Expect: the assignment ledger shows the replaced row.
- [ ] **F.7** Submit completion as Olivia; approving it as Olivia is
  refused (separation of duties). Approve as **Oliver Ops-Two** with
  an approved extra charge. Request becomes Completed showing the
  outstanding figure.
- [ ] **F.8** As Fiona, open the completed request's Billing panel
  and choose **Create invoice from completion**. Expect: line items
  for the quoted amount and the approved charge, a "Taxes
  (configured lines)" row at 10%, a "Deposit already received"
  deduction, and Total · paid · outstanding figures. The create
  button is replaced by the invoice — no second invoice can be
  created for the rental. Issue it (the form requires a due date and
  an 8+ character reason). Record a part payment, then try **Void
  invoice**: refused ("This invoice has recorded payments and cannot
  be voided"). Record the balance → the status flips to PAID
  automatically; there is deliberately no "mark paid" button.
- [ ] **F.9** As **Kwame**: the portal home now lists the rental
  invoice and its balance (before payment) / zero after. Submit a
  cancellation for a different future confirmed rental before its
  start: the reservation is released and the slot can be re-booked.
- [ ] **F.10** Finance dashboard again: combined recognised revenue
  rose by the rental invoice total; **Revenue by stream** shows both
  lines reconciled; the ageing table places the rental invoice by
  its due date while it was unpaid. Reports → Financial shows the
  **Rentals** service line; Rentals → Reports shows real revenue,
  payments and outstanding matching the dashboard's rental stream.

## Part G — riders and audit (Phase 5C/6)

- [ ] **G.1** Admin → Settings: set the **booking creation cutoff**
  to close creation 24 hours before journey date. As Olivia, create
  a booking for tomorrow morning inside the cutoff → refused with
  the cutoff message; a booking further out succeeds.
- [ ] **G.2** Change the corporate rate for the contract (Part B) and
  generate a fresh-period invoice in a scratch flow: the new rate is
  used, and the change appears in Admin → Audit activity with its
  reason.
- [ ] **G.3** Admin → Audit activity: spot-check that invoice issues,
  payments, setting changes, quotation decisions, completion
  approvals and the rental transitions from Parts D–F each appear
  with actor and reason.
- [ ] **G.4** Account → Security: the two-factor enrolment screen is
  informational while 2FA is suspended (D-080); no step-up is forced
  anywhere in this walkthrough. Expect exactly that — if any screen
  demands a 2FA code, record it as a defect.

## Part H — Paystack sandbox live test (when test keys exist)

Separate session with the operator's **test-mode** keys; until then
this part stays open and the provider stays "Not configured".

- [ ] **H.1** Set `PAYSTACK_SECRET_KEY` (test) in the environment and
  restart the dev server. Finance → Provider payments banner shows
  the provider configured in test mode.
- [ ] **H.2** Initialise a small test payment (GH₵ 1.00) against an
  issued invoice; complete it with a Paystack test card. Expect: the
  webhook records the charge **once** (replay the webhook from the
  Paystack dashboard — still once), and the invoice balance falls.
- [ ] **H.3** Trigger a test refund. Expect: the refund event is
  recorded once and the finance dashboard reconciliation stays
  green throughout.

## Sign-off

| Part | Result (pass / defect list) | By | Date |
|---|---|---|---|
| 0–A Setup & fleet | | | |
| B Clients & contracts | | | |
| C Bookings & portals | | | |
| D Corporate invoicing | | | |
| E Finance depth | | | |
| F Rentals end to end | | | |
| G Riders & audit | | | |
| H Paystack live (deferred) | | | |

Drop the walkthrough database afterwards:
`podman compose exec -T db dropdb -U tms richie_tms_walkthrough`.
Findings from this pass belong in `docs/OPEN_QUESTIONS.md` (bugs) or a
new decision entry in `docs/DECISIONS.md` (behaviour changes).
