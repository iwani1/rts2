#!/usr/bin/env bash
# D-092/7D: logical backup of the compose PostgreSQL database.
#
# Writes a timestamped custom-format pg_dump plus a SHA-256 checksum
# into ./backups (override with BACKUP_DIR). Runs pg_dump inside the
# compose `db` service so the host needs no PostgreSQL client tools.
# This script backs up; only scripts/restore-db.sh + the drill in
# docs/BACKUP_AND_RECOVERY.md prove the backup is usable.
#
# Usage: ./scripts/backup-db.sh [database-name]
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -n "${COMPOSE:-}" ]; then
  COMPOSE_CMD="$COMPOSE"
elif docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD="docker compose"
elif podman compose version >/dev/null 2>&1; then
  COMPOSE_CMD="podman compose"
else
  echo "Neither 'docker compose' nor 'podman compose' is available." >&2
  exit 1
fi

DB_NAME="${1:-richie_tms}"
case "$DB_NAME" in
  *_test) echo "Refusing: '$DB_NAME' looks like a test database; back up the operational database instead." >&2; exit 1 ;;
esac

BACKUP_DIR="${BACKUP_DIR:-backups}"
mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d%H%M%S)"
OUT="$BACKUP_DIR/${DB_NAME}-${STAMP}.dump"

echo "Backing up '$DB_NAME' via the compose db service -> $OUT"
$COMPOSE_CMD up -d db
$COMPOSE_CMD exec -T db pg_dump -U tms -Fc "$DB_NAME" > "$OUT"
sha256sum "$OUT" > "$OUT.sha256"
echo "Checksum: $(cat "$OUT.sha256")"
echo "Backup complete. Verify it with the restore drill in docs/BACKUP_AND_RECOVERY.md."
