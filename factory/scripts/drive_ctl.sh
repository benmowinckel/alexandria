#!/bin/bash
# drive_ctl.sh — enable, inspect, or stop the full Author's Drive pocket copy.

set -u

ALEX_DIR="${ALEXANDRIA_DIR:-$HOME/alexandria}"
SCRIPTS="$HOME/.local/share/alexandria/scripts"
VERIFY_FETCH="$SCRIPTS/verify-fetch.sh"
SYNC="$SCRIPTS/drive_sync.sh"
START="$ALEX_DIR/system/.drive-start.md"
PLIST="$HOME/Library/LaunchAgents/io.alexandria.drive-sync.plist"
LABEL="io.alexandria.drive-sync"
REMOTE="${ALEXANDRIA_DRIVE_REMOTE:-alexandria-drive}"

die() { echo "drive: $*" >&2; exit 1; }

fetch_verified() {
  factory_path="$1"
  destination="$2"
  tmp=$(mktemp)
  if bash "$VERIFY_FETCH" "$factory_path" > "$tmp"; then
    mv "$tmp" "$destination"
  else
    rm -f "$tmp"
    die "could not fetch the signed $factory_path"
  fi
}

enable() {
  [ "$(uname)" = "Darwin" ] || die "the automatic bridge currently requires macOS"
  [ -x "$VERIFY_FETCH" ] || die "missing the installed signature verifier; re-run Alexandria setup"

  if ! command -v rclone >/dev/null 2>&1; then
    command -v brew >/dev/null 2>&1 || die "install Homebrew, then run: brew install rclone"
    echo "Installing the Google Drive bridge…"
    brew install rclone || die "rclone installation failed"
  fi

  remote_type=$(rclone listremotes --long 2>/dev/null | awk -v name="$REMOTE:" '$1 == name { print $2; exit }')
  if [ -n "$remote_type" ] && [ "$remote_type" != "drive" ]; then
    die "rclone already has a non-Google remote named $REMOTE; rename it or set ALEXANDRIA_DRIVE_REMOTE"
  fi

  if [ "$remote_type" = "drive" ] && ! rclone about "$REMOTE:" >/dev/null 2>&1; then
    echo "Google will open once so you can renew access to your own Drive."
    rclone config reconnect "$REMOTE:" || die "Google Drive approval did not finish"
  elif [ -z "$remote_type" ]; then
    echo "Google will open once so you can approve access to your own Drive."
    rclone config create "$REMOTE" drive scope=drive config_is_local=true \
      || die "Google Drive approval did not finish"
  fi
  rclone about "$REMOTE:" >/dev/null 2>&1 || die "Google Drive is still unavailable"

  mkdir -p "$SCRIPTS" "$HOME/Library/LaunchAgents"
  fetch_verified "scripts/drive_sync.sh" "$SYNC"
  fetch_verified "chat/start.md" "$START"
  chmod 700 "$SYNC"
  chmod 600 "$START"

  cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>$SYNC</string></array>
  <key>RunAtLoad</key><true/>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>4</integer><key>Minute</key><integer>15</integer></dict>
</dict>
</plist>
PLIST
  chmod 600 "$PLIST"

  bash "$SYNC" || die "Drive connected, but the first sync failed; run drive_ctl.sh status"

  launchctl bootout "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || true
  launchctl bootstrap "gui/$(id -u)" "$PLIST" || die "the first sync worked, but the daily schedule did not install"
  echo "Drive ready: your local files are ground truth; Google Drive/alexandria is the chat pocket copy."
}

off() {
  launchctl bootout "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || true
  rm -f "$PLIST"
  echo "Drive sync is off. Your Drive files and local Google token were kept."
}

status() {
  if launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1; then
    echo "scheduler: on"
  else
    echo "scheduler: off"
  fi
  if command -v rclone >/dev/null 2>&1 && rclone about "$REMOTE:" >/dev/null 2>&1; then
    echo "Google Drive: connected"
  else
    echo "Google Drive: not connected"
  fi
  if [ -f "$ALEX_DIR/system/.drive_sync_status" ]; then
    cat "$ALEX_DIR/system/.drive_sync_status"
  else
    echo "sync: never run"
  fi
}

case "${1:-status}" in
  enable) enable ;;
  off) off ;;
  status) status ;;
  *) die "use: drive_ctl.sh enable | status | off" ;;
esac
