#!/bin/bash
# remind.sh "<text>" — add a Reminder (actuation, background osascript — no window raised).
# First run per app prompts ONCE for Automation→Reminders (user consent, can't be scripted); then silent.
t="${1//\\/\\\\}"; t="${t//\"/\\\"}"   # escape backslash + double-quote for AppleScript
if osascript -e "tell application \"Reminders\" to make new reminder with properties {name:\"$t\"}" >/dev/null 2>&1; then
  echo "✓ reminder set: $1"
else
  echo "(couldn't set it — first time? approve Automation→Reminders once in System Settings, then retry)"
fi
