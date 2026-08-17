#!/usr/bin/env bash
# Validate a host-supplied transcript_path before archiving it.
# Safe when sourced or executed: `safe_transcript_path PATH [HOME]`.
# Accepts only a regular, user-owned file under a supported host root.
# Rejects relative paths, traversal, symlinks, and foreign owners.

safe_transcript_path() {
  local raw="$1" home="${2:-$HOME}" current part old_ifs owner rel
  [ -n "$raw" ] || return 1
  case "$raw" in
    /*) ;;
    *) return 1 ;;
  esac
  case "$raw" in
    *..*) return 1 ;;
  esac
  old_ifs="$IFS"
  IFS='/'
  current=""
  for part in $raw; do
    [ -n "$part" ] || continue
    current="$current/$part"
    if [ -L "$current" ]; then
      IFS="$old_ifs"
      return 1
    fi
  done
  IFS="$old_ifs"
  [ -f "$raw" ] || return 1
  [ -L "$raw" ] && return 1
  owner=$(stat -c '%u' "$raw" 2>/dev/null || stat -f '%u' "$raw" 2>/dev/null) || return 1
  [ "$owner" = "$(id -u)" ] || return 1
  case "$home" in
    */) home="${home%/}" ;;
  esac
  case "$raw" in
    "$home"/*) ;;
    *) return 1 ;;
  esac
  rel="${raw#"$home"/}"
  case "$rel" in
    .claude/*|.codex/*|.cursor/*|.alexandria/transcripts/*|.factory/*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

if [ "${BASH_SOURCE[0]:-}" = "$0" ]; then
  safe_transcript_path "${1:-}" "${2:-$HOME}"
fi
