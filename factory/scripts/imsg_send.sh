#!/bin/bash
# imsg_send.sh "message" [target_handle]   (or:  echo "message" | imsg_send.sh)
#
# Owned, harness-agnostic OUTPUT device. Sends to a self-thread handle. If target_handle is given
# (the handle Ben last texted from), it replies THERE so the reply threads with his message —
# no more "answering in a different chat". Defaults to the email handle.
# Needs Messages running + Apple Events (outside sandbox); under launchd that's automatic.
#
# Records the ROWID of every message it sends into .imsg_ai_sent — the discriminator of record
# (the saved contact made Ben's replies is_from_me=1, identical to AI sends; only the sent-log is reliable).
set -euo pipefail
BASE="$HOME/alexandria/system"
source "$BASE/.imsg_config"
LOG="$BASE/.imsg_sent_log"
AISENT="$BASE/.imsg_ai_sent"
DB="$HOME/Library/Messages/chat.db"

MSG="${1:-$(cat)}"
[ -z "$MSG" ] && { echo "ERR: empty message" >&2; exit 1; }
TARGET="${2:-}"; [ -z "$TARGET" ] && TARGET="$IMSG_EMAIL"    # reply where Ben texted from; default email

open -gj -a Messages 2>/dev/null || true

maxq(){ sqlite3 "$DB" "SELECT COALESCE(MAX(m.ROWID),0) FROM message m JOIN chat_message_join j ON m.ROWID=j.message_id JOIN chat c ON j.chat_id=c.ROWID WHERE c.chat_identifier='$TARGET' AND m.is_from_me=1;" 2>/dev/null; }
pre=$(maxq || true)

MSG=${MSG//$'\n'/ }
esc=${MSG//\\/\\\\}
esc=${esc//\"/\\\"}

# Send into the EXACT existing chat (by GUID) so the reply threads into Ben's conversation instead
# of spawning a new one (participant-sends spawn duplicate chats). Fall back to participant if the
# chat GUID can't be resolved or the chat-id send fails.
guid=$(sqlite3 "$DB" "SELECT guid FROM chat WHERE chat_identifier='$TARGET' ORDER BY ROWID DESC LIMIT 1;" 2>/dev/null || true)
sent_ok=0
if [ -n "${guid:-}" ]; then
  if osascript -e "tell application \"Messages\" to send \"$esc\" to chat id \"$guid\"" 2>/dev/null; then sent_ok=1; fi
fi
if [ "$sent_ok" != 1 ]; then
  osascript -e "tell application \"Messages\" to send \"$esc\" to participant \"$TARGET\" of (1st service whose service type = iMessage)"
fi

# record the just-sent ROWID (retry for async chat.db landing) so the daemon never treats it as Ben
if [ -n "${pre:-}" ]; then
  for _ in 1 2 3 4 5 6; do
    post=$(maxq || true)
    if [ -n "$post" ] && [ "$post" != "$pre" ]; then echo "$post" >> "$AISENT"; break; fi
    sleep 0.5
  done
fi

printf '%s\t%s\t%s\n' "$(date -Iseconds)" "$TARGET" "${MSG:0:130}" >> "$LOG"
