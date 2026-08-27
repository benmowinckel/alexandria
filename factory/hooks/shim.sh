#!/usr/bin/env bash
# Alexandria shim — one file, four modes, signature-verified payload.
# Small and stable. Every install/update refreshes it only after the full
# factory manifest authenticates its exact bytes.
#
# Trust model: this shim is the root, and it is CONSENT-SYMMETRIC — it only
# ever executes the payload pinned on disk, and only after that exact file has
# passed verification against a manifest signed by the maintainer's Touch ID
# key. It never auto-applies anything: when a newer signed payload exists
# upstream it surfaces a notice, and the Author applies it through the local
# signature verifier. Public engine/canon checks occur only after the Author
# opts in by creating ~/alexandria/system/hooks/auto-update. An account key
# alone enables no standing calls.
#   Audit: https://github.com/benmowinckel/alexandria/blob/main/TRUST.md
#   Inspect payload: https://raw.githubusercontent.com/benmowinckel/alexandria/main/factory/hooks/payload.sh

ALEX_DIR="${ALEXANDRIA_DIR:-$HOME/alexandria}"
RUNTIME_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." 2>/dev/null && pwd)"
API_KEY="${ALEXANDRIA_KEY:-$(cat "$ALEX_DIR/system/.api_key" 2>/dev/null)}"
MODE="$1"

GITHUB_RAW="${ALEX_GITHUB_RAW:-https://raw.githubusercontent.com/benmowinckel/alexandria/main}"
MANIFEST_URL="$GITHUB_RAW/factory/manifest.txt"
MANIFEST_SIG_URL="$GITHUB_RAW/factory/manifest.txt.sig"
SIGNERS_FILE="$RUNTIME_DIR/allowed_signers"
SIGN_NAMESPACE="alexandria"

# Transcripts, logs, and local state created by hooks are private to this user.
umask 077
SIGN_IDENTITY="alexandria-payload-signing"

# Host-supplied transcript_path must be a regular user-owned file under a
# supported host root. Missing helper = fail closed (do not copy).
if [ -f "$RUNTIME_DIR/scripts/transcript_path.sh" ]; then
  # shellcheck source=/dev/null
  . "$RUNTIME_DIR/scripts/transcript_path.sh"
else
  safe_transcript_path() { return 1; }
fi

# Setup activates every harness atomically only after its complete core passes
# functional probes. A failed install/update may leave files for recovery, but
# must not leave a mixed set of hooks running.
if [ ! -f "$RUNTIME_DIR/.setup_complete" ]; then
  [ "$MODE" = "session-start" ] && echo "alexandria: setup incomplete — hooks are off; re-run the verified setup"
  exit 0
fi

PAYLOAD_FILE="$RUNTIME_DIR/.hooks_payload"
MARKER_FILE="$RUNTIME_DIR/.payload_verified_sha"
VERSION_FILE="$RUNTIME_DIR/.factory_version"

# ── Helpers ──────────────────────────────────────────────────────
# All file operations work on byte-exact tempfiles (NOT bash string vars —
# command substitution strips trailing newlines, which breaks hash matching).

sha_of() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" 2>/dev/null | cut -d' ' -f1
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" 2>/dev/null | cut -d' ' -f1
  fi
}

# fetch_verified_manifest: fetch manifest + sig, verify the signature against
# the Touch ID key, cache the manifest to .canon_manifest (payload.sh uses it
# for canon verification). Echoes "ok:<tempfile path>" (caller removes it) or
# "fail:<reason>".
fetch_verified_manifest() {
  local manifest_file sig_file version installed manifest_cache version_tmp

  if ! command -v ssh-keygen >/dev/null 2>&1; then
    echo "fail:no-ssh-keygen"; return
  fi
  if [ ! -f "$SIGNERS_FILE" ]; then
    echo "fail:no-allowed-signers"; return
  fi

  # Explicit template — bare mktemp fails on shells/environments where TMPDIR
  # is unset or unwritable; payload.sh uses the same pattern.
  manifest_file=$(mktemp "${TMPDIR:-/tmp}/alexandria.XXXXXX" 2>/dev/null) || { echo "fail:mktemp"; return; }
  sig_file=$(mktemp "${TMPDIR:-/tmp}/alexandria.XXXXXX" 2>/dev/null) || { rm -f "$manifest_file"; echo "fail:mktemp"; return; }

  if ! curl -sf --max-time 5 "$MANIFEST_URL" -o "$manifest_file" 2>/dev/null; then
    rm -f "$manifest_file" "$sig_file"; echo "fail:manifest-fetch"; return
  fi
  if ! curl -sf --max-time 5 "$MANIFEST_SIG_URL" -o "$sig_file" 2>/dev/null; then
    rm -f "$manifest_file" "$sig_file"; echo "fail:sig-fetch"; return
  fi
  # Defensive: ssh-keygen errors on empty inputs in unhelpful ways
  if [ ! -s "$manifest_file" ] || [ ! -s "$sig_file" ]; then
    rm -f "$manifest_file" "$sig_file"; echo "fail:empty-fetch"; return
  fi

  if ! ssh-keygen -Y verify \
        -f "$SIGNERS_FILE" \
        -I "$SIGN_IDENTITY" \
        -n "$SIGN_NAMESPACE" \
        -s "$sig_file" \
        < "$manifest_file" >/dev/null 2>&1; then
    rm -f "$manifest_file" "$sig_file"; echo "fail:bad-signature"; return
  fi

  version=$(awk '$1=="#" && $2=="alexandria-factory-version" {print $3; exit}' "$manifest_file")
  case "$version" in ''|*[!0-9]*) rm -f "$manifest_file" "$sig_file"; echo "fail:missing-version"; return ;; esac
  installed=$(cat "$VERSION_FILE" 2>/dev/null)
  if [ -n "$installed" ]; then
    case "$installed" in ''|*[!0-9]*) rm -f "$manifest_file" "$sig_file"; echo "fail:bad-local-version"; return ;; esac
    if [ "$version" -lt "$installed" ]; then
      rm -f "$manifest_file" "$sig_file"; echo "fail:signed-rollback"; return
    fi
  fi

  manifest_cache="$RUNTIME_DIR/.canon_manifest.tmp.$$"
  version_tmp="$VERSION_FILE.tmp.$$"
  if ! cp "$manifest_file" "$manifest_cache" \
     || ! mv "$manifest_cache" "$RUNTIME_DIR/.canon_manifest" \
     || ! printf '%s\n' "$version" > "$version_tmp" \
     || ! mv "$version_tmp" "$VERSION_FILE"; then
    rm -f "$manifest_file" "$sig_file" "$manifest_cache" "$version_tmp"
    echo "fail:pin-version"; return
  fi
  rm -f "$sig_file"
  echo "ok:$manifest_file"
}

# verify_payload_file: verify the given payload file's SHA-256 against the
# signed manifest. Echoes "ok" or "fail:<reason>".
verify_payload_file() {
  local payload_file="$1" res manifest_file expected_sha actual_sha

  res=$(fetch_verified_manifest)
  case "$res" in
    ok:*) manifest_file="${res#ok:}" ;;
    *) echo "$res"; return ;;
  esac

  expected_sha=$(awk '$2=="factory/hooks/payload.sh" {print $1}' "$manifest_file")
  rm -f "$manifest_file"
  if [ -z "$expected_sha" ]; then
    echo "fail:no-payload-entry"; return
  fi

  actual_sha=$(sha_of "$payload_file")
  if [ -z "$actual_sha" ]; then
    echo "fail:no-sha256-tool"; return
  fi
  if [ "$expected_sha" != "$actual_sha" ]; then
    echo "fail:hash-mismatch"; return
  fi
  echo "ok"
}

# payload_runnable: the pinned payload exists AND its sha matches the verified
# marker. The one gate every mode uses — unverified code never executes.
payload_runnable() {
  [ -f "$PAYLOAD_FILE" ] || return 1
  [ -f "$MARKER_FILE" ] || return 1
  [ "$(cat "$MARKER_FILE" 2>/dev/null)" = "$(sha_of "$PAYLOAD_FILE")" ]
}

# ─── SESSION START ───────────────────────────────────────────────

# Codex distinguishes plain SessionStart stdout (hidden developer context) from
# `systemMessage` (a host-rendered UI event). Keep the trusted hook definition
# stable, detect Codex from its documented input shape, and adapt the
# same signed payload into that JSON shape here. Other hosts keep the portable
# plain-context path below.
if [ "$MODE" = "session-start" ]; then
  session_start_input=$(cat 2>/dev/null)
  is_codex_session=false
  if printf '%s' "$session_start_input" | grep -Eq '"model"[[:space:]]*:'; then
    is_codex_session=true
  fi

  if [ "$is_codex_session" = "true" ]; then
    codex_start_source=$(printf '%s' "$session_start_input" | \
      sed -n 's/.*"source"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
    visible_cue_owner=$(printf '%s' "$session_start_input" | \
      sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | \
      tr -cd 'A-Za-z0-9._-')
    [ -n "$visible_cue_owner" ] || visible_cue_owner=codex
    visible_cue_fd=""
    case "$codex_start_source" in
      startup|resume|clear) visible_cue_fd=3 ;;
    esac

    context_file=$(mktemp "${TMPDIR:-/tmp}/alexandria-context.XXXXXX" 2>/dev/null) || exit 0
    cue_file=$(mktemp "${TMPDIR:-/tmp}/alexandria-cue.XXXXXX" 2>/dev/null) || {
      rm -f "$context_file"
      exit 0
    }

    # FD 3 is an internal one-line side channel. It lets payload.sh keep the
    # eligibility and once-per-day decision in one source without placing the
    # cue inside model context first.
    ALEXANDRIA_HOST_VISIBLE_CUE=1 \
      ALEXANDRIA_HOST_VISIBLE_CUE_FD="$visible_cue_fd" \
      ALEXANDRIA_VISIBLE_CUE_OWNER="$visible_cue_owner" \
      bash "$0" session-start-context \
      > "$context_file" 3> "$cue_file"

    if python3 - "$context_file" "$cue_file" <<'PY'
import json
import pathlib
import sys

context = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8", errors="replace")
cue = pathlib.Path(sys.argv[2]).read_text(encoding="utf-8", errors="replace").strip()
output = {
    "hookSpecificOutput": {
        "hookEventName": "SessionStart",
        "additionalContext": context,
    }
}
if cue:
    output["systemMessage"] = cue
print(json.dumps(output, ensure_ascii=False))
PY
    then
      if [ -s "$cue_file" ] && [ -x "$RUNTIME_DIR/scripts/statusline.sh" ]; then
        ALEXANDRIA_HOME="$ALEX_DIR" ALEXANDRIA_RUNTIME="$RUNTIME_DIR" \
          bash "$RUNTIME_DIR/scripts/statusline.sh" mark-footer-seen \
            "$visible_cue_owner" >/dev/null 2>&1 || true
      fi
    fi
    rm -f "$context_file" "$cue_file"
    exit 0
  fi
fi

if [ "$MODE" = "session-start" ] || [ "$MODE" = "session-start-context" ]; then
  # Codex caps SessionEnd at three seconds. Its end hook therefore writes a
  # local receipt only; the next SessionStart finishes the ordinary end work
  # (feedback delivery + git sync) before loading the new session. No daemon,
  # no unsupported async hook, and the transcript is already safe in the vault.
  CODEX_END_QUEUE="$ALEX_DIR/system/.codex_session_end_queue"
  if [ -d "$CODEX_END_QUEUE" ]; then
    for queued_end in "$CODEX_END_QUEUE"/*.json; do
      [ -f "$queued_end" ] || continue
      if bash "$0" session-end < "$queued_end"; then
        rm -f "$queued_end"
      fi
    done
    rmdir "$CODEX_END_QUEUE" 2>/dev/null || true
  fi

  # Ground-truth health signal: this line is reached only when Codex actually
  # ran the configured hook. The installer never fabricates trust from config.
  touch "$ALEX_DIR/system/.codex_session_start_ok" 2>/dev/null || true
  rm -f "$ALEX_DIR/system/.codex_session_start_needs_trust"

  run_file=""
  run_state=""
  local_sha=""

  if [ -f "$PAYLOAD_FILE" ]; then
    local_sha=$(sha_of "$PAYLOAD_FILE")
    if [ -n "$local_sha" ] && [ -f "$MARKER_FILE" ] && [ "$(cat "$MARKER_FILE" 2>/dev/null)" = "$local_sha" ]; then
      # Pinned and previously verified — run it. No network needed to run.
      run_file="$PAYLOAD_FILE"; run_state="pinned"
    else
      # New or changed payload on disk (fresh install, an update the Author
      # just applied via the local verifier, or tampering). Verify against the
      # signed manifest BEFORE its first run — this is the pin moment.
      verify_result=$(verify_payload_file "$PAYLOAD_FILE")
      if [ "$verify_result" = "ok" ] && [ -n "$local_sha" ]; then
        printf '%s' "$local_sha" > "$MARKER_FILE"
        run_file="$PAYLOAD_FILE"; run_state="verified"
      else
        reason="${verify_result#fail:}"
        echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) shim: payload on disk not verified ($reason) — refusing to run it, bare mode" >> "$ALEX_DIR/system/.alexandria_errors"
        echo ""
        echo "--- ALEXANDRIA PAYLOAD NOT VERIFIED ---"
        echo "The engine payload on disk hasn't passed the Touch ID signature check (reason: $reason)."
        echo "Refusing to run it. This session runs bare (your files only, no engine)."
        echo "Just installed or updated? Verification needs one fetch of the signed manifest —"
        echo "check your network and open a new session. If this persists, audit"
        echo "https://github.com/benmowinckel/alexandria and reinstall through the local verifier:"
        echo "  bash ~/.local/share/alexandria/scripts/verify-fetch.sh --run setup.sh"
        echo "--- END NOT VERIFIED ---"
        echo ""
      fi
    fi
  fi

  # Optional update check — NOTIFY ONLY, never applies. Without the explicit
  # marker there is no public update fetch and the pinned copy runs forever.
  # Separately approved connected features keep their own permission markers.
  if [ "$run_state" = "pinned" ] && [ -f "$ALEX_DIR/system/hooks/auto-update" ]; then
    res=$(fetch_verified_manifest)
    case "$res" in
      ok:*)
        mf="${res#ok:}"
        upstream_sha=$(awk '$2=="factory/hooks/payload.sh" {print $1}' "$mf")
        rm -f "$mf"
        # One notice per version — re-announcing an update the Author already
        # declined every session is the recurring-prompt defect. Track the
        # last-announced sha; stay quiet until upstream changes again.
        NOTICE_FILE="$ALEX_DIR/system/.update_notice_sha"
        if [ -n "$upstream_sha" ] && [ "$upstream_sha" != "$local_sha" ] \
           && [ "$(cat "$NOTICE_FILE" 2>/dev/null)" != "$upstream_sha" ]; then
          printf '%s' "$upstream_sha" > "$NOTICE_FILE"
          echo ""
          echo "--- ALEXANDRIA ENGINE UPDATE AVAILABLE (signed, not applied) ---"
          echo "A newer engine payload is published and its manifest passes the Touch ID"
          echo "signature check. Nothing has changed on this machine — it runs only what"
          echo "you've already approved. AGENT: mention this to the Author once; on their go,"
          echo "apply it through the local verifier (the new payload is verified before its"
          echo "first run):  bash ~/.local/share/alexandria/scripts/verify-fetch.sh --run setup.sh"
          echo "--- END UPDATE NOTICE ---"
          echo ""
        fi
        ;;
      *) : ;; # offline or verify failed — stay quiet; next session retries
    esac
  fi

  if [ -n "$run_file" ]; then
    ALEXANDRIA_RUNTIME_DIR="$RUNTIME_DIR" \
      ALEXANDRIA_HOST_VISIBLE_CUE="${ALEXANDRIA_HOST_VISIBLE_CUE:-0}" \
      ALEXANDRIA_HOST_VISIBLE_CUE_FD="${ALEXANDRIA_HOST_VISIBLE_CUE_FD:-}" \
      ALEXANDRIA_VISIBLE_CUE_OWNER="${ALEXANDRIA_VISIBLE_CUE_OWNER:-generic}" \
      bash "$run_file" session-start "$ALEX_DIR" "$API_KEY" "" "$run_state"
  else
    # Bare fallback — just inject constitution
    [ -d "$ALEX_DIR/files/constitution" ] && for f in "$ALEX_DIR/files/constitution/"*.md; do [ -f "$f" ] && cat "$f"; done
  fi

elif [ "$MODE" = "codex-session-end" ]; then
  # Codex SessionEnd has a hard three-second maximum. Do only bounded local
  # work here: save the transcript now, leave a receipt for SessionStart, exit.
  # The normal session-end path below remains the single behavior source.
  input=$(cat 2>/dev/null)
  tp=$(printf '%s' "$input" | grep -oE '"transcript_path"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
  sid=$(printf '%s' "$input" | grep -oE '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4 | tr -cd 'A-Za-z0-9._-')
  [ -n "$sid" ] || sid="session"
  timestamp=$(date +%Y-%m-%d_%H-%M-%S)

  if [ -n "$tp" ] && safe_transcript_path "$tp"; then
    mkdir -p "$ALEX_DIR/files/vault" 2>/dev/null
    cp "$tp" "$ALEX_DIR/files/vault/${timestamp}_codex_${sid}.jsonl" 2>/dev/null || true
  fi

  CODEX_END_QUEUE="$ALEX_DIR/system/.codex_session_end_queue"
  mkdir -p "$CODEX_END_QUEUE" 2>/dev/null
  printf '{"transcript_path":""}\n' > "$CODEX_END_QUEUE/${timestamp}_${sid}_$$.json"
  touch "$ALEX_DIR/system/.codex_session_end_ok" 2>/dev/null || true
  rm -f "$ALEX_DIR/system/.codex_session_end_needs_trust"

elif [ "$MODE" = "session-end" ]; then
  # Clean up active session marker
  was_active=false
  [ -f "$ALEX_DIR/system/.active_session" ] && was_active=true && rm -f "$ALEX_DIR/system/.active_session"

  # Read stdin — portable timeout (macOS lacks GNU timeout)
  if command -v timeout &>/dev/null; then
    input=$(timeout 5 cat 2>/dev/null)
  else
    input=$(cat 2>/dev/null)
  fi
  # Optional whitespace after ':' — Cursor's python json.dumps emits
  # {"transcript_path": "/path"} (space), Claude Code may emit compact form.
  # A no-space-only grep silently dropped Cursor flushes (ok-but-vault-copy-unverified).
  tp=$(echo "$input" | grep -oE '"transcript_path"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
  if payload_runnable; then
    ALEXANDRIA_RUNTIME_DIR="$RUNTIME_DIR" ALEX_WAS_ACTIVE=$was_active bash "$PAYLOAD_FILE" session-end "$ALEX_DIR" "$API_KEY" "$tp"
  else
    # Bare fallback — just save transcript to vault
    [ -n "$tp" ] && safe_transcript_path "$tp" && mkdir -p "$ALEX_DIR/files/vault" && cp "$tp" "$ALEX_DIR/files/vault/$(date +%Y-%m-%d_%H-%M-%S).jsonl"
  fi

elif [ "$MODE" = "subagent" ]; then
  if payload_runnable; then
    ALEXANDRIA_RUNTIME_DIR="$RUNTIME_DIR" bash "$PAYLOAD_FILE" subagent "$ALEX_DIR"
  else
    # Bare fallback — just inject constitution
    [ -d "$ALEX_DIR/files/constitution" ] && for f in "$ALEX_DIR/files/constitution/"*.md; do [ -f "$f" ] && cat "$f"; done
  fi
fi

# A handled hook is successful even when its final optional test was false.
# Without this, a bare fallback could do its work and still be reported failed.
exit 0
