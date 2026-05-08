#!/usr/bin/env bash
# Alexandria Hooks Payload — live, auto-updating
# Source: https://raw.githubusercontent.com/mowinckelb/alexandria/main/factory/hooks/payload.sh
# The canon is public on GitHub (factory/canon/ folder). No signing needed.

MODE="$1"
ALEX_DIR="$2"
API_KEY="$3"
EXTRA="$4"
SERVER="https://api.mowinckel.ai"
CANON_GITHUB="https://raw.githubusercontent.com/mowinckelb/alexandria/main/factory/canon"
PAYLOAD_FRESH="$5"

# Sent as X-Alexandria-Client on every authed POST. Server uses this to
# detect stale installs — unset = pre-versioning shim, drift = partial upgrade.
# Computed as a hash of the cached payload itself, so every meaningful change
# to payload.sh auto-bumps the version with zero manual touch.
if [ -f "$ALEX_DIR/system/.hooks_payload" ]; then
  if command -v sha256sum &>/dev/null; then
    CLIENT_VERSION=$(sha256sum "$ALEX_DIR/system/.hooks_payload" | cut -c1-7)
  elif command -v shasum &>/dev/null; then
    CLIENT_VERSION=$(shasum -a 256 "$ALEX_DIR/system/.hooks_payload" | cut -c1-7)
  else
    CLIENT_VERSION="unhashed"
  fi
else
  CLIENT_VERSION="no-cache"
fi

# ─── SESSION START ───────────────────────────────────────────────

if [ "$MODE" = "session-start" ]; then

  # Env vars
  if [ -n "$CLAUDE_ENV_FILE" ] && [ -n "$API_KEY" ]; then
    echo "export ALEXANDRIA_KEY=$API_KEY" >> "$CLAUDE_ENV_FILE"
    echo "export ALEXANDRIA_PLATFORM=cc" >> "$CLAUDE_ENV_FILE"
    echo "export ALEXANDRIA_CANON_OK=false" >> "$CLAUDE_ENV_FILE"
  fi

  mkdir -p "$ALEX_DIR/system/canon" "$ALEX_DIR/files/library/public" 2>/dev/null

  # Deterministic session identity (one id per CC session)
  session_id=$(node -e "const c=require('crypto');console.log(c.randomUUID ? c.randomUUID() : (Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10)));" 2>/dev/null)
  [ -z "$session_id" ] && session_id="$(date +%s)-$$"
  echo "$session_id" > "$ALEX_DIR/system/.cc_session_id"
  if [ -n "$CLAUDE_ENV_FILE" ]; then
    echo "export ALEXANDRIA_SESSION_ID=$session_id" >> "$CLAUDE_ENV_FILE"
  fi

  # Crash-recovery for hard terminal closes:
  # Clean up stale markers from previous session.
  cc_marker="$ALEX_DIR/system/.cc_session_open"
  if [ -f "$cc_marker" ]; then
    rm -f "$ALEX_DIR/system/.active_session"
    rm -f "$cc_marker"
  fi
  echo "$session_id" > "$cc_marker"

  # ── Canon fetch ──
  # Seven modules: axioms, methodology, editor, mercury, publisher, library, filter.
  # Each cached as .canon_local_<name>. Methodology remains the entry point;
  # the others are fetched for local availability so the Engine can reference them offline.
  # On methodology change vs last cached, write a diff notice for the Engine to review —
  # the Author's consent layer lives in canon_overrides.md (authoritative over canon).
  canon=""
  canon_ok=false
  for module in axioms methodology editor mercury publisher library filter; do
    fresh=$(curl -s --max-time 5 "$CANON_GITHUB/$module.md" 2>/dev/null)
    if [ -n "$fresh" ] && [ ${#fresh} -gt 100 ]; then
      if [ "$module" = "methodology" ] && [ -f "$ALEX_DIR/system/canon/methodology.md" ] && ! diff -q <(printf '%s' "$fresh") "$ALEX_DIR/system/canon/methodology.md" >/dev/null 2>&1; then
        {
          echo "# Canon updated — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
          echo ""
          echo "Upstream canon (factory/canon/methodology.md) changed. Review the diff below and decide per-Author fit. If any change conflicts with this Author's practice, add/refine entries in ~/alexandria/canon_overrides.md — overrides are authoritative over upstream canon. Clear this file when reviewed."
          echo ""
          echo "## Diff (first 200 lines)"
          echo ""
          diff -u "$ALEX_DIR/system/canon/methodology.md" <(printf '%s' "$fresh") 2>/dev/null | head -n 200
        } > "$ALEX_DIR/system/.canon_update_notice"
      fi
      printf '%s' "$fresh" > "$ALEX_DIR/system/canon/$module.md"
      [ "$module" = "methodology" ] && canon="$fresh" && canon_ok=true
    fi
  done
  if [ "$canon_ok" = "false" ] && [ -f "$ALEX_DIR/system/canon/methodology.md" ]; then
    canon=$(cat "$ALEX_DIR/system/canon/methodology.md")
  fi
  [ -n "$CLAUDE_ENV_FILE" ] && [ "$canon_ok" = "true" ] && echo "export ALEXANDRIA_CANON_OK=true" >> "$CLAUDE_ENV_FILE"

  # ── Git sync: push local, pull overnight changes ──
  if [ -d "$ALEX_DIR/.git" ] && git -C "$ALEX_DIR" remote get-url origin &>/dev/null; then
    (cd "$ALEX_DIR" && git add -A && { git diff --cached --quiet || git commit -q -m "sync: $(date +%Y-%m-%d_%H-%M)"; }) 2>/dev/null
    git -C "$ALEX_DIR" push -q 2>/dev/null || true
    git -C "$ALEX_DIR" pull --rebase -q 2>/dev/null || true
  fi

  # ── Autoloop relay: git ground truth → dashboard ──
  # Autoloop activity is proven by protocol calls. Dedup marker still useful for local state.
  if [ -d "$ALEX_DIR/.git" ]; then
    latest_autoloop=$(git -C "$ALEX_DIR" log -1 --format='%H' --grep='autoloop:' 2>/dev/null)
    [ -n "$latest_autoloop" ] && echo "$latest_autoloop" > "$ALEX_DIR/system/.autoloop_relayed"
  fi

  # ── Nudges ──
  # Markers only — Engine composes any user-facing text per canon.
  # .nudge_pending: written at prior session-end if the session wasn't active.
  # signal.md: observations accumulated from passive sessions — Engine reads directly.
  # Canon instructs the Engine to check these at session start and respond appropriately.

  # Sync errors surfacing — any failed POSTs since last clean session.
  # Raw tail injected; Engine decides what to act on, clears what it handles.
  # Conflict markers (`<<<<<<<` / `=======` / `>>>>>>>`) are filtered out and
  # surfaced as a single warning — dumping them inline reads as prompt injection
  # and corrupts hook output. Root cause is the file being git-tracked despite
  # being ephemeral; the right fix is `git rm --cached system/.alexandria_errors`
  # in each Author's repo (system/.* in .gitignore covers new installs).
  if [ -f "$ALEX_DIR/system/.alexandria_errors" ] && [ -s "$ALEX_DIR/system/.alexandria_errors" ]; then
    err_count=$(wc -l < "$ALEX_DIR/system/.alexandria_errors" 2>/dev/null | tr -d ' ')
    if [ "${err_count:-0}" -gt 0 ]; then
      if grep -qE '^(<<<<<<<|=======$|>>>>>>>)' "$ALEX_DIR/system/.alexandria_errors" 2>/dev/null; then
        echo "alexandria: .alexandria_errors contains unresolved git conflict markers — Engine, repair (drop markers, keep both blocks chronologically). Sanitised tail below:"
      else
        echo "alexandria: $err_count sync errors pending (tail below — Engine, investigate and clear .alexandria_errors when resolved):"
      fi
      grep -vE '^(<<<<<<<|=======$|>>>>>>>)' "$ALEX_DIR/system/.alexandria_errors" 2>/dev/null | tail -n 5
    fi
  fi

  # Canon update notice — upstream canon changed since last session.
  # Engine reviews, updates canon_overrides.md if anything should be overridden for this Author, clears the notice.
  if [ -f "$ALEX_DIR/system/.canon_update_notice" ] && [ -s "$ALEX_DIR/system/.canon_update_notice" ]; then
    echo ""
    echo "--- CANON UPDATE PENDING REVIEW ---"
    cat "$ALEX_DIR/system/.canon_update_notice"
    echo "--- END CANON UPDATE ---"
    echo ""
  fi

  # Installed factory artefacts drift check — notify, never override.
  # Pure marginal value add: if the Author's local skill file has drifted from
  # current factory (stale copy of a file that has since evolved), surface the
  # signal. The Author decides whether to sync by re-running setup.sh.
  # Sync is always explicit; we only watch.
  sha_cmd=""
  if command -v sha256sum &>/dev/null; then sha_cmd="sha256sum"
  elif command -v shasum &>/dev/null; then sha_cmd="shasum -a 256"
  fi
  if [ -n "$sha_cmd" ]; then
    drift_found=""
    check_drift() {
      local local_file="$1" factory_path="$2" label="$3"
      [ -f "$local_file" ] || return
      # Fetch to a tempfile so the byte-for-byte hash matches however the
      # local file is stored (printf '%s' "$var" strips trailing newlines,
      # which would false-positive every file that ends with one).
      local factory_tmp
      factory_tmp=$(mktemp 2>/dev/null) || return
      if ! curl -sf --max-time 3 "https://raw.githubusercontent.com/mowinckelb/alexandria/main/factory/$factory_path" -o "$factory_tmp" 2>/dev/null; then
        rm -f "$factory_tmp"
        return
      fi
      local factory_sha local_sha
      factory_sha=$($sha_cmd "$factory_tmp" | cut -c1-7)
      local_sha=$($sha_cmd "$local_file" | cut -c1-7)
      rm -f "$factory_tmp"
      if [ -n "$factory_sha" ] && [ -n "$local_sha" ] && [ "$factory_sha" != "$local_sha" ]; then
        drift_found="${drift_found}${label} (local=$local_sha, factory=$factory_sha)
"
      fi
    }
    check_drift "$HOME/.claude/skills/alexandria/SKILL.md" "skills/claudecode.md" "  /a skill (~/.claude/skills/alexandria/SKILL.md)"
    check_drift "$HOME/.claude/scheduled-tasks/alexandria/SKILL.md" "skills/scheduled-bootstrap.md" "  scheduled agent (~/.claude/scheduled-tasks/alexandria/SKILL.md)"
    check_drift "$HOME/.cursor/rules/alexandria.mdc" "skills/cursor.mdc" "  cursor rules (~/.cursor/rules/alexandria.mdc)"
    check_drift "$HOME/.cursor/hooks/alexandria-session-start.py" "hooks/cursor/alexandria-session-start.py" "  cursor session-start hook (~/.cursor/hooks/alexandria-session-start.py)"
    check_drift "$HOME/.cursor/hooks/alexandria-session-end.py" "hooks/cursor/alexandria-session-end.py" "  cursor session-end hook (~/.cursor/hooks/alexandria-session-end.py)"
    check_drift "$HOME/.cursor/hooks/alexandria-stop.py" "hooks/cursor/alexandria-stop.py" "  cursor stop hook (~/.cursor/hooks/alexandria-stop.py)"
    check_drift "$HOME/alexandria/system/hooks/shim.sh" "hooks/shim.sh" "  hook shim (~/alexandria/system/hooks/shim.sh)"

    # Codex case — block embedded between markers in a shared instructions.md.
    # Extract just the Alexandria section, compare to factory/skills/codex.md.
    if [ -f "$HOME/.codex/instructions.md" ] && grep -q "<!-- alexandria:start -->" "$HOME/.codex/instructions.md"; then
      codex_local_tmp=$(mktemp 2>/dev/null)
      codex_factory_tmp=$(mktemp 2>/dev/null)
      if [ -n "$codex_local_tmp" ] && [ -n "$codex_factory_tmp" ]; then
        sed -n '/<!-- alexandria:start -->/,/<!-- alexandria:end -->/p' "$HOME/.codex/instructions.md" > "$codex_local_tmp"
        if curl -sf --max-time 3 "https://raw.githubusercontent.com/mowinckelb/alexandria/main/factory/skills/codex.md" -o "$codex_factory_tmp" 2>/dev/null; then
          codex_local_sha=$($sha_cmd "$codex_local_tmp" | cut -c1-7)
          codex_factory_sha=$($sha_cmd "$codex_factory_tmp" | cut -c1-7)
          if [ -n "$codex_factory_sha" ] && [ -n "$codex_local_sha" ] && [ "$codex_factory_sha" != "$codex_local_sha" ]; then
            drift_found="${drift_found}  codex block (~/.codex/instructions.md) (local=$codex_local_sha, factory=$codex_factory_sha)
"
          fi
        fi
        rm -f "$codex_local_tmp" "$codex_factory_tmp"
      fi
    fi
    if [ -n "$drift_found" ]; then
      echo ""
      echo "--- INSTALLED ARTEFACT DRIFT ---"
      echo "Your local files differ from current factory. Not updating automatically — re-run the install block from https://mowinckel.ai/signup when you're ready to sync."
      echo ""
      printf '%s' "$drift_found"
      echo "--- END DRIFT ---"
      echo ""
    fi
  fi

  # ── Author context — pointer, not inline injection ──
  # Inlining the full constitution+ontology+machine+notepad+feedback was ~70KB,
  # which blows past harness output-truncation thresholds (Claude Code shows
  # only the first ~2KB inline before saving the rest to a side file the AI
  # has to discover). Net signal delivered ≈ 0 for the cost of a 70KB GitHub
  # payload fetch every session-start. Bitter-lesson move: tell the AI where
  # the canonical files live and let it Read what's relevant when it's relevant.
  # Files grow without bound; payload size stays flat; new harnesses inherit
  # the behaviour for free.

  # Fast existence check — only emit the block if the Author has substantive
  # content, otherwise the new-Author "BLOCK" path below should fire.
  has_constitution=false
  if [ -f "$ALEX_DIR/files/constitution/_constitution.md" ] \
     && [ "$(wc -c < "$ALEX_DIR/files/constitution/_constitution.md" | tr -d ' ')" -gt 200 ]; then
    has_constitution=true
  elif [ -d "$ALEX_DIR/files/constitution" ]; then
    for f in "$ALEX_DIR/files/constitution/"*.md; do
      [ -f "$f" ] && [ "$(basename "$f")" != "README.md" ] \
        && [ "$(wc -c < "$f" | tr -d ' ')" -gt 200 ] && has_constitution=true && break
    done
  fi

  # ── The Block (first-session onboarding) ──
  if [ ! -f "$ALEX_DIR/system/.block_complete" ]; then
    if [ "$has_constitution" = "true" ]; then
      touch "$ALEX_DIR/system/.block_complete"
    else
      echo ""
      echo "--- THE BLOCK ---"
      echo ""
      echo "New Author. Constitution empty. First impression. Read everything available — AI memory, files, conversation history — and do what you think is best. The canon is loaded if available."
      echo ""
      echo "--- END BLOCK ---"
      echo ""
    fi
  fi

  if [ -f "$ALEX_DIR/system/.block_complete" ] && [ "$has_constitution" = "true" ]; then
    echo ""
    echo "--- AUTHOR CONTEXT (read-only — do not override existing workflows or memory) ---"
    echo "Author files live at ~/alexandria/files/. Read what's relevant for the moment, not everything every time. Prefer derivatives (underscore-prefixed: _constitution.md, _ontology.md, _notepad.md, _feedback.md) when they exist — they are the compressed working copy. Fall back to sources when the derivative is missing."
    echo ""
    echo "  constitution/  — beliefs (Core.md first); _constitution.md is the derivative"
    echo "  ontology/      — Author's working thoughts (not yet confirmed beliefs); _ontology.md derivative"
    echo "  core/machine.md — how to work with this Author"
    echo "  core/notepad.md (or _notepad.md) — Engine working memory, parked questions, loaded magazine"
    echo "  core/feedback.md (or _feedback.md) — corrections + confirmed approaches"
    echo "  core/agent.md  — Author preferences for AI behaviour"
    [ -f "$ALEX_DIR/canon_overrides.md" ] \
      && echo "  canon_overrides.md — AUTHORITATIVE over upstream canon when they conflict; read first"
    echo ""
    echo "Alexandria passive mode active. Follow the canon's passive mode instructions. If the Author mentions Alexandria feedback, write to .session_feedback — it reaches the team at session end."
  fi

  # ── The Call (protocol obligation) ──
  # Report which factory modules this machine uses, derived from what's on disk.
  # The .call_manifest file is written by the Engine during /a sessions.
  # Default: methodology (the factory default). The Engine evolves this.
  if [ -n "$API_KEY" ]; then
    mkdir -p "$ALEX_DIR/files/library/public" 2>/dev/null

    # ── The File (protocol obligation) ──
    # Only final shadow.md is consent. shadow_proposal.md is machine draft and
    # is never published automatically. Publishing the final file keeps the
    # server-side monthly file obligation current without making the Author
    # remember API details.
    shadow_file="$ALEX_DIR/files/library/public/shadow.md"
    if [ -f "$shadow_file" ] && [ -s "$shadow_file" ]; then
      shadow_sha=""
      if command -v sha256sum &>/dev/null; then
        shadow_sha=$(sha256sum "$shadow_file" | cut -d' ' -f1)
      elif command -v shasum &>/dev/null; then
        shadow_sha=$(shasum -a 256 "$shadow_file" | cut -d' ' -f1)
      fi
      last_shadow_sha=$(cat "$ALEX_DIR/system/.shadow_published_sha" 2>/dev/null)
      if [ -z "$shadow_sha" ] || [ "$shadow_sha" != "$last_shadow_sha" ]; then
        (
          content_json=$(node -e "process.stdout.write(JSON.stringify(require('fs').readFileSync(process.argv[1],'utf8')))" "$shadow_file" 2>/dev/null)
          text_json=$(node -e "const fs=require('fs'); const s=fs.readFileSync(process.argv[1],'utf8').replace(/\\s+/g,' ').trim().slice(0,500); process.stdout.write(JSON.stringify(s));" "$shadow_file" 2>/dev/null)
          if [ -n "$content_json" ]; then
            status=$(curl -s --max-time 4 -o /dev/null -w '%{http_code}' -X PUT "$SERVER/file/shadow" \
              -H "Authorization: Bearer $API_KEY" \
              -H "X-Alexandria-Client: $CLIENT_VERSION" \
              -H "Content-Type: application/json" \
              -d "{\"content\":$content_json,\"text\":${text_json:-null},\"visibility\":\"public\"}" 2>/dev/null || echo "000")
            if [ "$status" = "200" ]; then
              [ -n "$shadow_sha" ] && echo "$shadow_sha" > "$ALEX_DIR/system/.shadow_published_sha"
              date -u +%Y-%m-%dT%H:%M:%SZ > "$ALEX_DIR/system/.shadow_published_at"
            else
              echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) file PUT failed status=$status" >> "$ALEX_DIR/system/.alexandria_errors"
            fi
          fi
        ) &
      fi
    fi

    # Server status drives reminders. The Engine drafts; the Author approves.
    status_json=$(curl -s --max-time 4 -H "Authorization: Bearer $API_KEY" "$SERVER/alexandria" 2>/dev/null)
    if [ -n "$status_json" ]; then
      printf '%s' "$status_json" > "$ALEX_DIR/system/.protocol_status.json"
      file_status=$(printf '%s' "$status_json" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{try{let j=JSON.parse(s);process.stdout.write(j.obligations?.file_status||'unknown')}catch{process.stdout.write('unknown')}})" 2>/dev/null)
      file_due=$(printf '%s' "$status_json" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{try{let j=JSON.parse(s);process.stdout.write(j.obligations?.file_due||'')}catch{}})" 2>/dev/null)
      due_days=$(printf '%s' "$file_due" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{let t=Date.parse(s.trim()); if(!Number.isFinite(t)) return; console.log(Math.ceil((t-Date.now())/86400000));})" 2>/dev/null)
      if [ "$file_status" = "missing" ] || [ "$file_status" = "stale" ] || { [ -n "$due_days" ] && [ "$due_days" -le 7 ]; }; then
        {
          echo "PUBLIC SHADOW REVIEW — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
          echo "file_status: ${file_status:-unknown}"
          [ -n "$file_due" ] && echo "file_due: $file_due"
          [ -n "$due_days" ] && echo "days_until_due: $due_days"
          echo ""
          echo "High priority: refresh ~/alexandria/files/library/public/shadow_proposal.md as a complete public shadow draft. The standard is what the Author would say to an intelligent stranger. Do not publish private material. Ask the Author to approve/edit by saving the final version as ~/alexandria/files/library/public/shadow.md. The hook publishes only final shadow.md."
        } > "$ALEX_DIR/system/.public_shadow_review"
      fi
    fi

    if [ -f "$ALEX_DIR/system/.public_shadow_review" ] && [ -s "$ALEX_DIR/system/.public_shadow_review" ]; then
      echo ""
      echo "--- PUBLIC SHADOW REVIEW ---"
      cat "$ALEX_DIR/system/.public_shadow_review"
      echo "--- END PUBLIC SHADOW REVIEW ---"
      echo ""
    fi

    call_payload='{"modules":[{"id":"github:mowinckelb/alexandria#factory/canon/axioms","text":"default canon module"},{"id":"github:mowinckelb/alexandria#factory/canon/methodology","text":"default canon module"},{"id":"github:mowinckelb/alexandria#factory/canon/editor","text":"default canon module"},{"id":"github:mowinckelb/alexandria#factory/canon/mercury","text":"default canon module"},{"id":"github:mowinckelb/alexandria#factory/canon/publisher","text":"default canon module"},{"id":"github:mowinckelb/alexandria#factory/canon/library","text":"default canon module"},{"id":"github:mowinckelb/alexandria#factory/canon/filter","text":"default canon module"}]}'
    if [ -f "$ALEX_DIR/.call_manifest" ]; then
      manifest=$(cat "$ALEX_DIR/.call_manifest" 2>/dev/null)
      [ -n "$manifest" ] && call_payload="$manifest"
    fi
    (
      status=$(curl -s --max-time 4 -o /dev/null -w '%{http_code}' -X POST "$SERVER/call" \
        -H "Authorization: Bearer $API_KEY" \
        -H "X-Alexandria-Client: $CLIENT_VERSION" \
        -H "Content-Type: application/json" \
        -d "$call_payload" 2>/dev/null || echo "000")
      [ "$status" = "200" ] || echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) call POST failed status=$status" >> "$ALEX_DIR/system/.alexandria_errors"
    ) &
  fi

fi

# ─── SESSION END ─────────────────────────────────────────────────

if [ "$MODE" = "session-end" ]; then

  # Detect active session — shim passes ALEX_WAS_ACTIVE if it already handled it
  was_active=false
  session_id=$(cat "$ALEX_DIR/system/.cc_session_id" 2>/dev/null)
  [ -z "$session_id" ] && session_id="unknown"
  rm -f "$ALEX_DIR/system/.cc_session_open"
  if [ -f "$ALEX_DIR/system/.active_session" ]; then
    was_active=true
    rm -f "$ALEX_DIR/system/.active_session"
  elif [ "$ALEX_WAS_ACTIVE" = "true" ]; then
    was_active=true
  fi

  # Marker only if session was NOT active — Engine composes nudge text per canon at next session start
  if [ "$was_active" = "false" ]; then
    touch "$ALEX_DIR/system/.nudge_pending"
  fi

  # Transcript → vault
  transcript_path="$EXTRA"
  if [ -n "$transcript_path" ] && [ -f "$transcript_path" ]; then
    timestamp=$(date +%Y-%m-%d_%H-%M-%S)
    vault_file="$ALEX_DIR/files/vault/${timestamp}.jsonl"
    mkdir -p "$ALEX_DIR/files/vault" 2>/dev/null
    cp "$transcript_path" "$vault_file"
  fi

  # Collect machine signal + feedback (parallel, delete only on 200)
  if [ -n "$API_KEY" ]; then
    json_escape() { node -e "process.stdout.write(JSON.stringify(require('fs').readFileSync(process.argv[1],'utf8')))" "$1" 2>/dev/null; }

    machine_signal_file="$ALEX_DIR/system/.machine_signal"
    feedback_file="$ALEX_DIR/system/.session_feedback"
    [ ! -f "$feedback_file" ] && [ -f "$ALEX_DIR/.session_feedback" ] && feedback_file="$ALEX_DIR/.session_feedback"
    signal_pid=""
    feedback_pid=""

    # Launch both POSTs in parallel
    if [ -f "$machine_signal_file" ] && [ -s "$machine_signal_file" ]; then
      signal_json=$(json_escape "$machine_signal_file")
      if [ -n "$signal_json" ]; then
        curl -sf --max-time 4 -X POST "$SERVER/marketplace/signal" \
          -H "Authorization: Bearer $API_KEY" \
          -H "X-Alexandria-Client: $CLIENT_VERSION" \
          -H "Content-Type: application/json" \
          -d "{\"signal\":$signal_json}" -o /dev/null 2>/dev/null &
        signal_pid=$!
      fi
    fi

    if [ -f "$feedback_file" ] && [ -s "$feedback_file" ]; then
      fb_json=$(json_escape "$feedback_file")
      if [ -n "$fb_json" ]; then
        curl -sf --max-time 4 -X POST "$SERVER/feedback" \
          -H "Authorization: Bearer $API_KEY" \
          -H "X-Alexandria-Client: $CLIENT_VERSION" \
          -H "Content-Type: application/json" \
          -d "{\"text\":$fb_json,\"context\":\"session_end\"}" -o /dev/null 2>/dev/null &
        feedback_pid=$!
      fi
    fi

    # Wait and delete only on success (curl -f exits non-zero on HTTP errors).
    # On failure, log loudly so next session-start surfaces it to the Engine.
    [ -n "$signal_pid" ] && { wait "$signal_pid" 2>/dev/null && rm -f "$machine_signal_file" \
      || echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) signal POST failed" >> "$ALEX_DIR/system/.alexandria_errors"; }
    [ -n "$feedback_pid" ] && { wait "$feedback_pid" 2>/dev/null && rm -f "$feedback_file" \
      || echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) feedback POST failed" >> "$ALEX_DIR/system/.alexandria_errors"; }
  fi

  # Git sync
  if [ -d "$ALEX_DIR/.git" ] && git -C "$ALEX_DIR" remote get-url origin &>/dev/null; then
    (cd "$ALEX_DIR" && git add -A && { git diff --cached --quiet || git commit -q -m "session: $(date +%Y-%m-%d_%H-%M)"; } && git push -q) &>/dev/null &
  fi

fi

# ─── SUBAGENT CONTEXT ────────────────────────────────────────────

if [ "$MODE" = "subagent" ]; then
  # Pointer, not inline injection. Same reasoning as session-start: dumping
  # the full constitution+ontology+notepad+feedback every subagent invocation
  # is ~70KB the harness mostly truncates and the subagent could Read on demand
  # anyway. Bitter-lesson move: tell the subagent where the files are, let it
  # decide what's relevant for its task.

  # Only emit if the Author actually has content — new-Author repos with empty
  # constitution shouldn't trigger a misleading pointer.
  has_content=false
  for f in "$ALEX_DIR/files/constitution/_constitution.md" \
           "$ALEX_DIR/files/constitution/Core.md" \
           "$ALEX_DIR/files/core/machine.md"; do
    [ -f "$f" ] && [ "$(wc -c < "$f" | tr -d ' ')" -gt 200 ] && has_content=true && break
  done

  if [ "$has_content" = "true" ]; then
    echo "--- AUTHOR CONTEXT (from Alexandria) ---"
    echo "Author files live at ~/alexandria/files/. Prefer derivatives (underscore-prefixed) when they exist; fall back to sources."
    echo ""
    echo "  constitution/  — beliefs (Core.md first); _constitution.md derivative"
    echo "  ontology/      — Author's working thoughts; _ontology.md derivative"
    echo "  core/machine.md — how to work with this Author"
    echo "  core/notepad.md (or _notepad.md) — Engine working memory, parked threads"
    echo "  core/feedback.md (or _feedback.md) — corrections + confirmed approaches"
    echo "  core/agent.md  — Author preferences for AI behaviour"
    [ -f "$ALEX_DIR/canon_overrides.md" ] \
      && echo "  canon_overrides.md — AUTHORITATIVE over upstream canon; read first"
    echo ""
    echo "Read only what's relevant to your task."
  fi
fi
