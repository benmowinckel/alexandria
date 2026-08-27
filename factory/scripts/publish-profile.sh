#!/usr/bin/env bash
# Publish one exact, already-approved Library profile draft. No standing sync.
set -euo pipefail
umask 077

ALEX_DIR="${ALEX_DIR:-$HOME/alexandria}"
SERVER="https://api.alexandria-library.com"
DRAFT="$ALEX_DIR/files/library/_profile.json"
KEY_FILE="$ALEX_DIR/system/.api_key"
EXPECTED_HASH="${1:-}"

fail() { echo "profile publish failed: $1" >&2; exit 1; }

[[ "$EXPECTED_HASH" =~ ^[a-f0-9]{64}$ ]] || fail "the approved draft hash is missing or malformed"
[ -f "$DRAFT" ] && [ ! -L "$DRAFT" ] || fail "the private profile draft is missing or is not a regular file"
[ "$(wc -c < "$DRAFT" | tr -d ' ')" -le 65536 ] || fail "the profile draft is too large"
[ -s "$KEY_FILE" ] || fail "this loop is not connected to an Alexandria account"
command -v curl >/dev/null 2>&1 || fail "curl is unavailable"
command -v node >/dev/null 2>&1 || fail "node is unavailable"

if command -v shasum >/dev/null 2>&1; then
  ACTUAL_HASH=$(shasum -a 256 "$DRAFT" | cut -d' ' -f1)
else
  ACTUAL_HASH=$(sha256sum "$DRAFT" | cut -d' ' -f1)
fi
[ "$ACTUAL_HASH" = "$EXPECTED_HASH" ] || fail "the draft changed after approval"

API_KEY=$(tr -d '[:space:]' < "$KEY_FILE")
[[ "$API_KEY" =~ ^alex_[a-f0-9]{32}$ ]] || fail "the account key is malformed"

work_dir=$(mktemp -d "$ALEX_DIR/system/.profile-publish.XXXXXX") || fail "could not create a private temporary directory"
trap 'rm -rf "$work_dir"' EXIT
request_body="$work_dir/profile.json"
response_body="$work_dir/response.json"

# Fail closed on anything outside the deliberately tiny public profile shape.
# Validation changes nothing: the approved draft bytes are the bytes sent.
node -e '
  const fs = require("fs");
  const input = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (!input || Array.isArray(input) || typeof input !== "object") process.exit(1);
  const allowed = new Set(["display_name", "text", "website", "socials"]);
  if (Object.keys(input).some((key) => !allowed.has(key))) process.exit(1);
  let hasValue = false;
  const validString = (value, max) => {
    if (typeof value !== "string") process.exit(1);
    if (!value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) process.exit(1);
    hasValue = true;
  };
  if ("display_name" in input) validString(input.display_name, 100);
  if ("text" in input) validString(input.text, 160);
  if ("website" in input) {
    validString(input.website, 500);
    const url = new URL(input.website);
    if (!["http:", "https:"].includes(url.protocol)) process.exit(1);
  }
  if ("socials" in input) {
    if (!Array.isArray(input.socials) || input.socials.length > 20) process.exit(1);
    for (const item of input.socials) {
      if (!item || Array.isArray(item) || typeof item !== "object") process.exit(1);
      if (Object.keys(item).some((key) => key !== "label" && key !== "url")) process.exit(1);
      validString(item.label, 40);
      validString(item.url, 500);
      const url = new URL(item.url);
      if (!["http:", "https:"].includes(url.protocol)) process.exit(1);
    }
  }
  if (!hasValue) process.exit(1);
' "$DRAFT" || fail "the draft is not a valid public profile"
cp "$DRAFT" "$request_body" || fail "the approved draft could not be prepared"
chmod 600 "$request_body"

http_code=$(curl -sS --max-time 20 --max-filesize 1024 -o "$response_body" -w '%{http_code}' \
  -X PUT \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $API_KEY" \
  --data-binary "@$request_body" \
  "$SERVER/library/me/profile" || true)
unset API_KEY
[ "$http_code" = "200" ] || fail "the Library rejected the profile (status $http_code)"

node -e '
  const fs = require("fs");
  const value = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (!value || value.ok !== true || Object.keys(value).sort().join(",") !== "ok") process.exit(1);
' "$response_body" 2>/dev/null || fail "the Library returned an unexpected response"

echo "your public Library page is live."
echo "nothing else was published or enabled."
echo "open https://alexandria-library.com/library to see it."
