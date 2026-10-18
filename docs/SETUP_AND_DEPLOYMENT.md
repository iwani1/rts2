# Setup and deployment (foundation only)

## Prerequisites
Node.js 22+, npm 10+, Docker with Compose for local PostgreSQL. Production hosting must be selected and verified for Node runtime, PostgreSQL 15+, `btree_gist`, persistent worker/scheduled job support, TLS, backups and persistent file storage. No production host is configured.

## Local setup
1. `cp .env.example .env` and replace placeholders locally; never commit `.env`.
2. Start PostgreSQL 16 with `docker compose up -d db`; on Fedora with Podman, install `podman-compose` and run `podman-compose up -d db`. The baseline Prisma migration enables the required `btree_gist` extension, so the container does not need a host-file init-script mount.
3. `npm ci`.
4. `npm run db:generate` (uses Prisma's standard engine; network access to the Prisma engine host may be required).
5. `npm run db:migrate:deploy`.
6. Set `AUTH_SECRET` to a cryptographically random secret of at least 32 characters and `APP_URL` to the exact application origin.
7. For a fresh, controlled environment only, run `npm run bootstrap:super-admin -- --confirm` from an interactive local terminal. It refuses non-TTY use and refuses if any active Super Administrator already exists; enter a strong password when prompted (input is hidden). This creates the user, credential, global role and audit event in one transaction. Treat the database credentials and local shell as privileged; public sign-up remains disabled.
8. Run `npm run bootstrap:company -- --confirm` and enter the active Super Administrator email. This one-time command creates the approved Richie Transport Services tenant and its audit event; it refuses if a company already exists and does not seed settings or operational data.
9. `npm run dev`.
10. Verify `GET /api/health` returns `{ "status": "ok", "service": "richie-tms" }`.

Stop the development server before running `npm run build`; Next.js development and production builds both use `.next` and should not run concurrently. After a build, restart `npm run dev` for browser development. The login form uses POST and the login page clears credential query parameters; never send, bookmark, or share passwords in URLs.

The current migrations contain auth, audit, company/settings scaffolding, the owner-approved role/grant catalog, and the vehicle register schema; migrations do not seed users or operational/business data. For an explicitly requested, clearly synthetic vehicle used for local UI testing only, first apply migrations, then run `NODE_ENV=development npm run seed:demo:vehicle -- --confirm-demo`. This idempotent command refuses non-development mode, non-local app/database hosts, production-named databases, or anything other than exactly one active operator company; it never runs at app startup or during migration. It creates `DEMO-GH-001`, labelled `DEMO — TEST ONLY`, and an audit event. Do not use this fixture in production or for operational dispatch.

## Quality gates
`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. For database-backed tests, use a disposable local database ending in `_test`: `TMS_TEST_DATABASE_URL=... npm run db:test:migrate`, then run `DATABASE_URL=... APP_URL=http://localhost:3000 AUTH_SECRET=<test-secret> npm run test:integration`. The raw-SQL migration helper refuses remote hosts and database names without the `_test` suffix; it is test-only and does not write Prisma migration history. CI uses PostgreSQL 16 and Prisma's native `migrate deploy`, then runs integration tests.

## Production notes
Do not deploy until secrets, auth, monitoring, backups/restore, migrations, hosting capabilities, privacy policy and owner-approved business configuration are in place. Build with `npm ci && npx prisma generate && npm run build`; run the Node server with `npm start`. Configure `DATABASE_URL`, `AUTH_SECRET`, and `APP_URL` from the deployment secret manager. This is a scaffold, not a deployable operational TMS.
