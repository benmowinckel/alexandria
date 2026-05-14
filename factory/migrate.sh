#!/usr/bin/env bash
# Alexandria migration — safely upgrade from pre-2026-04-24 structure to current.
# Usage: bash <(curl -fsSL https://raw.githubusercontent.com/mowinckelb/alexandria/main/factory/migrate.sh)
#
# Safe by design:
# - Never overwrites existing files at new locations
# - If a file exists at BOTH old and new path → skip + report conflict (you decide)
# - Only touches canonical files; leaves your unknown content alone
# - Dry-run by default; pass --apply to actually move things

ALEX_DIR="$HOME/alexandria"
APPLY=false
[ "$1" = "--apply" ] && APPLY=true

if [ ! -d "$ALEX_DIR" ]; then
  echo "No ~/alexandria/ found. Run setup.sh first."
  exit 1
fi

CONFLICTS=()
PLANNED=()

# Helper: plan a move if old exists and new doesn't
plan_move() {
  local old="$1" new="$2"
  if [ -f "$old" ] && [ -f "$new" ]; then
    CONFLICTS+=("$old → $new (BOTH exist — manual review)")
  elif [ -f "$old" ] && [ ! -f "$new" ]; then
    PLANNED+=("$old → $new")
  fi
}

# Pre-2026-04-24 → current structure
# Loose operating docs at files/ root → files/core/
plan_move "$ALEX_DIR/files/agent.md"      "$ALEX_DIR/files/core/agent.md"
plan_move "$ALEX_DIR/files/machine.md"    "$ALEX_DIR/files/core/machine.md"
plan_move "$ALEX_DIR/files/notepad.md"    "$ALEX_DIR/files/core/notepad.md"
plan_move "$ALEX_DIR/files/feedback.md"   "$ALEX_DIR/files/core/feedback.md"
plan_move "$ALEX_DIR/files/design.md"     "$ALEX_DIR/files/core/design.md"
plan_move "$ALEX_DIR/files/filter.md"     "$ALEX_DIR/files/library/filter.md"
# filter.md moved from core/ to library/ — publishing policy lives next to library/
plan_move "$ALEX_DIR/files/core/filter.md" "$ALEX_DIR/files/library/filter.md"
# Derivatives at files/ root → into source folder
plan_move "$ALEX_DIR/files/_constitution.md" "$ALEX_DIR/files/constitution/_constitution.md"
plan_move "$ALEX_DIR/files/_ontology.md"     "$ALEX_DIR/files/ontology/_ontology.md"
# Single-file derivatives → files/core/ (alongside source)
plan_move "$ALEX_DIR/files/_notepad.md"      "$ALEX_DIR/files/core/_notepad.md"
plan_move "$ALEX_DIR/files/_feedback.md"     "$ALEX_DIR/files/core/_feedback.md"
# _agent.md is no longer used (agent.md loaded directly) — flag if present, don't auto-move
if [ -f "$ALEX_DIR/files/_agent.md" ] || [ -f "$ALEX_DIR/files/core/_agent.md" ]; then
  CONFLICTS+=("_agent.md found — current architecture uses agent.md source directly. Review and delete the _agent.md derivative when ready.")
fi

# Old top-level paths (pre-2026-04 .alexandria → alexandria with files/system split)
plan_move "$ALEX_DIR/.api_key"           "$ALEX_DIR/system/.api_key"
plan_move "$ALEX_DIR/.hooks_payload"     "$ALEX_DIR/system/.hooks_payload"
plan_move "$ALEX_DIR/.canon_local"       "$ALEX_DIR/system/canon/methodology.md"

# Report
echo "═══ Alexandria migration plan ═══"
echo ""
if [ ${#PLANNED[@]} -eq 0 ] && [ ${#CONFLICTS[@]} -eq 0 ]; then
  echo "Nothing to migrate. Already on current structure."
  exit 0
fi

if [ ${#PLANNED[@]} -gt 0 ]; then
  echo "Will move (${#PLANNED[@]}):"
  for p in "${PLANNED[@]}"; do echo "  $p"; done
  echo ""
fi

if [ ${#CONFLICTS[@]} -gt 0 ]; then
  echo "Conflicts (manual review — ${#CONFLICTS[@]}):"
  for c in "${CONFLICTS[@]}"; do echo "  $c"; done
  echo ""
fi

if [ "$APPLY" != "true" ]; then
  echo "Dry-run only. Re-run with --apply to execute moves:"
  echo "  bash <(curl -fsSL https://raw.githubusercontent.com/mowinckelb/alexandria/main/factory/migrate.sh) --apply"
  exit 0
fi

# Execute
echo "Applying ${#PLANNED[@]} moves..."
for p in "${PLANNED[@]}"; do
  old="${p% → *}"
  new="${p#* → }"
  mkdir -p "$(dirname "$new")"
  mv "$old" "$new" && echo "  ✓ $old → $new"
done

echo ""
echo "Done. New session will use the current structure."
[ ${#CONFLICTS[@]} -gt 0 ] && echo "Note: ${#CONFLICTS[@]} conflicts left for manual review (see above)."
