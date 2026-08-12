#!/usr/bin/env bash
# Copy the tracked hook into this repo's .git/hooks. Portable; no git config.
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
SRC="$ROOT/system/git-hooks/pre-commit"
HOOK="$ROOT/.git/hooks/pre-commit"
mkdir -p "$ROOT/.git/hooks"
cp "$SRC" "$HOOK"
chmod +x "$HOOK"
echo "wired $HOOK -> system/scripts/root_integrity.py"
