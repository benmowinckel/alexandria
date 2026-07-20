#!/bin/bash
# music.sh "<cmd>" — control Apple Music (background osascript, no window raised). Tolerant of however
# the brain phrases it: play | pause | next | prev | "play playlist X" | "playlist X" | "play X" | X |
# "airplay <device>". First run prompts ONCE for Automation→Music, then silent.
# NOTE: AirPlay to a HomePod needs the mac on the SAME WiFi as it. Away → use a HomeKit scene (scene.sh).
set -uo pipefail
raw="$1"; low="$(printf '%s' "$raw" | tr '[:upper:]' '[:lower:]')"
esc(){ local s="${1//\\/\\\\}"; printf '%s' "${s//\"/\\\"}"; }
osa(){ osascript -e "$1" 2>/dev/null; }
play_playlist(){ osa "tell application \"Music\" to play playlist \"$(esc "$1")\"" && echo "▶️ playing: $1" || echo "(couldn't find a playlist called \"$1\")"; }
case "$low" in
  pause|stop)          osa 'tell application "Music" to pause' && echo "⏸ paused" || echo "(couldn't pause)" ;;
  next|skip)           osa 'tell application "Music" to next track' && echo "⏭ next" || echo "(couldn't skip)" ;;
  prev|previous|back)  osa 'tell application "Music" to previous track' && echo "⏮ previous" || echo "(couldn't go back)" ;;
  play|resume)         osa 'tell application "Music" to play' && echo "▶️ playing" || echo "(couldn't start Music)" ;;
  airplay\ *)
    dev="${raw#* }"
    osa "tell application \"Music\" to set current AirPlay devices to (get every AirPlay device whose name is \"$(esc "$dev")\")" \
      && echo "🔊 routed to: $dev" || echo "(couldn't route to \"$dev\" — is the mac on the same WiFi as it?)" ;;
  *)  # anything else = a playlist to play; strip the noise words "play"/"playlist" the brain may prepend
      name="$(printf '%s' "$raw" | sed -E 's/^[[:space:]]*[Pp]lay[[:space:]]+//; s/^[[:space:]]*[Pp]laylist[[:space:]]+//')"
      if [ -n "$name" ]; then play_playlist "$name"; else osa 'tell application "Music" to play' && echo "▶️ playing"; fi ;;
esac
