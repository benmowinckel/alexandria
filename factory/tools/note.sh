#!/bin/bash
# note.sh "<title> | <body>" — create an Apple Note (actuation, background osascript).
# First run prompts ONCE for Automation→Notes; then silent.
IFS='|' read -r title body <<<"$1"
title="$(printf '%s' "$title" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
body="$(printf '%s' "$body" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
esc(){ local s="${1//\\/\\\\}"; printf '%s' "${s//\"/\\\"}"; }
if osascript -e "tell application \"Notes\" to make new note with properties {name:\"$(esc "$title")\", body:\"$(esc "$body")\"}" >/dev/null 2>&1; then
  echo "✓ note saved: ${title:-untitled}"
else
  echo "(couldn't save it — first time? approve Automation→Notes once in System Settings, then retry)"
fi
