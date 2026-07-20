#!/bin/bash
# imsg_recv.sh           -> print NEW inbound texts from Ben since the watermark, as "ROWID<TAB>text"
# imsg_recv.sh --seen N  -> advance the watermark to ROWID N (call after you've handled up to N)
#
# Owned, harness-agnostic INPUT device. No model, no harness.
#
# DISCRIMINATOR (hard-won — see core/text.md): Ben texting himself can be EITHER is_from_me flag,
# and lands in EITHER of two self-threads:
#   EMAIL thread  (the AI's send address, from .imsg_config) — the AI sends here (grey); the Author's inline replies here are is_from_me=0
#   NUMBER thread (his own number)          — the AI NEVER writes here, so EVERYTHING here is Ben
# The AI only ever emits is_from_me=1 into the EMAIL thread. Therefore:
#   Ben's message  =  (is_from_me=0)  OR  (it's in the NUMBER thread)
# This needs no text-diffing and no sent-log, and it correctly excludes both imsg_send.sh and nudge.py sends.
#
# Side-effect-free read: recv never advances the watermark on its own (a crash never drops a message);
# the caller acks with --seen once it has replied.
set -euo pipefail
DB="$HOME/Library/Messages/chat.db"
BASE="$HOME/alexandria/system"
WM="$BASE/.imsg_watermark"
source "$BASE/.imsg_config"       # IMSG_EMAIL, IMSG_NUMBER — single source of truth (no hard-codes)
EMAIL="$IMSG_EMAIL"               # AI's send target (grey)
NUMBER="$IMSG_NUMBER"             # Ben's own-number self-thread (pure-Ben; AI never writes here)

if [ "${1:-}" = "--seen" ]; then
  echo "${2:?need a ROWID}" > "$WM"; exit 0
fi

CIDS=$(sqlite3 "$DB" "SELECT GROUP_CONCAT(ROWID) FROM chat WHERE chat_identifier IN ('$EMAIL','$NUMBER');")
[ -z "$CIDS" ] && { echo "ERR: self-chats not found in chat.db" >&2; exit 2; }

# First run: pin the watermark to the current global max so we never replay history. Emit nothing.
if [ ! -f "$WM" ]; then
  sqlite3 "$DB" "SELECT COALESCE(MAX(m.ROWID),0) FROM message m JOIN chat_message_join j ON m.ROWID=j.message_id WHERE j.chat_id IN ($CIDS);" > "$WM"
  exit 0
fi
MARK=$(cat "$WM")

sqlite3 -separator $'\t' "$DB" \
  "SELECT m.ROWID, REPLACE(REPLACE(COALESCE(m.text,'[non-text]'), char(10),' '), char(13),' ')
     FROM message m JOIN chat_message_join j ON m.ROWID=j.message_id JOIN chat c ON j.chat_id=c.ROWID
    WHERE c.chat_identifier IN ('$EMAIL','$NUMBER') AND m.ROWID>$MARK
      AND (m.is_from_me=0 OR c.chat_identifier='$NUMBER')
    ORDER BY m.ROWID ASC;"
