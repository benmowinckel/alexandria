#!/usr/bin/env bash
# Meta-loop: every literal $SERVER path referenced anywhere in the system
# (factory clients + smoke.yml itself) must resolve to a live route.
# Catches:
#   - server refactor that kills a route a live client still calls
#   - smoke step that probes an endpoint we deliberately removed
# Source of truth = the files themselves. No hand list.
#
# Inputs (mixed by design — production reality + checked-out config):
#   - factory/hooks/payload.sh + factory/skills/scheduled.md (live, fetched raw)
#   - .github/workflows/smoke.yml (this very file, from disk)
#
# Lives outside the YAML so we can use grep '${{' directly without GH Actions
# parsing it as an expression.
set -euo pipefail

: "${SERVER:=https://api.alexandria-library.com}"
: "${FACTORY:=https://raw.githubusercontent.com/mowinckelb/alexandria/main/factory}"

PAYLOAD=$(curl -sf "$FACTORY/hooks/payload.sh")
SCHED=$(curl -sf "$FACTORY/skills/scheduled.md")
# Strip GH Actions template lines so partial paths (/library/<secret>/...)
# don't pollute the probe set. Templated probes get their own assertions
# inside their step; the meta-loop only catches literal probes.
SMOKE=$(grep -vF '${{' .github/workflows/smoke.yml || true)
SCAN=$(printf '%s\n%s\n%s\n' "$PAYLOAD" "$SCHED" "$SMOKE")

# Each grep is a separate command so pipefail catches a regex-broken regex,
# not "no matches found in this set" (legitimate after a rename — e.g. all
# legacy mowinckel.ai refs replaced by alexandria-library.com in canon files).
# `|| true` swallows the no-match exit-1 from grep but keeps the broken-regex
# case visible via the empty-PATHS check below.
P1=$(printf '%s' "$SCAN" | grep -oE '\$SERVER/[a-zA-Z][a-zA-Z0-9/_-]*' | sed 's|^\$SERVER||' || true)
P2=$(printf '%s' "$SCAN" | grep -oE 'https://(api\.alexandria-library\.com|(api|mcp)\.mowinckel\.ai)/[a-zA-Z][a-zA-Z0-9/_-]*' | sed -E 's|^https://[^/]+||' || true)
PATHS=$(printf '%s\n%s\n' "$P1" "$P2" | sort -u | grep -v '^$' || true)

[ -z "$PATHS" ] && { echo "::error::No paths extracted — regex broke?"; exit 1; }

fail=0
for path in $PATHS; do
  # Probe all four methods — Hono returns 404 on method mismatch, so a
  # single-method check lies for routes like PUT /file/:name or POST /call.
  # Route is alive iff at least one method returns non-404.
  # (Limitation: a route protected by a middleware that 404s on missing
  # resource — e.g. validateAuthor for /library/:author with a bad id —
  # will look dead. None of the current literal probes hit that case.)
  g=$(curl -s -o /dev/null -w '%{http_code}' -X GET "$SERVER$path")
  p=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$SERVER$path" -H 'Content-Type: application/json' -d '{}')
  u=$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$SERVER$path" -H 'Content-Type: application/json' -d '{}')
  d=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$SERVER$path")
  if [ "$g" = "404" ] && [ "$p" = "404" ] && [ "$u" = "404" ] && [ "$d" = "404" ]; then
    echo "::error::Reference to $path → 404 on all methods (route killed but a client/test still depends on it)"
    fail=1
  else
    echo "  $path → GET:$g POST:$p PUT:$u DELETE:$d"
  fi
done
[ $fail -eq 1 ] && exit 1
echo "✓ all referenced server paths resolve"
