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
# Touch ID match. No persistent ssh-agent or passphrase cache is involved; the
# final push gets a one-key agent that exists only for that release.

set -euo pipefail

echo "reminder: install or sovereignty-surface change? run the relevant red-team pass first (factory/redteam.md)"

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

# Known commercial-boundary and first-touch regressions are deterministic and
# block before Touch ID. The model red-team remains the judgment layer above it.
bash factory/scripts/check-private-boundary.sh

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

# Sign the entire tracked factory, not a hand-maintained subset. That makes
# signature coverage structural: adding any new installer, hook, prompt,
# template, or helper automatically adds it to the next manifest. The manifest
# and its signature are the only exclusions because they are the output.
SIGNED_FILES=()
DELETED_FILES=()
while IFS= read -r f; do
  case "$f" in
    factory/manifest.txt|factory/manifest.txt.sig) continue ;;
  esac
  if [ -f "$f" ]; then
    SIGNED_FILES+=("$f")
  else
    DELETED_FILES+=("$f")
  fi
done < <(git ls-files factory | LC_ALL=C sort)

[ "${#SIGNED_FILES[@]}" -gt 0 ] || {
  echo "error: no tracked factory files found" >&2
  exit 1
}

# Build manifest: one line per file, "sha256  relative/path". Refuse dirty
# untracked factory files: they cannot be part of a reproducible signed release.
untracked_factory="$(git ls-files --others --exclude-standard factory)"
if [ -n "$untracked_factory" ]; then
  echo "error: untracked factory files would ship unsigned:" >&2
  printf '%s\n' "$untracked_factory" | sed 's/^/  /' >&2
  exit 1
fi

# A skill without valid discovery metadata exists on disk but silently
# disappears from the host's skill picker. Check the aliases before signing.
validate_skill_frontmatter() {
  local file="$1" expected_name="$2" explicit="${3:-no}"
  [ "$(sed -n '1p' "$file")" = "---" ] || {
    echo "error: $file has no opening skill frontmatter" >&2
    exit 1
  }
  grep -q "^name: $expected_name$" "$file" || {
    echo "error: $file must declare name: $expected_name" >&2
    exit 1
  }
  grep -q '^description: .' "$file" || {
    echo "error: $file has no skill description" >&2
    exit 1
  }
  if [ "$explicit" = "yes" ]; then
    grep -q '^user_invocable: true$' "$file" || {
      echo "error: $file is not explicitly invocable" >&2
      exit 1
    }
  fi
  sed -n '2,12p' "$file" | grep -qx -- '---' || {
    echo "error: $file has no closing skill frontmatter" >&2
    exit 1
  }
}
validate_skill_frontmatter factory/skills/claudecode.md a
validate_skill_frontmatter factory/skills/codex.md a yes
validate_skill_frontmatter factory/skills/aclose.md a. yes
grep -q 'display_name: "a — Alexandria"' factory/skills/codex-openai.yaml || {
  echo "error: factory/skills/codex-openai.yaml has no Alexandria display name" >&2
  exit 1
}
grep -q 'allow_implicit_invocation: false' factory/skills/codex-openai.yaml || {
  echo "error: factory/skills/codex-openai.yaml must remain explicit-only" >&2
  exit 1
}

# The joined handoff compares this semantic version with the version each
# Author has already seen. A changed map with an unchanged number would make a
# real packaging change invisible, so block that release structurally.
current_module_version="$(node -e "const fs=require('fs');const j=JSON.parse(fs.readFileSync('factory/module-system.json','utf8'));if(!Number.isInteger(j.version)||j.version<1)process.exit(1);process.stdout.write(String(j.version))")" || {
  echo "error: factory/module-system.json has no positive integer version" >&2
  exit 1
}
if git cat-file -e HEAD:factory/module-system.json 2>/dev/null; then
  previous_module_version="$(git show HEAD:factory/module-system.json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);if(!Number.isInteger(j.version)||j.version<1)process.exit(1);process.stdout.write(String(j.version))})")" || {
    echo "error: committed factory/module-system.json has no valid version" >&2
    exit 1
  }
  if ! git diff --quiet HEAD -- factory/module-system.json && [ "$current_module_version" -le "$previous_module_version" ]; then
    echo "error: module-system.json changed without increasing its version" >&2
    exit 1
  fi
fi

previous_version="$(awk '$1=="#" && $2=="alexandria-factory-version" {print $3; exit}' factory/manifest.txt 2>/dev/null)"
release_version="$(date -u +%Y%m%d%H%M%S)"
case "$previous_version" in ''|[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]) ;; *) echo "error: existing factory version is malformed" >&2; exit 1 ;; esac
if [ -n "$previous_version" ] && [ "$release_version" -le "$previous_version" ]; then
  release_version=$((previous_version + 1))
fi

{
  printf '# alexandria-factory-version %s\n' "$release_version"
  for f in "${SIGNED_FILES[@]}"; do
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

# Stage only what ship.sh owns. `git add -u -- factory` is required for signed
# releases that deliberately remove factory files; the manifest above describes
# the exact post-deletion tree. Never `git add -A` — that could absorb unrelated
# untracked work elsewhere in the repository.
git add -u -- factory
git add "${SIGNED_FILES[@]}" factory/manifest.txt factory/manifest.txt.sig

if git diff --cached --quiet; then
  echo "nothing staged — no factory changes to ship"
  exit 0
fi

msg="${1:-ship: $(date -u +%Y-%m-%dT%H:%MZ)}"
git commit -m "$msg"
bash scripts/push.sh "$msg"

# Awareness: every tracked factory file is signature-gated and shipped. Only
# manifest outputs should remain after a successful release.
unshipped="$(git status --porcelain factory/ | grep -vE 'manifest\.txt(\.sig)?[[:space:]]*$' || true)"
if [ -n "$unshipped" ]; then
  echo ""
  echo "⚠️  factory changes unexpectedly remain after ship.sh:"
  echo "$unshipped" | sed 's/^/    /'
  echo "    → resolve these before calling the factory release complete"
fi
