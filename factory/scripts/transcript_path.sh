#!/usr/bin/env bash
# Validate a host-supplied transcript_path before archiving it.
# Safe when sourced or executed: `safe_transcript_path PATH [HOME]`.
# Accepts only a regular, user-owned file under a supported host root.
# Rejects relative paths, `..` components, symlinks below home, and foreign
# owners. Home itself may be a symlink. Logical HOME, its raw symlink target,
# and its fully resolved target are all accepted.

safe_transcript_path() {
  local raw="$1" home="${2:-$HOME}" current part old_ifs owner rel prefix home_phys home_raw
  [ -n "$raw" ] || return 1
  case "$raw" in
    *$'\n'*|*$'\r'*) return 1 ;;
  esac
  case "$raw" in
    /*) ;;
    *) return 1 ;;
  esac
  case "$home" in
    */) home="${home%/}" ;;
  esac
  [ -n "$home" ] || return 1

  home_phys=$(CDPATH= cd -- "$home" && pwd -P 2>/dev/null) || home_phys="$home"
  case "$home_phys" in
    */) home_phys="${home_phys%/}" ;;
  esac

  home_raw=""
  if [ -L "$home" ]; then
    home_raw=$(readlink "$home" 2>/dev/null) || home_raw=""
    case "$home_raw" in
      /*) ;;
      "") ;;
      *) home_raw="$(dirname "$home")/$home_raw" ;;
    esac
    case "$home_raw" in
      */) home_raw="${home_raw%/}" ;;
    esac
  fi

  prefix=""
  case "$raw" in
    "$home"/*) prefix="$home" ;;
    "$home_phys"/*) prefix="$home_phys" ;;
  esac
  if [ -z "$prefix" ] && [ -n "$home_raw" ]; then
    case "$raw" in
      "$home_raw"/*) prefix="$home_raw" ;;
    esac
  fi
  [ -n "$prefix" ] || return 1

  rel="${raw#"$prefix"/}"
  [ -n "$rel" ] || return 1
  old_ifs="$IFS"
  IFS='/'
  current="$prefix"
  for part in $rel; do
    [ -n "$part" ] || continue
    if [ "$part" = ".." ]; then
      IFS="$old_ifs"
      return 1
    fi
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
  case "$rel" in
    .claude/*|.codex/*|.cursor/*|.alexandria/transcripts/*|.factory/*|.grok/*)
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
