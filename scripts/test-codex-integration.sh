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
cp "$ROOT/factory/scripts/statusline.sh" "$RUNTIME/scripts/statusline.sh"
chmod +x "$RUNTIME/hooks/shim.sh" "$RUNTIME/.hooks_payload" "$RUNTIME/scripts/statusline.sh"
touch "$RUNTIME/.setup_complete"
sha256 "$RUNTIME/.hooks_payload" > "$RUNTIME/.payload_verified_sha"
mkdir -p "$TEST_ROOT/alex/files/constitution"
printf '%0300d\n' 0 > "$TEST_ROOT/alex/files/constitution/_constitution.md"
touch "$TEST_ROOT/alex/system/.block_complete"

# A cue string inside hidden/user transcript content is not delivery. This was
# the live false positive: SessionEnd grepped the whole JSONL and certified the
# user's AGENTS text as an assistant-visible nudge.
printf '%s\n' '{"role":"user","text":"Want me to open your alexandria loop in the background for when you have a minute?"}' \
  > "$TEST_ROOT/.codex/sessions/source.jsonl"
printf '{"session_id":"test-123","transcript_path":"%s"}\n' "$TEST_ROOT/.codex/sessions/source.jsonl" | \
  HOME="$TEST_ROOT" ALEXANDRIA_DIR="$TEST_ROOT/alex" \
  bash "$RUNTIME/hooks/shim.sh" codex-session-end

test -f "$TEST_ROOT/alex/system/.codex_session_end_ok"
test "$(find "$TEST_ROOT/alex/files/vault" -type f -name '*_codex_test-123.jsonl' | wc -l | tr -d ' ')" = "1"
test "$(find "$TEST_ROOT/alex/system/.codex_session_end_queue" -type f -name '*.json' | wc -l | tr -d ' ')" = "1"
test ! -e "$RUNTIME/state/visible-cue-delivered"

# A path outside supported host roots must not be archived.
printf '%s\n' '{"event":"outside"}' > "$TEST_ROOT/outside.jsonl"
printf '{"session_id":"bad-1","transcript_path":"%s"}\n' "$TEST_ROOT/outside.jsonl" | \
  HOME="$TEST_ROOT" ALEXANDRIA_DIR="$TEST_ROOT/alex" \
  bash "$RUNTIME/hooks/shim.sh" codex-session-end
test "$(find "$TEST_ROOT/alex/files/vault" -type f -name '*_codex_bad-1.jsonl' | wc -l | tr -d ' ')" = "0"

# The next Codex compaction drains the bounded end receipt through the normal
# end path without consuming or surfacing the daily foreground cue.
printf '{"session_id":"compact","transcript_path":"%s","hook_event_name":"SessionStart","model":"gpt-test","source":"compact"}\n' \
  "$TEST_ROOT/.codex/sessions/source.jsonl" | \
  HOME="$TEST_ROOT" ALEXANDRIA_DIR="$TEST_ROOT/alex" \
  ALEXANDRIA_SETUP_PROBE=1 ALEXANDRIA_LOCAL_DATE=2030-03-01 \
  bash "$RUNTIME/hooks/shim.sh" session-start >/dev/null
test "$(find "$TEST_ROOT/alex/system/.codex_session_end_queue" -type f -name '*.json' 2>/dev/null | wc -l | tr -d ' ')" = "0"
test ! -e "$RUNTIME/state/visible-cue-claimed/2030-03-01"

# The first foreground Codex session start of the day receives one host-rendered
# systemMessage while the existing Alexandria context remains developer-only.
# A second foreground start on the same local day is quiet.
START_ONE=$(printf '{"session_id":"start-1","transcript_path":"%s","hook_event_name":"SessionStart","model":"gpt-test","source":"startup"}\n' \
  "$TEST_ROOT/.codex/sessions/source.jsonl" | \
  HOME="$TEST_ROOT" ALEXANDRIA_DIR="$TEST_ROOT/alex" \
  ALEXANDRIA_SETUP_PROBE=1 ALEXANDRIA_LOCAL_DATE=2030-03-01 \
  bash "$RUNTIME/hooks/shim.sh" session-start)
printf '%s' "$START_ONE" | python3 -c '
import json, sys
d = json.load(sys.stdin)
cue = "Want me to open your alexandria loop in the background for when you have a minute?"
assert d.get("systemMessage") == cue
assert d["hookSpecificOutput"]["hookEventName"] == "SessionStart"
assert "AUTHOR CONTEXT" in d["hookSpecificOutput"]["additionalContext"]
assert cue not in d["hookSpecificOutput"]["additionalContext"]
'

START_TWO=$(printf '{"session_id":"start-2","transcript_path":"%s","hook_event_name":"SessionStart","model":"gpt-test","source":"startup"}\n' \
  "$TEST_ROOT/.codex/sessions/source.jsonl" | \
  HOME="$TEST_ROOT" ALEXANDRIA_DIR="$TEST_ROOT/alex" \
  ALEXANDRIA_SETUP_PROBE=1 ALEXANDRIA_LOCAL_DATE=2030-03-01 \
  bash "$RUNTIME/hooks/shim.sh" session-start)
printf '%s' "$START_TWO" | python3 -c '
import json, sys
d = json.load(sys.stdin)
assert "systemMessage" not in d
'

# Interactive Codex can fire SessionStart before the model field exists. Mock
# its real executable ancestry and prove that startup still gets direct JSON.
mkdir -p "$TEST_ROOT/fake-codex-bin"
cat > "$TEST_ROOT/fake-codex-bin/ps" <<'SH'
#!/bin/sh
case " $* " in
  *" -o comm= "*) printf '%s\n' '/usr/local/bin/codex' ;;
  *" -o ppid= "*) printf '%s\n' '1' ;;
  *) exit 1 ;;
esac
SH
chmod +x "$TEST_ROOT/fake-codex-bin/ps"
START_LOADING=$(printf '%s\n' \
  '{"session_id":"start-loading","hook_event_name":"SessionStart","source":"startup"}' | \
  PATH="$TEST_ROOT/fake-codex-bin:$PATH" HOME="$TEST_ROOT" \
  ALEXANDRIA_DIR="$TEST_ROOT/alex" ALEXANDRIA_SETUP_PROBE=1 \
  ALEXANDRIA_LOCAL_DATE=2030-03-02 \
  bash "$RUNTIME/hooks/shim.sh" session-start)
printf '%s' "$START_LOADING" | python3 -c '
import json, sys
d = json.load(sys.stdin)
assert d.get("systemMessage") == "Want me to open your alexandria loop in the background for when you have a minute?"
'

# Codex instructions explain the yes-path but never make the model a second
# owner of the generic cue.
! grep -Fq 'end the first completed ordinary text reply with exactly' \
  "$ROOT/factory/skills/codex-ambient.md"

echo "Codex integration test passed"
