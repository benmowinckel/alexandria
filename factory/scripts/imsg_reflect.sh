#!/bin/bash
# imsg_reflect.sh — the daily memory loop (end-of-day reflection).
#
# Runs once a day (launchd com.alexandria.imsg-reflect, ~23:30). Reads today's iMessage conversation,
# has the write-enabled brain write memory/YYYY-MM-DD.md (a reflective journal for tomorrow's self)
# and consolidate MEMORY.md (durable facts), then RESETS the working conversation log. The next day's
# replies read yesterday's journal + durable memory via agent_reply.sh — write-a-report → reset →
# read-it-in-the-morning. Empty day → no diary, no reset (silence is fine).
set -uo pipefail
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
export ALEXANDRIA_BRAIN=1   # skip the iCloud-touching SessionStart hooks (TCC-popup source)
BASE="$HOME/alexandria/system"
CONV="$BASE/.imsg_conversation_log"; MEM="$BASE/MEMORY.md"; MEMDIR="$BASE/memory"
LOG="$BASE/.imsg_reflect_log"
mkdir -p "$MEMDIR"
today=$(date +%Y-%m-%d)
log(){ printf '%s %s\n' "$(date -Iseconds)" "$*" >> "$LOG"; }

[ -s "$CONV" ] || { log "no conversation today — skip"; exit 0; }

read -r -d '' PROMPT <<EOF || true
You are Alexandria doing your end-of-day reflection. Below is today's iMessage conversation with Ben and your current durable memory. Do exactly two file writes, then reply "done".

TODAY ($today) — the conversation:
$(cat "$CONV")

CURRENT DURABLE MEMORY ($MEM):
$(cat "$MEM" 2>/dev/null)

1. Write $MEMDIR/$today.md — a short reflective journal for your future self: what came up, decisions made, open threads to follow up tomorrow, his mood/context. Bullet points, tight.
2. Update $MEM — fold in any DURABLE new facts worth keeping long-term (his preferences, ongoing threads, standing asks). Consolidate, don't just append; keep it under ~4000 chars. If nothing durable came up, leave it.
Reply with just: done
EOF

if command -v claude >/dev/null 2>&1; then
  claude -p "$PROMPT" --disallowedTools Bash --strict-mcp-config --dangerously-skip-permissions 2>>"$LOG" >/dev/null
else
  log "no claude CLI — cannot reflect"; exit 1
fi

log "reflected $today; resetting conversation log"
: > "$CONV"
