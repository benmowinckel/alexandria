#!/usr/bin/env bash
# Sign + commit + submit factory changes to the Touch ID release gate.
# Run from repo root: bash factory/ship.sh
#
# Builds factory/manifest.txt (sha256 of payload + every canon file),
# signs it with the Mac's Touch ID-bound Secure Enclave key, commits, then uses
# the same Touch ID-gated release path as every other public change.
# Replaces `git push` for any change in factory/hooks/payload.sh or factory/canon/*.md.
#
# Trust root: a non-exportable P-256 key in this Mac's Secure Enclave. Its
# opaque reference lives at ~/.alexandria-signing/secure-enclave.keyref; the
# private key never leaves Apple hardware. Every signature requires a fresh
# Touch ID match. ssh-agent and passphrase caches are not involved.

set -euo pipefail

echo "reminder: install-surface change? run the red-team pass first (factory/redteam.md)"

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

# A commit includes everything already staged, even when this script later
# stages explicit paths. Refuse an ambiguous release before asking for Touch ID.
if ! git diff --cached --quiet; then
  echo "error: the git index already contains staged changes — unstage them, then re-run" >&2
  exit 1
fi

SIGNER_SOURCE="$REPO_ROOT/factory/signing/alexandria-sign.swift"
SIGNER_BIN="${ALEX_SIGNER_BIN:-$HOME/.alexandria-signing/bin/alexandria-sign}"
KEY_REFERENCE="${ALEX_SIGNING_KEY_REFERENCE:-$HOME/.alexandria-signing/secure-enclave.keyref}"
PUBLIC_KEY="${ALEX_SIGNING_PUBLIC_KEY:-$HOME/.alexandria-signing/secure-enclave.pub}"

if [ "$(uname -s)" != "Darwin" ]; then
  echo "error: releases can only be signed on the founder's Mac" >&2
  exit 1
fi
command -v swiftc >/dev/null 2>&1 || { echo "error: Apple Swift compiler not found" >&2; exit 1; }
[ -f "$SIGNER_SOURCE" ] || { echo "error: signer source missing at $SIGNER_SOURCE" >&2; exit 1; }
[ -f "$KEY_REFERENCE" ] || { echo "error: Secure Enclave key reference missing at $KEY_REFERENCE" >&2; exit 1; }
[ -f "$PUBLIC_KEY" ] || { echo "error: signing public key missing at $PUBLIC_KEY" >&2; exit 1; }

# Compile the tiny Apple-only signer locally. It emits standard SSHSIG files,
# so Authors keep using the built-in ssh-keygen verifier on every platform.
if [ ! -x "$SIGNER_BIN" ] || [ "$SIGNER_SOURCE" -nt "$SIGNER_BIN" ]; then
  mkdir -p "$(dirname "$SIGNER_BIN")"
  _signer_tmp="${SIGNER_BIN}.tmp.$$"
  trap 'rm -f "${_signer_tmp:-}"' EXIT
  swiftc -O "$SIGNER_SOURCE" -o "$_signer_tmp"
  chmod 700 "$_signer_tmp"
  mv "$_signer_tmp" "$SIGNER_BIN"
  trap - EXIT
fi

# The public key used locally must be byte-identical to the trust root a fresh
# install receives. Refuse a key rotation that would strand Authors by mistake.
_embedded_signer="$(awk '/^cat > .*allowed_signers/{f=1;next} f&&/^EOF$/{exit} f' factory/setup.sh)"
if [ "$_embedded_signer" != "$(cat "$PUBLIC_KEY")" ]; then
  echo "error: local Touch ID public key does not match factory/setup.sh" >&2
  exit 1
fi

# Files covered by the signature. Anything here must be byte-identical between
# what the signer signs and what the shim verifies.
SIGNED_FILES=(
  factory/hooks/payload.sh
  factory/canon/foundation.md
  factory/canon/axioms.md
  factory/canon/methodology.md
  factory/canon/editor.md
  factory/canon/mercury.md
  factory/canon/publisher.md
  factory/canon/library.md
  factory/canon/filter.md
  factory/canon/bookshelf.md
  factory/canon/plm.md
  factory/canon/twin.md
  factory/canon/marketplace.md
  factory/canon/MODULES.md
  factory/skills/scheduled.md
  factory/skills/machine.md
  factory/skills/factory.md
  factory/skills/claudecode.md
  factory/skills/codex.md
  factory/skills/codex-ambient.md
  factory/skills/droid.md
  factory/skills/cursor.mdc
  factory/skills/aclose.md
  factory/block.md
  factory/hooks/cursor/alexandria-session-start.py
  factory/hooks/cursor/alexandria-session-end.py
  factory/hooks/cursor/alexandria-stop.py
  factory/hooks/cursor/alexandria-transcript.py
  factory/scripts/brief.py
  factory/scripts/install.sh
  factory/scripts/publish.sh
  factory/scripts/capture_resolver.py
  factory/scripts/configure_codex.py
  factory/systems/capture-pipeline.md
  factory/systems/texting-presence.md
  factory/optional.md
  factory/scripts/imsg_daemon.py
  factory/scripts/imsg_run.sh
  factory/scripts/imsg_send.sh
  factory/scripts/imsg_handle.sh
  factory/scripts/agent_reply.sh
  factory/scripts/imsg_ctl.sh
  factory/scripts/capture_digest.py
  factory/scripts/digest_fragments.md
  factory/tools/show.sh
  factory/tools/remind.sh
  factory/tools/note.sh
  factory/tools/music.sh
  factory/tools/scene.sh
  factory/tools/README.md
  factory/migrate.sh
)

# Replies are dynamic — one file per answered feedback item — so they cannot sit
# in the static list above, but they MUST be signed: the client fetches them
# through verify-fetch.sh and an unsigned reply is simply never delivered.
for _r in factory/replies/*.md; do
  [ -e "$_r" ] && SIGNED_FILES+=("$_r")
done

# ── Coverage enforcement (permanent fix: no executable/steering file ships unsigned) ──
# Anything that EXECUTES or STEERS the model on a user machine — OR is fetched
# and "executed literally" by the founder's cloud routines (machine.md daily on
# the private vault, factory.md weekly) — must be signed, or an attacker who
# swaps it on GitHub/MITM gets code/instruction execution around the signature
# (the scheduled.md class). Hard-fail on the known must-sign set; warn loudly on
# any other executable so a newly-added one can't silently bypass.
MUST_SIGN=(
  factory/hooks/payload.sh factory/skills/scheduled.md
  factory/skills/machine.md factory/skills/factory.md
  factory/skills/claudecode.md factory/skills/codex.md factory/skills/codex-ambient.md factory/skills/droid.md
  factory/skills/cursor.mdc factory/skills/aclose.md factory/block.md
  factory/scripts/configure_codex.py
  factory/hooks/cursor/alexandria-session-start.py factory/hooks/cursor/alexandria-session-end.py
  factory/hooks/cursor/alexandria-stop.py factory/hooks/cursor/alexandria-transcript.py
  factory/scripts/brief.py factory/scripts/install.sh factory/scripts/publish.sh
  factory/scripts/capture_resolver.py factory/migrate.sh
  factory/scripts/imsg_daemon.py factory/scripts/imsg_run.sh factory/scripts/imsg_send.sh
  factory/scripts/imsg_handle.sh factory/scripts/agent_reply.sh factory/scripts/imsg_ctl.sh
  factory/scripts/capture_digest.py
  factory/tools/show.sh factory/tools/remind.sh factory/tools/note.sh factory/tools/music.sh factory/tools/scene.sh
)
for f in "${MUST_SIGN[@]}"; do
  printf '%s\n' "${SIGNED_FILES[@]}" | grep -qxF "$f" || {
    echo "error: $f executes on user machines but is NOT in SIGNED_FILES — refusing to ship" >&2
    exit 1
  }
done
# Immutable bootstraps + install-once roots: fetched ONCE at setup, then run from
# the local copy (never re-fetched), so their trust is the install-time TOFU
# (same class as shim.sh), not a per-run signature. Their residual risk is the
# setup.sh bootstrap anchor (audit H5), not per-run tampering.
#   - shim.sh / setup.sh / ship.sh        — the bootstrap/signer roots
#   - scripts/publish-fork.sh             — installed once, run hourly from local copy (setup.sh:405)
# (hooks/cursor/*.py moved to SIGNED_FILES 2026-07-30 — their "installed once"
# rationale was stale: setup.sh re-fetches them with overwrite=yes on every
# sync, same re-fetch class as the harness skills; setup.sh's manifest gate
# now verifies both against the signed manifest before installing.)
# NOTE: the warn below STILL fires (correctly) for the FETCHED-AND-RUN scripts
# (scripts/brief.py, install.sh, publish.sh, migrate.sh) — those are curl'd from
# GitHub then executed, so they genuinely need a verify gate (audit M5/M6). They
# are user-initiated + lower-frequency than the nightly scheduled.md (already
# gated), so the proper fix is a reusable verify-fetch helper, tracked separately.
UNSIGNED_OK=(
  factory/hooks/shim.sh factory/setup.sh factory/ship.sh
  factory/scripts/verify-fetch.sh
  factory/scripts/publish-fork.sh
)
while IFS= read -r f; do
  printf '%s\n' "${SIGNED_FILES[@]}" "${UNSIGNED_OK[@]}" | grep -qxF "$f" || \
    echo "⚠️  $f looks executable but is unsigned — add to SIGNED_FILES (or UNSIGNED_OK if it's an install-once root)" >&2
done < <(cd "$REPO_ROOT" && find factory -type f \( -name '*.sh' -o -name '*.py' \) | sort)

# Build manifest: one line per file, "sha256  relative/path".
# Stable order (literal list above) so the manifest is reproducible.
{
  for f in "${SIGNED_FILES[@]}"; do
    if [ ! -f "$f" ]; then
      echo "error: $f missing — manifest would be incomplete" >&2
      exit 1
    fi
    printf '%s  %s\n' "$(shasum -a 256 "$f" | cut -d' ' -f1)" "$f"
  done
} > factory/manifest.txt

# Sign the manifest. The Secure Enclave will ask for Touch ID for this exact
# manifest; namespace "alexandria" prevents reuse in another SSH context.
rm -f factory/manifest.txt.sig
"$SIGNER_BIN" sign "$KEY_REFERENCE" factory/manifest.txt factory/manifest.txt.sig

# Verify the exact bytes before anything is committed or pushed.
ssh-keygen -Y verify \
  -f "$PUBLIC_KEY" \
  -I alexandria-payload-signing \
  -n alexandria \
  -s factory/manifest.txt.sig < factory/manifest.txt >/dev/null

echo "Signed manifest:"
sed 's/^/  /' factory/manifest.txt
echo ""
echo "Public key fingerprint:"
ssh-keygen -lf "$PUBLIC_KEY" | sed 's/^/  /'
echo ""

if [ "${1:-}" = "--sign-only" ]; then
  echo "--sign-only: stopping before git ops"
  exit 0
fi

# Stage only what ship.sh owns. Never `git add -A` — would absorb unrelated WT changes.
git add "${SIGNED_FILES[@]}" factory/manifest.txt factory/manifest.txt.sig

if git diff --cached --quiet; then
  echo "nothing staged — no factory changes to ship"
  exit 0
fi

msg="${1:-ship: $(date -u +%Y-%m-%dT%H:%MZ)}"
git commit -m "$msg"
bash scripts/push.sh "$msg"

# Awareness: ship.sh signs + pushes ONLY the gated files above. If other factory
# changes (skills, templates) are sitting in the working tree, say so loudly —
# silently leaving them behind is how factory/skills/*.md edits get stranded
# (e.g. an autoloop spec edit that never reaches the routine). They are not
# signature-gated and need a separate push.
unshipped="$(git status --porcelain factory/ | grep -vE 'manifest\.txt(\.sig)?[[:space:]]*$' || true)"
if [ -n "$unshipped" ]; then
  echo ""
  echo "⚠️  factory changes NOT shipped by ship.sh (not signature-gated):"
  echo "$unshipped" | sed 's/^/    /'
  echo "    → commit these separately, then run: bash scripts/push.sh"
fi
