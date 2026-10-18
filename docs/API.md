# API inventory — Phase 0

| Method | Path | Status | Behavior |
|---|---|---|---|
| GET | `/api/health` | Implemented | Returns minimal service health JSON; no database probe and does not assert dependencies are healthy. |
| GET/POST | `/api/auth/[...all]` | Implemented, runtime-blocked here | Better Auth handler for email/password sign-in, session query/revocation and rate limits. Public sign-up disabled. Requires generated Prisma client, applied migrations, PostgreSQL, `AUTH_SECRET`, `APP_URL`; not integration-tested. |

All operational APIs are planned and must be documented by feature/phase before implementation. They will use server-side auth, Zod input validation, service-layer authorization, tenant-scoped repository access and typed safe errors. Public rental enquiry endpoint is planned as WEB-01 and not implemented.
