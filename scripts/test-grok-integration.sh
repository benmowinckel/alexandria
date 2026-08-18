#!/usr/bin/env bash
# Grok CLI install/uninstall in a fake HOME. Does not run factory/ship.sh
# and does not fetch a signed manifest: it copies local factory bytes the
# same way setup.sh would after founder ship.
set -euo pipefail

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
TEST_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/alexandria-grok-test.XXXXXX")
cleanup() { rm -rf "$TEST_ROOT"; }
trap cleanup EXIT

sha256() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    sha256sum "$1" | awk '{print $1}'
  fi
}

# ── Absent case: no ~/.grok and no grok binary → no false install ──
ABSENT="$TEST_ROOT/absent"
mkdir -p "$ABSENT"
PATH="/usr/bin:/bin" HOME="$ABSENT" bash -c '
  if [ -d "$HOME/.grok" ] || command -v grok >/dev/null 2>&1; then
    echo "grok falsely detected in an empty home" >&2
    exit 1
  fi
'
[ ! -e "$ABSENT/.grok" ] || { echo "absent home grew a ~/.grok directory" >&2; exit 1; }

# ── Present case ──
HOME_DIR="$TEST_ROOT/present"
mkdir -p \
  "$HOME_DIR/.grok/hooks" \
  "$HOME_DIR/.grok/skills" \
  "$HOME_DIR/.local/share/alexandria/hooks" \
  "$HOME_DIR/.local/share/alexandria/scripts" \
  "$HOME_DIR/alexandria/files/vault"
printf '%s\n' 'keep-foreign-config = true' > "$HOME_DIR/.grok/config.toml"
printf '%s\n' '{"hooks":{"PreToolUse":[{"hooks":[{"type":"command","command":"echo foreign"}]}]}}' \
  > "$HOME_DIR/.grok/hooks/safety.json"
mkdir -p "$HOME_DIR/.grok/skills/keep-me"
printf '%s\n' 'foreign skill — keep this exact line' > "$HOME_DIR/.grok/skills/keep-me/SKILL.md"
mkdir -p "$HOME_DIR/.grok/skills/a"
printf '%s\n' 'foreign start skill — keep this exact line' > "$HOME_DIR/.grok/skills/a/SKILL.md"

cp "$ROOT/factory/scripts/configure_grok.py" "$HOME_DIR/.local/share/alexandria/scripts/configure_grok.py"
cp "$ROOT/factory/scripts/uninstall.py" "$HOME_DIR/.local/share/alexandria/scripts/uninstall.py"
cp "$ROOT/factory/hooks/shim.sh" "$HOME_DIR/.local/share/alexandria/hooks/shim.sh"

python3 "$HOME_DIR/.local/share/alexandria/scripts/configure_grok.py" \
  --grok-home "$HOME_DIR/.grok"

# Foreign /a is preserved: do not overwrite it in this fixture. Install close
# and /alexandria into free slots, then record ownership for the files we own.
mkdir -p "$HOME_DIR/.grok/skills/alexandria" "$HOME_DIR/.grok/skills/a."
cp "$ROOT/factory/skills/claudecode.md" "$HOME_DIR/.grok/skills/alexandria/SKILL.md"
if [ "$(uname)" = "Darwin" ]; then
  sed -i '' 's/^name: a$/name: alexandria/' "$HOME_DIR/.grok/skills/alexandria/SKILL.md"
else
  sed -i 's/^name: a$/name: alexandria/' "$HOME_DIR/.grok/skills/alexandria/SKILL.md"
fi
cp "$ROOT/factory/skills/aclose.md" "$HOME_DIR/.grok/skills/a./SKILL.md"

LEDGER="$HOME_DIR/.local/share/alexandria/.owned_integrations"
: > "$LEDGER"
for owned in \
  "$HOME_DIR/.grok/hooks/alexandria.json" \
  "$HOME_DIR/.grok/skills/alexandria/SKILL.md" \
  "$HOME_DIR/.grok/skills/a./SKILL.md"; do
  printf '%s\t%s\n' "$owned" "$(sha256 "$owned")" >> "$LEDGER"
done
printf '%s\n' 'alexandria-config-v1' > "$HOME_DIR/.local/share/alexandria/.owned_grok_config"

python3 - "$HOME_DIR" <<'PY'
import json, sys
from pathlib import Path
home = Path(sys.argv[1])
hooks = json.loads((home / ".grok/hooks/alexandria.json").read_text())
start = hooks["hooks"]["SessionStart"][0]["hooks"][0]
assert start["type"] == "command"
assert start["command"].endswith("shim.sh session-start")
assert start["timeout"] == 60
assert hooks["hooks"]["SessionEnd"][0]["hooks"][0]["command"].endswith("shim.sh session-end")
assert hooks["hooks"]["SubagentStart"][0]["hooks"][0]["command"].endswith("shim.sh subagent")
skill = (home / ".grok/skills/alexandria/SKILL.md").read_text()
assert "name: alexandria" in skill.splitlines()
assert "user-invocable: true" in skill
close = (home / ".grok/skills/a./SKILL.md").read_text()
assert close.splitlines()[1] == "name: a."
assert "user-invocable: true" in close
assert (home / ".grok/config.toml").read_text() == "keep-foreign-config = true\n"
safety = json.loads((home / ".grok/hooks/safety.json").read_text())
assert safety["hooks"]["PreToolUse"][0]["hooks"][0]["command"] == "echo foreign"
PY

# Setup report grok row is emitted by setup.sh; lock the exact strings here.
grep -Fq '[ -d "$HOME/.grok" ] || command -v grok' "$ROOT/factory/setup.sh"
grep -Fq 'echo "  grok: present"' "$ROOT/factory/setup.sh"
grep -Fq 'echo "  grok: absent"' "$ROOT/factory/setup.sh"
grep -Fq 'grok_skill: $STATUS_GROK' "$ROOT/factory/setup.sh"
grep -Fq 'factory/skills/grok-bot.md is the agent-created workflow' "$ROOT/factory/setup.sh"

# Double-fire is documented, not silently "fixed" by toggling Claude compat.
grep -q '\[compat.claude\] hooks' "$ROOT/factory/setup.sh"
grep -q 'Documented double-fire' "$ROOT/factory/setup.sh"
! grep -q 'compat.claude.*hooks = false' "$ROOT/factory/setup.sh"

# Uninstall removes owned Grok files and leaves foreign ones, including a
# foreign skill named `a`.
HOME="$HOME_DIR" python3 "$HOME_DIR/.local/share/alexandria/scripts/uninstall.py" >/dev/null
[ -f "$HOME_DIR/.grok/skills/a/SKILL.md" ] || { echo "uninstaller deleted foreign /a" >&2; exit 1; }
grep -qxF 'foreign start skill — keep this exact line' "$HOME_DIR/.grok/skills/a/SKILL.md"
[ -f "$HOME_DIR/.grok/skills/keep-me/SKILL.md" ] || { echo "uninstaller deleted foreign grok skill" >&2; exit 1; }
[ -f "$HOME_DIR/.grok/hooks/safety.json" ] || { echo "uninstaller deleted foreign grok hook" >&2; exit 1; }
[ -f "$HOME_DIR/.grok/config.toml" ] || { echo "uninstaller deleted grok config.toml" >&2; exit 1; }
[ ! -e "$HOME_DIR/.grok/hooks/alexandria.json" ] || { echo "uninstaller left owned grok hook" >&2; exit 1; }
[ ! -e "$HOME_DIR/.grok/skills/a./SKILL.md" ] || { echo "uninstaller left owned grok close skill" >&2; exit 1; }
[ ! -e "$HOME_DIR/.grok/skills/alexandria/SKILL.md" ] || { echo "uninstaller left owned grok alexandria skill" >&2; exit 1; }

# Empty ~/.grok (detected) still gets native hooks; no command -v grok required.
EMPTY="$TEST_ROOT/empty-grok"
mkdir -p "$EMPTY/.grok" "$EMPTY/.local/share/alexandria/scripts"
cp "$ROOT/factory/scripts/configure_grok.py" "$EMPTY/.local/share/alexandria/scripts/configure_grok.py"
python3 "$EMPTY/.local/share/alexandria/scripts/configure_grok.py" --grok-home "$EMPTY/.grok"
[ -f "$EMPTY/.grok/hooks/alexandria.json" ]

# Clean present case: no foreign /a. Setup would write /a, /alexandria, close,
# and native hooks, then record hashes. Assert those files and uninstall.
CLEAN="$TEST_ROOT/clean"
mkdir -p \
  "$CLEAN/.grok/hooks" \
  "$CLEAN/.grok/skills" \
  "$CLEAN/.local/share/alexandria/hooks" \
  "$CLEAN/.local/share/alexandria/scripts"
printf '%s\n' 'keep-foreign-config = true' > "$CLEAN/.grok/config.toml"
mkdir -p "$CLEAN/.grok/skills/keep-me"
printf '%s\n' 'foreign skill — keep this exact line' > "$CLEAN/.grok/skills/keep-me/SKILL.md"
cp "$ROOT/factory/scripts/configure_grok.py" "$CLEAN/.local/share/alexandria/scripts/configure_grok.py"
cp "$ROOT/factory/scripts/uninstall.py" "$CLEAN/.local/share/alexandria/scripts/uninstall.py"
python3 "$CLEAN/.local/share/alexandria/scripts/configure_grok.py" --grok-home "$CLEAN/.grok"
mkdir -p "$CLEAN/.grok/skills/a" "$CLEAN/.grok/skills/alexandria" "$CLEAN/.grok/skills/a."
cp "$ROOT/factory/skills/claudecode.md" "$CLEAN/.grok/skills/a/SKILL.md"
cp "$ROOT/factory/skills/claudecode.md" "$CLEAN/.grok/skills/alexandria/SKILL.md"
if [ "$(uname)" = "Darwin" ]; then
  sed -i '' 's/^name: a$/name: alexandria/' "$CLEAN/.grok/skills/alexandria/SKILL.md"
else
  sed -i 's/^name: a$/name: alexandria/' "$CLEAN/.grok/skills/alexandria/SKILL.md"
fi
cp "$ROOT/factory/skills/aclose.md" "$CLEAN/.grok/skills/a./SKILL.md"
LEDGER_CLEAN="$CLEAN/.local/share/alexandria/.owned_integrations"
: > "$LEDGER_CLEAN"
for owned in \
  "$CLEAN/.grok/hooks/alexandria.json" \
  "$CLEAN/.grok/skills/a/SKILL.md" \
  "$CLEAN/.grok/skills/alexandria/SKILL.md" \
  "$CLEAN/.grok/skills/a./SKILL.md"; do
  printf '%s\t%s\n' "$owned" "$(sha256 "$owned")" >> "$LEDGER_CLEAN"
done
python3 - "$CLEAN" <<'PY'
from pathlib import Path
import json, sys
home = Path(sys.argv[1])
skill = (home / ".grok/skills/a/SKILL.md").read_text()
assert skill.splitlines()[1] == "name: a"
assert "user-invocable: true" in skill
assert (home / ".grok/skills/alexandria/SKILL.md").read_text().splitlines()[1] == "name: alexandria"
assert (home / ".grok/skills/a./SKILL.md").read_text().splitlines()[1] == "name: a."
hooks = json.loads((home / ".grok/hooks/alexandria.json").read_text())
assert hooks["hooks"]["SessionStart"][0]["hooks"][0]["command"].endswith("shim.sh session-start")
assert (home / ".grok/config.toml").read_text() == "keep-foreign-config = true\n"
PY
HOME="$CLEAN" python3 "$CLEAN/.local/share/alexandria/scripts/uninstall.py" >/dev/null
[ ! -e "$CLEAN/.grok/skills/a/SKILL.md" ] || { echo "uninstaller left owned grok /a" >&2; exit 1; }
[ ! -e "$CLEAN/.grok/hooks/alexandria.json" ] || { echo "uninstaller left owned grok hook" >&2; exit 1; }
[ -f "$CLEAN/.grok/skills/keep-me/SKILL.md" ] || { echo "uninstaller deleted foreign grok skill on clean install" >&2; exit 1; }
[ -f "$CLEAN/.grok/config.toml" ] || { echo "uninstaller deleted grok config.toml on clean install" >&2; exit 1; }

python3 -m unittest "$ROOT/factory/scripts/test_configure_grok.py"

echo "grok integration test passed"
