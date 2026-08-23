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
bundle=""
manifest_cache="$RUNTIME_DIR/.canon_manifest.tmp.$$"
signature_cache="$RUNTIME_DIR/.canon_manifest.sig.tmp.$$"
version_cache="$RUNTIME_DIR/.factory_version.tmp.$$"
cleanup(){
  rm -f "$f" "$mf" "$sg" "$manifest_cache" "$signature_cache" "$version_cache"
  if [ -n "$bundle" ]; then
    rm -f "$bundle/setup.sh" "$bundle/scripts/classify_install.sh"
    rmdir "$bundle/scripts" "$bundle" 2>/dev/null || true
  fi
}
trap cleanup EXIT

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

# setup.sh has one signed sibling dependency used before setup can fetch the
# rest of the factory. Build the verified two-file bundle before execution so
# the normal update command remains complete as setup evolves.
if [ "$MODE:$REL" = "run:setup.sh" ]; then
  bundle=$(mktemp -d) || fail bundle-mktemp
  mkdir "$bundle/scripts" || fail bundle-mkdir
  mv "$f" "$bundle/setup.sh" || fail bundle-setup
  f="$bundle/setup.sh"
  classifier="$bundle/scripts/classify_install.sh"
  curl -sf --max-time 10 "$RAW/factory/scripts/classify_install.sh" -o "$classifier" || fail classifier-fetch
  [ -s "$classifier" ] || fail classifier-empty
  classifier_want=$(awk '$2=="factory/scripts/classify_install.sh"{print $1}' "$mf")
  [ -n "$classifier_want" ] || fail classifier-not-in-manifest
  if command -v shasum >/dev/null 2>&1; then classifier_got=$(shasum -a 256 "$classifier" | cut -d' ' -f1)
  elif command -v sha256sum >/dev/null 2>&1; then classifier_got=$(sha256sum "$classifier" | cut -d' ' -f1)
  else fail no-sha-tool; fi
  [ "$classifier_want" = "$classifier_got" ] || fail classifier-hash-mismatch
fi

# Pin the highest authenticated release before emitting or executing anything.
# Keep its signature beside it: setup can then prove ownership across an
# interrupted refresh where one protected core file is old and the other new.
cp "$mf" "$manifest_cache" || fail pin-manifest
cp "$sg" "$signature_cache" || fail pin-signature
printf '%s\n' "$version" > "$version_cache" || fail pin-version
mv "$manifest_cache" "$RUNTIME_DIR/.canon_manifest" || fail pin-manifest
mv "$signature_cache" "$RUNTIME_DIR/.canon_manifest.sig" || fail pin-signature
mv "$version_cache" "$RUNTIME_DIR/.factory_version" || fail pin-version

# Authentic. The update path runs the verified temporary file directly and
# marks that fact for setup.sh; the ordinary path emits bytes for callers that
# need to inspect or route a signed factory artifact themselves.
if [ "$MODE" = "run" ]; then
  if [ "$REL" = "setup.sh" ]; then
    verified_source_ref=main
    raw_tail="${RAW%/}"; raw_tail="${raw_tail##*/}"
    if [[ "$raw_tail" =~ ^[0-9a-f]{40}$ ]]; then
      verified_source_ref="$raw_tail"
    fi
    ALEXANDRIA_VERIFIED_UPDATE=1 \
      ALEXANDRIA_VERIFIED_SOURCE_REF="$verified_source_ref" \
      bash "$f" "$@"
  else
    bash "$f" "$@"
  fi
else
  cat "$f"
fi
