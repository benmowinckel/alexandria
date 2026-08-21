#!/bin/bash
# drive_sync.sh — Google Drive pocket copy for a full local Author.
#
# Local ~/alexandria is ground truth. Drive is the chat-readable pocket copy:
#   - UP: _start + the position-layer constitution become native Google Docs.
#   - DOWN: new or changed chat writings are copied into vault/input/chat/.
#
# The Google OAuth token stays in rclone's local config. Nothing is sent to
# Alexandria. This script is installed and scheduled only after the Author says
# yes through drive_ctl.sh.

set -u

ALEX_DIR="${ALEXANDRIA_DIR:-$HOME/alexandria}"
REMOTE="${ALEXANDRIA_DRIVE_REMOTE:-alexandria-drive}"
ROOT="${ALEXANDRIA_DRIVE_ROOT:-alexandria}"
LOG="$ALEX_DIR/system/.drive_sync_log"
STATUS="$ALEX_DIR/system/.drive_sync_status"
START="$ALEX_DIR/system/.drive-start.md"
INBOX="$ALEX_DIR/files/vault/input/chat"
SHADOW="$ALEX_DIR/system/.drive_shadow"
SEEN="$ALEX_DIR/system/.drive_seen"
LOCK="$ALEX_DIR/system/.drive_sync_lock"
RC=(rclone --drive-export-formats md --drive-import-formats md --log-level ERROR)

mkdir -p "$ALEX_DIR/system" "$INBOX"

if ! mkdir "$LOCK" 2>/dev/null; then
  exit 0
fi
trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT

stamp_status() {
  printf '%s — %s\n' "$1" "$(date '+%Y-%m-%d %H:%M')" > "$STATUS"
}

sha256_file() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    sha256sum "$1" | awk '{print $1}'
  fi
}

# Copy only new content versions from the local Drive shadow into the live
# capture inbox. The append-only hash ledger prevents the same Drive document
# from reappearing after /a has drained its prior copy, while a real edit gets a
# new hash and is captured again.
ingest_shadow() {
  src="$1"
  label="$2"
  [ -d "$src" ] || return 0

  find "$src" -type f -print | while IFS= read -r file; do
    rel=${file#"$src"/}
    hash=$(sha256_file "$file") || continue
    key="$label/$rel $hash"
    grep -qxF "$key" "$SEEN" 2>/dev/null && continue

    safe_rel=$(printf '%s' "$rel" | tr '/' '_')
    dest="$INBOX/drive-$(date '+%Y%m%dT%H%M%S')-$label-${hash%${hash#????????}}-$safe_rel"
    if cp "$file" "$dest"; then
      printf '%s\n' "$key" >> "$SEEN"
      echo "  down: $label/$rel"
    else
      return 1
    fi
  done
}

{
  echo "=== drive_sync $(date '+%Y-%m-%d %H:%M:%S') ==="
  ok=1

  if ! command -v rclone >/dev/null 2>&1; then
    echo "  ERROR — rclone is not installed"
    stamp_status "DRIVE SYNC NEEDS RCLONE"
    exit 1
  fi
  if ! rclone about "$REMOTE:" >/dev/null 2>&1; then
    echo "  ERROR — Google Drive authorization is unavailable"
    stamp_status "DRIVE SYNC NEEDS GOOGLE APPROVAL"
    exit 1
  fi

  # Empty Drive folders are valid first-run state, not sync errors.
  for folder in vault marginalia constitution; do
    "${RC[@]}" mkdir "$REMOTE:$ROOT/$folder" || ok=0
  done

  # DOWN FIRST. Keep the remote documents in place so chat can continue to see
  # its own vault and open marginalia. The shadow + hash ledger makes the pull
  # incremental without deleting anything from the Author's Drive.
  mkdir -p "$SHADOW/vault" "$SHADOW/marginalia" "$SHADOW/constitution-proposals"
  "${RC[@]}" sync "$REMOTE:$ROOT/vault/" "$SHADOW/vault/" || ok=0
  "${RC[@]}" sync "$REMOTE:$ROOT/marginalia/" "$SHADOW/marginalia/" || ok=0
  "${RC[@]}" sync "$REMOTE:$ROOT/constitution/" "$SHADOW/constitution-proposals/" --include "* — v*.md" || ok=0
  ingest_shadow "$SHADOW/vault" vault || ok=0
  ingest_shadow "$SHADOW/marginalia" marginalia || ok=0
  ingest_shadow "$SHADOW/constitution-proposals" constitution-proposals || ok=0

  # UP SECOND. rclone imports Markdown as native Google Docs and updates the
  # existing same-name Docs in place. We copy rather than sync so an Author's
  # chat-created files are never deleted.
  stage=$(mktemp -d)
  trap 'rm -rf "$stage" 2>/dev/null || true; rmdir "$LOCK" 2>/dev/null || true' EXIT
  mkdir -p "$stage/constitution"

  if [ -s "$START" ]; then
    cp "$START" "$stage/_start.md"
    "${RC[@]}" copyto "$stage/_start.md" "$REMOTE:$ROOT/_start.md" || ok=0
  else
    echo "  ERROR — missing verified _start source"
    ok=0
  fi

  constitution="$ALEX_DIR/files/constitution/_constitution.md"
  if [ -s "$constitution" ]; then
    today=$(date '+%Y-%m-%d')
    awk -v out="$stage/constitution" -v today="$today" '
      /^## / {
        if (file != "") close(file)
        title=substr($0, 4)
        safe=title
        gsub(/[^[:alnum:]]/, "", safe)
        if (safe == "") { file=""; next }
        file=out "/" safe ".md"
        print "# " title > file
        print "" >> file
        print "*Pocket copy synced " today " from the Author’s primary Git checkout. Lasting edits are captured through a session.*" >> file
        next
      }
      file != "" { print >> file }
    ' "$constitution"
    if find "$stage/constitution" -type f -print -quit | grep -q .; then
      "${RC[@]}" copy "$stage/constitution/" "$REMOTE:$ROOT/constitution/" || ok=0
    else
      echo "  ERROR — constitution projection produced no documents"
      ok=0
    fi
  else
    echo "  NOTE — no constitution derivative yet; _start still synced"
  fi

  rm -rf "$stage"
  trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT

  if [ "$ok" -eq 1 ]; then
    stamp_status "DRIVE SYNC OK"
    echo "  done OK"
  else
    stamp_status "DRIVE SYNC HAD ERRORS"
    echo "  done WITH ERRORS"
    exit 1
  fi
} >> "$LOG" 2>&1
