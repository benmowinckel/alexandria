#!/bin/bash
# show.sh <filename> — SHOW him a file on his phone via iCloud Drive (reliable + private). The AppleScript
# iMessage-attachment path delivered dead paperclips (blob never uploaded to the receiver), so showing
# goes through iCloud: copy the file into iCloud Drive/alexandria/shared and tell him where to open it.
# Syncs over cellular, private, viewable anywhere. Out-adapter contract: take "$1", do it, echo one line.
set -uo pipefail
BASE="$HOME/alexandria/system"
name="$1"; f="$BASE/served/$name"
[ -f "$f" ] || { echo "(couldn't find $name on the mac)"; exit 0; }
# SVG → PNG so it previews as an image, not a code icon
ext="$(echo "${name##*.}" | tr '[:upper:]' '[:lower:]')"
if [ "$ext" = "svg" ]; then
  if qlmanage -t -s 1400 -o "$BASE/served" "$f" >/dev/null 2>&1 && [ -f "$f.png" ]; then
    mv -f "$f.png" "$BASE/served/${name%.*}.png"; name="${name%.*}.png"; f="$BASE/served/$name"
  fi
fi
ic="$HOME/Library/Mobile Documents/com~apple~CloudDocs/alexandria/shared"
if mkdir -p "$ic" 2>/dev/null && cp -f "$f" "$ic/$name" 2>/dev/null; then
  echo "open \"$name\" → Files app · iCloud Drive/alexandria/shared"
else
  echo "(it's on your mac: $f)"
fi
