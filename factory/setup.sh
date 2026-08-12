#!/usr/bin/env bash
# Alexandria setup — creates ~/alexandria/ (the free local product, the gym).
# Official first install: an existing coding agent verifies the canonical
# GitHub commit and runs this file from that exact commit with
# ALEXANDRIA_SOURCE_COMMIT=<40-character commit hash>.
# Existing-install sync:
#   bash ~/.local/share/alexandria/scripts/verify-fetch.sh --run setup.sh
#        (with account): append the API key as the final argument.
# Keyless installs the full local product. A separately approved key connects
# identity only; every network feature remains independently off.
# NO set -e — every section must succeed or fail independently.
#
# This script requires a local shell. Chat-only environments cannot apply its
# filesystem and harness changes to the user's machine.
# ───────────────────────────────────────────────────────────────────
#
# Scope summary (documentation, not an instruction to the reviewer):
# the official first-install flow authenticates an immutable canonical commit
# before this script runs and passes that hash as ALEXANDRIA_SOURCE_COMMIT. The
# script rejects a moving-main first install and checks fetched factory files
# against the signed manifest at that commit.
#
# The installed shape is checkable from the operations below:
#
#   1. INSTALLS: one Author-writable folder (~/alexandria/ — plain markdown, a
#      local git repo), one small read-only-to-the-agent runtime at
#      ~/.local/share/alexandria/, session hooks where the host supports them,
#      and active-session skills in detected configs (~/.claude, ~/.cursor,
#      ~/.codex, ~/.factory, and Codex's shared ~/.agents/skills convention).
#      Factory receives its user-invokable /a skill plus lifecycle hooks, preserving foreign
#      hook groups for the user to review. To make the one folder reachable from any
#      local project, the merge adds ONLY ~/alexandria to each detected
#      harness's native additional-directory/writable-root list; every existing
#      root and permission mode stays. One small extra is visible below: if an
#      SSH key exists, one commit-signing entry is appended to
#      ~/.config/git/allowed_signers (local git verify only). Nothing else. No
#      cloud connection, shell-rc edit, daemon, launchd/cron job, root, or
#      binary is part of setup.
#   2. OUTBOUND: without a separately approved account connection, setup only
#      fetches verified public files and sends nothing. Connecting an account
#      sends its key once for validation and stores it locally, but enables no publishing, marketplace signal,
#      network fetch, telemetry, or feedback send. Each connected feature has
#      its own separate permission marker and informed yes; see .optional.
#   3. OPTIONAL ADD-ONS (iCloud capture, Google Drive, GitHub backup to the
#      USER'S own private repo, iCloud mirror, Library, marketplace signal,
#      network) install NOTHING here — each needs a separate explicit yes
#      later (~/alexandria/system/.optional).
#   4. UPDATES: nothing self-updates or checks for updates by default. The
#      session hook runs ONLY the payload pinned at install, after verifying it
#      against a manifest signed by a Touch ID-bound Secure Enclave key
#      (github.com/benmowinckel/alexandria/blob/main/TRUST.md). Update notices
#      are a separate opt-in; applying one is always the Author's action.
#   5. UNINSTALL: complete, listed at alexandria-library.com/mechanics.
#
# The installed methodology makes the Author's interest primary and leaves
# existing approval settings unchanged.
# ───────────────────────────────────────────────────────────────────

# Private cognition is user-only by default. Explicit public artifacts and the
# maintainer's public signing key receive wider modes where needed.
umask 077

ALEX_DIR="$HOME/alexandria"
RUNTIME_DIR="$HOME/.local/share/alexandria"

# Setup never follows a symlinked parent into some other namespace. This is a
# destructive-boundary check, not an ownership hint: if a supported host root
# is intentionally symlinked, the Author must configure it manually.
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
for protected_root in \
  "$ALEX_DIR" "$RUNTIME_DIR" "$HOME/.claude" "$HOME/.cursor" \
  "$HOME/.codex" "$HOME/.agents" "$HOME/.factory" \
  "$HOME/.config/git" "$HOME/Library/LaunchAgents"; do
  if path_has_symlink_component "$protected_root"; then
    echo "Refusing setup through symlinked path: $protected_root" >&2
    exit 1
  fi
done
SOURCE_REF="${ALEXANDRIA_SOURCE_COMMIT:-main}"
# verify-fetch authenticates tip setup.sh, then runs these bytes. A leftover
# ALEXANDRIA_SOURCE_COMMIT in the ambient shell must not pin factory fetches to
# an older commit (that reads as a signed rollback against .factory_version).
# First-install agents that verified a specific hash set the pin without
# ALEXANDRIA_VERIFIED_UPDATE=1.
if [ "${ALEXANDRIA_VERIFIED_UPDATE:-}" = "1" ]; then
  SOURCE_REF=main
fi
if [ "$SOURCE_REF" != main ] && ! [[ "$SOURCE_REF" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Invalid Alexandria source commit; refusing to install." >&2
  exit 1
fi
if [ "$SOURCE_REF" = main ]; then
  if [ "${ALEXANDRIA_VERIFIED_UPDATE:-}" != "1" ] || \
     [ ! -f "$RUNTIME_DIR/scripts/verify-fetch.sh" ] || \
     [ ! -f "$RUNTIME_DIR/allowed_signers" ]; then
    echo "Refusing an unverified moving-main install." >&2
    echo "Start at https://alexandria-library.com/start, or update an existing install with:" >&2
    echo "  bash ~/.local/share/alexandria/scripts/verify-fetch.sh --run setup.sh" >&2
    exit 1
  fi
fi
FACTORY_RAW="https://raw.githubusercontent.com/benmowinckel/alexandria/$SOURCE_REF/factory"
SERVER="https://api.alexandria-library.com"
FETCH_ERRORS=""

# ── Argument parsing ──────────────────────────────────────────────
# One optional argument: an Alexandria account key. Referral and tracking
# arguments are deliberately not part of private setup.
API_KEY=""
while [ $# -gt 0 ]; do
  case "$1" in
    alex_*)
      API_KEY="$1"
      ;;
    *)
      # Any other token is almost certainly an intended API key that got
      # mangled (truncated paste, wrong prefix, shell-eaten quotes). Capture
      # it so the format check below rejects it LOUDLY — silently dropping it
      # would hand the Author a keyless install they think is keyed.
      API_KEY="$1"
      ;;
  esac
  shift
done
API_KEY_ARG="$API_KEY"

if [ -n "$API_KEY_ARG" ] && [ "${ALEXANDRIA_ACCOUNT_CONNECT_APPROVED:-}" != "1" ]; then
  echo "Account connection needs its own informed approval." >&2
  echo "Explain what the account itself stores, confirm that no connected feature is enabled," >&2
  echo "wait for the Author to say connect, then re-run with ALEXANDRIA_ACCOUNT_CONNECT_APPROVED=1." >&2
  exit 1
fi

fetch_factory() {
  local rel="$1" dest="$2" label="$3" overwrite="${4:-no}"
  [ "$overwrite" != "yes" ] && [ -f "$dest" ] && return 0

  mkdir -p "$(dirname "$dest")" 2>/dev/null
  local tmp="${dest}.tmp.$$"
  if curl -fsS --retry 2 --retry-delay 1 --connect-timeout 5 --max-time 20 \
    "$FACTORY_RAW/$rel" -o "$tmp" 2>/dev/null && [ -s "$tmp" ]; then
    # Manifest gate: every factory file must appear in the signature-verified
    # manifest and match its pinned hash. Missing coverage and mismatched bytes
    # both fail closed; an existing local copy, if any, stays untouched.
    if [ -n "${VERIFIED_MANIFEST:-}" ] && [ -f "$VERIFIED_MANIFEST" ]; then
      local want_sha got_sha
      want_sha=$(awk -v p="factory/$rel" '$2==p{print $1}' "$VERIFIED_MANIFEST")
      if [ -z "$want_sha" ]; then
        rm -f "$tmp"
        FETCH_ERRORS="${FETCH_ERRORS}${label}(not-in-signed-manifest) "
        return 1
      fi
      if command -v shasum >/dev/null 2>&1; then got_sha=$(shasum -a 256 "$tmp" | cut -d' ' -f1)
      else got_sha=$(sha256sum "$tmp" 2>/dev/null | cut -d' ' -f1); fi
      if [ "$want_sha" != "$got_sha" ]; then
        rm -f "$tmp"
        FETCH_ERRORS="${FETCH_ERRORS}${label}(signature-mismatch) "
        return 1
      fi
    else
      rm -f "$tmp"
      FETCH_ERRORS="${FETCH_ERRORS}${label}(no-verified-manifest) "
      return 1
    fi
    mv "$tmp" "$dest"
    return 0
  fi
  rm -f "$tmp"
  FETCH_ERRORS="${FETCH_ERRORS}${label} "
  return 1
}

# Existing-install fallback: if no key was passed but one is already stored
# locally from a prior install, use it. The verified updater therefore needs
# no key argument unless the Author is rotating or linking an account.
# Passing a key explicitly still overrides (for rotations).
if [ -z "$API_KEY" ] && [ -f "$ALEX_DIR/system/.api_key" ]; then
  API_KEY=$(tr -d '[:space:]' < "$ALEX_DIR/system/.api_key" 2>/dev/null)
  [ -n "$API_KEY" ] && echo "Reusing existing API key from $ALEX_DIR/system/.api_key"
fi

# Existing-Author detection: a non-empty constitution means onboarding already
# ran and this re-run is a sync, not a fresh install. Setup itself never writes
# constitution files, so this is pre-run state even when read later. Drives the
# closing message — "synced" for an existing Author, the onboarding block for a
# fresh install. (Works keyless too, unlike keying off API-key reuse.)
# Plain ls (not -A): dotfiles don't count — a Finder-browsed empty folder grows
# a .DS_Store, which must not fake an existing Author.
EXISTING_AUTHOR=""
[ -n "$(ls "$ALEX_DIR/files/constitution" 2>/dev/null)" ] && EXISTING_AUTHOR=1

# Keyless = the private local loop, no account. A key connects identity only;
# hosted features remain off until their own permission marker exists.
# The front door is the non-executable agent message at /start.
KEYLESS=false
if [ -z "$API_KEY" ]; then
  KEYLESS=true
  echo "Setting up Alexandria — free, local, no account needed."
elif [[ "$API_KEY" != alex_* ]]; then
  echo "Invalid API key format — got '$API_KEY', but keys start with alex_."
  echo "Check the paste (keys sometimes get truncated), or get a fresh key at"
  echo "https://alexandria-library.com/signup"
  exit 1
fi

# ── Preflight: required vs optional ───────────────────────────────
# Front-load every dependency check here so nothing stops mid-install. Two
# tiers:
#   REQUIRED — the bare minimum to deliver the first session: curl and a
#     coding agent that can read/write the machine.
#     Missing → one clear line, stop. No wall of errors later.
#   OPTIONAL — git, node/python3, gh sign-in, ssh signing, iCloud. Each adds a
#     layer (backup, session hooks, signing, capture) but NONE gates the first
#     reflection. Present now → wired silently below. Missing now → collected in
#     $DEFERRED as local diagnostic context. It is surfaced only when the
#     Author asks why a capability is unavailable; never as an upsell or nudge.

# REQUIRED #1 — curl. Used unconditionally throughout (fetch_factory, the key
# probe, the session hooks); wget alone can't run this installer, so passing
# preflight on wget would just fail later with a wall of fetch errors. One
# clear line, clean exit.
if ! command -v curl &>/dev/null; then
  echo "alexandria needs curl to install — install curl (wget alone isn't enough) and try again."
  exit 1
fi
if ! command -v ssh-keygen &>/dev/null; then
  echo "alexandria needs ssh-keygen to verify its release signature; refusing to install without it."
  exit 1
fi

# OPTIONAL — collect what's missing now as diagnostic context, never as a
# proactive offer. Each entry is a short actionable line for a direct question.
DEFERRED=""
command -v git &>/dev/null || DEFERRED="${DEFERRED}git — versioning + GitHub backup of your worldline (https://git-scm.com)\n"
if ! command -v node &>/dev/null && ! command -v python3 &>/dev/null; then
  DEFERRED="${DEFERRED}node or python3 — powers the automatic session hooks (https://nodejs.org)\n"
fi
if ! command -v gh &>/dev/null; then
  DEFERRED="${DEFERRED}gh CLI — unlocks the optional backup add-on to your own GitHub (https://cli.github.com)\n"
fi

echo "Setting up Alexandria..."

# ── 1. Directory structure ────────────────────────────────────────

RUNTIME_HAD_CONTENT=""
if [ -d "$RUNTIME_DIR" ] && [ -n "$(find "$RUNTIME_DIR" -mindepth 1 -print -quit 2>/dev/null)" ]; then
  RUNTIME_HAD_CONTENT=1
fi
mkdir -p "$ALEX_DIR/files/vault" "$ALEX_DIR/system/hooks" "$ALEX_DIR/files/constitution" "$ALEX_DIR/files/marginalia" "$ALEX_DIR/files/library/public" "$ALEX_DIR/files/library/paid" "$ALEX_DIR/files/library/invite" "$ALEX_DIR/files/library/authors" "$ALEX_DIR/files/works" "$ALEX_DIR/files/core" "$ALEX_DIR/files/vault/input" "$ALEX_DIR/files/vault/_input" "$ALEX_DIR/system/.autoloop" "$ALEX_DIR/system/permissions" "$RUNTIME_DIR/hooks" "$RUNTIME_DIR/scripts"
# Keep the previously accepted signed manifest long enough to recognise exact
# legacy Alexandria bytes during the ownership-ledger migration below. A loose
# sentence inside a foreign file is never ownership proof.
PREVIOUS_VERIFIED_MANIFEST=""
_previous_manifest_tmp=$(mktemp "${TMPDIR:-/tmp}/alexandria.XXXXXX" 2>/dev/null)
if [ -n "$_previous_manifest_tmp" ] && [ ! -L "$RUNTIME_DIR/.canon_manifest" ] && \
   [ -f "$RUNTIME_DIR/.canon_manifest" ] && [ -s "$RUNTIME_DIR/.canon_manifest" ] && \
   cp "$RUNTIME_DIR/.canon_manifest" "$_previous_manifest_tmp" 2>/dev/null; then
  PREVIOUS_VERIFIED_MANIFEST="$_previous_manifest_tmp"
else
  rm -f "${_previous_manifest_tmp:-}"
fi

# The runtime path is reserved only after exact prior-install proof. A copied
# filename or marker is not enough: an existing non-empty directory must carry
# a completed install plus two core files matching its prior signed manifest.
# Otherwise setup stops before replacing a byte in that namespace.
runtime_sha256() {
  local file="$1"
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$file" 2>/dev/null | cut -d' ' -f1
  else
    sha256sum "$file" 2>/dev/null | cut -d' ' -f1
  fi
}
prior_runtime_matches() {
  local rel installed expected actual
  # Matching signed shim + verifier bytes prove this runtime is ours. Prefer a
  # finished install marker when present, but do not block resume of an
  # incomplete run that already pinned those exact core files.
  [ -n "$PREVIOUS_VERIFIED_MANIFEST" ] && [ -s "$PREVIOUS_VERIFIED_MANIFEST" ] || return 1
  for rel in hooks/shim.sh scripts/verify-fetch.sh; do
    installed="$RUNTIME_DIR/$rel"
    [ -f "$installed" ] || return 1
    expected=$(awk -v p="factory/$rel" '$2==p{print $1}' "$PREVIOUS_VERIFIED_MANIFEST")
    actual=$(runtime_sha256 "$installed")
    [ -n "$expected" ] && [ "$actual" = "$expected" ] || return 1
  done
}
if [ -n "$RUNTIME_HAD_CONTENT" ] && ! prior_runtime_matches; then
  rm -f "${PREVIOUS_VERIFIED_MANIFEST:-}"
  echo "Refusing to use a non-empty ~/.local/share/alexandria without exact prior-install proof." >&2
  echo "Move that directory aside, inspect it, and run the verified setup again." >&2
  exit 1
fi
# Keyless leaves no .api_key — its absence IS the "no account" signal the hooks
# read (every server call in payload.sh is guarded by [ -n "$API_KEY" ]).
# NOTE: the key is persisted AFTER the server verify near the end of this
# script, never here — storing an unverified key poisoned every future bare
# re-run (the reuse fallback above would resurrect a rejected key forever).
[ -e "$ALEX_DIR/system/.last_processed" ] || touch "$ALEX_DIR/system/.last_processed"

# ── 1b. Trust root FIRST — armed before any factory fetch ─────────
# Allowed signers — the trust root for payload signature verification.
# Embedded here rather than fetched separately so the public key arrives in the
# same atomic install step as the shim that uses it. To rotate, replace the
# line below and ship a new setup.sh release.
# Fingerprint: SHA256:9DVo6uNuieqKMdNtT0QIi/WoQAAbWl5i/t0Z5MdQ/Jg
cat > "$RUNTIME_DIR/allowed_signers.tmp.$$" <<'EOF'
alexandria-payload-signing ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBETzcr+XjCojo7y6s+JU8UwqkOtzIv3h9kEQI/ef9/nuGolyXvLF8WXkoEDwFc3zkXxTbZ+TVWI5Uq0fgMxHvjM= alexandria-touchid
EOF
if ! chmod 644 "$RUNTIME_DIR/allowed_signers.tmp.$$" \
   || ! mv "$RUNTIME_DIR/allowed_signers.tmp.$$" "$RUNTIME_DIR/allowed_signers"; then
  rm -f "$RUNTIME_DIR/allowed_signers.tmp.$$"
  echo "Could not pin the Alexandria signing key locally; refusing to continue." >&2
  exit 1
fi

# Fetch + signature-verify the manifest NOW, so fetch_factory's manifest gate
# is armed for EVERY factory fetch below — payload, resolver, optional.md,
# canon, block, skills, cursor hooks, anything the manifest lists. Ordering is
# the point (2026-07-30): fetches that ran before the gate armed were TOFU.
# If the manifest cannot be authenticated, nothing from the factory installs.
_mf=$(mktemp "${TMPDIR:-/tmp}/alexandria.XXXXXX" 2>/dev/null)
_sg=$(mktemp "${TMPDIR:-/tmp}/alexandria.XXXXXX" 2>/dev/null)
if [ -z "$_mf" ] || [ -z "$_sg" ] \
   || ! curl -fsS --max-time 10 "$FACTORY_RAW/manifest.txt" -o "$_mf" 2>/dev/null \
   || ! curl -fsS --max-time 10 "$FACTORY_RAW/manifest.txt.sig" -o "$_sg" 2>/dev/null \
   || [ ! -s "$_mf" ] || [ ! -s "$_sg" ] \
   || ! ssh-keygen -Y verify -f "$RUNTIME_DIR/allowed_signers" \
        -I alexandria-payload-signing -n alexandria -s "$_sg" < "$_mf" >/dev/null 2>&1; then
  rm -f "${_mf:-}" "${_sg:-}"
  echo "Could not verify the signed Alexandria factory; setup stopped before installing hooks or changing AI-tool configuration. A partial ~/alexandria/system trust folder may remain." >&2
  exit 1
fi

# Refuse signed rollback as well as unsigned mutation. A release version is
# inside the signed manifest, and every accepted version becomes the local
# floor. Rollback is shipped as a new forward-signed release, never by replaying
# old valid bytes.
_factory_version=$(awk '$1=="#" && $2=="alexandria-factory-version" {print $3; exit}' "$_mf")
_installed_version=$(cat "$RUNTIME_DIR/.factory_version" 2>/dev/null)
if ! [[ "$_factory_version" =~ ^[0-9]+$ ]] \
   || { [ -n "$_installed_version" ] && ! [[ "$_installed_version" =~ ^[0-9]+$ ]]; } \
   || { [ -n "$_installed_version" ] && [ "$_factory_version" -lt "$_installed_version" ]; }; then
  rm -f "$_mf" "$_sg"
  echo "Refusing a missing or rolled-back Alexandria factory version." >&2
  exit 1
fi
_manifest_cache="$RUNTIME_DIR/.canon_manifest.tmp.$$"
_version_cache="$RUNTIME_DIR/.factory_version.tmp.$$"
if ! cp "$_mf" "$_manifest_cache" 2>/dev/null \
   || ! printf '%s\n' "$_factory_version" > "$_version_cache" \
   || ! mv "$_manifest_cache" "$RUNTIME_DIR/.canon_manifest" \
   || ! mv "$_version_cache" "$RUNTIME_DIR/.factory_version"; then
  rm -f "$_mf" "$_sg"
  rm -f "$_manifest_cache" "$_version_cache"
  echo "Could not pin the verified Alexandria factory locally; refusing to continue." >&2
  exit 1
fi
VERIFIED_MANIFEST="$RUNTIME_DIR/.canon_manifest"
rm -f "$_mf" "$_sg"

# A verified setup is transactional from the hooks' point of view. Once file
# replacement begins, every Alexandria hook stays inert until the functional
# probes below prove that the complete core landed. A failed refresh therefore
# leaves inspectable files, but never a mixed installation that keeps running.
rm -f "$RUNTIME_DIR/.setup_complete"

# ── 2. Factory files from GitHub ──────────────────────────────────

# Templates → files/ (don't overwrite existing)
# Core operating docs
for f in agent.md machine.md notepad.md feedback.md shelf.md; do
  fetch_factory "templates/core/$f" "$ALEX_DIR/files/core/$f" "core/$f"
done
# Filter — publishing policy, lives next to library/
fetch_factory "templates/library/filter.md" "$ALEX_DIR/files/library/filter.md" "library/filter.md"

# Hooks (always update)
mkdir -p "$ALEX_DIR/system/canon"
fetch_factory "hooks/shim.sh" "$RUNTIME_DIR/hooks/shim.sh" "hooks/shim.sh" yes
chmod +x "$RUNTIME_DIR/hooks/shim.sh" 2>/dev/null
fetch_factory "hooks/payload.sh" "$RUNTIME_DIR/.hooks_payload" "hooks/payload.sh" yes
fetch_factory "scripts/capture_resolver.py" "$RUNTIME_DIR/scripts/capture_resolver.py" "scripts/capture_resolver.py" yes
fetch_factory "scripts/configure_codex.py" "$RUNTIME_DIR/scripts/configure_codex.py" "scripts/configure_codex.py" yes
fetch_factory "scripts/uninstall.py" "$RUNTIME_DIR/scripts/uninstall.py" "scripts/uninstall.py" yes
fetch_factory "scripts/statusline.sh" "$RUNTIME_DIR/scripts/statusline.sh" "scripts/statusline.sh" yes
chmod +x "$RUNTIME_DIR/scripts/statusline.sh" 2>/dev/null
fetch_factory "skills/codex-ambient.md" "$RUNTIME_DIR/codex-ambient.md" "skills/codex-ambient.md" yes
# verify-fetch.sh — the only later "fetch a factory script, then run it" door
# (install/publish/brief-setup skills, migrate.sh). It lands through this
# authenticated whole-factory install. Consumers fail closed if it is missing;
# they never bootstrap a replacement from the network.
fetch_factory "scripts/verify-fetch.sh" "$RUNTIME_DIR/scripts/verify-fetch.sh" "scripts/verify-fetch.sh" yes
chmod +x "$RUNTIME_DIR/scripts/verify-fetch.sh" 2>/dev/null

# Optional add-ons doc — the agent-readable menu (backup, iCloud mirror,
# capture, Drive, and separately consented connections), each with
# what-it-touches + off switch. Overwrite:
# it's system documentation, not Author content.
fetch_factory "optional.md" "$ALEX_DIR/system/.optional" "optional.md"

# Update checks are deliberately OFF on first install. The optional add-ons
# document explains the exact marker that enables signed, notify-only checks.
# Re-running setup preserves an existing choice and never creates that marker.

# Pin the payload sha NOW so the first session needs zero network. The
# manifest itself was fetched + signature-verified at the trust-root-first
# step (§ 1b), and the payload fetch above already passed the manifest gate —
# this just records the verified sha. No verified manifest = no pin, and the
# shim verifies at first session instead (fail-closed either way — an
# unverified payload never executes).
if [ -n "${VERIFIED_MANIFEST:-}" ] && [ -f "$RUNTIME_DIR/.hooks_payload" ]; then
  _expected=$(awk '$2=="factory/hooks/payload.sh" {print $1}' "$VERIFIED_MANIFEST")
  if command -v shasum >/dev/null 2>&1; then _actual=$(shasum -a 256 "$RUNTIME_DIR/.hooks_payload" | cut -d' ' -f1)
  else _actual=$(sha256sum "$RUNTIME_DIR/.hooks_payload" 2>/dev/null | cut -d' ' -f1); fi
  if [ -n "$_expected" ] && [ "$_expected" = "$_actual" ]; then
    printf '%s' "$_actual" > "$RUNTIME_DIR/.payload_verified_sha"
  fi
fi

# Canon — signed local references seeded during the Author's verified first
# install. Foundation is the core. Five default methods start on, but each can
# be replaced in place or reversibly turned off by moving it into
# canon/disabled/. A later setup respects that local choice instead of silently
# restoring the file. Library, marketplace, network, cloud, PLM/twin and extras
# remain dormant until the Author directly chooses them; availability on disk
# is not activation.
# Seed-if-missing only (no overwrite) — never clobber the Author's edits.
# After install the payload NEVER auto-writes canon; it only notifies of updates and
# the Author pulls (verified). So this install seed is the one automatic write, and
# it is the Author's own decision to run setup.
mkdir -p "$ALEX_DIR/system/canon/disabled"
for module in foundation change-closure; do
  fetch_factory "canon/$module.md" "$ALEX_DIR/system/canon/$module.md" "canon/$module.md"
done
for module in axioms methodology editor mercury publisher; do
  [ -f "$ALEX_DIR/system/canon/disabled/$module.md" ] && continue
  fetch_factory "canon/$module.md" "$ALEX_DIR/system/canon/$module.md" "canon/$module.md"
done
for module in library filter bookshelf plm twin marketplace; do
  fetch_factory "canon/$module.md" "$ALEX_DIR/system/canon/$module.md" "canon/$module.md"
done
fetch_factory "canon/MODULES.md" "$ALEX_DIR/system/canon/MODULES.md" "canon/MODULES.md"

# Block (cache locally for easy access — system, not user content). Never infer
# ownership from this public filename. A pending block may be replaced only
# when its exact bytes match the previously verified release; a completed block
# is left alone because it will never execute again.
BLOCK_PATH="$ALEX_DIR/system/.block"
if [ -e "$BLOCK_PATH" ]; then
  block_expected=$(awk '$2=="factory/block.md"{print $1}' "$PREVIOUS_VERIFIED_MANIFEST" 2>/dev/null)
  block_actual=$(runtime_sha256 "$BLOCK_PATH")
  if [ -n "$block_expected" ] && [ "$block_actual" = "$block_expected" ]; then
    fetch_factory "block.md" "$BLOCK_PATH" "block.md" yes
  elif [ -f "$ALEX_DIR/system/.block_complete" ]; then
    : # completed local history: preserve it byte-for-byte
  else
    echo "Refusing to replace an existing ~/alexandria/system/.block without exact prior-release proof." >&2
    FETCH_ERRORS="${FETCH_ERRORS}block.md(foreign-collision) "
  fi
else
  fetch_factory "block.md" "$BLOCK_PATH" "block.md"
fi

# Account-level instructions for Claude chat surfaces. Cowork can use an
# attached folder, but it is a usage surface rather than an install surface:
# no plugin, duplicate skill, or hidden hook path. The file-only floor is the
# real path on every chat surface that can see the folder.
if [ ! -e "$ALEX_DIR/system/.claude-instructions.md" ]; then
cat > "$ALEX_DIR/system/.claude-instructions.md" << 'CLAUDEINSTR'
<!-- alexandria:start -->
## Alexandria

I use Alexandria: sovereign files containing my constitution, notes, captures, and work. Preserve all my existing instructions; this block adds routing only.

When personal context would improve the task, use the best home this session can actually reach:

1. If `~/alexandria` is available, use it exclusively. It is ground truth. Read `~/alexandria/system/canon/foundation.md`, any present default-method files relevant to the task, and the relevant files under `~/alexandria/files/`.
2. Otherwise, if my Google Drive `alexandria` folder is available, open `_start` and follow it. For a full local Author this is a pocket copy; for a chat-only Author it is ground truth.
3. Otherwise use the host's native memory as a lightweight content store, plus past chats only when this account actually exposes them. Quietly notice durable beliefs, preferences, and ideas; ask “save that to Alexandria?” when one is worth keeping, and save only after I confirm. These operating rules stay in instructions; memory holds personal content. Never pretend native memory has file-level fidelity.

Never load local and Drive in the same task. `/a` starts an active Alexandria session; `a.` closes it. State what you can read and write, and only claim persistence after verifying it. Existing instructions and native memories remain active beside Alexandria.

Finish every completed ordinary task with the exact one-line output of `bash ~/.local/share/alexandria/scripts/statusline.sh footer`; during a deliberate session use `→ close with a. when done`. If a native statusline is visibly carrying the cue, omit the response duplicate. Never open a chat or start a session for me.

After any substantive file edit, run `~/alexandria/system/canon/change-closure.md` before calling the task complete: find every explicit and semantic downstream effect, update it or confirm it remains current, verify the assembled behavior, and refresh the local receipt. I never carry that follow-up in memory. New outward writes or wider audiences keep their existing approval gate.
<!-- alexandria:end -->
CLAUDEINSTR
fi

# ── 3. Platform configuration ─────────────────────────────────────

# Integration names are shared user space. Ownership is recorded outside the
# AI-writable Author folder as exact path + exact installed hash. A matching
# filename or copied sentence is never proof. The signed-manifest comparison is
# only a one-time migration for exact bytes installed by an older release.
OWNERSHIP_LEDGER="$RUNTIME_DIR/.owned_integrations"

sha256_file() {
  local file="$1"
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$file" 2>/dev/null | cut -d' ' -f1
  else
    sha256sum "$file" 2>/dev/null | cut -d' ' -f1
  fi
}

owned_file_matches() {
  local file="$1" path recorded_path recorded_sha current_sha tab
  [ -f "$file" ] && [ -f "$OWNERSHIP_LEDGER" ] || return 1
  current_sha=$(sha256_file "$file")
  [ -n "$current_sha" ] || return 1
  tab=$(printf '\t')
  while IFS="$tab" read -r recorded_path recorded_sha; do
    if [ "$recorded_path" = "$file" ]; then
      [ "$recorded_sha" = "$current_sha" ]
      return
    fi
  done < "$OWNERSHIP_LEDGER"
  return 1
}

record_owned_file() {
  local file="$1" current_sha tmp recorded_path recorded_sha tab
  [ -f "$file" ] || return 1
  current_sha=$(sha256_file "$file")
  [ -n "$current_sha" ] || return 1
  mkdir -p "$RUNTIME_DIR" 2>/dev/null || return 1
  tmp="${OWNERSHIP_LEDGER}.tmp.$$"
  : > "$tmp" || return 1
  tab=$(printf '\t')
  if [ -f "$OWNERSHIP_LEDGER" ]; then
    while IFS="$tab" read -r recorded_path recorded_sha; do
      [ -n "$recorded_path" ] || continue
      [ "$recorded_path" = "$file" ] && continue
      printf '%s\t%s\n' "$recorded_path" "$recorded_sha" >> "$tmp" || {
        rm -f "$tmp"
        return 1
      }
    done < "$OWNERSHIP_LEDGER"
  fi
  printf '%s\t%s\n' "$file" "$current_sha" >> "$tmp" || {
    rm -f "$tmp"
    return 1
  }
  chmod 600 "$tmp" 2>/dev/null || {
    rm -f "$tmp"
    return 1
  }
  mv "$tmp" "$OWNERSHIP_LEDGER"
}

legacy_file_matches_signed_source() {
  local file="$1" source="$2" actual_name="${3:-}" canonical_name="${4:-}"
  local tmp manifest want_sha got_sha
  [ -f "$file" ] || return 1
  tmp=$(mktemp "${TMPDIR:-/tmp}/alexandria.XXXXXX" 2>/dev/null) || return 1
  cp "$file" "$tmp" 2>/dev/null || {
    rm -f "$tmp"
    return 1
  }
  if [ -n "$actual_name" ] && [ -n "$canonical_name" ] && [ "$actual_name" != "$canonical_name" ]; then
    if [ "$(uname)" = "Darwin" ]; then
      sed -i '' "s/^name: $actual_name\$/name: $canonical_name/" "$tmp" 2>/dev/null
    else
      sed -i "s/^name: $actual_name\$/name: $canonical_name/" "$tmp" 2>/dev/null
    fi
  fi
  got_sha=$(sha256_file "$tmp")
  rm -f "$tmp"
  [ -n "$got_sha" ] || return 1
  manifest="$PREVIOUS_VERIFIED_MANIFEST"
  [ -n "$manifest" ] && [ -s "$manifest" ] || return 1
  want_sha=$(awk -v p="factory/$source" '$2==p{print $1}' "$manifest")
  [ -n "$want_sha" ] && [ "$want_sha" = "$got_sha" ] && return 0
  return 1
}

# Preferred-slot skills can drift on a live Author machine (local edits, older
# releases) while remaining Alexandria. Exact bytes are the strong claim; the
# name+description pair from the signed factory skill is the mold-in claim for
# the preferred /a and /a. slots only. A foreign skill that stole the name but
# kept a different description stays foreign.
preferred_skill_identity_matches() {
  local file="$1" source="$2" actual_name="$3" canonical_name="$4"
  local factory_dir factory_file live_name live_desc factory_name factory_desc
  [ -f "$file" ] || return 1
  case "$canonical_name" in
    a|a.) ;;
    *) return 1 ;;
  esac
  factory_dir="$(cd "$(dirname "$0")" 2>/dev/null && pwd)" || return 1
  factory_file="$factory_dir/$source"
  [ -f "$factory_file" ] || return 1
  live_name=$(awk 'BEGIN{f=0} /^---$/{f++; next} f==1 && /^name:/{sub(/^name:[[:space:]]*/,""); print; exit}' "$file")
  live_desc=$(awk 'BEGIN{f=0} /^---$/{f++; next} f==1 && /^description:/{sub(/^description:[[:space:]]*/,""); print; exit}' "$file")
  factory_name=$(awk 'BEGIN{f=0} /^---$/{f++; next} f==1 && /^name:/{sub(/^name:[[:space:]]*/,""); print; exit}' "$factory_file")
  factory_desc=$(awk 'BEGIN{f=0} /^---$/{f++; next} f==1 && /^description:/{sub(/^description:[[:space:]]*/,""); print; exit}' "$factory_file")
  [ -n "$live_name" ] && [ -n "$live_desc" ] && [ -n "$factory_name" ] && [ -n "$factory_desc" ] || return 1
  [ "$live_name" = "$actual_name" ] || return 1
  [ "$factory_name" = "$canonical_name" ] || return 1
  [ "$live_desc" = "$factory_desc" ] || return 1
  return 0
}

# Cursor hooks installed by older Alexandria releases keep the same docstring
# identity even when the body drifts. Prefer exact signed bytes; otherwise the
# allowlisted alexandria-*.py basename plus a shared "Cursor hook:" docstring
# is enough to claim and refresh. Short docstrings (stop/transcript) never say
# "Alexandria" in the first lines — requiring that word falsely treated our
# own hooks as foreign on Author machines with body drift.
cursor_hook_identity_matches() {
  local file="$1" source="$2"
  local factory_dir factory_file
  [ -f "$file" ] || return 1
  case "$(basename "$file")" in
    alexandria-session-start.py|alexandria-session-end.py|alexandria-stop.py|alexandria-transcript.py) ;;
    *) return 1 ;;
  esac
  factory_dir="$(cd "$(dirname "$0")" 2>/dev/null && pwd)" || return 1
  factory_file="$factory_dir/$source"
  [ -f "$factory_file" ] || return 1
  head -5 "$file" | grep -q 'Cursor hook:' || return 1
  head -5 "$factory_file" | grep -q 'Cursor hook:' || return 1
  return 0
}

# Cursor alwaysApply rules can drift while keeping the factory description.
# Exact bytes first; matching description frontmatter is the mold-in claim for
# skills/cursor.mdc only — a foreign rule with a different description stays foreign.
cursor_rule_identity_matches() {
  local file="$1" source="$2"
  local factory_dir factory_file live_desc factory_desc
  [ -f "$file" ] || return 1
  [ "$source" = "skills/cursor.mdc" ] || return 1
  factory_dir="$(cd "$(dirname "$0")" 2>/dev/null && pwd)" || return 1
  factory_file="$factory_dir/$source"
  [ -f "$factory_file" ] || return 1
  live_desc=$(awk 'BEGIN{f=0} /^---$/{f++; next} f==1 && /^description:/{sub(/^description:[[:space:]]*/,""); gsub(/^"/,""); gsub(/"$/,""); print; exit}' "$file")
  factory_desc=$(awk 'BEGIN{f=0} /^---$/{f++; next} f==1 && /^description:/{sub(/^description:[[:space:]]*/,""); gsub(/^"/,""); gsub(/"$/,""); print; exit}' "$factory_file")
  [ -n "$live_desc" ] && [ -n "$factory_desc" ] || return 1
  [ "$live_desc" = "$factory_desc" ] || return 1
  return 0
}

claim_existing_file() {
  local file="$1" source="$2" actual_name="${3:-}" canonical_name="${4:-}"
  owned_file_matches "$file" && return 0
  if legacy_file_matches_signed_source "$file" "$source" "$actual_name" "$canonical_name"; then
    record_owned_file "$file"
    return
  fi
  if [ -n "$actual_name" ] && [ -n "$canonical_name" ] && \
     preferred_skill_identity_matches "$file" "$source" "$actual_name" "$canonical_name"; then
    record_owned_file "$file"
    return
  fi
  if cursor_hook_identity_matches "$file" "$source"; then
    record_owned_file "$file"
    return
  fi
  if cursor_rule_identity_matches "$file" "$source"; then
    record_owned_file "$file"
    return
  fi
  return 1
}

alex_skill_slot_available() {
  local dir="$1" source="$2" actual_name="$3" canonical_name="$4"
  [ ! -e "$dir" ] || { [ -f "$dir/SKILL.md" ] && claim_existing_file "$dir/SKILL.md" "$source" "$actual_name" "$canonical_name"; }
}

alex_file_slot_available() {
  local file="$1" source="$2" actual_name="${3:-}" canonical_name="${4:-}"
  [ ! -e "$file" ] || { [ -f "$file" ] && claim_existing_file "$file" "$source" "$actual_name" "$canonical_name"; }
}

install_start_skill() {
  local source="$1" dir="$2" name="$3" label="$4"
  mkdir -p "$dir" 2>/dev/null
  fetch_factory "$source" "$dir/SKILL.md" "$label" yes || return 1
  if [ "$name" != "a" ]; then
    if [ "$(uname)" = "Darwin" ]; then
      sed -i '' "s/^name: a$/name: $name/" "$dir/SKILL.md" 2>/dev/null
    else
      sed -i "s/^name: a$/name: $name/" "$dir/SKILL.md" 2>/dev/null
    fi
  fi
  grep -q "^name: $name\$" "$dir/SKILL.md" 2>/dev/null || return 1
  record_owned_file "$dir/SKILL.md"
}

install_close_skill() {
  local dir="$1" name="$2" label="$3"
  mkdir -p "$dir" 2>/dev/null
  fetch_factory "skills/aclose.md" "$dir/SKILL.md" "$label" yes || return 1
  if [ "$name" != "a." ]; then
    if [ "$(uname)" = "Darwin" ]; then
      sed -i '' "s/^name: a\.$/name: $name/" "$dir/SKILL.md" 2>/dev/null
    else
      sed -i "s/^name: a\.$/name: $name/" "$dir/SKILL.md" 2>/dev/null
    fi
  fi
  grep -q "^name: $name\$" "$dir/SKILL.md" 2>/dev/null || return 1
  record_owned_file "$dir/SKILL.md"
}

# Windows filesystems strip a trailing dot from directory names, so the
# canonical `a.` skill path aliases the start skill's `a` directory there.
# The directory is only storage: keep the public skill name `a.` in a portable
# directory on Windows. Named fallbacks still preserve genuinely foreign slots.
close_skill_slots() {
  case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*)
      printf '%s\n' 'alexandria-close|alexandria-close' 'close-alexandria|a.'
      ;;
    *)
      printf '%s\n' 'a.|a.' 'alexandria-close|alexandria-close' 'close-alexandria|close-alexandria'
      ;;
  esac
}

# Claude Code — skill + hooks

if [ -d "$HOME/.claude" ] || command -v claude &>/dev/null; then
  # Install the single visible start route, /a, without claiming a foreign one.
  CLAUDE_A_SKILL=""
  if alex_skill_slot_available "$HOME/.claude/skills/a" "skills/claudecode.md" "a" "a"; then
    install_start_skill "skills/claudecode.md" "$HOME/.claude/skills/a" "a" "skills/claudecode.md (/a skill)" && CLAUDE_A_SKILL="a"
  else
    echo "  Claude Code: kept foreign /a skill"
  fi
  CLAUDE_START_SKILL="$CLAUDE_A_SKILL"

  CLAUDE_CLOSE_SKILL=""
  CLAUDE_CLOSE_DIR=""
  CLAUDE_CLOSE_SLOTS="$(close_skill_slots)"
  while IFS='|' read -r candidate_dir candidate_name; do
    if alex_skill_slot_available "$HOME/.claude/skills/$candidate_dir" "skills/aclose.md" "$candidate_name" "a."; then
      if install_close_skill "$HOME/.claude/skills/$candidate_dir" "$candidate_name" "skills/aclose.md (session close)"; then
        CLAUDE_CLOSE_SKILL="$candidate_name"
        CLAUDE_CLOSE_DIR="$candidate_dir"
      fi
      [ -n "$CLAUDE_CLOSE_SKILL" ] && break
    else
      echo "  Claude Code: kept foreign /$candidate_name skill"
    fi
  done <<< "$CLAUDE_CLOSE_SLOTS"

  # (The scheduled-task bootstrap for the cloud autoloop is RETIRED — /a does
  # that processing interactively. Nothing scheduled installs here.)

  # Delivery: settings.json hooks, wired directly — the same signed
  # shim -> payload chain Cursor/Codex/Factory hand off to. One mechanism,
  # one behavior source, works on every Claude Code surface (CLI + Claude
  # Desktop's code tab, which is Claude Code on the host). No marketplace,
  # no second code path. An earlier marketplace plugin was deleted because it
  # duplicated the skill, added nothing to this curl, and could not create a
  # trustworthy Cowork hook path.
  #
  # Migrate off any prior plugin install so nothing double-fires and the
  # Author lands cleanly on the one hook path.
  if command -v claude &>/dev/null && claude plugin list 2>/dev/null | grep -q 'alexandria@alexandria'; then
    claude plugin uninstall alexandria@alexandria >/dev/null 2>&1 || true
    claude plugin marketplace remove alexandria >/dev/null 2>&1 || true
    echo "  Claude Code: migrated off the parked plugin"
  fi

  # Wire the session hooks into ~/.claude/settings.json. Prefer node; fall back
  # to python3 (both ship a JSON parser) so a Claude Code user WITHOUT node still
  # gets fully wired instead of silently getting nothing. If neither is present,
  # say so plainly and name Claude Code — never silent-skip.
  CLAUDE_HOOKS_OK=""
  if command -v node &>/dev/null; then
    if node -e "
      const fs = require('fs'), os = require('os'), path = require('path');
      const f = path.join(process.env.HOME, '.claude', 'settings.json');
      let settings = {};
      if (fs.existsSync(f)) {
        try { settings = JSON.parse(fs.readFileSync(f, 'utf-8')); }
        catch (e) { console.error('Refusing to alter unreadable Claude settings: ' + e.message); process.exit(2); }
      }
      if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
        console.error('Refusing to alter Claude settings: top level is not an object'); process.exit(2);
      }
      if (settings.hooks === undefined) settings.hooks = {};
      else if (!settings.hooks || typeof settings.hooks !== 'object' || Array.isArray(settings.hooks)) {
        console.error('Refusing to alter Claude settings: hooks is not an object'); process.exit(2);
      }
      if (settings.permissions === undefined) settings.permissions = {};
      else if (!settings.permissions || typeof settings.permissions !== 'object' || Array.isArray(settings.permissions)) {
        console.error('Refusing to alter Claude settings: permissions is not an object'); process.exit(2);
      }
      if (settings.permissions.additionalDirectories === undefined) settings.permissions.additionalDirectories = [];
      else if (!Array.isArray(settings.permissions.additionalDirectories) || !settings.permissions.additionalDirectories.every(x => typeof x === 'string')) {
        console.error('Refusing to alter Claude settings: additionalDirectories is not a string array'); process.exit(2);
      }
      // os.homedir() and Python's Path.home() resolve to the same native path
      // on Windows. Git Bash's HOME is /c/Users/..., which names the same
      // folder but fails an exact health-check comparison with C:\\Users\\....
      const alexDir = path.join(os.homedir(), 'alexandria');
      if (!settings.permissions.additionalDirectories.includes(alexDir)) settings.permissions.additionalDirectories.push(alexDir);
      // Install the native ceiling when its slot is free; preserve every
      // foreign statusline. One local sentinel is the immediate OFF switch.
      const alexStatusLine = { type: 'command', command: 'bash \$HOME/.local/share/alexandria/scripts/statusline.sh' };
      const cueOff = fs.existsSync(path.join(alexDir, 'system/hooks/visible-cue.off'));
      if (JSON.stringify(settings.statusLine) === JSON.stringify(alexStatusLine) && cueOff) {
        delete settings.statusLine;
      } else if (settings.statusLine === undefined && !cueOff) {
        settings.statusLine = alexStatusLine;
      }
      // De-dupe any prior alexandria shim/resolver entry regardless of path form
      // (~ vs \$HOME, /system/hooks/shim vs /hooks/shim) so a re-run replaces
      // rather than appends.
      for (const event of ['SessionStart', 'SessionEnd', 'SubagentStart']) {
        if (settings.hooks[event] !== undefined && !Array.isArray(settings.hooks[event])) {
          console.error('Refusing to alter Claude settings: ' + event + ' is not an array'); process.exit(2);
        }
      }
      const ownedCommands = new Set([
        'bash $HOME/.local/share/alexandria/hooks/shim.sh session-start',
        'bash $HOME/.local/share/alexandria/hooks/shim.sh session-end',
        'bash $HOME/.local/share/alexandria/hooks/shim.sh subagent',
        'python3 $HOME/.local/share/alexandria/scripts/capture_resolver.py 2>/dev/null || true',
      ]);
      const filter = arr => (arr || []).filter(group => {
        const nested = group && Array.isArray(group.hooks) ? group.hooks : [];
        return !nested.some(hook => hook && ownedCommands.has(hook.command));
      });
      settings.hooks.SessionStart = filter(settings.hooks.SessionStart);
      settings.hooks.SessionEnd = filter(settings.hooks.SessionEnd);
      settings.hooks.SubagentStart = filter(settings.hooks.SubagentStart);
      settings.hooks.SessionStart.push({
        // 60s not 10: the shim verifies + fetches the payload over the network
        // before any output — hotel-wifi first sessions were killed mid-fetch
        // at 10s, eating THE BLOCK notice (warm-lead P0.3, 2026-07-15).
        hooks: [{ type: 'command', command: 'bash \$HOME/.local/share/alexandria/hooks/shim.sh session-start', timeout: 60 }]
      });
      settings.hooks.SessionStart.push({
        hooks: [{ type: 'command', command: 'python3 \$HOME/.local/share/alexandria/scripts/capture_resolver.py 2>/dev/null || true', timeout: 10 }]
      });
      settings.hooks.SessionEnd.push({
        hooks: [{ type: 'command', command: 'bash \$HOME/.local/share/alexandria/hooks/shim.sh session-end', timeout: 15 }]
      });
      settings.hooks.SubagentStart.push({
        hooks: [{ type: 'command', command: 'bash \$HOME/.local/share/alexandria/hooks/shim.sh subagent' }]
      });
      fs.writeFileSync(f, JSON.stringify(settings, null, 2));
    " 2>/dev/null; then
      CLAUDE_HOOKS_OK=1
    fi
  fi
  if [ -z "$CLAUDE_HOOKS_OK" ] && command -v python3 &>/dev/null; then
    # Same edit, python3 — no node required. Identical de-dupe + append. Also
    # the fallback when node EXISTS but the edit failed (broken node install,
    # odd version) — don't give up while a working interpreter is sitting here.
    if python3 - <<'PY' 2>/dev/null
import json, os
from pathlib import Path

f = Path.home() / ".claude" / "settings.json"
if f.exists():
    try:
        settings = json.loads(f.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SystemExit(f"refusing to alter unreadable Claude settings: {exc}") from exc
else:
    settings = {}
if not isinstance(settings, dict):
    raise SystemExit("refusing to alter Claude settings: top level is not an object")

if "hooks" not in settings:
    hooks = {}
else:
    hooks = settings["hooks"]
if not isinstance(hooks, dict):
    raise SystemExit("refusing to alter Claude settings: hooks is not an object")
settings["hooks"] = hooks

if "permissions" not in settings:
    permissions = {}
else:
    permissions = settings["permissions"]
if not isinstance(permissions, dict):
    raise SystemExit("refusing to alter Claude settings: permissions is not an object")
settings["permissions"] = permissions
if "additionalDirectories" not in permissions:
    additional = []
else:
    additional = permissions["additionalDirectories"]
if not isinstance(additional, list) or not all(isinstance(item, str) for item in additional):
    raise SystemExit("refusing to alter Claude settings: additionalDirectories is not a string array")
alex_dir = str(Path.home() / "alexandria")
if alex_dir not in additional:
    additional.append(alex_dir)
permissions["additionalDirectories"] = additional

# Install the native ceiling when its slot is free; preserve every foreign
# statusline. One local sentinel is the immediate OFF switch.
alex_status_line = {
    "type": "command",
    "command": "bash $HOME/.local/share/alexandria/scripts/statusline.sh",
}
cue_off = os.path.isfile(os.path.join(alex_dir, "system/hooks/visible-cue.off"))
if settings.get("statusLine") == alex_status_line and cue_off:
    del settings["statusLine"]
elif "statusLine" not in settings and not cue_off:
    settings["statusLine"] = alex_status_line

owned_commands = {
    "bash $HOME/.local/share/alexandria/hooks/shim.sh session-start",
    "bash $HOME/.local/share/alexandria/hooks/shim.sh session-end",
    "bash $HOME/.local/share/alexandria/hooks/shim.sh subagent",
    "python3 $HOME/.local/share/alexandria/scripts/capture_resolver.py 2>/dev/null || true",
}

def keep(entry):
    if not isinstance(entry, dict):
        return True
    nested = entry.get("hooks", [])
    if not isinstance(nested, list):
        return True
    return not any(
        isinstance(hook, dict) and hook.get("command") in owned_commands
        for hook in nested
    )

def clean(event):
    if event not in hooks:
        return []
    arr = hooks[event]
    if not isinstance(arr, list):
        raise SystemExit(f"refusing to alter Claude settings: {event} is not an array")
    return [e for e in arr if keep(e)]

sh = "$HOME/.local/share/alexandria/hooks/shim.sh"
# 60s not 10 for the shim: it verifies + fetches the payload over the network
# before any output — hotel-wifi first sessions were killed mid-fetch at 10s,
# eating THE BLOCK notice (warm-lead P0.3, 2026-07-15). Mirrors the node path.
hooks["SessionStart"] = clean("SessionStart") + [
    {"hooks": [{"type": "command", "command": f"bash {sh} session-start", "timeout": 60}]},
    {"hooks": [{"type": "command", "command": "python3 $HOME/.local/share/alexandria/scripts/capture_resolver.py 2>/dev/null || true", "timeout": 10}]},
]
hooks["SessionEnd"] = clean("SessionEnd") + [
    {"hooks": [{"type": "command", "command": f"bash {sh} session-end", "timeout": 15}]},
]
hooks["SubagentStart"] = clean("SubagentStart") + [
    {"hooks": [{"type": "command", "command": f"bash {sh} subagent"}]},
]

f.write_text(json.dumps(settings, indent=2), encoding="utf-8")
PY
    then
      CLAUDE_HOOKS_OK=1
    fi
  fi

  if [ -n "$CLAUDE_HOOKS_OK" ]; then
    printf '%s\n' 'alexandria-config-v1' > "$RUNTIME_DIR/.owned_claude_config"
    chmod 600 "$RUNTIME_DIR/.owned_claude_config" 2>/dev/null
    echo "  Claude Code: configured (session hooks)"
  else
    echo "  Claude Code: existing settings could not be merged safely; left unchanged"
  fi
fi

# Cursor
if [ -d "$HOME/.cursor" ] || command -v cursor &>/dev/null; then
  mkdir -p "$HOME/.cursor/hooks" 2>/dev/null
  mkdir -p "$HOME/.cursor/rules" 2>/dev/null
  CURSOR_HOOK_FILES_OK=1
  for hook_name in alexandria-session-start.py alexandria-session-end.py alexandria-stop.py alexandria-transcript.py; do
    hook_path="$HOME/.cursor/hooks/$hook_name"
    hook_source="hooks/cursor/$hook_name"
    if alex_file_slot_available "$hook_path" "$hook_source" && \
       fetch_factory "$hook_source" "$hook_path" "$hook_source" yes && \
       record_owned_file "$hook_path"; then
      :
    else
      CURSOR_HOOK_FILES_OK=""
      echo "  Cursor: kept foreign hook $hook_name"
    fi
  done
  chmod +x "$HOME/.cursor/hooks/alexandria-session-start.py" "$HOME/.cursor/hooks/alexandria-session-end.py" "$HOME/.cursor/hooks/alexandria-stop.py" "$HOME/.cursor/hooks/alexandria-transcript.py" 2>/dev/null

  CURSOR_A_SKILL=""
  if alex_skill_slot_available "$HOME/.cursor/skills/a" "skills/claudecode.md" "a" "a"; then
    install_start_skill "skills/claudecode.md" "$HOME/.cursor/skills/a" "a" "skills/claudecode.md (cursor /a skill)" && CURSOR_A_SKILL="a"
  else
    echo "  Cursor: kept foreign /a skill"
  fi
  CURSOR_START_SKILL="$CURSOR_A_SKILL"

  CURSOR_CLOSE_SKILL=""
  CURSOR_CLOSE_DIR=""
  CURSOR_CLOSE_SLOTS="$(close_skill_slots)"
  while IFS='|' read -r candidate_dir candidate_name; do
    if alex_skill_slot_available "$HOME/.cursor/skills/$candidate_dir" "skills/aclose.md" "$candidate_name" "a."; then
      if install_close_skill "$HOME/.cursor/skills/$candidate_dir" "$candidate_name" "skills/aclose.md (cursor session close)"; then
        CURSOR_CLOSE_SKILL="$candidate_name"
        CURSOR_CLOSE_DIR="$candidate_dir"
      fi
      [ -n "$CURSOR_CLOSE_SKILL" ] && break
    else
      echo "  Cursor: kept foreign /$candidate_name skill"
    fi
  done <<< "$CURSOR_CLOSE_SLOTS"

  CURSOR_HOOKS_OK=""
  if command -v python3 &>/dev/null; then
    if python3 - <<'PY' 2>/dev/null
import json
from pathlib import Path

path = Path.home() / ".cursor" / "hooks.json"
if path.exists():
    try:
        cfg = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SystemExit(f"refusing to alter unreadable Cursor hooks: {exc}") from exc
else:
    cfg = {}

if not isinstance(cfg, dict):
    raise SystemExit("refusing to alter Cursor hooks: top level is not an object")

cfg["version"] = 1
if "hooks" not in cfg:
    hooks = {}
else:
    hooks = cfg["hooks"]
if not isinstance(hooks, dict):
    raise SystemExit("refusing to alter Cursor hooks: hooks is not an object")
cfg["hooks"] = hooks

def is_alex_hook(entry):
    if not isinstance(entry, dict):
        return False
    return entry.get("command") in {
        "./hooks/alexandria-session-start.py",
        "./hooks/alexandria-session-end.py",
        "./hooks/alexandria-stop.py",
        "./hooks/alexandria-transcript.py beforeSubmitPrompt",
        "./hooks/alexandria-transcript.py afterAgentResponse",
    }

def clean(event):
    if event not in hooks:
        return []
    arr = hooks[event]
    if not isinstance(arr, list):
        raise SystemExit(f"refusing to alter Cursor hooks: {event} is not an array")
    return [item for item in arr if not is_alex_hook(item)]

# sessionStart 60s: the hook delegates to the signed shim -> payload chain.
# A correctly completed setup runs the pinned payload without a network call.
# Network is used only to verify a new payload or when an optional permission
# requires it. The hook caps the shim at 50s and falls back to local context.
hooks["sessionStart"] = clean("sessionStart") + [
    {"command": "./hooks/alexandria-session-start.py", "timeout": 60}
]
# sessionEnd 30s: transcript -> vault + local git sync via the same chain
# (hook caps the shim at 25s). No feedback is sent automatically.
hooks["sessionEnd"] = clean("sessionEnd") + [
    {"command": "./hooks/alexandria-session-end.py", "timeout": 30}
]
# Transcript capture: pure local append, one raw event line per hook fire.
hooks["beforeSubmitPrompt"] = clean("beforeSubmitPrompt") + [
    {"command": "./hooks/alexandria-transcript.py beforeSubmitPrompt", "timeout": 5}
]
hooks["afterAgentResponse"] = clean("afterAgentResponse") + [
    {"command": "./hooks/alexandria-transcript.py afterAgentResponse", "timeout": 5}
]
hooks["stop"] = clean("stop") + [
    {"command": "./hooks/alexandria-stop.py", "timeout": 8, "loop_limit": None}
]

path.write_text(json.dumps(cfg, indent=2) + "\n", encoding="utf-8")
PY
    then
      CURSOR_HOOKS_OK=1
    fi
  fi

  # The rules filename is shared user space too. Prefer the canonical name,
  # fall back to a product-specific name, and preserve both if foreign.
  CURSOR_RULE_FILE=""
  for candidate in "alexandria.mdc" "alexandria-loop.mdc"; do
    if alex_file_slot_available "$HOME/.cursor/rules/$candidate" "skills/cursor.mdc"; then
      if fetch_factory "skills/cursor.mdc" "$HOME/.cursor/rules/$candidate" "skills/cursor.mdc" yes; then
        if record_owned_file "$HOME/.cursor/rules/$candidate"; then
          CURSOR_RULE_FILE="$candidate"
        fi
      fi
      [ -n "$CURSOR_RULE_FILE" ] && break
    else
      echo "  Cursor: kept foreign rule $candidate"
    fi
  done

  if [ -n "$CURSOR_HOOKS_OK" ]; then
    printf '%s\n' 'alexandria-config-v1' > "$RUNTIME_DIR/.owned_cursor_config"
    chmod 600 "$RUNTIME_DIR/.owned_cursor_config" 2>/dev/null
    echo "  Cursor: configured (hooks + rules + /a skill)"
  else
    echo "  Cursor: existing hooks could not be merged safely; left unchanged"
  fi
fi

# Factory (Droid CLI)
if [ -d "$HOME/.factory" ] || command -v droid &>/dev/null; then
  mkdir -p "$HOME/.factory/skills" 2>/dev/null
  FACTORY_A_SKILL=""
  if alex_skill_slot_available "$HOME/.factory/skills/a" "skills/droid.md" "a" "a"; then
    install_start_skill "skills/droid.md" "$HOME/.factory/skills/a" "a" "skills/droid.md (Factory /a skill)" && FACTORY_A_SKILL="a"
  else
    echo "  Factory: kept foreign /a skill"
  fi
  FACTORY_START_SKILL="$FACTORY_A_SKILL"
  if [ -n "$FACTORY_START_SKILL" ]; then
    echo "  Factory: configured (/$FACTORY_START_SKILL skill)"
  else
    echo "  Factory: no safe Alexandria skill name was available"
  fi

  FACTORY_HOOKS_OK=""
  if command -v python3 &>/dev/null; then
    if python3 - <<'PY' 2>/dev/null
import json
from pathlib import Path

path = Path.home() / ".factory" / "hooks.json"
if path.exists():
    try:
        hooks = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SystemExit(f"refusing to alter unreadable Factory hooks: {exc}") from exc
else:
    hooks = {}
if not isinstance(hooks, dict):
    raise SystemExit("refusing to alter Factory hooks: top level is not an object")

owned = {
    "bash $HOME/.local/share/alexandria/hooks/shim.sh session-start",
    "bash $HOME/.local/share/alexandria/hooks/shim.sh session-end",
    "python3 $HOME/.local/share/alexandria/scripts/capture_resolver.py 2>/dev/null || true",
}
def keep(group):
    if not isinstance(group, dict):
        return True
    nested = group.get("hooks", [])
    return not isinstance(nested, list) or not any(
        isinstance(item, dict) and item.get("command") in owned for item in nested
    )
def clean(event):
    current = hooks.get(event, [])
    if not isinstance(current, list):
        raise SystemExit(f"refusing to alter Factory hooks: {event} is not an array")
    return [group for group in current if keep(group)]

hooks["SessionStart"] = clean("SessionStart") + [
    {"hooks": [{"type": "command", "command": "bash $HOME/.local/share/alexandria/hooks/shim.sh session-start", "timeout": 60}]},
    {"hooks": [{"type": "command", "command": "python3 $HOME/.local/share/alexandria/scripts/capture_resolver.py 2>/dev/null || true", "timeout": 10}]},
]
hooks["SessionEnd"] = clean("SessionEnd") + [
    {"hooks": [{"type": "command", "command": "bash $HOME/.local/share/alexandria/hooks/shim.sh session-end", "timeout": 30}]},
]
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps(hooks, indent=2) + "\n", encoding="utf-8")
PY
    then
      FACTORY_HOOKS_OK=1
      printf '%s\n' 'alexandria-config-v1' > "$RUNTIME_DIR/.owned_factory_config"
      chmod 600 "$RUNTIME_DIR/.owned_factory_config" 2>/dev/null
      echo "  Factory: lifecycle hooks configured; review once in /hooks"
    else
      echo "  Factory: existing hooks could not be merged safely; left unchanged"
    fi
  fi
fi

# Codex
if [ -d "$HOME/.codex" ] || command -v codex &>/dev/null; then
  mkdir -p "$HOME/.codex" 2>/dev/null
  # Codex discovers user skills from ~/.agents/skills. Install only $a.
  CODEX_A_SKILL=""
  if alex_skill_slot_available "$HOME/.agents/skills/a" "skills/codex.md" "a" "a"; then
    install_start_skill "skills/codex.md" "$HOME/.agents/skills/a" "a" "skills/codex.md (Codex \$a skill)" && CODEX_A_SKILL="a"
  else
    echo "  Codex: kept foreign \$a skill"
  fi
  CODEX_START_SKILL="$CODEX_A_SKILL"

  CODEX_ALIASES=""
  [ -n "$CODEX_A_SKILL" ] && CODEX_ALIASES="a"
  for CODEX_ALIAS in $CODEX_ALIASES; do
    mkdir -p "$HOME/.agents/skills/$CODEX_ALIAS/agents" 2>/dev/null
    CODEX_METADATA="$HOME/.agents/skills/$CODEX_ALIAS/agents/openai.yaml"
    if fetch_factory "skills/codex-openai.yaml" "$CODEX_METADATA" "skills/codex-openai.yaml (Codex \$$CODEX_ALIAS metadata)" yes; then
      record_owned_file "$CODEX_METADATA" || true
    fi
  done

  CODEX_CLOSE_SKILL=""
  CODEX_CLOSE_DIR=""
  CODEX_CLOSE_SLOTS="$(close_skill_slots)"
  while IFS='|' read -r candidate_dir candidate_name; do
    if alex_skill_slot_available "$HOME/.agents/skills/$candidate_dir" "skills/aclose.md" "$candidate_name" "a."; then
      if install_close_skill "$HOME/.agents/skills/$candidate_dir" "$candidate_name" "skills/aclose.md (Codex session close)"; then
        CODEX_CLOSE_SKILL="$candidate_name"
        CODEX_CLOSE_DIR="$candidate_dir"
      fi
      [ -n "$CODEX_CLOSE_SKILL" ] && break
    else
      echo "  Codex: kept foreign \$$candidate_name skill"
    fi
  done <<< "$CODEX_CLOSE_SLOTS"

  # Merge the current Codex surfaces. Preserve every unknown hook and every
  # byte of the user's instructions outside our own marker. Never write the
  # obsolete instructions.md. A changed hook is deliberately left pending:
  # Codex's own /hooks trust screen is the security boundary.
  CODEX_CONFIGURED=""
  if command -v python3 &>/dev/null && \
     [ -s "$RUNTIME_DIR/scripts/configure_codex.py" ] && \
     [ -s "$RUNTIME_DIR/codex-ambient.md" ]; then
    if python3 "$RUNTIME_DIR/scripts/configure_codex.py" \
      --codex-home "$HOME/.codex" --alex-dir "$ALEX_DIR" --runtime-dir "$RUNTIME_DIR" \
      --ambient "$RUNTIME_DIR/codex-ambient.md" \
      --previous-manifest "$PREVIOUS_VERIFIED_MANIFEST" >/dev/null 2>&1; then
      CODEX_CONFIGURED=1
    fi
  fi
  if [ -n "$CODEX_CONFIGURED" ]; then
    printf '%s\n' 'alexandria-config-v1' > "$RUNTIME_DIR/.owned_codex_config"
    chmod 600 "$RUNTIME_DIR/.owned_codex_config" 2>/dev/null
    echo "  Codex: wired (trust is verified in the health check below)"
  else
    echo "  Codex: existing configuration could not be merged safely; left unchanged"
  fi
fi

rm -f "${PREVIOUS_VERIFIED_MANIFEST:-}"
PREVIOUS_VERIFIED_MANIFEST=""

# ── 4. Git substrate — your worldline as cryptographic ledger ─────
#
# ~/alexandria/ is initialised as a LOCAL Git repo. Every Constitution edit,
# marginalia drain, vault drop you preserve becomes a commit, signed with
# your own SSH key when one exists. The repo IS the substrate format.
# Everything in this section is local and offline: no push, no upload, no
# GitHub contact — the cloud backup (to the Author's OWN private repo) is
# the opt-in `backup` add-on in ~/alexandria/system/.optional. The signing
# config is repo-local — does NOT touch your global Git config or existing
# signing setup for other repos.
#
# Idempotent on re-run: signing config runs unconditionally so existing
# installs gain signing on simple re-run of this setup script.

if command -v git &>/dev/null; then
  # git -C "$ALEX_DIR" runs git commands in that dir without cd'ing the parent shell.
  # Status echoes outside any silenced subshell so the user sees them.

  if [ ! -d "$ALEX_DIR/.git" ]; then
    cat > "$ALEX_DIR/.gitignore" << 'GITIGNORE'
# Server-managed (regenerated)
system/canon/
system/hooks/
# Ephemeral state (all dotfiles + dotfolders in system/)
system/.*
system/permissions/
# Library cache (server-fetched tier definitions)
files/library/
# Dev deps for scripts
**/node_modules/
**/package-lock.json
GITIGNORE
    git -C "$ALEX_DIR" init -q 2>/dev/null || true
  fi

  # Fresh machines often have no git identity at all — without one, every
  # commit (genesis and every session's worldline commit after it) silently
  # fails. Repo-local fallback only; never touches global config.
  if [ -z "$(git -C "$ALEX_DIR" config user.email 2>/dev/null)" ]; then
    git -C "$ALEX_DIR" config user.name "${USER:-author}" 2>/dev/null
    git -C "$ALEX_DIR" config user.email "${USER:-author}@alexandria.local" 2>/dev/null
  fi

  # Detect an existing SSH public key (any type — works for ed25519, rsa, ecdsa).
  # No hard-coded path list — ls *.pub, take the first one.
  SSH_PUBKEY=""
  for pubkey in "$HOME"/.ssh/*.pub; do
    [ -f "$pubkey" ] && SSH_PUBKEY="$pubkey" && break
  done

  # Commit signing — FULLY LOCAL. Repo-local git config, no --global, and no
  # network: nothing is uploaded anywhere at install. (Registering the key
  # with GitHub for the "Verified" badge is part of the opt-in backup add-on
  # in ~/alexandria/system/.optional.) `git verify-commit` works offline
  # against the local allowed_signers file.
  SIGNING_OK=""
  if [ -n "$SSH_PUBKEY" ]; then
    git -C "$ALEX_DIR" config gpg.format ssh 2>/dev/null
    git -C "$ALEX_DIR" config user.signingkey "$SSH_PUBKEY" 2>/dev/null
    git -C "$ALEX_DIR" config commit.gpgsign true 2>/dev/null

    # allowed_signers for local `git verify-commit` / `git log --show-signature`.
    # Standard git location. Append idempotently.
    mkdir -p "$HOME/.config/git" 2>/dev/null
    ALLOWED="$HOME/.config/git/allowed_signers"
    touch "$ALLOWED" 2>/dev/null
    SIGN_EMAIL="$(git -C "$ALEX_DIR" config user.email 2>/dev/null)"
    PUBKEY_CONTENTS="$(cat "$SSH_PUBKEY" 2>/dev/null)"
    ENTRY="$SIGN_EMAIL $PUBKEY_CONTENTS"
    if ! grep -qxF "$ENTRY" "$ALLOWED" 2>/dev/null; then
      echo "$ENTRY" >> "$ALLOWED"
      printf '%s\n' "$ENTRY" > "$RUNTIME_DIR/.allowed_signers_entry"
      chmod 600 "$RUNTIME_DIR/.allowed_signers_entry" 2>/dev/null
    fi
    git -C "$ALEX_DIR" config gpg.ssh.allowedSignersFile "$ALLOWED" 2>/dev/null

    SIGNING_OK=1
  fi

  # Genesis commit — signed if signing was configured, unsigned otherwise.
  # Soft fallback throughout. LOCAL ONLY: nothing is pushed anywhere at
  # install — the GitHub backup (to the Author's OWN private repo) is an
  # explicit opt-in add-on, enabled later on their yes.
  if [ -z "$(git -C "$ALEX_DIR" log -1 --format=%H 2>/dev/null)" ]; then
    git -C "$ALEX_DIR" add -A 2>/dev/null
    if [ -n "$SIGNING_OK" ]; then
      git -C "$ALEX_DIR" commit -q -m "alexandria: genesis" 2>/dev/null \
        || git -C "$ALEX_DIR" commit -q -m "alexandria: genesis" --no-gpg-sign 2>/dev/null
    else
      git -C "$ALEX_DIR" commit -q -m "alexandria: genesis" --no-gpg-sign 2>/dev/null
    fi
  fi

  if [ -n "$SIGNING_OK" ]; then
    echo "  signing: enabled locally (commits signed with $(basename "$SSH_PUBKEY"); verify with 'git verify-commit')"
  else
    echo "  signing: skipped (no SSH key at ~/.ssh/*.pub — run 'ssh-keygen -t ed25519' then re-run setup)"
  fi
fi

# Permission records are local consent state, never backup content. Keep this
# true for existing repositories created by earlier releases as well as new ones.
if [ -d "$ALEX_DIR/.git" ]; then
  grep -qxF 'system/permissions/' "$ALEX_DIR/.gitignore" 2>/dev/null || \
    printf '%s\n' 'system/permissions/' >> "$ALEX_DIR/.gitignore"
  git -C "$ALEX_DIR" rm -r --cached --ignore-unmatch system/permissions >/dev/null 2>&1 || true
fi

# ── 5. Cloud connections — NOT installed here ───────────────────
# Setup stays fully local. iCloud capture, Drive, and every backup are separate
# opt-ins in ~/alexandria/system/.optional. Existing links remain untouched.

# ── 5b. iCloud full backup mirror — NOT installed here ───────────
# The daily rsync mirror + its launchd job became an opt-in add-on
# (2026-07-22, the reviewer-gate rework): setup installs no scheduled jobs of
# any kind. Enable steps live in ~/alexandria/system/.optional (module:
# icloud-mirror). Existing installs keep their job; nothing here deletes.

# ── Verify API key works ──────────────────────────────────────────

# Fail loudly if the key is wrong — silent failures at setup time
# mean every session start/end/call POSTs against a dead auth and we
# never find out until the Author wonders why nothing happened.
KEY_STATUS=""
if [ "$KEYLESS" = "true" ]; then
  KEY_STATUS="none"          # free mode — no key to verify, no server contacted
elif command -v curl &>/dev/null; then
  KEY_STATUS=$(curl -s -o /dev/null -w '%{http_code}' \
    -H "Authorization: Bearer $API_KEY" \
    --max-time 8 \
    "$SERVER/alexandria" 2>/dev/null || echo "000")
fi

# Persist a newly supplied key only after the server validates it. Three
# outcomes:
#   200 → verified — store it (0600); connected features remain off.
#   401 → definitively rejected — never store it, and if the SAME key was
#         already stored by a prior install, quarantine it to
#         .api_key.rejected so a bare re-run goes keyless instead of
#         re-failing on the dead key forever.
#   000 / anything else → do not store a newly supplied key; retry later. An
#         already-stored key remains untouched during an ordinary refresh.
if [ -n "$API_KEY" ] && [ "$KEYLESS" != "true" ]; then
  if [ "$KEY_STATUS" = "200" ]; then
    echo "$API_KEY" > "$ALEX_DIR/system/.api_key"
    chmod 600 "$ALEX_DIR/system/.api_key"
  elif [ "$KEY_STATUS" = "401" ]; then
    if [ -f "$ALEX_DIR/system/.api_key" ] && \
       [ "$(tr -d '[:space:]' < "$ALEX_DIR/system/.api_key" 2>/dev/null)" = "$API_KEY" ]; then
      mv "$ALEX_DIR/system/.api_key" "$ALEX_DIR/system/.api_key.rejected" 2>/dev/null
    fi
  fi
fi

# ── Functional probes ─────────────────────────────────────────────
# Each subsystem is verified by exercising it (write-test, syntax-check,
# resolved symlink, loaded launchd job) rather than just checking file
# presence. Idempotent — re-running setup re-runs every probe and
# refreshes the matrix.

# files: directory structure + write-test
WRITE_TEST="$ALEX_DIR/system/.write_test.$$"
if [ -d "$ALEX_DIR/files" ] && [ -d "$ALEX_DIR/system" ] && \
   echo "ok" > "$WRITE_TEST" 2>/dev/null && [ -f "$WRITE_TEST" ]; then
  rm -f "$WRITE_TEST"
  STATUS_FILES="ok"; DETAIL_FILES="$ALEX_DIR/ writable"
else
  rm -f "$WRITE_TEST" 2>/dev/null
  STATUS_FILES="fail"; DETAIL_FILES="$ALEX_DIR/ not writable — check permissions and re-run"
fi

# canon: the irreducible core only. Default methods are reported separately and
# may be off by Author choice without making the local loop unhealthy.
if [ -s "$ALEX_DIR/system/canon/foundation.md" ] && [ -s "$ALEX_DIR/system/canon/change-closure.md" ]; then
  F_BYTES=$(wc -c < "$ALEX_DIR/system/canon/foundation.md" | tr -d ' ')
  C_BYTES=$(wc -c < "$ALEX_DIR/system/canon/change-closure.md" | tr -d ' ')
  STATUS_CANON="ok"; DETAIL_CANON="foundation.md (${F_BYTES}b) + change-closure.md (${C_BYTES}b)"
else
  STATUS_CANON="fail"; DETAIL_CANON="foundation.md/change-closure.md missing — re-run setup (network?)"
fi

# starting methods: visible and honest, but never a core gate. A file under
# canon/disabled/ is an intentional, reversible opt-out; a missing file with no
# disabled copy is a degraded default that setup should report.
DEFAULTS_ON=""
DEFAULTS_OFF=""
DEFAULTS_MISSING=""
for module in axioms methodology editor mercury publisher; do
  if [ -s "$ALEX_DIR/system/canon/$module.md" ]; then
    DEFAULTS_ON="${DEFAULTS_ON}${DEFAULTS_ON:+, }$module"
  elif [ -s "$ALEX_DIR/system/canon/disabled/$module.md" ]; then
    DEFAULTS_OFF="${DEFAULTS_OFF}${DEFAULTS_OFF:+, }$module"
  else
    DEFAULTS_MISSING="${DEFAULTS_MISSING}${DEFAULTS_MISSING:+, }$module"
  fi
done
if [ -n "$DEFAULTS_MISSING" ]; then
  STATUS_DEFAULTS="fail"; DETAIL_DEFAULTS="missing: $DEFAULTS_MISSING (loop still works)"
elif [ -n "$DEFAULTS_OFF" ]; then
  STATUS_DEFAULTS="skip"; DETAIL_DEFAULTS="on: ${DEFAULTS_ON:-none}; off by choice: $DEFAULTS_OFF"
else
  STATUS_DEFAULTS="ok"; DETAIL_DEFAULTS="five starting methods on; each removable or replaceable"
fi

# hooks: executable shim that parses + non-empty payload
if [ -x "$RUNTIME_DIR/hooks/shim.sh" ] && \
   bash -n "$RUNTIME_DIR/hooks/shim.sh" 2>/dev/null && \
   [ -s "$RUNTIME_DIR/.hooks_payload" ]; then
  STATUS_HOOKS="ok"; DETAIL_HOOKS="loads your context + captures, every session"
else
  STATUS_HOOKS="fail"; DETAIL_HOOKS="hooks not installed — re-run setup"
fi

# core templates: agent.md / machine.md / notepad.md / feedback.md / shelf.md
CORE_MISSING=""
for f in agent.md machine.md notepad.md feedback.md shelf.md; do
  [ ! -f "$ALEX_DIR/files/core/$f" ] && CORE_MISSING="$CORE_MISSING $f"
done
if [ -z "$CORE_MISSING" ]; then
  STATUS_CORE="ok"; DETAIL_CORE="agent + machine + notepad + feedback + shelf"
else
  STATUS_CORE="fail"; DETAIL_CORE="missing:${CORE_MISSING} — re-run setup"
fi

# The visible route from passive work into /a is on by default. Native chrome
# wins where available; the response footer is the portable floor everywhere
# else. Only the explicit OFF sentinel is a valid skip. A missing or broken
# renderer is a failed core path, not an inferred user choice.
CUE_RENDERED=""
CUE_CODEX_RENDERED=""
CUE_ACTIVE_RENDERED=""
if [ -f "$ALEX_DIR/system/hooks/visible-cue.off" ]; then
  STATUS_CUE="skip"; DETAIL_CUE="off by Author choice"
elif [ ! -f "$RUNTIME_DIR/scripts/statusline.sh" ]; then
  STATUS_CUE="fail"; DETAIL_CUE="renderer missing — re-run setup"
else
  CUE_RENDERED=$(ALEXANDRIA_SETUP_PROBE=1 bash "$RUNTIME_DIR/scripts/statusline.sh" footer 2>/dev/null | tr -d '\r')
  CUE_CODEX_RENDERED=$(ALEXANDRIA_SETUP_PROBE=1 bash "$RUNTIME_DIR/scripts/statusline.sh" footer-codex 2>/dev/null | tr -d '\r')
  CUE_PROBE_HOME="$RUNTIME_DIR/.cue-probe.$$"
  mkdir -p "$CUE_PROBE_HOME/system"
  printf 'alexandria-setup-probe %s\n' "$(date +%s)" > "$CUE_PROBE_HOME/system/.active_a_sessions"
  CUE_ACTIVE_RENDERED=$(printf '%s\n' '{"session_id":"alexandria-setup-probe"}' | \
    ALEXANDRIA_HOME="$CUE_PROBE_HOME" ALEXANDRIA_SETUP_PROBE=1 \
    bash "$RUNTIME_DIR/scripts/statusline.sh" 2>/dev/null | tr -d '\r')
  rm -f "$CUE_PROBE_HOME/system/.active_a_sessions"
  rmdir "$CUE_PROBE_HOME/system" "$CUE_PROBE_HOME" 2>/dev/null || true
  CUE_OUTPUTS_OK=true
  case "$CUE_RENDERED" in *'start /a in a new chat') ;; *) CUE_OUTPUTS_OK=false ;; esac
  case "$CUE_CODEX_RENDERED" in *'start $a in a new chat') ;; *) CUE_OUTPUTS_OK=false ;; esac
  case "$CUE_ACTIVE_RENDERED" in *'/a. when done'*'reflect on what moved') ;; *) CUE_OUTPUTS_OK=false ;; esac
  if [ "$CUE_OUTPUTS_OK" = "true" ]; then
    STATUS_CUE="ok"; DETAIL_CUE="$CUE_RENDERED"
  else
    STATUS_CUE="fail"; DETAIL_CUE="renderer did not produce the Claude/Cursor /a route, Codex \$a route, and per-session a. close route"
  fi
fi

# api key: HTTP probe (already done above)
case "$KEY_STATUS" in
  none) STATUS_KEY="skip"; DETAIL_KEY="not connected — private local loop only" ;;
  200) STATUS_KEY="ok"; DETAIL_KEY="verified (HTTP 200)" ;;
  401) STATUS_KEY="fail"; DETAIL_KEY="rejected — get a fresh key at https://alexandria-library.com/signup" ;;
  000|"") STATUS_KEY="fail"; DETAIL_KEY="server unreachable — check https://api.alexandria-library.com/health" ;;
  *) STATUS_KEY="fail"; DETAIL_KEY="server returned HTTP $KEY_STATUS — protocol may be degraded" ;;
esac

# Coding agents: only show rows for ones the user has installed.
# Functional probe = parse the finished config and require the exact entries
# the host reads. Text search alone can mistake stale or malformed bytes for a
# working passive loop.

validate_claude_config() {
  if command -v python3 >/dev/null 2>&1; then
    python3 - <<'PY' 2>/dev/null
import json
from pathlib import Path

path = Path.home() / ".claude/settings.json"
document = json.loads(path.read_text(encoding="utf-8"))
if not isinstance(document, dict):
    raise SystemExit(1)
if document.get("disableAllHooks") is True:
    raise SystemExit(1)
hooks = document.get("hooks")
permissions = document.get("permissions")
if not isinstance(hooks, dict) or not isinstance(permissions, dict):
    raise SystemExit(1)
roots = permissions.get("additionalDirectories")
if not isinstance(roots, list) or str(Path.home() / "alexandria") not in roots:
    raise SystemExit(1)

required = {
    "SessionStart": [
        {"hooks": [{"type": "command", "command": "bash $HOME/.local/share/alexandria/hooks/shim.sh session-start", "timeout": 60}]},
        {"hooks": [{"type": "command", "command": "python3 $HOME/.local/share/alexandria/scripts/capture_resolver.py 2>/dev/null || true", "timeout": 10}]},
    ],
    "SessionEnd": [
        {"hooks": [{"type": "command", "command": "bash $HOME/.local/share/alexandria/hooks/shim.sh session-end", "timeout": 15}]},
    ],
    "SubagentStart": [
        {"hooks": [{"type": "command", "command": "bash $HOME/.local/share/alexandria/hooks/shim.sh subagent"}]},
    ],
}
for event, expected_groups in required.items():
    groups = hooks.get(event)
    if not isinstance(groups, list) or any(group not in groups for group in expected_groups):
        raise SystemExit(1)
PY
    return
  fi
  command -v node >/dev/null 2>&1 || return 1
  node <<'NODE' 2>/dev/null
const fs = require('fs'), os = require('os'), path = require('path');
const file = path.join(process.env.HOME, '.claude', 'settings.json');
const document = JSON.parse(fs.readFileSync(file, 'utf8'));
if (!document || Array.isArray(document) || typeof document !== 'object') process.exit(1);
if (document.disableAllHooks === true) process.exit(1);
const hooks = document.hooks, permissions = document.permissions;
if (!hooks || Array.isArray(hooks) || typeof hooks !== 'object') process.exit(1);
if (!permissions || Array.isArray(permissions) || typeof permissions !== 'object') process.exit(1);
const root = path.join(os.homedir(), 'alexandria');
if (!Array.isArray(permissions.additionalDirectories) || !permissions.additionalDirectories.includes(root)) process.exit(1);
const required = {
  SessionStart: [
    {hooks: [{type: 'command', command: 'bash $HOME/.local/share/alexandria/hooks/shim.sh session-start', timeout: 60}]},
    {hooks: [{type: 'command', command: 'python3 $HOME/.local/share/alexandria/scripts/capture_resolver.py 2>/dev/null || true', timeout: 10}]},
  ],
  SessionEnd: [{hooks: [{type: 'command', command: 'bash $HOME/.local/share/alexandria/hooks/shim.sh session-end', timeout: 15}]}],
  SubagentStart: [{hooks: [{type: 'command', command: 'bash $HOME/.local/share/alexandria/hooks/shim.sh subagent'}]}],
};
for (const [event, expectedGroups] of Object.entries(required)) {
  const groups = hooks[event];
  if (!Array.isArray(groups)) process.exit(1);
  if (!expectedGroups.every(expected => groups.some(group => JSON.stringify(group) === JSON.stringify(expected)))) process.exit(1);
}
NODE
}

validate_cursor_config() {
  command -v python3 >/dev/null 2>&1 || return 1
  python3 - <<'PY' 2>/dev/null
import json
from pathlib import Path

path = Path.home() / ".cursor/hooks.json"
document = json.loads(path.read_text(encoding="utf-8"))
hooks = document.get("hooks") if isinstance(document, dict) else None
if not isinstance(hooks, dict):
    raise SystemExit(1)
required = {
    "sessionStart": {"command": "./hooks/alexandria-session-start.py", "timeout": 60},
    "sessionEnd": {"command": "./hooks/alexandria-session-end.py", "timeout": 30},
    "beforeSubmitPrompt": {"command": "./hooks/alexandria-transcript.py beforeSubmitPrompt", "timeout": 5},
    "afterAgentResponse": {"command": "./hooks/alexandria-transcript.py afterAgentResponse", "timeout": 5},
    "stop": {"command": "./hooks/alexandria-stop.py", "timeout": 8, "loop_limit": None},
}
for event, expected in required.items():
    entries = hooks.get(event)
    if not isinstance(entries, list) or expected not in entries:
        raise SystemExit(1)
PY
}

CLAUDE_DETECTED="no"
if [ -d "$HOME/.claude" ] || command -v claude &>/dev/null; then
  CLAUDE_DETECTED="yes"
  # Ground truth: the shim hook is registered in settings.json (the config
  # Claude Code — CLI and Desktop code tab — actually reads) and the skill is
  # present.
  if [ -n "${CLAUDE_HOOKS_OK:-}" ] && validate_claude_config && \
     [ "${CLAUDE_A_SKILL:-}" = "a" ] && \
     [ -f "$HOME/.claude/skills/a/SKILL.md" ] && \
     [ -n "${CLAUDE_CLOSE_SKILL:-}" ] && \
     [ -f "$HOME/.claude/skills/${CLAUDE_CLOSE_DIR:-}/SKILL.md" ] && \
     grep -q "^name: $CLAUDE_CLOSE_SKILL$" "$HOME/.claude/skills/$CLAUDE_CLOSE_DIR/SKILL.md" 2>/dev/null; then
    CLAUDE_NAMES="/a + /$CLAUDE_CLOSE_SKILL"
    STATUS_CLAUDE="ok"; DETAIL_CLAUDE="$CLAUDE_NAMES ready; hooks wired; foreign names preserved"
  else
    STATUS_CLAUDE="fail"; DETAIL_CLAUDE="Claude Code cannot safely own the visible /a and /a. route or merge its hooks — resolve the reported collision/error, then re-run setup"
  fi
fi

CURSOR_DETECTED="no"
if [ -d "$HOME/.cursor" ] || command -v cursor &>/dev/null; then
  CURSOR_DETECTED="yes"
  if [ -n "${CURSOR_HOOKS_OK:-}" ] && [ -n "${CURSOR_HOOK_FILES_OK:-}" ] && \
     validate_cursor_config && \
     [ -n "${CURSOR_RULE_FILE:-}" ] && \
     [ -f "$HOME/.cursor/rules/$CURSOR_RULE_FILE" ] && \
     [ "${CURSOR_A_SKILL:-}" = "a" ] && \
     [ -f "$HOME/.cursor/skills/a/SKILL.md" ] && \
     [ -n "${CURSOR_CLOSE_SKILL:-}" ] && \
     [ -f "$HOME/.cursor/skills/${CURSOR_CLOSE_DIR:-}/SKILL.md" ] && \
     grep -q "^name: $CURSOR_CLOSE_SKILL$" "$HOME/.cursor/skills/$CURSOR_CLOSE_DIR/SKILL.md" 2>/dev/null; then
    STATUS_CURSOR="ok"; DETAIL_CURSOR="hooks + $CURSOR_RULE_FILE + /a + /$CURSOR_CLOSE_SKILL; foreign names preserved"
  else
    STATUS_CURSOR="fail"; DETAIL_CURSOR="Cursor cannot safely own the visible /a and /a. route or merge its rules/hooks — resolve the reported collision/error, then re-run setup"
  fi
fi

CODEX_DETECTED="no"
if [ -d "$HOME/.codex" ] || command -v codex &>/dev/null; then
  CODEX_DETECTED="yes"
  CODEX_SKILL_OK=""
  CODEX_START_NAME="${CODEX_A_SKILL:-}"
  CODEX_START_FILE="$HOME/.agents/skills/$CODEX_START_NAME/SKILL.md"
  if [ -n "$CODEX_START_NAME" ] && [ -f "$CODEX_START_FILE" ] && \
     [ "$(sed -n '1p' "$CODEX_START_FILE")" = "---" ] && \
     grep -q "^name: $CODEX_START_NAME$" "$CODEX_START_FILE" 2>/dev/null && \
     grep -q '^description: .' "$CODEX_START_FILE" 2>/dev/null && \
     grep -q '^user_invocable: true$' "$CODEX_START_FILE" 2>/dev/null && \
     [ -f "$HOME/.agents/skills/$CODEX_START_NAME/agents/openai.yaml" ] && \
     grep -q 'allow_implicit_invocation: false' "$HOME/.agents/skills/$CODEX_START_NAME/agents/openai.yaml" 2>/dev/null && \
     [ -n "${CODEX_CLOSE_SKILL:-}" ] && \
     [ -f "$HOME/.agents/skills/${CODEX_CLOSE_DIR:-}/SKILL.md" ] && \
     grep -q "^name: $CODEX_CLOSE_SKILL$" "$HOME/.agents/skills/$CODEX_CLOSE_DIR/SKILL.md" 2>/dev/null; then
    CODEX_SKILL_OK=1
  fi
  CODEX_CONFIG_OK=""
  if [ -n "${CODEX_CONFIGURED:-}" ] && python3 "$RUNTIME_DIR/scripts/configure_codex.py" \
    --codex-home "$HOME/.codex" --alex-dir "$ALEX_DIR" --runtime-dir "$RUNTIME_DIR" \
    --ambient "$RUNTIME_DIR/codex-ambient.md" --check >/dev/null 2>&1; then
    CODEX_CONFIG_OK=1
  fi
  if [ -n "$CODEX_SKILL_OK" ] && [ -n "$CODEX_CONFIG_OK" ] && \
     [ -f "$ALEX_DIR/system/.codex_session_start_ok" ] && \
     [ -f "$ALEX_DIR/system/.codex_session_end_ok" ]; then
    STATUS_CODEX="ok"; DETAIL_CODEX="\$$CODEX_START_NAME + \$$CODEX_CLOSE_SKILL ready; trusted hooks ran start and end; foreign names preserved"
  elif [ -n "$CODEX_SKILL_OK" ] && [ -n "$CODEX_CONFIG_OK" ]; then
    STATUS_CODEX="skip"; DETAIL_CODEX="\$$CODEX_START_NAME + \$$CODEX_CLOSE_SKILL ready; pending one-time hook trust — type /hooks, trust Alexandria, then open and close one task"
  else
    STATUS_CODEX="fail"; DETAIL_CODEX="Codex cannot safely own the visible /a and /a. route or merge its config — resolve the reported collision/error, then re-run setup"
  fi
fi

FACTORY_DETECTED="no"
if [ -d "$HOME/.factory" ] || command -v droid &>/dev/null; then
  FACTORY_DETECTED="yes"
  if [ -n "${FACTORY_START_SKILL:-}" ] && \
     [ -f "$HOME/.factory/skills/$FACTORY_START_SKILL/SKILL.md" ] && \
     [ -n "${FACTORY_HOOKS_OK:-}" ]; then
    STATUS_FACTORY="skip"; DETAIL_FACTORY="/$FACTORY_START_SKILL + passive hooks ready; open /hooks once to review externally added definitions"
  else
    STATUS_FACTORY="fail"; DETAIL_FACTORY="Factory could not safely install both its /a skill and lifecycle hooks — resolve the named collision/error, then re-run setup"
  fi
fi

# A complete product needs one verified path into an active session. Codex's
# pending trust state is the deliberate first-run exception: the skills are
# present and onboarding continues, while the Author still has to approve the
# hooks. A separate host-failure gate below prevents another healthy host from
# hiding an unsafe collision or incomplete merge.
STATUS_ACTIVE="fail"
DETAIL_ACTIVE="no supported ai integration is ready"
if { [ "$CLAUDE_DETECTED" = "yes" ] && [ "$STATUS_CLAUDE" = "ok" ]; } || \
   { [ "$CURSOR_DETECTED" = "yes" ] && [ "$STATUS_CURSOR" = "ok" ]; } || \
   { [ "$CODEX_DETECTED" = "yes" ] && [ "$STATUS_CODEX" = "ok" ]; }; then
  STATUS_ACTIVE="ok"; DETAIL_ACTIVE="active session skill ready"
elif { [ "$CODEX_DETECTED" = "yes" ] && [ "$STATUS_CODEX" = "skip" ]; } || \
     { [ "$FACTORY_DETECTED" = "yes" ] && [ "$STATUS_FACTORY" = "skip" ]; }; then
  STATUS_ACTIVE="skip"; DETAIL_ACTIVE="active skill ready; host hooks await one-time review"
fi

# Passive mode needs a host that can run session hooks and carry the visible
# route during ordinary work. Factory supports this with one-time hook review.
STATUS_PASSIVE="fail"
DETAIL_PASSIVE="no supported passive session path is ready"
if { [ "$CLAUDE_DETECTED" = "yes" ] && [ "$STATUS_CLAUDE" = "ok" ]; } || \
   { [ "$CURSOR_DETECTED" = "yes" ] && [ "$STATUS_CURSOR" = "ok" ]; } || \
   { [ "$CODEX_DETECTED" = "yes" ] && [ "$STATUS_CODEX" = "ok" ]; }; then
  STATUS_PASSIVE="ok"; DETAIL_PASSIVE="ordinary-session hooks and cue route ready"
elif { [ "$CODEX_DETECTED" = "yes" ] && [ "$STATUS_CODEX" = "skip" ]; } || \
     { [ "$FACTORY_DETECTED" = "yes" ] && [ "$STATUS_FACTORY" = "skip" ]; }; then
  STATUS_PASSIVE="skip"; DETAIL_PASSIVE="configured; host hooks await one-time review"
fi

# A detected host that could not be merged safely keeps the whole runtime
# inactive. Otherwise another working host could activate a wrong cue or a
# half-configured hook in the failed host.
STATUS_HOSTS="ok"
{ [ "$CLAUDE_DETECTED" = "yes" ] && [ "$STATUS_CLAUDE" = "fail" ]; } && STATUS_HOSTS="fail"
{ [ "$CURSOR_DETECTED" = "yes" ] && [ "$STATUS_CURSOR" = "fail" ]; } && STATUS_HOSTS="fail"
{ [ "$CODEX_DETECTED" = "yes" ] && [ "$STATUS_CODEX" = "fail" ]; } && STATUS_HOSTS="fail"
{ [ "$FACTORY_DETECTED" = "yes" ] && [ "$STATUS_FACTORY" = "fail" ]; } && STATUS_HOSTS="fail"

# One user-facing loop status: passive hooks → visible cue → active session.
# A cue the Author explicitly turned off is a valid intentional degradation;
# an absent renderer is not. Codex's trust skip is likewise surfaced, never
# manufactured away.
STATUS_LOOP="ok"
DETAIL_LOOP="passive → cue → active"
if [ "$STATUS_HOOKS" != "ok" ] || [ "$STATUS_CUE" = "fail" ] || \
   [ "$STATUS_PASSIVE" = "fail" ] || [ "$STATUS_ACTIVE" = "fail" ] || \
   [ "$STATUS_HOSTS" = "fail" ]; then
  STATUS_LOOP="fail"; DETAIL_LOOP="passive, cue, or active path is incomplete"
elif [ "$STATUS_CUE" = "skip" ]; then
  STATUS_LOOP="skip"; DETAIL_LOOP="passive + active ready; cue off by Author choice"
elif [ "$STATUS_PASSIVE" = "skip" ] || [ "$STATUS_ACTIVE" = "skip" ]; then
  STATUS_LOOP="skip"; DETAIL_LOOP="cue + active skill ready; Codex passive hooks await trust"
fi

# git ledger: local repo + genesis commit. A remote alone is never permission
# to transmit. Backup is active only when its local permission file exactly
# matches the current remote URL; changing the remote pauses it automatically.
if [ -d "$ALEX_DIR/.git" ]; then
  REPO_URL=$(cd "$ALEX_DIR" && git remote get-url origin 2>/dev/null)
  APPROVED_REPO_URL=$(cat "$ALEX_DIR/system/permissions/backup" 2>/dev/null)
  if [ -n "$REPO_URL" ] && [ "$APPROVED_REPO_URL" = "$REPO_URL" ]; then
    STATUS_REPO="ok"; DETAIL_REPO="local ledger + separately approved backup ($REPO_URL)"
  elif [ -n "$REPO_URL" ]; then
    STATUS_REPO="ok"; DETAIL_REPO="local ledger; remote present but automatic backup is off"
  elif [ -n "$(git -C "$ALEX_DIR" log -1 --format=%H 2>/dev/null)" ]; then
    STATUS_REPO="ok"; DETAIL_REPO="local ledger (cloud backup to your own GitHub = optional add-on)"
  else
    STATUS_REPO="fail"; DETAIL_REPO="repo initialized but genesis commit missing — re-run setup"
  fi
elif command -v git &>/dev/null; then
  STATUS_REPO="fail"; DETAIL_REPO="git installed but repo not initialized — re-run setup"
else
  STATUS_REPO="skip"; DETAIL_REPO="git not installed — install git for the version ledger (https://git-scm.com)"
fi

# ── Local setup report ───────────────────────────────────────────

MISSING=""
[ "$STATUS_FILES" != "ok" ] && MISSING="$MISSING files"
[ "$STATUS_CANON" != "ok" ] && MISSING="$MISSING canon"
[ "$STATUS_HOOKS" != "ok" ] && MISSING="$MISSING hooks"
[ "$STATUS_CORE" != "ok" ] && MISSING="$MISSING${CORE_MISSING}"
[ "$STATUS_LOOP" = "fail" ] && MISSING="$MISSING loop"
[ ! -f "$ALEX_DIR/system/.block" ] && MISSING="$MISSING block"

SETUP_STATUS="ok"
[ -n "$MISSING" ] && SETUP_STATUS="missing_files"
[ -n "$FETCH_ERRORS" ] && SETUP_STATUS="fetch_errors"
[ "$KEY_STATUS" = "401" ] && SETUP_STATUS="auth_rejected"
[ "$KEY_STATUS" = "000" ] && SETUP_STATUS="server_unreachable"

{
  echo "Alexandria setup report — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "status: $SETUP_STATUS"
  echo "key_status: ${KEY_STATUS:-not_checked}"
  [ -n "$FETCH_ERRORS" ] && echo "fetch_errors: $FETCH_ERRORS"
  [ -n "$MISSING" ] && echo "missing:$MISSING"
  echo "platforms:"
  if [ -d "$HOME/.claude" ] || command -v claude &>/dev/null; then echo "  claude: present"; else echo "  claude: absent"; fi
  if [ -d "$HOME/.cursor" ] || command -v cursor &>/dev/null; then echo "  cursor: present"; else echo "  cursor: absent"; fi
  if [ -d "$HOME/.factory" ] || command -v droid &>/dev/null; then echo "  factory: present"; else echo "  factory: absent"; fi
  if [ -d "$HOME/.codex" ] || command -v codex &>/dev/null; then echo "  codex: present"; else echo "  codex: absent"; fi
  echo "subsystems:"
  echo "  files: $STATUS_FILES"
  echo "  canon: $STATUS_CANON"
  echo "  methods: $STATUS_DEFAULTS"
  echo "  hooks: $STATUS_HOOKS"
  echo "  core: $STATUS_CORE"
  echo "  passive_session: $STATUS_PASSIVE"
  echo "  visible_cue: $STATUS_CUE"
  echo "  loop: $STATUS_LOOP"
  echo "  api_key: $STATUS_KEY"
  [ "$CLAUDE_DETECTED" = "yes" ] && echo "  claude_skill: $STATUS_CLAUDE"
  [ "$CURSOR_DETECTED" = "yes" ] && echo "  cursor_skill: $STATUS_CURSOR"
  [ "$CODEX_DETECTED" = "yes" ] && echo "  codex_skill: $STATUS_CODEX"
  [ "$FACTORY_DETECTED" = "yes" ] && echo "  factory_skill: $STATUS_FACTORY"
  echo "  private_repo: $STATUS_REPO"
} > "$ALEX_DIR/system/.setup_report"

# ── Status matrix (terminal output) ──────────────────────────────
# At-a-glance: every subsystem the installer attempted, with one-line
# remediation for any gap. Visible to both the user and anyone watching
# the install. Re-running setup re-prints the matrix with current state.

icon_for() {
  case "$1" in
    ok) printf "✓" ;;
    fail) printf "✗" ;;
    skip) printf "·" ;;
    *) printf "?" ;;
  esac
}

emit_row() {
  printf "  %s %-15s %s\n" "$(icon_for "$1")" "$2" "$3"
}

TOTAL_OK=0
TOTAL_FAIL=0
TOTAL_SKIP=0

count_status() {
  case "$1" in
    ok) TOTAL_OK=$((TOTAL_OK+1)) ;;
    fail) TOTAL_FAIL=$((TOTAL_FAIL+1)) ;;
    skip) TOTAL_SKIP=$((TOTAL_SKIP+1)) ;;
  esac
}

count_status "$STATUS_FILES"
count_status "$STATUS_CANON"
count_status "$STATUS_DEFAULTS"
count_status "$STATUS_HOOKS"
count_status "$STATUS_CORE"
count_status "$STATUS_PASSIVE"
count_status "$STATUS_CUE"
count_status "$STATUS_LOOP"
count_status "$STATUS_KEY"
[ "$CLAUDE_DETECTED" = "yes" ] && count_status "$STATUS_CLAUDE"
[ "$CURSOR_DETECTED" = "yes" ] && count_status "$STATUS_CURSOR"
[ "$CODEX_DETECTED" = "yes" ] && count_status "$STATUS_CODEX"
[ "$FACTORY_DETECTED" = "yes" ] && count_status "$STATUS_FACTORY"
count_status "$STATUS_REPO"

echo ""
if [ "$TOTAL_FAIL" -gt 0 ]; then
  echo "Alexandria install complete with gaps. ${TOTAL_OK} ok · ${TOTAL_FAIL} failed · ${TOTAL_SKIP} skipped"
else
  echo "Alexandria installed. ${TOTAL_OK} ok · ${TOTAL_SKIP} skipped"
fi
echo ""

emit_row "$STATUS_FILES" "files" "$DETAIL_FILES"
emit_row "$STATUS_CANON" "canon" "$DETAIL_CANON"
emit_row "$STATUS_DEFAULTS" "starting methods" "$DETAIL_DEFAULTS"
emit_row "$STATUS_HOOKS" "hooks" "$DETAIL_HOOKS"
emit_row "$STATUS_CORE" "core templates" "$DETAIL_CORE"
emit_row "$STATUS_PASSIVE" "passive session" "$DETAIL_PASSIVE"
emit_row "$STATUS_CUE" "visible cue" "$DETAIL_CUE"
emit_row "$STATUS_LOOP" "local loop" "$DETAIL_LOOP"
emit_row "$STATUS_KEY" "account" "$DETAIL_KEY"
[ "$CLAUDE_DETECTED" = "yes" ] && emit_row "$STATUS_CLAUDE" "Claude Code" "$DETAIL_CLAUDE"
[ "$CURSOR_DETECTED" = "yes" ] && emit_row "$STATUS_CURSOR" "Cursor" "$DETAIL_CURSOR"
[ "$CODEX_DETECTED" = "yes" ] && emit_row "$STATUS_CODEX" "Codex" "$DETAIL_CODEX"
[ "$FACTORY_DETECTED" = "yes" ] && emit_row "$STATUS_FACTORY" "Factory" "$DETAIL_FACTORY"
emit_row "$STATUS_REPO" "git ledger" "$DETAIL_REPO"

echo ""
[ "$CODEX_DETECTED" = "yes" ] && [ "$STATUS_CODEX" = "skip" ] && {
  echo "AGENT: tell the Author the Codex row is a required one-time trust step, not"
  echo "a broken install. Codex deliberately skips new hooks until they approve the"
  echo "exact commands in Terminal via /hooks; never bypass or silently manufacture it."
  echo ""
}
# Core health gate. Files, canon, templates, and the assembled passive → cue →
# active loop are the must-haves; the rest (repo, account) degrade gracefully.
# An explicit cue opt-out and Codex's disclosed one-time trust step are valid
# skips. If a CORE piece
# didn't land the install didn't really land — say so plainly and stop the agent,
# rather than handing a half-built base to the block (the one real disaster).
CORE_OK=true
for s in "$STATUS_FILES" "$STATUS_CANON" "$STATUS_HOOKS" "$STATUS_CORE"; do
  [ "$s" = "ok" ] || CORE_OK=false
done
[ "$STATUS_LOOP" = "fail" ] && CORE_OK=false
# The block is core for a FRESH install: the close below points the agent at
# ~/alexandria/system/.block, so a missing block would send it to a file that
# doesn't exist (and the payload's no-block branch then freestyles onboarding).
# Existing Authors already ran it — absence is harmless on a sync re-run.
BLOCK_MISSING=""
if [ -z "$EXISTING_AUTHOR" ] && [ ! -f "$ALEX_DIR/system/.block" ]; then
  CORE_OK=false
  BLOCK_MISSING=1
fi

if [ "$CORE_OK" != "true" ]; then
  rm -f "$RUNTIME_DIR/.setup_complete"
  echo "Install incomplete — a core piece didn't land (see the ✗ rows above)."
  # The block has no matrix row — name it explicitly when it's the gap.
  [ -n "$BLOCK_MISSING" ] && echo "(Also missing: the onboarding file at ~/alexandria/system/.block — the first session needs it.)"
  echo "Re-run through the installed signature verifier; it never overwrites your files:"
  if [ "$KEYLESS" = "true" ]; then
    echo "  bash ~/.local/share/alexandria/scripts/verify-fetch.sh --run setup.sh"
  else
    echo "  bash ~/.local/share/alexandria/scripts/verify-fetch.sh --run setup.sh \$API_KEY"
  fi
  echo ""
  echo "AGENT: core install failed — do NOT read the block, start setup, or draft anything."
  echo "Tell the Author which row above is ✗ and to re-run the line above; then stop."
else
  # This is the only activation point. Every installed hook checks this marker
  # outside the AI-writable Author folder before reading, retaining, or injecting.
  # Remove only legacy files whose exact bytes prove they came from the prior
  # signed release. Names and marker text alone never authorize deletion.
  while IFS='|' read -r legacy_path legacy_source; do
    [ -n "$legacy_path" ] || continue
    if legacy_file_matches_signed_source "$legacy_path" "$legacy_source"; then
      rm -f "$legacy_path"
    fi
  done <<EOF
$ALEX_DIR/system/hooks/shim.sh|hooks/shim.sh
$ALEX_DIR/system/.hooks_payload|hooks/payload.sh
$ALEX_DIR/system/scripts/capture_resolver.py|scripts/capture_resolver.py
$ALEX_DIR/system/scripts/configure_codex.py|scripts/configure_codex.py
$ALEX_DIR/system/scripts/uninstall.py|scripts/uninstall.py
$ALEX_DIR/system/scripts/statusline.sh|scripts/statusline.sh
$ALEX_DIR/system/scripts/verify-fetch.sh|scripts/verify-fetch.sh
EOF
  touch "$RUNTIME_DIR/.setup_complete"
fi

if [ "$CORE_OK" != "true" ]; then
  : # The failure and recovery instructions were printed above.
elif [ "$KEYLESS" = "true" ] || [ "$STATUS_KEY" = "ok" ]; then
  if [ -n "$EXISTING_AUTHOR" ]; then
    # Re-run over a developed constitution = a sync, not a fresh install.
    # Pointing the agent at the block here would re-run full onboarding over
    # an existing Author's mind — say "synced" and stop.
    echo "Synced — you're up to date. Nothing else to do."
    echo ""
    echo "AGENT: existing install refreshed — do NOT read the block or start onboarding."
    echo "Tell the Author they're synced. If you're already mid-session, carry on. If this"
    echo "paste is the first thing in a fresh tab, offer to start a session right now"
    echo "(follow Foundation plus any present default method) so they never have to type /a."
    if [ "$KEYLESS" != "true" ] && [ "$STATUS_KEY" = "ok" ]; then
      echo ""
      echo "Your account is connected. No publishing, marketplace reporting, network"
      echo "fetch, telemetry, or feedback send was enabled. Each is a separate opt-in."
    fi
  else
    echo "Installed — your agent takes it from here. Nothing else to copy or click."
    echo ""
    if [ "$KEYLESS" = "true" ]; then
      echo "AGENT: read ~/alexandria/system/.block now and follow it end-to-end. Open by"
      echo "proposing the plan in your own words — what you'll read, what you'll write,"
      echo "that nothing leaves this machine — and get their ok before opening their files."
      echo "Once they say yes, they can step away."
    else
      echo "AGENT: read ~/alexandria/system/.block now and follow it end-to-end. Open by"
      echo "proposing the plan in your own words — what you'll read, what you'll write,"
      echo "that the connected account enabled no network feature, and get their ok before"
      echo "opening their files."
      echo "Once they say yes, they can step away."
    fi
  fi
  # Radical UX rule (founder, 2026-07-30): the installer prints nothing the
  # agent can carry at a better moment. The habit, Cowork steps and dependency
  # notes used to print here — ~30 lines of wall at a person who hasn't
  # onboarded yet. `.optional` is read only after the Author asks for a named
  # capability (or asks what else is available); `.deferred` is diagnostic
  # context for a missing dependency, never a prompt to add one. A page line is
  # only legal if the model cannot carry it.
  if [ -n "$DEFERRED" ]; then
    printf "%b" "$DEFERRED" > "$ALEX_DIR/system/.deferred" 2>/dev/null || true
  fi
elif [ "$KEY_STATUS" = "401" ]; then
  # Rejected key deserves a plain closing, not just a matrix row: the local
  # install landed fine — only the account layer didn't connect.
  echo "Your API key was rejected by the server — the local install itself is fine,"
  echo "but the account layer (Library, marketplace, kin) isn't connected."
  echo "Get a fresh key at https://alexandria-library.com/signup, then re-run:"
  echo "  bash ~/.local/share/alexandria/scripts/verify-fetch.sh --run setup.sh \$NEW_KEY"
  echo "(The rejected key was not saved — a bare re-run stays keyless instead of re-failing.)"
else
  echo "Re-run anytime: bash ~/.local/share/alexandria/scripts/verify-fetch.sh --run setup.sh \$API_KEY"
fi

# A partial fetch preserves every good local file, but it is not a successful
# install or update. Return non-zero so an agent cannot send the onboarding
# completion receipt or tell the Author a mixed version is finished.
if [ -n "$FETCH_ERRORS" ] || [ -n "$MISSING" ]; then
  echo "Alexandria setup is incomplete; existing verified files were kept. Re-run when the network is stable." >&2
  exit 1
fi
