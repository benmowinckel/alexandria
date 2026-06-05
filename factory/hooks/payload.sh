#!/usr/bin/env bash
# Alexandria Hooks Payload — live, auto-updating
# Source: https://raw.githubusercontent.com/mowinckelb/alexandria/main/factory/hooks/payload.sh
# The canon is public on GitHub (factory/canon/ folder). No signing needed.

MODE="$1"
ALEX_DIR="$2"
API_KEY="$3"
EXTRA="$4"
SERVER="https://api.alexandria-library.com"
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

  # ── Canon ──
  # Factory ships the starter canon at install. After install, ~/alexandria/system/canon/
  # is the Author's sovereign system — never overwritten. Each session-start, fetch upstream
  # and diff against local; if local diverges, write a single notice the Engine surfaces so
  # the Author can decide per module whether to integrate, partial-integrate, or ignore.
  # The notice regenerates each session and always reflects current divergence — if the
  # Author ignores one update and upstream changes again, the next notice shows everything
  # they haven't taken.
  canon=""
  canon_ok=false
  notice_body=""
  canon_fetch_failures=""
  for module in axioms methodology editor mercury publisher library filter bookshelf; do
    fresh=$(curl -s --max-time 5 "$CANON_GITHUB/$module.md" 2>/dev/null)
    local_path="$ALEX_DIR/system/canon/$module.md"
    if [ -n "$fresh" ] && [ ${#fresh} -gt 100 ]; then
      if [ ! -f "$local_path" ]; then
        # First install (or new module): seed from upstream.
        printf '%s' "$fresh" > "$local_path"
      elif ! diff -q <(printf '%s' "$fresh") "$local_path" >/dev/null 2>&1; then
        # Local diverges from upstream — record for notice; never overwrite local.
        notice_body="$notice_body

## $module.md

\`\`\`diff
$(diff -u "$local_path" <(printf '%s' "$fresh") 2>/dev/null | head -n 200)
\`\`\`"
      fi
    else
      # Fetch failed (network, GitHub down, 404). Log so the Author can see
      # that an upstream check was attempted and didn't succeed — silent skip
      # would violate "awareness is upstream of everything".
      canon_fetch_failures="$canon_fetch_failures $module"
      echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) canon fetch failed: $module (curl returned empty or undersized response — network, upstream 404, or rate limit)" >> "$ALEX_DIR/system/.alexandria_errors"
    fi
    if [ "$module" = "methodology" ] && [ -f "$local_path" ]; then
      canon=$(cat "$local_path")
      canon_ok=true
    fi
  done
  # Export fetch status for the protocol call (server-side awareness).
  [ -n "$CLAUDE_ENV_FILE" ] && [ -n "$canon_fetch_failures" ] \
    && echo "export ALEXANDRIA_CANON_FETCH_FAILURES='$canon_fetch_failures'" >> "$CLAUDE_ENV_FILE"
  if [ -n "$notice_body" ]; then
    {
      echo "# Canon divergence — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
      echo ""
      echo "Your system canon (\`~/alexandria/system/canon/\`) is sovereign. It differs from upstream factory canon — diffs per module below. \`+\` lines are upstream-only (factory changes you haven't taken); \`-\` lines are local-only (your personal additions). For each module, edit your local to integrate upstream, or leave as-is. Notice regenerates each session reflecting current state."
      echo "$notice_body"
    } > "$ALEX_DIR/system/.canon_update_notice"
  else
    rm -f "$ALEX_DIR/system/.canon_update_notice"
  fi
  [ -n "$CLAUDE_ENV_FILE" ] && [ "$canon_ok" = "true" ] && echo "export ALEXANDRIA_CANON_OK=true" >> "$CLAUDE_ENV_FILE"

  # ── Canon status telemetry (cross-machine/cross-Author awareness) ──
  # Fire-and-forget POST so canon health is visible server-side without each
  # Author having to grep their own .alexandria_errors. Backgrounded — never
  # blocks session-start. Local .alexandria_errors remains the local source
  # of truth; this is the aggregation layer.
  if [ -n "$API_KEY" ]; then
    cs_failures=$(printf '%s' "$canon_fetch_failures" | sed 's/^ *//' | tr ' ' ',')
    cs_has_notice="false"
    [ -f "$ALEX_DIR/system/.canon_update_notice" ] && cs_has_notice="true"
    (curl -s --max-time 3 -X POST "$SERVER/canon/status" \
      -H "Authorization: Bearer $API_KEY" \
      -H "X-Alexandria-Client: $CLIENT_VERSION" \
      -H "Content-Type: application/json" \
      -d "{\"fetch_failures\":\"$cs_failures\",\"has_notice\":$cs_has_notice}" \
      >/dev/null 2>&1 &)
  fi

  # ── Git sync: push local, pull overnight changes ──
  if [ -d "$ALEX_DIR/.git" ] && git -C "$ALEX_DIR" remote get-url origin &>/dev/null; then
    # Recover from stuck state left by a previous run.
    # Stale index.lock (>5 min) = previous git op crashed; safe to remove.
    # If stat fails we can't determine age — leave the lock alone (better safe).
    if [ -f "$ALEX_DIR/.git/index.lock" ]; then
      lock_mtime=$(stat -f %m "$ALEX_DIR/.git/index.lock" 2>/dev/null || stat -c %Y "$ALEX_DIR/.git/index.lock" 2>/dev/null)
      if [ -n "$lock_mtime" ]; then
        lock_age=$(($(date +%s) - lock_mtime))
        [ "$lock_age" -gt 300 ] && rm -f "$ALEX_DIR/.git/index.lock"
      fi
    fi
    # GUARD 1 — never auto-abort a stuck rebase/merge and then `git add -A` over the reverted tree.
    # That path silently dropped uncommitted hand-curated canon (agent.md, _feedback.md) on 2026-06-05:
    # abort reverts to HEAD, add -A commits the loss, autoloop reports "complete". No-derivative files
    # have no source to regenerate from, so the loss is permanent. Surface and SKIP the sync instead —
    # the working tree is safe, just not syncing, until the Author resolves it.
    if [ -d "$ALEX_DIR/.git/rebase-merge" ] || [ -d "$ALEX_DIR/.git/rebase-apply" ] || [ -f "$ALEX_DIR/.git/MERGE_HEAD" ]; then
      echo "alexandria: SYNC PAUSED — unresolved rebase/merge in ~/alexandria. Your edits are safe but not syncing. Resolve: cd ~/alexandria && git status"
    # GUARD 2 — never commit unresolved conflict markers into hand-curated canon.
    elif git -C "$ALEX_DIR" grep -lE '^(<<<<<<<|>>>>>>>)' -- 'files/core/' 'files/constitution/' 'system/canon/' >/dev/null 2>&1; then
      echo "alexandria: SYNC PAUSED — conflict markers in canon; not committing. Resolve, then sessions resume syncing."
    else
      (cd "$ALEX_DIR" && git add -A && { git diff --cached --quiet || git commit -q -m "sync: $(date +%Y-%m-%d_%H-%M)"; }) 2>/dev/null
      git -C "$ALEX_DIR" push -q 2>/dev/null || true
      git -C "$ALEX_DIR" pull --rebase -q 2>/dev/null || true
    fi
  fi

  # ── Autoloop relay: git ground truth → dashboard ──
  # Autoloop activity is proven by protocol calls. Dedup marker still useful for local state.
  if [ -d "$ALEX_DIR/.git" ]; then
    latest_autoloop=$(git -C "$ALEX_DIR" log -1 --format='%H' --grep='autoloop:' 2>/dev/null)
    [ -n "$latest_autoloop" ] && echo "$latest_autoloop" > "$ALEX_DIR/system/.autoloop_relayed"
  fi

  # ── Network sync: fetch connected Authors' shadows (1/day, backgrounded) ──
  # Reads ~/alexandria/files/network.md, fetches each connected Author's shadow
  # to ~/alexandria/files/network/<slug>/shadow.md. Engine reads these as
  # relational context per § VI The Network Multiplier (methodology.md).
  # No file = single-Author mode, surface dark, nothing fetched.
  if [ -f "$ALEX_DIR/files/network.md" ]; then
    network_cache="$ALEX_DIR/files/network"
    mkdir -p "$network_cache" 2>/dev/null
    network_needs_sync="yes"
    if [ -f "$network_cache/.last_synced" ]; then
      last_sync=$(cat "$network_cache/.last_synced" 2>/dev/null || echo 0)
      [ -n "$last_sync" ] && [ "$(($(date +%s) - last_sync))" -lt 86400 ] && network_needs_sync="no"
    fi
    if [ "$network_needs_sync" = "yes" ]; then
      (
        net_key=""
        [ -f "$ALEX_DIR/system/.api_key" ] && net_key=$(tr -d '[:space:]' < "$ALEX_DIR/system/.api_key" 2>/dev/null)
        net_api="https://api.alexandria-library.com"
        while IFS= read -r line; do
          trimmed=$(echo "$line" | sed -E 's/^[[:space:]]+|[[:space:]]+$//g')
          [[ "$trimmed" =~ ^# ]] && continue
          [ -z "$trimmed" ] && continue
          url=$(echo "$trimmed" | grep -oE 'https?://[^[:space:]]+' | head -1)
          [ -z "$url" ] && url="$trimmed"
          slug=$(echo "$url" | sed -E 's#https?://[^/]+/library/##; s#/.*$##' | tr -cd 'a-zA-Z0-9_-')
          [ -z "$slug" ] && continue
          author_dir="$network_cache/$slug"
          mkdir -p "$author_dir" 2>/dev/null
          # Try authors tier first (richer for connected peers), fall back to free.
          fetched=""
          if [ -n "$net_key" ] && curl -fsS --max-time 5 -H "Authorization: Bearer $net_key" \
               "$net_api/library/$slug/shadow/authors" -o "$author_dir/shadow.md.tmp" 2>/dev/null \
               && [ -s "$author_dir/shadow.md.tmp" ]; then
            mv "$author_dir/shadow.md.tmp" "$author_dir/shadow.md"
            fetched=1
          fi
          if [ -z "$fetched" ] && curl -fsS --max-time 5 \
               "$net_api/library/$slug/shadow/free" -o "$author_dir/shadow.md.tmp" 2>/dev/null \
               && [ -s "$author_dir/shadow.md.tmp" ]; then
            mv "$author_dir/shadow.md.tmp" "$author_dir/shadow.md"
            fetched=1
          fi
          rm -f "$author_dir/shadow.md.tmp"
          [ -n "$fetched" ] && echo "$trimmed" > "$author_dir/_annotation.md"
        done < "$ALEX_DIR/files/network.md"
        date -u +%s > "$network_cache/.last_synced"
      ) 2>/dev/null &
    fi
  fi

  # ── Nudges ──
  # Markers only — Engine composes any user-facing text per canon.
  # .nudge_pending: written at prior session-end if the session wasn't active.
  # signal.md: observations accumulated from passive sessions — Engine reads directly.
  # Canon instructs the Engine to check these at session start and respond appropriately.

  # Maintenance status — one line each, detail stays in files. The autoloop
  # owns repair (see scheduled.md § Machine audit + § Canon update review).
  # Live sessions see status only; full content is in system/.alexandria_errors
  # and system/.canon_update_notice when the Engine wants to look.
  if [ -f "$ALEX_DIR/system/.alexandria_errors" ] && [ -s "$ALEX_DIR/system/.alexandria_errors" ]; then
    err_count=$(wc -l < "$ALEX_DIR/system/.alexandria_errors" 2>/dev/null | tr -d ' ')
    if [ "${err_count:-0}" -gt 0 ]; then
      if grep -qE '^(<<<<<<<|=======$|>>>>>>>)' "$ALEX_DIR/system/.alexandria_errors" 2>/dev/null; then
        echo "alexandria: maintenance — .alexandria_errors has git conflict markers (autoloop will repair)"
      else
        echo "alexandria: maintenance — $err_count sync errors pending (autoloop handles)"
      fi
    fi
  fi

  if [ -f "$ALEX_DIR/system/.canon_update_notice" ] && [ -s "$ALEX_DIR/system/.canon_update_notice" ]; then
    echo "alexandria: maintenance — canon update pending review (autoloop handles)"
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
      echo "Your local files differ from current factory. Not updating automatically — re-run the install block from https://alexandria-library.com/signup when you're ready to sync."
      echo ""
      printf '%s' "$drift_found"
      echo "--- END DRIFT ---"
      echo ""
    fi
  fi

  # ── Author context — pointer, not inline injection ──
  # Inlining the full constitution+marginalia+machine+notepad+feedback was ~70KB,
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
    echo "Author files live at ~/alexandria/files/. Read what's relevant for the moment, not everything every time. Prefer derivatives (underscore-prefixed: _constitution.md, _notepad.md, _feedback.md) when they exist — they are the compressed working copy. Fall back to sources when the derivative is missing."
    echo ""
    echo "  constitution/  — positions with epistemic status assigned (Core.md first); _constitution.md is the derivative"
    echo "  marginalia/    — shared working layer (your developing thoughts + Engine candidates, awaiting status); drains over time"
    echo "  core/machine.md — how to work with this Author"
    echo "  core/notepad.md (or _notepad.md) — Engine working memory, parked questions, loaded magazine"
    echo "  core/feedback.md (or _feedback.md) — corrections + confirmed approaches"
    echo "  core/agent.md  — Author preferences for AI behaviour"
    echo ""
    echo "Your system canon is at ~/alexandria/system/canon/ — sovereign, never overwritten. If ~/alexandria/system/.canon_update_notice exists, your local canon differs from upstream factory canon in some direction (upstream has changes you haven't taken, or your local has personal additions upstream doesn't have, or both). Read the diff to distinguish: upstream-side changes are worth surfacing to the Author for an integrate-or-ignore decision; local-only additions are the Author's own work and don't need to be re-raised. Notice regenerates each session reflecting current state — persists until local and upstream agree."
    echo ""
    echo "Alexandria passive mode active. Follow the canon's passive mode instructions. If the Author mentions Alexandria feedback, write to .session_feedback — it reaches the team at session end."
  fi

  # ── The Call (protocol obligation) ──
  # Report which factory modules this machine uses, derived from what's on disk.
  # The .call_manifest file is written by the Engine during /a sessions.
  # Default: methodology (the factory default). The Engine evolves this.
  if [ -n "$API_KEY" ]; then
    mkdir -p "$ALEX_DIR/files/library" 2>/dev/null

    # ── The File (protocol obligation) ──
    # Full Library reconciliation. Local is source of truth: walk
    # library/{tier}/ for any file that isn't a draft (underscore prefix),
    # filter (filter.md), or readme (README.md). PUT each one; the server
    # hash-skips unchanged content. Then GET the server's set and DELETE
    # anything it has that local doesn't. Idempotent — every session.
    # Backgrounded so session-start stays fast.
    (
      ALEX_DIR="$ALEX_DIR" \
      SERVER="$SERVER" \
      API_KEY="$API_KEY" \
      CLIENT_VERSION="$CLIENT_VERSION" \
      SYNC_LOG="$ALEX_DIR/system/.library_sync_status.json" \
      GH_LOGIN="${ALEXANDRIA_GH_LOGIN:-mowinckelb}" \
      node -e '
        const fs = require("fs"), path = require("path");
        const root = path.join(process.env.ALEX_DIR, "files/library");
        const SERVER = process.env.SERVER, KEY = process.env.API_KEY, CV = process.env.CLIENT_VERSION;
        const TYPE_BY_EXT = { ".md": "text/markdown; charset=utf-8", ".pdf": "application/pdf" };
        const skipFile = (n) => n === "filter.md" || n === "README.md" || n.startsWith("_") || n.startsWith(".");

        const local = new Map(); // name -> {tier, abs, contentType}
        let tiers = [];
        try { tiers = fs.readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name); } catch {}
        for (const tier of tiers) {
          const dir = path.join(root, tier);
          let entries = [];
          try { entries = fs.readdirSync(dir); } catch { continue; }
          for (const f of entries) {
            if (skipFile(f)) continue;
            const ext = path.extname(f).toLowerCase();
            const ct = TYPE_BY_EXT[ext];
            if (!ct) continue;
            const stem = f.slice(0, f.length - ext.length).toLowerCase();
            if (!/^[a-z0-9][a-z0-9-]*$/.test(stem) || stem.length > 64) continue;
            // Resolve symlinks; skip dangling.
            let abs = path.join(dir, f), st;
            try { st = fs.statSync(abs); } catch { continue; }
            if (!st.isFile() || st.size === 0) continue;
            // Last write wins if the same stem appears in multiple tiers.
            local.set(stem, { tier, abs, contentType: ct });
          }
        }

        // First sentence from a string: up to the first ./!/? boundary, capped.
        function firstSentence(raw) {
          if (!raw) return null;
          const s = raw.replace(/\s+/g, " ").trim();
          if (!s) return null;
          const m = s.match(/^.+?[.!?](?=\s|$)/);
          return (m ? m[0] : s).slice(0, 280);
        }

        // Description sources, in order:
        // 1. Sidecar <name>.txt next to the file (works for PDFs + overrides md).
        // 2. First *italic* block after any leading H1/H2 in markdown.
        // 3. null. Author can add a sidecar or italic line to fix.
        function deriveText(absPath, contentType) {
          const sidecar = absPath.replace(/\.[^.]+$/, ".txt");
          try {
            if (fs.existsSync(sidecar)) {
              return firstSentence(fs.readFileSync(sidecar, "utf8"));
            }
          } catch {}
          if (contentType === "text/markdown; charset=utf-8") {
            try {
              const md = fs.readFileSync(absPath, "utf8");
              const italic = md.match(/^\s*(?:#[^\n]*\n+)*\*([^*\n][\s\S]*?)\*/m);
              if (italic) return firstSentence(italic[1]);
            } catch {}
          }
          return null;
        }

        async function putOne(name, meta) {
          const buf = fs.readFileSync(meta.abs);
          const isText = meta.contentType.startsWith("text/");
          const body = {
            visibility: meta.tier,
            content_type: meta.contentType,
            text: deriveText(meta.abs, meta.contentType),
          };
          if (isText) body.content = buf.toString("utf8");
          else body.content_b64 = buf.toString("base64");
          const res = await fetch(SERVER + "/file/" + encodeURIComponent(name), {
            method: "PUT",
            headers: {
              "Authorization": "Bearer " + KEY,
              "X-Alexandria-Client": CV,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          });
          return { name, ok: res.ok, status: res.status };
        }

        async function deleteOne(name) {
          const res = await fetch(SERVER + "/file/" + encodeURIComponent(name), {
            method: "DELETE",
            headers: { "Authorization": "Bearer " + KEY, "X-Alexandria-Client": CV },
          });
          return { name, ok: res.ok, status: res.status };
        }

        (async () => {
          const status = { published: [], deleted: [], errors: [], drift: [], ran_at: new Date().toISOString() };

          // Fetch current server state via the company route by login. Public
          // endpoint, no auth header needed; same payload shape as the
          // protocol /library/{id} route but addressable by github_login.
          let serverNames = new Set();
          try {
            const r = await fetch(SERVER + "/library/" + process.env.GH_LOGIN);
            if (r.ok) {
              const j = await r.json();
              for (const f of (j.files || [])) serverNames.add(f.name);
            }
          } catch (e) { status.errors.push("get_library:" + e.message); }

          for (const [name, meta] of local) {
            try {
              const r = await putOne(name, meta);
              if (r.ok) status.published.push({ name, tier: meta.tier });
              else status.errors.push("put " + name + " status=" + r.status);
            } catch (e) { status.errors.push("put " + name + ":" + e.message); }
          }

          // Safety guard: empty local almost always means fresh install or
          // unreadable dir, not a deliberate full wipe. Skip the delete pass
          // to avoid nuking a populated server. Per-file deletion still works
          // (rm the local file). Test runners with a temp HOME hit this path
          // and would otherwise destroy the keyholder prod account.
          if (local.size === 0 && serverNames.size > 0) {
            status.errors.push("skip_delete_empty_local: local has 0 files, server has " + serverNames.size + " — refusing to delete everything");
          } else {
            for (const name of serverNames) {
              if (local.has(name)) continue;
              try {
                const r = await deleteOne(name);
                if (r.ok) status.deleted.push(name);
                else status.errors.push("delete " + name + " status=" + r.status);
              } catch (e) { status.errors.push("delete " + name + ":" + e.message); }
            }
          }

          // Verification loop: re-fetch server state, diff against local.
          try {
            const r = await fetch(SERVER + "/library/" + process.env.GH_LOGIN);
            if (r.ok) {
              const j = await r.json();
              const serverAfter = new Set((j.files || []).map(f => f.name));
              for (const n of local.keys()) if (!serverAfter.has(n)) status.drift.push("missing_on_server:" + n);
              for (const n of serverAfter) if (!local.has(n)) status.drift.push("extra_on_server:" + n);
            }
          } catch (e) { status.errors.push("verify:" + e.message); }

          fs.writeFileSync(process.env.SYNC_LOG, JSON.stringify(status, null, 2));
        })().catch(e => {
          fs.appendFileSync(process.env.ALEX_DIR + "/system/.alexandria_errors",
            new Date().toISOString() + " library sync crashed: " + (e.stack || e.message) + "\n");
        });
      ' 2>>"$ALEX_DIR/system/.alexandria_errors"
    ) &

    # Server status drives reminders. The Engine drafts; the Author approves.
    status_json=$(curl -s --max-time 4 -H "Authorization: Bearer $API_KEY" "$SERVER/alexandria" 2>/dev/null)
    if [ -n "$status_json" ]; then
      printf '%s' "$status_json" > "$ALEX_DIR/system/.protocol_status.json"
      file_status=$(printf '%s' "$status_json" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{try{let j=JSON.parse(s);process.stdout.write(j.obligations?.file_status||'unknown')}catch{process.stdout.write('unknown')}})" 2>/dev/null)
      file_due=$(printf '%s' "$status_json" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{try{let j=JSON.parse(s);process.stdout.write(j.obligations?.file_due||'')}catch{}})" 2>/dev/null)
      due_days=$(printf '%s' "$file_due" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{let t=Date.parse(s.trim()); if(!Number.isFinite(t)) return; console.log(Math.ceil((t-Date.now())/86400000));})" 2>/dev/null)
      if [ "$file_status" = "missing" ] || [ "$file_status" = "stale" ] || { [ -n "$due_days" ] && [ "$due_days" -le 7 ]; }; then
        {
          echo "LIBRARY FILE REVIEW — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
          echo "file_status: ${file_status:-unknown}"
          [ -n "$file_due" ] && echo "file_due: $file_due"
          [ -n "$due_days" ] && echo "days_until_due: $due_days"
          echo ""
          echo "The file obligation requires at least one current Authors-visible file (authors-tier or public-tier). Refresh or publish a file in ~/alexandria/files/library/authors/ or ~/alexandria/files/library/public/. The hook publishes whatever final files (no underscore prefix) are present in those folders. Drafts (_*.md) and filters never ship."
        } > "$ALEX_DIR/system/.library_file_review"
      fi
    fi

    if [ -f "$ALEX_DIR/system/.library_file_review" ] && [ -s "$ALEX_DIR/system/.library_file_review" ]; then
      echo ""
      echo "--- LIBRARY FILE REVIEW ---"
      cat "$ALEX_DIR/system/.library_file_review"
      echo "--- END LIBRARY FILE REVIEW ---"
      echo ""
    fi

    # Surface drift from the last sync run (one previous session's tail).
    # Drift means local != server after sync — a bug, not a workflow gap.
    if [ -f "$ALEX_DIR/system/.library_sync_status.json" ]; then
      drift_summary=$(node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{try{const j=JSON.parse(s); const d=(j.drift||[]); const e=(j.errors||[]); if(d.length||e.length){process.stdout.write('drift='+d.length+' errors='+e.length+'\n'); for(const x of d) process.stdout.write('  '+x+'\n'); for(const x of e) process.stdout.write('  err: '+x+'\n');}}catch{}})" < "$ALEX_DIR/system/.library_sync_status.json" 2>/dev/null)
      if [ -n "$drift_summary" ]; then
        echo ""
        echo "--- LIBRARY SYNC DRIFT (previous session) ---"
        printf '%s' "$drift_summary"
        echo "--- END LIBRARY SYNC DRIFT ---"
        echo ""
      fi
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

  # Author-explicit feedback only (anonymous machine_signal removed 2026-05-15
  # for sovereignty — Engines no longer write methodology observations to a
  # network-bound substrate). Delete only on 200.
  if [ -n "$API_KEY" ]; then
    json_escape() { node -e "process.stdout.write(JSON.stringify(require('fs').readFileSync(process.argv[1],'utf8')))" "$1" 2>/dev/null; }

    feedback_file="$ALEX_DIR/system/.session_feedback"
    [ ! -f "$feedback_file" ] && [ -f "$ALEX_DIR/.session_feedback" ] && feedback_file="$ALEX_DIR/.session_feedback"

    if [ -f "$feedback_file" ] && [ -s "$feedback_file" ]; then
      fb_json=$(json_escape "$feedback_file")
      if [ -n "$fb_json" ]; then
        curl -sf --max-time 4 -X POST "$SERVER/feedback" \
          -H "Authorization: Bearer $API_KEY" \
          -H "X-Alexandria-Client: $CLIENT_VERSION" \
          -H "Content-Type: application/json" \
          -d "{\"text\":$fb_json,\"context\":\"session_end\"}" -o /dev/null 2>/dev/null
        # Delete only on success (curl -f exits non-zero on HTTP errors).
        # On failure, log loudly so next session-start surfaces it to the Engine.
        if [ $? -eq 0 ]; then
          rm -f "$feedback_file"
        else
          echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) feedback POST failed" >> "$ALEX_DIR/system/.alexandria_errors"
        fi
      fi
    fi
  fi

  # Git sync
  if [ -d "$ALEX_DIR/.git" ] && git -C "$ALEX_DIR" remote get-url origin &>/dev/null; then
    (cd "$ALEX_DIR" && git add -A && { git diff --cached --quiet || git commit -q -m "session: $(date +%Y-%m-%d_%H-%M)"; } && git push -q) &>/dev/null &
  fi

fi

# ─── SUBAGENT CONTEXT ────────────────────────────────────────────

if [ "$MODE" = "subagent" ]; then
  # Pointer, not inline injection. Same reasoning as session-start: dumping
  # the full constitution+marginalia+notepad+feedback every subagent invocation
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
    echo "  constitution/  — positions with epistemic status assigned (Core.md first); _constitution.md derivative"
    echo "  marginalia/    — shared working layer (your developing thoughts + Engine candidates, awaiting status); drains over time"
    echo "  core/machine.md — how to work with this Author"
    echo "  core/notepad.md (or _notepad.md) — Engine working memory, parked threads"
    echo "  core/feedback.md (or _feedback.md) — corrections + confirmed approaches"
    echo "  core/agent.md  — Author preferences for AI behaviour"
    echo ""
    echo "Read only what's relevant to your task."
  fi
fi
