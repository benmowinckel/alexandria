#!/usr/bin/env bash
# Alexandria shim — one file, three modes, signature-verified payload.
# Immutable. Installed once. All evolving logic lives in signed payload.sh.
#
# Trust model: this shim is the root. It uses the allowed_signers file
# installed alongside (with the embedded public key) and refuses to exec
# anything not signed by the corresponding offline private key.
#   Audit: https://github.com/mowinckelb/alexandria/blob/main/TRUST.md
#   Inspect payload: https://raw.githubusercontent.com/mowinckelb/alexandria/main/factory/hooks/payload.sh

ALEX_DIR="${ALEXANDRIA_DIR:-$HOME/alexandria}"
API_KEY="${ALEXANDRIA_KEY:-$(cat "$ALEX_DIR/system/.api_key" 2>/dev/null)}"
MODE="$1"

GITHUB_RAW="${ALEX_GITHUB_RAW:-https://raw.githubusercontent.com/mowinckelb/alexandria/main}"
PAYLOAD_URL="$GITHUB_RAW/factory/hooks/payload.sh"
MANIFEST_URL="$GITHUB_RAW/factory/manifest.txt"
MANIFEST_SIG_URL="$GITHUB_RAW/factory/manifest.txt.sig"
SIGNERS_FILE="$ALEX_DIR/system/allowed_signers"
SIGN_NAMESPACE="alexandria"
SIGN_IDENTITY="alexandria-payload-signing"

# ── Verify helper ────────────────────────────────────────────────
# All file operations work on byte-exact tempfiles (NOT bash string vars —
# command substitution strips trailing newlines, which breaks hash matching).
# Echoes "ok" on success, "fail:<reason>" on any failure.
verify_payload_file() {
  local payload_file="$1"
  local manifest_file sig_file expected_sha actual_sha sha_tool

  if ! command -v ssh-keygen >/dev/null 2>&1; then
    echo "fail:no-ssh-keygen"; return
  fi
  if [ ! -f "$SIGNERS_FILE" ]; then
    echo "fail:no-allowed-signers"; return
  fi

  manifest_file=$(mktemp 2>/dev/null) || { echo "fail:mktemp"; return; }
  sig_file=$(mktemp 2>/dev/null) || { rm -f "$manifest_file"; echo "fail:mktemp"; return; }

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

  # Manifest is authentic. Look up the payload's expected sha and compare to
  # the actual sha of the file on disk.
  expected_sha=$(awk '$2=="factory/hooks/payload.sh" {print $1}' "$manifest_file")
  if [ -z "$expected_sha" ]; then
    rm -f "$manifest_file" "$sig_file"; echo "fail:no-payload-entry"; return
  fi

  if command -v shasum >/dev/null 2>&1; then
    sha_tool="shasum -a 256"
  elif command -v sha256sum >/dev/null 2>&1; then
    sha_tool="sha256sum"
  else
    rm -f "$manifest_file" "$sig_file"; echo "fail:no-sha256-tool"; return
  fi
  actual_sha=$($sha_tool "$payload_file" | cut -d' ' -f1)

  if [ "$expected_sha" != "$actual_sha" ]; then
    rm -f "$manifest_file" "$sig_file"; echo "fail:hash-mismatch"; return
  fi

  # Cache the verified manifest so payload.sh can use it for canon verification.
  cp "$manifest_file" "$ALEX_DIR/system/.canon_manifest"
  rm -f "$manifest_file" "$sig_file"
  echo "ok"
}

# ─── SESSION START ───────────────────────────────────────────────

if [ "$MODE" = "session-start" ]; then
  fresh=false
  payload_tmp=$(mktemp 2>/dev/null)

  # Continuous-update module (default on). If the Author deleted
  # ~/alexandria/system/hooks/auto-update, don't fetch a fresh payload — run the
  # cached one (which makes the same check and skips its canon fetch too). Net:
  # deleting that one file = zero contact with Alexandria, runs fully local.
  if [ -f "$ALEX_DIR/system/hooks/auto-update" ] && [ -n "$payload_tmp" ] && curl -sf --max-time 5 "$PAYLOAD_URL" -o "$payload_tmp" 2>/dev/null; then
    fetch_status=0
    # Defensive: HTML 404 pages could satisfy a naive size check
    if [ -s "$payload_tmp" ] && [ "$(wc -c < "$payload_tmp")" -gt 100 ]; then
      verify_result=$(verify_payload_file "$payload_tmp")
      if [ "$verify_result" = "ok" ]; then
        cp "$payload_tmp" "$ALEX_DIR/system/.hooks_payload"
        fresh=true
      else
        reason="${verify_result#fail:}"
        echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) shim signature verify failed: $reason — using cached payload if available" >> "$ALEX_DIR/system/.alexandria_errors"
        echo ""
        echo "--- ALEXANDRIA SIGNATURE VERIFY FAILED ---"
        echo "Fresh payload from GitHub did not pass signature check (reason: $reason)."
        echo "Falling back to cached payload (previously verified)."
        echo "If this persists across sessions, audit https://github.com/mowinckelb/alexandria"
        echo "and reinstall: curl -fsSL $GITHUB_RAW/factory/setup.sh | bash"
        echo "--- END VERIFY FAILED ---"
        echo ""
      fi
    fi
  else
    fetch_status=$?
  fi
  rm -f "$payload_tmp"

  payload_file="$ALEX_DIR/system/.hooks_payload"
  if [ "$fresh" != "true" ] && [ -f "$payload_file" ]; then
    # Either fetch or verify failed — fall back to cached payload (verified
    # when it was cached). Hard cutoff at 14d: cache older than that likely
    # predates current protocol guarantees.
    mtime=$(stat -f %m "$payload_file" 2>/dev/null || stat -c %Y "$payload_file" 2>/dev/null || echo 0)
    now=$(date -u +%s)
    if [ "$mtime" -gt 0 ]; then cache_age_days=$(( (now - mtime) / 86400 )); else cache_age_days=999; fi

    if [ "$cache_age_days" -ge 14 ]; then
      rm -f "$payload_file"
      echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) shim payload fetch/verify failed (curl=${fetch_status:-?}); cache ${cache_age_days}d old — deleted, bare mode" >> "$ALEX_DIR/system/.alexandria_errors"
      echo ""
      echo "--- ALEXANDRIA CACHE EXPIRED ---"
      echo "Cached hooks payload was ${cache_age_days} days old (max 14); fresh fetch failed."
      echo "Deleted stale cache. Running bare mode (constitution only, no protocol calls)."
      echo "Reinstall: curl -fsSL $GITHUB_RAW/factory/setup.sh | bash"
      echo "--- END EXPIRED ---"
      echo ""
      payload_file=""
    else
      fresh=stale
    fi
  elif [ "$fresh" != "true" ]; then
    payload_file=""
  fi

  if [ -n "$payload_file" ] && [ -f "$payload_file" ]; then
    bash "$payload_file" session-start "$ALEX_DIR" "$API_KEY" "" "$fresh"
  else
    # Bare fallback — just inject constitution
    [ -d "$ALEX_DIR/files/constitution" ] && for f in "$ALEX_DIR/files/constitution/"*.md; do [ -f "$f" ] && cat "$f"; done
  fi

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
  tp=$(echo "$input" | grep -o '"transcript_path":"[^"]*"' | cut -d'"' -f4)
  if [ -f "$ALEX_DIR/system/.hooks_payload" ]; then
    ALEX_WAS_ACTIVE=$was_active bash "$ALEX_DIR/system/.hooks_payload" session-end "$ALEX_DIR" "$API_KEY" "$tp"
  else
    # Bare fallback — just save transcript to vault
    [ -n "$tp" ] && [ -f "$tp" ] && mkdir -p "$ALEX_DIR/files/vault" && cp "$tp" "$ALEX_DIR/files/vault/$(date +%Y-%m-%d_%H-%M-%S).jsonl"
  fi

elif [ "$MODE" = "subagent" ]; then
  if [ -f "$ALEX_DIR/system/.hooks_payload" ]; then
    bash "$ALEX_DIR/system/.hooks_payload" subagent "$ALEX_DIR"
  else
    # Bare fallback — just inject constitution
    [ -d "$ALEX_DIR/files/constitution" ] && for f in "$ALEX_DIR/files/constitution/"*.md; do [ -f "$f" ] && cat "$f"; done
  fi
fi
