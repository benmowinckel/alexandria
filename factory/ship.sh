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
  factory/canon/axioms.md
  factory/canon/methodology.md
  factory/canon/editor.md
  factory/canon/mercury.md
  factory/canon/publisher.md
  factory/canon/library.md
  factory/canon/filter.md
  factory/canon/bookshelf.md
)

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
git push
