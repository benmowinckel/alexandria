#!/bin/bash
# scene.sh "<scene name>" — run a HomeKit scene (e.g. "Night") from anywhere. Runs on your Home hub,
# so it works over cellular even when the mac isn't home — this is the remote path for HomePod music.
#
# REQUIRES a one-time setup per scene: the mac's Home app has no scripting hook, so Shortcuts is the
# bridge. In the Shortcuts app, make a Shortcut named EXACTLY like the scene (e.g. "Night"), containing
# one action: Home → "Set Scene" → your scene. 2 minutes each. After that this fires it by name.
set -uo pipefail
name="$1"
if shortcuts run "$name" >/dev/null 2>&1; then
  echo "🏠 ran scene: $name"
else
  echo "(no Shortcut named \"$name\" yet — in the Shortcuts app make one with a Home 'Set Scene' action, then retry)"
fi
