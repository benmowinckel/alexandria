#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
SCRIPT="$ROOT/factory/scripts/airlock.py"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

export ALEXANDRIA_DIR="$TMP/alexandria"
mkdir -p "$ALEXANDRIA_DIR/files/library/public" "$ALEXANDRIA_DIR/files/private" "$ALEXANDRIA_DIR/system/permissions"
printf 'safe public context\n' > "$ALEXANDRIA_DIR/files/library/public/everyone.md"
printf 'must never appear\n' > "$ALEXANDRIA_DIR/files/private/secret.md"
printf 'files/library/public/everyone.md\tcontext/everyone.md\n' > "$TMP/allowlist.tsv"

plan="$(python3 "$SCRIPT" plan airlock "$TMP/allowlist.tsv")"
grep -q 'already-public Library shadow; refreshes automatically' <<< "$plan"
python3 "$SCRIPT" enable airlock "$TMP/allowlist.tsv" "$TMP/workspace"

test "$(cat "$TMP/workspace/context/everyone.md")" = 'safe public context'
if git -C "$TMP/workspace" rev-list --objects --all | grep -q 'secret.md'; then
  echo 'Airlock test failed: unselected private path entered Git history' >&2
  exit 1
fi

printf 'changed without approval\n' > "$ALEXANDRIA_DIR/files/library/public/everyone.md"
python3 "$SCRIPT" refresh airlock >/dev/null
test "$(cat "$TMP/workspace/context/everyone.md")" = 'changed without approval'

printf 'files/private/secret.md\tcontext/secret.md\n' > "$TMP/private.tsv"
private_plan="$(python3 "$SCRIPT" plan airlock-2 "$TMP/private.tsv")"
private_digest="$(printf '%s\n' "$private_plan" | awk '/selection sha256:/ {print $3}')"
if python3 "$SCRIPT" enable airlock-2 "$TMP/private.tsv" "$TMP/private-workspace" >/dev/null 2>&1; then
  echo 'Airlock test failed: private context crossed without approval' >&2
  exit 1
fi
printf '%s\n' "$private_digest" > "$ALEXANDRIA_DIR/system/permissions/airlock-2"
python3 "$SCRIPT" enable airlock-2 "$TMP/private.tsv" "$TMP/private-workspace" >/dev/null
printf 'changed private context\n' > "$ALEXANDRIA_DIR/files/private/secret.md"
if python3 "$SCRIPT" refresh airlock-2 >/dev/null 2>&1; then
  echo 'Airlock test failed: changed private bytes exported without new approval' >&2
  exit 1
fi

git init --bare "$TMP/remote.git" >/dev/null
git -C "$TMP/workspace" remote add origin git@github.com:fixture/workspace.git
git -C "$TMP/workspace" config url."file://$TMP/remote.git".insteadOf git@github.com:fixture/workspace.git
git -C "$TMP/workspace" push -u origin main >/dev/null

printf 'a proposed idea\n' > "$TMP/workspace/inbox/proposal.md"
git -C "$TMP/workspace" add inbox/proposal.md
git -C "$TMP/workspace" -c commit.gpgsign=false -c user.name=Fixture -c user.email=fixture@example.com commit -m 'Write proposal' >/dev/null
git -C "$TMP/workspace" push origin main >/dev/null

mkdir -p "$TMP/bin"
printf '%s\n' \
  '#!/usr/bin/env bash' \
  'set -euo pipefail' \
  'if [ "$1 $2" = "issue list" ]; then' \
  '  printf '\''[{"number":7,"title":"One thought","body":"issue capture body\\n","createdAt":"2026-08-27T12:00:00Z","url":"https://github.com/fixture/workspace/issues/7"}]'\''' \
  'elif [ "$1 $2" = "issue close" ]; then' \
  '  printf "%s\\n" "$3" >> "$GH_CLOSED"' \
  'else' \
  '  exit 2' \
  'fi' > "$TMP/bin/gh"
chmod +x "$TMP/bin/gh"
export GH_CLOSED="$TMP/closed"
export PATH="$TMP/bin:$PATH"

printf 'automatically refreshed public context\n' > "$ALEXANDRIA_DIR/files/library/public/everyone.md"
python3 "$SCRIPT" import-all
test "$(cat "$TMP/workspace/context/everyone.md")" = 'automatically refreshed public context'
test "$(git --git-dir="$TMP/remote.git" show main:context/everyone.md)" = 'automatically refreshed public context'
imported="$(find "$ALEXANDRIA_DIR/files/vault/input" -type f -name 'airlock-*proposal.md' -print -quit)"
grep -q '^trust: untrusted$' "$imported"
grep -q '^a proposed idea$' "$imported"
issue_imported="$ALEXANDRIA_DIR/files/vault/input/2026-08-27-airlock-issue-7.md"
grep -q '^channel: github-issue$' "$issue_imported"
grep -q '^issue capture body$' "$issue_imported"
grep -q '^7$' "$GH_CLOSED"
test "$(find "$ALEXANDRIA_DIR/files/vault/input" -name '*issue-7.md' | wc -l | tr -d ' ')" = 1
mkdir -p "$ALEXANDRIA_DIR/files/vault/_input"
mv "$issue_imported" "$ALEXANDRIA_DIR/files/vault/_input/$(basename "$issue_imported")"
python3 "$SCRIPT" import-all >/dev/null
test "$(grep -c '^7$' "$GH_CLOSED")" = 2
printf 'changed after import\n' > "$ALEXANDRIA_DIR/files/vault/_input/$(basename "$issue_imported")"
if python3 "$SCRIPT" import-all >/dev/null 2>&1; then
  echo 'Airlock test failed: changed issue capture was treated as safe to close' >&2
  exit 1
fi
printf '%s' $'---\nsource: airlock\nchannel: github-issue\nairlock: airlock\nrepository: "fixture/workspace"\nissue: 7\nurl: "https://github.com/fixture/workspace/issues/7"\ncreated: "2026-08-27T12:00:00Z"\ntitle: "One thought"\ntrust: untrusted\n---\n\nissue capture body\n' > "$ALEXANDRIA_DIR/files/vault/_input/$(basename "$issue_imported")"
python3 "$SCRIPT" import-all >/dev/null &
first_import=$!
python3 "$SCRIPT" import-all >/dev/null &
second_import=$!
wait "$first_import" "$second_import"
test "$(find "$ALEXANDRIA_DIR/files/vault/_input" -name '*issue-7.md' | wc -l | tr -d ' ')" = 1
printf 'safe public context\n' > "$ALEXANDRIA_DIR/files/library/public/everyone.md"

git -C "$TMP/workspace" checkout -b context-attack >/dev/null
printf 'poison\n' > "$TMP/workspace/context/everyone.md"
git -C "$TMP/workspace" add context/everyone.md
git -C "$TMP/workspace" -c commit.gpgsign=false -c user.name=Fixture -c user.email=fixture@example.com commit -m 'Change protected context' >/dev/null
if python3 "$SCRIPT" import airlock >/dev/null 2>&1; then
  echo 'Airlock test failed: protected context edit was accepted' >&2
  exit 1
fi

printf '../outside\tcontext/nope.md\n' > "$TMP/traversal.tsv"
if python3 "$SCRIPT" plan airlock-2 "$TMP/traversal.tsv" >/dev/null 2>&1; then
  echo 'Airlock test failed: source traversal was accepted' >&2
  exit 1
fi
ln -s "$ALEXANDRIA_DIR/files/private/secret.md" "$ALEXANDRIA_DIR/files/library/public/link.md"
printf 'files/library/public/link.md\tcontext/link.md\n' > "$TMP/symlink.tsv"
if python3 "$SCRIPT" plan airlock-2 "$TMP/symlink.tsv" >/dev/null 2>&1; then
  echo 'Airlock test failed: source symlink was accepted' >&2
  exit 1
fi
printf '\000binary' > "$ALEXANDRIA_DIR/files/library/public/binary.md"
printf 'files/library/public/binary.md\tcontext/binary.md\n' > "$TMP/binary.tsv"
if python3 "$SCRIPT" plan airlock-2 "$TMP/binary.tsv" >/dev/null 2>&1; then
  echo 'Airlock test failed: binary source was accepted' >&2
  exit 1
fi

python3 "$SCRIPT" off airlock >/dev/null
if python3 "$SCRIPT" import airlock >/dev/null 2>&1; then
  echo 'Airlock test failed: off Airlock still imported' >&2
  exit 1
fi

echo 'Airlock tests passed'
