# Decision sign-off — D-061 to D-077 (Phases 1C + 2)
**✅ RATIFIED 2026-10-21** — all rows approved; policy values per D-078 (threshold 10 min, free-text revenue grouping, due dates later, 2FA limitation accepted). Recorded as D-078 in `docs/DECISIONS.md`.
**Owner approval in one pass.** Tick each row, fill in the two policy values, sign at the bottom. Full texts: `docs/DECISIONS.md`.

## A. Ratify as built (tick ✓ = approved, ✗ = send back with note)
| # | Decision, in plain terms | ✓/✗ |
|---|---|---|
| D-061 | Invoice lifecycle `DRAFT → ISSUED → PAID`, `VOID` from DRAFT/ISSUED; amounts never change after generation; voiding frees the trips/period for re-billing; there is **no "Partially Paid" status** — part-paid is just the unpaid balance. | ☐ |
| D-062 | Payments are simple append-only records (amount, method, reference, date, reason); overpayment refused; paid-in-full flips to PAID automatically; recorded payments **cannot be edited or deleted** — a mistake is fixed later by an adjustment/credit-note process, not by rewriting history. | ☐ |
| D-065 | Passengers can cancel their own journey only before it is assigned to a trip; after that it's an operations decision. One feedback record per completed journey; it cannot be edited or deleted. | ☐ |
| D-066 | Rental customers can withdraw only Draft/Submitted requests; from "Under Review" onward staff control it. Customers see honest "no quotation issued / no payment due" — **no quotation acceptance exists until formal quotations land in a later phase.** | ☐ |
| D-067 | Operations dashboard `/operations` is a point-in-time picture (today's trips, queues, safety blocks, documents expiring ≤30 days) — read-only, no estimated KPIs. | ☐ |
| D-068 | Notification service: in-app notifications first, one per recipient, no duplicate alerts for the same event, never notify a user about their own action; on/off switches per user (in-app enforced now). Template wording is code-managed, not yet editable in Settings. | ☐ |
| D-069 | SMS via Arkesel adapter, active only when credentials are set in the server config — otherwise the app says "Not configured" and claims nothing sent. `SENT` = accepted by provider; `DELIVERED` only on the provider's delivery confirmation. Sends happen via an explicit dispatch action (no background worker). | ☐ |
| D-070 | Email via SMTP, same "Not configured" honesty; success means "handed to the mail server" (`SENT`) — never claimed delivered. | ☐ |
| D-071 | Incidents use one governed lifecycle (`Open → Acknowledged → In Progress → Resolved → Closed`); resolving requires resolution notes; Closed is final. Reportable by drivers (own active trips) and dispatchers; severity + type recorded; `peopleAffected` visible only to incident managers. Dispatchers are alerted automatically. | ☐ |
| D-072 | On a breakdown, dispatchers pick a replacement vehicle/driver from suggestions (blocked/archived/licence-expired are refused); choosing one that conflicts with another trip or lacks seats needs an explicit override **with a reason**, and the swap is fully audited. Optional: block the broken vehicle + open a work order in the same step. Passengers are notified. | ☐ |
| D-073 | Boarding codes: 6-digit, single-use, expire end of trip day, passenger sees only their own code, driver list never shows codes. **Default posture: codes OFF (tap-to-board) until you switch `trips.boarding_code_policy` to REQUIRED in Settings.** Under REQUIRED, manual boarding needs a written reason (≥8 chars) and every attempt is logged. | ☐ |
| D-074 | Driver offline queue covers exactly the 8 trip events (start/board/no-show/etc.); everything else needs connectivity. Queued events replay in order; server conflicts are shown to the driver, never silently dropped. No offline page loading yet (pages need one successful load). | ☐ |
| D-075 | Service reminders are computed (date and/or km), states OK / DUE_SOON (≤14 days or ≤500 km) / OVERDUE. **A passed date never marks a service done** — only a recorded, audited service moves the baseline. "Notify fleet team" button; no scheduler is implied. | ☐ |
| D-076 | 2FA (authenticator app + one-time backup codes) is **required only for global Super Administrators**; optional for everyone else. *Known limitation:* enforcement is at sign-in/workspace entry — deep-linking around the prompt isn't hard-blocked yet (recorded; full middleware block is a follow-up). Accepting this limitation for now? ☐ Yes ☐ No | ☐ |
| D-077 | GPS: **Not configured** until a provider secret is set — no invented positions, ever. Reports accepted only while the vehicle is on an active trip. Live = ≤5 min old; simulated data is always labelled. History restricted to fleet/trip managers, append-only, **retained 90 days**, purge is manual. Drivers see the tracking consent notice. | ☐ |

## B. Two policy values (Phase 1C gate, D-063/D-064)
1. **On-time pickup threshold:** until set, reports show average pickup delay but **no on-time rate**. Set it now? ______ minutes (e.g. 10) — or ☐ leave unset for now.
2. **"Revenue by service" grouping** currently uses the contract's free-text service type: ☐ keep — or ☐ define a fixed list: ____________. Invoices currently carry **no due dates**, so outstanding is grouped by client, not aged: ☐ OK — or ☐ add due dates + ageing in the next phase.

## Signature
Approved by (name/role): ______________________  Signature: ______________________  Date: ____________

*Note: signing ratifies the decisions above. It does not by itself close the gates — still outstanding: Fedora `./scripts/verify-phase1c.sh`, the Phase 1C/2 manual checklists (`docs/PHASE_1C_VERIFICATION.md`, `docs/PHASE_2_VERIFICATION.md`), and setting the two values in Section B. Phase 2 automated verification already passed (170/170 integration, `a438d89`).*
