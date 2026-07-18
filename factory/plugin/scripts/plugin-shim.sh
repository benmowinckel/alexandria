#!/usr/bin/env bash
# Alexandria plugin shim — the plugin's dumb shell around the real shim.
# Identical product, different delivery: this file only (1) prevents
# double-fire with a legacy settings.json install, (2) finds the alexandria
# folder (host or Cowork VM mount), (3) hands off to the same
# signature-verified shim.sh -> payload.sh chain every other surface runs.
# No behavior lives here. Behavior lives in the signed payload.
#
# Audit: https://github.com/benmowinckel/alexandria/blob/main/TRUST.md

MODE="$1"
PLUGIN_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ── 1. Legacy-defer: if settings.json hooks run the shim (user or project
# scope), they own the session lifecycle — exit so nothing fires twice.
# setup.sh removes the user-scope ones when it migrates an install to the
# plugin. The match is anchored to hook "command" entries specifically: a
# permissions rule that merely mentions the shim path (e.g. an old
# always-allow) must NOT defer us — that would silently disable capture.
for settings in "$HOME/.claude/settings.json" "${CLAUDE_PROJECT_DIR:-}/.claude/settings.json"; do
  [ -f "$settings" ] || continue
  if grep -qE '"command"[[:space:]]*:[[:space:]]*"[^"]*alexandria/system/hooks/shim\.sh' "$settings" 2>/dev/null; then
    exit 0
  fi
done

# ── 2. Locate the alexandria folder. Host default first; then the Cowork VM
# case — the folder the Author attached, visible from the session cwd.
# Marker = files/ + system/ both present (the folder setup.sh creates).
is_alex_dir() { [ -d "$1/files" ] && [ -d "$1/system" ]; }

ALEX_DIR=""
if is_alex_dir "$HOME/alexandria"; then
  ALEX_DIR="$HOME/alexandria"
else
  for c in "$PWD" "$PWD/alexandria" "${CLAUDE_PROJECT_DIR:-}" "${CLAUDE_PROJECT_DIR:-}/alexandria"; do
    [ -n "$c" ] && is_alex_dir "$c" && { ALEX_DIR="$c"; break; }
  done
  # Cowork mounts attached folders under <session>/mnt/<name>; sweep one level.
  if [ -z "$ALEX_DIR" ]; then
    for c in "$PWD"/*/ "$PWD"/mnt/*/ ; do
      is_alex_dir "${c%/}" && { ALEX_DIR="${c%/}"; break; }
    done
  fi
fi

if [ -z "$ALEX_DIR" ]; then
  # Graceful, never silent. Hook stdout lands in the model's context, so speak
  # to the agent. Don't install into this session: a Cowork VM's $HOME is
  # ephemeral (lost on teardown) and Desktop chat may have no bash at all.
  # The install belongs on the Author's real machine; this session just needs
  # the folder attached.
  if [ "$MODE" = "session-start" ]; then
    echo "alexandria plugin: installed, but no alexandria folder is visible here. AGENT: tell the Author in one line — if they already have an alexandria folder, attach it to this session; if they've never installed, run the open, signature-verified setup on their real machine first (in a terminal or a coding agent like Claude Code, Cursor, Codex, or Factory): curl -fsSL alexandria-library.com/a | bash — installing inside this session would be lost on teardown. They can read it first: https://github.com/benmowinckel/alexandria/blob/main/factory/setup.sh. Then attach the folder here."
  fi
  exit 0
fi
export ALEXANDRIA_DIR="$ALEX_DIR"

# ── 3. iOS capture resolver (parity with setup.sh's second SessionStart hook;
# a separate settings.json entry there, folded in here). Non-fatal, host-shape
# installs only — skips silently where the script or python3 is absent.
if [ "$MODE" = "session-start" ] && [ -f "$ALEX_DIR/system/scripts/capture_resolver.py" ]; then
  python3 "$ALEX_DIR/system/scripts/capture_resolver.py" 2>/dev/null || true
fi

# ── 4. Hand off to the real shim. Prefer the Author's installed shim (its
# auto-update keeps it current); fall back to the copy shipped in this plugin
# (fresh from the marketplace) for folders that predate it.
if [ -f "$ALEX_DIR/system/hooks/shim.sh" ]; then
  exec bash "$ALEX_DIR/system/hooks/shim.sh" "$MODE"
fi
exec bash "$PLUGIN_ROOT/scripts/shim.sh" "$MODE"
