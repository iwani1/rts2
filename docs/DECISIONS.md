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
