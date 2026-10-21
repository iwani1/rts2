# Backup and recovery

No production database/host is configured yet and no backup has been
restored in anger: **do not imply availability guarantees**. What
exists since D-092/7D is an executable procedure; what remains the
owner's to decide is listed at the end.

## Procedure (compose deployment)

```bash
# Back up (timestamped pg_dump custom format + SHA-256 checksum):
./scripts/backup-db.sh                 # -> backups/richie_tms-<stamp>.dump

# Restore — only ever into a NEW database ending in _restore or _test:
./scripts/restore-db.sh --confirm backups/richie_tms-<stamp>.dump richie_tms_restore
```

- `backup-db.sh` runs `pg_dump` inside the compose `db` service (no
  host PostgreSQL tools needed) and refuses `*_test` database names.
- `restore-db.sh` verifies the checksum when present, refuses any
  target that already exists, and never overwrites: restore
  sideways, verify the copy, then the owner decides on promotion.
- Copy dumps off the host (encrypted storage, separate credentials);
  a dump sitting next to the database is not a backup strategy.

## Restore drill (monthly until launch, then per owner policy)

1. `./scripts/backup-db.sh`
2. `./scripts/restore-db.sh --confirm <dump> richie_tms_restore`
3. With `DATABASE_URL` pointed at `richie_tms_restore`: run
   `npm run db:migrate:deploy` (must report the schema up to date),
   start the app, and check `/api/health/ready` plus one signed-in
   page (finance dashboard totals against the backup-time figures).
4. `podman compose exec -T db dropdb -U tms richie_tms_restore` and
   record date/result in the operations log.

A backup is verified only when a drill like this succeeds.

## Owner decisions still required

Backup provider and off-host storage, encryption at rest and key
custody, retention period, recovery-point/recovery-time objectives,
backup failure alerting, and who may approve a production restore.
Protect personal/financial data in retained backups under Act 843.
Docker local volume is development only and is not a backup.
