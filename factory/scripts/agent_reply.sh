#!/bin/bash
# agent_reply.sh "<incoming text(s)>"  ->  prints ONLY the reply text to stdout.
#
# THE ONE FILE where the harness/model is named. Swap harness = edit this file, nothing else.
# The FULL agent: reads canon + memory, CAN write files + take reversible actions, armed-never-fired
# on anything irreversible/outward. Injects memory so texts have continuity and the brain wakes with
# yesterday's context: durable facts (MEMORY.md) + latest daily journal + the recent thread.
set -uo pipefail
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"   # launchd has a bare PATH
# Kill Claude Code's startup side-effects (auto-updater / telemetry / non-essential traffic) — these
# reach into system/other-app data and are the likely source of the recurring macOS "data from other
# apps" popup. A headless brain needs none of them.
export DISABLE_AUTOUPDATER=1 DISABLE_TELEMETRY=1 DISABLE_ERROR_REPORTING=1 CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
export ALEXANDRIA_BRAIN=1   # makes the SessionStart hooks (shim.sh, capture_resolver.py) skip themselves —
                            # they touch iCloud/network on every launch, which is what pops the TCC dialog.
BASE="$HOME/alexandria/system"
INCOMING="${1:?need incoming text}"

CONV="$BASE/.imsg_conversation_log"; MEM="$BASE/MEMORY.md"; MEMDIR="$BASE/memory"
recent=""; [ -f "$CONV" ] && recent=$(tail -n 8 "$CONV" | sed 's/\t/ · /g')
durable=""; [ -f "$MEM" ] && durable=$(cat "$MEM")
diary=""; latest=$(ls -1 "$MEMDIR"/*.md 2>/dev/null | tail -1); [ -n "$latest" ] && diary=$(cat "$latest")

read -r -d '' PROMPT <<EOF || true
Ben just texted you over iMessage: "$INCOMING"

You are Alexandria, his always-on texting presence — the FULL agent, not a read-only bot. Read ~/alexandria/files/core/text.md (how to behave), agent.md (who he is), and machine.md (how to work with him) as needed. Rules:
- Reply in terse, plain, 15-year-old English — one glance. This is a text, not a terminal.
- You CAN read AND WRITE his local files (~/alexandria/…) and take reversible actions — capture a thought into the vault, develop canon, write a note, edit a file. Do the actual work when he asks; don't just answer. This is the full Alexandria over text.
- ARMED, NEVER FIRED (the hard gate): for anything irreversible or outward-facing — spending, sending to a third party, publishing/deploying, customer-visible state, deleting anything important — do NOT do it. Draft it and tell him to reply 'go'.
- Output ONLY the reply text (what he sees). Sent verbatim: no preamble, no markdown, no quotes. One glance; if you did work, say what you did in a few words.

--- MEMORY (for your continuity — do NOT recite it back at him) ---
Durable facts about him:
$durable

Your latest daily journal (yesterday):
$diary

Recent texts (oldest→newest):
$recent
EOF

# Harness detection — the swap point.
#   --strict-mcp-config    : load NO MCP servers → kills the macOS "access data from other apps"
#                            popup that fired every text (claude was spawning Google Drive/Vercel/
#                            computer-use for health checks). The texting brain needs none of them.
#   --dangerously-skip-permissions : no Claude tool prompts at all → fully unattended.
# Safety is now behavioral, not prompt-based: input is authenticated to Ben (self-thread only),
# armed-never-fired keeps irreversible/outward actions behind "go", and canon is git-recoverable.
if command -v claude >/dev/null 2>&1; then
  # --disallowedTools Bash : the brain CANNOT run shell → cannot run osascript → cannot touch any app
  #   → structurally impossible to trigger an app-permission popup. Keeps Read/Write/Edit + web, so
  #   the core (read/write canon, answer, remember, search) is fully intact and 100% silent.
  #   (App actions like reminders need Bash+consent — a deliberate opt-in, not the default.)
  claude -p "$PROMPT" --disallowedTools Bash --strict-mcp-config --dangerously-skip-permissions 2>/dev/null
elif command -v codex >/dev/null 2>&1; then
  codex exec "$PROMPT" 2>/dev/null
elif command -v cursor-agent >/dev/null 2>&1; then
  cursor-agent -p "$PROMPT" 2>/dev/null
else
  echo "(no agent CLI installed — cannot answer)"
fi
