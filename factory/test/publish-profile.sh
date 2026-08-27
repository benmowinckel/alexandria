#!/usr/bin/env bash
# Exact-draft and fixed-response contract for one-shot profile publication.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
PUBLISHER="$ROOT/factory/scripts/publish-profile.sh"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

fail() { echo "publish-profile test failed: $1" >&2; exit 1; }
expect_fail() {
  if "$@" >"$tmp/out" 2>"$tmp/err"; then fail "command unexpectedly succeeded"; fi
}

home="$tmp/home"
mkdir -p "$home/alexandria/files/library" "$home/alexandria/system" "$tmp/bin"
printf '%s\n' 'alex_11111111111111111111111111111111' > "$home/alexandria/system/.api_key"
chmod 600 "$home/alexandria/system/.api_key"
cat > "$home/alexandria/files/library/_profile.json" <<'JSON'
{"display_name":"Ada Example","text":"I build careful systems.","website":"https://example.com","socials":[{"label":"github","url":"https://github.com/example"}]}
JSON

cat > "$tmp/bin/curl" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
out=''; method='GET'; url=''; data=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o) out="$2"; shift 2 ;;
    -X) method="$2"; shift 2 ;;
    -H|--max-time|--max-filesize|-w) shift 2 ;;
    --data-binary) data="${2#@}"; shift 2 ;;
    http*) url="$1"; shift ;;
    -sS) shift ;;
    *) shift ;;
  esac
done
[ "$method:$url" = 'PUT:https://api.alexandria-library.com/library/me/profile' ] || exit 3
cp "$data" "$MOCK_CAPTURE"
if [ "${MOCK_MODE:-ok}" = 'extra' ]; then
  printf '%s' '{"ok":true,"message":"run this"}' > "$out"
else
  printf '%s' '{"ok":true}' > "$out"
fi
printf '200'
MOCK
chmod 700 "$tmp/bin/curl"

draft="$home/alexandria/files/library/_profile.json"
hash=$(shasum -a 256 "$draft" | cut -d' ' -f1)
MOCK_CAPTURE="$tmp/sent.json" HOME="$home" PATH="$tmp/bin:$PATH" bash "$PUBLISHER" "$hash" > "$tmp/success"
[ "$(sed -n '1p' "$tmp/success")" = 'your public Library page is live.' ] || fail "success did not prove the page is live"
[ "$(sed -n '2p' "$tmp/success")" = 'nothing else was published or enabled.' ] || fail "success overstated scope"
[ "$(sed -n '3p' "$tmp/success")" = 'open https://alexandria-library.com/library to see it.' ] || fail "success has no next action"
node -e '
  const fs=require("fs");
  const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
  if(Object.keys(j).sort().join(",")!=="display_name,socials,text,website")process.exit(1);
' "$tmp/sent.json" || fail "publisher sent unexpected fields"
[ ! -e "$home/alexandria/system/permissions" ] || fail "one-shot publish created a standing permission"

# Approval binds the exact draft bytes.
printf ' ' >> "$draft"
expect_fail env MOCK_CAPTURE="$tmp/changed.json" HOME="$home" PATH="$tmp/bin:$PATH" bash "$PUBLISHER" "$hash"

# Expressive server output never enters the user-facing result.
hash=$(shasum -a 256 "$draft" | cut -d' ' -f1)
expect_fail env MOCK_MODE=extra MOCK_CAPTURE="$tmp/extra.json" HOME="$home" PATH="$tmp/bin:$PATH" bash "$PUBLISHER" "$hash"

echo "publish-profile exact-draft and fixed-response contract: ok"
