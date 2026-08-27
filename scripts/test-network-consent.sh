#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
TEST_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/alexandria-network-test.XXXXXX")
trap 'rm -rf "$TEST_ROOT"' EXIT

ALEX="$TEST_ROOT/alexandria"
RUNTIME="$TEST_ROOT/runtime"
FAKE_BIN="$TEST_ROOT/bin"
mkdir -p "$ALEX/files" "$ALEX/system/permissions" "$RUNTIME" "$FAKE_BIN"
touch "$RUNTIME/.setup_complete"

cat > "$FAKE_BIN/curl" <<'FAKECURL'
#!/usr/bin/env bash
set -euo pipefail
printf 'called\n' >> "${ALEXANDRIA_TEST_CURL_LOG:?}"
exit 99
FAKECURL
chmod +x "$FAKE_BIN/curl"

approve() {
  shasum -a 256 "$ALEX/files/network.md" | awk '{print $1}' > "$ALEX/system/permissions/network"
}

start_session() {
  HOME="$TEST_ROOT/home" \
  PATH="$FAKE_BIN:$PATH" \
  ALEXANDRIA_TEST_CURL_LOG="$TEST_ROOT/curl.log" \
  ALEXANDRIA_RUNTIME_DIR="$RUNTIME" \
    bash "$ROOT/factory/hooks/payload.sh" session-start "$ALEX" "" "" "" "" >/dev/null
}

printf '%s\n' 'https://alexandria-library.com/library/alpha close collaborator' > "$ALEX/files/network.md"
approve
mkdir -p "$ALEX/files/network/stale"
printf '%s\n' stale > "$ALEX/files/network/stale/shadow.md"

# Session start retires the old permission and cache without making a request.
start_session
test ! -e "$ALEX/files/network"
test -f "$ALEX/files/network.md"
test ! -e "$ALEX/system/permissions/network"
test -f "$ALEX/system/permissions/network.retired"
test -f "$ALEX/system/.retired_network_cache/stale/shadow.md"
test ! -e "$TEST_ROOT/curl.log"

# The retirement is idempotent and never turns back into an automatic reader.
start_session
test -f "$ALEX/files/network.md"
test -f "$ALEX/system/permissions/network.retired"
test -f "$ALEX/system/.retired_network_cache/stale/shadow.md"
test ! -e "$TEST_ROOT/curl.log"

echo "automatic network reader retirement contract passed"
