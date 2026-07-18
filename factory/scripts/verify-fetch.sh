#!/usr/bin/env bash
# Alexandria verify-fetch — the reusable primitive behind every "curl a factory
# script from GitHub, then run it" flow. Fetches a factory file, verifies it
# against the offline-signed manifest (ssh-keygen -Y verify + sha match), and
# emits it to stdout ONLY if authentic — so an attacker who swaps a script on
# GitHub or MITMs the fetch cannot get it executed. Mirrors shim.sh /
# scheduled-bootstrap exactly, fail-closed at every step.
#
# Installed by setup.sh to ~/alexandria/system/scripts/verify-fetch.sh (trust
# root, same class as shim.sh — not itself a fetched payload, so it can't
# bootstrap-verify itself; its trust is the install-time TOFU, same residual
# as setup.sh, audit H5). Consumers (install/publish/brief-setup skills,
# migrate.sh) lazy-fetch it unverified only if that install is absent — a
# fallback for pre-2026-07 installs, same TOFU class, not the designed path.
#
#   Usage:   bash verify-fetch.sh <factory-relative-path>     # e.g. scripts/brief.py
#   Success: prints the verified file to stdout, exit 0.  →  verify-fetch.sh scripts/x.sh | bash
#   Failure: prints "verify-fetch failed (<reason>)" to stderr, exit 1, emits nothing.
set -euo pipefail

REL="${1:?usage: verify-fetch.sh <factory-relative-path>}"
ALEX_DIR="$HOME/alexandria"
RAW="${ALEX_GITHUB_RAW:-https://raw.githubusercontent.com/benmowinckel/alexandria/main}"
SIGNERS="$ALEX_DIR/system/allowed_signers"
NS="alexandria"; ID="alexandria-payload-signing"
fail(){ echo "verify-fetch failed ($1) for $REL — refusing to emit" >&2; exit 1; }

command -v ssh-keygen >/dev/null 2>&1 || fail no-ssh-keygen
[ -f "$SIGNERS" ] || fail no-allowed-signers

f=$(mktemp) || fail mktemp; mf=$(mktemp) || fail mktemp; sg=$(mktemp) || fail mktemp
trap 'rm -f "$f" "$mf" "$sg"' EXIT

curl -sf --max-time 10 "$RAW/factory/$REL"             -o "$f"  || fail fetch
curl -sf --max-time 10 "$RAW/factory/manifest.txt"     -o "$mf" || fail manifest-fetch
curl -sf --max-time 10 "$RAW/factory/manifest.txt.sig" -o "$sg" || fail sig-fetch
[ -s "$f" ] && [ -s "$mf" ] && [ -s "$sg" ] || fail empty-fetch

# 1. Manifest is authentically signed by the offline key.
ssh-keygen -Y verify -f "$SIGNERS" -I "$ID" -n "$NS" -s "$sg" < "$mf" >/dev/null 2>&1 || fail bad-signature

# 2. The fetched file matches its hash in the verified manifest.
want=$(awk -v p="factory/$REL" '$2==p{print $1}' "$mf")
[ -n "$want" ] || fail not-in-manifest
if command -v shasum >/dev/null 2>&1; then got=$(shasum -a 256 "$f" | cut -d' ' -f1)
elif command -v sha256sum >/dev/null 2>&1; then got=$(sha256sum "$f" | cut -d' ' -f1)
else fail no-sha-tool; fi
[ "$want" = "$got" ] || fail hash-mismatch

# Authentic — emit for execution.
cat "$f"
