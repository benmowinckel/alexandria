#!/usr/bin/env bash
# Narrow account connection for an already-complete local Alexandria loop.
set -euo pipefail
umask 077

ALEX_DIR="${ALEX_DIR:-$HOME/alexandria}"
RUNTIME_DIR="${ALEX_RUNTIME_DIR:-$HOME/.local/share/alexandria}"
SERVER="https://api.alexandria-library.com"
KEY_FILE="$ALEX_DIR/system/.api_key"
PEOPLE_CONTEXT_PERMISSION="$ALEX_DIR/system/permissions/people-context"

fail() { echo "account connection failed: $1" >&2; exit 1; }

[ -f "$RUNTIME_DIR/.setup_complete" ] || fail "the private local loop is not fully set up"
[ -f "$ALEX_DIR/system/.block_complete" ] || fail "local onboarding is not complete"
[ -d "$ALEX_DIR/system" ] || fail "the Alexandria system folder is missing"
command -v curl >/dev/null 2>&1 || fail "curl is unavailable"
command -v node >/dev/null 2>&1 || fail "node is unavailable"

IFS= read -r connection_code || fail "no connection code was provided"
[[ "$connection_code" =~ ^alex_connect_[a-f0-9]{48}$ ]] || fail "the connection code is malformed"

client_version=$(cat "$RUNTIME_DIR/.payload_verified_sha" 2>/dev/null || cat "$RUNTIME_DIR/.factory_version" 2>/dev/null || true)
[[ "$client_version" =~ ^[A-Za-z0-9._-]{1,128}$ ]] || fail "the installed client version is unavailable"

work_dir=$(mktemp -d "$ALEX_DIR/system/.account-connect.XXXXXX") || fail "could not create a private temporary directory"
trap 'rm -rf "$work_dir"' EXIT
exchange_body="$work_dir/exchange.json"
exchange_response="$work_dir/exchange-response.json"
new_key="$work_dir/api-key"

current_key=""
if [ -s "$KEY_FILE" ]; then
  current_key=$(tr -d '[:space:]' < "$KEY_FILE")
  [[ "$current_key" =~ ^alex_[a-f0-9]{32}$ ]] || fail "the existing account key is malformed; it was not replaced"
fi

node -e '
  const fs=require("fs");
  fs.writeFileSync(process.argv[1], JSON.stringify({code:process.argv[2]}), {mode:0o600});
' "$exchange_body" "$connection_code"
unset connection_code

if [ -n "$current_key" ]; then
  exchange_http=$(curl -sS --max-time 20 --max-filesize 4096 -o "$exchange_response" -w '%{http_code}' \
    -X POST \
    -H 'Content-Type: application/json' \
    -H "X-Alexandria-Client: $client_version" \
    -H "Authorization: Bearer $current_key" \
    --data-binary "@$exchange_body" \
    "$SERVER/account/connect/exchange" || true)
else
  exchange_http=$(curl -sS --max-time 20 --max-filesize 4096 -o "$exchange_response" -w '%{http_code}' \
    -X POST \
    -H 'Content-Type: application/json' \
    -H "X-Alexandria-Client: $client_version" \
    --data-binary "@$exchange_body" \
    "$SERVER/account/connect/exchange" || true)
fi
[ "$exchange_http" = "200" ] || fail "the server rejected the connection request (status $exchange_http)"

# The response is never shown to the agent. This parser accepts only one exact
# capability shape or the exact existing-key flag; extra fields fail closed.
key_mode=$(node -e '
  const fs=require("fs");
  const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
  if(j.connected!==true) process.exit(1);
  const keys=Object.keys(j).sort().join(",");
  if(keys==="connected,use_existing_key" && j.use_existing_key===true) process.stdout.write("existing");
  else if(keys==="api_key,connected" && typeof j.api_key==="string" && /^alex_[a-f0-9]{32}$/.test(j.api_key)) {
    fs.writeFileSync(process.argv[2], j.api_key, {mode:0o600});
    process.stdout.write("new");
  } else process.exit(1);
' "$exchange_response" "$new_key" 2>/dev/null) || fail "the server returned an invalid connection response"

if [ "$key_mode" = "existing" ]; then
  [ -s "$KEY_FILE" ] || fail "the server expected an existing key, but none is present"
else
  [ -s "$new_key" ] || fail "the new key was not written privately"
  # Persist the only returned copy before any later network check can fail.
  # The server keeps other machine keys valid, so this cannot strand or
  # invalidate a previously healthy connection.
  chmod 600 "$new_key"
  mv "$new_key" "$KEY_FILE"
fi
chmod 600 "$KEY_FILE"
mkdir -p "$(dirname "$PEOPLE_CONTEXT_PERMISSION")"
printf '%s\n' 'on' > "$PEOPLE_CONTEXT_PERMISSION"
chmod 600 "$PEOPLE_CONTEXT_PERMISSION"

echo "your loop is connected to your Alexandria account."
echo "your private files stay on this computer; only public files you approve can be sent."
echo "when a person matters, your ai can now use only what that person allowed you to read in the Library."
