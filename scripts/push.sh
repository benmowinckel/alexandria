#!/usr/bin/env bash
# Turn prepared local commits into one Touch ID-authorized release candidate.
# GitHub's default-branch gate verifies, tests, and advances main.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

SIGNER="$HOME/.alexandria-signing/bin/alexandria-sign"
PUBLIC_KEY="$HOME/.alexandria-signing/secure-enclave.pub"
ALLOWED_SIGNERS="$HOME/.alexandria-signing/git_allowed_signers"

test "$(uname -s)" = Darwin || { echo "error: releases require the founder's Mac" >&2; exit 1; }
test -x "$SIGNER" || { echo "error: Touch ID signer is missing" >&2; exit 1; }
test -f "$PUBLIC_KEY" || { echo "error: Touch ID public key is missing" >&2; exit 1; }
test -f "$ALLOWED_SIGNERS" || { echo "error: Git allowed-signers file is missing" >&2; exit 1; }

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "error: commit the prepared changes before shipping" >&2
  exit 1
fi

branch="$(git symbolic-ref --quiet --short HEAD)" || {
  echo "error: detached HEAD cannot ship" >&2
  exit 1
}

git fetch --quiet origin main
base="$(git rev-parse origin/main)"
head="$(git rev-parse HEAD)"
test "$head" != "$base" || { echo "nothing to ship"; exit 0; }
git merge-base --is-ancestor "$base" "$head" || {
  echo "error: local work is not based on current main — rebase it first" >&2
  exit 1
}

echo "Touch ID will authorize this exact release:"
git log --format='  %h %s' "$base..$head"
git diff --stat "$base..$head" | sed 's/^/  /'

count="$(git rev-list --count "$base..$head")"
if [ "$#" -gt 0 ]; then
  subject="$*"
elif [ "$count" = 1 ]; then
  subject="$(git log -1 --format=%s "$head")"
else
  subject="ship: $count prepared commits"
fi
body="$(git log --reverse --format='- %s' "$base..$head")"
tree="$(git rev-parse "$head^{tree}")"

message_file="$(mktemp)"
trap 'rm -f "$message_file"' EXIT
{
  printf '%s\n\n' "$subject"
  printf '%s\n' "$body"
} > "$message_file"

signed="$(git \
  -c gpg.format=ssh \
  -c gpg.ssh.program="$SIGNER" \
  -c user.signingkey="$PUBLIC_KEY" \
  commit-tree "$tree" -p "$base" -S < "$message_file")"

git -c gpg.format=ssh \
    -c gpg.ssh.allowedSignersFile="$ALLOWED_SIGNERS" \
    verify-commit "$signed" >/dev/null

git update-ref "refs/heads/$branch" "$signed" "$head"
candidate="release/$(date -u +%Y%m%dT%H%M%SZ)-${signed:0:12}"
git push origin "$signed:refs/heads/$candidate"

echo "GitHub is verifying and testing the signed release..."
deadline=$((SECONDS + 900))
while [ "$SECONDS" -lt "$deadline" ]; do
  live="$(git ls-remote origin refs/heads/main | awk '{print $1}')"
  if [ "$live" = "$signed" ]; then
    git fetch --quiet origin main
    git push --quiet origin ":refs/heads/$candidate" || true
    echo "shipped: $signed"
    exit 0
  fi
  sleep 15
done

echo "error: GitHub did not promote the release within 15 minutes" >&2
echo "check: https://github.com/benmowinckel/alexandria/actions/workflows/structural-release.yml" >&2
exit 1
