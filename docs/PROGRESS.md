# Feature progress

Phase 0 foundation plus the first Phase 1A authentication slice. Backlog status is tracked per ID; scaffolding is not feature completion.

| Feature ID | Status | Notes |
|---|---|---|
| AUTH-01 | In Progress | Better Auth login/logout, expiring PostgreSQL sessions, DB-backed rate limit, account-active gate and login UI; direct DB integration and HTTP smoke pass. Needs clean CI standard-engine generation/migration verification and remaining workflow hardening. |
| AUTH-02 | Not Started | Invitation, activation, suspension/reactivation UI and services not implemented; invitation delivery and expiry/revocation policy still need owner decision. One-time first-admin method is selected and implemented as a local CLI. |
| AUTH-03 | Not Started | Password reset not implemented; delivery/verification channel requires approval. |
| AUTH-04 | In Progress | Owner-approved role/grant schema, company-scoped authorization resolver, audited role service, bootstrap CLIs, and Super Administrator-only role APIs exist. New searchable user/role-management UI can assign/revoke approved roles for existing accounts; it does not provision or activate users. Role UI tests and a Super Administrator self-change browser test are added. Domain repository filtering remains. A PostgreSQL-backed role-route integration test and a self-change browser test are added but not run; owner Fedora verification is outstanding. |
| AUTH-05 | Not Started | Profile and login-history UI not implemented. |
| AUTH-06 | Not Started | Phase 2. |
| AUD-01 | In Progress | Auth session and role assignment/revocation/initial-bootstrap events are persisted; append-only trigger verified against real PostgreSQL. A Super Administrator-only paginated API and responsive read-only viewer exist; broader event coverage and browser/PostgreSQL route verification remain. |
| SET-01 | In Progress | No-default policy catalogue, required-setting reader, globally authorized write service and Super Administrator settings-status/update API exist; writes are audited transactionally. A new read-only admin status page displays unset/configured state, blocked features and update dates without exposing values. Per-setting role scopes, typed policy schemas and safe write UI remain. Three disposable-PostgreSQL registry integration tests previously passed on Fedora; a PostgreSQL-backed route test now also checks status-only payload and role denial but is unrun here. E2E checks the response omits policy values and the page has no edit controls, but browser execution remains pending. |
| MIG-01 | In Progress | D-024 approves all-or-nothing CSV batches after row-level preview. Customer, vehicle, and driver imports now have fixed-template parsing/preview, row-level validation, manager-only UI, and transactional audited create. Vehicle registration duplicates are blocked using the existing registration key. Driver duplicate identity has no approved key; current import does not merge/deduplicate and this risk is disclosed, pending owner policy. All three success summaries list created records and clear the native file picker after success, avoiding a stale selection that could prompt accidental re-import; component and browser E2E specs assert the reset (browser E2E remains unrun here). The combined unit/route/UI suite passes (36 files, 123 tests); lint passes; Playwright discovers three E2E specs, including the three-import, role self-change, and read-only policy-status flows. E2E and PostgreSQL integration runs are outstanding. Next.js optimized compilation succeeds but type validation is blocked by stale generated Prisma Client types (first error remains the existing bootstrap script). These changes remain uncommitted and await owner Fedora verification. |
| CUS-01 | In Progress | D-020 approves required customer/display name, optional manually entered unique reference, and optional free-text type/status with no defaults. Customer schema/migration, manager-scoped audited CRUD/search/archive API, register/edit/history UI, schema, component tests for unset optional values/create/update/archive, duplicate-reference errors, and archive failures, and disposable-PostgreSQL integration tests added. Playwright now covers rejection of an invalid customer CSV batch and absence of its reference from the register, valid imports, customer audit-history display, an audited customer edit, and soft-archive removal from the active register; the flow is added but unrun. Limited Dispatcher/Finance/customer projections remain fail-closed pending field rules; run migration, generated-client typecheck, PostgreSQL integration tests, and browser verification before acceptance. |
| RNT-01 | In Progress | D-021/D-022/D-023 approve staff Draft entry, existing-customer link, positive duration minutes, and Draft → Submitted required fields/authority. Draft create/update/list/detail, single approved submit transition, append-only status history, audit and responsive UI added. Later rental, quote, availability and booking workflows are not included. Dispatcher enquiry-context views remain fail-closed. Verify migration/client generation, PostgreSQL tests, and browser workflow. |
| RNT-02 | In Progress | D-021/D-023 approve Draft → Submitted only; required fields and Ops Manager/Super Administrator actors are implemented. Remaining transitions, actors and preconditions in the proposed state table are not approved or implemented. |
| RNT-03 | Not Started | No feature implementation; Phase 1+ approval required. |
| RNT-04 | Not Started | No feature implementation; Phase 1+ approval required. |
| RNT-05 | Not Started | No feature implementation; Phase 1+ approval required. |
| RNT-06 | Not Started | No feature implementation; Phase 1+ approval required. |
| RNT-07 | Not Started | No feature implementation; Phase 1+ approval required. |
| RNT-08 | Not Started | No feature implementation; Phase 1+ approval required. |
| RNT-09 | Not Started | No feature implementation; Phase 1+ approval required. |
| WEB-01 | Not Started | No feature implementation; Phase 1+ approval required. |
| FLT-01 | In Progress | Vehicle register schema/API/UI supports core factual fields, a manager-only usual-driver link to an active same-company driver, and a fixed-template all-or-nothing CSV import for new records. Playwright now covers linking an imported active same-company driver to an imported vehicle and verifying it after logout/login; these and broader register/import browser checks remain unrun. Photo storage and document records/files are deferred pending hosting/storage selection. |
| FLT-04 | In Progress | Driver register schema/API/UI supports company-scoped searchable records with only brief-listed details, full fleet-manager create/edit/archive, and a fixed-template audited CSV import; active drivers can be linked as vehicles' usual drivers by managers with both grants. Playwright now covers linking an imported driver as a vehicle's usual driver; browser verification, dispatcher field-level scope decision, account-to-driver linking, and policy-defined status/availability workflows remain. Dispatcher and Driver OWN_PROFILE listing fail closed until field projection and verified account-link behavior are implemented. Driver import identity/duplicate policy is unresolved and documented in OPEN_QUESTIONS.md. |
| FLT-02 | Not Started | D-016/D-018/D-019 approve seven status names, no default/manual status control, derived Reserved/Assigned/On Trip, immediate safety blocks, conflict handling, the manager/releaser release rule, and Ops/Fleet Manager/Super Administrator safety-block authority. Drivers/Technicians report defects; Dispatchers view availability only. Transition-specific preconditions and dependent assignment, maintenance, and incident workflows remain unimplemented. |
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
- FLT-01 stays In Progress: vehicle photo/document file storage, document records, usual-driver relation and browser end-to-end verification remain. FLT-02/03/04/05 are not started. MIG-01 later began with a customer-only import slice; vehicle/driver CSV imports remain outstanding. The additive vehicle migration's application-database and browser verification status is tracked in the later FLT-01 record.

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

## Vehicle create-form reset follow-up (2026-10-18)

- Fixed the vehicle-create success path to retain the form element reference across the asynchronous save before resetting it. Also remounts the controlled usual-driver picker after a successful create so the visible selection and hidden submitted driver ID both clear with the rest of the form.
- Added a jsdom component test that chooses a driver, verifies its ID is submitted, and checks that the text form fields, picker display and hidden driver ID all clear after a successful response. `npm test` passes (52/52), `npm run lint` and `git diff --check` pass. Sandbox `npm run typecheck` remains blocked by stale generated Prisma Client types (implicit-any Prisma callbacks and missing generated Prisma exports in unrelated modules); the new test adds no reported type errors. This is component-level coverage, not a real browser/backend test; local browser verification remains outstanding.

## Owner decision — vehicle status safety boundary (D-016; 2026-10-18)

- Owner approved the recommendation: retain the seven vehicle status names from the brief; no default status and no manual status control in the current register; Reserved/Assigned/On Trip are to derive from authoritative reservation/assignment/trip records; Under Maintenance/Out of Service/Pending Inspection block assignments and may return to Available only after the required maintenance/inspection workflow is complete. The unrequested `Retired` status is excluded.
- Recorded in `docs/DECISIONS.md`, `docs/STATE_MACHINES.md`, and `docs/OPEN_QUESTIONS.md`. FLT-02 remains Not Started because exact transition actors/preconditions, active-assignment handling, and release authority remain open. Do not code a state transition UI or assign status defaults until these dependent rules exist.

## Owner decision — vehicle document scope and storage boundary (D-017; 2026-10-18)

- Owner approved deferring photo/document uploads until a production hosting/storage provider is selected. Initial document categories are limited to Insurance, Roadworthiness, and Vehicle Registration.
- Existing expiry dates remain manually entered/viewed. No automatic reminders or automatic file deletion will be implemented until lead times, recipients/channel, and retention periods are approved. No file records, storage provider, or fixture were added by this decision; service/maintenance records remain separate.
- Recorded in `docs/DECISIONS.md` and `docs/OPEN_QUESTIONS.md`. FLT-01/FLT-03 remain In Progress/Not Started as shown in the feature table until the relevant workflows can be safely implemented.

## Owner decision — vehicle safety-block conflicts and release authority (D-018; 2026-10-18)

- Owner approved immediate safety blocking with no new assignments; future assignments are flagged for dispatcher resolution and are not silently cancelled/reassigned; an active trip uses the incident/replacement workflow.
- A Fleet Manager/authorized releaser can return a vehicle to Available after work completion and an inspection record; a separate inspector role is not required.
- Recorded in `docs/DECISIONS.md`, `docs/STATE_MACHINES.md`, and `docs/OPEN_QUESTIONS.md`. FLT-02 remains unimplemented: entry actors and transition-specific preconditions remain open, and the dependent assignment/maintenance/incident workflows do not yet exist. No manual status UI/default was added.

## Phase 1A — customer register base (CUS-01; 2026-10-19)

- Owner approved D-020 before implementation: required customer/display name; optional manually entered company-unique reference; optional free-text type/status with no preset values or defaults; brief-listed contact, telephone, email, billing details and notes. No generated reference format, status transitions, or business vocabularies were invented.
- Added tenant-scoped `Customer` schema and additive migration with optional reference uniqueness, non-empty name constraint, soft archive, and grants from the owner-approved customer permission matrix. Customer and change reasons are audited without copying customer fields into event summaries; per-customer history presents action, time, actor and reason.
- Added manager-scope-only (Super Administrator/Ops Manager) customer search/list/detail/create/update/archive service and company API, responsive register/form, and home navigation. Enquiry-context, Finance billing-context and rental-customer own-profile permissions currently fail closed because their field-level projections are not specified/implemented. No customer-to-rental workflow is included.
- Added schema and disposable-PostgreSQL integration coverage for empty policy values, validation, tenant scoping, optional reference uniqueness, audit history, update and soft archive. Design uses the already-inspected compact Refero/FleetSimple register patterns and responsive static navigation; the source-to-feature mapping is in `REFERENCE_RESEARCH.md`.
- Verification status: sandbox `npm test` passes (58/58), `npm run lint` and `git diff --check` pass. Prisma validate/typecheck cannot complete here because required Prisma binaries are unreachable and the sandbox-generated Client is stale; no generated-client or database migration result is claimed. Still run generation, migration on a fresh disposable `_test` DB and local development DB, PostgreSQL integration tests, and browser create/edit/search/archive/history checks before acceptance.

## Phase 1A — staff rental Draft entry (RNT-01 base; 2026-10-19)

- Owner approved D-021/D-022/D-023 before implementation: staff enquiries are saved as Draft, submission is separate, Draft may omit both return time and duration, submission requires at least one, a request links to an existing customer, and duration is positive whole minutes. Submission also requires service date, departure time, pickup, destination, positive passenger count and source; only Ops Managers and Super Administrators may submit. No later status transition is implemented.
- Added company/customer-constrained `RentalRequest` schema and additive migration, preserving service date and local time values without timezone conversion. Draft status is the only allowed initial state; the single approved Draft → Submitted transition requires a status-history row and is audited transactionally. History rows are append-only at the database level. Draft updates cannot change status and only affect records still in Draft.
- Added Ops Manager/Super Administrator search, detail, create, Draft-update and submit services/API/UI, plus customer search picker. Submission validates the D-023 fields atomically and returns the missing-field list. Limited Dispatcher enquiry-context request views remain fail-closed pending field projections. Later quote, availability, reservation, cancellation, dispatch and vehicle/driver assignment workflows are not included.
- Unit schema and jsdom component tests cover incomplete Draft entry, customer selection, submission UI, date/time/source validation, approved submission preconditions and ensuring no vehicle/status is submitted; API route tests cover authentication/actor derivation and missing-field responses. Disposable-PostgreSQL integration tests cover tenant/customer boundaries, authorized actors, audit, Draft-only checks, transition/history integrity and immutable history. `npm test` passes (71/71), including a route-level 403 test for a non-authorized session, `npm run lint` and `git diff --check` pass. Sandbox `npm run typecheck` remains blocked by stale generated Prisma Client errors in pre-existing auth/fleet/settings modules; no rental/customer module type errors are reported. Prisma validation/migration and PostgreSQL integration remain pending because the sandbox cannot fetch Prisma binaries and has no configured disposable database. `npm run build` compiles the app but fails at Next.js type validation on the same stale generated-client/unrelated TypeScript errors as `npm run typecheck`; no production build success is claimed. Added a guarded, local-only Playwright scenario and setup instructions; its test discovery passes, but it has not been launched in a browser.

- After excluding `e2e/**` from Vitest, the full unit suite passes: 19 files, 71 tests, including direct tests of every D-023 missing-field requirement and the return-time/duration alternative plus the submission API denial response. `npm run lint` and `git diff --check` pass. `npm run test:e2e -- --list` discovers the single rental submission scenario; this validates discovery only, not browser execution. The Playwright config requires local test DB/auth/login environment values and starts its own fresh dev server. Updated the rental UI copy to distinguish the implemented Draft → Submitted action from the unapproved review/quotation/availability workflows; CTA now says “Submit request,” with accessible focus/disabled styling.

## Phase 1A — customer CSV import vertical slice (MIG-01; 2026-10-19)

- Owner approved D-024: imports are all-or-nothing after preview; no records are written while any file/row error exists, no rows are silently dropped, and existing records are never merged or updated.
- Added a customer-only import page, downloadable fixed-header template, CSV preview/row validation and explicit full-batch import. Uses only D-020 customer fields; blank optional fields stay unset. Duplicate references in-file or within the company are row errors; customer names are not treated as unique. Each row is created and audited in the same database transaction. Vehicle and driver imports remain unimplemented.
- Technical safeguards: UTF-8 CSV syntax checks, every parsed row retained (including blank rows as invalid), 2 MB and 1,000-row batch limits, strict known headers, reason recorded in each customer's audit event, tenant/role checks on preview and import, no-store responses. Templates and validation guidance are mapped to inspected Odoo import documentation in `REFERENCE_RESEARCH.md`; live Odoo interaction/accessibility was not inspected.
- Added parser and API unit tests, UI preview/commit/error tests, and disposable-PostgreSQL integration tests for all-or-nothing behavior, reference conflict detection, persistence and audit. Latest unit suite: 86 tests pass; lint and diff checks pass. PostgreSQL integration and browser behavior remain unrun. Sandbox typecheck/build still fail on stale generated Prisma Client and unrelated existing errors; a clean Fedora-generated-client typecheck is needed before this slice is accepted.

## Phase 1A accessibility hardening — register table semantics (2026-10-19)

- Added visually-hidden captions and explicit column-header scopes to customer, driver, vehicle, and rental-request register tables. No visual layout or business behavior changed.
- Extended the existing Playwright flows to assert accessible table names while exercising the registers; test discovery and lint pass. Browser execution remains pending a local disposable PostgreSQL `_test` database and owner verification.

## Operational readiness endpoint (2026-10-19)

- Added `GET /api/health/ready` as a separate dependency-readiness probe; the existing `/api/health` remains a minimal uncached liveness response. Readiness checks PostgreSQL with `SELECT 1`, returns 503 without exposing internal error details, and disables caching.
- Unit tests cover healthy and unavailable database paths; a guarded disposable-PostgreSQL integration test is added but remains unrun in this sandbox. Playwright now waits for this database-aware endpoint before starting its browser flows. This is infrastructure status only, not a claim that business workflows or downstream providers are operational.

## Global response-header hardening (2026-10-19)

- Added `X-Content-Type-Options: nosniff` alongside the existing `Referrer-Policy: no-referrer` header. Deliberately did not add frame-blocking headers that could break Arena's embedded app preview; no UI or business behavior changed.
- Added a unit test for the global headers. Lint passes.
