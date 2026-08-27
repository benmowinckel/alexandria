#!/usr/bin/env bash
set -euo pipefail

ALEX_DIR="${ALEX_DIR:-$HOME/alexandria}"
KEY_FILE="$ALEX_DIR/system/.api_key"
SERVER="https://api.alexandria-library.com"

[ -r "$KEY_FILE" ] || {
  echo "this computer is not connected to an Alexandria account" >&2
  exit 1
}

API_KEY=$(tr -d '[:space:]' < "$KEY_FILE")
[[ "$API_KEY" =~ ^alex_[a-f0-9]{32}$ ]] || {
  echo "the local Alexandria account key is invalid" >&2
  exit 1
}

response=$(mktemp "${TMPDIR:-/tmp}/alexandria-handoff.XXXXXX") || exit 1
trap 'rm -f "$response"' EXIT
status=$(curl --silent --show-error --max-time 20 --max-filesize 1024 -o "$response" -w '%{http_code}' \
  -X POST \
  -H "Authorization: Bearer $API_KEY" \
  "$SERVER/account/connect/handoff" 2>/dev/null || true)
[ "$status" = "200" ] || {
  echo "could not create a connection code (status $status)" >&2
  exit 1
}
code=$(tr -d '\r\n' < "$response")
[[ "$code" =~ ^alex_connect_[a-f0-9]{48}$ ]] || {
  echo "the server returned an invalid connection code" >&2
  exit 1
}
printf '%s\n' "$code"
