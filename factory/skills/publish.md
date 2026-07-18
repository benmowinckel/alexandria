---
name: publish
description: Publish a marketplace module — orchestrates the two-phase publish.sh, helps the Author write the body, then commits and pushes. AI inference only on the body; mechanics are scripted.
---

You are the publish entry point. The Author wants to share a piece of Alexandria machinery with the marketplace — a skill, prompt, filter, script, ritual, publishing format, or other reusable mechanism.

## What this does

A module is a single markdown file in a public GitHub repo. Suggested home: `<github-login>/alexandria-modules`, but any public path works. Once it exists at a stable URL, its module ID is `github:<user>/<repo>#<path-without-extension>`. The next time the Author's `.call_manifest` POSTs to `/call`, the module surfaces in the public marketplace catalog.

There is no `/publish` endpoint. There is no upload UI. Use is the contribution.

## Steps

### 1. Pick the slug

Ask the Author what to name the module if they haven't said. Constraints: lowercase alphanumerics + hyphens, must start with letter or digit (regex: `[a-z0-9][a-z0-9-]*`). One-word slugs are best: `optimise`, `verify-edit`, `brief-setup`. Confirm before continuing.

### 2. Setup — get the file ready to edit

Run the setup phase. The script ensures `<user>/alexandria-modules` exists on GitHub (creates it via `gh repo create` if not), clones or pulls it locally to `~/alexandria-modules/`, and writes the module template at `<slug>.md` with the slug filled in. The local file path is the only thing on stdout — capture it.

```bash
# Route the fetch through verify-fetch.sh: it checks the script against the
# offline-signed manifest and refuses to emit tampered/unsigned code (installed
# by setup.sh; self-bootstrap if absent). Never curl|bash a factory script raw.
VF="$HOME/alexandria/system/scripts/verify-fetch.sh"; [ -f "$VF" ] || { mkdir -p "$(dirname "$VF")"; curl -fsSL https://raw.githubusercontent.com/benmowinckel/alexandria/main/factory/scripts/verify-fetch.sh -o "$VF" && chmod +x "$VF"; }
file=$(bash "$VF" scripts/publish.sh | bash -s -- setup "<slug>")
echo "$file"
```

If the script errors (gh not installed, gh not authenticated, slug invalid), surface the error and stop.

### 3. Write the body

This is the only step that needs you. Read the template that's now at `$file`. The template has four sections:

- **One-paragraph framing** under the H1 — what problem this module solves and for whom.
- **When to use** — bullet list of triggers. Be specific.
- **When not to use** — adjacent cases where a different module is better.
- **Instruction** — the actual reusable mechanism. If it's a skill, the body of the skill. If a script, paste the script. If a ritual, write the steps. Self-contained: another Author should be able to use this without reading anything else.
- **Example** — one concrete example from real use. Inputs, outputs, what changed. Strip private details — keep the reusable mechanism.

Work with the Author. Probe what makes their version distinct, what edge cases matter, what they'd want a stranger to understand on first read. Don't generate generic content; the marketplace already has enough of that.

When the body reads well to both of you, write it back to `$file`.

### 4. Confirm before publish

Show the Author the final body. They can still edit. They can also abort entirely — `rm "$file"` and skip step 5. Publishing is reversible (delete the file from the repo) but caches and indexes persist; better to confirm now.

### 5. Finalize — commit and push

Run the finalize phase. The script `git add`s the file, commits with message `module: <slug>`, pushes to `main`, and prints the canonical module ID on stdout.

```bash
VF="$HOME/alexandria/system/scripts/verify-fetch.sh"; [ -f "$VF" ] || { mkdir -p "$(dirname "$VF")"; curl -fsSL https://raw.githubusercontent.com/benmowinckel/alexandria/main/factory/scripts/verify-fetch.sh -o "$VF" && chmod +x "$VF"; }
id=$(bash "$VF" scripts/publish.sh | bash -s -- finalize "<slug>")
echo "$id"
```

### 6. Suggest install

The Author probably wants to start using their own module immediately. Offer to run `install.sh` against the new ID — that registers it in `~/alexandria/.call_manifest`, and the next `/call` POST surfaces it on the marketplace.

```bash
VF="$HOME/alexandria/system/scripts/verify-fetch.sh"; [ -f "$VF" ] || { mkdir -p "$(dirname "$VF")"; curl -fsSL https://raw.githubusercontent.com/benmowinckel/alexandria/main/factory/scripts/verify-fetch.sh -o "$VF" && chmod +x "$VF"; }
bash "$VF" scripts/install.sh | bash -s -- "$id"
```

## What this does NOT do

- Does not lint, format, or validate the body beyond what the script enforces (slug regex). The body is freeform markdown — the marketplace measures usage, not style.
- Does not version or tag. The catalog tracks `main`. Edits propagate within 24h via cache TTL.
- Does not add the module to anyone else's manifest. Other Authors install it themselves; that's how the survival ranking works.

## Source of truth

Script: `factory/scripts/publish.sh`. Template: `factory/templates/module.md`. Architecture and lifecycle: `factory/canon/library.md`. All in the public alexandria repo (`benmowinckel/alexandria`).
