# Feature progress

Phase 0 foundation plus the first Phase 1A authentication slice. Backlog status is tracked per ID; scaffolding is not feature completion.

| Feature ID | Status | Notes |
|---|---|---|
| AUTH-01 | In Progress | Better Auth login/logout, expiring PostgreSQL sessions, DB-backed rate limit, account-active gate and login UI; direct DB integration and HTTP smoke pass. Needs clean CI standard-engine generation/migration verification and remaining workflow hardening. |
| AUTH-02 | Not Started | Invitation, activation, suspension/reactivation UI and services not implemented; invitation delivery and expiry/revocation policy still need owner decision. One-time first-admin method is selected and implemented as a local CLI. |
| AUTH-03 | Not Started | Password reset not implemented; delivery/verification channel requires approval. |
| AUTH-04 | In Progress | Owner-approved role/grant schema, company-scoped authorization resolver, audited role service and one-time bootstrap added. Super Administrator-only role-directory/assign/revoke APIs now exist with actor identity from the session; UI, domain repository filtering, and PostgreSQL route-level tests remain. |
| AUTH-05 | Not Started | Profile and login-history UI not implemented. |
| AUTH-06 | Not Started | Phase 2. |
| AUD-01 | In Progress | Auth session and role assignment/revocation/initial-bootstrap events are persisted; append-only trigger verified against real PostgreSQL. A Super Administrator-only paginated audit API exists; viewer UI, broader event coverage and route-level PostgreSQL verification remain. |
| SET-01 | In Progress | Company-scoped setting table scaffolded with no default values; registry service, permission checks, configuration UI and tests remain. |
| MIG-01 | Not Started | No feature implementation; Phase 1+ approval required. |
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
| FLT-01 | Not Started | No feature implementation; Phase 1+ approval required. |
| FLT-02 | Not Started | No feature implementation; Phase 1+ approval required. |
| FLT-03 | Not Started | No feature implementation; Phase 1+ approval required. |
| FLT-04 | Not Started | No feature implementation; Phase 1+ approval required. |
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
- Current check: AUTH-04 remains in progress; role UI, route-level PostgreSQL tests, domain repository filtering, audit viewer, settings registry, invitation/reset/profile flows, and remaining Phase 1A features still need implementation/validation. Do not proceed to Phase 1B until Phase 1A exit criteria pass and are approved.

## Phase 1A continuation — audit API foundation (2026-10-18)

- Added `GET /api/admin/audit-events`, restricted to an active global Super Administrator, cursor-paginated with a fixed 50-event page, and `Cache-Control: private, no-store`. It deliberately excludes IP addresses. This is an API foundation, not the AUD-01 viewer UI.
- Added unit tests for authentication/authorization denial, rejection of unsupported filters, pagination bounds/cursor and no-store behavior.
- Latest sandbox checks: lint passes; `npm test` passes 13 unit tests across five test files. Typecheck cannot run here because the sandbox install has no generated Prisma model client; typecheck passed on the user's Fedora machine before this audit route was added, so rerun it there after pulling.
