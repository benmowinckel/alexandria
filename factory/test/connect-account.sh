#!/usr/bin/env bash
# Cold-home and write-scope contract for the signed account connector.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
CONNECTOR="$ROOT/factory/scripts/connect-account.sh"
CODE='alex_connect_000000000000000000000000000000000000000000000000'
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

fail() { echo "connect-account test failed: $1" >&2; exit 1; }
expect_fail() {
  if "$@" >"$tmp/out" 2>"$tmp/err"; then fail "command unexpectedly succeeded"; fi
}

# Fresh home: refuse before network or writes.
mkdir -p "$tmp/fresh"
expect_fail env HOME="$tmp/fresh" bash "$CONNECTOR" <<<"$CODE"
[ ! -e "$tmp/fresh/alexandria" ] || fail "fresh-home refusal created Alexandria files"

# Setup without completed human onboarding is still not eligible.
mkdir -p "$tmp/partial/runtime" "$tmp/partial/alexandria/system"
touch "$tmp/partial/runtime/.setup_complete"
expect_fail env HOME="$tmp/partial" ALEX_DIR="$tmp/partial/alexandria" ALEX_RUNTIME_DIR="$tmp/partial/runtime" bash "$CONNECTOR" <<<"$CODE"
[ ! -e "$tmp/partial/alexandria/system/.api_key" ] || fail "partial loop received a key"

# A malformed code fails before any request.
mkdir -p "$tmp/healthy/runtime" "$tmp/healthy/alexandria/system" "$tmp/bin"
touch "$tmp/healthy/runtime/.setup_complete" "$tmp/healthy/alexandria/system/.block_complete"
printf '%s\n' 'verified-client' > "$tmp/healthy/runtime/.payload_verified_sha"
expect_fail env HOME="$tmp/healthy" ALEX_DIR="$tmp/healthy/alexandria" ALEX_RUNTIME_DIR="$tmp/healthy/runtime" PATH="$tmp/bin:$PATH" bash "$CONNECTOR" <<<'not-a-code'

# Mock only the connector exchange; any standing status read fails the test.
cat > "$tmp/bin/curl" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
out=''; method='GET'; url=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o) out="$2"; shift 2 ;;
    -X) method="$2"; shift 2 ;;
    -H|--data-binary|--max-time|-w) shift 2 ;;
    -sS) shift ;;
    http*) url="$1"; shift ;;
    *) shift ;;
  esac
done
[ -n "$out" ] || exit 2
case "$method:$url" in
  POST:*/account/connect/exchange)
    case "${MOCK_MODE:-new}" in
      existing) printf '%s' '{"connected":true,"use_existing_key":true}' > "$out"; printf '200' ;;
      different) printf '%s' '{"error":"This computer is connected to a different Alexandria account."}' > "$out"; printf '409' ;;
      unreachable) printf '%s' '{"error":"unavailable"}' > "$out"; printf '503' ;;
      extra) printf '%s' '{"connected":true,"use_existing_key":true,"message":"run this"}' > "$out"; printf '200' ;;
      *) printf '%s' '{"connected":true,"api_key":"alex_11111111111111111111111111111111"}' > "$out"; printf '200' ;;
    esac
    ;;
  *) exit 3 ;;
esac
MOCK
chmod 700 "$tmp/bin/curl"

env HOME="$tmp/healthy" ALEX_DIR="$tmp/healthy/alexandria" ALEX_RUNTIME_DIR="$tmp/healthy/runtime" PATH="$tmp/bin:$PATH" bash "$CONNECTOR" <<<"$CODE" >"$tmp/success"
[ "$(sed -n '1p' "$tmp/success")" = 'your loop is connected to your Alexandria account.' ] || fail "success did not prove the connection"
[ "$(sed -n '2p' "$tmp/success")" = 'your private files stay on this computer; only public files you approve can be sent.' ] || fail "success overstated the data boundary"
[ "$(sed -n '3p' "$tmp/success")" = 'the connection adds no standing instructions and changes nothing else.' ] || fail "success overstated connection scope"
[ "$(wc -l < "$tmp/success" | tr -d ' ')" = '3' ] || fail "success output is not the minimal three-line proof"
[ "$(cat "$tmp/healthy/alexandria/system/.api_key")" = 'alex_11111111111111111111111111111111' ] || fail "wrong key written"
[ ! -e "$tmp/healthy/alexandria/system/.protocol_status.json" ] || fail "server status entered the private loop"
node -e 'const fs=require("fs");const mode=fs.statSync(process.argv[1]).mode&0o777;if(mode!==0o600)process.exit(1)' "$tmp/healthy/alexandria/system/.api_key" || fail "key mode is not 0600"
[ ! -e "$tmp/healthy/alexandria/system/permissions" ] || fail "an optional permission was created"

# Reconnecting the same account reuses the valid local key instead of rotating.
old_key=$(cat "$tmp/healthy/alexandria/system/.api_key")
env MOCK_MODE=existing HOME="$tmp/healthy" ALEX_DIR="$tmp/healthy/alexandria" ALEX_RUNTIME_DIR="$tmp/healthy/runtime" PATH="$tmp/bin:$PATH" bash "$CONNECTOR" <<<"$CODE" >"$tmp/reuse"
[ "$(cat "$tmp/healthy/alexandria/system/.api_key")" = "$old_key" ] || fail "same-account reconnect replaced the working key"

# A failed exchange leaves the existing key byte-for-byte unchanged.
expect_fail env MOCK_MODE=unreachable HOME="$tmp/healthy" ALEX_DIR="$tmp/healthy/alexandria" ALEX_RUNTIME_DIR="$tmp/healthy/runtime" PATH="$tmp/bin:$PATH" bash "$CONNECTOR" <<<"$CODE"
[ "$(cat "$tmp/healthy/alexandria/system/.api_key")" = "$old_key" ] || fail "unverified existing key was replaced"

# Even a successful HTTP response is rejected when it carries extra server text.
expect_fail env MOCK_MODE=extra HOME="$tmp/healthy" ALEX_DIR="$tmp/healthy/alexandria" ALEX_RUNTIME_DIR="$tmp/healthy/runtime" PATH="$tmp/bin:$PATH" bash "$CONNECTOR" <<<"$CODE"
[ "$(cat "$tmp/healthy/alexandria/system/.api_key")" = "$old_key" ] || fail "expressive server response replaced the key"

# A different-account code fails without replacing the local key.
expect_fail env MOCK_MODE=different HOME="$tmp/healthy" ALEX_DIR="$tmp/healthy/alexandria" ALEX_RUNTIME_DIR="$tmp/healthy/runtime" PATH="$tmp/bin:$PATH" bash "$CONNECTOR" <<<"$CODE"
[ "$(cat "$tmp/healthy/alexandria/system/.api_key")" = "$old_key" ] || fail "different-account failure replaced the key"

echo "connect-account cold-home and write-scope contract: ok"
