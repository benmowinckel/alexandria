#!/bin/bash
# imsg_conv.sh <baseline_rowid> <my_last_sent_text>
# Waits for the Author's next iMessage reply (a message with ROWID > baseline whose
# text isn't my own send). Decreasing-frequency poll: every 5s for the first minute,
# every 60s for the next ~10 min, then every 5 min out to ~35 min. Prints "REPLY: ..."
# and exits 0 on a reply; prints "TIMEOUT" and exits 1 if the window passes.
# Run in the background so it re-invokes the model on exit.
DB="$HOME/Library/Messages/chat.db"
BASE="$1"
MINE="$2"
esc=${MINE//\'/\'\'}
sched=$( { for i in $(seq 12); do echo 5;   done
           for i in $(seq 10); do echo 60;  done
           for i in $(seq 6);  do echo 300; done; } )
while read -r iv; do
  r=$(sqlite3 "$DB" "SELECT COALESCE(text,'[non-text]') FROM message WHERE ROWID > $BASE AND text IS NOT NULL AND text <> '$esc' ORDER BY ROWID DESC LIMIT 1;" 2>/dev/null)
  if [ -n "$r" ]; then echo "REPLY: $r"; exit 0; fi
  sleep "$iv"
done <<< "$sched"
echo "TIMEOUT"
exit 1
