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
    if [ -n "${GITHUB_ACTIONS:-}" ]; then
      printf '::error title=Stranger test failed::%s\n' "$name"
    fi
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
    if [ -n "${GITHUB_ACTIONS:-}" ]; then
      printf '::error title=Stranger test failed::%s\n' "$name"
    fi
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

# Shared skill names are user space. Seed foreign files in two Alexandria-named
# fallback slots; setup must use the free /a and /a. slots without touching
# these, and the scoped uninstaller must never mistake a filename for ownership.
mkdir -p "$HOME/.claude/skills/alexandria" "$HOME/.claude/skills/alexandria-close"
printf '%s\n' 'foreign start skill — keep this exact line' > "$HOME/.claude/skills/alexandria/SKILL.md"
printf '%s\n' 'foreign close skill — keep this exact line' > "$HOME/.claude/skills/alexandria-close/SKILL.md"

# ═══════════════════════════════════════════════════════════
# Phase 2 — Setup script (the first-touch agent runs an exact verified commit)
# ═══════════════════════════════════════════════════════════

echo ""
echo "═══ Phase 2: Setup script ═══"

SOURCE_DIR="$TEMP_HOME/alexandria-source"
SIGNING_KEYS_JSON="$TEMP_HOME/github-signing-keys.json"
SIGNING_KEY_FILE="$TEMP_HOME/release-signing-key.pub"
ALLOWED_SIGNERS="$TEMP_HOME/release-allowed-signers"
EXPECTED_FINGERPRINT="SHA256:9DVo6uNuieqKMdNtT0QIi/WoQAAbWl5i/t0Z5MdQ/Jg"

# Reproduce the official first-touch boundary. The website supplies no code:
# clone only the canonical repo, obtain the account signing keys independently
# from GitHub, require the pinned Touch ID fingerprint, verify the exact commit,
# then run setup from that immutable commit.
git clone --quiet --depth 1 https://github.com/benmowinckel/alexandria.git "$SOURCE_DIR" 2>/dev/null
check "canonical repo cloned"       [ -d "$SOURCE_DIR/.git" ]

GITHUB_API_AUTH=()
if [ -n "${ALEXANDRIA_GITHUB_API_TOKEN:-}" ]; then
  GITHUB_API_AUTH=(-H "Authorization: Bearer $ALEXANDRIA_GITHUB_API_TOKEN")
fi
curl -fsS --retry 3 --max-time 20 "${GITHUB_API_AUTH[@]}" \
  https://api.github.com/users/benmowinckel/ssh_signing_keys \
  -o "$SIGNING_KEYS_JSON" 2>/dev/null
unset ALEXANDRIA_GITHUB_API_TOKEN
GITHUB_API_AUTH=()
check "account signing keys fetched" [ -s "$SIGNING_KEYS_JSON" ]

MATCHING_KEY=""
while IFS= read -r candidate_key; do
  [ -n "$candidate_key" ] || continue
  printf '%s\n' "$candidate_key" > "$SIGNING_KEY_FILE"
  if ssh-keygen -lf "$SIGNING_KEY_FILE" 2>/dev/null | grep -qF "$EXPECTED_FINGERPRINT"; then
    MATCHING_KEY="$candidate_key"
    break
  fi
done < <(node -e "const fs=require('fs'); for (const k of JSON.parse(fs.readFileSync(process.argv[1],'utf8'))) if (k && typeof k.key==='string') console.log(k.key)" "$SIGNING_KEYS_JSON")

check "Touch ID fingerprint matched" [ -n "$MATCHING_KEY" ]
printf 'benjamin@mowinckel.com %s alexandria-touchid\n' "$MATCHING_KEY" > "$ALLOWED_SIGNERS"
SOURCE_COMMIT=$(git -C "$SOURCE_DIR" rev-parse HEAD 2>/dev/null)
check "source commit is exact"       bash -c '[[ "$1" =~ ^[0-9a-f]{40}$ ]]' _ "$SOURCE_COMMIT"
check "source commit is Touch ID signed" git -C "$SOURCE_DIR" \
  -c gpg.format=ssh \
  -c gpg.ssh.allowedSignersFile="$ALLOWED_SIGNERS" \
  verify-commit "$SOURCE_COMMIT"
check "setup is bash script"         bash -c '[ "$(head -1 "$1")" = "#!/usr/bin/env bash" ]' _ "$SOURCE_DIR/factory/setup.sh"
check "close selection is Git Bash safe" grep -Fq 'done <<< "$CLAUDE_CLOSE_SLOTS"' "$SOURCE_DIR/factory/setup.sh"

# Execute only that authenticated commit with the dedicated test account. The
# fixture is the informed approval for this isolated account connection; no
# connected feature is enabled by setup.
ALEXANDRIA_SOURCE_COMMIT="$SOURCE_COMMIT" \
  ALEXANDRIA_ACCOUNT_CONNECT_APPROVED=1 \
  bash "$SOURCE_DIR/factory/setup.sh" "$API_KEY" 2>/dev/null

# A compact annotation keeps cross-platform core-gate failures diagnosable even
# when the hosted log archive is unavailable to a public, unauthenticated read.
if [ -n "${GITHUB_ACTIONS:-}" ] && [ ! -f "$HOME/.local/share/alexandria/.setup_complete" ]; then
  SETUP_REPORT=$(tr '\r\n' ';;' < "$HOME/alexandria/system/.setup_report" 2>/dev/null || true)
  printf '::error title=Setup report::%s\n' "${SETUP_REPORT:-missing}"
  SKILL_STATE=""
  for rel in a alexandria alexandria-close close-alexandria 'a.'; do
    skill_file="$HOME/.claude/skills/$rel/SKILL.md"
    if [ -f "$skill_file" ]; then
      skill_name=$(sed -n 's/^name: /name=/p' "$skill_file" | head -1)
      SKILL_STATE="${SKILL_STATE}${rel}:${skill_name:-no-name};"
    else
      SKILL_STATE="${SKILL_STATE}${rel}:missing;"
    fi
  done
  printf '::error title=Setup skill state::platform=%s;%s\n' "$(uname -s)" "$SKILL_STATE"
fi

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
check "setup_complete marker"      [ -f "$HOME/.local/share/alexandria/.setup_complete" ]
check "passive-active loop healthy" grep -q '^  loop: ok$' "$HOME/alexandria/system/.setup_report"
check "visible cue healthy"       grep -q '^  visible_cue: ok$' "$HOME/alexandria/system/.setup_report"
check "visible cue reaches /a"    bash -c 'HOME="$1" bash "$1/.local/share/alexandria/scripts/statusline.sh" footer | grep -q "start /a in a new chat"' _ "$HOME"
check "Codex cue reaches \$a"     bash -c 'HOME="$1" bash "$1/.local/share/alexandria/scripts/statusline.sh" footer-codex | grep -qF "start \$a in a new chat"' _ "$HOME"

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

check "shim.sh exists"             [ -f "$HOME/.local/share/alexandria/hooks/shim.sh" ]
check "shim.sh executable"         [ -x "$HOME/.local/share/alexandria/hooks/shim.sh" ]
check "shim.sh non-empty"          [ -s "$HOME/.local/share/alexandria/hooks/shim.sh" ]
START_SKILL="$HOME/.claude/skills/a/SKILL.md"
[ -f "$START_SKILL" ] || START_SKILL="$HOME/.claude/skills/alexandria/SKILL.md"
check "start SKILL.md exists"      [ -f "$START_SKILL" ]
check "start skill has Alexandria" grep -q "Alexandria" "$START_SKILL"
check "foreign alexandria skill kept" grep -qxF 'foreign start skill — keep this exact line' "$HOME/.claude/skills/alexandria/SKILL.md"
check "foreign close skill kept" grep -qxF 'foreign close skill — keep this exact line' "$HOME/.claude/skills/alexandria-close/SKILL.md"
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*)
    WINDOWS_CLOSE_SKILL="$HOME/.claude/skills/close-alexandria/SKILL.md"
    check "Windows close alias exists" [ -f "$WINDOWS_CLOSE_SKILL" ]
    check "Windows close alias keeps /a. name" grep -q '^name: a\.$' "$WINDOWS_CLOSE_SKILL"
    ;;
  *) check "canonical close skill exists" [ -f "$HOME/.claude/skills/a./SKILL.md" ] ;;
esac
# Inverted 2026-07-22: the scheduled-task bootstrap (retired cloud autoloop)
# must NOT install — the core installs nothing scheduled.
check "no scheduled task installed" bash -c '[ ! -f "$HOME/.claude/scheduled-tasks/alexandria/SKILL.md" ]'
# 2026-07-22 reviewer-gate properties — regression-locked:
# core installs pinned+verified payload, ships the add-ons menu, seeds no add-on machinery.
check "payload pinned + verified"  [ -f "$HOME/.local/share/alexandria/.payload_verified_sha" ]
check "add-ons menu cached"        [ -f "$HOME/alexandria/system/.optional" ]
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

# A shipped default is not the core. Turn methodology off using the documented
# reversible move, re-run setup, and prove neither setup nor session start
# resurrects it. This is the ground-truth regression for the activation layers.
mkdir -p "$HOME/alexandria/system/canon/disabled"
mv "$HOME/alexandria/system/canon/methodology.md" \
  "$HOME/alexandria/system/canon/disabled/methodology.md"
ALEXANDRIA_SOURCE_COMMIT="$SOURCE_COMMIT" \
  bash "$SOURCE_DIR/factory/setup.sh" >/dev/null 2>&1
check "disabled default preserved" [ -s "$HOME/alexandria/system/canon/disabled/methodology.md" ]
check "disabled default not restored" [ ! -e "$HOME/alexandria/system/canon/methodology.md" ]
check "core healthy without default" grep -q '^  canon: ok$' "$HOME/alexandria/system/.setup_report"
check "method reported off" grep -q '^  methods: skip$' "$HOME/alexandria/system/.setup_report"
PULL_DISABLED_OUTPUT=$(bash "$HOME/.local/share/alexandria/.hooks_payload" \
  pull methodology "$HOME/alexandria" 2>&1)
check_output "disabled update remains off" "updated in disabled/ and remains off" "$PULL_DISABLED_OUTPUT"
check "disabled update not reactivated" [ ! -e "$HOME/alexandria/system/canon/methodology.md" ]

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
SESSION_START_OUTPUT=$(bash "$HOME/.local/share/alexandria/hooks/shim.sh" session-start 2>&1)
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
check "hooks_payload cached"             [ -f "$HOME/.local/share/alexandria/.hooks_payload" ]
check "hooks_payload non-empty"          [ -s "$HOME/.local/share/alexandria/.hooks_payload" ]
check "Foundation cached"                [ -f "$HOME/alexandria/system/canon/foundation.md" ]
FOUNDATION_SIZE=$(wc -c < "$HOME/alexandria/system/canon/foundation.md" 2>/dev/null | tr -d ' ' || echo 0)
check "Foundation non-trivial"           [ "${FOUNDATION_SIZE:-0}" -gt 100 ]
check "session kept default disabled"    [ ! -e "$HOME/alexandria/system/canon/methodology.md" ]

# ═══════════════════════════════════════════════════════════
# Phase 5 — Session-end hook execution
# ═══════════════════════════════════════════════════════════

echo ""
echo "═══ Phase 5: Session-end hook ═══"

# Create a fake transcript
FAKE_TRANSCRIPT="$TEMP_HOME/test_transcript.jsonl"
echo '{"role":"user","content":"stranger test transcript"}' > "$FAKE_TRANSCRIPT"

# Pipe the transcript path as JSON (how Claude Code sends it)
echo "{\"transcript_path\":\"$FAKE_TRANSCRIPT\"}" | bash "$HOME/.local/share/alexandria/hooks/shim.sh" session-end 2>&1
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

SUBAGENT_OUTPUT=$(bash "$HOME/.local/share/alexandria/hooks/shim.sh" subagent 2>&1)
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
