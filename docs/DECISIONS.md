# Decision log

## D-001 — Honor Phase 0 boundary
- **Decision:** Perform discovery, documentation and foundation only; no operational feature code.
- **Reason:** phase prompt explicitly says Phase 0 only and stop for approval; no business context values are filled.
- **Alternatives rejected:** implement sample dashboard or seeded operational records (would misrepresent features/data).

## D-002 — Stack baseline
- **Decision:** Next.js App Router, React, TypeScript strict, Prisma/PostgreSQL, Zod, Vitest, npm.
- **Reason:** matches standing brief defaults; npm is selected as the single package manager because Node/npm are available and repository had no lockfile.
- **Alternatives rejected:** replacing the specified stack absent hosting evidence.

## D-003 — Authentication choice deferred
- **Decision:** Do not select or implement an auth library in Phase 0; record as a blocking decision for Phase 1A. Evaluate maintained Auth.js vs Better Auth against the chosen hosting and supported account/invitation/reset requirements.
- **Reason:** no hosting target or user-management needs beyond brief; avoid premature dependency/security choice.

## D-004 — Job runner conditional
- **Decision:** Target pg-boss only if hosting supports a persistent Node worker; otherwise documented scheduled endpoints with limitations.
- **Reason:** target platform is unspecified.

## D-005 — Empty baseline migration and extension
- **Decision:** Baseline SQL enables `btree_gist`; no domain tables yet. Local Compose initializes PostgreSQL 16.
- **Reason:** required for later exclusion constraints; real schema belongs to approved feature phases.

## D-006 — Docker Compose included but unverified locally
- **Decision:** Supply PostgreSQL Compose configuration, but do not claim it runs in this sandbox.
- **Reason:** Docker executable is absent here. Hosting compatibility remains unknown.

## D-008 — Authentication library
- **Decision:** Select Better Auth (database-backed sessions and maintained email/password authentication) with its Prisma adapter, PostgreSQL driver adapter, database-backed rate limiting, password sign-up disabled, and eight-hour sessions.
- **Reason:** Supports the brief's invitation-only user lifecycle and server-side database sessions without hand-rolled password/session code; credentials do not require an unconfigured email provider for initial login.
- **Alternatives rejected:** Auth.js Credentials would require custom credential verification/password hashing; email-link provider would require unconfigured email service.
- **Limits at selection time:** invitations, password reset, role mapping, user-management UI, MFA and full service-layer authorization were not implemented. Public sign-up remains disabled. First-admin provisioning was later selected and implemented as the one-time audited local CLI described in D-013.

## D-009 — Start AUTH-01 foundation
- **Decision:** Add the Better Auth configuration, API handler, login UI, Prisma schema/migration and tests; keep AUTH-01 In Progress until the remaining UI E2E, initial-admin process and deployment migration path are verified.
- **Reason:** Phase 1A is authorized. The environment initially lacked a database and the native Prisma binaries; a real PostgreSQL 15.18 test cluster was later booted from an untracked npm package, and Prisma Client generation was achieved with its JS schema engine.

## D-011 — Prisma binary and migration workaround (historical; superseded)
- **Historical experiment:** Prisma Client `engineType = "client"`, `@prisma/adapter-pg`, and a conditional JS schema engine allowed generation and validation without Rust query-engine binaries. JS `migrate deploy` errored on PostgreSQL's system-catalog `name` type.
- **Current status:** Superseded by D-012 after the owner explicitly requested removal of `engineType`; do not restore it. The standard Prisma native migration engine remains the deployment path.
- **Verification limit:** This sandbox cannot fetch Prisma native binaries from `binaries.prisma.sh`. Clean Prisma Client generation and native `migrate deploy` must pass in CI or a normal network-enabled environment before acceptance.

## D-012 — Remove Prisma engineType and use the standard Prisma engine
- **Decision:** Honor the explicit request to remove `engineType` from `prisma/schema.prisma`. Remove the custom JS/classic engine toggle and PostgreSQL driver adapter; Prisma Client and deployments use Prisma's standard engine and the schema's `DATABASE_URL`. CI generates the client and deploys migrations.
- **Reason:** The prior engine-less client was an implementation workaround that contradicted the owner's explicit configuration request. A normal engine is preferable to preserving a nonstandard runtime dependency.
- **Verification limit:** After removal, `prisma generate` attempted to retrieve `libquery_engine` from `binaries.prisma.sh` and failed due sandbox TLS/network access. Current workspace-generated client artifacts came from the earlier configuration and are not evidence of a clean standard-engine generation. CI must validate generation, typing, tests, build, and migration deployment before this is accepted.

## D-013 — First Super Administrator bootstrap
- **Decision:** Use a one-time interactive local CLI. It requires an explicit confirmation flag, a real TTY so password input is hidden, and no existing active Super Administrator. A transaction-scoped PostgreSQL advisory lock makes concurrent bootstrap attempts serialize; user, credential, global role assignment and audit event are created together. Public self-registration stays disabled.
- **Reason:** This is a narrow operator-controlled bootstrap path, not a public or reusable account-creation endpoint. The first-admin method was selected explicitly because the owner approved the permission matrix but did not name a bootstrap mechanism.
- **Limits:** CLI has a non-TTY refusal smoke check but has not been run end-to-end against a clean database in this restricted sandbox. Continue to verify its first-use and repeat-run behavior in a production-like environment.

## D-014 — Single operator-company tenant
- **Decision:** This installation has one `Company` tenant named Richie Transport Services. Corporate customers remain domain records, not separate system tenants. A one-time local CLI creates the company row only after an active global Super Administrator exists.
- **Source:** Owner selected “One operator company” on 2026-10-18.
- **Limits:** Company identity does not create settings, fleet, customer, pricing or other operational records; policy values remain unset until explicitly supplied.

## D-015 — Opt-in local demo vehicle fixture
- **Decision:** Provide an explicit, idempotent development-only CLI to insert one unmistakably synthetic vehicle record for UI testing. Do not seed it on app startup, during migrations, or in production.
- **Safety:** Requires `NODE_ENV=development`, `--confirm-demo`, local `APP_URL` and database host, a non-production database name, and exactly one active company. It refuses to overwrite a non-demo record with the reserved demo registration and writes an audit event.
- **Source:** Owner requested synthetic demo vehicle details for local testing on 2026-10-18; the production-seed prohibition remains binding.

## D-010 — npm peer resolution
- **Decision:** Set npm `legacy-peer-deps=true` to make `npm ci` reproducible while Better Auth's optional peer dependency metadata conflicts with this app's installed Vite/Vitest toolchain.
- **Risk:** Peer compatibility is not validated by npm; audit and peer compatibility must be reviewed before production.

## D-007 — Dependency audit findings deferred to explicit upgrade review
- **Decision:** Keep the compatible Next.js 15 / ESLint 9 / Vitest 3 baseline for this foundation rather than applying automatic major upgrades during Phase 0.
- **Evidence:** `npm audit` reports 13 vulnerabilities in the resolved dependency tree (2 moderate, 9 high, 2 critical), with recommended fixes including major upgrades (Next 16 and Vitest 5; eslint-config-next major downgrade suggestion). This is not acceptable for production; resolve and rerun audit before any production release, and assess migration compatibility rather than using `--force` blindly.

## D-016 — Vehicle status vocabulary and safe implementation boundary
- **Decision:** Use only the seven vehicle status names in the brief: Available, Reserved, Assigned, On Trip, Under Maintenance, Out of Service, and Pending Inspection. Do not add `Retired`. Do not assign a default vehicle status or expose manual status editing in the current register.
- **Derivation and safety:** Reserved, Assigned, and On Trip should be derived from authoritative reservation/assignment/trip records rather than independently edited status choices. Under Maintenance, Out of Service, and Pending Inspection are safety-blocking; assignment must be prevented, and a vehicle must not return to Available until the required maintenance and inspection workflow is complete.
- **Source:** Owner approved the recommended direction on 2026-10-18.
- **Limits:** FLT-02 remains unimplemented. D-018 and D-019 record safety-block conflict handling, release authority, and entry actors; transition-by-transition preconditions remain open. No status value is added to existing or new vehicle records by this decision.

## D-017 — Vehicle document upload and expiry policy boundary
- **Decision:** Defer photo/document file uploads until the hosting and production storage provider are selected. For the initial vehicle-document scope, support only Insurance, Roadworthiness, and Vehicle Registration document types. Keep current date fields manually entered/viewed; do not send automatic expiry reminders or automatically delete uploaded files until reminder and retention rules are approved.
- **Reason:** Production file storage is not selected, and reminder recipients, channels, lead times, and retention periods are not defined. Local disk is not approved as production storage.
- **Source:** Owner approved this recommendation on 2026-10-18.
- **Limits:** This decision adds no file-upload feature, storage provider, notification, retention period, or new operational data. Existing vehicle expiry-date fields remain as implemented; service/maintenance records remain separate and are not added to the document-type list by implication.

## D-018 — Vehicle safety-block conflicts and release authority
- **Decision:** Apply a safety block immediately and prevent new assignments. Flag future assignments for dispatcher resolution; do not silently cancel or reassign them. An already active trip follows the incident/replacement workflow. A Fleet Manager/authorized releaser may return the vehicle to Available after work completion and an inspection record; a separate inspector role is not required.
- **Source:** Owner selected the recommended options on 2026-10-18.
- **Limits:** D-019 specifies who may apply safety blocks. D-045 implements only block application and release with recorded work completion/inspection. Reservation-derived states, assignment prevention/conflict resolution, active-trip incident/replacement workflows, and work-order linkage remain unimplemented; do not claim assignment safety protection is active.

## D-019 — Actors allowed to apply vehicle safety blocks
- **Decision:** Ops Managers, Fleet Managers, and Super Administrators may apply Under Maintenance, Out of Service, and Pending Inspection safety blocks. Drivers and Technicians may report defects but may not set or clear these vehicle statuses; Dispatchers may view availability but may not change status.
- **Source:** Owner selected the recommended role boundary on 2026-10-18, consistent with the approved permission matrix.
- **Limits:** This defines who may apply safety blocks, not each transition's preconditions. FLT-02 status controls remain unimplemented; reasons, linked work/defect records, transition-specific checks and any active assignment workflows still need implementation and tests.

## D-020 — Customer register identity and undefined-value handling
- **Decision:** Require a customer/display name for an individual or organisation. The reference is optional, entered by staff, and unique within the company when supplied; no reference format or automatic sequence is introduced. Customer type and status remain optional free text with no preset values or defaults. The register includes the brief-listed contact person, telephone, email, billing details, notes, and audit history.
- **Source:** Owner approved the recommended scope on 2026-10-19.
- **Limits:** This establishes register fields only, not customer-status transitions, type vocabularies, billing rules, retention, or privacy/legal policy. Dispatcher enquiry, Finance billing, and rental-customer own-profile projections remain fail-closed until field-level scopes are implemented. Customer-to-rental workflows are separate and not implemented by this decision.

## D-021 — Staff rental enquiry draft entry
- **Decision:** A staff-entered phone/email rental enquiry is first saved as `Draft`; submission is a separate action. A Draft may omit both return time and duration, but submission requires at least one. Link a request to an existing customer-register record; staff create the customer record first. No rental-request status transitions beyond initial Draft creation are approved by this decision.
- **Source:** Owner selected the recommended entry model on 2026-10-19.
- **Limits:** D-023 separately approves the required fields and actors for Draft → Submitted. Other transition-specific preconditions and the remaining RNT-02 from-to matrix remain open. No quotation, availability, resource reservation, confirmation, cancellation, or dispatch behavior is included by this decision.

## D-022 — Rental-request duration unit
- **Decision:** When staff records a trip duration, use a positive whole-number count of minutes. Drafts may leave duration unset; the D-021 submission precondition remains return time or duration.
- **Source:** Owner selected integer minutes on 2026-10-19.
- **Limits:** D-023 separately specifies submission preconditions. This unit decision does not approve availability, travel-time, or booking calculations.

## D-023 — Rental-request Draft submission preconditions and authority
- **Decision:** To submit a Draft, require the existing customer link, service date, departure time, pickup location, destination, positive passenger count, request source, and either return time or duration in whole minutes. Intermediate stops, luggage/special needs, purpose, requested vehicle type, driver requirement, trip contact, and notes remain optional. Only Ops Managers and Super Administrators may submit staff-entered Drafts; Dispatchers remain excluded until enquiry-context ownership and field projections are implemented.
- **Source:** Owner selected the recommended required-field and actor boundary on 2026-10-19.
- **Limits:** This approves only `Draft → Submitted`. No further transition, review, quote, availability, reservation, confirmation, dispatch, cancellation, or notification workflow is approved or implemented by this decision.

## D-024 — CSV import batch atomicity
- **Decision:** CSV imports are all-or-nothing. The system previews all rows and reports validation errors by row; it writes no records while any row is invalid. After correction and a clean preview, the operator explicitly confirms the complete batch. No row is silently skipped, and no automatic merge/update is performed.
- **Source:** Owner selected the recommended option on 2026-10-19.
- **Reason:** Prevent partially imported customer/fleet master data and ambiguous retries while preserving row-level correction details.
- **Limits:** This determines batch commit behavior only. It does not approve field defaults, generated identifiers, duplicate merging, overwriting existing records, or any unapproved customer/vehicle/driver policies.


## D-025 — Warning-only possible duplicate names in driver imports
- **Decision:** Driver CSV preview warns when a name matches another row in the same CSV or an existing company driver record. These are advisory possible matches only; names do not prove identity. After operator confirmation, every valid row is imported as a separate new record. Do not automatically skip, merge, update, block, or deduplicate any row based on a name match.
- **Source:** Owner approved this policy on 2026-10-19.
- **Limits:** This adds no unique driver identifier, identity verification, merge/update pathway, or broader duplicate policy for other record types. Matching is case-insensitive and ignores leading, trailing, and repeated whitespace; all warnings remain non-blocking and do not change `canImport` or all-or-nothing validation of genuinely invalid rows.

## D-026 — Defer RNT-03 until availability rules are approved
- **Decision:** Do not implement rental availability or resource-conflict prevention until the owner defines which request/reservation/assignment states reserve vehicles and drivers, the applicable conflict horizon, and any between-job buffer. D-023 remains limited to Draft → Submitted; do not infer that Draft or Submitted reserves resources.
- **Source:** Owner approved this recommendation on 2026-10-19.
- **Reason:** An assumed rule could produce false availability, unnecessarily block a resource, or permit a double-booking.
- **Limits:** This defers RNT-03 behavior only. It does not define the future reservation lifecycle or conflict policy and approves no later rental-request transition.

## D-027 — Initial rental resource conflict interval boundary
- **Decision:** Draft and Submitted rental requests do not reserve vehicles or drivers. For a future explicitly reserving state, the proposed conflict interval is scheduled departure through scheduled return; when only duration is supplied, calculate the interval end as departure plus the approved whole-minute duration. Interpret date/time in `Africa/Accra`. Do not commit a resource when the interval is incomplete. Do not assume a between-job buffer; keep resource commitment unavailable until management explicitly confirms no buffer or defines one.
- **Source:** Owner approved these recommendations on 2026-10-19.
- **Reason:** A trip interval is narrower than blocking an entire service date, duration already has an approved minute unit, and an invented buffer or reservation transition could cause false availability or unnecessary blocking.
- **Limits:** This approves no later request transition and does not activate availability/conflict prevention. D-029/D-030 later resolve reservation triggers and overnight date handling; explicit buffer decisions and resource-release rules remain required before RNT-03 resource commitment can be implemented. D-026 remains in force for those unresolved parts.

## D-028 — Approved handling for unresolved RNT-03 reservation details
- **Decision:** Do not reserve vehicles or drivers in Draft or Submitted, and do not invent later reservation state names; keep RNT-03 resource commitment paused until exact states are named. If overnight rentals are permitted, require an explicit return date and never infer the next day from a return time earlier than departure; do not commit ambiguous intervals. Require separate explicit between-job buffer decisions for vehicles and drivers; zero is acceptable only when management explicitly confirms it. Do not assume a buffer value.
- **Source:** Owner approved these recommendations on 2026-10-19.
- **Reason:** State names and overnight representation affect whether a resource is actually committed; an implicit overnight rule or buffer can create unsafe false availability or unnecessarily block valid work.
- **Limits:** This decision specifies fail-closed behavior, not numeric buffer values or release rules. D-029/D-030 later define reservation triggers and overnight dates; RNT-03 resource commitment remains deferred until the remaining rules are supplied. It approves no further rental-request transition.

## D-029 — Vehicle and driver resource reservation triggers
- **Decision:** Draft and Submitted remain non-reserving. A vehicle is reserved when a booking is `Confirmed` and a specific vehicle is selected. A driver is reserved when a specific driver is `Assigned` to a `Confirmed` booking. The vehicle's `Reserved` status is derived from the authoritative reservation record, not manually edited.
- **Source:** Owner approved this recommendation on 2026-10-19.
- **Reason:** Vehicle selection can be held once the customer's booking is confirmed; driver commitment begins only when a specific driver is actually assigned.
- **Limits:** This defines reservation triggers only. It does not authorize creating the Confirmed/Assigned transitions, release on cancellation/completion, or other RNT-02/RNT-05..08 behavior. Buffer values remain open; D-026..D-028 continue to constrain RNT-03 implementation.

## D-030 — Overnight rental return dates
- **Decision:** Overnight rental requests are allowed. When a scheduled return time is earlier than departure, require an explicit return date after the service date before the Draft → Submitted transition; never infer the next day. An explicit later return date may also be supplied when the return time itself is later than departure. A duration-only interval remains calculable from departure plus the approved whole-minute duration.
- **Source:** Owner approved this recommendation on 2026-10-19.
- **Reason:** Multi-day rental requests can be represented without ambiguity, while a time-only return before departure cannot identify its calendar day.
- **Limits:** This adds the return-date field and conditional submission prerequisite only. It does not set vehicle/driver buffer values, resource-release rules, or authorize any further request status transition.

## D-031 — Resource turnaround buffers and reservation release
- **Decision:** Maintain separate company settings for vehicle and driver between-job buffers. Do not provide seeded or implicit values. Each value is an explicitly configured non-negative whole number of minutes (including zero only when deliberately entered by an authorized Super Administrator with an audit reason). If either resource's value is unset or invalid, block commitment of that resource; do not claim availability. The admin UI updates each resource value separately and every change is audited.
- **Reservation release:** Release a vehicle reservation on an accepted cancellation only before trip start, or after actual trip completion and an explicit vehicle-return record. Release a driver reservation on an accepted cancellation only before trip start, or when the completed trip records the end of that driver's assignment. An authorized pre-trip resource reassignment transfers/releases the old commitment atomically with the replacement. Never release merely because the scheduled return time has passed. An active or incomplete trip remains committed; a vehicle safety block remains independently effective after reservation release.
- **Source:** Recommended by the implementation agent and accepted under the owner's standing instruction to accept recommendations on 2026-10-19.
- **Reason:** Explicit, separate buffers preserve flexibility without inventing operational values, while fail-closed reservation and release rules avoid false availability after delays, incomplete return, or an unresolved active trip.
- **Limits:** D-031 does not authorize Confirmed, Assigned, cancellation, completion, return, or reassignment transitions or their actors/preconditions. It does not enable resource commitment itself. The values remain unset until entered by the operator; the reservation engine, transition workflows, atomic resource ledger, and PostgreSQL/browser acceptance remain to be implemented.

## D-032 — Initial post-submission rental review and decline transitions
- **Decision:** Permit only `Submitted → Under Review` and `Under Review → Declined` in this next lifecycle slice. Both actions require a reason of 8–500 characters, an atomic status/history/audit transaction, and an active `rental:manage` grant. Restrict `rental:manage` transitions to the existing Ops Manager and global Super Administrator scopes; Dispatchers, Fleet Managers and other roles cannot perform them. Declined is terminal in this implemented subset.
- **Limits:** These transitions do not authorize quotation, confirmation, cancellation, assignment, availability checks, or resource reservations, and do not send customer notifications. No outbound Under Review transition other than Declined is active; quotation progression remains blocked until its policy inputs are configured. Confirmed/Assigned reservation triggers from D-029 remain definitions only and are not activated.
- **Source:** Recommended from D-023's existing rental authority and the owner-approved permission matrix, then accepted under the owner's standing instruction on 2026-10-19.

## D-033 — Between-job buffer interval semantics
- **Decision:** Apply the configured vehicle or driver buffer after the earlier-ending of two trips. A pair conflicts if the trips overlap or if the later trip starts before the earlier trip's scheduled end plus that resource's configured buffer. Starting exactly at the buffer boundary is allowed. Missing/invalid buffer or interval data is not treated as zero and must fail closed.
- **Source:** Recommended by the implementation agent from the meaning of a between-job turnaround buffer and accepted under the owner's standing instruction on 2026-10-19.
- **Limits:** D-033 specifies pure interval comparison semantics only. It does not activate availability claims, reservation writes, database exclusion constraints, or status transitions; the authoritative atomic resource ledger and actual assignments remain unimplemented.

## D-034 — Typed quotation-validity setting
- **Decision:** Configure quotation validity as a positive whole number of days. Do not seed a default; an unset or invalid value blocks quotation creation. A Super Administrator sets or changes the value with an audit reason. The existing status registry reports whether a value is recorded, while the dedicated form exposes only this setting's exact value.
- **Source:** Recommended to make the existing quote-validity policy operationally configurable without guessing its business value; accepted under the owner's standing instruction on 2026-10-19.
- **Limits:** The actual validity duration remains unset until the operator supplies it. This does not implement quote issuance, valid-until calculation, expiry, extension, or acceptance; extension authority and handling remain open.

## D-035 — Rental pricing-model configuration structure
- **Decision:** Represent operator-defined rental pricing lines as a company-scoped list. Each line has a unique uppercase code, label, charging basis (`PER_TRIP`, `PER_DAY`, `PER_HOUR`, or `PER_KM`), and positive whole-number rate in GHS pesewas. Changes are Super Administrator-only and require an audit reason. Do not seed model names, lines, or rates; unset remains unset until the operator enters approved values. Saving an empty list clears the lines and leaves pricing unconfigured; the change remains audited.
- **Source:** Recommended safe configuration structure under the owner's standing instruction to analyze and accept defensible recommendations, 2026-10-19.
- **Reason:** Integer pesewas avoid floating-point currency storage; named, typed lines give future quotation logic a validated basis without inventing commercial terms.
- **Limits:** This is configuration only. It does not calculate totals, define distance/time charging interactions, taxes, deposits, discounts, rounding, quote issuance, or commercial prices. Values remain unset pending operator entry; no booking or customer-facing quote behavior is enabled.

## D-036 — Tax and levy configuration structure
- **Decision:** Represent accountant-approved tax and levy lines as a company-scoped list of unique uppercase code, label, and integer rate in basis points (100 basis points equals 1 percentage point). Allow zero only as an explicitly entered rate. Super Administrator changes require an audit reason. No lines or rates are seeded; an empty list clears the configuration and keeps tax policy unset.
- **Source:** Recommended as a data-only foundation under the owner's standing instruction; 2026-10-19.
- **Limits:** This does not assert that a particular tax applies, calculate tax amounts, define taxable base, compounding, exemptions, ordering, rounding, or VAT registration status. Accountant confirmation is required before entering values, and no quote or invoice arithmetic is enabled.

## D-037 — Deposit-policy configuration structure
- **Decision:** Support an explicitly selected deposit policy: fixed positive amount in GHS pesewas, positive percentage in basis points, or an explicit `NOT_REQUIRED` choice. For amount/percentage policies, record whether the deposit is due before confirmation or before departure. Super Administrator updates require an audit reason; no choice or amount is prefilled.
- **Source:** Recommended as a typed, unset-by-default policy structure from the brief's amount-or-percentage and timing questions; 2026-10-19.
- **Limits:** This records policy inputs only. It does not calculate a deposit, authorize booking confirmation, accept or verify payment, define what evidence constitutes receipt, or enable refunds. A configured `NOT_REQUIRED` choice is an explicit management decision, not a default.

## D-038 — Deterministic rental pricing-line arithmetic
- **Decision:** Keep monetary rates in integer GHS pesewas. A per-trip line applies once. Per-kilometre quantities are whole metres divided by 1,000; per-hour and per-day quantities are whole minutes divided by 60 and 1,440 respectively, so day units are elapsed 24-hour periods rather than calendar dates. Prorate partial units and round each line once, half-up, to the nearest pesewa using exact integer arithmetic. Compute lines independently; this decision does not compound or apply taxes.
- **Source:** Recommended to make the four D-035 rate units deterministic without floating-point currency arithmetic; accepted under the owner's standing instruction, 2026-10-19.
- **Limits:** This is a pure helper only. It accepts a supplied distance/duration and does not select a model, establish where the values come from, derive a trip interval, issue or persist quotations, or enable any rental status transition. Distance/time source policy, zero-distance treatment, quote approval and tax arithmetic remain unresolved; missing or non-positive quantities fail closed.

## D-039 — Requested duration as the time-priced quotation quantity
- **Decision:** For future time-priced quote lines, use an explicitly entered positive duration in whole minutes when no scheduled return is present. When a scheduled return is present, derive elapsed minutes from the saved service date, departure time, and stored return date/time; an overnight return still requires the explicit D-030 date. If both duration and scheduled return are saved, require them to agree exactly or block the time-priced line until corrected. Never infer a return date or use actual trip time for the initial quote.
- **Source:** Recommended fail-closed quantity-resolution rule from the existing D-022/D-030 request model; accepted under the owner's standing instruction, 2026-10-19.
- **Limits:** Implemented as a pure duration resolver only. It does not update a request, create a quote, choose a rate, source/verify distance, or authorize quotation or status transitions.

## D-040 — Pure percentage-tax line arithmetic
- **Decision:** A tax-line rate in basis points is applied to a caller-supplied non-negative integer taxable base in GHS pesewas, using exact integer arithmetic and half-up rounding once to the nearest pesewa per line.
- **Source:** Recommended arithmetic-only foundation under the owner's standing instruction; 2026-10-19.
- **Limits:** The helper does not decide whether an item is taxable, choose the taxable base, compound lines, set line order, handle exemptions, confirm legal rates, or include any tax in a quote/invoice. No tax arithmetic is wired into a financial workflow.

## D-042 — Authorized internal rental pricing preview
- **Decision:** Permit Ops Managers and Super Administrators with `rental:manage` to calculate an uncached, temporary pre-tax preview only while a request is Under Review. The service reads company-configured pricing models, uses D-039 for any requested-time quantity, and requires the manager to enter whole metres for any per-kilometre line. Do not persist the preview or present it to customers.
- **Source:** Recommended next internal-only RNT-04 step to validate configured rates and quantity handling without crossing into quote issuance; accepted under the owner's standing instruction, 2026-10-19.
- **Limits:** This does not create a quote number/version, save a quotation, update request status, apply taxes/discounts/deposits/validity, approve or send a quote, or support customer acceptance. The manual distance is not saved or verified; output is an estimate only and must not be used as a formal quotation.

## D-043 — Immutable internal pricing worksheets
- **Decision:** Allow an authorized `rental:manage` user to explicitly save a pre-tax pricing worksheet only for an Under Review request. Each save creates a new immutable, monotonically versioned snapshot under a request-row lock, requires an 8–500 character reason, and writes an audit event atomically. The saved record is an internal worksheet, not a quotation; it has no quote number, issue date, validity, approval, or customer-visible status.
- **Source:** Recommended as a durable internal calculation record while quote issuance/approval policies remain unavailable; accepted under the owner's standing instruction, 2026-10-19.
- **Limits:** Does not change the request status, save a customer quotation, apply taxes/discounts/deposit, send/approve/accept a quote, or reserve a vehicle/driver. Historical worksheets are append-only and their reason/audit records do not contain line rates.

## D-044 — Initial non-safety maintenance work-order intake
- **Decision:** Begin MNT-01 with a manager-only, reason-audited intake for explicitly non-safety faults. A new work order starts at `Reported`; the operator must explicitly enter the report date and confirm the fault is not safety-related. Work type and priority remain free-text optional fields with no defaults. Odometer values require an explicitly selected `KM` or `MILE` unit. Generate an opaque work-order reference; do not infer category, priority, unit, costs, assignee, or work completion.
- **Source:** Recommended safe first maintenance slice under the standing instruction to continue while preserving the D-016/D-018/D-019 safety boundary; accepted under the owner's standing instruction, 2026-10-19.
- **Limits:** This general work-order intake continues to refuse safety-related records; those require a separate vehicle safety block under D-045. This intake does not approve, assign, transition, complete, close, price, or release work orders. It does not prevent vehicle assignments; assignment safety enforcement remains inactive.

## D-045 — Auditable vehicle safety-block application and release
- **Decision:** Keep safety blocks separate from manually edited Vehicle status. Ops Managers, Fleet Managers and Super Administrators may immediately apply only the approved `Under Maintenance`, `Out of Service`, or `Pending Inspection` block, with a required reason. Only an active authorized maintenance releaser may release a block, requiring an explicit work-completion timestamp, inspection results, a passed-inspection assertion, and release reason. A vehicle may have only one active block; applied block details cannot be overwritten/deleted, an actively blocked vehicle cannot be archived, and release is a one-time recorded transition.
- **Source:** Safe implementation of owner-approved D-016/D-018/D-019 and the maintenance role matrix; accepted under the owner's standing instruction, 2026-10-19.
- **Limits:** Full fleet managers may see the applied reason; limited fleet projections receive only block status/time. No assignment workflow exists, so no live assignment prevention can be claimed; future assignment services must check the active-block ledger transactionally. Safety blocks are not linked to the current non-safety work-order intake. Release captures work completion and passed-inspection evidence as a manager assertion; it does not provide independent verification or implement work-order status transitions.

- **Decision:** A pricing preview may sum only explicitly selected, configured pricing models with explicitly supplied quantities. The preview returns model snapshots and pre-tax line/subtotal amounts in GHS pesewas. Missing model/quantity or an empty selection fails closed. The preview is not a quotation, is not persisted or customer-visible, and does not apply discount, tax, deposit, validity, approval, or acceptance behavior.
- **Source:** Recommended incremental RNT-04 boundary to test price arithmetic without implying quote issuance; accepted under the owner's standing instruction, 2026-10-19.
- **Limits:** This is a pure helper only. It does not load company policy, authorize actors, derive distance, resolve time quantities, create a quote record, or progress rental status.

## D-046 — Reason-audited maintenance work-order lifecycle
- **Decision:** Permit manager-authorized transitions only along this fixed graph: `Reported → Awaiting Inspection → Approved → In Progress → Awaiting Parts → In Progress → Awaiting Review → Completed → Closed`, with `Reported → Cancelled` and `Awaiting Inspection → Cancelled` as terminal alternatives. All transitions require an 8–500 character reason and atomically update the current status, append immutable sequenced history, and write an audit event. Approval must be performed by an authorized manager other than the original reporter; planned work and parts may be explicitly recorded at approval but are optional. Completion requires an explicit non-future completion timestamp and inspection results. Labour, parts, and other costs are optional explicit integer pesewas; omitted amounts remain unset.
- **Source:** Recommended next safe vertical slice after MNT-01/MNT-02 and accepted under the owner's standing instruction on 2026-10-19.
- **Limits:** No assignment, resource scheduling, safety-block release, independent inspection verification, invoice or payment behavior is added. Completion inspection is recorded as supplied evidence, not independently verified. This lifecycle does not link safety blocks to work orders. Every transition, including cancellation and closure, remains reason-audited; terminal states cannot transition further.

## D-047 — Limited all-time rental-request report
- **Decision:** Provide a read-only, `rental:manage`-authorized aggregate of persisted rental-request records grouped by current status and recorded request source, scoped to the active company. Label it as an all-time snapshot and include Draft records. For RPT-01 measures whose source lifecycles do not exist, show “not available” with the missing dependency; never present an unavailable metric as zero. Do not include customer-identifying details or enable export.
- **Source:** Recommended safe reporting slice while quotation, cancellation, reservation, assignment, invoice and payment workflows remain gated; accepted under the owner's standing instruction on 2026-10-19.
- **Limits:** This does not implement a date range, quotations issued, acceptance, confirmed/completed rentals, revenue, outstanding balances, vehicle utilization or cancellation reasons. The aggregate is an operational snapshot only, not a financial statement.

## D-048 — All-time submitted-request count
- **Decision:** In the limited rental report, count requests that have an immutable `Draft → Submitted` status-history event, including requests later declined. Display this as an all-time count with the event definition; do not substitute current `Submitted` status count or describe it as a date-filtered enquiry KPI.
- **Source:** Recommended small, verifiable RPT-01 metric using the already-audited submission ledger; accepted under the owner's standing instruction on 2026-10-19.
- **Limits:** This does not add date filters, quotation/acceptance measures, resource, invoice, payment, or cancellation behavior.

## D-049 — Corporate contract register and lifecycle (CLI-02)
- **Decision:** Implement contracts with statuses Draft, Pending Approval, Active, Suspended, Expired and Terminated and one transition table in `contract-transitions.ts`: Draft → Pending Approval; Pending Approval → Active or back to Draft for amendment; Active → Suspended, Expired or Terminated; Suspended → Active, Expired or Terminated; Expired → Active only as a renewal. Terminated is terminal. Contracts are editable only in Draft. Approval (Pending Approval → Active) requires an active (non-archived) client in the same company and a start date with an end date on or after it. Reactivating a Suspended contract is refused once its end date has passed, so an elapsed term is routed through Expired; renewal from Expired requires an explicit new end date that has not passed and never silently reuses the old dates. Every transition is row-locked, permission-checked (`client:manage`, company scope), reason-audited, and written to append-only `ContractStatusHistory` in the same transaction; the database additionally enforces the transition table, created-as-Draft, approval dates, and history presence with checks and triggers. References are generated as `CON-` plus 16 uppercase hex characters and are unique per company (work-order precedent). Pricing model, billing frequency, payment terms and service-level targets are optional free text recorded exactly as agreed, with no defaults and no money computation (FIN-01 later). A renewal review date is recorded per contract; suspended/expired contracts and Active contracts past their end date raise explicit warnings. Attachments are not supported (no file-storage provider selected) and no automated renewal reminders are sent (recipients/channel unresolved); both limits are labelled in the UI. Whether bookings are allowed under expired or suspended contracts remains governed by the unset `contracts.inactive_booking_policy` setting, to be enforced in BKG-02.
- **Source:** CLI-02 in the standing brief, the proposed Contract rows in `docs/STATE_MACHINES.md`, and the owner's standing instruction on 2026-10-20 to continue Phase 1B without stopping.
- **Limits:** No structured route/stop or shift links (RTE-02/RTE-03 model those), no booking-eligibility enforcement, no corporate invoicing, no automatic expiry job (expiry is a reason-recorded manual transition plus warnings), no named-approver or separation-of-duties rule beyond the `client:manage` grant (approver policy remains an open question), and no attachment storage.

## D-050 — Employee register, restricted fields, and CSV import (EMP-01/02/03)
- **Decision:** Employees belong to a corporate client (composite company+client foreign key). Only the client and full name are required; reference is optional, staff-entered, and unique per company when supplied. Department, work location, shift, and account status are recorded exactly as supplied, with no defaults or preset vocabulary (shift names/times remain an unset `operations.shift_definitions` setting). Transport eligibility is a nullable boolean — "not recorded" is distinct from eligible or not eligible — toggled through the audited update path. Approved pickup/drop-off points are landmark-description text until RTE-01 provides structured locations. Home address, telephone/email, and voluntarily supplied accessibility needs are restricted fields: they are stored on the record but returned only to company-scoped `employee:manage` managers (Super Administrator GLOBAL, Operations Manager COMPANY). Dispatcher roster-minimum, Corporate HR own-company, and passenger own-profile scopes fail closed until their field projections and the HR-to-client binding rule are approved. CSV import follows the established register pattern (D-024): fixed template with `fullName` as the only required column, per-client batches, preview with row-level errors, all-or-nothing confirmation, no silent discards, no auto-merge. A reference repeated in the file or already present in the company is a row error. Likely duplicates — same normalized name plus the same telephone digits or email, within the file or against existing employees of the same client — are warnings only and never block or merge a row. Eligibility cells accept TRUE, FALSE, or blank. A manager-only CSV export excludes home address and accessibility needs and is itself audited.
- **Source:** EMP-01..03 in the standing brief, the D-024 all-or-nothing import rule, the D-025 warning-only likely-duplicate principle, and the owner's standing instruction on 2026-10-20 to continue Phase 1B without stopping.
- **Limits:** No employee portal accounts or account-to-employee identity linking, no HR self-service view (client binding undecided), no roster projection for dispatchers, no structured pickup/drop-off locations or shift timetable (RTE-01/RTE-03), no booking-eligibility enforcement (BKG-02 decides how "not recorded" eligibility and deactivated accounts are treated), and no employee deletion — archive only.

## D-051 — Locations, routes, schedules, and the manual planning aid (RTE-01..04)
- **Decision:** Locations carry an optional coordinate pair (both-or-neither, range-checked in schema and database), a landmark description, and an optional Ghana digital address; unmapped locations stay fully usable. Routes belong to a client, reference generated `RTE-…` references unique per company, origin/destination locations, optional planned start/expected duration/capacity requirement, operating-day codes (MON..SUN), a shift recorded as supplied, and an active flag set explicitly by the service. The approved stop order is stored as `RouteStop` rows with sequence, kind (PICKUP, DROPOFF, PICKUP_AND_DROPOFF) and optional planned offset minutes; dispatchers replace the whole order through one audited operation (`ROUTE_STOPS_SET`), which is the dispatcher-override record. Schedules are RECURRING (one or more day codes, no date) or ONE_TIME (a date, no day codes), enforced in Zod and by a database CHECK; creating, copying, or reactivating a schedule is rejected when another active schedule for the same route starts at the same recorded time on an overlapping day/date (a one-time date is matched by its Africa/Accra — UTC — weekday). Copying uses the source as a template and is conflict-checked like any new schedule. Shift names/times and route recurrence semantics beyond day codes remain operator-supplied text; nothing is inferred. The planning aid (RTE-04) is a pure function: it lists the approved stop order, computes stop times only from the route start plus recorded offsets, flags stops without coordinates as unmapped, and compares the capacity requirement with the largest recorded vehicle seat count (availability at trip time is a dispatch-time check). It is always labelled MANUAL_APPROXIMATE, states that no map provider is configured, and never calls a route optimal. Locations, routes and schedules sit behind `route:manage` with GLOBAL/COMPANY scopes (Super Administrator, Operations Manager, Dispatcher); own-client and assigned-trip read scopes fail closed until their projections are approved.
- **Source:** RTE-01..04 in the standing brief and the owner's standing instruction on 2026-10-20 to continue Phase 1B without stopping.
- **Limits:** No map/geocoding provider and no distance or travel-time estimation, no trip generation from schedules yet (TRP-01 materializes trips), no vehicle/driver availability or assignment checks (DSP-02), no employee-to-stop assignment (BKG-04), and no route optimisation objective or engine (RTE-05 is Phase 3).

## D-053 — Trips, manifests, and the transactional capacity check (TRP-01/02, BKG-04)
- **Decision:** A trip is one dated vehicle run with a generated `TRP-…` reference, linking optional client, route, schedule, vehicle, and driver. Statuses: Planned, Ready for Dispatch, Dispatched, In Progress, Delayed, Completed, Cancelled, Interrupted. The transition table lives in `trip-transitions.ts` (Planned → Ready for Dispatch/Cancelled; Ready for Dispatch → Dispatched/Cancelled/Planned; Dispatched → In Progress/Delayed/Interrupted; In Progress → Delayed/Interrupted/Completed; Delayed → In Progress/Completed/Interrupted; Interrupted → In Progress/Completed/Cancelled), enforced by one transition function (row lock, permission, guards, sequenced history, audit) mirrored by database guards (creation must be Planned, transition allowlist, history-required and history-matches triggers, append-only `TripStatusHistory`). Dispatched requires `vehicleId`+`driverId` (set by DSP-02 until then); In Progress stamps `actualStartAt`, Completed stamps `actualEndAt`. Staff enter trips at Planned always. Generation materializes Planned trips from active schedules on active, unarchived routes over at most 31 days; a partial unique index `(companyId, scheduleId, tripDate)` makes regeneration a no-op and the service reports created/skipped counts. Trip capacity/start/duration default from the route requirement and schedule. Assignment (BKG-04): the trip row is locked with `SELECT … FOR UPDATE`, the booking must be Accepted on the same date (and matching client/route when set), the manifest (Assigned/Boarded/Completed) is counted and assignment is refused when full. The capacity basis is the assigned vehicle's `seatCount` when a vehicle is set, otherwise the trip `capacityLimit`; when no basis exists the manifest reports it explicitly instead of silently skipping the check. Parallel assignments serialize on the trip lock — an integration test proves exactly one of two racing seat-1 assignments succeeds. Unassign (Planned/Ready only) returns the booking to Accepted and clears `Booking.tripId` (composite FK). The manifest (TRP-02) projects only employee name, booking type, and pickup/drop-off names — never restricted employee fields — and an integration test asserts the exact manifest entry keys. Permissions: `trip:dispatch` GLOBAL/COMPANY (Super Administrator, Operations Manager, Dispatcher); the `/trips` UI is gated on the same permission.
- **Source:** TRP-01/02 and BKG-04 in the standing brief, the Trip rows in `docs/STATE_MACHINES.md`, and the owner's standing instruction on 2026-10-20 to continue Phase 1B without stopping.
- **Limits:** Vehicle/driver assignment UI arrives with the dispatch board (DSP-02); a booking cancelled while on a trip stays linked with status Cancelled and is excluded from manifests; bulk release of Assigned bookings on trip cancellation is a dispatch operational follow-up; trips never start without resources, and driver-side event APIs arrive with DRV-01/02.

## D-052 — Booking types, validation, duplicates, and workflow (BKG-01..03)
- **Decision:** A booking is one employee journey on one date, with a generated `BKG-…` reference. Types are HOME_TO_OFFICE, OFFICE_TO_HOME, ONE_TIME, RECURRING (a dated occurrence of a recurring pattern), AD_HOC, EMERGENCY, RETURN and ADDITIONAL_DESTINATION. Staff/HR bookings enter at Pending; the Draft stage in the state-machine document is reserved for the future passenger portal (PAX-01). Statuses and one transition table live in `booking-transitions.ts`: Pending → Accepted/Rejected/Cancelled; Accepted → Assigned/Cancelled; Assigned → Boarded/Cancelled/Accepted (unassign); Boarded → Completed. This slice exposes only accept/reject/cancel to staff; assignment, boarding and completion are refused on the generic path so they can only happen through trip assignment (BKG-04/DSP-02) and driver events (DRV-02). Validation at creation: the employee must exist unarchived in the company and be recorded transport-eligible (`false` and "not recorded" both block, with distinct messages); a supplied contract must belong to the employee's client — Active proceeds, Suspended/Expired follow the `contracts.inactive_booking_policy` setting (typed ALLOW/BLOCK in the settings registry; while unset the booking blocks with an explanation), and Draft/Pending Approval/Terminated always block; a supplied route must belong to the employee's client; pickup/drop-off locations must be active same-company records; past journey dates are rejected. Duplicate journeys are prevented by a partial unique index on (company, employee, journey date, type, route) over live statuses (Pending/Accepted/Assigned/Boarded) plus a service pre-check, so parallel requests cannot both succeed and cancelled journeys can be rebooked. Every status change is row-locked and written to append-only `BookingStatusHistory` with database transition guards. Permissions: `booking:manage` GLOBAL/COMPANY (Super Administrator, Operations Manager, Dispatcher); Corporate HR own-client and passenger scopes fail closed until client binding is approved. Booking cut-off times remain unconfigured and unenforced (open question); cancellation deadlines and the waiting list are BKG-05.
- **Source:** BKG-01..03 in the standing brief, the Booking rows in `docs/STATE_MACHINES.md`, and the owner's standing instruction on 2026-10-20 to continue Phase 1B without stopping.
- **Limits:** No trip assignment or capacity check yet (TRP-01/BKG-04), no waiting list or cancellation deadlines (BKG-05), no recurring-series generation (dated occurrences are booked individually until TRP-01 generates trips from schedules), no passenger/HR self-service creation, and no booking changes after assignment except through dispatch/driver flows.

## D-054 — Dispatch board and resource assignment rules (DSP-01..04)
- **Decision:** The dispatch board is a day view at `/dispatch` (DSP-01): every trip for one selected date with route, resources, passenger count/capacity, and status — it works with no map provider and never implies route optimisation. DSP-02 assignment (`assignTripResources`) runs inside a transaction with the trip row locked and is allowed only while the trip is Planned or Ready for Dispatch. Hard blocks (never overridable, reason-required attempts still refused): archived vehicle; an active vehicle safety block (`VehicleSafetyBlock` with `releasedAt` null — the Phase 1A rule that a safety block prevents new assignments); archived driver; expired driver licence (`licenceExpiresAt` before the trip date); the trip already has that resource. Overridable conflicts (require the standard reason and an explicit dispatcher `override` flag, both audited): the vehicle is already assigned to another non-terminal trip on the same date; the driver is already assigned to another non-terminal trip on the same date; the vehicle seat count is below the trip's recorded capacity limit; the already-assigned passengers exceed the vehicle seat count. The response always returns the evaluated conflicts as warnings so the board can show them before confirming. DSP-03 emergency trips are created through the existing trip creation path (ad-hoc trip, reason required) — no separate un-audited entry point. DSP-04 no-shows and delays are recorded through the trip lifecycle: no-show marks an Assigned booking Cancelled via the booking transition path with a no-show reason, freeing the seat; delays use the Delayed transition with `delayReason`. Cancelling a trip releases every Assigned booking back to Accepted with history and audit (`BOOKING_RELEASED_FROM_CANCELLED_TRIP`), leaving Boarded passengers untouched for incident handling. Permissions stay `trip:dispatch` GLOBAL/COMPANY per `docs/PERMISSIONS.md`.
- **Source:** DSP-01..04 in the standing brief, `docs/PERMISSIONS.md` trip:dispatch row, the D-023/Phase 1A safety-block decision, and the owner's standing instruction on 2026-10-20 to continue Phase 1B without stopping.
- **Limits:** No availability calendar beyond same-day conflicts, no split-shift or hours-of-service model, no map integration, and driver-side event reporting (DRV-02) still to come; interrupt/breakdown handling remains a lifecycle transition plus incident notes until DRV-04.

## D-055 — Driver identity link and idempotent driver events (DRV-01/02/04)
- **Decision:** A driver signs in through an optional `Driver.userId` link to the login account (unique when set; a plain field because the user must exist in `User` — set only through the audited `linkDriverAccount` service by `driver:manage` GLOBAL/COMPANY actors). Unlinked driver accounts get no driver surface (explicit denial). Driver reads and events additionally require the seeded `trip:dispatch` `OWN_TRIP_EVENTS` (DRIVER role) scope and `Trip.driverId` equal to the linked driver — a driver sees and acts only on their own trips, and manifest projection stays name/type/pickup/drop-off only. Driver actions are POSTed as events with a client `idempotencyKey` stored on `DriverEvent` (unique on company+trip+key): START (Dispatched → In Progress), DELAY (Dispatched/In Progress/Delayed+ → Delayed with reason), RESUME (Delayed/Interrupted → In Progress), INTERRUPT (→ Interrupted with reason), COMPLETE (In Progress/Delayed → Completed; Boarded bookings on the trip move to Completed with history), BOARD (Assigned booking on the trip → Boarded), NO_SHOW (Assigned booking → Cancelled with the no-show reason), and REPORT_DEFECT (DRV-04: creates an incident note on the trip via audit-linked `DriverEvent` + applies nothing to the vehicle register — the dispatcher acts on it; vehicle safety blocks stay with fleet staff). Replaying the same key with the same event returns the stored result marked duplicate without re-applying; the same key with a different event is a conflict. Trip transitions reuse the D-053 transition table and guards. Mobile-first UI at `/driver` uses the same services.
- **Source:** DRV-01/02/04 in the standing brief, `docs/PERMISSIONS.md` (`trip:dispatch` Driver — Own assigned trip events), and the owner's standing instruction on 2026-10-20 to continue Phase 1B without stopping.
- **Limits:** DRV-03 and DRV-05 are not defined anywhere in the approved documents and are left untouched pending the owner; no offline queue (the client retries with the same key), no push notifications, no navigation provider (pickup/drop-off names and recorded location text only), and defects do not auto-block the vehicle (dispatcher/fleet decision per the Phase 1A safety-block rule).

## D-056 — Booking creation cut-off via typed settings (BKG-05a)
- **Decision:** The booking creation cut-off is a per-company typed setting `bookings.creation_cutoff` (JSON `{ "mode": "NONE" | "HOURS_BEFORE_JOURNEY", "hours": <int> }`, 0–720). Unconfigured remains NONE — booking behaviour does not change for companies that never set it. When HOURS_BEFORE_JOURNEY is configured, `createBooking` rejects a journey whose start-of-day (Africa/Accra == UTC) minus `hours` is already past, with a clear error naming the cut-off. Cancellation deadlines stay unconfigured and unenforced (no late-cancellation rule exists to enforce); the waiting list stays an operational dispatcher queue (BKG-05b) rather than an automatic promotion engine, because no promotion policy (order, notification, acceptance window) is approved.
- **Source:** BKG-05 in the standing brief, the open question on booking cutoffs, and the owner's standing instruction on 2026-10-20 to continue Phase 1B without stopping. Missing business choices are surfaced, not invented.
- **Limits:** Journey start time is the start of the journey date until pickup times exist; promotion of waiting bookings into freed seats is manual through the existing assignment path.

## D-057 — Corporate invoices from billable trips with duplicate-billing protection (FIN-02)
- **Decision:** An invoice is raised per company + corporate client + contract for a billing period, from **Completed trips** in the period whose bookings carry the contract. Money comes only from an explicitly typed companion setting `finance.corporate_rates` (array of `{ contractId, unit: PER_TRIP|PER_PASSENGER, ratePesewas }`, pesewas integers) — never from free-text contract `pricingModel`. `generateCorporateInvoice` fails closed when the client/contract is missing, archived, outside the period bounds, has no Completed trips, or has no configured rate; it never invents a price. Amounts: PER_TRIP charges per Completed trip; PER_PASSENGER charges per Completed booking on those trips; tax uses configured `finance.tax_lines` and the existing `calculateTaxLineAmount` helper on the subtotal. Duplicate-billing protection is structural: each Completed trip can appear on one invoice line set — `InvoiceLine.tripId` is unique when set, invoice creation runs in one transaction guarded by locking the contract row, and a second generation for the same contract+period returns the existing invoice (idempotent) instead of duplicating. Invoices are immutable after creation in this slice: number `INV-…` unique per company, status DRAFT (issuing/payment lifecycle is a Phase 1C finance decision and is not invented here), period, subtotal/tax/total stored in pesewas, lines stored as structured records. Permissions: the seeded `invoice:manage` permission (docs/PERMISSIONS.md: Super Administrator company/GLOBAL, Finance Officer company) is resolved through the same permission service with GLOBAL/COMPANY scopes; Corporate HR own-client reads await the CLI-03 client-binding decision; all checks fail closed.
- **Source:** FIN-02 in the standing brief ("Corporate invoice generation from billable trips"), the existing tax/settings infrastructure, and the owner's standing instruction on 2026-10-20 to continue Phase 1B without stopping.
- **Limits:** No invoice issuance/void/payment lifecycle, no credit notes, no per-stop or distance pricing (no measured distances exist), no emailing/PDF; Draft status only until the owner approves the finance lifecycle.

## D-058 — Corporate rates setting shape (FIN-02 companion)
- **Decision:** Corporate contract rates live in the typed settings key `finance.corporate_rates`: an array of `{ contractId, unit: PER_TRIP | PER_PASSENGER, ratePesewas }` with unique contractIds, validated in the settings registry like the rental pricing models. Invoice generation (D-057) reads only this setting; a contract without a configured rate cannot be invoiced and fails closed with an explanation. This is a companion clarification to D-057 recorded as its own entry because the settings registry treats each typed key as a separate contract.
- **Source:** FIN-02 in the standing brief and D-057.
- **Limits:** Rates are flat per contract; no distance/time bands exist because no measured distances are recorded anywhere in the system yet.

## D-059 — Corporate client-binding rule for HR/admin accounts (CLI-03 enabler)
- **Decision:** The HR-to-client binding that blocks CLI-03 is resolved with the same pattern as the driver link (D-055): a user may be bound to exactly one corporate client **per company** when they hold the Corporate HR Admin role, through a new audited service `bindUserClient` (Super Administrator GLOBAL or Operations Manager COMPANY actors; both linkage directions unique per user+company and client+company). `UserClientBinding` is a company+user+client row with composite FKs (no deletion, unbind sets `revokedAt`; re-binding after revoke is a new row). Read paths never treat the CORP_HR_ADMIN role alone as sufficient: a corporate dashboard request first resolves an active binding, then restricts every query to that client; without a binding the dashboard is an explicit denial, never a company-wide view. The binding is read-only — it confers no staff powers and does not change the fail-closed posture of bookings/employees routes for HR scopes, which are separate later decisions.
- **Source:** CLI-03 in the standing brief ("Corporate dashboard limited to the client's own records"), the D-050 limit ("HR-to-client binding rule" unapproved), and the owner's standing instruction on 2026-10-20 to continue Phase 1B without stopping. This decision is recorded for owner ratification like D-053..D-058; the owner may direct a single-client membership model instead, in which case the table reshapes but the read-model code stays.
- **Limits:** Only the Corporate HR Admin dashboard is enabled by this decision. Booking creation for HR users, roster minimums for dispatchers, and passenger self-service remain disabled pending their own decisions.

## D-060 — Phase 1B gate ratifications (owner-approved 2026-10-21)
- **Decision:** At the Phase 1B gate the owner approved the recommended package:
  (1) **D-059 ratified as built** — the audited `UserClientBinding` (one active binding per user+company,
  revoke-only mutation, CORP_HR_ADMIN role alone never sufficient) is the approved HR-to-client binding
  rule; the recorded limit stands (one login per client for multi-client HR staff) until a future decision
  reshapes it.
  (2) **Settings registry rows approved** — `bookings.creation_cutoff` (D-056, category `bookings`,
  blocked feature BKG-05) and `finance.corporate_rates` (D-058, category `finance`, blocked feature
  FIN-02) are registered in `settingRegistry`, so both are configurable through the settings UI; values
  remain unset until deliberately configured and services keep failing closed meanwhile. The temporary
  `as SettingKey` casts in `registry.ts` are removed.
  (3) **DRV-03 / DRV-05 formally descoped for Phase 1B** — they were never defined in the approved
  documents; they remain "Not Started — requires definition before any future phase" and do not block
  the gate.
  (4) **Invoice lifecycle confirmed DRAFT-only** — Phase 1B closes with immutable DRAFT generation
  (D-057/D-058); issuance, payment, and voiding are a Phase 1C finance decision and must not be assumed.
- **Source:** Phase 1B gate after automated verification passed at commit `3e32798` (unit 373/373,
  integration 105/105 on fresh `richie_tms_p1b_20261021011206_test`); owner "APPROVE" on 2026-10-21.
- **Limits:** Gate closure still awaits the owner-run E2E pass (`docs/PHASE_1B_VERIFICATION.md` §3,
  separate fresh `richie_tms_e2e_phase1b_test` database). No Phase 1C work begins until the owner
  declares the gate closed after E2E.

- **Gate closed (owner declaration, 2026-10-21):** After the owner-run E2E pass went 4/4 on the fresh
  `richie_tms_e2e_phase1b_test` database (post-`44a7e93` spec fix) and the verify script re-confirmed
  7/7 at gate commit `d540c68`, the owner formally declared the Phase 1B gate closed. All D-060
  ratifications stand. Phase 1C planning may begin; Phase 1C construction still requires the owner's
  separate go-ahead, and the descoped items (DRV-03/DRV-05, invoice issuance/payment/void lifecycle)
  require their own decisions before implementation.

## D-061 — Corporate invoice lifecycle (Phase 1C, FIN-02 extension)
- **Decision:** `CorporateInvoice` gains a governed lifecycle `DRAFT → ISSUED → PAID`, with `VOID`
  reachable from `DRAFT` or `ISSUED`; `VOID` and `PAID` are terminal. Guarded by a transition table
  (`invoice-transitions.ts`) + row lock + status-history rows (`CorporateInvoiceStatusHistory`, DB
  trigger-enforced), mirroring contracts. Guards: amounts never mutate (DB guard rejects any
  non-status/issue-field change); **ISSUED is payable only while the trip-billing freeze holds** —
  voiding returns its lines' trips to the billable pool by derivation (billed = non-VOID invoice
  lines); payments (`InvoicePayment`, append-only) may only be recorded against ISSUED invoices and
  may not exceed the outstanding balance; an invoice auto-transitions to PAID in the same transaction
  when cumulative payments reach the total. Void requires reason ≥8 chars and, for ISSUED invoices,
  is refused while any payment exists (payments are append-only; no clawback workflow).
  Amounts, lines, reference, period and contract never change after generation.
- **Source:** Phase 1C owner go-ahead ("go ahead start building phase 1c", 2026-10-21); D-057/D-058
  (generation), D-060 (DRAFT-only confirmed for Phase 1B, lifecycle deferred to Phase 1C). 
- **Ownership/timeline:** Built this session ahead of formal Phase 1C planning; recorded here for
  ratification at the next gate.
- **Implementation refinement (2026-10-21):** PostgreSQL index predicates cannot contain
  subqueries, so the status-aware invariants are materialised without subqueries: the
  contract+period unique index becomes partial (`WHERE status <> 'VOID'`, so a voided invoice
  frees its contract+period for a replacement), and the trip-billing freeze uses a
  trigger-maintained `CorporateInvoiceLine.billingActive` flag (set false by an AFTER UPDATE
  trigger when the parent invoice is voided) with a partial unique index on
  `(companyId, tripId) WHERE billingActive`. The service derives "billed" from `billingActive`,
  and the database additionally refuses to void an invoice that has payments.

## D-062 — Invoice payments and outstanding balance (FIN-03)
- **Decision:** Payments are append-only `InvoicePayment` rows (amountPesewas > 0, method free-text,
  reference text, receivedAt date, reason). The outstanding balance is derived, never stored:
  `total − Σ(payments of non-VOID invoice)`. Overpayment is refused at the row lock
  (`PaymentExceedsBalanceError`); the service recomputes under the invoice row lock, so parallel
  payments cannot jointly overpay. Paid-in-full flips status to PAID atomically (history row
  `Invoice marked PAID after full payment`). A PAID invoice accepts no further payments or transitions.
- **Source:** D-061 companion; FIN-03 inferred scope approved under the same owner instruction,
  recorded for ratification at the next gate.

## D-063 — Finance dashboard semantics (FIN-07)
- **Decision:** `getFinanceDashboard` (`src/modules/finance/dashboard.ts`, pure aggregation in
  `dashboard-summary.ts`) is a read-only rollup over the corporate invoice transaction records
  (D-061/D-062) — the only invoice/payment records that exist in Phase 1. Headline figures:
  **recognised revenue** = Σ totals of ISSUED + PAID invoices; **payments received** = Σ
  `InvoicePayment.amountPesewas`; **outstanding** = Σ (total − Σ payments) over ISSUED invoices —
  all derived from the records, never stored. DRAFT invoices are shown separately as pipeline and
  VOID invoices only as a count/total; neither enters revenue or outstanding. The structural
  identity *recognised revenue = payments received + outstanding* (payments can only sit on
  ISSUED/PAID invoices and void-with-payments is refused) is computed on every response as
  `reconciliation.reconciles`, so the dashboard proves its own tie-out. Per-client rows
  (invoiced / paid / outstanding / standing invoice count) sum to the headline figures. An
  optional date window (≤ 366 days) drives only the *activity* section — payments received by
  `receivedAt`, invoices recognised by their append-only ISSUED history timestamp for invoices
  still standing; balances stay point-in-time. Africa/Accra keeps UTC year-round, so UTC day
  bounds are the local day bounds `docs/KPIS.md` requires. **Margin is never fabricated:** it is
  returned as `INSUFFICIENT_DATA` because attributable cost records do not exist yet (FIN-05
  expenses are Phase 3; maintenance work-order costs are not attributable to invoices or trips).
  Rental revenue, expenses by category, cost per trip/passenger and due-date ageing are likewise
  listed as unavailable with reasons (no rental invoice records exist; invoices carry no due
  dates) instead of being estimated. Authorisation mirrors the invoice register:
  `invoice:manage` with GLOBAL/COMPANY scope (Finance Officer, Super Administrator); read-only
  and own-scope grants are denied. Data coverage (issued invoices carrying an issue timestamp,
  payments with method/reference recorded) is reported as numerator/denominator pairs per
  `docs/KPIS.md`.
- **Source:** FIN-07 in `richie-tms-standing-brief.md` ("totals reconcile to transaction records;
  margin only when cost and revenue data are sufficient"); KPI formulas in `docs/KPIS.md` (RPT-03).
  Recorded for ratification at the Phase 1C gate.

## D-064 — Reports and CSV exports (RPT-02, RPT-03, RPT-04)
- **Decision:** Reports are read-only services under `src/modules/reports/` whose numbers come only
  from persisted records, following the formulas in `docs/KPIS.md`. **RPT-02** counts booking flow
  from `BookingStatusHistory` event timestamps in the window (distinct bookings per transition:
  received →Pending, confirmed →Accepted, boarded →Boarded, completed →Completed, cancelled
  →Cancelled, rejected →Rejected); no-shows are cancellations whose history reason records a
  passenger no-show (both the dispatch and driver paths write that reason, and driver NO_SHOW
  events corroborate). Passengers transported = distinct bookings reaching Completed in the
  window. Pickup delay compares each BOARD driver-event time with the trip's planned start
  (`tripDate` + `plannedStartTime` HH:MM; Africa/Accra is UTC year-round); because the on-time
  threshold is still unset (owner policy), the on-time *rate* is reported as insufficient data
  while average delay (all samples, and late-only), sample size and coverage
  (boarded pickups lacking a planned start or a BOARD event are excluded and counted) are shown.
  Route utilisation = Σ boarded-or-completed passengers / Σ `capacityLimit` over Completed trips
  in the window that have both a capacity and a manifest; other trips are counted as excluded.
  Vehicles have no persisted operational status, so the fleet section reports recorded category
  counts, active safety blocks and archived counts, plus document-expiry counts from the vehicle
  date fields (insurance / roadworthiness / registration) and driver licences — expiring inside
  the window and already expired — with downtime and fuel/mileage declared insufficient data (no
  status history, no fuel records). Maintenance shows work orders by status with recorded cost
  sums (labour+parts+other) and a cost-data coverage pair. Contract performance is insufficient
  data until service-level targets are defined. **RPT-03** reuses the FIN-07 dashboard (D-063) for
  its reconciled all-time totals and adds windowed revenue by client and by contract service type
  (standing invoices by their ISSUED history timestamp), windowed payments by method, and the
  point-in-time outstanding-invoice list; expenses, cost per trip/passenger and margin remain
  insufficient data. **RPT-04**: both reports accept the same optional filters (date window
  ≤ 366 days, client, route, driver, vehicle, service type, status) applied inside the
  permission-scoped queries — never after the fact — and every report has a CSV export produced
  from the same service result, carrying filter period, generation time, timezone
  (Africa/Accra), formula and coverage metadata lines, so an export can never contain records
  the exporter may not see. Authorisation uses the seeded `report:export` permission:
  RPT-02 requires GLOBAL/OPERATIONAL/DISPATCH_SCOPE/FLEET_SCOPE, RPT-03 requires
  GLOBAL/FINANCE_SCOPE (per `docs/PERMISSIONS.md`); exports inherit exactly the same checks as
  the report they serialize.
- **Source:** RPT-02/RPT-03/RPT-04 in `richie-tms-standing-brief.md` §7 and the Phase 1C prompt in
  `richie-tms-phase-prompts.md` (workflows A/B/C/F visible in reports; KPIs matching
  `docs/KPIS.md` with coverage; permission-scoped exports). Recorded for ratification at the
  Phase 1C gate.

## D-065 — Passenger portal identity, self-service bookings and feedback (PAX-01)
- **Decision:** A passenger login is bound to exactly one employee record by an explicit, audited
  link — `Employee.userId` (unique, nullable) with `linkPassengerAccount` /
  `unlinkPassengerAccount` (`employee:manage` GLOBAL/COMPANY; the user must be ACTIVE and hold a
  PASSENGER assignment in the company; one user ↔ one employee; unlink first to re-link),
  mirroring the driver account link and D-059's fail-closed binding rule. Portal services resolve
  the caller only through that link (`PassengerNotLinkedError` otherwise, including archived
  employees) and never accept an employee id from the client. The portal shows the passenger's
  own profile projection (name, client, department, work location, shift, approved pickup/drop-off
  points, eligibility — never home address, accessibility needs or internal notes), their
  transport arrangements (active contracts and the client's routes, i.e. the approved options),
  and their journeys with passenger-facing statuses mapped from booking + trip state: Requested
  (Pending), Confirmed (Accepted), Assigned to trip, Driver en route (trip Dispatched/In
  Progress), Delayed (trip Delayed while assigned), Picked up (Boarded), Completed, Cancelled
  (Cancelled/Rejected). The live map/ETA is not shown (PAX-02 is Phase 2). Journey requests reuse
  the booking creation core, so eligibility, duplicate-journey, contract-policy and creation
  cut-off rules apply identically; the employee is always the linked record. Passengers may
  cancel their own booking only while it is Pending or Accepted — once Assigned, cancellation is
  an operations action (dispatch/no-show flows), and the portal says so. Feedback is a new
  append-only `PassengerFeedback` record (optional 1–5 rating, required comment), one per
  booking, submittable only for the passenger's own Completed journeys. No free-text "transport
  policy" setting exists, so the portal presents the factual arrangements instead of inventing
  policy text.
- **Source:** PAX-01 in `richie-tms-standing-brief.md` §7 (profile, approved options, request
  eligible journeys, references/status, pickup time and location, history, cancel eligible
  bookings, feedback, company transport policy; the eight named journey states). Recorded for
  ratification at the Phase 1C gate.

## D-066 — Rental customer portal: audited customer link, own-request self-service, honest quotation/payment state (RNT-09; Phase 1C)

Date: 2026-10-21. Status: decided for Phase 1C construction; recorded for ratification at the Phase 1C gate.

1. **Customer login identity.** `Customer.userId` is a unique nullable link to a login (the PAX-01 pattern);
   `linkCustomerAccount`/`unlinkCustomerAccount` require `customer:manage` at GLOBAL or COMPANY scope, an
   ACTIVE login holding a `RENTAL_CUSTOMER` assignment in the company, and enforce one login to one customer;
   actions are audited. The portal resolves every request only through the link and never accepts a customer id
   from the client.
2. **Self-service over the existing request workflow.** Customers create Draft enquiries through the same
   rental-request creation core (source forced to `APP`; the customer is always the linked record), edit only
   their own Draft, and submit through the identical submission core so the governed prerequisites
   (service date/time, pickup, destination, passengers, return time or duration) apply unchanged. Withdrawal
   is the one new transition: own `Draft` or `Submitted` requests may move to `Cancelled` with a reason
   (history + audit); `Under Review` and later states remain operations-controlled. The database transition
   guard and history CHECK are extended with exactly `Draft → Cancelled` and `Submitted → Cancelled`; the
   staff transition table is unchanged, so staff cannot cancel through their path.
3. **Quotations and payments are stated, never fabricated.** No customer quotation model exists yet (internal
   pricing worksheets are explicitly not quotations and are never shown to customers), and rentals have no
   invoices. The portal shows explicit "no quotation issued" and "no payment due" states; accepting a quotation
   becomes possible only when formal quotation issuance (RNT-04/05) lands.
4. The profile projection shows the customer's own contact and billing details, never internal notes.

## D-067 — Operations dashboard: permission-scoped, point-in-time operational picture (Phase 1C)

Date: 2026-10-21. Status: decided for Phase 1C construction; recorded for ratification at the Phase 1C gate.

1. Role dashboards already exist for drivers (`/driver`), dispatchers (`/dispatch`), corporate HR
   (`/corporate`), finance (`/finance`), passengers (`/passenger`) and rental customers
   (`/rentals/portal`). The remaining gap, an Operations Manager landing page, is `/operations`.
2. Access requires `trip:manage` or `booking:manage` at GLOBAL or COMPANY scope, matching the
   staff surfaces it summarises; everything is company-scoped and read-only (no new write paths).
3. The dashboard is a point-in-time snapshot, never an estimate: today's trips (Africa/Accra) by
   status with resourcing flags, the pending-booking decision queue, accepted-but-unassigned
   bookings, active vehicle safety blocks, and driver/vehicle documents expired or expiring
   within 30 days. Lists are capped and labelled with their totals; no derived KPI is invented.

## D-068 — Phase 2 opens; notification service starts with the in-app channel (NTF-01)

Date: 2026-10-21. Status: decided for Phase 2 construction.

1. **Phase 2 opening.** The owner directed Phase 2 to start on 2026-10-21 (checkpoint answer
   "Start Phase 2 now"). Fedora verification of Phase 1C (`./scripts/verify-phase1c.sh`) and
   formal ratification of D-061–D-067 remain outstanding and continue in parallel; they are not
   recorded as passed here. Phase 2 order follows `richie-tms-phase-prompts.md`: notifications,
   incidents/breakdown, boarding verification, driver offline queue, preventive-maintenance
   reminders, two-factor authentication.
2. **In-app first (NTF-01).** A `Notification` record per recipient login, company-scoped, with
   channel (`IN_APP` now; `SMS`/`EMAIL` reserved for NTF-02/03), delivery status, and a dedupe
   key unique per (company, recipient, channel, key) so duplicate events never double-notify.
   In-app delivery happens inside the same governed transaction as the event (atomic, and
   in-app "delivered" means stored — never claimed before storage). Users are never notified
   about their own actions.
3. **Preferences.** `NotificationPreference` per (company, user): `inApp`/`sms`/`email`
   switches, default on. The in-app switch is enforced from day one; sms/email switches are
   stored now and enforced when those adapters land.
4. **Emit points (slice 1).** Booking created/status-changed/assigned-to-trip → the linked
   passenger; rental request status changes → the linked customer. Templates are a code-side
   registry with passenger/customer-friendly wording; admin-editable template text is deferred
   (no settings keys exist yet) and is not claimed as configurable in the UI.
5. **Own-inbox only.** Notification reads require no new permission vocabulary: a login can
   only ever list, read and set preferences for its own notifications.

## D-069 — SMS delivery: provider interface, honest delivery states, explicit dispatch (NTF-02)

Date: 2026-10-21. Status: decided for Phase 2 construction; recorded for ratification at the Phase 2 gate.

1. **Interface before provider.** SMS sending goes through an `SmsProvider` interface. The one
   concrete adapter targets the Arkesel v2 HTTP API shape and activates only when
   `SMS_PROVIDER=arkesel` with `ARKESEL_API_KEY` and `ARKESEL_SENDER_ID` set; otherwise the
   feature is **Not configured** and nothing is sent or claimed sent. Provider availability and
   pricing verification with the vendor remains an owner task; no delivery is ever fabricated.
2. **Delivery truthfulness.** SMS rows start `PENDING`; a provider send moves them to `SENT`
   (accepted, not delivered); only a provider delivery confirmation (secret-checked webhook)
   may mark `DELIVERED`. Failures record attempts (max 3) and the provider error, with a
   backoff timestamp; exhausted rows stay `FAILED` for staff visibility.
3. **Fan-out at emit time.** When a passenger (linked employee telephone) or rental customer
   (customer telephone) is notified and their SMS preference is on, a `PENDING` SMS row is
   stored beside the in-app row with its own dedupe key. No recorded telephone → no SMS row.
4. **Explicit dispatch.** Sending is performed by `dispatchPendingSmsNotifications`, invoked
   from a Super-Admin-only endpoint (and reusable by an external scheduler); the app has no
   background worker, and the UI/docs say so rather than implying real-time sending.

## D-070 — Email delivery: SMTP adapter, "sent to mail server" is the strongest claim (NTF-03)

Date: 2026-10-21. Status: decided for Phase 2 construction; recorded for ratification at the Phase 2 gate.

1. Email goes through an `EmailProvider` interface with one SMTP adapter (nodemailer),
   activated only by `EMAIL_PROVIDER=smtp` with `SMTP_HOST`, `SMTP_FROM` and credentials;
   otherwise the feature is **Not configured** and nothing is sent or claimed sent.
2. Email has no delivery-report channel, so a successful SMTP handover marks the row
   `SENT` ("handed to the mail server") — never `DELIVERED`. Failures retry with the same
   attempts/backoff discipline as SMS (max 3, D-069).
3. Fan-out mirrors SMS: at emit time, linked passengers/customers get a PENDING email row
   addressed to their **login email** (notifications belong to the login), gated by their
   email preference, with its own dedupe key. Dispatch is explicit via a Super-Admin
   endpoint, exactly as for SMS.

## D-071 — Incidents: governed records first, breakdown response on top (INC-01/02)

Date: 2026-10-21. Status: decided for Phase 2 construction; recorded for ratification at the Phase 2 gate.

1. **INC-01 (this slice).** `Incident` + sequenced `IncidentStatusHistory` with database guards in
   the house pattern (status CHECK, transition guard function, history CHECK, deferred
   history-required trigger, append-only history). Lifecycle: `Open → Acknowledged →
   In Progress → Resolved → Closed`, with `Open → In Progress`, `Acknowledged → Resolved` and
   `Resolved → In Progress` (reopen) also allowed; `Closed` is terminal. Types:
   breakdown, accident, driver unavailable, traffic delay, missed pickup, complaint, vehicle
   defect, safety concern, other. Severity: low, medium, high, critical. Resolution requires
   recorded resolution notes.
2. **Access.** Incident handling reuses `trip:manage` at GLOBAL/COMPANY scope (the people who
   run trips); no new permission vocabulary is invented. Drivers report through their linked
   driver identity, only against their own active trips. `peopleAffected` is restricted
   information shown only on the incident-manager detail.
3. **Dispatcher alert.** Creating an incident (either path) notifies every login holding
   `trip:manage` at GLOBAL/COMPANY in the company, each exactly once (dedupe per incident and
   recipient), never the reporter themselves.
4. **INC-02 (next slice)** builds the breakdown response on top: affected passengers,
   replacement vehicle/driver suggestions, audited replacement confirmation on active trips
   (the Planned/Ready-only resource rule in dispatch stays untouched), optional safety block
   and work order via the existing maintenance services, passenger notification, and
   resolution through the same transition function.

## D-072 — Breakdown response: replacement on active trips (INC-02)

Date: 2026-10-21. Status: decided for Phase 2 construction; recorded for ratification at the Phase 2 gate.

1. **Suggestions.** For the incident's trip, the system lists replacement vehicles that are
   not archived, not under an active safety block, and not committed to another active
   trip that day (flagging whether they fit the passenger count), and replacement
   drivers who are active, not archived, licence-valid, and not committed that day.
2. **Confirmation.** A dispatcher confirms a replacement vehicle and/or driver on an
   **active** trip (Ready for Dispatch, Dispatched, In Progress, Delayed, Interrupted)
   while the incident is Open, Acknowledged or In Progress. The Planned/Ready-only
   rule in dispatch resource assignment is unchanged. Archived/safety-blocked vehicles
   and inactive or licence-expired drivers refuse outright; day-overlap conflicts and
   seat shortfalls require an explicit override with a reason. The change is audited
   with previous and new assignments, so original and replacement history is kept.
3. **Follow-ups.** On confirmation the dispatcher may also safety-block the original
   vehicle ("Out of Service") and/or open a maintenance work order, through the
   existing maintenance services; if the dispatcher lacks maintenance access the
   replacement still stands and the UI reports plainly what was not applied.
4. **Passengers.** Passengers assigned or boarded on the trip are notified through
   NTF-01 (plus SMS/email copies where configured). The incident stays open until a
   dispatcher resolves it through the normal transition.

## D-073 — Boarding verification: per-booking one-time codes (DRV-03)

Date: 2026-10-21. Status: decided for Phase 2 construction; recorded for ratification at the Phase 2 gate.

1. **Code.** When a booking is assigned to a trip, the system issues a per-booking
   six-digit boarding code from a cryptographically secure random source. The
   passenger sees only **their own** code (passenger view); the driver manifest
   never shows codes (minimal passenger data). Codes expire at the end of the
   trip day (Africa/Accra = UTC) and are **single-use**: a successful
   verification consumes the code. Reassignment regenerates the code.
2. **Policy.** The typed setting `trips.boarding_code_policy` accepts
   `{ "mode": "DISABLED" | "REQUIRED" }`. While the setting is unset, behaviour
   stays exactly as DRV-02 shipped (driver taps to board) — a deliberate,
   recorded choice so existing operations are not broken by an upgrade; the
   owner can require codes at any time from Settings.
3. **Verification.** Under `REQUIRED`, boarding needs the passenger's code.
   Every attempt (success or failure) is recorded with the method and result.
   A driver may instead board a passenger manually, but only with a recorded
   reason of at least 8 characters ("controlled manual verification").
   Under `DISABLED`, boardings are recorded as manual-with-reason too when a
   reason is supplied, otherwise as plain driver confirmations.
4. **Placement.** Verification happens inside the existing idempotent driver
   event (`BOARD`), so DRV-05 offline retries keep their exactly-once
   guarantee.

## D-074 — Driver offline queue: events only, server stays the judge (DRV-05)

Date: 2026-10-21. Status: decided for Phase 2 construction; recorded for ratification at the Phase 2 gate.

1. **Scope — exactly these actions work offline:** the driver trip events
   (`START`, `DELAY`, `RESUME`, `INTERRUPT`, `COMPLETE`, `BOARD`, `NO_SHOW`,
   `REPORT_DEFECT`) — everything that already flows through the idempotent
   `postDriverEvent`. Incident reports, settings, and every staff action still
   require connectivity. No service worker or app-shell caching is introduced;
   pages themselves need one successful load.
2. **Queue.** When a send fails at the network layer, the event (with the
   idempotency key generated once for that tap) is stored in `localStorage` on
   the phone and the driver sees "pending sync". Validation answers from the
   server are shown immediately and never queued — they need the driver.
3. **Sync.** On page load, on the browser `online` event, and on demand
   ("Sync now"), queued events replay in order. Server-confirmed events
   (including `duplicate: true` replays) drop off the queue. A server conflict
   (same key, different event — 409) or rejection (400) parks the entry as
   conflict/failed with the server's message until the driver dismisses it;
   nothing is silently retried or dropped.
4. **Identity.** Queue entries carry no credentials. At sync time the server
   applies the event under whoever is signed in and enforces trip ownership —
   on a shared phone, another driver's entries fail visibly rather than
   applying under the wrong name.
