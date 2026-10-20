# Richie TMS — system audit

**Audit date:** 2026-10-20 (Africa/Accra)  
**Audited revision:** `7196b6a` on `arena/8922811c-rts2`  
**Disposition:** **Not production-ready.** The application has a useful, tested Phase 1A foundation, but dependency vulnerabilities, incomplete release verification, missing operational controls, unresolved privacy/business decisions, and unfinished core workflows prevent production use.

## Scope and method

Reviewed repository guidance and phase gates; application routes, authentication/authorization, tenant-scoped services, Prisma schema/migrations, test/deployment configuration, security headers, setup/privacy/backup/open-question documentation, and dependency lockfile. Ran the local unit suite, lint, TypeScript check, production build, npm audit, and route/raw-SQL pattern scans. Incorporated owner-run Fedora PostgreSQL integration and Playwright outputs reported in this session.

This was a repository/configuration audit, not a penetration test, external infrastructure review, legal opinion, backup restore drill, or inspection of the owner's local PostgreSQL contents. PostgreSQL and browser testing could not be reproduced in this sandbox.

## Executive summary

| Area | Result |
|---|---|
| Unit tests | **Pass:** 92 files, 337 tests |
| Lint | **Pass** |
| PostgreSQL integration | **Pass on owner Fedora:** 13 files, 51 tests |
| Playwright E2E | **Fail/incomplete:** 2 of 4 specs passed; two timeout waiting for customer-create and driver-search responses |
| Typecheck/build | **Not verified:** local generated Prisma Client is absent; build compiles, then type validation fails on missing Prisma exports and derived implicit-`any` diagnostics |
| Dependency audit | **Partially remediated:** currently 8 high advisories remain in dev/build dependencies; 0 critical/moderate and 0 production-tree advisories after the local Vitest/PostCSS updates. Owner-side lockfile/CI verification remains pending |
| Production readiness | **Fail:** no selected production host, verified backups/restore, approved privacy/retention plan, or complete Phase 1A operational workflows |

## Findings

### A-01 — Vulnerable dependency tree — High

`npm audit` against the checked-in lockfile reports **13 vulnerabilities**: 2 critical, 9 high, 2 moderate. `npm audit --omit=dev` still reports **two production-tree advisories** (one high and one moderate).

- The initial audit found 13 advisories (including 2 critical) and two production-tree findings. In follow-up local remediation, `vitest` was upgraded from 3.2.7 to 5.0.5, Vite 7.3.7 was made explicit, and PostCSS was overridden to patched 8.5.31. Current `npm audit` now reports 8 high, 0 critical, and 0 moderate; `npm audit --omit=dev` reports **0 production-tree vulnerabilities**.
- The remaining 8 high findings are development/build-time: `prisma@6.19.3` through `@prisma/config`/`deepmerge-ts`, and `eslint-config-next@15.5.28` through its ESLint/glob chain. npm proposes major-version changes; handle these as separate migrations with generated Prisma Client checks and Next/ESLint regression testing rather than using `npm audit fix --force` blindly.
- The removed critical findings were in the Vitest/Tinypool test-runner chain. This is a substantial reduction, but the new Vitest major still requires the owner’s PostgreSQL integration and browser E2E suites to be rerun.

**Action:** validate the updated lockfile on Fedora with `npm ci`, unit/integration/E2E suites, generated-client typecheck/build, then schedule controlled Prisma and Next ESLint major upgrades. Do not suppress advisories without a documented risk acceptance.

### A-02 — E2E release gate is red — Release blocker

The latest owner-run Playwright result is **2 passed, 2 failed**. The passing cases are admin policy status and the safety-block/non-safety-maintenance flow. The customer creation and usual-driver search cases time out waiting for expected API responses. The latest diagnostic changes are on the remote branch, but have not yet produced a green E2E run.

**Action:** inspect the Playwright traces and browser network activity for the two failing flows; verify whether the requests are absent, stalled, or returning an unexpected route/status. Do not mark the E2E acceptance criterion complete until all four specs pass on the disposable E2E database.

### A-03 — Generated Prisma Client / typecheck and build are unverified — Release blocker

In this sandbox, dependencies were installed with scripts disabled, so the generated Prisma Client was unavailable. `npm run typecheck` reported missing `Prisma`/`PrismaClient` exports and consequent inferred-`any` errors. `npm run build` compiled the app but failed during type validation at `scripts/bootstrap-super-admin.ts:69` for the same missing-client cascade. This audit cannot conclude whether a clean generated-client typecheck/build passes.

**Action:** in the supported Fedora environment, run `npm run db:generate`, `npm run typecheck`, and `npm run build`; fix any remaining diagnostics and record the successful result. Prisma engine generation was not reproducible in this sandbox because its engine download endpoint was unreachable.

### A-04 — Production browser hardening is incomplete — Medium

`next.config.ts` currently sets `Referrer-Policy: no-referrer` and `X-Content-Type-Options: nosniff`, but no Content Security Policy / `frame-ancestors`, `X-Frame-Options`, or HSTS policy is configured there. HSTS may belong at the eventual TLS edge, which has not been selected.

**Action:** before production deployment, define and test CSP (including framing restrictions) and enforce HTTPS/HSTS at the hosting edge. Verify these headers on production responses; do not enable HSTS for local HTTP development.

### A-05 — Account lifecycle and recovery are incomplete — Operational/security blocker

Self-sign-up is disabled, passwords require at least 12 characters, sessions are database-backed and expire after eight hours, auth rate limits use the database, and suspended accounts cannot start sessions. However, invitation/activation/suspension workflows and password recovery are not implemented; the login page states recovery is unavailable. The current bootstrap CLIs are one-time local provisioning tools, not an ongoing account lifecycle system. The account invitation/recovery and session-revocation policies remain open in `docs/OPEN_QUESTIONS.md`.

**Action:** obtain approval for invitation, expiry/revocation, suspension/reactivation, recovery verification, and session revocation policies; implement and test those flows before relying on this as a staffed production system.

### A-06 — Privacy, retention, backup, and hosting controls are not launch-ready — Release blocker

The project explicitly has no production host configured and no tested backup/restore procedure (`docs/BACKUP_AND_RECOVERY.md`). Data protection guidance remains a proposal; lawful purposes, notices, DPC status, privacy ownership, and retention durations are unconfirmed (`docs/DATA_PROTECTION.md`, `docs/OPEN_QUESTIONS.md`). The local Docker/Podman volume is development-only, not a backup.

**Action:** select/verify hosting; approve data-controller/processor responsibilities, notices, legal basis and retention schedule; verify DPC obligations; define RPO/RTO; configure encrypted backups and complete an isolated restore drill before production data is loaded.

### A-07 — Phase 1A rental and finance workflows remain incomplete — Functional blocker

Implemented work covers staff rental Draft entry/submission, limited review/decline, internal pricing previews/immutable worksheets, fleet/customer/driver registers/import, maintenance/safety-block records, and a limited all-time request report. The app does **not** yet provide authoritative availability/reservation enforcement, quote approval/issuance/acceptance, booking confirmation/assignment/cancellation/completion, rental invoices, or manual payments; public WEB-01 enquiry intake is also not implemented. Several of these are explicitly blocked by unresolved business decisions (pricing/tax/deposit, cancellation, approval, payment evidence, web integration/customer intake, and resource rules). RNT-03's pure interval helper is not an operational availability or double-booking guard.

**Action:** resolve the listed policy/hosting decisions, implement the remaining Phase 1A vertical slices with database constraints and E2E evidence, and stop at the Phase 1A owner-review gate. Do not start Phase 1B before that gate is approved.

## Controls that were present in the reviewed code

- Authentication is centralized through Better Auth; self-registration is disabled; secure cookies are enabled in production mode; session creation checks account status; database-backed rate limiting is configured (`src/server/auth.ts`).
- Role resolution checks active users, company/global assignment scope, and owner/assignee-limited scopes. Delegated-approval grants fail closed until policy is defined (`src/modules/auth/permissions.ts`). The custom business routes inspected retrieve a session; health routes are intentionally unauthenticated and return minimal dependency status.
- A static scan found no `dangerouslySetInnerHTML`, `eval`/`new Function`, `\$queryRawUnsafe`, or `\$executeRawUnsafe` use. Raw SQL usage is tagged/template-parameterized for locking, aggregates, and state transitions.
- Tenant-scoped CRUD/import and key database constraints are covered by the passing 51-test PostgreSQL integration run. CSV imports enforce preview/validation and all-or-nothing transaction rules.
- Audit events and append-only maintenance/pricing records have database-backed integrity controls in the reviewed migrations. No public enquiry or unauthenticated customer-data API was found; the only unauthenticated API routes are health checks and the Better Auth handler.

## Recommended order of remediation

1. Resolve the two failing E2E requests using traces; rerun all four specs green.
2. Upgrade vulnerable dependencies in a controlled change; run the complete verification matrix.
3. Regenerate Prisma Client on Fedora and demonstrate clean typecheck/build.
4. Close account lifecycle, hosting, privacy/retention, backup/restore, and security-header decisions.
5. Complete policy-approved Phase 1A rental/finance/WEB workflows; then request owner review at the explicit Phase 1A gate.
