#!/bin/bash
# imsg_run.sh — run the texting brain in the FOREGROUND (a Terminal window you keep open).
#
# Why this exists: macOS prompts BACKGROUND (launchd) processes for permissions every single time
# (that "2.1.177 wants access" popup), but processes launched from Terminal inherit Terminal's
# already-granted permissions silently. Same brain, same everything — just launched from a place
# macOS trusts. Running the brain here = no popup, ever.
#
# Usage: open a Terminal window and run:  bash ~/alexandria/system/scripts/imsg_run.sh
# Keep the window open (lid open, plugged in). Ctrl-C to stop.
export ALEXANDRIA_BRAIN=1
echo "🟢 Alexandria texting brain is running — keep this window open. Ctrl-C to stop."
echo "   Popup-free: it inherits Terminal's permissions instead of prompting as a background service."
echo "   Text your self-thread anytime; replies come back here-less, silently."
exec /usr/bin/python3 "$HOME/alexandria/system/scripts/imsg_daemon.py"
