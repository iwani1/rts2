# API inventory — Phase 1A

| Method | Path | Status | Behavior |
|---|---|---|---|
| GET | `/api/health` | Implemented | Minimal uncached liveness response; does not probe dependencies. |
| GET | `/api/health/ready` | Implemented | Performs a PostgreSQL `SELECT 1` probe and returns 200 when ready or a generic 503 when unavailable; response is not cached and does not expose connection details. |
| GET/POST | `/api/auth/[...all]` | Implemented | Better Auth handler for email/password sign-in, session query/revocation, authenticated password change and rate limits. Public sign-up disabled. Password changes can revoke other sessions. Requires generated Prisma client, applied migrations, PostgreSQL, `AUTH_SECRET`, `APP_URL`. |
| GET/POST | `/api/admin/users/{userId}/roles` | Implemented, Super Administrator only | Lists a user's role assignment history and role catalogue, or assigns a role with company scope and a required reason. Actor identity comes from the session, never the request body. |
| DELETE | `/api/admin/role-assignments/{assignmentId}` | Implemented, Super Administrator only | Revokes an assignment with a required reason; the service prevents self-escalation and writes the audit event transactionally. |
| GET | `/api/admin/audit-events` | Implemented, Super Administrator only | Returns a private, cursor-paginated audit-event page; excludes IP addresses and disables caching. |
| GET/PUT | `/api/admin/companies/{companyId}/settings` | Implemented, Super Administrator only | Returns registered setting status without values, or writes an explicitly supplied JSON value with a required reason and transactional audit event. No defaults are exposed. |
| GET/POST | `/api/companies/{companyId}/vehicles` | In progress, company-scoped | Search/paginate active vehicle records or create a vehicle. Requires `fleet:manage`; dispatcher read/assign scope receives a limited field projection, while create requires GLOBAL or COMPANY scope. Create is audited. |
| GET/PUT/DELETE | `/api/companies/{companyId}/vehicles/{vehicleId}` | In progress, company-scoped | Fetch or replace a vehicle; DELETE archives instead of deleting. Mutations require a reason and are audited. Company+vehicle filters are applied server-side; upload/document/driver assignment workflows are not implemented. |

Other operational APIs remain planned and must be documented by feature/phase before implementation. They must use server-side auth, Zod input validation, service-layer authorization, tenant-scoped repository access and typed safe errors. The role API and searchable Super Administrator role-management UI are limited to active global Super Administrators; the UI manages grants only for existing accounts and does not provision or activate users. Public rental enquiry endpoint is planned as WEB-01 and not implemented.
