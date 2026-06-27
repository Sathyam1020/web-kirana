#!/usr/bin/env sh
# Production deploy entrypoint for Railway (and any container host).
#
# Problem solved: Neon's serverless Postgres auto-suspends compute when
# idle. When Railway redeploys, the first connection attempt has to
# wake the compute, which can take 5–30s. The bare `prisma migrate
# deploy` command makes one attempt, fails with P1001 if Neon hasn't
# woken yet, and the deploy is reported as crashed — even though the
# DB is fine 20 seconds later.
#
# This wrapper retries the migration with exponential backoff. Total
# budget ~ 155s before giving up (5+10+20+40+80). That's well within
# Railway's deploy timeout and gives a sleeping Neon comfortable
# headroom to wake.
#
# If the migration ultimately fails, we still exit non-zero so Railway
# correctly reports the deploy as crashed — better to crash loud than
# start a server against an out-of-sync schema.
#
# Override: set SKIP_MIGRATIONS=true to bypass the migrate step
# entirely (emergency hot-restarts where the DB is fine but Prisma
# auth is broken or similar).

set -e

run_migrate() {
  npm run db:migrate:deploy
}

if [ "${SKIP_MIGRATIONS:-false}" = "true" ]; then
  echo "deploy-start: SKIP_MIGRATIONS=true — skipping prisma migrate deploy"
else
  MAX_ATTEMPTS=5
  SLEEP=5
  ATTEMPT=1
  while [ "$ATTEMPT" -le "$MAX_ATTEMPTS" ]; do
    echo "deploy-start: migrate attempt $ATTEMPT/$MAX_ATTEMPTS"
    if run_migrate; then
      echo "deploy-start: migrate succeeded on attempt $ATTEMPT"
      break
    fi
    if [ "$ATTEMPT" -eq "$MAX_ATTEMPTS" ]; then
      echo "deploy-start: migrate FAILED after $MAX_ATTEMPTS attempts — aborting boot"
      exit 1
    fi
    echo "deploy-start: migrate attempt $ATTEMPT failed; sleeping ${SLEEP}s before retry"
    sleep "$SLEEP"
    SLEEP=$((SLEEP * 2))
    ATTEMPT=$((ATTEMPT + 1))
  done
fi

echo "deploy-start: starting server"
exec npx tsx src/server.ts
