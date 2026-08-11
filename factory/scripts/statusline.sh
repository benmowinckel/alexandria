#!/bin/bash
# Alexandria's visible cue renderer.
#
# `statusline` is the native-terminal ceiling. `footer` and `footer-codex`
# are portable response footers using each host's real skill invocation.
# This script only reads local state and prints one line: it never opens a tab,
# starts a session, writes canon, or calls the network.

A="${ALEXANDRIA_HOME:-$HOME/alexandria}"
MODE="${1:-statusline}"

# Automatic renderers stay inert unless the protected runtime completed setup.
# Setup may probe this read-only renderer before it creates the final activation
# marker; that explicit probe never enables a configured hook.
if [ "${ALEXANDRIA_SETUP_PROBE:-}" != "1" ]; then
  [ -f "$HOME/.local/share/alexandria/.setup_complete" ] || exit 0
fi

# The cue is visible by default. One local sentinel is the immediate OFF.
[ -f "$A/system/hooks/visible-cue.off" ] && exit 0

if [ "$MODE" = "active" ]; then
  printf '%s\n' '→ close with a. when done'
  exit 0
fi

# Claude's native statusline receives this tab's session_id on stdin. The /a
# skill records the same id in `.active_a_sessions`; only that tab flips to the
# close gesture. Response-footer calls use MODE=footer and never read stdin.
if [ "$MODE" = "statusline" ]; then
  sid=$(tr -d '\n' | sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
  active_sessions="$A/system/.active_a_sessions"
  if [ -n "$sid" ] && [ -f "$active_sessions" ]; then
    now=$(date +%s)
    while read -r marked_id marked_at; do
      case "$marked_at" in ''|*[!0-9]*) continue ;; esac
      if [ "$marked_id" = "$sid" ] && [ $((now - marked_at)) -lt 43200 ]; then
        printf '%s\n' '→ /a. when done · reflect on what moved'
        exit 0
      fi
    done < "$active_sessions"
  fi
fi

if [ "$MODE" = "footer-codex" ]; then
  CTA='start $a in a new chat'
elif [ "$MODE" = "footer" ]; then
  CTA='start /a in a new chat'
else
  CTA='start /a in a new tab'
fi

count_lines() {
  [ -f "$1" ] || { printf '0\n'; return; }
  awk 'NF && $1 !~ /^#/ {n++} END {print n+0}' "$1" 2>/dev/null
}

n_captures=0
IN="$A/files/vault/_input"
SV="$A/files/vault/saved"
if [ -d "$IN" ]; then
  for f in "$IN"/*.md; do
    [ -e "$f" ] || continue
    b="${f##*/}"; b="${b%.md}"
    [ -f "$SV/$b.analysis.md" ] || n_captures=$((n_captures+1))
  done
fi

n_raw=0
RAW="$A/files/vault/input"
if [ -d "$RAW" ]; then
  for f in "$RAW"/*; do
    [ -f "$f" ] || continue
    case "${f##*/}" in .*) continue ;; esac
    n_raw=$((n_raw+1))
  done
fi

n_calls=$(count_lines "$A/system/.calls.md")
n_armed=$(count_lines "$A/system/.armed.md")
n_updates=$(count_lines "$A/system/.canon_update_notice")

n_stale=0
if [ -f "$A/system/.last_a" ]; then
  last_a=$(head -1 "$A/system/.last_a" | tr -dc 0-9)
  if [ -n "$last_a" ]; then
    days=$(( ($(date +%s) - last_a) / 86400 ))
    [ "$days" -ge 3 ] && n_stale=$days
  fi
fi

frames=()
if [ "$n_captures" -eq 1 ]; then frames+=("1 capture to churn")
elif [ "$n_captures" -gt 1 ]; then frames+=("$n_captures captures to churn"); fi
if [ "$n_raw" -eq 1 ]; then frames+=("1 raw drop waiting")
elif [ "$n_raw" -gt 1 ]; then frames+=("$n_raw raw drops waiting"); fi
if [ "$n_calls" -eq 1 ]; then frames+=("1 call waiting")
elif [ "$n_calls" -gt 1 ]; then frames+=("$n_calls calls waiting"); fi
[ "$n_armed" -eq 1 ] && frames+=("1 armed, waiting")
[ "$n_armed" -gt 1 ] && frames+=("$n_armed armed, waiting")
if [ "$n_updates" -eq 1 ]; then frames+=("1 update pending")
elif [ "$n_updates" -gt 1 ]; then frames+=("$n_updates updates pending"); fi
[ "$n_stale" -gt 0 ] && frames+=("$n_stale days since your last session")
[ ${#frames[@]} -eq 0 ] && frames+=("refine yourself between tasks")

idx=$(( ($(date +%s) / 300) % ${#frames[@]} ))
printf '→ %s · %s\n' "${frames[$idx]}" "$CTA"
