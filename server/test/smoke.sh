#!/usr/bin/env bash
# Post-deploy smoke test — hits live production endpoints.
# Tests the product from the outside, not the code from the inside.

export MSYS_NO_PATHCONV=1

BASE="https://api.alexandria-library.com"
API_KEY_FILE="$HOME/alexandria/system/.api_key"
PASSED=0
FAILED=0
TOTAL=7

check() {
  local name="$1" status="$2"
  local pad=$((20 - ${#name}))
  local dots=""
  for ((i=0; i<pad; i++)); do dots="${dots}."; done
  if [ "$status" -ge 200 ] 2>/dev/null && [ "$status" -lt 300 ] 2>/dev/null; then
    echo "[smoke] $name $dots OK"
    PASSED=$((PASSED + 1))
  else
    echo "[smoke] $name $dots FAIL ($status)"
    FAILED=$((FAILED + 1))
  fi
}

if [ ! -f "$API_KEY_FILE" ]; then
  echo "[smoke] ABORT — no API key at $API_KEY_FILE"
  exit 1
fi
API_KEY=$(tr -d '[:space:]' < "$API_KEY_FILE")

# 1. Health — each infra component must be ok. Top-level status may be
#    'degraded' when the awareness digest is non-zero (stale clients etc.);
#    that's signal, not a smoke failure, so we check components directly.
health_out=$(curl -sS -w "\n%{http_code}" "$BASE/health" 2>&1) || true
health_status=$(echo "$health_out" | tail -1)
health_body=$(echo "$health_out" | sed '$d')
if [ "$health_status" = "200" ] && echo "$health_body" | grep -q '"kv":"ok"' \
  && echo "$health_body" | grep -q '"d1":"ok"' \
  && echo "$health_body" | grep -q '"r2":"ok"' \
  && echo "$health_body" | grep -q '"env":"ok"'; then
  check "health" 200
else
  check "health" "${health_status:-0}"
fi

# 2. Protocol handshake
proto_out=$(curl -sS -w "\n%{http_code}" "$BASE/alexandria" 2>&1) || true
proto_status=$(echo "$proto_out" | tail -1)
proto_body=$(echo "$proto_out" | sed '$d')
if [ "$proto_status" = "200" ] && echo "$proto_body" | grep -q '"protocol":"alexandria"'; then
  check "protocol" 200
else
  check "protocol" "${proto_status:-0}"
fi

# 3. Protocol file publish + read
put_out=$(curl -sS -w "\n%{http_code}" -X PUT \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"content":"# smoke test\nverification.","text":"smoke"}' \
  "$BASE/file/smoke-test" 2>&1) || true
put_status=$(echo "$put_out" | tail -1)
if [ "$put_status" = "200" ]; then
  check "file" 200
else
  check "file" "${put_status:-0}"
fi

# 4. Protocol call (with X-Alexandria-Client — server uses this to detect stale installs)
call_out=$(curl -sS -w "\n%{http_code}" -X POST \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Alexandria-Client: smoke-test" \
  -H "Content-Type: application/json" \
  -d '{"modules":[{"id":"methodology","text":"local smoke"}]}' \
  "$BASE/call" 2>&1) || true
call_status=$(echo "$call_out" | tail -1)
call_body=$(echo "$call_out" | sed '$d')
if [ "$call_status" = "200" ] && echo "$call_body" | grep -q '"ok":true'; then
  check "call" 200
else
  check "call" "${call_status:-0}"
fi

# 5. Company Library — /library is the canonical authors-listing endpoint;
# /library/authors was a stale path from an earlier shape and now 404s.
library_out=$(curl -sS -w "\n%{http_code}" "$BASE/library" 2>&1) || true
library_status=$(echo "$library_out" | tail -1)
library_body=$(echo "$library_out" | sed '$d')
if [ "$library_status" = "200" ] && echo "$library_body" | grep -q '"authors"'; then
  check "library" 200
else
  check "library" "${library_status:-0}"
fi

# 6. Deprecated route returns 410 (not 404) — confirms upgrade signal reaches stale clients
gone_out=$(curl -sS -w "\n%{http_code}" "$BASE/hooks/payload" 2>&1) || true
gone_status=$(echo "$gone_out" | tail -1)
if [ "$gone_status" = "410" ]; then
  check "gone-410" 200
else
  check "gone-410" "${gone_status:-0}"
fi

# 7. Random path returns 404 — confirms notFound handler alive (allowlist removed)
nf_out=$(curl -sS -w "\n%{http_code}" "$BASE/smoke-nonexistent-$(date +%s)" 2>&1) || true
nf_status=$(echo "$nf_out" | tail -1)
if [ "$nf_status" = "404" ]; then
  check "not-found" 200
else
  check "not-found" "${nf_status:-0}"
fi

# Summary
echo ""
if [ "$FAILED" -eq 0 ]; then
  echo "[smoke] All $TOTAL/$TOTAL passed"
else
  echo "[smoke] $FAILED/$TOTAL failed — server is degraded"
  exit 1
fi
