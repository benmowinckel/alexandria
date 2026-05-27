#!/usr/bin/env bash
# Alexandria stranger test — full product flow on a clean machine.
# Simulates a new user: setup → hooks install → session-start → session-end → subagent.
# Real scripts, real server, no mocks.
#
# Usage: bash test/stranger.sh
# Env:   ALEXANDRIA_TEST_KEY (required), BASE_URL (optional)

# Note: do NOT export MSYS_NO_PATHCONV=1 globally — it breaks curl -D in child processes.
# Set it per-command where needed (e.g. MSYS_NO_PATHCONV=1 curl ...)

BASE_URL="${BASE_URL:-https://api.alexandria-library.com}"
REAL_HOME="$HOME"
PASSED=0
FAILED=0

# --- Helpers ---

check() {
  local name="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    echo "[stranger] $name ... OK"
    PASSED=$((PASSED + 1))
  else
    echo "[stranger] $name ... FAIL"
    FAILED=$((FAILED + 1))
  fi
}

check_output() {
  local name="$1" pattern="$2" text="$3"
  if echo "$text" | grep -q "$pattern" 2>/dev/null; then
    echo "[stranger] $name ... OK"
    PASSED=$((PASSED + 1))
  else
    echo "[stranger] $name ... FAIL"
    FAILED=$((FAILED + 1))
  fi
}

cleanup() {
  if [ -n "$TEMP_HOME" ] && [ -d "$TEMP_HOME" ]; then
    rm -rf "$TEMP_HOME"
  fi
  export HOME="$REAL_HOME"
}
trap cleanup EXIT

# ═══════════════════════════════════════════════════════════
# Phase 0 — Prerequisites
# ═══════════════════════════════════════════════════════════

echo ""
echo "═══ Phase 0: Prerequisites ═══"

# API key: env var > real home fallback
API_KEY="${ALEXANDRIA_TEST_KEY:-}"
if [ -z "$API_KEY" ] && [ -f "$REAL_HOME/alexandria/system/.api_key" ]; then
  API_KEY=$(tr -d '[:space:]' < "$REAL_HOME/alexandria/system/.api_key")
fi
if [ -z "$API_KEY" ]; then
  echo "[stranger] ABORT — no API key. Set ALEXANDRIA_TEST_KEY or have ~/alexandria/system/.api_key"
  exit 1
fi

# Create clean temp HOME
# On Windows/MSYS, mktemp -d creates paths under /tmp which Node.js can't resolve.
# Use a subdir of the real HOME so paths translate correctly across bash/node.
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*)
    TEMP_HOME="$REAL_HOME/.stranger_test_$$"
    mkdir -p "$TEMP_HOME"
    ;;
  *)
    TEMP_HOME=$(mktemp -d 2>/dev/null || mktemp -d -t 'alex_stranger')
    ;;
esac
export HOME="$TEMP_HOME"

# Prevent setup script from creating GitHub repos on CI
unset GH_TOKEN
unset GITHUB_TOKEN

check "temp HOME created"     [ -d "$HOME" ]
check "API key available"     [ -n "$API_KEY" ]
check "curl available"        command -v curl
check "node available"        command -v node

# ═══════════════════════════════════════════════════════════
# Phase 1 — Dirty HOME (realistic pre-existing state)
# ═══════════════════════════════════════════════════════════

echo ""
echo "═══ Phase 1: Dirty HOME ═══"

# Simulate a real Claude Code user with existing settings
mkdir -p "$HOME/.claude"
cat > "$HOME/.claude/settings.json" << 'DIRTY'
{
  "permissions": {
    "defaultMode": "normal"
  },
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "echo existing-hook-preserved"
          }
        ]
      }
    ]
  }
}
DIRTY

echo "[stranger] pre-populated settings.json with existing hooks"

# ═══════════════════════════════════════════════════════════
# Phase 2 — Setup script (curl factory/setup.sh | bash)
# ═══════════════════════════════════════════════════════════

echo ""
echo "═══ Phase 2: Setup script ═══"

SETUP_SCRIPT=$(curl -s --max-time 15 "https://raw.githubusercontent.com/mowinckelb/alexandria/main/factory/setup.sh" 2>/dev/null)

check "setup script fetched"       [ -n "$SETUP_SCRIPT" ]
SETUP_FIRST_LINE=$(echo "$SETUP_SCRIPT" | head -1)
check "setup is bash script"       [ "$SETUP_FIRST_LINE" = "#!/usr/bin/env bash" ]

# Execute setup with the test API key
echo "$SETUP_SCRIPT" | bash -s -- "$API_KEY" 2>/dev/null

# Verify directory structure
check "alexandria dir exists"      [ -d "$HOME/alexandria" ]
check "vault dir exists"           [ -d "$HOME/alexandria/files/vault" ]
check "hooks dir exists"           [ -d "$HOME/alexandria/system/hooks" ]
check "constitution dir exists"    [ -d "$HOME/alexandria/files/constitution" ]
check "marginalia dir exists"      [ -d "$HOME/alexandria/files/marginalia" ]
check "library dir exists"         [ -d "$HOME/alexandria/files/library" ]

# Verify files
check "feedback.md exists"         [ -f "$HOME/alexandria/files/core/feedback.md" ]
check "notepad.md exists"          [ -f "$HOME/alexandria/files/core/notepad.md" ]
check "machine.md exists"          [ -f "$HOME/alexandria/files/core/machine.md" ]
check "api_key written"            [ -f "$HOME/alexandria/system/.api_key" ]
check "api_key correct"            [ "$(cat "$HOME/alexandria/system/.api_key")" = "$API_KEY" ]
check "setup_complete marker"      [ -f "$HOME/alexandria/system/.setup_complete" ]

# Permission check (skip on Windows — NTFS doesn't enforce Unix perms)
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) ;;
  *) check "api_key not world-readable" [ ! "$(stat -c '%a' "$HOME/alexandria/system/.api_key" 2>/dev/null || stat -f '%Lp' "$HOME/alexandria/system/.api_key" 2>/dev/null)" = "644" ] ;;
esac

# ═══════════════════════════════════════════════════════════
# Phase 3 — Hooks installation
# ═══════════════════════════════════════════════════════════

echo ""
echo "═══ Phase 3: Hooks installation ═══"

check "shim.sh exists"             [ -f "$HOME/alexandria/system/hooks/shim.sh" ]
check "shim.sh executable"         [ -x "$HOME/alexandria/system/hooks/shim.sh" ]
check "shim.sh non-empty"          [ -s "$HOME/alexandria/system/hooks/shim.sh" ]
check "SKILL.md exists"            [ -f "$HOME/.claude/skills/alexandria/SKILL.md" ]
check "SKILL.md has Alexandria"    grep -q "Alexandria" "$HOME/.claude/skills/alexandria/SKILL.md"
check "scheduled task exists"      [ -f "$HOME/.claude/scheduled-tasks/alexandria/SKILL.md" ]
check "canon cached"               [ -f "$HOME/alexandria/system/canon/methodology.md" ]

# settings.json integrity
check "settings.json exists"       [ -f "$HOME/.claude/settings.json" ]
check "settings.json valid JSON"   node -e "JSON.parse(require('fs').readFileSync(require('path').join(process.env.HOME,'.claude','settings.json'),'utf8'))"

# All 3 hooks wired + existing settings preserved
check "hook: SessionStart"         grep -q "session-start" "$HOME/.claude/settings.json"
check "hook: SessionEnd"           grep -q "session-end" "$HOME/.claude/settings.json"
check "hook: SubagentStart"        grep -q "subagent" "$HOME/.claude/settings.json"
check "existing hook preserved"    grep -q "existing-hook-preserved" "$HOME/.claude/settings.json"
check "existing permissions kept"  grep -q '"defaultMode"' "$HOME/.claude/settings.json"

# ═══════════════════════════════════════════════════════════
# Phase 4 — Session-start hook execution
# ═══════════════════════════════════════════════════════════

echo ""
echo "═══ Phase 4: Session-start hook ═══"

# Seed a test constitution so the hook has something to inject
mkdir -p "$HOME/alexandria/files/constitution"
cat > "$HOME/alexandria/files/constitution/test.md" << 'CONSTITUTION_TEST'
Test Author believes in first principles thinking.
They prefer simple systems over ornate abstractions.
When tradeoffs appear, they optimize for clarity, speed, and direct customer truth.
They want concrete execution and short feedback loops.
They dislike process theater and default to deletion before addition.
CONSTITUTION_TEST

# Seed marginalia so the pointer block sees a non-empty directory
mkdir -p "$HOME/alexandria/files/marginalia"
cat > "$HOME/alexandria/files/marginalia/test.md" << 'MARGINALIA_TEST'
Early signal: this Author sees software architecture as compressed philosophy.
MARGINALIA_TEST

touch "$HOME/alexandria/system/.block_complete"

# Run the shim exactly as Claude Code would
SESSION_START_OUTPUT=$(bash "$HOME/alexandria/system/hooks/shim.sh" session-start 2>&1)
SESSION_START_EXIT=$?

check "session-start ran"                [ "$SESSION_START_EXIT" -eq 0 ]
# Author context is a pointer block now (constitution/marginalia/machine/notepad/feedback
# live at ~/alexandria/files/, AI Reads on demand). Inline injection was dropped in
# 09fe5fa — was 70KB, mostly truncated by harnesses, near-zero net signal.
check_output "author context block"      "AUTHOR CONTEXT"        "$SESSION_START_OUTPUT"
check_output "constitution pointer"      "constitution/"         "$SESSION_START_OUTPUT"
check_output "marginalia pointer"        "marginalia/"           "$SESSION_START_OUTPUT"
check_output "machine pointer"           "core/machine.md"       "$SESSION_START_OUTPUT"
check_output "notepad pointer"           "core/notepad.md"       "$SESSION_START_OUTPUT"
check_output "feedback pointer"          "core/feedback.md"      "$SESSION_START_OUTPUT"
check "hooks_payload cached"             [ -f "$HOME/alexandria/system/.hooks_payload" ]
check "hooks_payload non-empty"          [ -s "$HOME/alexandria/system/.hooks_payload" ]
check "canon cached"                     [ -f "$HOME/alexandria/system/canon/methodology.md" ]
CANON_SIZE=$(wc -c < "$HOME/alexandria/system/canon/methodology.md" 2>/dev/null | tr -d ' ' || echo 0)
check "canon non-trivial"               [ "${CANON_SIZE:-0}" -gt 100 ]

# ═══════════════════════════════════════════════════════════
# Phase 5 — Session-end hook execution
# ═══════════════════════════════════════════════════════════

echo ""
echo "═══ Phase 5: Session-end hook ═══"

# Create a fake transcript
FAKE_TRANSCRIPT="$TEMP_HOME/test_transcript.jsonl"
echo '{"role":"user","content":"stranger test transcript"}' > "$FAKE_TRANSCRIPT"

# Pipe the transcript path as JSON (how Claude Code sends it)
echo "{\"transcript_path\":\"$FAKE_TRANSCRIPT\"}" | bash "$HOME/alexandria/system/hooks/shim.sh" session-end 2>&1
SESSION_END_EXIT=$?

check "session-end ran"            [ "$SESSION_END_EXIT" -eq 0 ]

# Check transcript was copied to vault
VAULT_FILES=$(ls "$HOME/alexandria/files/vault/"*.jsonl 2>/dev/null | head -1)
check "transcript in vault"        [ -n "$VAULT_FILES" ]
if [ -n "$VAULT_FILES" ]; then
  check "vault file non-empty"     [ -s "$VAULT_FILES" ]
fi

# ═══════════════════════════════════════════════════════════
# Phase 6 — Subagent hook execution
# ═══════════════════════════════════════════════════════════

echo ""
echo "═══ Phase 6: Subagent hook ═══"

SUBAGENT_OUTPUT=$(bash "$HOME/alexandria/system/hooks/shim.sh" subagent 2>&1)
SUBAGENT_EXIT=$?

check "subagent ran"                     [ "$SUBAGENT_EXIT" -eq 0 ]
check_output "subagent context block"    "AUTHOR CONTEXT"        "$SUBAGENT_OUTPUT"
check_output "subagent constitution ptr" "constitution/"         "$SUBAGENT_OUTPUT"

# ═══════════════════════════════════════════════════════════
# Summary
# ═══════════════════════════════════════════════════════════

TOTAL=$((PASSED + FAILED))
echo ""
if [ "$FAILED" -eq 0 ]; then
  echo "[stranger] All $TOTAL/$TOTAL passed"
else
  echo "[stranger] $FAILED/$TOTAL FAILED"
  exit 1
fi
