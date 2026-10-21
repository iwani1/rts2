# Open questions — management decisions required

No business defaults have been invented. Items marked **Phase 1A blocker** prevent dependent actions. The owner should answer and approve before the relevant feature is implemented.

## Business and hosting context (Phase 0 gate)
- Fleet count, categories, seats and ownership; driver count; current corporate clients and approximate staff numbers.
- Shift names/local start/end times; current operating process; role/user counts.
- Hosting provider/plan and confirmation of Node.js, PostgreSQL 15+, `btree_gist`, persistent jobs, WebSockets, backups, restore and storage support.
- Third-party-service budget; logo/brand colors/assets; existing-data files/formats.
- Website service descriptions and authorization/technical method for embedding rental enquiry.

## Explicit mandatory pricing and policy questions (Phase 1A blockers)
- Rental pricing basis and configured pricing models/line items; where operator-entered/verified distance comes from and which role records/verifies it. D-038 resolves arithmetic units/rounding; D-039 resolves only the requested-duration source and consistency rule.
- Deposit amount or percentage and payment requirement; D-037 exposes an explicit amount/percentage/no-deposit policy with a configurable due stage, but actual values, payment-evidence rules and refund treatment remain undecided.
- Quotation validity duration remains unset; D-034 provides a positive-whole-days setting form but no default. Quote extension authority and process remain unresolved.
- Cancellation windows, fees, refund rules and resource-release timing by request/booking state.
- Are drivers always included? When can customer request self-drive, if ever?
- Who approves quotations, discounts, tax lines, deposits and additional charges?
- VAT registration and accountant-confirmed VAT/levy lines and rates; is GRA e-VAT required?
- Payment methods currently accepted, including cash, bank transfer, MTN MoMo, Telecel Cash, AT Money; verification/reconciliation process.
- Vehicle categories and capacity definitions; driver licence/qualification requirements.
- Driver status/availability vocabulary and allowed transitions; which operational driver fields Dispatchers may see; account-to-driver identity verification/linking; personal-data field justification and retention.
- **Driver CSV identity/duplicate policy (MIG-01):** resolved by D-025. Show warning-only possible-name matches within the CSV and against existing company driver records. Names are not proof of identity; every valid row remains importable and is created separately after confirmation, with no automatic skip, merge, update, blocking, or deduplication. No stable identifier has been approved or added.
- **Resolved 2026-10-18:** initial vehicle-document types are limited to Insurance, Roadworthiness, and Vehicle Registration. Production file-storage provider/hosting remains unselected. Expiry reminder lead times, recipients and delivery channel; service intervals; and document/file retention period remain unresolved. No uploads, automatic reminders, or automatic deletion until those decisions are made.
- On-time threshold and exact pickup performance definition.
- Boarding-code policy, validity and single-use requirement.
- Are bookings allowed under expired or suspended contracts?
- Rental quotation approval separation, customer acceptance evidence, and invoice due/payment terms.
- **Pricing policies still require operator decisions:** actual named rental lines/rates; distance/time calculation and interaction with the selected basis; applicable taxes/levies and rates; deposits, discounts, rounding, and approval authority. D-035/D-036/D-037 only define empty-by-default typed configuration structures; no commercial values are inferred. Tax applicability, taxable base, exemptions, compounding, order, and rounding remain unapproved.

## Phase 1A authentication/authorization blockers
- **Resolved 2026-10-18:** owner approved the `PERMISSIONS.md` matrix. First Super Administrator will use the one-time audited local CLI bootstrap; public self-registration stays disabled.
- **Resolved 2026-10-18:** this installation has one `Company` tenant, Richie Transport Services. Separate corporate customers remain customer/client records, not tenants. A one-time audited local CLI provisions the company record; no settings or operational records are seeded.
- What account invitation delivery channel and expiry/revocation policy should be used? Email is not configured.
- Password-reset delivery channel, account recovery verification, session revocation policy and login-history retention require approval.

## Other required policies
- **Resolved 2026-10-19 (D-020):** customer register requires a customer/display name; reference is optional, staff-entered and company-unique when supplied; type and status are optional free text without defaults or preset values. Customer type/status vocabulary and reference-generation policy are therefore intentionally not configured. Customer record retention, data-subject handling and privacy/legal policy remain open.
- **Resolved 2026-10-19 (D-021/D-022/D-023):** staff rental enquiries start as Draft; submission is separate; Drafts may omit return time and duration but submission requires at least one, with duration entered in positive whole minutes; requests link to an existing customer. Submission requires customer, date, departure time, pickup, destination, positive passenger count, source, and return time or duration, and may be performed by Ops Managers or Super Administrators. Resolved by D-032: only Submitted → Under Review → Declined is active beyond submission; Ops Managers/Super Administrators require an audited reason. Quotation, confirmation, cancellation, assignment and dispatch transitions remain open and unimplemented.
- **RNT-03 availability/conflict prevention remains partly deferred (D-026–D-033):** Draft and Submitted do not reserve resources. A vehicle is reserved at `Confirmed` with a specific vehicle selected; a driver is reserved when specifically `Assigned` to a `Confirmed` booking. The future conflict interval is departure to return, or departure plus duration minutes, interpreted in `Africa/Accra`; incomplete intervals cannot commit resources. D-030 approves overnight requests only with an explicit return date (no next-day inference). Vehicle and driver buffers must be explicitly set separately, with zero only when explicitly confirmed. Resolved by D-031: separate non-negative whole-minute vehicle and driver buffers, no defaults, and commitment blocked while the relevant value is unset; release only on accepted pre-trip cancellation or recorded actual completion/vehicle return (driver assignment end), never by scheduled time alone. Values are intentionally unset until entered with an audit reason. D-033 clarifies that a configured buffer applies after the earlier-ending trip, exact boundary is allowed, and missing/invalid inputs fail closed. Reservation/confirmation/assignment/cancellation/completion/return/reassignment workflows remain unimplemented and their actors/preconditions remain unapproved.
- **Resolved 2026-10-19 (D-024):** CSV imports are all-or-nothing. Preview every row and show errors; write nothing until all rows are valid and the operator confirms the complete batch. Do not silently skip rows or merge/update existing records.
- Named approvers for financial approvals. Finance quotation approval remains gated on a specific delegated-approval policy.
- Vehicle status transitions: D-019 resolves the authority to apply safety blocks (Ops Managers, Fleet Managers, Super Administrators); Drivers/Technicians report defects and Dispatchers may view availability but cannot change status. D-016 approves the status names/safety boundary; D-018 approves immediate blocking, dispatcher resolution for future assignments without auto-cancellation/reassignment, incident/replacement workflow for an active trip, and Fleet Manager/authorized-releaser approval after work completion and an inspection record (no separate inspector role required). Transition-specific preconditions remain open, as do assignment active statuses, time buffers between jobs, and conflict horizon.
- Booking cutoff, duplicate-journey identity, capacity/waitlist and no-show rules.
- Exact shift/route recurrence and local-time behavior. Contract lifecycle mechanics are resolved by D-049 (transition table, approval dates, suspension, renewal with a new end date); who the named contract approvers are, whether approval needs a person other than the preparer, and termination approval authority remain open.
- Corporate billing frequency and payment terms; chargeable trip definition and duplicate-billing event key.
- Invoice numbering, credit note/adjustment and accounting periods.
- Incident severity/escalation, retention and passenger notification rules.
- Data subject request contact, lawful bases, retention schedule by record class, DPC registration status and privacy owner.
- Production notification providers, maps/GPS hardware, SMS/e-mail/payment credentials and verification test arrangements.

Until resolved, settings remain unset and dependent actions must be blocked with clear explanation.

## Phase 1B settings registry gap (found 2026-10-21, FIN-02)
- `bookings.creation_cutoff` (D-056) and `finance.corporate_rates` (D-058) are validated in
  `src/modules/settings/registry.ts` but are NOT rows in `settingRegistry`, so `setCompanySetting`
  rejects them and the settings UI cannot configure them until the owner approves the registry rows
  (labels, categories, blocked-feature references). Until then, rate/cut-off configuration is a
  database-level operation for the implementation team; invoice generation and booking creation
  fail closed (unset = no rate / no cut-off) by design.

## Sandbox persistence incident (2026-10-21)
- During the FIN-02 turn the local checkout's git metadata was reset: `.git` history and index were lost
  (only base commit `43dd4c1` remained tracked) while working-tree file contents survived. The pushed
  remote branch `arena/8922811c-rts2` still held the full history through `aae103e`, so the local branch
  was reset onto `origin/arena/8922811c-rts2` and the FIN-02 change was re-committed as a clean 14-file
  diff (`6bb733f`). No remote history was rewritten and no pushed work was lost. If this recurs: do not
  force-push; recover by resetting onto the fetched remote tip and re-staging only the intended paths.

## Prisma schema defects found by Fedora verification (2026-10-21)
- Fedora run 1 failed at `prisma generate` (P1012): duplicate `userClientBindings` on `Company` — fixed in `1b463bc`.
- Fedora run 2 failed at `prisma generate` (P1012 x4): unpairable back-relations from the same late-session
  schema passes — `Company.corporateInvoiceLines` (CorporateInvoiceLine has no company relation field),
  `Vehicle.driverEvents` and `Vehicle.invoiceLines` (wrong model; belonged nowhere/Vehicle), and a missing
  `Client.corporateInvoices` back-relation for `CorporateInvoice.client`. Fixed in the follow-up commit;
  a full duplicate/pairing audit of the schema was run in-sandbox and is clean. Lesson recorded: sandbox
  schema edits must always pair-check relations because `prisma` cannot run it locally.

## Typecheck fixed patterns (Fedora run 3, 2026-10-21)
- The Phase 1B typecheck pass surfaced that code written after the sandbox git-metadata incident used
  imagined helpers (`@/modules/auth/api` `requireApiSession`, `@/modules/auth/auth`) and Prisma shapes
  copied from the summary instead of the real repo (Location `type`/`clientId`, Route `transportMode`,
  RouteSchedule `name`). All are fixed to the real patterns: API routes use `getAuth().api.getSession`
  + `NextResponse` exactly like the bookings routes; pages use `getAuth`/`next/headers`; fixtures use the
  real model fields; Zod request schemas compose refined field schemas with `.and(z.object({ reason }))`;
  the two pending settings keys are annotated through `SettingKey` with the registry-row gap unchanged
  (owner approval still required).

## Typecheck fixed pattern (Fedora run 4, 2026-10-21)
- Prisma include/select args passed via shared constants infer `'asc'`/`'desc'` as `string`, not the
  `SortOrder` literal. The working convention (used by pre-existing modules) keeps shared include objects
  un-`as const` and adds per-property `'asc' as const` only where Prisma needs the literal union — applied
  to `CorporateInvoiceInclude.lines.orderBy` in `src/modules/finance/invoices.ts`.

## Typecheck fixed patterns (continued, Fedora run 5, 2026-10-21)
- Zod: refined field schemas composed with `.and(z.object({ reason }))` must not carry `.strict()`
  (strict rejects the other side's keys); strictness lives on the `InputSchema` and the reason side instead.
- Tests must mirror service-level queries added to pages (home page HR-binding probe added `findUserRoleAssignment` mock).

- Refinement: `.strict()` belongs on the underlying `ZodObject` *before* `superRefine`; `ZodEffects`
  has no `.strict()` (TS2339 on Fedora run 6). Final shape: object `.strict().superRefine(...)` fields
  schema, `.and(z.object({ reason }).strict())` for the request schema.
- Final Zod composition: Zod intersections (`.and()`) cannot carry `.strict()` per side — each side
  validates the whole input, so strict rejects the other side's keys (Fedora run at `4820983`). The
  convention now: one strict object for the fields, a shared `superRefine` function, and
  `.extend({ reason }).strict().superRefine(refine)` for the audited request schema
  (contracts, locations, routes).

## Integration fixture corrections (Fedora run at `c2beb76`, 2026-10-21)
- Vehicle check constraint `Vehicle_registration_normalized` requires `upper(trim(reg)) = reg`;
  fixtures now uppercase the random plate suffix (`FLOW-`/`DRV-`/`INV-`/`GR-`/`TRP-`/`DSP-` + 8 hex chars).
- Role grants (seeded): `OPS_MANAGER` holds `client:manage`/`booking:manage`/`route:manage`/`trip:dispatch`
  at COMPANY scope; `DISPATCHER` holds `booking:manage`/`trip:dispatch` only. The dispatch fixture user
  now carries both roles — contracts cannot be created by a Dispatcher-only account, by design.
- First green milestones in that run: generate, 21/21 migrations, typecheck, lint (0 errors),
  **unit suite 373/373**, and 88 integration tests passing; remaining failures were the two fixture
  issues above.

## Permission/conflict semantics fixed (Fedora run at `3cd0c32`, 2026-10-21)
- `resolvePermission` only grants assigned-limited scopes (`OWN_TRIP_EVENTS`, `ASSIGNED_*`, ...)
  when `assignedUserId` equals the actor. No production caller passed it, so the driver interface
  denied every driver. `driverContext` now passes `assignedUserId: actorId` — drivers act only on
  trips assigned to themselves, and the service additionally constrains every query by the linked
  `Driver.id`, so self-assignment stays least-privilege. Verified pattern matches
  `authorization.integration.test.ts`.
- Dispatch assignment gating: `assignTripResources` evaluated conflicts over the trip's *resulting*
  resources, so changing only the vehicle was blocked by a pre-existing same-day driver conflict.
  The call now diffs against the conflicts of the untouched assignment and only blocks on conflicts
  the change introduces; pre-existing conflicts still surface as board warnings.

## Two more semantics corrections (Fedora run at `0500fcc`, 2026-10-21)
- Nested Prisma creates through a composite relation must not repeat the relation's fields:
  `CorporateInvoiceLine.companyId` is inherited from the invoice relation (`[companyId, invoiceId]`),
  so the nested `lines.create` payload must omit it (`PrismaClientValidationError: Unknown argument
  companyId`). Header fields on `CorporateInvoice.create` itself are fine.
- `assignTripResources` now returns `warnings: introduced` (the conflicts the change introduced and
  the dispatcher accepted), while the audit event keeps the full conflict snapshot. The board
  continues to evaluate the trip's current resources, so pre-existing conflicts remain visible there.

## Phase 1B automated verification PASSED (Fedora, 2026-10-21, commit `3e32798`)
- `./scripts/verify-phase1b.sh` 7/7 green on fresh `richie_tms_p1b_20261021011206_test`: generate,
  21/21 migrations, typecheck, lint 0 errors, unit **373/373**, integration **105/105**.
  Remaining before the Phase 1B gate can close: owners E2E run (§3 of
  `docs/PHASE_1B_VERIFICATION.md`) and the four gate decisions (D-059, two settings-registry rows,
  DRV-03/DRV-05, DRAFT-only invoice lifecycle).

## Phase 1B gate decisions APPROVED (owner, 2026-10-21) — recorded as D-060
- D-059 ratified as built (UserClientBinding); both settings-registry rows approved and now registered
  in `settingRegistry` (`bookings.creation_cutoff`, `finance.corporate_rates`; the `as SettingKey`
  casts are removed); DRV-03/DRV-05 formally descoped for Phase 1B; DRAFT-only invoice lifecycle
  confirmed. Slice statuses flipped to Tested in `docs/PROGRESS.md`. Remaining before gate closure:
  the owner-run E2E pass on a separate fresh `richie_tms_e2e_phase1b_test` database.

## Registry-row insertion correction (Fedora run at `b51778c`, 2026-10-21)
- The gate commit removed the `as SettingKey` casts but the companion edit inserting the two approved
  rows into `settingRegistry` itself was absent from that commit's diff (only the 2 constant lines
  changed), so typecheck regressed with TS2322 at `registry.ts:44-45` — the exact signal that step is
  meant to catch. The rows (`bookings.creation_cutoff` → category `bookings`, BKG-05;
  `finance.corporate_rates` → category `finance`, FIN-02) are now inserted; the D-060 ratification is
  otherwise unchanged. Lesson: verify scripted multi-part edits against the final `git diff --stat`
  before committing, not just per-edit success messages.
- The E2E attempts in the same session did not reach the app: the E2E database password in
  `TEST_DATABASE_URL` was not the local `tms` password (28P01 auth failure at migrate/bootstrap), so
  the E2E admin was never created, and the literal placeholder `AUTH_SECRET` (30 chars) also fails the
  32+ character gate. No secrets are recorded here or needed in chat: the correct password is the one
  in the repo's local `.env` used by `podman compose` (the same one `verify-phase1b.sh` derives).
- Owner note (2026-10-21): an E2E-admin password was pasted into chat during the failed E2E setup.
  Treat it as exposed; rotate it anywhere it is reused. E2E admin passwords should be throwaway values
  typed only into the local shell, never shared in chat.

## Registry-row completion + sandbox git incident #2 (2026-10-21)
- The corporate_rates row was still missing after `3f18ed9`: two edit calls against the same file in
  one batch raced, and the bookings-row write won. Fixed with a single edit verified against
  `git diff` before commit. Rule going forward: one edit per file per batch, always diff-verified.
- Sandbox git metadata was wiped again (HEAD reset to base `43dd4c1`, index empty, all files
  untracked; working tree intact). Recovered per the FIN-02 procedure: fetch, `git reset
  origin/arena/8922811c-rts2`, confirm the diff is exactly the intended one-line registry change,
  commit, normal (non-force) push. Remote history was never at risk.
- E2E status: bootstraps now succeed (one Super Admin + Richie Transport Services in
  `richie_tms_e2e_phase1b_test`); all 4 specs failed at sign-in because the shell exports still
  contained the literal `<...>` placeholder email/password. Re-running needs only the real
  `TMS_E2E_EMAIL`/`TMS_E2E_PASSWORD` exports against the existing database — no re-bootstrap.

## E2E safety-blocks spec defect (Fedora, 2026-10-21, HEAD `d540c68`)
- Verify script 7/7 green at the gate commit; E2E 3/4. `vehicle-safety-blocks.spec.ts` fills
  work-completed via a host-local `localDateTime(new Date())` (minute-truncated; host ~1h behind
  Africa/Accra), while the UI interprets the value as Africa/Accra wall time (`step="0.001"` input).
  The instant lands before `appliedAt` (1:44 am UTC) and the release is correctly refused
  ("Work completion must be recorded after the safety block was applied" — visible in row text).
  The git-conflicting timezone guidance above (commit `d70e5aa`, "Interpret E2E work-completed time in
  Accra timezone") made the spec host-TZ-dependent, and it regressed further when run an hour later.
  Fix: spec helper emits Africa/Accra wall time with seconds; replace the no-op
  `expect(page).toHaveURL('/fleet/maintenance')` (returns Promise, never awaited) with
  `await page.waitForURL('**/fleet/maintenance')`. No service change. Phase 1A verified only 3 of
  its then-3 specs, so this was likely never a real pass.
- Tooling note (same session): heredoc-written `/tmp` scripts intermittently vanished in this sandbox
  (files absent on the next call). Prefer `edit_file` for surgical changes and verify every change with
  `git diff` before committing — a silent no-op edit batch was caught this way twice.

## Credential hygiene (owner acknowledgement, 2026-10-21)
- The owner confirms the exposed E2E password is not reused elsewhere and is discarded. No production
  credentials have been shared. Keep it that way: E2E/admin passwords only ever typed into the local
  shell; paste only command output that contains no secrets.

## Phase 1B gate evidence COMPLETE (Fedora, 2026-10-21)
- Verify script 7/7 green at gate commit `d540c68` (`richie_tms_p1b_20261021014258_test`): generate,
  21/21 migrations, typecheck, lint 0 errors, unit **373/373**, integration **105/105**.
- E2E **4/4** on the fresh `richie_tms_e2e_phase1b_test` database (after the `44a7e93` spec fix).
- D-060 gate decisions recorded (D-059 ratified; both settings rows registered; DRV-03/DRV-05
  descoped; DRAFT-only invoice lifecycle confirmed). Remaining: owner's formal declaration that the
  Phase 1B gate is closed; no Phase 1C work before it.

## Phase 1B GATE CLOSED (owner declaration, 2026-10-21)
- The owner formally declared the Phase 1B gate closed after verify 7/7, integration 105/105,
  unit 373/373, and E2E 4/4, with the D-060 ratifications recorded. Phase 1C planning may begin;
  Phase 1C construction requires the owner's separate go-ahead. Descoped items (DRV-03/DRV-05,
  invoice issuance/payment/void lifecycle) require their own decisions first.

## Phase 1C kickoff — invoice lifecycle and payments built; ratification and next slices (2026-10-21)

The owner authorized Phase 1C construction on 2026-10-21 ("go ahead start building phase 1c
completely after i will run"). The first slice (corporate invoice lifecycle + manual payments,
D-061/D-062 in docs/DECISIONS.md) is built and sandbox-verified; see the Phase 1C section of
docs/PROGRESS.md and docs/PHASE_1C_VERIFICATION.md. For ratification at the Phase 1C gate:

- D-061 models part-payment as a derived balance, not a "Partially Paid" status, and has no
  Pending Approval or Overdue status (the aspirational rows in docs/STATE_MACHINES.md predate
  it). Confirm this is acceptable, or ask for an approval step / overdue job.
- D-062 keeps payments minimal (amount, method, reference, date, reason) without the
  verification/reconciliation statuses sketched for FIN-03 in the standing brief; reconciliation
  is FIN-08 (Phase 3). Corrections to a recorded payment are not supported (append-only);
  confirm a future adjustment/credit-note process is the right vehicle.
- A dedicated editor for `finance.corporate_rates` (and `bookings.creation_cutoff`) is still
  outstanding; rates are currently written through the settings service only.
- Phase 2 opened 2026-10-21 by owner direction (D-068) while the Phase 1C gate items
  below remain outstanding in parallel.
- Remaining Phase 1C scope per richie-tms-phase-prompts.md: the hardening pass, then the
  Phase 1C gate (the MVP gate; Phase 2 must not start until it is approved).
  FIN-07 (D-063), RPT-02/RPT-03/RPT-04 (D-064), PAX-01 (D-065), RNT-09 (D-066) and the
  operations dashboard (D-067) are built.
- D-065/D-066 need gate ratification: passengers self-cancel only before trip assignment with
  one immutable feedback record per completed journey; rental customers may withdraw only
  Draft/Submitted requests, and no quotation acceptance exists until formal issuance lands.
  Confirm, or ask for changes.
- D-064 needs gate ratification and two policy inputs: the on-time pickup threshold in minutes
  (until set, RPT-02 publishes delay averages and coverage but no on-time rate), and whether the
  RPT-03 "revenue by service" grouping by contract service type matches management's service
  taxonomy (it is currently the free-text contract field).
- D-063 (FIN-07) needs gate ratification: margin stays hidden until attributable cost records
  exist (FIN-05, Phase 3) — confirm no estimated margin should ever be displayed; invoices carry
  no due dates, so outstanding is grouped by client, not aged — confirm whether invoice due dates
  (and ageing buckets) should be added in a later phase.
