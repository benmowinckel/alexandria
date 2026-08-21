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

curl --fail-with-body --silent --show-error --max-time 20 \
  -X POST \
  -H "Authorization: Bearer $API_KEY" \
  "$SERVER/account/connect/handoff"
printf '\n'
