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
- **Limits:** D-019 specifies who may apply safety blocks. Transition-specific preconditions and operational conflict/replacement workflows remain undefined. The state machine and assignment/maintenance/incident modules are not implemented; do not expose status controls or claim these protections are active yet.

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
