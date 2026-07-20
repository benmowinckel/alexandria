#!/bin/bash
# imsg_handle.sh <maxrow> — called by the FDA-granted reader (AlexandriaMessages.app) when new
# inbound exists. Plain bash, NO special privilege. The reader has ALREADY advanced the watermark,
# so this is strictly best-effort: read .imsg_inbound_tmp, run the caged brain, send the reply.
# A failure here costs at most one missed reply (he re-texts), never a reprocess loop.
set -uo pipefail
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
BASE="$HOME/alexandria/system"; SCR="$BASE/scripts"
LOG="$BASE/.imsg_daemon_log"; CONV="$BASE/.imsg_conversation_log"; TMP="$BASE/.imsg_inbound_tmp"
maxrow="${1:?need maxrow}"
reply_to="${2:-}"   # the handle Ben texted from → reply there (same thread)
log(){ printf '%s %s\n' "$(date -Iseconds)" "$*" >> "$LOG"; }

[ -f "$TMP" ] || exit 0
texts=$(cut -f2- "$TMP" | paste -sd'~' - | sed 's/~/ | /g')
rm -f "$TMP"
[ -n "$texts" ] || exit 0
log "IN [$maxrow]: $texts"
printf '%s\tBEN\t%s\n' "$(date -Iseconds)" "$texts" >> "$CONV"

reply=$("$SCR/agent_reply.sh" "$texts" 2>>"$LOG")
if [ -z "$reply" ]; then
  log "ERR: brain returned empty for [$maxrow] — no reply sent (he can re-text)"
  exit 0
fi

# Send with a small bounded retry (Messages can be transiently un-launchable → -10810).
sent=0
for attempt in 1 2 3; do
  if "$SCR/imsg_send.sh" "$reply" "$reply_to" 2>>"$LOG"; then sent=1; break; fi
  log "send attempt $attempt failed for [$maxrow]; retrying"
  sleep 2
done
if [ "$sent" = 1 ]; then
  log "OUT: ${reply:0:140}"
  printf '%s\tAI\t%s\n' "$(date -Iseconds)" "$reply" >> "$CONV"
else
  log "ERR: send failed 3x for [$maxrow] — reply dropped (he can re-text)"
fi
