#!/usr/bin/env bash
# Install a marketplace module — idempotent append to ~/alexandria/.call_manifest.
# This changes only the local manifest. Reporting it requires a separate
# permission whose stored SHA-256 matches the exact changed manifest.
#
# Usage: bash install.sh <module-id>
#   github:<user>/<repo>#<path>     — validates path resolves on GitHub
#   local:<github-login>/<slug>     — provisional, no reachability check
set -euo pipefail

MOD="${1:-}"
MANIFEST="$HOME/alexandria/.call_manifest"

if ! command -v jq >/dev/null 2>&1; then
  echo "install: jq required (https://jqlang.org)" >&2
  exit 1
fi

if [[ ! "$MOD" =~ ^github:[^/]+/[^#]+#.+$ ]] && [[ ! "$MOD" =~ ^local:[^/]+/.+$ ]]; then
  echo "install: invalid module ID '$MOD'" >&2
  echo "  expected: github:<user>/<repo>#<path>  OR  local:<github-login>/<slug>" >&2
  exit 1
fi

# Reachability check — github: only. Local IDs are pre-publish placeholders.
# Try main first, fall back to master.
if [[ "$MOD" =~ ^github:([^/]+)/([^#]+)#(.+)$ ]]; then
  user="${BASH_REMATCH[1]}"; repo="${BASH_REMATCH[2]}"; path="${BASH_REMATCH[3]}"
  reached=0
  for branch in main master; do
    if curl -sfI -o /dev/null "https://raw.githubusercontent.com/$user/$repo/$branch/$path.md"; then
      reached=1; break
    fi
  done
  if [[ $reached -eq 0 ]]; then
    echo "install: $user/$repo#$path unreachable on github (tried main, master)" >&2
    exit 1
  fi
fi

mkdir -p "$(dirname "$MANIFEST")"
[[ -f "$MANIFEST" ]] || echo '{"modules":[]}' > "$MANIFEST"

if jq -e --arg id "$MOD" '.modules | any(.id == $id)' "$MANIFEST" >/dev/null; then
  echo "install: $MOD already in manifest"
  exit 0
fi
tmp=$(mktemp)
jq --arg id "$MOD" '.modules += [{id: $id, text: ""}]' "$MANIFEST" > "$tmp" && mv "$tmp" "$MANIFEST"
echo "install: added $MOD"
echo "install: local manifest changed; marketplace reporting remains off until this exact manifest is separately approved"
