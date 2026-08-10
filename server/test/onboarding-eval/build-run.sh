#!/usr/bin/env bash
# Build a faithful run HOME for the onboarding eval: copy the synthetic stranger's
# footprint into a fresh fake HOME, lay down the exact ~/alexandria/ scaffold that
# factory/setup.sh produces, drop factory/block.md in as the .block instruction, and
# write an all-green .setup_report so the onboarding proceeds to the content phases.
#
# Usage: bash build-run.sh
# Then: spawn a fresh agent, tell it RUN_HOME is run/home, and have it execute
#       run/home/alexandria/system/.block end-to-end (see README.md step 3).
set -eu

EVAL_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$EVAL_DIR/../../.." && pwd)"   # …/public/code
FACTORY="$REPO_ROOT/factory"
RUN="$EVAL_DIR/run/home"
ALEX="$RUN/alexandria"
RUNTIME="$RUN/.local/share/alexandria"

[ -d "$EVAL_DIR/footprint/home" ] || { echo "ERROR: footprint/home missing — (re)build the footprint from persona-bible.md first (README step 1)"; exit 1; }
[ -f "$FACTORY/block.md" ] || { echo "ERROR: $FACTORY/block.md not found"; exit 1; }

rm -rf "$EVAL_DIR/run"
mkdir -p "$RUN"
cp -R "$EVAL_DIR/footprint/home/." "$RUN/"

# Exact scaffold from factory/setup.sh §1
mkdir -p "$ALEX/files/vault" "$ALEX/system/hooks" "$ALEX/files/constitution" \
  "$ALEX/files/marginalia" "$ALEX/files/library/public" "$ALEX/files/library/paid" \
  "$ALEX/files/library/invite" "$ALEX/files/library/authors" "$ALEX/files/works" \
  "$ALEX/files/core" "$ALEX/files/vault/input" "$ALEX/files/vault/_input" \
  "$ALEX/system/canon" "$ALEX/system/scripts" "$RUNTIME"

# Real template core files (§2)
for f in agent.md machine.md notepad.md feedback.md shelf.md; do
  cp "$FACTORY/templates/core/$f" "$ALEX/files/core/$f"
done
cp "$FACTORY/templates/library/filter.md" "$ALEX/files/library/filter.md"
cp "$FACTORY/canon/methodology.md" "$ALEX/system/canon/methodology.md" 2>/dev/null || true
cp "$FACTORY/canon/foundation.md"  "$ALEX/system/canon/foundation.md"  2>/dev/null || true

# The onboarding instruction the agent reads
cp "$FACTORY/block.md" "$ALEX/system/.block"
touch "$RUNTIME/.setup_complete"

# All-green setup report so block's install-integrity gate passes and it proceeds to content
cat > "$ALEX/system/.setup_report" <<'EOF'
Alexandria setup report — synthetic onboarding eval
status: ok
key_status: not_checked
platforms:
  claude: present
  cursor: absent
  factory: absent
  codex: absent
subsystems:
  files: ok
  canon: ok
  methods: ok
  hooks: ok
  core: ok
  passive_session: ok
  visible_cue: ok
  loop: ok
  api_key: skip
  claude_skill: ok
  private_repo: ok
EOF

echo "RUN HOME built at $RUN"
echo "footprint files: $(find "$RUN/Documents" "$RUN/.claude" "$RUN/.cursor" "$RUN/.config" -type f 2>/dev/null | wc -l | tr -d ' ')"
echo "Next: run the onboarding agent against $RUN (README step 3)."
