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

# Mock only the connector's two API calls; any other URL or method fails.
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
      existing) printf '%s' '{"connected":true,"use_existing_key":true,"github_login":"new-author"}' > "$out"; printf '200' ;;
      different) printf '%s' '{"error":"This computer is connected to a different Alexandria account."}' > "$out"; printf '409' ;;
      *) printf '%s' '{"connected":true,"api_key":"alex_11111111111111111111111111111111","github_login":"new-author"}' > "$out"; printf '200' ;;
    esac
    ;;
  GET:*/alexandria)
    if [ "${MOCK_MODE:-}" = 'unreachable' ]; then
      printf '%s' '{"error":"unavailable"}' > "$out"
      printf '503'
      exit 0
    fi
    printf '%s' '{"connected":true,"account":{"github_login":"new-author","membership_active":true},"module_system":{"version":1}}' > "$out"
    printf '200'
    ;;
  *) exit 3 ;;
esac
MOCK
chmod 700 "$tmp/bin/curl"

env HOME="$tmp/healthy" ALEX_DIR="$tmp/healthy/alexandria" ALEX_RUNTIME_DIR="$tmp/healthy/runtime" PATH="$tmp/bin:$PATH" bash "$CONNECTOR" <<<"$CODE" >"$tmp/success"
[ "$(sed -n '1p' "$tmp/success")" = 'connected to alexandria as new-author; active membership verified.' ] || fail "success did not prove the connected account"
[ "$(sed -n '2p' "$tmp/success")" = 'your existing local loop can now verify your account and membership at session start. it stays passive until you start an Alexandria session.' ] || fail "success did not distinguish passive connection from active engagement"
[ "$(sed -n '3p' "$tmp/success")" = 'no private files were read and no optional capability was enabled.' ] || fail "success overstated connection scope"
[ "$(wc -l < "$tmp/success" | tr -d ' ')" = '3' ] || fail "success output is not the minimal three-line proof"
[ "$(cat "$tmp/healthy/alexandria/system/.api_key")" = 'alex_11111111111111111111111111111111' ] || fail "wrong key written"
node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));if(j.connected!==true||j.account.github_login!=="new-author")process.exit(1)' "$tmp/healthy/alexandria/system/.protocol_status.json" || fail "status was not verified"
node -e 'const fs=require("fs");const mode=fs.statSync(process.argv[1]).mode&0o777;if(mode!==0o600)process.exit(1)' "$tmp/healthy/alexandria/system/.api_key" || fail "key mode is not 0600"
[ ! -e "$tmp/healthy/alexandria/system/permissions" ] || fail "an optional permission was created"

# Reconnecting the same account reuses the valid local key instead of rotating.
old_key=$(cat "$tmp/healthy/alexandria/system/.api_key")
env MOCK_MODE=existing HOME="$tmp/healthy" ALEX_DIR="$tmp/healthy/alexandria" ALEX_RUNTIME_DIR="$tmp/healthy/runtime" PATH="$tmp/bin:$PATH" bash "$CONNECTOR" <<<"$CODE" >"$tmp/reuse"
[ "$(cat "$tmp/healthy/alexandria/system/.api_key")" = "$old_key" ] || fail "same-account reconnect replaced the working key"

# An existing key that cannot be verified is unrelated configuration: fail
# closed before exchange and leave both local files byte-for-byte unchanged.
status_hash=$(shasum -a 256 "$tmp/healthy/alexandria/system/.protocol_status.json" | awk '{print $1}')
expect_fail env MOCK_MODE=unreachable HOME="$tmp/healthy" ALEX_DIR="$tmp/healthy/alexandria" ALEX_RUNTIME_DIR="$tmp/healthy/runtime" PATH="$tmp/bin:$PATH" bash "$CONNECTOR" <<<"$CODE"
[ "$(cat "$tmp/healthy/alexandria/system/.api_key")" = "$old_key" ] || fail "unverified existing key was replaced"
[ "$(shasum -a 256 "$tmp/healthy/alexandria/system/.protocol_status.json" | awk '{print $1}')" = "$status_hash" ] || fail "unverified existing status was replaced"

# A different-account code fails without replacing either local file.
expect_fail env MOCK_MODE=different HOME="$tmp/healthy" ALEX_DIR="$tmp/healthy/alexandria" ALEX_RUNTIME_DIR="$tmp/healthy/runtime" PATH="$tmp/bin:$PATH" bash "$CONNECTOR" <<<"$CODE"
[ "$(cat "$tmp/healthy/alexandria/system/.api_key")" = "$old_key" ] || fail "different-account failure replaced the key"
[ "$(shasum -a 256 "$tmp/healthy/alexandria/system/.protocol_status.json" | awk '{print $1}')" = "$status_hash" ] || fail "different-account failure replaced status"

echo "connect-account cold-home and write-scope contract: ok"
