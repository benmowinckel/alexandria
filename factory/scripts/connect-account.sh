#!/usr/bin/env bash
# Narrow account connection for an already-complete local Alexandria loop.
set -euo pipefail
umask 077

ALEX_DIR="${ALEX_DIR:-$HOME/alexandria}"
RUNTIME_DIR="${ALEX_RUNTIME_DIR:-$HOME/.local/share/alexandria}"
SERVER="https://api.alexandria-library.com"
KEY_FILE="$ALEX_DIR/system/.api_key"
STATUS_FILE="$ALEX_DIR/system/.protocol_status.json"

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
current_status="$work_dir/current-status.json"
exchange_body="$work_dir/exchange.json"
exchange_response="$work_dir/exchange-response.json"
new_key="$work_dir/api-key"
verified_status="$work_dir/protocol-status.json"

current_login=""
if [ -s "$KEY_FILE" ]; then
  current_key=$(cat "$KEY_FILE")
  current_http=$(curl -sS --max-time 15 -o "$current_status" -w '%{http_code}' \
    -H "Authorization: Bearer $current_key" \
    -H "X-Alexandria-Client: $client_version" \
    "$SERVER/alexandria" || true)
  if [ "$current_http" = "200" ]; then
    current_login=$(node -e '
      const fs=require("fs");
      const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
      if(j.connected!==true || !j.account || typeof j.account.github_login!=="string") process.exit(1);
      process.stdout.write(j.account.github_login.toLowerCase());
    ' "$current_status") || fail "the existing account status is malformed"
  else
    fail "the existing account key could not be verified; it was not replaced"
  fi
fi

node -e '
  const fs=require("fs");
  const body={code:process.argv[2]};
  if(process.argv[3]) body.expected_current_login=process.argv[3];
  fs.writeFileSync(process.argv[1], JSON.stringify(body), {mode:0o600});
' "$exchange_body" "$connection_code" "$current_login"
unset connection_code

if [ -n "$current_login" ]; then
  exchange_http=$(curl -sS --max-time 20 -o "$exchange_response" -w '%{http_code}' \
    -X POST \
    -H 'Content-Type: application/json' \
    -H "X-Alexandria-Client: $client_version" \
    -H "Authorization: Bearer $current_key" \
    --data-binary "@$exchange_body" \
    "$SERVER/account/connect/exchange" || true)
else
  exchange_http=$(curl -sS --max-time 20 -o "$exchange_response" -w '%{http_code}' \
    -X POST \
    -H 'Content-Type: application/json' \
    -H "X-Alexandria-Client: $client_version" \
    --data-binary "@$exchange_body" \
    "$SERVER/account/connect/exchange" || true)
fi
[ "$exchange_http" = "200" ] || {
  message=$(node -e 'try{const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.stdout.write(String(j.error||"server rejected the request"))}catch{process.stdout.write("server rejected the request")}' "$exchange_response")
  fail "$message"
}

exchange_login=$(node -e '
  const fs=require("fs");
  const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
  if(j.connected!==true || typeof j.github_login!=="string") process.exit(1);
  if(j.use_existing_key===true) process.stdout.write("existing\n"+j.github_login.toLowerCase());
  else if(typeof j.api_key==="string" && /^alex_[a-f0-9]{32}$/.test(j.api_key)) {
    fs.writeFileSync(process.argv[2], j.api_key, {mode:0o600});
    process.stdout.write("new\n"+j.github_login.toLowerCase());
  } else process.exit(1);
' "$exchange_response" "$new_key") || fail "the server returned an invalid connection response"
key_mode=${exchange_login%%$'\n'*}
github_login=${exchange_login#*$'\n'}

if [ "$key_mode" = "existing" ]; then
  [ -s "$KEY_FILE" ] || fail "the server expected an existing key, but none is present"
  validation_key=$(cat "$KEY_FILE")
else
  [ -s "$new_key" ] || fail "the new key was not written privately"
  # Persist the only returned copy before any later network check can fail.
  # The server keeps other machine keys valid, so this cannot strand or
  # invalidate a previously healthy connection.
  chmod 600 "$new_key"
  mv "$new_key" "$KEY_FILE"
  validation_key=$(cat "$KEY_FILE")
fi

status_http=$(curl -sS --max-time 20 -o "$verified_status" -w '%{http_code}' \
  -H "Authorization: Bearer $validation_key" \
  -H "X-Alexandria-Client: $client_version" \
  "$SERVER/alexandria" || true)
[ "$status_http" = "200" ] || fail "the live account response could not be verified"
node -e '
  const fs=require("fs");
  const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
  if(j.connected!==true || !j.account || j.account.membership_active!==true) process.exit(1);
  if(String(j.account.github_login||"").toLowerCase()!==process.argv[2]) process.exit(1);
  if(!j.module_system || !Number.isInteger(j.module_system.version)) process.exit(1);
' "$verified_status" "$github_login" || fail "the live account response did not prove the expected active membership"

chmod 600 "$verified_status"
mv "$verified_status" "$STATUS_FILE"
chmod 600 "$KEY_FILE" "$STATUS_FILE"

echo "connected to alexandria as $github_login; active membership verified."
echo "your existing local loop can now verify your account and membership at session start. it stays passive until you start an Alexandria session."
echo "no private files were read and no optional capability was enabled."
