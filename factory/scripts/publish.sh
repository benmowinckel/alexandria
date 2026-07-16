#!/usr/bin/env bash
# Publish a marketplace module to <user>/alexandria-modules on GitHub.
#
# Two phases — the orchestrating skill (factory/skills/publish.md) runs:
#   bash publish.sh setup <slug>     ensure repo, clone/pull, write template,
#                                    print local file path on stdout.
#   <Author edits the body, with AI help>
#   bash publish.sh finalize <slug>  commit + push, print canonical module ID.
#
# Env overrides (rarely needed):
#   ALEXANDRIA_MODULES_REPO   default: <gh-login>/alexandria-modules
#   ALEXANDRIA_MODULES_DIR    default: $HOME/alexandria-modules
set -euo pipefail

cmd="${1:-}"
slug="${2:-}"

case "$cmd" in setup|finalize) ;; *)
  echo "usage: publish.sh setup|finalize <slug>" >&2; exit 1 ;;
esac

if [[ ! "$slug" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  echo "publish: invalid slug '$slug' (must match [a-z0-9][a-z0-9-]*)" >&2
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "publish: gh CLI required (https://cli.github.com)" >&2
  exit 1
fi
user=$(gh api user --jq .login 2>/dev/null) || {
  echo "publish: gh not authenticated — run 'gh auth login'" >&2
  exit 1
}

repo="${ALEXANDRIA_MODULES_REPO:-$user/alexandria-modules}"
clone_dir="${ALEXANDRIA_MODULES_DIR:-$HOME/alexandria-modules}"
file="$clone_dir/$slug.md"

setup() {
  if ! gh repo view "$repo" >/dev/null 2>&1; then
    echo "publish: $repo doesn't exist — creating" >&2
    gh repo create "$repo" --public \
      --description "Alexandria modules — see https://alexandria-library.com/marketplace" \
      --add-readme >&2
  fi

  if [[ -d "$clone_dir/.git" ]]; then
    git -C "$clone_dir" pull --ff-only >&2
  else
    gh repo clone "$repo" "$clone_dir" >&2
  fi

  if [[ -f "$file" ]]; then
    echo "publish: $file already exists — re-editing" >&2
  else
    template_url="https://raw.githubusercontent.com/mowinckelb/alexandria/main/factory/templates/module.md"
    # Fetch to a tempfile and gate on content BEFORE writing $file: a 404 or
    # truncated response piped straight through sed would leave an empty
    # scaffold that sails past finalize()'s H1 grep and ships blank. The
    # template's own H1 placeholder is the fingerprint — if it isn't there,
    # this isn't the template.
    template_tmp=$(mktemp "${TMPDIR:-/tmp}/alexandria.XXXXXX")
    if ! curl -sf "$template_url" -o "$template_tmp" \
       || [[ ! -s "$template_tmp" ]] \
       || ! grep -qF '# <Module title>' "$template_tmp"; then
      rm -f "$template_tmp"
      echo "publish: template fetch failed or returned unexpected content ($template_url)" >&2
      echo "publish: refusing to write a blank scaffold — check network/URL and retry" >&2
      exit 1
    fi
    sed "s/<slug>/$slug/g" "$template_tmp" > "$file"
    rm -f "$template_tmp"
  fi

  # Path on stdout — the only stdout line, so the skill can capture it cleanly.
  echo "$file"
}

finalize() {
  if [[ ! -f "$file" ]]; then
    echo "publish: $file missing — run 'publish.sh setup $slug' first" >&2
    exit 1
  fi
  if grep -qF '# <Module title>' "$file"; then
    echo "publish: $file still has the template H1 — edit the body before finalizing" >&2
    exit 1
  fi
  cd "$clone_dir"
  git add "$slug.md"
  if git diff --cached --quiet; then
    echo "publish: no changes to commit" >&2
  else
    git commit -m "module: $slug" >&2
    git push >&2
  fi
  # Module ID on stdout — the only stdout line.
  echo "github:$user/alexandria-modules#$slug"
}

case "$cmd" in
  setup)    setup    ;;
  finalize) finalize ;;
esac
