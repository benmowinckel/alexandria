#!/usr/bin/env bash
# Turn prepared local commits into one exact Touch ID-authorized main release.
# GitHub verifies and tests the signed candidate first. A short-lived SSH agent
# then exposes only the non-exportable Secure Enclave key for the final push.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

SIGNER="$HOME/.alexandria-signing/bin/alexandria-sign"
SIGNER_SOURCE="$ROOT/factory/signing/alexandria-sign.swift"
PUBLIC_KEY="$HOME/.alexandria-signing/secure-enclave.pub"
ALLOWED_SIGNERS="$HOME/.alexandria-signing/git_allowed_signers"
RELEASE_KEY_REFERENCE="$HOME/.alexandria-signing/secure-enclave-release.keyref"
RELEASE_PUBLIC_KEY="$HOME/.alexandria-signing/secure-enclave-release.pub"
RELEASE_REMOTE="${ALEX_RELEASE_REMOTE:-git@github.com:benmowinckel/alexandria.git}"

test "$(uname -s)" = Darwin || { echo "error: releases require the founder's Mac" >&2; exit 1; }
command -v swiftc >/dev/null 2>&1 || { echo "error: Apple Swift compiler not found" >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "error: jq is required to read GitHub test results" >&2; exit 1; }
test -f "$SIGNER_SOURCE" || { echo "error: Touch ID signer source is missing" >&2; exit 1; }
test -f "$PUBLIC_KEY" || { echo "error: Touch ID public key is missing" >&2; exit 1; }
test -f "$ALLOWED_SIGNERS" || { echo "error: Git allowed-signers file is missing" >&2; exit 1; }
test -f "$RELEASE_KEY_REFERENCE" || { echo "error: Touch ID release key is missing" >&2; exit 1; }
test -f "$RELEASE_PUBLIC_KEY" || { echo "error: Touch ID release public key is missing" >&2; exit 1; }

if [ ! -x "$SIGNER" ] || [ "$SIGNER_SOURCE" -nt "$SIGNER" ]; then
  mkdir -p "$(dirname "$SIGNER")"
  signer_tmp="${SIGNER}.tmp.$$"
  swiftc -O "$SIGNER_SOURCE" -o "$signer_tmp"
  chmod 700 "$signer_tmp"
  mv "$signer_tmp" "$SIGNER"
fi

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
agent_dir=""
agent_socket=""
agent_pid=""
candidate=""
cleanup() {
  if [ -n "$agent_pid" ]; then
    kill "$agent_pid" 2>/dev/null || true
    wait "$agent_pid" 2>/dev/null || true
  fi
  [ -z "$agent_socket" ] || rm -f "$agent_socket"
  [ -z "$agent_dir" ] || rmdir "$agent_dir" 2>/dev/null || true
  rm -f "$message_file"
}
trap cleanup EXIT INT TERM
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

echo "GitHub is verifying and testing the exact signed release..."
deadline=$((SECONDS + 900))
run_id=""
verify=""
test_job=""
while [ "$SECONDS" -lt "$deadline" ]; do
  if [ -z "$run_id" ]; then
    runs="$(curl -fsSL "https://api.github.com/repos/benmowinckel/alexandria/actions/workflows/structural-release.yml/runs?head_sha=$signed&event=create&per_page=5")"
    run_id="$(printf '%s' "$runs" | jq -r '.workflow_runs[0].id // empty')"
  else
    jobs="$(curl -fsSL "https://api.github.com/repos/benmowinckel/alexandria/actions/runs/$run_id/jobs?per_page=20")"
    verify="$(printf '%s' "$jobs" | jq -r '.jobs[] | select(.name == "verify") | .conclusion // .status')"
    test_job="$(printf '%s' "$jobs" | jq -r '.jobs[] | select(.name == "test") | .conclusion // .status')"
    if [ "$verify" = success ] && [ "$test_job" = success ]; then
      break
    fi
    case "$verify:$test_job" in
      *failure*|*cancelled*|*timed_out*|*action_required*)
        echo "error: GitHub rejected the signed release during verification or tests" >&2
        exit 1
        ;;
    esac
  fi
  sleep 20
done

test "$verify" = success && test "$test_job" = success || {
  echo "error: GitHub did not finish verification and tests within 15 minutes" >&2
  exit 1
}

agent_dir="$(mktemp -d)"
agent_socket="$agent_dir/agent.sock"
ALEX_SIGNING_PURPOSE="Authorize Alexandria release ${signed:0:12}" \
  "$SIGNER" agent "$RELEASE_KEY_REFERENCE" "$agent_socket" &
agent_pid=$!

attempt=0
while [ ! -S "$agent_socket" ]; do
  kill -0 "$agent_pid" 2>/dev/null || {
    echo "error: Touch ID release agent failed to start" >&2
    exit 1
  }
  attempt=$((attempt + 1))
  [ "$attempt" -lt 100 ] || { echo "error: Touch ID release agent timed out" >&2; exit 1; }
  sleep 0.05
done

echo "Touch ID will now release exactly ${signed:0:12} to users."
release_ssh="ssh -o IdentityAgent=$agent_socket -o IdentitiesOnly=yes -i $RELEASE_PUBLIC_KEY"
GIT_SSH_COMMAND="$release_ssh" git push "$RELEASE_REMOTE" "$signed:refs/heads/main"

git fetch --quiet origin main
live="$(git rev-parse origin/main)"
test "$live" = "$signed" || { echo "error: GitHub main does not match the authorized release" >&2; exit 1; }
git push --quiet origin ":refs/heads/$candidate" || true
candidate=""
echo "shipped: $signed"
