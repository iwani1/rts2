#!/usr/bin/env bash
# Phase 7 verification on Fedora (docs/PHASE_7_VERIFICATION.md).
#
# Creates a FRESH disposable *_test database, applies all migrations, then
# runs typecheck, lint, the unit suite and the PostgreSQL integration suite.
# Integration suites create synthetic companies/users and never clean them up
# (AuditEvent is append-only), so never point this at a database you reuse.
#
# Usage:  ./scripts/verify-phase4.sh
# Env overrides: COMPOSE="podman compose" | "docker compose" (auto-detected)
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

DB_NAME="richie_tms_p7_$(date +%Y%m%d%H%M%S)_test"
case "$DB_NAME" in
  *_test) ;;
  *) echo "Refusing: test database name must end in _test" >&2; exit 1 ;;
esac

mkdir -p verification-logs
LOG="verification-logs/phase7-$(date +%Y%m%d%H%M%S).log"
exec > >(tee -a "$LOG") 2>&1

echo "== Phase 7 verification =="
echo "Repo:      $(pwd)"
echo "Commit:    $(git rev-parse --short HEAD) on $(git branch --show-current)"
echo "Database:  $DB_NAME (fresh, disposable)"
echo "Log file:  $LOG"
echo

echo "== 1/7 Dependencies and Prisma client =="
npm ci
npm run db:generate

echo
echo "== 2/7 Start PostgreSQL and create the fresh test database =="
$COMPOSE_CMD up -d db
$COMPOSE_CMD exec -T db createdb -U tms -T template0 "$DB_NAME"

export TMS_TEST_DATABASE_URL="postgresql://tms:tms_local_only@localhost:5432/$DB_NAME"
export DATABASE_URL="$TMS_TEST_DATABASE_URL"
export APP_URL="http://localhost:3000"
export AUTH_SECRET="$(openssl rand -hex 32)"

echo
echo "== 3/7 Apply test migrations (expect: 42 applied) =="
npm run db:test:migrate

echo
echo "== 4/7 Typecheck =="
npm run typecheck

echo
echo "== 5/7 Lint =="
npm run lint

echo
echo "== 6/7 Unit tests (incl. the revenue-stream, ageing and invoice matrices plus the D-092 header and env validators) =="
npm test

echo
echo "== 7/7 Integration tests (PostgreSQL; includes the full regression corpus; a container smoke test (step 8) then proves the production image boots, migrates and answers readiness) =="
npm run test:integration

echo
echo "== 8/8 Container smoke test (D-092): build the image, boot app + db, require readiness =="
SMOKE_PROJECT="richie-tms-smoke"
$COMPOSE_CMD -p "$SMOKE_PROJECT" down -v >/dev/null 2>&1 || true
AUTH_SECRET="$(openssl rand -hex 32)" APP_URL="http://localhost:3000" $COMPOSE_CMD -p "$SMOKE_PROJECT" up -d --build
READY=""
for attempt in $(seq 1 30); do
  if curl -fsS http://localhost:3000/api/health/ready >/dev/null 2>&1; then READY="yes"; break; fi
  sleep 3
done
if [ -z "$READY" ]; then
  echo "Container smoke failed: /api/health/ready never became ready." >&2
  $COMPOSE_CMD -p "$SMOKE_PROJECT" logs app | tail -50 >&2 || true
  $COMPOSE_CMD -p "$SMOKE_PROJECT" down -v >/dev/null 2>&1 || true
  exit 1
fi
curl -fsS http://localhost:3000/api/health
echo
echo "Security headers (production):"
curl -fsSI http://localhost:3000/login | grep -iE "content-security-policy|x-frame-options|strict-transport|x-robots-tag" || true
$COMPOSE_CMD -p "$SMOKE_PROJECT" down -v
echo "Container smoke passed and was torn down."

echo
echo "== Phase 7 verification finished =="
echo "Test database kept for inspection: $DB_NAME"
echo "Drop it later with: $COMPOSE_CMD exec -T db dropdb -U tms $DB_NAME"
echo "Full log: $LOG"
echo "After this run: docs/PHASE_7_VERIFICATION.md (container drill + backup drill)."
