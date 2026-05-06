#!/usr/bin/env bash
# Alexandria setup — creates ~/alexandria/ and connects to the protocol
# Usage: curl -fsSL https://raw.githubusercontent.com/mowinckelb/alexandria/main/factory/setup.sh | bash -s -- <API_KEY>
# NO set -e — every section must succeed or fail independently.

ALEX_DIR="$HOME/alexandria"
API_KEY="$1"
FACTORY_RAW="https://raw.githubusercontent.com/mowinckelb/alexandria/main/factory"
SERVER="https://api.mowinckel.ai"
FETCH_ERRORS=""

fetch_factory() {
  local rel="$1" dest="$2" label="$3" overwrite="${4:-no}"
  [ "$overwrite" != "yes" ] && [ -f "$dest" ] && return 0

  mkdir -p "$(dirname "$dest")" 2>/dev/null
  local tmp="${dest}.tmp.$$"
  if curl -fsS --retry 2 --retry-delay 1 --connect-timeout 5 --max-time 20 \
    "$FACTORY_RAW/$rel" -o "$tmp" 2>/dev/null && [ -s "$tmp" ]; then
    mv "$tmp" "$dest"
    return 0
  fi
  rm -f "$tmp"
  FETCH_ERRORS="${FETCH_ERRORS}${label} "
  return 1
}

if [ -z "$API_KEY" ]; then
  echo "Usage: bash setup.sh <API_KEY>"
  echo "Get your key at https://mowinckel.ai/signup"
  exit 1
fi

if [[ "$API_KEY" != alex_* ]]; then
  echo "Invalid API key format. Your key should start with alex_."
  echo "Get a fresh key at https://mowinckel.ai/signup"
  exit 1
fi

# ── Prerequisites ─────────────────────────────────────────────────

echo "Checking prerequisites..."
command -v git &>/dev/null && echo "  git: ok" || echo "  git: missing — install from https://git-scm.com (optional, enables backup)"
command -v node &>/dev/null && echo "  node: ok" || echo "  node: missing — install from https://nodejs.org (required for Claude Code)"
command -v python3 &>/dev/null && echo "  python3: ok" || echo "  python3: missing — install Python 3 (required for Cursor hooks)"
if command -v gh &>/dev/null; then
  gh auth status &>/dev/null 2>&1 && echo "  github cli: ok" || echo "  github cli: not logged in — run 'gh auth login' (optional, enables cloud backup)"
else
  echo "  github cli: not installed — https://cli.github.com (optional)"
fi
echo ""
echo "Setting up Alexandria..."

# ── 1. Directory structure ────────────────────────────────────────

mkdir -p "$ALEX_DIR/files/vault" "$ALEX_DIR/system/hooks" "$ALEX_DIR/files/constitution" "$ALEX_DIR/files/ontology" "$ALEX_DIR/files/library/public" "$ALEX_DIR/files/library/paid" "$ALEX_DIR/files/library/invite" "$ALEX_DIR/files/works/systems" "$ALEX_DIR/files/core" "$ALEX_DIR/files/vault/input" "$ALEX_DIR/system/.autoloop"
echo "$API_KEY" > "$ALEX_DIR/system/.api_key"
chmod 600 "$ALEX_DIR/system/.api_key"
touch "$ALEX_DIR/system/.last_processed"
date +%s > "$ALEX_DIR/system/.last_maintenance"

# ── 2. Factory files from GitHub ──────────────────────────────────

# Templates → files/ (don't overwrite existing)
# Core operating docs
for f in agent.md machine.md notepad.md feedback.md filter.md README.md; do
  fetch_factory "templates/core/$f" "$ALEX_DIR/files/core/$f" "core/$f"
done
# Folder READMEs (vault, constitution, ontology, library, works)
for d in vault constitution ontology library works; do
  fetch_factory "templates/$d/README.md" "$ALEX_DIR/files/$d/README.md" "$d/README.md"
done

# Hooks (always update)
mkdir -p "$ALEX_DIR/system/canon"
fetch_factory "hooks/shim.sh" "$ALEX_DIR/system/hooks/shim.sh" "hooks/shim.sh" yes
chmod +x "$ALEX_DIR/system/hooks/shim.sh"
fetch_factory "hooks/payload.sh" "$ALEX_DIR/system/.hooks_payload" "hooks/payload.sh" yes

# Canon (cache locally — one module)
fetch_factory "canon/methodology.md" "$ALEX_DIR/system/canon/methodology.md" "canon/methodology.md" yes

# Block (cache locally for easy access — system, not user content)
fetch_factory "block.md" "$ALEX_DIR/system/.block" "block.md" yes

# ── 3. Platform configuration ─────────────────────────────────────

# Claude Code — skill + hooks
if command -v node &>/dev/null && { [ -d "$HOME/.claude" ] || command -v claude &>/dev/null; }; then
  mkdir -p "$HOME/.claude/skills/alexandria" 2>/dev/null
  fetch_factory "skills/claudecode.md" "$HOME/.claude/skills/alexandria/SKILL.md" "skills/claudecode.md" yes

  mkdir -p "$HOME/.claude/scheduled-tasks/alexandria" 2>/dev/null
  # Bootstrap pattern: SKILL.md is a tiny stub that fetches scheduled.md on every
  # run. Same compounding architecture as hooks/shim.sh → payload.sh. Keeps the
  # frontmatter (which Claude Code reads locally for scheduling) stable while the
  # live instructions stay pinned to the current canonical playbook.
  fetch_factory "skills/scheduled-bootstrap.md" "$HOME/.claude/scheduled-tasks/alexandria/SKILL.md" "skills/scheduled-bootstrap.md" yes

  node -e "
    const fs = require('fs'), path = require('path');
    const f = path.join(process.env.HOME, '.claude', 'settings.json');
    let settings = {};
    try { settings = JSON.parse(fs.readFileSync(f, 'utf-8')); } catch {}
    if (!settings.hooks) settings.hooks = {};
    // Match any prior shim registration regardless of path form (~ vs \$HOME,
    // /system/hooks/shim vs /hooks/shim) — substring on 'alexandria' AND 'shim.sh'
    // de-dupes across naming variants so reinstalls replace rather than append.
    const filter = arr => (arr || []).filter(h => {
      const s = JSON.stringify(h).toLowerCase();
      return !(s.includes('alexandria') && s.includes('shim.sh'));
    });
    settings.hooks.SessionStart = filter(settings.hooks.SessionStart);
    settings.hooks.SessionStart.push({
      hooks: [{ type: 'command', command: 'bash \$HOME/alexandria/system/hooks/shim.sh session-start', timeout: 10 }]
    });
    settings.hooks.SessionEnd = filter(settings.hooks.SessionEnd);
    settings.hooks.SessionEnd.push({
      hooks: [{ type: 'command', command: 'bash \$HOME/alexandria/system/hooks/shim.sh session-end', timeout: 15 }]
    });
    settings.hooks.SubagentStart = filter(settings.hooks.SubagentStart);
    settings.hooks.SubagentStart.push({
      hooks: [{ type: 'command', command: 'bash \$HOME/alexandria/system/hooks/shim.sh subagent' }]
    });
    fs.writeFileSync(f, JSON.stringify(settings, null, 2));
  " 2>/dev/null
  echo "  Claude Code: configured"
fi

# Cursor
if [ -d "$HOME/.cursor" ] || command -v cursor &>/dev/null; then
  mkdir -p "$HOME/.cursor/hooks" 2>/dev/null
  mkdir -p "$HOME/.cursor/rules" 2>/dev/null
  fetch_factory "hooks/cursor/alexandria-session-start.py" "$HOME/.cursor/hooks/alexandria-session-start.py" "hooks/cursor/alexandria-session-start.py" yes
  fetch_factory "hooks/cursor/alexandria-session-end.py" "$HOME/.cursor/hooks/alexandria-session-end.py" "hooks/cursor/alexandria-session-end.py" yes
  fetch_factory "hooks/cursor/alexandria-stop.py" "$HOME/.cursor/hooks/alexandria-stop.py" "hooks/cursor/alexandria-stop.py" yes
  chmod +x "$HOME/.cursor/hooks/alexandria-session-start.py" "$HOME/.cursor/hooks/alexandria-session-end.py" "$HOME/.cursor/hooks/alexandria-stop.py" 2>/dev/null

  if command -v python3 &>/dev/null; then
    python3 - <<'PY' 2>/dev/null
import json
from pathlib import Path

path = Path.home() / ".cursor" / "hooks.json"
cfg = {}
try:
    cfg = json.loads(path.read_text(encoding="utf-8"))
except Exception:
    cfg = {}

if not isinstance(cfg, dict):
    cfg = {}

cfg["version"] = 1
hooks = cfg.get("hooks")
if not isinstance(hooks, dict):
    hooks = {}
cfg["hooks"] = hooks

def is_alex_hook(entry):
    if not isinstance(entry, dict):
        return False
    cmd = str(entry.get("command", "")).lower()
    return (
        "alexandria-session-start.py" in cmd
        or "alexandria-session-end.py" in cmd
        or "alexandria-stop.py" in cmd
    )

def clean(event):
    arr = hooks.get(event)
    if not isinstance(arr, list):
        return []
    return [item for item in arr if not is_alex_hook(item)]

hooks["sessionStart"] = clean("sessionStart") + [
    {"command": "./hooks/alexandria-session-start.py", "timeout": 8}
]
hooks["sessionEnd"] = clean("sessionEnd") + [
    {"command": "./hooks/alexandria-session-end.py", "timeout": 8}
]
hooks["stop"] = clean("stop") + [
    {"command": "./hooks/alexandria-stop.py", "timeout": 8, "loop_limit": None}
]

path.write_text(json.dumps(cfg, indent=2) + "\n", encoding="utf-8")
PY
  else
    echo "  Cursor: python3 missing — hook registration skipped"
  fi

  fetch_factory "skills/cursor.mdc" "$HOME/.cursor/rules/alexandria.mdc" "skills/cursor.mdc" yes
  echo "  Cursor: configured"
fi

# Codex
if [ -d "$HOME/.codex" ] || command -v codex &>/dev/null; then
  mkdir -p "$HOME/.codex" 2>/dev/null
  [ -f "$HOME/.codex/instructions.md" ] && {
    if [ "$(uname)" = "Darwin" ]; then
      sed -i '' '/^<!-- alexandria:start -->/,/^<!-- alexandria:end -->/d' "$HOME/.codex/instructions.md"
    else
      sed -i '/^<!-- alexandria:start -->/,/^<!-- alexandria:end -->/d' "$HOME/.codex/instructions.md"
    fi
  }
  codex_tmp="$ALEX_DIR/system/.codex_alexandria.tmp"
  if fetch_factory "skills/codex.md" "$codex_tmp" "skills/codex.md" yes; then
    cat "$codex_tmp" >> "$HOME/.codex/instructions.md"
    rm -f "$codex_tmp"
  fi
  echo "  Codex: configured"
fi

# ── 4. Git backup (nice to have) ─────────────────────────────────

if command -v git &>/dev/null; then
  (
    cd "$ALEX_DIR"
    if [ ! -d ".git" ]; then
      cat > .gitignore << 'GITIGNORE'
# Server-managed (regenerated)
system/canon/
system/hooks/
# Ephemeral state (all dotfiles + dotfolders in system/)
system/.*
# Library cache (server-fetched tier definitions)
files/library/
# Dev deps for scripts
**/node_modules/
**/package-lock.json
GITIGNORE
      git init -q
      git add -A
      git commit -q -m "alexandria: genesis" --no-gpg-sign
    fi
    if command -v gh &>/dev/null && gh auth status &>/dev/null; then
      gh repo create alexandria-private --private --source=. --push --yes 2>/dev/null || true
    fi
  ) &>/dev/null || true
fi

# ── 5. Public fork (where Author additions surface in the marketplace) ──
#
# Vault → private (alexandria-private, step 4 above).
# Machine additions → public (Author's fork of canonical alexandria).
#
# Author drops new skills/hooks/scripts in ~/alexandria-fork/factory/.
# An hourly launchd job pushes those to github.com/<their-handle>/alexandria.
# Their machine /calls each module when it uses it; the marketplace
# registers it from the github URL. Compounding loop: passive contribution
# without an explicit /publish step.
#
# Fail-soft: skips cleanly when gh isn't authenticated or the OS isn't
# macOS — the rest of setup is unaffected.

FORK_DIR="$HOME/alexandria-fork"
GITHUB_USER=""
if command -v gh &>/dev/null && gh auth status &>/dev/null 2>&1; then
  GITHUB_USER=$(gh api user --jq .login 2>/dev/null)
fi

if [ -z "$GITHUB_USER" ]; then
  echo "  public fork: skipped (gh CLI not authenticated — run 'gh auth login' and re-run setup)"
elif [ "$GITHUB_USER" = "mowinckelb" ]; then
  echo "  public fork: skipped (canonical owner — no self-fork needed)"
else
  if [ ! -d "$FORK_DIR/.git" ]; then
    # Idempotent: if the fork already exists on github, just clone it.
    if gh repo view "$GITHUB_USER/alexandria" &>/dev/null; then
      git clone --filter=blob:none --no-checkout "https://github.com/$GITHUB_USER/alexandria.git" "$FORK_DIR" 2>/dev/null
    else
      gh repo fork mowinckelb/alexandria --clone="$FORK_DIR" --remote=false 2>/dev/null
    fi

    if [ -d "$FORK_DIR/.git" ]; then
      # Sparse-checkout factory/ only — the rest of canonical (server, app)
      # is fork droppings the Author doesn't need locally.
      (cd "$FORK_DIR" && \
        git sparse-checkout init --cone 2>/dev/null && \
        git sparse-checkout set factory 2>/dev/null && \
        git checkout main 2>/dev/null) || true
      echo "  public fork: $FORK_DIR (additions to factory/ auto-publish to github.com/$GITHUB_USER/alexandria)"
    else
      echo "  public fork: clone/fork failed — check gh auth and re-run setup"
    fi
  fi

  # Auto-publish helper script (downloaded into the Author's local system/)
  mkdir -p "$ALEX_DIR/system/scripts" 2>/dev/null
  fetch_factory "scripts/publish-fork.sh" "$ALEX_DIR/system/scripts/publish-fork.sh" "scripts/publish-fork.sh" yes
  chmod +x "$ALEX_DIR/system/scripts/publish-fork.sh" 2>/dev/null

  # Hourly auto-publish via launchd (macOS only). Linux Authors can run the
  # script from cron themselves — `man 5 crontab`, suggested: `0 * * * *`.
  if [ -d "$FORK_DIR/.git" ] && [ -f "$ALEX_DIR/system/scripts/publish-fork.sh" ] && [ "$(uname)" = "Darwin" ]; then
    PLIST_DIR="$HOME/Library/LaunchAgents"
    PLIST="$PLIST_DIR/io.alexandria.publish.plist"
    mkdir -p "$PLIST_DIR" 2>/dev/null
    cat > "$PLIST" <<PLIST_END
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>io.alexandria.publish</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$ALEX_DIR/system/scripts/publish-fork.sh</string>
    <string>$FORK_DIR</string>
  </array>
  <key>StartInterval</key>
  <integer>3600</integer>
  <key>RunAtLoad</key>
  <false/>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/opt/homebrew/bin:/bin</string>
  </dict>
  <key>StandardOutPath</key>
  <string>$ALEX_DIR/system/.publish.log</string>
  <key>StandardErrorPath</key>
  <string>$ALEX_DIR/system/.publish.log</string>
</dict>
</plist>
PLIST_END
    launchctl unload "$PLIST" 2>/dev/null
    launchctl load "$PLIST" 2>/dev/null
    echo "  auto-publish: hourly via launchd"
  fi

  # Hourly auto-publish via cron (Linux only). Append a single line to the
  # Author's user crontab; idempotent (de-dupes by command path).
  if [ -d "$FORK_DIR/.git" ] && [ -f "$ALEX_DIR/system/scripts/publish-fork.sh" ] && [ "$(uname)" = "Linux" ] && command -v crontab &>/dev/null; then
    CRON_LINE="0 * * * * bash $ALEX_DIR/system/scripts/publish-fork.sh $FORK_DIR >> $ALEX_DIR/system/.publish.log 2>&1"
    EXISTING=$(crontab -l 2>/dev/null | grep -v "publish-fork.sh" || true)
    { [ -n "$EXISTING" ] && echo "$EXISTING"; echo "$CRON_LINE"; } | crontab - 2>/dev/null && \
      echo "  auto-publish: hourly via cron"
  fi

  # Skill auto-discovery — symlink any factory/skills/*.md the Author has in
  # their fork into ~/.claude/skills/<name>/SKILL.md so Claude Code finds them.
  # Skips names already installed (don't overwrite canonical/manual installs).
  # Idempotent: re-running setup picks up newly added fork skills.
  if [ -d "$FORK_DIR/factory/skills" ] && [ -d "$HOME/.claude/skills" ]; then
    LINKED=0
    for skill_file in "$FORK_DIR/factory/skills/"*.md; do
      [ -f "$skill_file" ] || continue
      base=$(basename "$skill_file" .md)
      target_dir="$HOME/.claude/skills/$base"
      target_file="$target_dir/SKILL.md"
      [ -e "$target_file" ] && continue
      mkdir -p "$target_dir" 2>/dev/null
      ln -sf "$skill_file" "$target_file" 2>/dev/null && LINKED=$((LINKED+1))
    done
    [ "$LINKED" -gt 0 ] && echo "  fork skills: $LINKED linked into ~/.claude/skills/"
  fi
fi

# ── 6. iCloud input pipe (macOS) ─────────────────────────────────
# iCloud holds Apple-native captures only (Shortcuts, Voice Memos, Files drops,
# future Apple Intelligence). Engine ingests on session start per canon.

ICLOUD_DIR="$HOME/Library/Mobile Documents/com~apple~CloudDocs"
if [ -d "$ICLOUD_DIR" ] && [ "$(uname)" = "Darwin" ]; then
  ICLOUD_INPUT="$ICLOUD_DIR/alexandria"
  mkdir -p "$ICLOUD_INPUT"
  if [ ! -L "$ALEX_DIR/files/vault/input" ]; then
    [ -d "$ALEX_DIR/files/vault/input" ] && rmdir "$ALEX_DIR/files/vault/input" 2>/dev/null
    ln -s "$ICLOUD_INPUT" "$ALEX_DIR/files/vault/input"
  fi
  echo "  iCloud: input pipe ready (~/alexandria/files/vault/input → iCloud/alexandria)"
fi

# ── Verify API key works ──────────────────────────────────────────

# Fail loudly if the key is wrong — silent failures at setup time
# mean every session start/end/call POSTs against a dead auth and we
# never find out until the Author wonders why nothing happened.
KEY_STATUS=""
if command -v curl &>/dev/null; then
  KEY_STATUS=$(curl -s -o /dev/null -w '%{http_code}' \
    -H "Authorization: Bearer $API_KEY" \
    --max-time 8 \
    "$SERVER/alexandria" 2>/dev/null || echo "000")
fi

# ── Done ──────────────────────────────────────────────────────────

touch "$ALEX_DIR/system/.setup_complete"

MISSING=""
[ ! -f "$ALEX_DIR/system/.api_key" ] && MISSING="$MISSING api_key"
[ ! -f "$ALEX_DIR/system/hooks/shim.sh" ] && MISSING="$MISSING hooks"
[ ! -f "$ALEX_DIR/system/canon/methodology.md" ] && MISSING="$MISSING canon"
[ ! -f "$ALEX_DIR/system/.hooks_payload" ] && MISSING="$MISSING hooks_payload"
[ ! -f "$ALEX_DIR/system/.block" ] && MISSING="$MISSING block"
for f in agent.md machine.md notepad.md feedback.md filter.md; do
  [ ! -f "$ALEX_DIR/files/core/$f" ] && MISSING="$MISSING $f"
done
for f in constitution/README.md ontology/README.md vault/README.md library/README.md works/README.md; do
  [ ! -f "$ALEX_DIR/files/$f" ] && MISSING="$MISSING $f"
done

# Install report — local first, then best-effort server feedback if auth works.
# This is deliberately non-fatal: partial installs still leave a useful local
# system, while unknown setup failures become visible to the Factory loop.
SETUP_STATUS="ok"
[ -n "$MISSING" ] && SETUP_STATUS="missing_files"
[ -n "$FETCH_ERRORS" ] && SETUP_STATUS="fetch_errors"
[ "$KEY_STATUS" = "401" ] && SETUP_STATUS="auth_rejected"
[ "$KEY_STATUS" = "000" ] && SETUP_STATUS="server_unreachable"

{
  echo "Alexandria setup report — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "status: $SETUP_STATUS"
  echo "key_status: ${KEY_STATUS:-not_checked}"
  [ -n "$FETCH_ERRORS" ] && echo "fetch_errors: $FETCH_ERRORS"
  [ -n "$MISSING" ] && echo "missing: $MISSING"
  echo "platforms:"
  if [ -d "$HOME/.claude" ] || command -v claude &>/dev/null; then echo "  claude: present"; else echo "  claude: absent"; fi
  if [ -d "$HOME/.cursor" ] || command -v cursor &>/dev/null; then echo "  cursor: present"; else echo "  cursor: absent"; fi
  if [ -d "$HOME/.codex" ] || command -v codex &>/dev/null; then echo "  codex: present"; else echo "  codex: absent"; fi
} > "$ALEX_DIR/system/.setup_report"

if [ "$KEY_STATUS" = "200" ] && command -v node &>/dev/null; then
  report_json=$(node -e "process.stdout.write(JSON.stringify(require('fs').readFileSync(process.argv[1],'utf8')))" "$ALEX_DIR/system/.setup_report" 2>/dev/null)
  if [ -n "$report_json" ]; then
    curl -sf --max-time 4 -X POST "$SERVER/feedback" \
      -H "Authorization: Bearer $API_KEY" \
      -H "Content-Type: application/json" \
      -d "{\"text\":$report_json,\"context\":\"setup\"}" -o /dev/null 2>/dev/null \
      || echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) setup report POST failed" >> "$ALEX_DIR/system/.alexandria_errors"
  fi
fi

if [ -n "$MISSING" ]; then
  echo ""
  echo "WARNING: missing:$MISSING — re-run to fix"
elif [ -n "$FETCH_ERRORS" ]; then
  echo ""
  echo "WARNING: factory fetches failed:$FETCH_ERRORS"
  echo "Some files may be stale from a previous install."
  echo "Re-run setup when network is stable to refresh all modules."
elif [ "$KEY_STATUS" = "401" ]; then
  echo ""
  echo "WARNING: API key rejected by server (401). Sign in again at"
  echo "  https://mowinckel.ai/signup"
  echo "to get a fresh key, then re-run the curl."
elif [ -n "$KEY_STATUS" ] && [ "$KEY_STATUS" != "200" ] && [ "$KEY_STATUS" != "000" ]; then
  echo ""
  echo "NOTE: server responded $KEY_STATUS — setup finished but check"
  echo "  https://api.mowinckel.ai/health"
  echo "Everything local works; the protocol may be degraded."
elif [ "$KEY_STATUS" = "000" ]; then
  echo ""
  echo "WARNING: could not reach the Alexandria server during setup."
  echo "Local files were installed, but the protocol connection is unverified."
  echo "Check https://api.mowinckel.ai/health, then re-run this setup command."
else
  echo ""
  echo "Alexandria installed. ~/alexandria/ — your mind, on your machine."
  echo ""
  echo "Open a new Claude Code or Cursor tab and paste the block."
  echo "If it's not in your clipboard: cat ~/alexandria/system/.block"
fi
