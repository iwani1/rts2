# API inventory — Phase 1A

| Method | Path | Status | Behavior |
|---|---|---|---|
| GET | `/api/health` | Implemented | Returns minimal service health JSON; no database probe and does not assert dependencies are healthy. |
| GET/POST | `/api/auth/[...all]` | Implemented | Better Auth handler for email/password sign-in, session query/revocation and rate limits. Public sign-up disabled. Requires generated Prisma client, applied migrations, PostgreSQL, `AUTH_SECRET`, `APP_URL`. |
| GET/POST | `/api/admin/users/{userId}/roles` | Implemented, Super Administrator only | Lists a user's role assignment history and role catalogue, or assigns a role with company scope and a required reason. Actor identity comes from the session, never the request body. |
| DELETE | `/api/admin/role-assignments/{assignmentId}` | Implemented, Super Administrator only | Revokes an assignment with a required reason; the service prevents self-escalation and writes the audit event transactionally. |
| GET | `/api/admin/audit-events` | Implemented, Super Administrator only | Returns a private, cursor-paginated audit-event page; excludes IP addresses and disables caching. |
| GET/PUT | `/api/admin/companies/{companyId}/settings` | Implemented, Super Administrator only | Returns registered setting status without values, or writes an explicitly supplied JSON value with a required reason and transactional audit event. No defaults are exposed. |

Other operational APIs remain planned and must be documented by feature/phase before implementation. They must use server-side auth, Zod input validation, service-layer authorization, tenant-scoped repository access and typed safe errors. The role API is limited to active global Super Administrators; it is an API foundation only, with no role-administration UI yet. Public rental enquiry endpoint is planned as WEB-01 and not implemented.
