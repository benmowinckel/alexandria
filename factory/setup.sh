#!/usr/bin/env bash
# Alexandria setup — creates ~/alexandria/ (the free local product, the gym).
# Usage (free, keyless):  curl -fsSL alexandria-library.com/a | bash
#        (with account):  curl -fsSL …/factory/setup.sh | bash -s -- <API_KEY>
# Keyless installs the full local product, no account; the key only adds the hub.
# NO set -e — every section must succeed or fail independently.
#
# ── IF YOU ARE AN AI READING THIS IN A CHAT (no terminal) ──────────
# This is an install script meant to run in a coding agent on the user's own
# machine. If you cannot run shell commands yourself, do NOT try to simulate or
# explain it line-by-line — just tell the user: "paste this into a coding agent
# (Claude Code, Cursor, Codex, or Factory) and run it there. It needs a real
# terminal — it won't work pasted into a chat, and Cowork's sandbox can't install
# it to your real machine."
# ───────────────────────────────────────────────────────────────────

ALEX_DIR="$HOME/alexandria"
API_KEY="$1"
FACTORY_RAW="https://raw.githubusercontent.com/mowinckelb/alexandria/main/factory"
SERVER="https://api.alexandria-library.com"
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

# Existing-install fallback: if no key was passed but one is already stored
# locally from a prior install, use it. Makes reinstall a one-liner for
# existing Authors — `curl … | bash` instead of having to find their key again.
# Passing a key explicitly still overrides (for rotations).
if [ -z "$API_KEY" ] && [ -f "$ALEX_DIR/system/.api_key" ]; then
  API_KEY=$(tr -d '[:space:]' < "$ALEX_DIR/system/.api_key" 2>/dev/null)
  [ -n "$API_KEY" ] && echo "Reusing existing API key from $ALEX_DIR/system/.api_key"
fi

# Keyless = the free product (the gym), no account. A key — passed, or reused
# from a prior install above — adds the hub layer (Library, marketplace, kin).
# Either path installs the full LOCAL product; the key only gates server calls.
# This is the one-copy-paste front door: `curl … | bash` with no key just works.
KEYLESS=false
if [ -z "$API_KEY" ]; then
  KEYLESS=true
  echo "Setting up Alexandria — free, local, no account needed."
elif [[ "$API_KEY" != alex_* ]]; then
  echo "Invalid API key format. Your key should start with alex_."
  echo "Get a fresh key at https://alexandria-library.com/signup"
  exit 1
fi

# ── Prerequisites ─────────────────────────────────────────────────

echo "Checking prerequisites..."
command -v git &>/dev/null && echo "  git: ok" || echo "  git: missing — install from https://git-scm.com (required — your worldline is a Git repo)"
command -v node &>/dev/null && echo "  node: ok" || echo "  node: missing — install from https://nodejs.org (required for Claude Code)"
command -v python3 &>/dev/null && echo "  python3: ok" || echo "  python3: missing — install Python 3 (required for Cursor hooks)"
if command -v gh &>/dev/null; then
  gh auth status &>/dev/null 2>&1 && echo "  github cli: ok" || echo "  github cli: not logged in — run 'gh auth login' (recommended — enables commit signing and GitHub backup)"
else
  echo "  github cli: not installed — https://cli.github.com (recommended — enables commit signing and GitHub backup)"
fi
echo ""
echo "Setting up Alexandria..."

# ── 1. Directory structure ────────────────────────────────────────

mkdir -p "$ALEX_DIR/files/vault" "$ALEX_DIR/system/hooks" "$ALEX_DIR/files/constitution" "$ALEX_DIR/files/marginalia" "$ALEX_DIR/files/library/public" "$ALEX_DIR/files/library/paid" "$ALEX_DIR/files/library/invite" "$ALEX_DIR/files/library/authors" "$ALEX_DIR/files/works" "$ALEX_DIR/files/core" "$ALEX_DIR/files/vault/input" "$ALEX_DIR/files/vault/_input" "$ALEX_DIR/system/.autoloop"
# Keyless leaves no .api_key — its absence IS the "no account" signal the hooks
# read (every server call in payload.sh is guarded by [ -n "$API_KEY" ]).
if [ -n "$API_KEY" ]; then
  echo "$API_KEY" > "$ALEX_DIR/system/.api_key"
  chmod 600 "$ALEX_DIR/system/.api_key"
fi
touch "$ALEX_DIR/system/.last_processed"
date +%s > "$ALEX_DIR/system/.last_maintenance"

# ── 2. Factory files from GitHub ──────────────────────────────────

# Templates → files/ (don't overwrite existing)
# Core operating docs
for f in agent.md machine.md notepad.md feedback.md shelf.md; do
  fetch_factory "templates/core/$f" "$ALEX_DIR/files/core/$f" "core/$f"
done
# Filter — publishing policy, lives next to library/
fetch_factory "templates/library/filter.md" "$ALEX_DIR/files/library/filter.md" "library/filter.md"

# Hooks (always update)
mkdir -p "$ALEX_DIR/system/canon"
fetch_factory "hooks/shim.sh" "$ALEX_DIR/system/hooks/shim.sh" "hooks/shim.sh" yes
chmod +x "$ALEX_DIR/system/hooks/shim.sh"
fetch_factory "hooks/payload.sh" "$ALEX_DIR/system/.hooks_payload" "hooks/payload.sh" yes
fetch_factory "scripts/capture_resolver.py" "$ALEX_DIR/system/scripts/capture_resolver.py" "scripts/capture_resolver.py" yes

# Continuous-update module — present = on (default). Its contents ARE the
# explanation; deleting the file freezes updates (shim + payload both check it,
# so a delete = zero contact with Alexandria, fully local). Seed-if-missing so a
# deliberate deletion survives unless the Author re-runs setup.
if [ ! -f "$ALEX_DIR/system/hooks/auto-update" ]; then
  cat > "$ALEX_DIR/system/hooks/auto-update" <<'AUTOUPDATE_END'
Alexandria — continuous updates: ON

While this file exists, each session pulls the latest methodology from
Alexandria's public GitHub and verifies it against the maintainer's offline
signing key before running anything — nothing unsigned ever runs. The only
trust here is GitHub (hosting) + the maintainer (the one person who can sign).
Updates are surfaced as a notice; your local canon is never auto-overwritten.

DELETE THIS FILE to freeze: no fetch, no contact with Alexandria — you run
forever on your local copy in ~/alexandria/system/canon/. Fully sovereign.

Full mechanism: https://alexandria-library.com/mechanics
AUTOUPDATE_END
fi

# Allowed signers — the trust root for payload signature verification.
# Embedded here rather than fetched separately so the public key arrives in the
# same atomic install step as the shim that uses it. To rotate, replace the
# line below and ship a new setup.sh release.
# Fingerprint: SHA256:kAas5fUUnV/XcfKoH3Ysm7IZrqY2HcQSuhSaMoAMqnA
cat > "$ALEX_DIR/system/allowed_signers" <<'EOF'
alexandria-payload-signing ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHv5jBpDuEg2Nae7QrtNQ9ycclulY8+G4iZOjd2Kdw+9 alexandria-payload-signing
EOF
chmod 644 "$ALEX_DIR/system/allowed_signers"

# Canon — the full default, seeded at install (the Author's active adoption via
# `curl | bash`): Foundation (the universal core) + the Founder module (Author #1's
# system). Seed-if-missing only (no overwrite) — never clobber the Author's edits.
# After install the payload NEVER auto-writes canon; it only notifies of updates and
# the Author pulls (verified). So this install seed is the one automatic write, and
# it is the Author's own decision to run setup.
for module in foundation axioms methodology editor mercury publisher library filter bookshelf plm twin; do
  fetch_factory "canon/$module.md" "$ALEX_DIR/system/canon/$module.md" "canon/$module.md"
done
fetch_factory "canon/MODULES.md" "$ALEX_DIR/system/canon/MODULES.md" "canon/MODULES.md"

# Block (cache locally for easy access — system, not user content)
fetch_factory "block.md" "$ALEX_DIR/system/.block" "block.md" yes

# ── 3. Platform configuration ─────────────────────────────────────

# Claude Code — skill + hooks
if command -v node &>/dev/null && { [ -d "$HOME/.claude" ] || command -v claude &>/dev/null; }; then
  # Install the skill under BOTH names so /a and /alexandria both work (Claude Code
  # keys on the skill, by dir + frontmatter name). Same content; the alias's
  # frontmatter `name:` is rewritten to alexandria. Additive — if the rewrite ever
  # fails, /a still works, so no regression.
  mkdir -p "$HOME/.claude/skills/a" "$HOME/.claude/skills/alexandria" 2>/dev/null
  fetch_factory "skills/claudecode.md" "$HOME/.claude/skills/a/SKILL.md" "skills/claudecode.md" yes
  if fetch_factory "skills/claudecode.md" "$HOME/.claude/skills/alexandria/SKILL.md" "skills/claudecode.md (/alexandria alias)" yes; then
    if [ "$(uname)" = "Darwin" ]; then
      sed -i '' 's/^name: a$/name: alexandria/' "$HOME/.claude/skills/alexandria/SKILL.md" 2>/dev/null
    else
      sed -i 's/^name: a$/name: alexandria/' "$HOME/.claude/skills/alexandria/SKILL.md" 2>/dev/null
    fi
  fi

  mkdir -p "$HOME/.claude/scheduled-tasks/alexandria" 2>/dev/null
  # Bootstrap pattern: SKILL.md is a tiny stub that fetches scheduled.md on every
  # run. Same compounding architecture as hooks/shim.sh → payload.sh. Keeps the
  # frontmatter (which Claude Code reads locally for scheduling) stable while the
  # live instructions stay pinned to the current canonical playbook.
  fetch_factory "skills/scheduled-bootstrap.md" "$HOME/.claude/scheduled-tasks/alexandria/SKILL.md" "skills/scheduled-bootstrap.md" yes

  # Delivery: plugin first (marketplace-updated; also active in Claude Desktop /
  # Cowork), settings.json hooks as fallback for CLIs that predate plugin
  # support. Both shells hand off to the same signed shim -> payload chain —
  # identical product, one behavior source. The plugin defers to legacy hooks
  # when both are present, so this migration can never double-fire.
  ALEX_PLUGIN_OK=""
  if command -v claude &>/dev/null && claude plugin --help &>/dev/null 2>&1; then
    claude plugin marketplace add mowinckelb/alexandria >/dev/null 2>&1 || true
    if claude plugin install alexandria@alexandria --scope user >/dev/null 2>&1; then
      ALEX_PLUGIN_OK=1
    fi
  fi

  node -e "
    const fs = require('fs'), path = require('path');
    const f = path.join(process.env.HOME, '.claude', 'settings.json');
    const viaPlugin = process.argv[1] === 'plugin';
    let settings = {};
    try { settings = JSON.parse(fs.readFileSync(f, 'utf-8')); } catch {}
    if (!settings.hooks) settings.hooks = {};
    // Match any prior shim/resolver registration regardless of path form (~ vs
    // \$HOME, /system/hooks/shim vs /hooks/shim) — substring on 'alexandria' AND
    // the script name de-dupes across naming variants so reinstalls replace
    // rather than append. On the plugin path this filter IS the migration:
    // legacy entries are removed and nothing is re-added.
    const filter = arr => (arr || []).filter(h => {
      const s = JSON.stringify(h).toLowerCase();
      return !(s.includes('alexandria') && (s.includes('shim.sh') || s.includes('capture_resolver')));
    });
    settings.hooks.SessionStart = filter(settings.hooks.SessionStart);
    settings.hooks.SessionEnd = filter(settings.hooks.SessionEnd);
    settings.hooks.SubagentStart = filter(settings.hooks.SubagentStart);
    if (!viaPlugin) {
      settings.hooks.SessionStart.push({
        hooks: [{ type: 'command', command: 'bash \$HOME/alexandria/system/hooks/shim.sh session-start', timeout: 10 }]
      });
      settings.hooks.SessionStart.push({
        hooks: [{ type: 'command', command: 'python3 \$HOME/alexandria/system/scripts/capture_resolver.py 2>/dev/null || true', timeout: 10 }]
      });
      settings.hooks.SessionEnd.push({
        hooks: [{ type: 'command', command: 'bash \$HOME/alexandria/system/hooks/shim.sh session-end', timeout: 15 }]
      });
      settings.hooks.SubagentStart.push({
        hooks: [{ type: 'command', command: 'bash \$HOME/alexandria/system/hooks/shim.sh subagent' }]
      });
    }
    fs.writeFileSync(f, JSON.stringify(settings, null, 2));
  " ${ALEX_PLUGIN_OK:+plugin} 2>/dev/null
  if [ -n "$ALEX_PLUGIN_OK" ]; then
    echo "  Claude Code: configured (plugin — also active in Claude Desktop/Cowork)"
  else
    echo "  Claude Code: configured (settings hooks)"
  fi
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

# Factory (droid CLI)
if [ -d "$HOME/.factory" ] || command -v droid &>/dev/null; then
  mkdir -p "$HOME/.factory/droids" 2>/dev/null
  # Both names: invoke the `a` droid or the `alexandria` droid.
  fetch_factory "skills/droid.md" "$HOME/.factory/droids/a.md" "skills/droid.md" yes
  if fetch_factory "skills/droid.md" "$HOME/.factory/droids/alexandria.md" "skills/droid.md (alexandria alias)" yes; then
    if [ "$(uname)" = "Darwin" ]; then
      sed -i '' 's/^name: a$/name: alexandria/' "$HOME/.factory/droids/alexandria.md" 2>/dev/null
    else
      sed -i 's/^name: a$/name: alexandria/' "$HOME/.factory/droids/alexandria.md" 2>/dev/null
    fi
  fi
  echo "  Factory: configured"
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

# ── 4. Git substrate — your worldline as cryptographic ledger ─────
#
# ~/alexandria/ is initialised as a local Git repo. Every Constitution edit,
# marginalia drain, vault drop you preserve becomes a commit. Commits are
# signed with your own SSH key (registered with GitHub as a signing key);
# the repo IS the substrate format. Git is the protocol; GitHub is the
# default host. The signing config is repo-local — does NOT touch your
# global Git config or existing signing setup for other repos.
#
# Idempotent on re-run: signing config and key upload run unconditionally
# so existing installs gain signing on simple re-run of this setup script.

if command -v git &>/dev/null; then
  # git -C "$ALEX_DIR" runs git commands in that dir without cd'ing the parent shell.
  # Status echoes outside any silenced subshell so the user sees them.

  if [ ! -d "$ALEX_DIR/.git" ]; then
    cat > "$ALEX_DIR/.gitignore" << 'GITIGNORE'
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
    git -C "$ALEX_DIR" init -q 2>/dev/null || true
  fi

  # Detect an existing SSH public key (any type — works for ed25519, rsa, ecdsa).
  # No hard-coded path list — ls *.pub, take the first one.
  SSH_PUBKEY=""
  for pubkey in "$HOME"/.ssh/*.pub; do
    [ -f "$pubkey" ] && SSH_PUBKEY="$pubkey" && break
  done

  SIGNING_OK=""
  SIGNING_REASON=""
  KEY_REGISTERED=""
  if [ -z "$SSH_PUBKEY" ]; then
    SIGNING_REASON="no SSH key at ~/.ssh/*.pub — run 'ssh-keygen -t ed25519' then re-run setup"
  elif ! command -v gh &>/dev/null || ! gh auth status &>/dev/null 2>&1; then
    SIGNING_REASON="gh CLI not authenticated — run 'gh auth login' then re-run setup"
  else
    # Try to register this machine's SSH key as a GitHub signing key.
    # Exit 0 = newly registered. Non-zero output containing "already" =
    # duplicate (was already registered — also success from our POV).
    # Non-zero with scope mention = gh CLI auth missing
    # admin:ssh_signing_key scope (independent from Alexandria's OAuth
    # scope; gh CLI has its own token). Fall through to local-signing-only
    # and tell the user how to fix.
    KEY_ADD_OUT="$(gh ssh-key add "$SSH_PUBKEY" --type signing \
      --title "Alexandria ($(hostname -s 2>/dev/null || echo machine))" 2>&1)"
    if [ $? -eq 0 ] || echo "$KEY_ADD_OUT" | grep -qi "already"; then
      KEY_REGISTERED=1
    fi

    # Configure Git for SSH signing — REPO-LOCAL. No --global.
    # User's other repos (work GPG, etc.) are untouched.
    # Local signing works regardless of whether GitHub knows the key —
    # `git verify-commit` against allowed_signers is fully local.
    git -C "$ALEX_DIR" config gpg.format ssh 2>/dev/null
    git -C "$ALEX_DIR" config user.signingkey "$SSH_PUBKEY" 2>/dev/null
    git -C "$ALEX_DIR" config commit.gpgsign true 2>/dev/null

    # allowed_signers for local `git verify-commit` / `git log --show-signature`.
    # Standard git location. Append idempotently.
    mkdir -p "$HOME/.config/git" 2>/dev/null
    ALLOWED="$HOME/.config/git/allowed_signers"
    touch "$ALLOWED" 2>/dev/null
    SIGN_EMAIL="$(gh api user --jq .email 2>/dev/null)"
    if [ -z "$SIGN_EMAIL" ] || [ "$SIGN_EMAIL" = "null" ]; then
      SIGN_LOGIN="$(gh api user --jq .login 2>/dev/null)"
      SIGN_EMAIL="${SIGN_LOGIN}@users.noreply.github.com"
    fi
    PUBKEY_CONTENTS="$(cat "$SSH_PUBKEY" 2>/dev/null)"
    ENTRY="$SIGN_EMAIL $PUBKEY_CONTENTS"
    grep -qxF "$ENTRY" "$ALLOWED" 2>/dev/null || echo "$ENTRY" >> "$ALLOWED"
    git -C "$ALEX_DIR" config gpg.ssh.allowedSignersFile "$ALLOWED" 2>/dev/null

    SIGNING_OK=1
  fi

  # Genesis commit — signed if signing was configured, unsigned otherwise.
  # Soft fallback throughout.
  if [ -z "$(git -C "$ALEX_DIR" log -1 --format=%H 2>/dev/null)" ]; then
    git -C "$ALEX_DIR" add -A 2>/dev/null
    if [ -n "$SIGNING_OK" ]; then
      git -C "$ALEX_DIR" commit -q -m "alexandria: genesis" 2>/dev/null \
        || git -C "$ALEX_DIR" commit -q -m "alexandria: genesis" --no-gpg-sign 2>/dev/null
    else
      git -C "$ALEX_DIR" commit -q -m "alexandria: genesis" --no-gpg-sign 2>/dev/null
    fi
  fi

  if command -v gh &>/dev/null && gh auth status &>/dev/null 2>&1; then
    gh repo create alexandria-private --private --source="$ALEX_DIR" --push --yes &>/dev/null || true
  fi

  if [ -n "$KEY_REGISTERED" ]; then
    echo "  signing: enabled (commits signed with $(basename "$SSH_PUBKEY"); GitHub verified badge active)"
  elif [ -n "$SIGNING_OK" ]; then
    echo "  signing: enabled locally (commits signed; verifiable via 'git verify-commit'). GitHub verified badge not yet active — register $SSH_PUBKEY at https://github.com/settings/ssh/new?type=signing OR run 'gh auth refresh -s admin:ssh_signing_key' and re-run setup"
  else
    echo "  signing: skipped ($SIGNING_REASON)"
  fi
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

if [ "$KEYLESS" = "true" ]; then
  echo "  public fork: skipped (free mode — the marketplace is part of the hub; sign in later)"
elif [ -z "$GITHUB_USER" ]; then
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

# ── 6b. iCloud full backup mirror (macOS) ────────────────────────
# Beyond the input pipe above: a daily, secret-free, .git-free mirror of the
# whole vault + canon to iCloud — parallel to the hourly GitHub push, so the
# Author's mind is backed up in two independent places (Apple + GitHub).
# Secrets live in ~/alexandria/system/ (never under files/), so files/ is safe
# to mirror wholesale. Writes to a `files` subdir so it can't collide with any
# other alexandria-backup layout.
if [ -d "$ICLOUD_DIR" ] && [ "$(uname)" = "Darwin" ] && command -v rsync &>/dev/null; then
  ICLOUD_BACKUP="$ICLOUD_DIR/alexandria-backup/files"
  mkdir -p "$ICLOUD_BACKUP" 2>/dev/null
  # Mirror once now so the backup exists immediately, not only after first fire.
  rsync -a --delete --exclude '.git/' --exclude '.DS_Store' \
    "$ALEX_DIR/files/" "$ICLOUD_BACKUP/" 2>/dev/null
  BPLIST="$HOME/Library/LaunchAgents/io.alexandria.icloud-backup.plist"
  mkdir -p "$HOME/Library/LaunchAgents" 2>/dev/null
  cat > "$BPLIST" <<BPLIST_END
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>io.alexandria.icloud-backup</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/rsync</string>
    <string>-a</string>
    <string>--delete</string>
    <string>--exclude</string>
    <string>.git/</string>
    <string>--exclude</string>
    <string>.DS_Store</string>
    <string>$ALEX_DIR/files/</string>
    <string>$ICLOUD_BACKUP/</string>
  </array>
  <key>StartInterval</key>
  <integer>86400</integer>
  <key>RunAtLoad</key>
  <false/>
  <key>StandardErrorPath</key>
  <string>$ALEX_DIR/system/.icloud-backup.log</string>
</dict>
</plist>
BPLIST_END
  launchctl unload "$BPLIST" 2>/dev/null
  launchctl load "$BPLIST" 2>/dev/null
  echo "  iCloud: full backup mirror ready (daily → iCloud/alexandria-backup/files)"
fi

# ── Verify API key works ──────────────────────────────────────────

# Fail loudly if the key is wrong — silent failures at setup time
# mean every session start/end/call POSTs against a dead auth and we
# never find out until the Author wonders why nothing happened.
KEY_STATUS=""
if [ "$KEYLESS" = "true" ]; then
  KEY_STATUS="none"          # free mode — no key to verify, no server contacted
elif command -v curl &>/dev/null; then
  KEY_STATUS=$(curl -s -o /dev/null -w '%{http_code}' \
    -H "Authorization: Bearer $API_KEY" \
    --max-time 8 \
    "$SERVER/alexandria" 2>/dev/null || echo "000")
fi

# ── Done ──────────────────────────────────────────────────────────

touch "$ALEX_DIR/system/.setup_complete"

# ── Functional probes ─────────────────────────────────────────────
# Each subsystem is verified by exercising it (write-test, syntax-check,
# resolved symlink, loaded launchd job) rather than just checking file
# presence. Idempotent — re-running setup re-runs every probe and
# refreshes the matrix.

# files: directory structure + write-test
WRITE_TEST="$ALEX_DIR/system/.write_test.$$"
if [ -d "$ALEX_DIR/files" ] && [ -d "$ALEX_DIR/system" ] && \
   echo "ok" > "$WRITE_TEST" 2>/dev/null && [ -f "$WRITE_TEST" ]; then
  rm -f "$WRITE_TEST"
  STATUS_FILES="ok"; DETAIL_FILES="$ALEX_DIR/ writable"
else
  rm -f "$WRITE_TEST" 2>/dev/null
  STATUS_FILES="fail"; DETAIL_FILES="$ALEX_DIR/ not writable — check permissions and re-run"
fi

# canon: Foundation core + founder module #1 present and non-empty
if [ -s "$ALEX_DIR/system/canon/foundation.md" ] && [ -s "$ALEX_DIR/system/canon/methodology.md" ]; then
  F_BYTES=$(wc -c < "$ALEX_DIR/system/canon/foundation.md" | tr -d ' ')
  M_BYTES=$(wc -c < "$ALEX_DIR/system/canon/methodology.md" | tr -d ' ')
  STATUS_CANON="ok"; DETAIL_CANON="foundation.md (${F_BYTES}b) + methodology.md (${M_BYTES}b)"
else
  STATUS_CANON="fail"; DETAIL_CANON="foundation.md/methodology.md missing — re-run setup (network?)"
fi

# hooks: executable shim that parses + non-empty payload
if [ -x "$ALEX_DIR/system/hooks/shim.sh" ] && \
   bash -n "$ALEX_DIR/system/hooks/shim.sh" 2>/dev/null && \
   [ -s "$ALEX_DIR/system/.hooks_payload" ]; then
  STATUS_HOOKS="ok"; DETAIL_HOOKS="loads your context + captures, every session"
else
  STATUS_HOOKS="fail"; DETAIL_HOOKS="hooks not installed — re-run setup"
fi

# core templates: agent.md / machine.md / notepad.md / feedback.md / shelf.md
CORE_MISSING=""
for f in agent.md machine.md notepad.md feedback.md shelf.md; do
  [ ! -f "$ALEX_DIR/files/core/$f" ] && CORE_MISSING="$CORE_MISSING $f"
done
if [ -z "$CORE_MISSING" ]; then
  STATUS_CORE="ok"; DETAIL_CORE="agent + machine + notepad + feedback + shelf"
else
  STATUS_CORE="fail"; DETAIL_CORE="missing:${CORE_MISSING} — re-run setup"
fi

# api key: HTTP probe (already done above)
case "$KEY_STATUS" in
  none) STATUS_KEY="skip"; DETAIL_KEY="none — running free; sign in later to join the Library" ;;
  200) STATUS_KEY="ok"; DETAIL_KEY="verified (HTTP 200)" ;;
  401) STATUS_KEY="fail"; DETAIL_KEY="rejected — get a fresh key at https://alexandria-library.com/signup" ;;
  000|"") STATUS_KEY="fail"; DETAIL_KEY="server unreachable — check https://api.alexandria-library.com/health" ;;
  *) STATUS_KEY="fail"; DETAIL_KEY="server returned HTTP $KEY_STATUS — protocol may be degraded" ;;
esac

# Coding agents: only show rows for ones the user has installed.
# Functional probe = the config file the agent reads at startup actually
# contains the Alexandria entry, not just that the agent's dir exists.

CLAUDE_DETECTED="no"
if [ -d "$HOME/.claude" ] || command -v claude &>/dev/null; then
  CLAUDE_DETECTED="yes"
  # Two valid states: plugin delivery (preferred — also covers Claude
  # Desktop/Cowork) or legacy settings.json hooks (older CLIs).
  if [ -n "${ALEX_PLUGIN_OK:-}" ] && [ -f "$HOME/.claude/skills/alexandria/SKILL.md" ]; then
    STATUS_CLAUDE="ok"; DETAIL_CLAUDE="/a + /alexandria skill + plugin (Claude Code/Desktop/Cowork)"
  elif [ -f "$HOME/.claude/settings.json" ] && \
     grep -q "alexandria/system/hooks/shim.sh" "$HOME/.claude/settings.json" 2>/dev/null && \
     [ -f "$HOME/.claude/skills/alexandria/SKILL.md" ]; then
    STATUS_CLAUDE="ok"; DETAIL_CLAUDE="/a + /alexandria skill + session hooks wired"
  else
    STATUS_CLAUDE="fail"; DETAIL_CLAUDE="Claude Code detected but not configured — re-run setup"
  fi
fi

CURSOR_DETECTED="no"
if [ -d "$HOME/.cursor" ] || command -v cursor &>/dev/null; then
  CURSOR_DETECTED="yes"
  if [ -f "$HOME/.cursor/hooks.json" ] && \
     grep -q "alexandria-session-start" "$HOME/.cursor/hooks.json" 2>/dev/null && \
     [ -f "$HOME/.cursor/rules/alexandria.mdc" ]; then
    STATUS_CURSOR="ok"; DETAIL_CURSOR="hooks + rules registered"
  else
    STATUS_CURSOR="fail"; DETAIL_CURSOR="Cursor detected but not configured — re-run setup"
  fi
fi

CODEX_DETECTED="no"
if [ -d "$HOME/.codex" ] || command -v codex &>/dev/null; then
  CODEX_DETECTED="yes"
  if [ -f "$HOME/.codex/instructions.md" ] && \
     grep -q "alexandria:start" "$HOME/.codex/instructions.md" 2>/dev/null; then
    STATUS_CODEX="ok"; DETAIL_CODEX="instructions appended"
  else
    STATUS_CODEX="fail"; DETAIL_CODEX="Codex detected but not configured — re-run setup"
  fi
fi

FACTORY_DETECTED="no"
if [ -d "$HOME/.factory" ] || command -v droid &>/dev/null; then
  FACTORY_DETECTED="yes"
  if [ -f "$HOME/.factory/droids/a.md" ]; then
    STATUS_FACTORY="ok"; DETAIL_FACTORY="droid skill installed"
  else
    STATUS_FACTORY="fail"; DETAIL_FACTORY="Factory detected but skill not installed — re-run setup"
  fi
fi

# private repo: alexandria-private remote configured + gh authenticated
if [ -d "$ALEX_DIR/.git" ]; then
  if command -v gh &>/dev/null && gh auth status &>/dev/null 2>&1; then
    REPO_URL=$(cd "$ALEX_DIR" && git remote get-url origin 2>/dev/null)
    if [ -n "$REPO_URL" ] && echo "$REPO_URL" | grep -q "alexandria-private"; then
      STATUS_REPO="ok"; DETAIL_REPO="$REPO_URL"
    else
      STATUS_REPO="fail"; DETAIL_REPO="local git ok but no GitHub remote — re-run setup"
    fi
  else
    STATUS_REPO="skip"; DETAIL_REPO="local git only — install gh CLI for cloud backup (https://cli.github.com)"
  fi
elif command -v git &>/dev/null; then
  STATUS_REPO="fail"; DETAIL_REPO="git installed but repo not initialized — re-run setup"
else
  STATUS_REPO="skip"; DETAIL_REPO="git not installed — install git for backup (https://git-scm.com)"
fi

# public fork: ~/alexandria-fork exists + auto-publish job loaded
if [ "$KEYLESS" = "true" ]; then
  STATUS_FORK="skip"; DETAIL_FORK="free mode — marketplace is part of the hub (sign in later)"
elif [ -d "$FORK_DIR/.git" ]; then
  AUTO_PUBLISH=""
  if [ "$(uname)" = "Darwin" ] && launchctl list 2>/dev/null | grep -q "io.alexandria.publish"; then
    AUTO_PUBLISH="auto-publish hourly (launchd)"
  elif [ "$(uname)" = "Linux" ] && command -v crontab &>/dev/null && crontab -l 2>/dev/null | grep -q "publish-fork.sh"; then
    AUTO_PUBLISH="auto-publish hourly (cron)"
  fi
  if [ -n "$AUTO_PUBLISH" ]; then
    STATUS_FORK="ok"; DETAIL_FORK="$FORK_DIR — $AUTO_PUBLISH"
  else
    STATUS_FORK="fail"; DETAIL_FORK="$FORK_DIR exists but auto-publish not scheduled — re-run setup"
  fi
elif [ "$GITHUB_USER" = "mowinckelb" ]; then
  STATUS_FORK="skip"; DETAIL_FORK="canonical owner — no self-fork needed"
elif [ -z "$GITHUB_USER" ]; then
  STATUS_FORK="skip"; DETAIL_FORK="gh CLI not authenticated — run 'gh auth login' and re-run setup"
else
  STATUS_FORK="fail"; DETAIL_FORK="fork not created for $GITHUB_USER — re-run setup"
fi

# iCloud input pipe: macOS-only; symlink resolves to a real iCloud dir
ICLOUD_APPLICABLE="no"
if [ "$(uname)" = "Darwin" ]; then
  ICLOUD_APPLICABLE="yes"
  ICLOUD_TARGET="$HOME/Library/Mobile Documents/com~apple~CloudDocs"
  if [ -L "$ALEX_DIR/files/vault/input" ] && [ -d "$ALEX_DIR/files/vault/input/" ]; then
    STATUS_ICLOUD="ok"; DETAIL_ICLOUD="input pipe → iCloud/alexandria"
  elif [ -d "$ICLOUD_TARGET" ]; then
    STATUS_ICLOUD="fail"; DETAIL_ICLOUD="iCloud detected but pipe not linked — re-run setup"
  else
    STATUS_ICLOUD="skip"; DETAIL_ICLOUD="iCloud Drive not enabled — sign in via System Settings"
  fi
fi

# ── Setup report (server-side feedback) ──────────────────────────
# Preserves the original status / key_status / fetch_errors / missing /
# platforms keys for backward compat with the /feedback handler. Adds a
# subsystems block that the factory can drain for cross-Author install
# health signal.

MISSING=""
[ "$STATUS_FILES" != "ok" ] && MISSING="$MISSING files"
[ "$STATUS_CANON" != "ok" ] && MISSING="$MISSING canon"
[ "$STATUS_HOOKS" != "ok" ] && MISSING="$MISSING hooks"
[ "$STATUS_CORE" != "ok" ] && MISSING="$MISSING${CORE_MISSING}"
[ ! -f "$ALEX_DIR/system/.block" ] && MISSING="$MISSING block"
[ ! -f "$ALEX_DIR/files/library/filter.md" ] && MISSING="$MISSING library/filter.md"

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
  [ -n "$MISSING" ] && echo "missing:$MISSING"
  echo "platforms:"
  if [ -d "$HOME/.claude" ] || command -v claude &>/dev/null; then echo "  claude: present"; else echo "  claude: absent"; fi
  if [ -d "$HOME/.cursor" ] || command -v cursor &>/dev/null; then echo "  cursor: present"; else echo "  cursor: absent"; fi
  if [ -d "$HOME/.factory" ] || command -v droid &>/dev/null; then echo "  factory: present"; else echo "  factory: absent"; fi
  if [ -d "$HOME/.codex" ] || command -v codex &>/dev/null; then echo "  codex: present"; else echo "  codex: absent"; fi
  echo "subsystems:"
  echo "  files: $STATUS_FILES"
  echo "  canon: $STATUS_CANON"
  echo "  hooks: $STATUS_HOOKS"
  echo "  core: $STATUS_CORE"
  echo "  api_key: $STATUS_KEY"
  [ "$CLAUDE_DETECTED" = "yes" ] && echo "  claude_skill: $STATUS_CLAUDE"
  [ "$CURSOR_DETECTED" = "yes" ] && echo "  cursor_skill: $STATUS_CURSOR"
  [ "$CODEX_DETECTED" = "yes" ] && echo "  codex_skill: $STATUS_CODEX"
  [ "$FACTORY_DETECTED" = "yes" ] && echo "  factory_skill: $STATUS_FACTORY"
  echo "  private_repo: $STATUS_REPO"
  echo "  public_fork: $STATUS_FORK"
  [ "$ICLOUD_APPLICABLE" = "yes" ] && echo "  icloud: $STATUS_ICLOUD"
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

# ── Status matrix (terminal output) ──────────────────────────────
# At-a-glance: every subsystem the installer attempted, with one-line
# remediation for any gap. Visible to both the user and anyone watching
# the install. Re-running setup re-prints the matrix with current state.

icon_for() {
  case "$1" in
    ok) printf "✓" ;;
    fail) printf "✗" ;;
    skip) printf "·" ;;
    *) printf "?" ;;
  esac
}

emit_row() {
  printf "  %s %-15s %s\n" "$(icon_for "$1")" "$2" "$3"
}

TOTAL_OK=0
TOTAL_FAIL=0
TOTAL_SKIP=0

count_status() {
  case "$1" in
    ok) TOTAL_OK=$((TOTAL_OK+1)) ;;
    fail) TOTAL_FAIL=$((TOTAL_FAIL+1)) ;;
    skip) TOTAL_SKIP=$((TOTAL_SKIP+1)) ;;
  esac
}

count_status "$STATUS_FILES"
count_status "$STATUS_CANON"
count_status "$STATUS_HOOKS"
count_status "$STATUS_CORE"
count_status "$STATUS_KEY"
[ "$CLAUDE_DETECTED" = "yes" ] && count_status "$STATUS_CLAUDE"
[ "$CURSOR_DETECTED" = "yes" ] && count_status "$STATUS_CURSOR"
[ "$CODEX_DETECTED" = "yes" ] && count_status "$STATUS_CODEX"
[ "$FACTORY_DETECTED" = "yes" ] && count_status "$STATUS_FACTORY"
count_status "$STATUS_REPO"
count_status "$STATUS_FORK"
[ "$ICLOUD_APPLICABLE" = "yes" ] && count_status "$STATUS_ICLOUD"

echo ""
if [ "$TOTAL_FAIL" -gt 0 ]; then
  echo "Alexandria install complete with gaps. ${TOTAL_OK} ok · ${TOTAL_FAIL} failed · ${TOTAL_SKIP} skipped"
else
  echo "Alexandria installed. ${TOTAL_OK} ok · ${TOTAL_SKIP} skipped"
fi
echo ""

emit_row "$STATUS_FILES" "files" "$DETAIL_FILES"
emit_row "$STATUS_CANON" "canon" "$DETAIL_CANON"
emit_row "$STATUS_HOOKS" "hooks" "$DETAIL_HOOKS"
emit_row "$STATUS_CORE" "core templates" "$DETAIL_CORE"
emit_row "$STATUS_KEY" "account" "$DETAIL_KEY"
[ "$CLAUDE_DETECTED" = "yes" ] && emit_row "$STATUS_CLAUDE" "Claude Code" "$DETAIL_CLAUDE"
[ "$CURSOR_DETECTED" = "yes" ] && emit_row "$STATUS_CURSOR" "Cursor" "$DETAIL_CURSOR"
[ "$CODEX_DETECTED" = "yes" ] && emit_row "$STATUS_CODEX" "Codex" "$DETAIL_CODEX"
[ "$FACTORY_DETECTED" = "yes" ] && emit_row "$STATUS_FACTORY" "Factory" "$DETAIL_FACTORY"
emit_row "$STATUS_REPO" "private repo" "$DETAIL_REPO"
emit_row "$STATUS_FORK" "public fork" "$DETAIL_FORK"
[ "$ICLOUD_APPLICABLE" = "yes" ] && emit_row "$STATUS_ICLOUD" "iCloud" "$DETAIL_ICLOUD"

echo ""
# Core health gate. files/canon/hooks/core are the must-haves; the rest (repo,
# fork, iCloud, account) degrade gracefully and are fine to skip. If a CORE piece
# didn't land the install didn't really land — say so plainly and stop the agent,
# rather than handing a half-built base to the block (the one real disaster).
CORE_OK=true
for s in "$STATUS_FILES" "$STATUS_CANON" "$STATUS_HOOKS" "$STATUS_CORE"; do
  [ "$s" = "ok" ] || CORE_OK=false
done

if [ "$CORE_OK" != "true" ]; then
  echo "Install incomplete — a core piece didn't land (see the ✗ rows above)."
  echo "Re-run the one line; it's safe and never overwrites your files:"
  if [ "$KEYLESS" = "true" ]; then
    echo "  curl -fsSL alexandria-library.com/a | bash"
  else
    echo "  curl -fsSL alexandria-library.com/a | bash -s -- \$API_KEY"
  fi
  echo ""
  echo "AGENT: core install failed — do NOT read the block, start setup, or draft anything."
  echo "Tell the Author which row above is ✗ and to re-run the line above; then stop."
elif [ "$CLAUDE_DETECTED" != "yes" ] && [ "$CURSOR_DETECTED" != "yes" ] && [ "$CODEX_DETECTED" != "yes" ] && [ "$FACTORY_DETECTED" != "yes" ]; then
  # Core landed but no coding agent here to run the hooks / the block. Almost
  # always means this was pasted into the wrong place — a chat, or Cowork's
  # sandbox. The files exist, but the automatic layer needs a real coding agent.
  echo "Files installed — but no coding agent was found here to run Alexandria."
  echo ""
  echo "This needs a real terminal in a coding agent. Open one of these and paste"
  echo "the same one line there:  Claude Code · Cursor · Codex · Factory."
  echo "(In a chat or Cowork's sandbox it can't wire in or persist to your machine.)"
elif [ "$KEYLESS" = "true" ] || [ "$STATUS_KEY" = "ok" ]; then
  echo "Installed — your agent takes it from here. Nothing else to copy or click."
  echo ""
  echo "AGENT: read ~/alexandria/system/.block now and follow it end-to-end. Tell them"
  echo "you're starting and they can step away, then begin — don't wait to be asked."
  echo "(Author: if it doesn't start on its own, just say \"begin\".)"
  if [ "$KEYLESS" = "true" ]; then
    echo ""
    echo "The tool is yours: free, local, no account, never sent to us (any backup goes only"
    echo "to your own GitHub + iCloud). After it drafts your starter mind it'll show you how to"
    echo "join the collective at alexandria-library.com/join — the library, the people, being seen"
    echo "(first month free, or free with 3 friends). The tool stays free either way."
  fi
else
  echo "Re-run anytime: curl -fsSL https://raw.githubusercontent.com/mowinckelb/alexandria/main/factory/setup.sh | bash -s -- \$API_KEY"
fi
