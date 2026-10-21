#!/usr/bin/env bash
# D-092/7D: restore a backup-db.sh dump into a NEW database.
#
# Safety rails: the target database must not exist yet, its name must
# end in _restore or _test, and --confirm is required. Restoring over
# an existing (especially the live `richie_tms`) database is refused
# by construction, not by prompt — restore sideways, verify, then let
# the owner decide if/when the restored copy is promoted.
#
# Usage: ./scripts/restore-db.sh --confirm <dump-file> <new-database-name>
set -euo pipefail

cd "$(dirname "$0")/.."

if [ "${1:-}" != "--confirm" ] || [ -z "${2:-}" ] || [ -z "${3:-}" ]; then
  echo "Usage: ./scripts/restore-db.sh --confirm <dump-file> <new-database-name>" >&2
  exit 1
fi
DUMP="$2"
TARGET="$3"

case "$TARGET" in
  *_restore|*_test) ;;
  *) echo "Refusing: target '$TARGET' must end in _restore or _test (never an existing operational name)." >&2; exit 1 ;;
esac
[ -f "$DUMP" ] || { echo "Dump file not found: $DUMP" >&2; exit 1; }

if [ -f "$DUMP.sha256" ]; then
  echo "Verifying checksum..."
  sha256sum -c "$DUMP.sha256"
fi

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

$COMPOSE_CMD up -d db
EXISTS="$($COMPOSE_CMD exec -T db psql -U tms -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$TARGET'")"
if [ "$EXISTS" = "1" ]; then
  echo "Refusing: database '$TARGET' already exists. Restores only create new databases." >&2
  exit 1
fi

echo "Creating fresh database '$TARGET' and restoring $DUMP ..."
$COMPOSE_CMD exec -T db createdb -U tms -T template0 "$TARGET"
$COMPOSE_CMD exec -T db pg_restore -U tms -d "$TARGET" --no-owner < "$DUMP"
echo "Restore finished. Point a throwaway app instance at '$TARGET', run"
echo "  npm run db:migrate:deploy && npm run test:integration (read-only suites)"
echo "or simply inspect row counts before dropping it with:"
echo "  $COMPOSE_CMD exec -T db dropdb -U tms $TARGET"
