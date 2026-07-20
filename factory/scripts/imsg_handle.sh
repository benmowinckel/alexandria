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
reply_to="${2:-}"   # the handle the Author texted from → reply there (same thread)
log(){ printf '%s %s\n' "$(date -Iseconds)" "$*" >> "$LOG"; }

[ -f "$TMP" ] || exit 0
texts=$(cut -f2 "$TMP" | paste -sd'~' - | sed 's/~/ | /g; s/^ *| *//; s/ *| *$//')
attach=$(cut -f3 "$TMP" | grep -v '^[[:space:]]*$' | head -1)   # first file he attached, if any
rm -f "$TMP"
[ -n "$texts$attach" ] || exit 0                                 # proceed if EITHER text OR a file
log "IN [$maxrow]: ${texts}${attach:+ [+file: $(basename "$attach")]}"
printf '%s\tBEN\t%s\n' "$(date -Iseconds)" "${texts:-[sent a file]}" >> "$CONV"

reply=$("$SCR/agent_reply.sh" "$texts" "$attach" 2>>"$LOG")
if [ -z "$reply" ]; then
  log "ERR: brain returned empty for [$maxrow] — no reply sent (he can re-text)"
  exit 0
fi

# ── Tool adapters (pixel/acoustic × in/out). The caged brain emits [[VERB: payload]] on its own line;
# this handler is privileged (terminal context → can actuate), so it runs tools/<verb>.sh "payload" and
# substitutes the adapter's output back into the reply he sees. Add a tool = drop one tools/<verb>.sh
# that takes "$1" and echoes what he sees. Unknown verb → marker left as-is (harmless). See tools/README.md.
if printf '%s' "$reply" | grep -q '\[\['; then
  TOOLS="$BASE/tools"; out=""
  while IFS= read -r line; do
    if [[ "$line" =~ ^\[\[([A-Za-z_]+):[[:space:]]*(.*)\]\]$ ]]; then
      verb="$(printf '%s' "${BASH_REMATCH[1]}" | tr '[:upper:]' '[:lower:]')"
      payload="${BASH_REMATCH[2]}"
      if [ -x "$TOOLS/$verb.sh" ]; then
        rep="$("$TOOLS/$verb.sh" "$payload" 2>>"$LOG")" || rep="(couldn't run $verb)"
        out+="$rep"$'\n'
      else
        out+="$line"$'\n'
      fi
    else
      out+="$line"$'\n'
    fi
  done < <(printf '%s\n' "$reply")
  reply="${out%$'\n'}"
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
