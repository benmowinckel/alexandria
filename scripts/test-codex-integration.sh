#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
TEST_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/alexandria-codex-test.XXXXXX")
trap 'rm -rf "$TEST_ROOT"' EXIT

sha256() {
  if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | cut -d' ' -f1
  else sha256sum "$1" | cut -d' ' -f1
  fi
}

RUNTIME="$TEST_ROOT/runtime"
mkdir -p "$TEST_ROOT/.codex" "$TEST_ROOT/alex/system/hooks" \
  "$TEST_ROOT/alex/system/scripts" "$TEST_ROOT/alex/files/vault" \
  "$RUNTIME/hooks"

printf '%s\n' '# Existing user instructions' > "$TEST_ROOT/.codex/AGENTS.md"
printf '%s\n' '# Legacy file must stay unchanged' > "$TEST_ROOT/.codex/instructions.md"
cat > "$TEST_ROOT/.codex/hooks.json" <<'JSON'
{"hooks":{"Stop":[{"hooks":[{"type":"command","command":"say done"}]}]}}
JSON

python3 "$ROOT/factory/scripts/configure_codex.py" \
  --codex-home "$TEST_ROOT/.codex" --alex-dir "$TEST_ROOT/alex" \
  --runtime-dir "$RUNTIME" \
  --ambient "$ROOT/factory/skills/codex-ambient.md" >/dev/null
FIRST_SHA=$(sha256 "$TEST_ROOT/.codex/hooks.json")
python3 "$ROOT/factory/scripts/configure_codex.py" \
  --codex-home "$TEST_ROOT/.codex" --alex-dir "$TEST_ROOT/alex" \
  --runtime-dir "$RUNTIME" \
  --ambient "$ROOT/factory/skills/codex-ambient.md" >/dev/null
SECOND_SHA=$(sha256 "$TEST_ROOT/.codex/hooks.json")

python3 - "$TEST_ROOT" "$FIRST_SHA" "$SECOND_SHA" <<'PY'
import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
document = json.loads((root / ".codex/hooks.json").read_text())
hooks = document["hooks"]
assert hooks["Stop"][0]["hooks"][0]["command"] == "say done"
assert len(hooks["SessionStart"]) == 2
assert len(hooks["SessionEnd"]) == 1
assert len(hooks["SubagentStart"]) == 1
end = hooks["SessionEnd"][0]["hooks"][0]
assert end["timeout"] == 3
assert end["command"].endswith("codex-session-end")
assert str(root / "runtime/hooks/shim.sh") in end["command"]
assert (root / ".codex/instructions.md").read_text() == "# Legacy file must stay unchanged\n"
agents = (root / ".codex/AGENTS.md").read_text()
assert agents.startswith("# Existing user instructions\n")
assert agents.count("<!-- alexandria:start -->") == 1
assert (root / "alex/system/.codex_session_start_needs_trust").exists()
assert (root / "alex/system/.codex_session_end_needs_trust").exists()
assert (root / "alex/system/.codex_subagent_start_needs_trust").exists()
assert sys.argv[2] == sys.argv[3], "Codex config merge is not idempotent"
PY

# A full Author-managed AGENTS.md is authoritative and must remain byte-exact.
mkdir -p "$TEST_ROOT/full/.codex" "$TEST_ROOT/full/alex/system"
cat > "$TEST_ROOT/full/.codex/AGENTS.md" <<'FULL'
# Synced from ~/alexandria/files/core/agent.md — edit there, not here.

## Alexandria the product — always running

Existing full Author instructions.
FULL
FULL_BEFORE=$(sha256 "$TEST_ROOT/full/.codex/AGENTS.md")
python3 "$ROOT/factory/scripts/configure_codex.py" \
  --codex-home "$TEST_ROOT/full/.codex" --alex-dir "$TEST_ROOT/full/alex" \
  --runtime-dir "$TEST_ROOT/full/runtime" \
  --ambient "$ROOT/factory/skills/codex-ambient.md" >/dev/null
test "$FULL_BEFORE" = "$(sha256 "$TEST_ROOT/full/.codex/AGENTS.md")"

# Malformed user configuration fails closed and stays byte-exact.
mkdir -p "$TEST_ROOT/bad/.codex" "$TEST_ROOT/bad/alex/system"
printf '%s\n' '{broken json' > "$TEST_ROOT/bad/.codex/hooks.json"
BAD_BEFORE=$(sha256 "$TEST_ROOT/bad/.codex/hooks.json")
if python3 "$ROOT/factory/scripts/configure_codex.py" \
  --codex-home "$TEST_ROOT/bad/.codex" --alex-dir "$TEST_ROOT/bad/alex" \
  --runtime-dir "$TEST_ROOT/bad/runtime" \
  --ambient "$ROOT/factory/skills/codex-ambient.md" >/dev/null 2>&1; then
  echo "configure_codex unexpectedly accepted malformed hooks" >&2
  exit 1
fi
test "$BAD_BEFORE" = "$(sha256 "$TEST_ROOT/bad/.codex/hooks.json")"

cp "$ROOT/factory/hooks/shim.sh" "$RUNTIME/hooks/shim.sh"
cp "$ROOT/factory/hooks/payload.sh" "$RUNTIME/.hooks_payload"
mkdir -p "$RUNTIME/scripts" "$TEST_ROOT/.codex/sessions"
cp "$ROOT/factory/scripts/transcript_path.sh" "$RUNTIME/scripts/transcript_path.sh"
touch "$RUNTIME/.setup_complete"
sha256 "$RUNTIME/.hooks_payload" > "$RUNTIME/.payload_verified_sha"
printf '%s\n' '{"event":"test transcript"}' > "$TEST_ROOT/.codex/sessions/source.jsonl"
printf '{"session_id":"test-123","transcript_path":"%s"}\n' "$TEST_ROOT/.codex/sessions/source.jsonl" | \
  HOME="$TEST_ROOT" ALEXANDRIA_DIR="$TEST_ROOT/alex" \
  bash "$RUNTIME/hooks/shim.sh" codex-session-end

test -f "$TEST_ROOT/alex/system/.codex_session_end_ok"
test "$(find "$TEST_ROOT/alex/files/vault" -type f -name '*_codex_test-123.jsonl' | wc -l | tr -d ' ')" = "1"
test "$(find "$TEST_ROOT/alex/system/.codex_session_end_queue" -type f -name '*.json' | wc -l | tr -d ' ')" = "1"

# A path outside supported host roots must not be archived.
printf '%s\n' '{"event":"outside"}' > "$TEST_ROOT/outside.jsonl"
printf '{"session_id":"bad-1","transcript_path":"%s"}\n' "$TEST_ROOT/outside.jsonl" | \
  HOME="$TEST_ROOT" ALEXANDRIA_DIR="$TEST_ROOT/alex" \
  bash "$RUNTIME/hooks/shim.sh" codex-session-end
test "$(find "$TEST_ROOT/alex/files/vault" -type f -name '*_codex_bad-1.jsonl' | wc -l | tr -d ' ')" = "0"

# The next start drains the bounded end receipt through the normal end path.
HOME="$TEST_ROOT" ALEXANDRIA_DIR="$TEST_ROOT/alex" \
  bash "$RUNTIME/hooks/shim.sh" session-start </dev/null >/dev/null
test "$(find "$TEST_ROOT/alex/system/.codex_session_end_queue" -type f -name '*.json' 2>/dev/null | wc -l | tr -d ' ')" = "0"

echo "Codex integration test passed"
