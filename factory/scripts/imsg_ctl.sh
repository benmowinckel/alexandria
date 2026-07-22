#!/bin/bash
# imsg_ctl.sh enable|on|off|status — control the texting presence.
# enable = one-time setup (terminal auto-start hook + walk the two manual macOS grants + start loop).
# on/off toggle the soft pause (daemon idles but stays loaded); status shows state + recent log.
set -uo pipefail
BASE="$HOME/alexandria/system"
UID_N=$(id -u)
case "${1:-status}" in
  off)
    touch "$BASE/.imsg_paused"
    echo "PAUSED (soft — daemon idles, stays loaded)."
    echo "Hard off: launchctl bootout gui/$UID_N/com.alexandria.imsg-daemon" ;;
  on)
    rm -f "$BASE/.imsg_paused"
    echo "ACTIVE" ;;
  enable)
    # First-time setup. Idempotent — safe to re-run. macOS forbids scripting the FDA/Automation
    # grants (user consent only), so those are opened-to + instructed, never auto-clicked.
    #
    # 0. Self-fetch — setup.sh deliberately seeds NONE of the texting machinery
    # (opt-in add-on, 2026-07-22): fetch any missing piece here, at enable time,
    # through verify-fetch.sh so every file is checked against the offline-signed
    # manifest before it lands. Seed-if-missing — the Author's own edits survive.
    VF="$BASE/scripts/verify-fetch.sh"
    if [ ! -f "$VF" ]; then
      echo "✗ verify-fetch.sh missing ($VF) — re-run the install line first: curl -fsSL alexandria-library.com/a | bash"
      exit 1
    fi
    for _p in scripts/imsg_run.sh scripts/imsg_send.sh scripts/imsg_handle.sh scripts/agent_reply.sh \
              scripts/imsg_daemon.py scripts/capture_digest.py \
              tools/show.sh tools/remind.sh tools/note.sh tools/music.sh tools/scene.sh tools/README.md; do
      _dest="$BASE/$_p"
      [ -f "$_dest" ] && continue
      mkdir -p "$(dirname "$_dest")"
      if bash "$VF" "$_p" > "$_dest" 2>/dev/null && [ -s "$_dest" ]; then
        case "$_dest" in *.sh|*.py) chmod +x "$_dest" 2>/dev/null;; esac
      else
        rm -f "$_dest"
        echo "✗ Could not fetch+verify $_p — check network, then re-run: imsg_ctl.sh enable"
        exit 1
      fi
    done
    # digest fragment pool (empty-state texts) — seed-if-missing, dotfile dest
    if [ ! -f "$BASE/.digest_fragments.md" ]; then
      bash "$VF" scripts/digest_fragments.md > "$BASE/.digest_fragments.md" 2>/dev/null || rm -f "$BASE/.digest_fragments.md"
    fi
    CFG="$BASE/.imsg_config"
    if [ ! -f "$CFG" ]; then
      # Config template — no handles ship (never PII); the Author fills their own.
      cat > "$CFG" <<'IMSGCFG_END'
# Alexandria texting presence — self-handles (single source of truth; sourced by every imsg_* script).
# Set IMSG_NUMBER to your OWN iMessage number (the self-thread the presence reads). IMSG_EMAIL is an
# optional second self-handle (grey rendering). Then run:  bash ~/alexandria/system/scripts/imsg_ctl.sh enable
IMSG_NUMBER=
IMSG_EMAIL=
IMSGCFG_END
    fi
    if ! grep -q '^IMSG_NUMBER=..*' "$CFG" 2>/dev/null; then
      echo "✗ Set your self-handle first: put  IMSG_NUMBER=+1XXXXXXXXXX  (your iMessage number) in $CFG, then re-run."
      exit 1
    fi
    # 1. Terminal auto-start hook — the popup-free path (idempotent)
    ZRC="$HOME/.zshrc"
    if ! grep -q 'imsg_run.sh' "$ZRC" 2>/dev/null; then
      {
        echo ''
        echo '# Alexandria texting brain — auto-start on any interactive terminal (popup-free path)'
        echo 'if [[ $- == *i* ]] && ! pgrep -qf '"'"'imsg_daemon\.py'"'"' 2>/dev/null; then'
        echo '  bash "$HOME/alexandria/system/scripts/imsg_run.sh" >/dev/null 2>&1 &'
        echo 'fi'
      } >> "$ZRC"
      echo "✓ Added terminal auto-start hook to ~/.zshrc"
    else
      echo "✓ Terminal auto-start hook already present in ~/.zshrc"
    fi
    # 2. The two one-time macOS grants (user-consent only — I open the pane, you flip the toggle)
    echo ""
    echo "TWO one-time macOS grants — I'll open the pane, you flip the toggle:"
    echo "  a) Full Disk Access → enable  /usr/bin/python3   (read Messages' chat.db)"
    echo "  b) Automation → Messages → enable for your terminal + python3   (send replies)"
    open "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles" 2>/dev/null
    # 3. Verify read access; start the loop if grants are in
    echo ""
    if /usr/bin/python3 -c "import sqlite3,os; sqlite3.connect('file:'+os.path.expanduser('~/Library/Messages/chat.db')+'?mode=ro',uri=True).execute('select 1 from message limit 1')" 2>/dev/null; then
      echo "✓ chat.db readable — grants look good."
      if pgrep -qf 'imsg_daemon\.py' 2>/dev/null; then
        echo "✓ Texting brain already running. Text your own iMessage thread to talk to it."
      else
        bash "$BASE/scripts/imsg_run.sh" >/dev/null 2>&1 &
        echo "✓ Texting brain started. Text your own iMessage thread to talk to it."
      fi
    else
      echo "… chat.db not readable yet — finish grant (a), then re-run: imsg_ctl.sh enable"
    fi
    # 4. Proactive capture digest — the daily 5pm iMessage that pulls you back into a session
    #    (a2 § The Proactive Medium). Only outbound (Automation→Messages grant, no chat.db read
    #    needed), so install it regardless of the FDA check above. Idempotent.
    DIGEST_PLIST="$HOME/Library/LaunchAgents/com.alexandria.capture-digest.plist"
    mkdir -p "$HOME/Library/LaunchAgents" 2>/dev/null
    cat > "$DIGEST_PLIST" <<DIGEST_END
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.alexandria.capture-digest</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/python3</string>
    <string>$HOME/alexandria/system/scripts/capture_digest.py</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>17</integer><key>Minute</key><integer>0</integer></dict>
  <key>RunAtLoad</key><false/>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>$HOME/alexandria/system/.digest.launchd.out</string>
  <key>StandardErrorPath</key><string>$HOME/alexandria/system/.digest.launchd.err</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>HOME</key><string>$HOME</string>
  </dict>
</dict>
</plist>
DIGEST_END
    launchctl unload "$DIGEST_PLIST" 2>/dev/null
    launchctl load "$DIGEST_PLIST" 2>/dev/null
    echo "✓ Capture digest scheduled — 5pm local, iMessage (empty inbox → an accretion nugget)."
    echo "  OFF: launchctl unload $DIGEST_PLIST" ;;
  status)
    if [ -f "$BASE/.imsg_paused" ]; then echo "state: PAUSED"; else echo "state: ACTIVE"; fi
    if launchctl print gui/$UID_N/com.alexandria.imsg-daemon >/dev/null 2>&1; then echo "launchd: loaded"; else echo "launchd: NOT loaded"; fi
    echo "--- last 8 daemon-log lines ---"
    tail -8 "$BASE/.imsg_daemon_log" 2>/dev/null || echo "(no log yet)" ;;
  *)
    echo "usage: imsg_ctl.sh enable|on|off|status" ;;
esac
