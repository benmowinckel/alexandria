#!/usr/bin/env bash
# Narrow account connection. Website mode has no local-loop dependency.
set -euo pipefail
umask 077

MODE="${1:-loop}"
case "$MODE" in loop|--website) ;; *) echo 'account connection failed: unknown mode' >&2; exit 1 ;; esac
ALEX_DIR="${ALEX_DIR:-$HOME/alexandria}"
if [ "$MODE" = --website ]; then
  STATE_DIR="${ALEX_CONNECTOR_DIR:-$HOME/.config/alexandria/connector}"
  RUNTIME_DIR="${ALEX_RUNTIME_DIR:-$HOME/.local/share/alexandria-connector}"
else
  STATE_DIR="$ALEX_DIR/system"
  RUNTIME_DIR="${ALEX_RUNTIME_DIR:-$HOME/.local/share/alexandria}"
fi
SERVER="https://api.alexandria-library.com"
KEY_FILE="$STATE_DIR/.api_key"
PEOPLE_CONTEXT_PERMISSION="$STATE_DIR/permissions/people-context"

fail() { echo "account connection failed: $1" >&2; exit 1; }

if [ "$MODE" = --website ]; then
  [ -f "$RUNTIME_DIR/.connector_complete" ] && [ -f "$STATE_DIR/.connect" ] || fail "the reviewed website connector is not prepared"
else
  [ -f "$RUNTIME_DIR/.setup_complete" ] || fail "the private local loop is not fully set up"
  [ -f "$ALEX_DIR/system/.block_complete" ] || fail "local onboarding is not complete"
fi
[ -d "$STATE_DIR" ] && [ ! -L "$STATE_DIR" ] || fail "the account state folder is missing or linked"
[ ! -L "$KEY_FILE" ] && [ ! -L "$STATE_DIR/permissions" ] && [ ! -L "$PEOPLE_CONTEXT_PERMISSION" ] || fail "account state must not redirect through symbolic links"
command -v curl >/dev/null 2>&1 || fail "curl is unavailable"
command -v node >/dev/null 2>&1 || fail "node is unavailable"
# Check every ancestor and every capability path, including dangling links.
# Leaf checks alone allow a replaced parent to redirect account writes.
node - "$STATE_DIR" "$RUNTIME_DIR" <<'NODE'
const fs=require('fs'),path=require('path');
const [state,runtime]=process.argv.slice(2);
for(const target of [state,runtime,path.join(state,'.api_key'),path.join(state,'.connect'),
  path.join(state,'permissions','people-context'),path.join(runtime,'.connector_complete'),
  path.join(runtime,'.payload_verified_sha'),path.join(runtime,'.factory_version')]) {
  for(let cursor=path.resolve(target);;cursor=path.dirname(cursor)) {
    try { if(fs.lstatSync(cursor).isSymbolicLink()) throw Error('Linked account path refused: '+cursor); }
    catch(error) { if(error.code!=='ENOENT') throw error; }
    if(path.dirname(cursor)===cursor) break;
  }
}
NODE

IFS= read -r connection_code || fail "no connection code was provided"
[[ "$connection_code" =~ ^alex_connect_[a-f0-9]{48}$ ]] || fail "the connection code is malformed"

client_version=$(cat "$RUNTIME_DIR/.payload_verified_sha" 2>/dev/null || cat "$RUNTIME_DIR/.factory_version" 2>/dev/null || true)
[[ "$client_version" =~ ^[A-Za-z0-9._-]{1,128}$ ]] || fail "the installed client version is unavailable"

work_dir=$(mktemp -d "$STATE_DIR/.account-connect.XXXXXX") || fail "could not create a private temporary directory"
trap 'rm -rf "$work_dir"' EXIT
exchange_body="$work_dir/exchange.json"
exchange_response="$work_dir/exchange-response.json"
exchange_headers="$work_dir/exchange-headers"
new_key="$work_dir/api-key"

current_key=""
if [ -s "$KEY_FILE" ]; then
  current_key=$(tr -d '[:space:]' < "$KEY_FILE")
  [[ "$current_key" =~ ^alex_[a-f0-9]{32}$ ]] || fail "the existing account key is malformed; it was not replaced"
fi

printf '%s' "$connection_code" | node -e '
  const fs=require("fs");
  fs.writeFileSync(process.argv[1], JSON.stringify({code:fs.readFileSync(0,"utf8")}), {mode:0o600});
' "$exchange_body"
unset connection_code

printf '%s\n' 'Content-Type: application/json' "X-Alexandria-Client: $client_version" > "$exchange_headers"
if [ -n "$current_key" ]; then
  printf 'Authorization: Bearer %s\n' "$current_key" >> "$exchange_headers"
fi
unset current_key
exchange_http=$(curl -sS --max-time 20 --max-filesize 4096 -o "$exchange_response" -w '%{http_code}' \
  -X POST \
  --header "@$exchange_headers" \
  --data-binary "@$exchange_body" \
  "$SERVER/account/connect/exchange" || true)
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

if [ "$MODE" = --website ]; then
  echo "your website tools are connected to your Alexandria account."
  echo "your existing website and private files are unchanged."
  echo "register only the public mirror address you choose to share."
  exit 0
fi
echo "your loop is connected to your Alexandria account."
echo "your private files stay on this computer; only public files you approve can be sent."
echo "when a person matters, your ai can now use only what that person allowed you to read in the Library."
