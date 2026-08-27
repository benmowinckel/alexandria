#!/usr/bin/env bash
# Resolve one bounded public Library source after account connection.
set -euo pipefail
umask 077

ALEX_DIR="${ALEX_DIR:-$HOME/alexandria}"
SERVER="https://api.alexandria-library.com"
KEY_FILE="$ALEX_DIR/system/.api_key"

fail() { echo "welcome source failed: $1" >&2; exit 1; }

[ -s "$KEY_FILE" ] || fail "this loop is not connected to an Alexandria account"
command -v curl >/dev/null 2>&1 || fail "curl is unavailable"
command -v node >/dev/null 2>&1 || fail "node is unavailable"

API_KEY=$(tr -d '[:space:]' < "$KEY_FILE")
[[ "$API_KEY" =~ ^alex_[a-f0-9]{32}$ ]] || fail "the account key is malformed"

work_dir=$(mktemp -d "$ALEX_DIR/system/.welcome-source.XXXXXX") || fail "could not create a private temporary directory"
trap 'rm -rf "$work_dir"' EXIT
response_body="$work_dir/response.json"
parsed="$work_dir/parsed"

http_code=$(curl -sS --max-time 20 --max-filesize 2048 -o "$response_body" -w '%{http_code}' \
  -H "Authorization: Bearer $API_KEY" \
  "$SERVER/library/me/welcome-source" || true)
unset API_KEY
[ "$http_code" = "200" ] || fail "the Library could not provide the welcome source (status $http_code)"

# Accept only three identifiers. URLs and all user-facing wording are built
# locally so a server response can never supply prose or executable content.
node -e '
  const fs = require("fs");
  const value = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (!value || Array.isArray(value) || typeof value !== "object") process.exit(1);
  if (Object.keys(value).sort().join(",") !== "self_login,source_kind,source_login") process.exit(1);
  const login = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;
  if (typeof value.self_login !== "string" || value.self_login.length > 39 || !login.test(value.self_login)) process.exit(1);
  if (typeof value.source_login !== "string" || value.source_login.length > 39 || !login.test(value.source_login)) process.exit(1);
  if (!["referral", "friend", "founder"].includes(value.source_kind)) process.exit(1);
  fs.writeFileSync(process.argv[2], [value.source_kind, value.source_login, value.self_login].join("\n"), {mode: 0o600});
' "$response_body" "$parsed" 2>/dev/null || fail "the Library returned an invalid welcome source"

source_kind=$(sed -n '1p' "$parsed")
source_login=$(sed -n '2p' "$parsed")
self_login=$(sed -n '3p' "$parsed")

echo "source: $source_kind"
echo "public page: https://alexandria-library.com/library/$source_login"
echo "your page: https://alexandria-library.com/library/$self_login"
