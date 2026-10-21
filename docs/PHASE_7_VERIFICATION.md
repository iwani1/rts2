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
>
> First Fedora run (2026-10-21, HEAD `33b4402`) stopped at step 4/7:
> the real `@types/node` on Fedora declares `process.env.NODE_ENV`
> read-only, so the header test's direct assignment failed typecheck
> (TS2540) — a combination the sandbox's type environment does not
> reproduce. Fixed by stubbing the variable through Vitest
> (`vi.stubEnv`) instead of assigning it; test-only change, rerun
> pending.
>
> Second Fedora run (2026-10-21, HEAD `826e41a`): **steps 1–7
> PASSED** — 42/42 migrations on a fresh disposable database,
> typecheck and lint clean (4 pre-existing warnings, 0 errors),
> unit 495/495, integration 202/202. Step 8/8 stopped before the
> app could start: the smoke project's `db` tried to publish host
> port 5432, already held by the main project's `db` started in
> step 2 (`rootlessport … bind: address already in use`). Fixed by
> making the compose host ports overridable (`DB_PORT`/`APP_PORT`,
> defaults 5432/3000 unchanged) with the smoke stack on 5433, and
> by tearing the smoke project down via an EXIT trap so a failed
> `up` cannot leak containers. The image build itself, the
> in-container `migrate deploy`, and the readiness/header checks
> are still unproven on Fedora; full pass pending the rerun.
>
> Third Fedora run (2026-10-21, HEAD `4452215`): steps 1–7 PASSED
> again (third consecutive time); step 8 got past the port fix —
> the smoke database started — but `/api/health/ready` never
> answered and podman-compose reported `missing services [app]`.
> Root cause, proven with podman-compose 1.6.0's own parser
> (`podman-compose config`): since 7A the `app:` block sat after
> the top-level `volumes:` block at the same indent as
> `postgres_data:`, so YAML parsed `app` as a **volume**, not a
> service. podman-compose accepted the file silently, `up`
> started the only real service (db) and exited 0; no image was
> ever built. `docker-compose.yml` has been restructured with
> `app` under `services:` and re-validated against that parser
> (`services = {app, db}`, `volumes = {postgres_data}`). The
> in-container build/boot/readiness checks remain unproven until
> the next Fedora run.
>
> Fourth Fedora run (2026-10-21, HEAD `8eb6151`): steps 1–7 PASSED
> (fourth consecutive time) and the container build finally ran —
> failing in the deps stage at `npm ci`: "lock file's
> picomatch@2.3.2 does not satisfy picomatch@4.0.7". Reproduced
> locally: the committed lockfile is an npm 11 lockfile (npm 11
> `npm ci` accepts it — the Fedora host evidently runs npm 11,
> which is why step 1 passes there), while the npm 10.9.x bundled
> with `node:22-alpine` rejects it in the sync check. The lockfile
> was deliberately NOT regenerated under npm 10 (314-line diff,
> differently-shaped tree). Fix: the Dockerfile base stage pins
> `npm@11`, making the image build independent of the host's npm.
> Boot/readiness/header checks still unproven.
>
> Fifth Fedora run (2026-10-21, HEAD `c3be8e3`): steps 1–7 PASSED
> (fifth consecutive time); the image now builds end-to-end and
> both containers start, but the app crash-loops in its entrypoint:
> `Cannot find module 'effect'` from `@prisma/config` — the runner
> copied the Prisma CLI but not its transitive dependency closure,
> which Next's standalone tracing does not include. Reproduced
> and enumerated in the sandbox by running the entrypoint against
> a pruned `node_modules`: the missing closure is c12, deepmerge-ts,
> defu, destr, effect, empathic, exsolve, fast-check, jiti, pathe,
> perfect-debounce, pkg-types, pure-rand, rc9; with those present
> the config loads and Prisma proceeds to engine acquisition.
> Fix: the builder stages those lock-pinned packages into
> `/prisma-cli-deps` and the runner copies them into its
> `node_modules`. Readiness/header checks still unproven.

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
