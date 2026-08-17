#!/usr/bin/env bash
# Metadata-only existing-install classification.
#
# Classifies ~/alexandria + ~/.local/share/alexandria as:
#   absent  — nothing at the reserved paths
#   healthy — receipts, hashes, and setup-report core rows match
#   partial — Alexandria proof exists but the core loop is incomplete
#   foreign — reserved paths hold content without Alexandria proof
#
# Reads only installer receipts, signed hashes, the setup report, permission
# marker presence, symlink metadata, and git remote URLs. Never opens
# constitution, vault, marginalia, transcripts, or other personal content.
# Prints key: value lines on stdout. Does not change the machine.

set -u

ALEX_DIR="${ALEXANDRIA_DIR:-$HOME/alexandria}"
RUNTIME_DIR="${ALEXANDRIA_RUNTIME_DIR:-$HOME/.local/share/alexandria}"
ICLOUD_INPUT="$HOME/Library/Mobile Documents/com~apple~CloudDocs/alexandria/vault/input"
ICLOUD_DOCS="$HOME/Library/Mobile Documents/com~apple~CloudDocs"

sha256_of() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" 2>/dev/null | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" 2>/dev/null | awk '{print $1}'
  fi
}

path_has_symlink_component() {
  local target="$1" current="$HOME" relative part old_ifs
  case "$target" in "$HOME"|"$HOME"/*) ;; *) return 0 ;; esac
  relative="${target#"$HOME"/}"
  old_ifs="$IFS"; IFS='/'
  for part in $relative; do
    [ -n "$part" ] || continue
    current="$current/$part"
    if [ -L "$current" ]; then IFS="$old_ifs"; return 0; fi
  done
  IFS="$old_ifs"
  return 1
}

report_row() {
  local key="$1" file="$ALEX_DIR/system/.setup_report" value
  [ -f "$file" ] || { printf '%s\n' "unknown"; return; }
  value=$(awk -v k="$key:" '$1==k { print $2; exit }' "$file")
  if [ -n "$value" ]; then
    printf '%s\n' "$value"
  else
    printf '%s\n' "unknown"
  fi
}

dir_has_entries() {
  local dir="$1"
  [ -d "$dir" ] || return 1
  [ -n "$(find "$dir" -mindepth 1 -print -quit 2>/dev/null)" ]
}

dir_has_non_dot_files() {
  local dir="$1"
  [ -d "$dir" ] || return 1
  [ -n "$(find "$dir" -type f ! -name '.*' -print -quit 2>/dev/null)" ]
}

file_matches_manifest() {
  local rel="$1" installed="$2" manifest="$3" expected actual
  [ -f "$installed" ] && [ -f "$manifest" ] || return 1
  expected=$(awk -v p="factory/$rel" '$2==p{print $1; exit}' "$manifest")
  actual=$(sha256_of "$installed")
  [ -n "$expected" ] && [ -n "$actual" ] && [ "$expected" = "$actual" ]
}

platform=$(uname -s 2>/dev/null || printf '%s\n' unknown)
icloud_available=no
shortcut_bridge=unavailable
if [ "$platform" = "Darwin" ]; then
  shortcut_bridge=macos-ios-only
  if [ -d "$ICLOUD_DOCS" ]; then
    icloud_available=yes
  fi
else
  shortcut_bridge=linux-or-other-no-apple-shortcut
fi

alex_exists=0
runtime_exists=0
[ -e "$ALEX_DIR" ] && alex_exists=1
[ -e "$RUNTIME_DIR" ] && runtime_exists=1

alex_populated=0
runtime_populated=0
dir_has_entries "$ALEX_DIR" && alex_populated=1
dir_has_entries "$RUNTIME_DIR" && runtime_populated=1

manifest="$RUNTIME_DIR/.canon_manifest"
setup_complete=no
[ -f "$RUNTIME_DIR/.setup_complete" ] && setup_complete=yes
block_complete=no
[ -f "$ALEX_DIR/system/.block_complete" ] && block_complete=yes
report_present=no
[ -f "$ALEX_DIR/system/.setup_report" ] && report_present=yes

core_hashes=fail
if [ -f "$manifest" ] && \
   file_matches_manifest "hooks/shim.sh" "$RUNTIME_DIR/hooks/shim.sh" "$manifest" && \
   file_matches_manifest "scripts/verify-fetch.sh" "$RUNTIME_DIR/scripts/verify-fetch.sh" "$manifest"; then
  core_hashes=ok
  if [ -f "$RUNTIME_DIR/.hooks_payload" ]; then
    file_matches_manifest "hooks/payload.sh" "$RUNTIME_DIR/.hooks_payload" "$manifest" || core_hashes=fail
  fi
fi

files_row=$(report_row files)
canon_row=$(report_row canon)
methods_row=$(report_row methods)
hooks_row=$(report_row hooks)
core_row=$(report_row core)
passive_row=$(report_row passive_session)
cue_row=$(report_row visible_cue)
loop_row=$(report_row loop)

report_core_ok=no
if [ "$report_present" = "yes" ] && \
   [ "$files_row" = "ok" ] && [ "$canon_row" = "ok" ] && \
   [ "$hooks_row" = "ok" ] && [ "$core_row" = "ok" ] && \
   [ "$loop_row" != "fail" ]; then
  report_core_ok=yes
fi

# Optional connected state — presence only. Never disable, never read secrets.
optional_account=off
optional_library=off
optional_marketplace=off
optional_network=off
optional_capture_network=off
optional_backup=off
optional_update_checks=off
private_remote=absent
[ -f "$ALEX_DIR/system/.api_key" ] && optional_account=on
[ -f "$ALEX_DIR/system/permissions/library" ] && optional_library=on
[ -f "$ALEX_DIR/system/permissions/marketplace" ] && optional_marketplace=on
[ -f "$ALEX_DIR/system/permissions/network" ] && optional_network=on
[ -f "$ALEX_DIR/system/permissions/capture-network" ] && optional_capture_network=on
[ -f "$ALEX_DIR/system/permissions/backup" ] && optional_backup=on
[ -f "$ALEX_DIR/system/hooks/auto-update" ] && optional_update_checks=on
if [ -d "$ALEX_DIR/.git" ]; then
  if git -C "$ALEX_DIR" remote get-url origin >/dev/null 2>&1; then
    private_remote=present
  fi
fi

icloud_input=not-applicable
if [ "$platform" != "Darwin" ]; then
  icloud_input=not-applicable
elif [ -L "$ALEX_DIR/files/vault/input" ]; then
  target=$(readlink "$ALEX_DIR/files/vault/input" 2>/dev/null || true)
  if [ -n "$target" ] && [ -d "$target" ]; then
    case "$target" in
      *"/alexandria/vault/input"|*"/alexandria/vault/input/") icloud_input=valid ;;
      *) icloud_input=invalid ;;
    esac
  else
    icloud_input=invalid
  fi
elif [ -e "$ALEX_DIR/files/vault/input" ]; then
  icloud_input=local-folder
else
  icloud_input=absent
fi

reason=""
class=absent

if [ "$alex_exists" -eq 0 ] && [ "$runtime_exists" -eq 0 ]; then
  class=absent
  reason="no Author folder and no runtime"
elif [ "$alex_populated" -eq 0 ] && [ "$runtime_populated" -eq 0 ]; then
  class=absent
  reason="reserved paths exist but are empty"
elif path_has_symlink_component "$ALEX_DIR" || path_has_symlink_component "$RUNTIME_DIR"; then
  class=foreign
  reason="reserved path is reached through a symlink"
elif [ "$core_hashes" = "ok" ] && [ "$setup_complete" = "yes" ] && [ "$report_core_ok" = "yes" ]; then
  class=healthy
  reason="receipts, hashes, and setup-report core rows match"
elif [ "$core_hashes" = "ok" ] || [ "$setup_complete" = "yes" ] || [ "$report_present" = "yes" ] || [ -f "$ALEX_DIR/system/.block" ]; then
  class=partial
  reason="Alexandria proof exists but the core loop is incomplete"
elif ! dir_has_non_dot_files "$ALEX_DIR" && ! dir_has_non_dot_files "$RUNTIME_DIR"; then
  class=absent
  reason="reserved paths hold only empty dirs or dotfiles"
else
  class=foreign
  reason="reserved paths hold content without Alexandria receipts or hashes"
fi

printf '%s\n' \
  "class: $class" \
  "reason: $reason" \
  "platform: $platform" \
  "icloud_available: $icloud_available" \
  "shortcut_bridge: $shortcut_bridge" \
  "setup_complete: $setup_complete" \
  "block_complete: $block_complete" \
  "report_present: $report_present" \
  "core_hashes: $core_hashes" \
  "files: $files_row" \
  "canon: $canon_row" \
  "methods: $methods_row" \
  "hooks: $hooks_row" \
  "core: $core_row" \
  "passive_session: $passive_row" \
  "visible_cue: $cue_row" \
  "loop: $loop_row" \
  "icloud_input: $icloud_input" \
  "optional.account: $optional_account" \
  "optional.library: $optional_library" \
  "optional.marketplace: $optional_marketplace" \
  "optional.network: $optional_network" \
  "optional.capture_network: $optional_capture_network" \
  "optional.backup: $optional_backup" \
  "optional.update_checks: $optional_update_checks" \
  "optional.private_remote: $private_remote"
