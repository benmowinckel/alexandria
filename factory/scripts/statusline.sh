#!/bin/bash
# Alexandria's visible cue renderer.
#
# `statusline` is the persistent native-terminal ceiling. `footer` is the pure
# portable consent line. `claim-footer` atomically gives one local harness the
# day's single opportunity to surface it. The only writes are tiny date-named
# claim-state files under this product-owned runtime. Footer/claim modes never open a tab,
# start a session, read private source, or call the network; native statusline
# mode reads only its already-approved local state.

A="${ALEXANDRIA_HOME:-$HOME/alexandria}"
MODE="${1:-statusline}"
RUNTIME_DIR="${ALEXANDRIA_RUNTIME:-$HOME/.local/share/alexandria}"
CUE='Want me to open your alexandria loop in the background for when you have a minute?'

# Automatic renderers stay inert unless the protected runtime completed setup.
# Setup may probe this read-only renderer before it creates the final activation
# marker; that explicit probe never enables a configured hook.
if [ "${ALEXANDRIA_SETUP_PROBE:-}" != "1" ]; then
  [ -f "$HOME/.local/share/alexandria/.setup_complete" ] || exit 0
fi

# The cue is visible by default. One local sentinel is the immediate OFF.
[ -f "$A/system/hooks/visible-cue.off" ] && exit 0

local_day=$(date +%Y-%m-%d)
if [ "${ALEXANDRIA_SETUP_PROBE:-}" = "1" ] && [ -n "${ALEXANDRIA_LOCAL_DATE:-}" ]; then
  case "$ALEXANDRIA_LOCAL_DATE" in
    ????-??-??) local_day="$ALEXANDRIA_LOCAL_DATE" ;;
  esac
fi

if [ "$MODE" = "claim-footer" ]; then
  # mkdir is the cross-process lock: ten tabs opened together still produce
  # one opportunity. The owner lets a model-fallback host release only its own
  # failed attempt; `seen` makes later responses unable to reopen a delivered
  # day. Both files contain product state only, never Author content.
  umask 077
  owner="${2:-generic}"
  owner=$(printf '%s' "$owner" | tr -cd 'A-Za-z0-9._-')
  [ -n "$owner" ] || owner=generic
  claim_root="$RUNTIME_DIR/state/visible-cue-claimed"
  mkdir -p "$claim_root" 2>/dev/null || exit 0
  mkdir "$claim_root/$local_day" 2>/dev/null || exit 0
  printf '%s\n' "$owner" > "$claim_root/$local_day/owner" 2>/dev/null || {
    rmdir "$claim_root/$local_day" 2>/dev/null || true
    exit 0
  }
  for old_claim in "$claim_root"/*; do
    [ -d "$old_claim" ] || continue
    if [ "$old_claim" != "$claim_root/$local_day" ]; then
      rm -f "$old_claim/owner" "$old_claim/seen" 2>/dev/null || true
      rmdir "$old_claim" 2>/dev/null || true
    fi
  done
  printf '%s\n' "$CUE"
  exit 0
fi

if [ "$MODE" = "mark-footer-seen" ] || [ "$MODE" = "release-footer" ]; then
  owner="${2:-generic}"
  owner=$(printf '%s' "$owner" | tr -cd 'A-Za-z0-9._-')
  [ -n "$owner" ] || owner=generic
  claim_dir="$RUNTIME_DIR/state/visible-cue-claimed/$local_day"
  [ -d "$claim_dir" ] || exit 0
  [ "$(cat "$claim_dir/owner" 2>/dev/null)" = "$owner" ] || exit 0
  if [ "$MODE" = "mark-footer-seen" ]; then
    printf '%s\n' "$(date +%s)" > "$claim_dir/seen" 2>/dev/null || true
  elif [ ! -f "$claim_dir/seen" ]; then
    rm -f "$claim_dir/owner" 2>/dev/null || true
    rmdir "$claim_dir" 2>/dev/null || true
  fi
  exit 0
fi

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

if [ "$MODE" = "footer-codex" ] || [ "$MODE" = "footer" ]; then
  printf '%s\n' "$CUE"
  exit 0
fi
CTA='start /a in a new tab'

count_lines() {
  [ -f "$1" ] || { printf '0\n'; return; }
  awk 'NF && $1 !~ /^#/ {n++} END {print n+0}' "$1" 2>/dev/null
}

n_captures=0
n_raw=0
capture_state="$RUNTIME_DIR/scripts/capture_state.py"
if [ -f "$capture_state" ]; then
  IFS=$'\t' read -r n_captures n_raw < <(
    ALEXANDRIA_HOME="$A" python3 "$capture_state" --counts 2>/dev/null
  )
fi
case "$n_captures" in ''|*[!0-9]*) n_captures=0 ;; esac
case "$n_raw" in ''|*[!0-9]*) n_raw=0 ;; esac

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
