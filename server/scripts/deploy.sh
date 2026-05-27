#!/usr/bin/env bash
# Deploy: migrations → deploy → verify health.
set -euo pipefail

SERVER_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SERVER_URL="https://api.alexandria-library.com"

cd "$SERVER_DIR"

DB_NAME=$(grep -m1 '^database_name = ' wrangler.toml | cut -d'"' -f2 || true)
if [ -n "${DB_NAME:-}" ]; then
  echo "Applying D1 migrations ($DB_NAME)..."
  npx wrangler d1 migrations apply "$DB_NAME" --remote
  sleep 2
fi

echo "Deploying..."
npx wrangler deploy
sleep 2

HEALTH=$(curl -s "$SERVER_URL/health" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).status))" 2>/dev/null || echo "unknown")

echo ""
echo "Health: $HEALTH"
if [ "$HEALTH" != "ok" ]; then
  echo "WARNING: Health check returned $HEALTH"
fi

echo ""
echo "Run smoke tests: bash test/smoke.sh"
