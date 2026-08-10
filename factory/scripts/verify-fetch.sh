#!/usr/bin/env bash
# Alexandria verify-fetch — the reusable primitive behind every "curl a factory
# script from GitHub, then run it" flow. Fetches a factory file, verifies it
# against the Touch ID-signed manifest (ssh-keygen -Y verify + sha match), and
# emits it to stdout ONLY if authentic — so an attacker who swaps a script on
# GitHub or MITMs the fetch cannot get it executed. Mirrors shim.sh /
# scheduled-bootstrap exactly, fail-closed at every step.
#
# Installed by setup.sh from the exact commit independently verified on first
# install. It is also covered by every later signed factory manifest, so the
# trust root is continuous rather than re-established from the network.
#
#   Usage:   bash verify-fetch.sh <factory-relative-path>     # e.g. scripts/brief.py
#   Success: prints the verified file to stdout, exit 0. Use --run for shell
#            files so a verification failure propagates without a pipeline.
#   Failure: prints "verify-fetch failed (<reason>)" to stderr, exit 1, emits nothing.
#
#   Run:     bash verify-fetch.sh --run <signed-shell-file> [arguments]
#            verifies the script, then runs those exact temporary bytes.
set -euo pipefail

MODE="emit"
if [ "${1:-}" = "--run" ]; then
  MODE="run"
  shift
fi
REL="${1:?usage: verify-fetch.sh [--run] <factory-relative-path>}"
shift
[ "$MODE" != "run" ] || [[ "$REL" = *.sh ]] || {
  echo "verify-fetch failed (--run requires a signed .sh file)" >&2
  exit 1
}
ALEX_DIR="$HOME/alexandria"
RUNTIME_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." 2>/dev/null && pwd)"
RAW="${ALEX_GITHUB_RAW:-https://raw.githubusercontent.com/benmowinckel/alexandria/main}"
SIGNERS="$RUNTIME_DIR/allowed_signers"
NS="alexandria"; ID="alexandria-payload-signing"
fail(){ echo "verify-fetch failed ($1) for $REL — refusing to emit" >&2; exit 1; }

command -v ssh-keygen >/dev/null 2>&1 || fail no-ssh-keygen
[ -f "$SIGNERS" ] || fail no-allowed-signers

f=$(mktemp) || fail mktemp; mf=$(mktemp) || fail mktemp; sg=$(mktemp) || fail mktemp
manifest_cache="$RUNTIME_DIR/.canon_manifest.tmp.$$"
version_cache="$RUNTIME_DIR/.factory_version.tmp.$$"
trap 'rm -f "$f" "$mf" "$sg" "$manifest_cache" "$version_cache"' EXIT

curl -sf --max-time 10 "$RAW/factory/$REL"             -o "$f"  || fail fetch
curl -sf --max-time 10 "$RAW/factory/manifest.txt"     -o "$mf" || fail manifest-fetch
curl -sf --max-time 10 "$RAW/factory/manifest.txt.sig" -o "$sg" || fail sig-fetch
[ -s "$f" ] && [ -s "$mf" ] && [ -s "$sg" ] || fail empty-fetch

# 1. Manifest is authentically signed by the Touch ID key.
ssh-keygen -Y verify -f "$SIGNERS" -I "$ID" -n "$NS" -s "$sg" < "$mf" >/dev/null 2>&1 || fail bad-signature

# 2. The signed release must not roll back below any version this machine has
# already accepted. Reverts therefore ship as new forward-signed releases.
version=$(awk '$1=="#" && $2=="alexandria-factory-version" {print $3; exit}' "$mf")
[[ "$version" =~ ^[0-9]+$ ]] || fail missing-version
installed=$(cat "$RUNTIME_DIR/.factory_version" 2>/dev/null || true)
if [ -n "$installed" ]; then
  [[ "$installed" =~ ^[0-9]+$ ]] || fail bad-local-version
  [ "$version" -ge "$installed" ] || fail signed-rollback
fi

# 3. The fetched file matches its hash in the verified manifest.
want=$(awk -v p="factory/$REL" '$2==p{print $1}' "$mf")
[ -n "$want" ] || fail not-in-manifest
if command -v shasum >/dev/null 2>&1; then got=$(shasum -a 256 "$f" | cut -d' ' -f1)
elif command -v sha256sum >/dev/null 2>&1; then got=$(sha256sum "$f" | cut -d' ' -f1)
else fail no-sha-tool; fi
[ "$want" = "$got" ] || fail hash-mismatch

# Pin the highest authenticated release before emitting or executing anything,
# except setup itself. Setup first needs the still-installed manifest to prove
# ownership of the existing runtime; it then independently verifies and pins
# this new manifest before replacing any protected byte.
if [ "$MODE:$REL" != "run:setup.sh" ]; then
  cp "$mf" "$manifest_cache" || fail pin-manifest
  printf '%s\n' "$version" > "$version_cache" || fail pin-version
  mv "$manifest_cache" "$RUNTIME_DIR/.canon_manifest" || fail pin-manifest
  mv "$version_cache" "$RUNTIME_DIR/.factory_version" || fail pin-version
fi

# Authentic. The update path runs the verified temporary file directly and
# marks that fact for setup.sh; the ordinary path emits bytes for callers that
# need to inspect or route a signed factory artifact themselves.
if [ "$MODE" = "run" ]; then
  if [ "$REL" = "setup.sh" ]; then
    ALEXANDRIA_VERIFIED_UPDATE=1 bash "$f" "$@"
  else
    bash "$f" "$@"
  fi
else
  cat "$f"
fi
