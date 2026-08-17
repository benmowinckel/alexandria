#!/usr/bin/env bash
# Metadata-only install classification regressions.
set -euo pipefail

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
CLASSIFY="$ROOT/factory/scripts/classify_install.sh"
WORKDIR=$(mktemp -d "${TMPDIR:-/tmp}/alexandria-classify.XXXXXX")
trap 'rm -rf "$WORKDIR"' EXIT

fail() {
  echo "classify test failed: $1" >&2
  exit 1
}

classify() {
  local home="$1"
  HOME="$home" ALEXANDRIA_DIR="$home/alexandria" \
    ALEXANDRIA_RUNTIME_DIR="$home/.local/share/alexandria" \
    bash "$CLASSIFY"
}

field() {
  awk -F': ' -v k="$1" '$1==k {print $2; exit}'
}

empty="$WORKDIR/empty"
mkdir -p "$empty"
out=$(classify "$empty")
[ "$(printf '%s\n' "$out" | field class)" = "absent" ] \
  || fail "empty home was not absent"

dotfiles="$WORKDIR/dotfiles"
mkdir -p "$dotfiles/alexandria/files" "$dotfiles/.local/share/alexandria"
printf '%s\n' '' > "$dotfiles/alexandria/.DS_Store"
out=$(classify "$dotfiles")
[ "$(printf '%s\n' "$out" | field class)" = "absent" ] \
  || fail "dotfile-only reserved paths were not absent"

foreign="$WORKDIR/foreign"
mkdir -p "$foreign/alexandria/files/constitution" "$foreign/.local/share/alexandria"
printf '%s\n' 'not alexandria' > "$foreign/alexandria/notes.md"
printf '%s\n' 'random' > "$foreign/.local/share/alexandria/keep.txt"
out=$(classify "$foreign")
[ "$(printf '%s\n' "$out" | field class)" = "foreign" ] \
  || fail "unreceipted content was not foreign"

partial="$WORKDIR/partial"
mkdir -p "$partial/alexandria/system" "$partial/.local/share/alexandria/hooks"
printf '%s\n' 'partial block' > "$partial/alexandria/system/.block"
out=$(classify "$partial")
[ "$(printf '%s\n' "$out" | field class)" = "partial" ] \
  || fail "block without hashes was not partial"

healthy="$WORKDIR/healthy"
mkdir -p \
  "$healthy/alexandria/system/permissions" \
  "$healthy/alexandria/system/hooks" \
  "$healthy/alexandria/files/vault" \
  "$healthy/alexandria/files/constitution" \
  "$healthy/.local/share/alexandria/hooks" \
  "$healthy/.local/share/alexandria/scripts"
printf '%s\n' 'shim' > "$healthy/.local/share/alexandria/hooks/shim.sh"
printf '%s\n' 'verify' > "$healthy/.local/share/alexandria/scripts/verify-fetch.sh"
printf '%s\n' 'payload' > "$healthy/.local/share/alexandria/.hooks_payload"
{
  printf '%s  factory/hooks/shim.sh\n' "$(shasum -a 256 "$healthy/.local/share/alexandria/hooks/shim.sh" | awk '{print $1}')"
  printf '%s  factory/scripts/verify-fetch.sh\n' "$(shasum -a 256 "$healthy/.local/share/alexandria/scripts/verify-fetch.sh" | awk '{print $1}')"
  printf '%s  factory/hooks/payload.sh\n' "$(shasum -a 256 "$healthy/.local/share/alexandria/.hooks_payload" | awk '{print $1}')"
} > "$healthy/.local/share/alexandria/.canon_manifest"
touch "$healthy/.local/share/alexandria/.setup_complete"
touch "$healthy/alexandria/system/.block_complete"
touch "$healthy/alexandria/system/.api_key"
touch "$healthy/alexandria/system/permissions/library"
touch "$healthy/alexandria/system/hooks/auto-update"
cat > "$healthy/alexandria/system/.setup_report" <<'REPORT'
subsystems:
  files: ok
  canon: ok
  methods: ok
  hooks: ok
  core: ok
  passive_session: ok
  visible_cue: ok
  loop: ok
REPORT
mkdir -p "$healthy/alexandria/.git"
git -C "$healthy/alexandria" init -q
git -C "$healthy/alexandria" remote add origin git@example.invalid:author/alexandria-private.git
# Personal content must not be required or read.
printf '%s\n' 'SECRET CONSTITUTION' > "$healthy/alexandria/files/constitution/Core.md"
out=$(classify "$healthy")
[ "$(printf '%s\n' "$out" | field class)" = "healthy" ] \
  || fail "receipted healthy install was not healthy: $out"
[ "$(printf '%s\n' "$out" | field optional.account)" = "on" ] \
  || fail "account marker was not disclosed"
[ "$(printf '%s\n' "$out" | field optional.library)" = "on" ] \
  || fail "library marker was not disclosed"
[ "$(printf '%s\n' "$out" | field optional.update_checks)" = "on" ] \
  || fail "update-check marker was not disclosed"
[ "$(printf '%s\n' "$out" | field optional.marketplace)" = "off" ] \
  || fail "absent marketplace marker was not left off"
[ "$(printf '%s\n' "$out" | field optional.private_remote)" = "present" ] \
  || fail "private remote was not disclosed"
! printf '%s\n' "$out" | grep -q 'SECRET CONSTITUTION' \
  || fail "classifier read personal constitution content"

echo "classify_install tests passed"
