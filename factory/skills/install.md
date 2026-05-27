---
name: install
description: Install a marketplace module — fetches and runs factory/scripts/install.sh to register a module ID in the Author's call manifest. Idempotent.
---

You are the install entry point. The Author asked you to install a module. Recognise three shapes:

- a full module ID: `github:<user>/<repo>#<path>` or `local:<github-login>/<slug>`
- a marketplace URL: `alexandria-library.com/marketplace/<user>/<repo>/<path>` (translate to the github ID)
- a freeform reference: "install optimise" — search `https://api.alexandria-library.com/marketplace`, find the matching module by `name`, confirm the ID with the Author before installing.

## What this does

The install script appends the module ID to `~/alexandria/.call_manifest`. The next `/call` POST surfaces the module in the public marketplace catalog. There is no `/publish` endpoint — usage IS the contribution.

## Steps

1. Resolve the request to a single canonical module ID. If ambiguous, ask the Author which one they meant; never guess silently.

2. Run the installer. The script lives in the public alexandria repo — fetch it fresh each install so the Author runs the current logic without an SDK update step:

   ```bash
   curl -sf https://raw.githubusercontent.com/mowinckelb/alexandria/main/factory/scripts/install.sh \
     | bash -s -- "<module-id>"
   ```

3. Read back the result. Three outcomes:
   - `install: added <id>` — first time on this machine, manifest grew by one entry.
   - `install: <id> already in manifest` — idempotent, nothing to do.
   - non-zero exit — the script printed why (invalid format, github 404). Surface the error and stop.

4. Mention the next step naturally. The module's metadata won't appear on the marketplace catalog until this Author's next `/call` POST runs (autoloop or session-start). On a Claude Code install with the standard hooks, that fires within seconds of the next session starting; no action needed from the Author.

## What this does NOT do

- Does not download the module body locally. A module is a single markdown file on GitHub; what the module *does* — whether it's a skill loaded into the AI, a script the Engine runs, a hook the Author wires in — happens after the Author reads the module body and acts on it. Installing records the *intent to use*; the use itself is downstream.
- Does not version-pin. The catalog tracks the latest commit of `main`. v1 has no version mechanism; defer until staleness is a real complaint.
- Does not resolve dependencies. Modules are individual markdown files; cross-module dependencies aren't a v1 concern.

## When to suggest an install

When the Author mentions a module by name, asks "what's <name>", browses the marketplace and lands on something interesting, or describes a problem that one of the catalog modules visibly solves. Don't push installs unprompted — read the moment.

## Source of truth

Script: `factory/scripts/install.sh` in the public alexandria repo (same path as your fetch URL above). Catalog: `https://api.alexandria-library.com/marketplace`. Architecture and lifecycle: `factory/canon/library.md`.
