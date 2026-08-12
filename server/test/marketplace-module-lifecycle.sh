#!/usr/bin/env bash
# Local, network-free test of inspect -> review -> exact-hash registration.
set -euo pipefail

repo_root=$(cd "$(dirname "$0")/../.." && pwd)
test_root=$(mktemp -d "${TMPDIR:-/tmp}/alexandria-marketplace-test.XXXXXX")
trap 'rm -rf "$test_root"' EXIT
mkdir -p "$test_root/bin" "$test_root/home"

module_body="$test_root/module.md"
printf '%s\n' '---' 'name: focus' 'description: Test module.' 'adaptation: personalizable' '---' '# Focus' 'Review me; do not execute me.' > "$module_body"

# Deterministic GitHub stand-in: install.sh still exercises its real download,
# content-addressed storage, hash check, and manifest update paths.
real_curl=$(command -v curl)
printf '%s\n' '#!/usr/bin/env bash' 'set -euo pipefail' \
  'output=""' \
  'while [[ $# -gt 0 ]]; do if [[ "$1" == "-o" ]]; then output="$2"; shift 2; else shift; fi; done' \
  'cp "$MARKETPLACE_TEST_MODULE" "$output"' > "$test_root/bin/curl"
chmod +x "$test_root/bin/curl"

export HOME="$test_root/home"
export ALEXANDRIA_DIR="$test_root/home/alexandria"
export ALEXANDRIA_MODULE_STORE="$test_root/home/alexandria/modules/sources"
export MARKETPLACE_TEST_MODULE="$module_body"
export PATH="$test_root/bin:${PATH}"

id='github:example/modules#focus'
inspect_output=$(bash "$repo_root/factory/scripts/install.sh" inspect "$id")
sha=$(printf '%s\n' "$inspect_output" | awk '/^install: sha256 / {print $3}')
bytes=$(printf '%s\n' "$inspect_output" | awk '/^install: bytes / {print $3}')

[[ "$sha" =~ ^[a-f0-9]{64}$ ]]
[[ -f "$bytes" ]]
[[ ! -f "$ALEXANDRIA_DIR/.call_manifest" ]]
printf '%s\n' "$inspect_output" | grep -q 'not registered, activated, executed, or reported'

if bash "$repo_root/factory/scripts/install.sh" register "$id" "$(printf '0%.0s' {1..64})" >/dev/null 2>&1; then
  echo 'register accepted bytes that were never inspected' >&2
  exit 1
fi

register_output=$(bash "$repo_root/factory/scripts/install.sh" register "$id" "$sha" adapted)
printf '%s\n' "$register_output" | grep -q 'no module was activated or executed'
jq -e --arg id "$id" --arg sha "$sha" \
  '.modules == [{id: $id, source_sha256: $sha, relationship: "adapted", text: ""}]' \
  "$ALEXANDRIA_DIR/.call_manifest" >/dev/null

# Registration is idempotent, while any byte change produces a different hash.
bash "$repo_root/factory/scripts/install.sh" register "$id" "$sha" adapted | grep -q 'already registered'
printf '%s\n' 'changed' >> "$module_body"
changed_output=$(bash "$repo_root/factory/scripts/install.sh" inspect "$id")
changed_sha=$(printf '%s\n' "$changed_output" | awk '/^install: sha256 / {print $3}')
[[ "$changed_sha" != "$sha" ]]

# Publishing stays in the Author's GitHub namespace and carries adaptation +
# lineage metadata. Command stubs keep this test local and side-effect free.
printf '%s\n' '#!/usr/bin/env bash' \
  'if [[ "$1" == "api" ]]; then printf "%s\n" example; exit 0; fi' \
  'if [[ "$1 $2" == "repo view" ]]; then exit 0; fi' \
  'exit 1' > "$test_root/bin/gh"
printf '%s\n' '#!/usr/bin/env bash' \
  'if [[ "$1" == "diff" || "${3:-}" == "diff" ]]; then exit 1; fi' \
  'exit 0' > "$test_root/bin/git"
chmod +x "$test_root/bin/gh" "$test_root/bin/git"
publish_dir="$test_root/published"
mkdir -p "$publish_dir/.git"
publish_template="$test_root/template.md"
printf '%s\n' '---' 'name: <slug>' 'description: Test module.' '---' '# <Module title>' 'Body.' > "$publish_template"
export MARKETPLACE_TEST_MODULE="$publish_template"
export ALEXANDRIA_MODULES_DIR="$publish_dir"
publish_file=$(bash "$repo_root/factory/scripts/publish.sh" setup forked-focus personalizable github:example/modules#focus)
grep -q '^adaptation: personalizable$' "$publish_file"
grep -q '^derived_from: github:example/modules#focus$' "$publish_file"
sed -i.bak 's/# <Module title>/# Forked focus/' "$publish_file"
publish_id=$(bash "$repo_root/factory/scripts/publish.sh" finalize forked-focus 2>/dev/null)
[[ "$publish_id" == 'github:example/alexandria-modules#forked-focus' ]]

# Keep shellcheck-style tools honest: the test deliberately replaces curl.
[[ -n "$real_curl" ]]
echo 'marketplace module inspect/register lifecycle: PASS'
