#!/usr/bin/env bash
# Sign + commit + push factory changes.
# Run from repo root: bash factory/ship.sh
#
# Builds factory/manifest.txt (sha256 of payload + every canon file),
# signs it with the offline signing key, commits + pushes.
# Replaces `git push` for any change in factory/hooks/payload.sh or factory/canon/*.md.
#
# Trust root: ~/.alexandria-signing/key (ed25519, passphrase-protected, never in CI).

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

SIGNING_KEY="${ALEX_SIGNING_KEY:-$HOME/.alexandria-signing/key}"
if [ ! -f "$SIGNING_KEY" ]; then
  echo "error: signing key not found at $SIGNING_KEY" >&2
  echo "Generate with: ssh-keygen -t ed25519 -f $SIGNING_KEY -C alexandria-payload-signing" >&2
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
  factory/canon/MODULES.md
  factory/skills/scheduled.md
  factory/skills/machine.md
  factory/skills/factory.md
  factory/scripts/brief.py
  factory/scripts/install.sh
  factory/scripts/publish.sh
  factory/scripts/capture_resolver.py
  factory/systems/capture-pipeline.md
  factory/migrate.sh
)

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
  factory/scripts/brief.py factory/scripts/install.sh factory/scripts/publish.sh
  factory/scripts/capture_resolver.py factory/migrate.sh
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
#   - hooks/cursor/*.py                    — installed to ~/.cursor/hooks once (setup.sh:159)
#   - scripts/publish-fork.sh             — installed once, run hourly from local copy (setup.sh:405)
# NOTE: the warn below STILL fires (correctly) for the FETCHED-AND-RUN scripts
# (scripts/brief.py, install.sh, publish.sh, migrate.sh) — those are curl'd from
# GitHub then executed, so they genuinely need a verify gate (audit M5/M6). They
# are user-initiated + lower-frequency than the nightly scheduled.md (already
# gated), so the proper fix is a reusable verify-fetch helper, tracked separately.
UNSIGNED_OK=(
  factory/hooks/shim.sh factory/setup.sh factory/ship.sh
  factory/scripts/verify-fetch.sh
  factory/hooks/cursor/alexandria-session-start.py
  factory/hooks/cursor/alexandria-session-end.py
  factory/hooks/cursor/alexandria-stop.py
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

# Sign the manifest. Namespace "alexandria" prevents this signature from
# being valid in any other ssh-signing context.
rm -f factory/manifest.txt.sig
ssh-keygen -Y sign -f "$SIGNING_KEY" -n alexandria factory/manifest.txt >/dev/null
# ssh-keygen writes to factory/manifest.txt.sig automatically.

echo "Signed manifest:"
sed 's/^/  /' factory/manifest.txt
echo ""
echo "Public key fingerprint:"
ssh-keygen -lf "${SIGNING_KEY}.pub" | sed 's/^/  /'
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
# Canon publishes to main (that's what every Author's machine pulls), regardless
# of the local working branch. A plain `git push` silently no-ops/​fails when the
# current branch has no upstream (e.g. a local feature branch) — leaving the
# signed manifest committed but never live. Push HEAD→main explicitly so the
# ship always reaches users. (Non-fast-forward still fails safely, no --force.)
git push origin HEAD:main

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
  echo "    → these need a separate push:  git push   (or: bash scripts/push.sh)"
fi
