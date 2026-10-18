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
