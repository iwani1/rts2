# Architecture — Phase 0

## Current state and target
This repository began as an empty application repository with only the supplied brief and phase prompts. Current Phase 1A work includes Better Auth with PostgreSQL-backed sessions, company/settings and audit scaffolding, owner-approved role/grant persistence, an authorization resolver and audited role-management service. It remains an incomplete foundation: no operational business workflows, role admin UI, invitations, or domain repository filters are implemented. Prisma's standard engine is now required after the explicit removal of `engineType`; clean client generation is blocked in this sandbox by network access to `binaries.prisma.sh` and must pass in CI.

## Modules
Planned vertical domains: `auth`, `audit`, `settings`, `customers`, `rentals`, `fleet`, `drivers`, `maintenance`, `corporate-clients`, `contracts`, `employees`, `routes`, `bookings`, `trips`, `dispatch`, `incidents`, `finance`, `notifications`, `reports`. Each domain owns `service`, `policy`, `schema`, and `repo` under `src/modules/<domain>/`. Route handlers in `src/app/api` perform transport-level parsing and delegate; they do not contain business rules or unscoped database access. Shared infrastructure belongs in `src/server` (database, auth, scoped access, errors, audit, jobs, providers).

## Request flow
Browser or external caller → Next.js route/page action → authentication and request ID → Zod parse → service authorization/policy check → tenant-scoped repository transaction → PostgreSQL constraints → audit/status history → typed response. `src/modules/auth/permissions.ts` resolves active role grants only for the matching company (plus global Super Administrator grants), denies by default, and returns scope labels for the consuming domain service. A scope label is not sufficient by itself: domain repository queries must enforce own/assigned/client subsets and field projection. Role assignment currently requires a global Super Administrator and writes an audit event in the same transaction. Errors are mapped to safe public messages; detailed structured logs carry request IDs. Public rental enquiry is isolated, rate-limited, spam-protected, and returns no customer data.

## Data and transactions
PostgreSQL is authoritative. Money uses `NUMERIC(14,2)`, timestamps use `timestamptz` (UTC), and display timezone is `Africa/Accra`. Company-scoped access is always explicit through a common scoped data-access layer; tenant identity is never accepted solely from browser input. Reservations/assignments use exclusion constraints and booking-capacity operations lock trip rows. Financial issuance and payment records are immutable; corrections are separate approved records.

## Provider interfaces
Define server-only interfaces for maps/geocoding, SMS, email, and payments. A provider is reported as not configured until credentials and a real successful test exist. Map-free manual dispatch remains usable. No client-side secrets.

## Jobs and realtime
Preferred queue: `pg-boss` backed by PostgreSQL. It is conditional on verified persistent-worker hosting. If worker hosting is unavailable, use authenticated scheduled endpoints for bounded periodic tasks, document delivery/retry limitations, and do not claim realtime. WebSockets are not required for the first foundation; polling can provide status refresh if hosting disallows sockets.

## Deployment
No hosting provider was specified, so Node.js, PostgreSQL, `btree_gist`, workers, WebSockets, backups, and TLS remain unverified. Local Docker Compose provisions PostgreSQL 16, but Docker is not installed in this execution environment; the Compose stack could not be started here. For real integration validation, an untracked npm-delivered PostgreSQL 15.18 binary was used as an ephemeral local database; it is not an application/runtime dependency. CI is configured for PostgreSQL service. `.env.example` contains placeholders only.
