# Phase 7 verification — production hardening (D-092)

Phase 7 makes the verified system deployable: a container image
that migrates and boots on its own, a strict production security
header set, fail-fast environment validation at boot, and an
executable backup/restore procedure. No functional or schema
change (still 42 migrations).

## Automated verification (Fedora)

```bash
cd ~/Videos/rts2/rts2
git fetch origin
git checkout arena/8922811c-rts2
git pull --ff-only
./scripts/verify-phase7.sh
```

Expected:

- 42/42 migrations, typecheck and lint clean
- unit suite green (includes the D-092 header and env validators)
- integration suite green (full regression corpus, unchanged)
- **step 8/8 container smoke**: the image builds
  (`podman compose build app` path), app+db boot on a throwaway
  compose project, `/api/health` answers, `/api/health/ready`
  reports the database ok, the login page carries the production
  CSP / `X-Frame-Options: DENY` / HSTS / `X-Robots-Tag` headers,
  and the project is torn down afterwards

> Status: built in the sandbox (unit suite green; sandbox has no
> container runtime, so step 8/8 exists precisely for Fedora).
> Fedora automated verification is **outstanding**, as is the drill
> below.

## Manual deployment drill (after the automated run)

1. **Boot it for real.** In a shell with `AUTH_SECRET` (≥32 chars)
   and `APP_URL` set: `podman compose build app && podman compose
   up -d`. Open http://localhost:3000, sign in as the bootstrap
   Super Admin, and click through two or three screens (dashboard,
   invoices, a settings editor). Everything must work under the
   production CSP — any blank page or refused action is a defect
   to record, not a header to silently drop.
2. **Prove the boot guard.** `AUTH_SECRET=short podman compose up
   app` (foreground) — the container must refuse to start, naming
   the invalid environment. Restore the real secret afterwards.
3. **Backup drill.** `./scripts/backup-db.sh`, then
   `./scripts/restore-db.sh --confirm <dump> richie_tms_restore`.
   Point a dev server at the restored database
   (`DATABASE_URL=...richie_tms_restore npm run dev`) and confirm
   the finance dashboard figures match the pre-backup screen. Drop
   the restore database afterwards.
4. **Migration honesty.** `podman compose exec -T db psql -U tms
   -d richie_tms -c 'SELECT COUNT(*) FROM "_prisma_migrations"
   WHERE finished_at IS NOT NULL'` must report 42 — the app applied
   the same migrations `db:migrate:deploy` always has.

## Known limitations (honest states)

- The CSP keeps `'unsafe-inline'` for scripts and styles (Next's
  bootstrap); it is a hardening baseline, not a nonce-based policy.
- The compose file is a single-host deployment. TLS termination,
  monitoring/alerting, an off-host backup destination and retention
  are owner decisions (see `docs/BACKUP_AND_RECOVERY.md` and
  `docs/SETUP_AND_DEPLOYMENT.md`); nothing here pretends otherwise.
- `podman compose up` of the `app` service is additive: the
  `verify-phase*.sh` scripts use only the `db` service and are
  unaffected.
