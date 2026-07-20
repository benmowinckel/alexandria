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
    CFG="$BASE/.imsg_config"
    if [ ! -f "$CFG" ] || ! grep -q '^IMSG_NUMBER=..*' "$CFG" 2>/dev/null; then
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
    fi ;;
  status)
    if [ -f "$BASE/.imsg_paused" ]; then echo "state: PAUSED"; else echo "state: ACTIVE"; fi
    if launchctl print gui/$UID_N/com.alexandria.imsg-daemon >/dev/null 2>&1; then echo "launchd: loaded"; else echo "launchd: NOT loaded"; fi
    echo "--- last 8 daemon-log lines ---"
    tail -8 "$BASE/.imsg_daemon_log" 2>/dev/null || echo "(no log yet)" ;;
  *)
    echo "usage: imsg_ctl.sh enable|on|off|status" ;;
esac
