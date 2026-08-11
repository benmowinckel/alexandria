#!/usr/bin/env bash
# Inspect and register exact marketplace-module bytes without activating them.
#
#   install.sh inspect <github:user/repo#path>
#   install.sh register <github:user/repo#path> <sha256>
#
# `inspect` fetches untrusted bytes into a content-addressed local store and
# prints their path for the Author's AI to review. `register` adds only that
# reviewed hash to .call_manifest. Reporting still needs a separate approval of
# the exact manifest hash; neither command executes or activates module content.
set -euo pipefail

cmd="${1:-}"
if [[ "$cmd" == github:* ]]; then
  # Backward-compatible invocation now performs the safe first phase only.
  set -- inspect "$@"
  cmd=inspect
fi
mod="${2:-}"
approved_sha="${3:-}"
alex_dir="${ALEXANDRIA_DIR:-$HOME/alexandria}"
manifest="$alex_dir/.call_manifest"
store="${ALEXANDRIA_MODULE_STORE:-$alex_dir/modules/sources}"

usage() {
  echo "usage: install.sh inspect <github:user/repo#path>" >&2
  echo "       install.sh register <github:user/repo#path> <sha256>" >&2
  exit 1
}

case "$cmd" in inspect|register) ;; *) usage ;; esac
if [[ ! "$mod" =~ ^github:([A-Za-z0-9-]+)/([A-Za-z0-9._-]+)#([A-Za-z0-9._/-]+)$ ]] \
  || [[ "${BASH_REMATCH[3]}" == *".."* ]]; then
  echo "install: invalid module ID '$mod'" >&2
  echo "install: only public GitHub module IDs are installable" >&2
  exit 1
fi
user="${BASH_REMATCH[1]}"
repo="${BASH_REMATCH[2]}"
path="${BASH_REMATCH[3]}"

sha256_file() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    echo "install: SHA-256 tool required (shasum or sha256sum)" >&2
    exit 1
  fi
}

inspect_module() {
  mkdir -p "$store"
  tmp=$(mktemp "${TMPDIR:-/tmp}/alexandria-module.XXXXXX")
  trap 'rm -f "$tmp"' EXIT
  reached=0
  branch=''
  for candidate in main master; do
    if curl --fail --silent --show-error --location --max-time 20 \
      "https://raw.githubusercontent.com/$user/$repo/$candidate/$path.md" -o "$tmp"; then
      reached=1
      branch="$candidate"
      break
    fi
  done
  if [[ $reached -eq 0 || ! -s "$tmp" ]]; then
    echo "install: $user/$repo#$path is not a readable markdown file on GitHub" >&2
    exit 1
  fi
  sha=$(sha256_file "$tmp")
  destination="$store/$sha.md"
  if [[ ! -f "$destination" ]]; then
    mv "$tmp" "$destination"
  elif [[ "$(sha256_file "$destination")" != "$sha" ]]; then
    echo "install: local content-addressed store failed integrity check" >&2
    exit 1
  fi
  trap - EXIT
  echo "install: inspected $mod"
  echo "install: branch $branch"
  echo "install: sha256 $sha"
  echo "install: bytes $destination"
  echo "install: not registered, activated, executed, or reported"
}

register_module() {
  if [[ ! "$approved_sha" =~ ^[a-f0-9]{64}$ ]]; then
    echo "install: register requires the exact lowercase SHA-256 shown by inspect" >&2
    exit 1
  fi
  source_file="$store/$approved_sha.md"
  if [[ ! -f "$source_file" || "$(sha256_file "$source_file")" != "$approved_sha" ]]; then
    echo "install: reviewed bytes for $approved_sha are missing or changed; inspect again" >&2
    exit 1
  fi
  if ! command -v jq >/dev/null 2>&1; then
    echo "install: jq required to update the local manifest" >&2
    exit 1
  fi
  mkdir -p "$(dirname "$manifest")"
  if [[ ! -f "$manifest" ]]; then
    printf '%s\n' '{"modules":[]}' > "$manifest"
  fi
  if ! jq -e '.modules | type == "array"' "$manifest" >/dev/null 2>&1; then
    echo "install: $manifest is not a valid module manifest; refusing to replace it" >&2
    exit 1
  fi
  existing_sha=$(jq -r --arg id "$mod" '.modules[]? | select(.id == $id) | .source_sha256 // ""' "$manifest" | head -1)
  if [[ "$existing_sha" == "$approved_sha" ]]; then
    echo "install: $mod already registered at sha256 $approved_sha"
    exit 0
  fi
  tmp=$(mktemp "${manifest}.XXXXXX")
  jq --arg id "$mod" --arg sha "$approved_sha" '
    .modules = ([.modules[] | select(.id != $id)] + [{id: $id, source_sha256: $sha, text: ""}])
  ' "$manifest" > "$tmp"
  mv "$tmp" "$manifest"
  echo "install: registered $mod at sha256 $approved_sha"
  echo "install: no module was activated or executed"
  echo "install: reporting remains off until the Author approves the exact current manifest hash"
}

case "$cmd" in
  inspect) inspect_module ;;
  register) register_module ;;
esac
