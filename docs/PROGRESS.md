# Feature progress

Phase 0 foundation plus the first Phase 1A authentication slice. Backlog status is tracked per ID; scaffolding is not feature completion.

| Feature ID | Status | Notes |
|---|---|---|
| AUTH-01 | In Progress | Better Auth login/logout, expiring PostgreSQL sessions, DB-backed rate limit, account-active gate and login UI; direct DB integration and HTTP smoke pass. Needs clean CI standard-engine generation/migration verification and remaining workflow hardening. |
| AUTH-02 | Not Started | Invitation, activation, suspension/reactivation UI and services not implemented; invitation delivery and expiry/revocation policy still need owner decision. One-time first-admin method is selected and implemented as a local CLI. |
| AUTH-03 | Not Started | Password reset not implemented; delivery/verification channel requires approval. |
| AUTH-04 | In Progress | Owner-approved role/grant schema, company-scoped authorization resolver, audited role service and first-admin bootstrap added. Super Administrator-only role-directory/assign/revoke APIs and a one-time single-operator company bootstrap CLI exist; UI, domain repository filtering, and PostgreSQL route-level tests remain. |
| AUTH-05 | Not Started | Profile and login-history UI not implemented. |
| AUTH-06 | Not Started | Phase 2. |
| AUD-01 | In Progress | Auth session and role assignment/revocation/initial-bootstrap events are persisted; append-only trigger verified against real PostgreSQL. A Super Administrator-only paginated API and responsive read-only viewer exist; broader event coverage and browser/PostgreSQL route verification remain. |
| SET-01 | In Progress | No-default policy catalogue, required-setting reader, globally authorized write service and Super Administrator settings-status/update API exist; writes are audited transactionally. Three disposable-PostgreSQL integration tests passed on Fedora. Per-setting role scopes, typed policy schemas and configuration UI remain. |
| MIG-01 | Not Started | CSV import not started; customer import depends on CUS-01 and driver import on FLT-04. |
| CUS-01 | Not Started | No feature implementation; Phase 1+ approval required. |
| RNT-01 | Not Started | No feature implementation; Phase 1+ approval required. |
| RNT-02 | Not Started | No feature implementation; Phase 1+ approval required. |
| RNT-03 | Not Started | No feature implementation; Phase 1+ approval required. |
| RNT-04 | Not Started | No feature implementation; Phase 1+ approval required. |
| RNT-05 | Not Started | No feature implementation; Phase 1+ approval required. |
| RNT-06 | Not Started | No feature implementation; Phase 1+ approval required. |
| RNT-07 | Not Started | No feature implementation; Phase 1+ approval required. |
| RNT-08 | Not Started | No feature implementation; Phase 1+ approval required. |
| RNT-09 | Not Started | No feature implementation; Phase 1+ approval required. |
| WEB-01 | Not Started | No feature implementation; Phase 1+ approval required. |
| FLT-01 | In Progress | Vehicle register schema/API/UI supports core factual fields and a manager-only usual-driver link to an active same-company driver. Photo storage, document records/files, and browser vehicle edit/save with the link remain. |
| FLT-04 | In Progress | Driver register schema/API/UI supports company-scoped searchable records with only brief-listed details and full fleet-manager create/edit/archive; active drivers can be linked as vehicles' usual drivers by managers with both grants. Browser verification, dispatcher field-level scope decision, account-to-driver linking, and policy-defined status/availability workflows remain. Dispatcher and Driver OWN_PROFILE listing fail closed until the field projection and verified account-link behavior are implemented. |
| FLT-02 | Not Started | Owner approved the seven status names, no-default/manual-edit boundary, derived Reserved/Assigned/On Trip states, and safety-blocking principle in D-016. Transition actors, active-assignment handling and maintenance/inspection release rules remain undefined; no status implementation yet. |
| FLT-03 | Not Started | No feature implementation; Phase 1+ approval required. |
| FLT-05 | Not Started | No feature implementation; Phase 1+ approval required. |
| MNT-01 | Not Started | No feature implementation; Phase 1+ approval required. |
| MNT-02 | Not Started | No feature implementation; Phase 1+ approval required. |
| MNT-03 | Not Started | No feature implementation; Phase 1+ approval required. |
| MNT-04 | Not Started | No feature implementation; Phase 1+ approval required. |
| CLI-01 | Not Started | No feature implementation; Phase 1+ approval required. |
| CLI-02 | Not Started | No feature implementation; Phase 1+ approval required. |
| CLI-03 | Not Started | No feature implementation; Phase 1+ approval required. |
| EMP-01 | Not Started | No feature implementation; Phase 1+ approval required. |
| EMP-02 | Not Started | No feature implementation; Phase 1+ approval required. |
| EMP-03 | Not Started | No feature implementation; Phase 1+ approval required. |
| RTE-01 | Not Started | No feature implementation; Phase 1+ approval required. |
| RTE-02 | Not Started | No feature implementation; Phase 1+ approval required. |
| RTE-03 | Not Started | No feature implementation; Phase 1+ approval required. |
| RTE-04 | Not Started | No feature implementation; Phase 1+ approval required. |
| RTE-05 | Not Started | No feature implementation; Phase 1+ approval required. |
| BKG-01 | Not Started | No feature implementation; Phase 1+ approval required. |
| BKG-02 | Not Started | No feature implementation; Phase 1+ approval required. |
| BKG-03 | Not Started | No feature implementation; Phase 1+ approval required. |
| BKG-04 | Not Started | No feature implementation; Phase 1+ approval required. |
| BKG-05 | Not Started | No feature implementation; Phase 1+ approval required. |
| BKG-06 | Not Started | No feature implementation; Phase 1+ approval required. |
| TRP-01 | Not Started | No feature implementation; Phase 1+ approval required. |
| TRP-02 | Not Started | No feature implementation; Phase 1+ approval required. |
| DSP-01 | Not Started | No feature implementation; Phase 1+ approval required. |
| DSP-02 | Not Started | No feature implementation; Phase 1+ approval required. |
| DSP-03 | Not Started | No feature implementation; Phase 1+ approval required. |
| DSP-04 | Not Started | No feature implementation; Phase 1+ approval required. |
| DRV-01 | Not Started | No feature implementation; Phase 1+ approval required. |
| DRV-02 | Not Started | No feature implementation; Phase 1+ approval required. |
| DRV-03 | Not Started | No feature implementation; Phase 1+ approval required. |
| DRV-04 | Not Started | No feature implementation; Phase 1+ approval required. |
| DRV-05 | Not Started | No feature implementation; Phase 1+ approval required. |
| PAX-01 | Not Started | No feature implementation; Phase 1+ approval required. |
| PAX-02 | Not Started | No feature implementation; Phase 1+ approval required. |
| INC-01 | Not Started | No feature implementation; Phase 1+ approval required. |
| INC-02 | Not Started | No feature implementation; Phase 1+ approval required. |
| FIN-01 | Not Started | No feature implementation; Phase 1+ approval required. |
| FIN-02 | Not Started | No feature implementation; Phase 1+ approval required. |
| FIN-03 | Not Started | No feature implementation; Phase 1+ approval required. |
| FIN-04 | Not Started | No feature implementation; Phase 1+ approval required. |
| FIN-05 | Not Started | No feature implementation; Phase 1+ approval required. |
| FIN-06 | Not Started | No feature implementation; Phase 1+ approval required. |
| FIN-07 | Not Started | No feature implementation; Phase 1+ approval required. |
| FIN-08 | Not Started | No feature implementation; Phase 1+ approval required. |
| NTF-01 | Not Started | No feature implementation; Phase 1+ approval required. |
| NTF-02 | Not Started | No feature implementation; Phase 1+ approval required. |
| NTF-03 | Not Started | No feature implementation; Phase 1+ approval required. |
| RPT-01 | Not Started | No feature implementation; Phase 1+ approval required. |
| RPT-02 | Not Started | No feature implementation; Phase 1+ approval required. |
| RPT-03 | Not Started | No feature implementation; Phase 1+ approval required. |
| RPT-04 | Not Started | No feature implementation; Phase 1+ approval required. |
| RPT-05 | Not Started | No feature implementation; Phase 1+ approval required. |
| GPS-01 | Not Started | No feature implementation; Phase 1+ approval required. |

## Phase 0 evidence (2026-10-18)
- Repository initially contained only the standing brief and phase prompts; no application, DB, or deployment config.
- Added initial scaffold, Phase 0 docs, empty Prisma migration baseline (extension only), CI and `/api/health`.
- Node 22.22.3 and npm 10.9.2 available. Docker command not installed. Hosting target unspecified.
- `npm run typecheck`: pass. `npm run lint`: pass. `npm test`: pass (one health-handler unit test). `npm run build`: pass.
- Started the production server; live `GET /api/health` returned `{"status":"ok","service":"richie-tms"}`.
- Initial `npx prisma generate` attempt failed downloading Prisma native engines; later Phase 1A config enabled Prisma Client generation without Rust binaries. Docker is still unavailable.
- `npm audit`: 13 dependency findings (2 moderate, 9 high, 2 critical); major upgrades are implicated. Must resolve before production.
- Reviewed accessible supplied reference homepages/galleries and selected Navbar, CTA, Scrolltide component and Refero style detail pages; documented concrete patterns and limitations in `REFERENCE_RESEARCH.md`. Gated Mobbin flows/Scrolltide source and unavailable Godly destination are stated honestly. Detailed UI-specific research remains due before UI implementation.


## Phase 1A session record (2026-10-18)

Started the first Phase 1A vertical slice only: authentication foundation (AUTH-01), corresponding audit event persistence (AUD-01), and settings persistence schema (SET-01). Feature code is **in progress, not done**.

- Added Better Auth configuration using PostgreSQL/Prisma adapter, database rate-limit storage, five-per-minute email sign-in limit, disabled public sign-up, minimum 12-character password, eight-hour sessions, and production-secure cookies.
- Added sign-in UI, sign-out control, protected workspace root, account-active session policy, Prisma PostgreSQL driver adapter, auth/audit/settings/tenant schema and initial migration. Auth create/revoke events are logged; SQL trigger rejects update/delete on audit rows.
- Tests: unit health and active-account policy tests pass. Four Better Auth integration tests against real PostgreSQL pass: sign-in/session persistence/get-session/sign-out and audit events; immutable audit-row enforcement; suspended-account session denial; database-backed rate limiting; disabled public registration. The integration test is direct handler-to-PostgreSQL, not Playwright UI automation.
- After the authentication changes, `npm ci`, `npm run typecheck`, `npm run lint`, `npm test` (2 unit tests), `npm run test:integration` (4 real-Postgres tests), and `npm run build` passed. Build used explicitly supplied non-production test environment variables and `force-dynamic` on the protected root.
- Production server HTTP smoke flow against the seeded local PostgreSQL user: `/login` 200; sign-in 200; `get-session` 200 with correct user; protected workspace 200; sign-out 200; subsequent session query returned JSON `null`.
- Resolved: `npx prisma generate` and `npx prisma validate` now pass with Prisma 6.19.3 `engineType = "client"` and the JS schema engine. TypeScript uses generated Prisma model types. An ephemeral, untracked PostgreSQL 15.18 server (with `btree_gist`) was installed via npm and run locally. Both migration SQL files were applied to a fresh test database with the test-only runner; migration DDL and data persistence were exercised against real PostgreSQL.
- Open business choices at this point included the role matrix and first-admin method; both were subsequently resolved on 2026-10-18. Invitation/reset channel and lifecycle, pricing, tax, deposit and cancellation policies remain unset. The one-time bootstrap creates the initial account only; no public registration or invitation flow exists.
- Dependency audit still reports 13 vulnerabilities (2 moderate, 9 high, 2 critical). Resolve before production.
- Remaining validation: `npm run db:migrate:deploy` (Prisma classic/native engine) has not been run because its binary host is blocked here. The JS migration engine attempt failed on PostgreSQL catalog type `name`; it is not the deployment path. CI must run the classic migration on PostgreSQL 16 before this slice can be accepted.
- At the close of this earlier record: verify classic migration in CI and finish AUTH/AUD/SET acceptance criteria. Role matrix and first-admin decisions are now resolved; public registration remains disabled.


## Phase 1A authorization continuation (2026-10-18)

The owner approved the role/permission matrix. The first-admin method is now explicitly selected: one-time local interactive CLI with hidden password entry, refusal when an active Super Administrator already exists, transaction/advisory-lock protection, and an append-only bootstrap audit event; non-TTY invocation was smoke-checked to fail immediately without prompting. Public self-registration remains disabled. See `PERMISSIONS.md`, `OPEN_QUESTIONS.md`, and `SETUP_AND_DEPLOYMENT.md`.

- Added `Role`, `RolePermission`, and company-bound `UserRoleAssignment` persistence with seeded approved role grants, active-assignment uniqueness, non-empty reasons, and a DB check that global Super Administrator assignments have no company while all other assignments do.
- Added deny-by-default scope resolution in `src/modules/auth/permissions.ts`; inactive users are denied, company grants do not cross company IDs, global grants require a global Super Administrator assignment, and own/assigned labels require matching user context. Domain services still must apply the returned data and field restrictions in repository queries. Finance delegated quotation approval is explicitly denied until the policy is defined and enforced.
- Added audited role assignment/revocation service; changes require an active global Super Administrator, self-escalation is blocked, and revoking the final active Super Administrator is blocked. At this record's point, no role UI/API existed; a Super Administrator-only API was added in the continuation below (UI remains absent).
- PostgreSQL integration evidence before the final Prisma engine-config removal: all 7 auth/authorization integration tests passed against an ephemeral PostgreSQL 15.18 database. These tests exercised company boundaries, own-record scope, audited assignment/revocation, sign-in/session/logout, suspended-account denial, DB-backed rate limits and disabled public registration. Since that run, one Finance delegated-approval fail-closed test and a fleet settings grant were added; neither has run against PostgreSQL in the current tree.
- Honored the explicit request to remove Prisma `engineType`: removed the generator setting, conditional engine config and PostgreSQL driver adapter; standard Prisma Client and migration engines are now used. Clean `prisma generate` and `prisma validate` were attempted after this change but both tried to fetch native binaries from `binaries.prisma.sh` and failed due the sandbox network restriction. The current generated files under ignored `node_modules` are from the earlier engine-less configuration, so the passing typecheck/build after removal are not proof of a clean standard-engine generation. CI is configured to regenerate, deploy migrations and run tests against PostgreSQL 16; that result remains a required gate.
- Latest checks after source/config changes: `npm run typecheck`, `npm run lint`, `npm test` (2 unit tests), `npm run build`, and `git diff --check` passed using the existing generated client. The classic/native migration path and current-tree PostgreSQL integration have not been reverified after the Prisma engine change.
- AUTH-01, AUTH-04, AUD-01 and SET-01 remain **In Progress**. AUTH-02/03/05 and other features remain unfinished; no later feature slice was started. Invitation/reset channels, login-history/retention policy, scoped repository filters, role UI, broader audit coverage and audit viewer remain open. `npm audit` still reports 13 findings (2 moderate, 9 high, 2 critical).

## Phase 1A continuation — Super Administrator role API (2026-10-18)

- Added a Super Administrator-only role directory/assignment endpoint and an assignment-revocation endpoint. Actor IDs are derived from the authenticated session; clients cannot submit actor or target overrides. Mutations continue to use the transactional authorization/audit service.
- Added seven unit route tests for unauthenticated access, administrator gating, assignment listing, session-derived actor, denied changes, request spoofing and revocation; all pass. Real PostgreSQL route-level tests remain. Sandbox TypeScript checking is blocked by the ungenerated Prisma Client; the user's Fedora setup generated it successfully.
- User confirmed on Fedora that migrations applied, the first-admin bootstrap completed with hidden password input, and the authenticated workspace rendered. This verifies the local login path, not the unfinished role API or Phase 1A exit criteria.
- The Fedora Compose issue was fixed by using the fully-qualified Docker Hub PostgreSQL image and removing the SELinux-blocked init-file mount; `btree_gist` is created by the baseline migration.
- At this record's point, the role UI, route APIs, audit viewer and settings registry were still outstanding. Later continuations below have added the role APIs, audit viewer and settings foundations; PostgreSQL route-level verification, remaining auth workflows, role/settings UI and all other Phase 1A exit criteria remain. Do not proceed to Phase 1B until all exit criteria pass and are approved.

## Phase 1A continuation — audit API foundation (2026-10-18)

- Added `GET /api/admin/audit-events`, restricted to an active global Super Administrator, cursor-paginated with a fixed 50-event page, and `Cache-Control: private, no-store`. It deliberately excludes IP addresses. At this record's point, this was an API foundation only; the viewer UI was added in the continuation below.
- Added unit tests for authentication/authorization denial, rejection of unsupported filters, pagination bounds/cursor and no-store behavior.
- Latest sandbox checks: lint passes; `npm test` passes 13 unit tests across five test files. Typecheck cannot run here because the sandbox install has no generated Prisma model client; typecheck passed on the user's Fedora machine before this audit route was added, so rerun it there after pulling.

## Phase 1A continuation — audit viewer (2026-10-18)

- Added `/admin/audit`, a read-only server-rendered audit table linked from the workspace only when the signed-in user has the global audit grant. The page rechecks permission on every request, shows 50 newest events per page, localizes times to `Africa/Accra`, excludes IP addresses, and provides a keyboard-scrollable responsive table. It uses only persisted events; no demo rows or guessed business data.
- Added the audit-viewer mapping to `REFERENCE_RESEARCH.md`: the existing responsive static-nav and compact table/token references inform layout, while Mobbin authenticated audit flows remain gated and no claim of workflow inspection is made.
- The audit API and viewer are read-only and Super Administrator-scoped. Audit event retention, broader event coverage and database/browser end-to-end verification remain open; AUD-01 stays In Progress.
- Latest sandbox checks after the viewer change: lint passes; `npm test` passes 13 unit tests. Typecheck and production build still require a generated Prisma Client and must be verified on the user's Fedora setup/CI; no Prisma schema or migration changed in this slice.

## Phase 1A continuation — policy settings registry foundation (2026-10-18)

- Added a typed catalogue of the required policy keys named in the brief (including pricing, distance/time, tax, deposit, quotation/cancellation, shifts, reminder, on-time, inactive-contract booking and boarding-code policies). It stores no defaults and creates no rows.
- Added a company-scoped status reader and a required-value reader. Missing or `configured=false` settings raise a typed error with the dependent feature IDs, so callers can block actions instead of silently substituting a value.
- Added six unit tests for catalogue coverage/no defaults, empty status, malformed/unconfigured blocking and unknown keys. Latest sandbox checks: lint passes and `npm test` passes 19 tests. At this record's point there was no write service; a conservative global-Super-Administrator write service was added in the continuation below. No API/configuration UI or typed per-key policy validator exists yet, and SET-01 remains incomplete.

## Phase 1A continuation — audited setting writes (2026-10-18)

- Added a write service for registered setting keys. Until management defines per-key role scopes, writes require an active global Super Administrator. The service accepts JSON values only, requires a reason, verifies the company exists, and atomically upserts the setting plus a `SETTING_UPDATED` audit event. The audit record stores the setting key/reason, not the value. It creates no default or company record.
- Added unit tests for successful audited write, denial for non-Super Administrators, nonexistent companies, and rejected null/invalid values. At this record's point the settings API and company bootstrap remained open; the owner later confirmed the single-operator tenant and both were implemented in the continuation below. Per-key shape validation, configuration UI and real PostgreSQL transaction tests remain. Settings values stay unset until approved and explicitly entered.

## Phase 1A continuation — company bootstrap and settings API (2026-10-18)

- Owner confirmed a single tenant named Richie Transport Services; corporate customers remain domain records, not separate system tenants. Recorded in D-014 and `OPEN_QUESTIONS.md`.
- Added `npm run bootstrap:company -- --confirm`, which requires an active global Super Administrator email, refuses if any `Company` row exists, creates only the approved company row, and appends an audit event transactionally. It creates no policy or operational records and requires no schema migration.
- Added `GET/PUT /api/admin/companies/{companyId}/settings`. Only an active global Super Administrator can access it. GET returns registered-key status without values; PUT requires explicit JSON value and reason and uses the audited writer. No browser settings UI, per-key role policy or per-key semantic schema is implemented.
- Added API and CLI unit tests. Latest sandbox quality checks: lint passes and `npm test` passes 32 unit tests. A disposable-PostgreSQL integration suite now covers unconfigured reads, audited writes and denial for ordinary users; it has not run in this sandbox. User should run typecheck and integration tests after pulling, using the local generated Prisma Client and a `_test` database.

## PostgreSQL authorization test follow-up (2026-10-18)

- The first user-run integration pass exercised 11 PostgreSQL tests: 10 passed, and one authorization assertion failed because a second assigned role legitimately retained `BILLING_LINK_READ` on `trip:dispatch` after revoking the Driver role. The role-revocation check now asserts denial of the Driver-specific `driver:manage` grant instead. This corrects the test expectation for users with multiple roles; no permission code changed.
- After pulling `0786f44`, the user reran the suite against a fresh disposable PostgreSQL database: **3 test files and all 11 integration tests passed** (4 auth, 4 authorization, 3 settings). Better Auth error/warning log lines were from expected negative-path suspended-account and invalid-password tests. This is the current real-PostgreSQL integration result.
- Sandbox lint and all 32 unit tests pass. Sandbox typecheck currently cannot validate because its local generated Prisma Client is stale/missing model types; it reports implicit-any and missing Prisma exports across existing auth/settings files. The user previously confirmed Fedora typecheck passed at `7c51f21`; the subsequent source change was limited to the integration-test assertion. Clean standard-engine generation remains a CI/environment verification requirement.

## Phase 1A — vehicle register base (FLT-01, in progress; 2026-10-18)

- Studied FleetSimple's publicly visible fleet inventory/editor and driver-overview screenshots before UI work; recorded the mapping and access limits in `docs/REFERENCE_RESEARCH.md`. The screenshots inform inventory filtering and grouped editor fields only; no demo information, AI interactions, or marketing patterns were copied.
- Added a `Vehicle` Prisma model and handwritten migration with company-scoped registration uniqueness, non-empty identity checks, positive optional seats, paired nonnegative odometer plus explicit unit, optional compliance/service dates, notes, and archive timestamp. Registration is normalized to uppercase before persistence. No status default, category list, fuel list, ownership default, odometer unit default, or operational vehicle record was seeded.
- Added tenant-filtered fleet service, API and UI: list/search/cursor, create, replace/update, archive (never hard-delete), audit events, active-company guard, and dispatcher-limited read projection; mutation requires full GLOBAL/COMPANY fleet scope. The responsive `/fleet/vehicles` page links from the authenticated workspace when `fleet:manage` is granted.
- Added unit tests for validation and API authentication/session-derived actor, plus real-PostgreSQL integration tests for normalization, tenant scoping, unique registration, permission projections/denials, audited create/update/archive, and archive retention. The user applied all three migrations to a fresh disposable `_test` DB; all 14 integration tests passed across auth, authorization, settings and fleet files. No Better Auth warning indicates suite failure; the invalid-password/suspended-account logs are expected negative-path coverage.
- The user confirmed Fedora `npm run db:generate`, `npm run typecheck`, `npm run lint`, and `npm test` all pass on `2a06978` (38 unit tests). Sandbox lint, unit tests and diff check pass; sandbox typecheck/build remain unverified because its Prisma Client is stale and cannot be regenerated here. No build success is claimed.
- FLT-01 stays In Progress: vehicle photo/document file storage, document records, usual-driver relation and browser end-to-end verification remain. FLT-02/03/04/05 and MIG-01 are not started. The additive migration has not yet been applied to the owner's application database; real-PostgreSQL tests ran only on the disposable `_test` database.

## Opt-in development demo fixture (2026-10-18)

- In response to the owner's request for a synthetic local vehicle test record, added `npm run seed:demo:vehicle -- --confirm-demo`. It creates one reserved `DEMO-GH-001` record only when `NODE_ENV=development`, `APP_URL` and PostgreSQL `DATABASE_URL` are local, the database name is not production-like, and exactly one active company exists. It is idempotent, refuses to overwrite a non-demo vehicle, clearly labels the category/notes, and writes an audit event.
- This is an explicit CLI, not automatic app-startup or migration seeding; production demo data remains prohibited. Six environment-guard unit cases pass as part of 44 unit tests; lint passes, and a production-mode CLI refusal smoke test passed. The command itself has not yet been run against the owner's local database.
- The sandbox typecheck still uses a stale Prisma Client and reports implicit-any/missing Prisma type errors across the existing app and the new transaction callback. The owner previously confirmed `db:generate` and typecheck pass on `2a06978`; rerun generation/typecheck after pulling this script change.

## Vehicle register browser/build check (2026-10-18)

- Owner screenshot confirms `/fleet/vehicles` renders and shows the clearly labelled `DEMO-GH-001` record. This verifies display, not edit/archive or persistence across an application restart.
- Owner ran `npm run build` successfully on `8ba8a73`; Next compiled and typechecked. It emitted two Autoprefixer warnings for `align-items: end` (audit heading and fleet title row). Both CSS declarations have been changed to `flex-end` in the current patch; rebuild after pulling to confirm warning-free output. The owner has not yet reported an edit/save test.

## Login credential URL leak hardening (2026-10-18)

- Owner screenshot showed the login page in an unstyled, non-hydrated state and credential parameters in the address bar. Treat the password as compromised; it must be rotated anywhere reused. No credential value is copied into source or docs.
- Changed the login form's native fallback to `method=post`, added a server redirect that strips email/password query parameters, and set a global `Referrer-Policy: no-referrer` header. Added `/account/security` with an authenticated Better Auth password-change form that revokes other sessions; a future sign-in now has a route to rotate the exposed credential.
- Added a PostgreSQL auth integration case for password change, old-password rejection, new-password sign-in, and revocation of other sessions. The owner ran it on a fresh disposable `_test` database: all **15 integration tests passed** across auth, authorization, fleet and settings; the Better Auth invalid-password warnings are expected negative-path checks.
- Owner pulled `c20bbec` and confirmed Fedora `npm run typecheck`, `npm run lint`, `npm test` (44 unit tests), and `npm run build` all pass; the build has no warnings and includes `/account/security`. Browser use of the password-change form and rotation of the exposed password have not yet been confirmed.
- Likely cause of unstyled page is the dev server being left running while `next build` replaced shared `.next` output; restart dev after build. This is a diagnosis, not yet confirmed on the user's machine.

## Phase 1A — driver register base (FLT-04, in progress; 2026-10-18)

- Added the `Driver` company-scoped schema and handwritten additive migration. The model contains only the driver register data named in the brief plus the driver's name for record identity; status and availability are optional free text with no preloaded values. No contact details, notes or account link are collected; no development/demo driver is seeded. PostgreSQL integration tests use explicitly synthetic records in the disposable `_test` database only.
- Added searchable, cursor-paginated company driver list/detail/create/update/archive service and authenticated API. Create/update/archive are transactional with audit events; archived rows are retained. Writes and reads currently require full GLOBAL/COMPANY scope. Dispatcher `READ_ASSIGN_SUBSET` and Driver `OWN_PROFILE` are denied at this boundary until their field projection and account-link rules can be applied safely; no broad driver collection is exposed to an own-profile-only user.
- Added responsive `/fleet/drivers` UI with a searchable list and manager form for only brief-listed fields. Status/availability are blank unless entered and explicitly described as company-agreed free text. Driver links are restricted to manager scopes. FleetSimple's publicly visible driver overview plus Navbar Gallery/Refero table and navigation guidance informed the page; mapping and limitations are in `REFERENCE_RESEARCH.md`.
- Updated `OPEN_QUESTIONS.md` with unresolved driver status/availability transitions, dispatcher field scope, driver-account identity/linking, and personal-data/retention decisions. Usual-driver relationship to vehicles remains unimplemented; FLT-01 is still in progress.
- Sandbox lint, `git diff --check`, and all 49 unit tests pass. The PostgreSQL driver integration suite and browser create/edit/archive flow have not been run. Sandbox `npm run typecheck` remains blocked by stale generated Prisma model types (including transaction callback implicit-any errors across existing modules); native Prisma engine download is blocked here. The user should run Prisma generation, typecheck, migration deployment, the disposable `_test` integration suite, and browser verification on Fedora before treating this slice as accepted.

## Owner Fedora verification — driver register pull (2026-10-18)

- Owner pulled `5d8e3a1`, generated Prisma Client 6.19.3, and applied `20261018193000_driver_register` to the local `richie_tms` PostgreSQL database successfully. This was the local application database migration, not the disposable integration-test database.
- Owner-confirmed `npm run typecheck`, `npm run lint`, and `npm test` all pass; unit suite is **49/49**. The dev server compiled `/fleet/drivers` and returned HTTP 200 after authentication.
- This verifies migration application, generated-client typechecking and page rendering on Fedora. PostgreSQL integration tests and browser create/edit/archive verification are still outstanding. The `npm ci` output reported the existing **13 dependency audit findings** (2 moderate, 9 high, 2 critical); no forced dependency upgrades were run.

## Phase 1A — usual-driver link (FLT-01/FLT-04, in progress; 2026-10-18)

- Added an optional `Vehicle.usualDriver` relation constrained to the same company by a composite driver foreign key plus a tenant-key equality check. Existing vehicles migrate with no linked driver; no default or fixture is introduced.
- Fleet managers with both `fleet:manage` and `driver:manage` may search active driver records and link/clear the usual driver in the vehicle editor. Vehicle list/detail projections include driver identity only for that same manager scope; dispatcher projections omit both the driver ID and name. API changes recheck the active same-company driver; the database composite FK blocks cross-company links even on direct writes.
- Existing links to an archived driver are visible to managers as archived and can be preserved or cleared; new links to archived drivers are rejected. This is master-data linkage only, not operational trip assignment or availability/safety logic.
- Added migration `20261018200000_vehicle_usual_driver`, schema/API validation and integration coverage for same-company links, cross-company denial/database constraints, clearing links and dispatcher projection. Sandbox lint and 51 unit tests pass. The new migration, PostgreSQL integration case, regenerated-client typecheck and browser link flow have not yet been run; sandbox Prisma generation/typecheck remain blocked by unavailable engine binaries/stale generated model types.

## Owner Fedora verification — usual-driver migration (2026-10-18)

- Owner pulled `23be783`, regenerated Prisma Client 6.19.3, and applied `20261018200000_vehicle_usual_driver` to the local `richie_tms` PostgreSQL database successfully.
- Owner-confirmed `npm run typecheck`, `npm run lint`, and `npm test` all pass; unit suite is **51/51**. This verifies schema/client generation and migration deployment on Fedora.
- The PostgreSQL integration tests for same-company linkage/database constraints and the browser link/clear flow have not yet been reported; FLT-01/FLT-04 remain In Progress pending those checks and existing vehicle edit/save verification.

## Owner decision — vehicle status safety boundary (D-016; 2026-10-18)

- Owner approved the recommendation: retain the seven vehicle status names from the brief; no default status and no manual status control in the current register; Reserved/Assigned/On Trip are to derive from authoritative reservation/assignment/trip records; Under Maintenance/Out of Service/Pending Inspection block assignments and may return to Available only after the required maintenance/inspection workflow is complete. The unrequested `Retired` status is excluded.
- Recorded in `docs/DECISIONS.md`, `docs/STATE_MACHINES.md`, and `docs/OPEN_QUESTIONS.md`. FLT-02 remains Not Started because exact transition actors/preconditions, active-assignment handling, and release authority remain open. Do not code a state transition UI or assign status defaults until these dependent rules exist.

## Owner decision — vehicle document scope and storage boundary (D-017; 2026-10-18)

- Owner approved deferring photo/document uploads until a production hosting/storage provider is selected. Initial document categories are limited to Insurance, Roadworthiness, and Vehicle Registration.
- Existing expiry dates remain manually entered/viewed. No automatic reminders or automatic file deletion will be implemented until lead times, recipients/channel, and retention periods are approved. No file records, storage provider, or fixture were added by this decision; service/maintenance records remain separate.
- Recorded in `docs/DECISIONS.md` and `docs/OPEN_QUESTIONS.md`. FLT-01/FLT-03 remain In Progress/Not Started as shown in the feature table until the relevant workflows can be safely implemented.
