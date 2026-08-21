#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
SCRIPT="$ROOT/factory/scripts/guest_workspace.py"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

export ALEXANDRIA_DIR="$TMP/alexandria"
mkdir -p "$ALEXANDRIA_DIR/files/library/public" "$ALEXANDRIA_DIR/files/private" "$ALEXANDRIA_DIR/system/permissions"
printf 'safe public context\n' > "$ALEXANDRIA_DIR/files/library/public/everyone.md"
printf 'must never appear\n' > "$ALEXANDRIA_DIR/files/private/secret.md"
printf 'files/library/public/everyone.md\tcontext/everyone.md\n' > "$TMP/allowlist.tsv"

plan="$(python3 "$SCRIPT" plan fixture "$TMP/allowlist.tsv")"
digest="$(printf '%s\n' "$plan" | awk '/selection sha256:/ {print $3}')"
printf '%s\n' "$digest" > "$ALEXANDRIA_DIR/system/permissions/guest-fixture"
python3 "$SCRIPT" enable fixture "$TMP/allowlist.tsv" "$TMP/guest"

test "$(cat "$TMP/guest/context/everyone.md")" = 'safe public context'
if git -C "$TMP/guest" rev-list --objects --all | grep -q 'secret.md'; then
  echo 'guest test failed: unselected private path entered Git history' >&2
  exit 1
fi

printf 'changed without approval\n' > "$ALEXANDRIA_DIR/files/library/public/everyone.md"
if python3 "$SCRIPT" refresh fixture >/dev/null 2>&1; then
  echo 'guest test failed: changed selected bytes exported without new approval' >&2
  exit 1
fi

printf 'a proposed idea\n' > "$TMP/guest/inbox/proposal.md"
git -C "$TMP/guest" add inbox/proposal.md
git -C "$TMP/guest" -c commit.gpgsign=false -c user.name=Fixture -c user.email=fixture@example.com commit -m 'Write proposal' >/dev/null
python3 "$SCRIPT" import fixture
imported="$(find "$ALEXANDRIA_DIR/files/vault/input/guest/fixture" -type f -name '*.md' -print -quit)"
grep -q '^trust: untrusted$' "$imported"
grep -q '^a proposed idea$' "$imported"
printf 'safe public context\n' > "$ALEXANDRIA_DIR/files/library/public/everyone.md"

git -C "$TMP/guest" checkout -b context-attack >/dev/null
printf 'poison\n' > "$TMP/guest/context/everyone.md"
git -C "$TMP/guest" add context/everyone.md
git -C "$TMP/guest" -c commit.gpgsign=false -c user.name=Fixture -c user.email=fixture@example.com commit -m 'Change protected context' >/dev/null
if python3 "$SCRIPT" import fixture >/dev/null 2>&1; then
  echo 'guest test failed: protected context edit was accepted' >&2
  exit 1
fi

printf '../outside\tcontext/nope.md\n' > "$TMP/traversal.tsv"
if python3 "$SCRIPT" plan bad "$TMP/traversal.tsv" >/dev/null 2>&1; then
  echo 'guest test failed: source traversal was accepted' >&2
  exit 1
fi
ln -s "$ALEXANDRIA_DIR/files/private/secret.md" "$ALEXANDRIA_DIR/files/library/public/link.md"
printf 'files/library/public/link.md\tcontext/link.md\n' > "$TMP/symlink.tsv"
if python3 "$SCRIPT" plan bad "$TMP/symlink.tsv" >/dev/null 2>&1; then
  echo 'guest test failed: source symlink was accepted' >&2
  exit 1
fi
printf '\000binary' > "$ALEXANDRIA_DIR/files/library/public/binary.md"
printf 'files/library/public/binary.md\tcontext/binary.md\n' > "$TMP/binary.tsv"
if python3 "$SCRIPT" plan bad "$TMP/binary.tsv" >/dev/null 2>&1; then
  echo 'guest test failed: binary source was accepted' >&2
  exit 1
fi

python3 "$SCRIPT" off fixture >/dev/null
if python3 "$SCRIPT" import fixture >/dev/null 2>&1; then
  echo 'guest test failed: off workspace still imported' >&2
  exit 1
fi

echo 'guest workspace tests passed'
