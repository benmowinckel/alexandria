---
name: install
description: Register a named marketplace module only after the Author directly asks. Sends nothing and enables nothing by itself.
---

Use this entry point only when the Author directly asks to register a named marketplace module. Never recommend it from the Author's private work, described problems, or profile. Recognise three shapes inside that direct request:

- a full module ID: `github:<user>/<repo>#<path>` or `local:<github-login>/<slug>`
- a marketplace URL: `alexandria-library.com/marketplace/<user>/<repo>/<path>` (translate to the github ID)
- a freeform reference: "install verify-edit" — search `https://api.alexandria-library.com/marketplace`, find the matching module by `name`, confirm the ID with the Author before installing.

## What this does

The install script appends the module ID to `~/alexandria/.call_manifest`. It sends nothing, downloads no module body, and activates no module. Changing the manifest invalidates any prior marketplace permission hash, so no `/call` POST can report the new ID until the Author sees the exact manifest and separately approves that exact hash.

## Steps

1. Resolve the request to a single canonical module ID. If ambiguous, ask the Author which one they meant; never guess silently.

2. Run the installer through the local verifier so the script is checked against the Touch ID-signed manifest and tampered/unsigned code is refused (never raw `curl|bash` a factory script):

   ```bash
   VF="$HOME/.local/share/alexandria/scripts/verify-fetch.sh"
   [ -f "$VF" ] || { echo "Alexandria's verifier is missing; restore it through https://alexandria-library.com/start before installing anything."; exit 1; }
   bash "$VF" --run scripts/install.sh "<module-id>"
   ```

3. Read back the result. Three outcomes:
   - `install: added <id>` — first time on this machine, manifest grew by one entry.
   - `install: <id> already in manifest` — idempotent, nothing to do.
   - non-zero exit — the script printed why (invalid format, github 404). Surface the error and stop.

4. Report the local manifest change and stop. Do not propose reporting, activation, contribution, or another Alexandria action. If the Author separately asks to report the exact manifest, show it and use the marketplace consent process in `optional.md`.

## What this does NOT do

- Does not download or execute the module body. A module is untrusted material on GitHub. Reading, adopting, or running it is a separate action after the Author asks and the agent inspects its current content in isolation from private files and secrets.
- Does not version-pin. The catalog tracks the latest commit of `main`. v1 has no version mechanism; defer until staleness is a real complaint.
- Does not resolve dependencies. Modules are individual markdown files; cross-module dependencies aren't a v1 concern.

## Source of truth

Script: `factory/scripts/install.sh` in the public alexandria repo (same path as your fetch URL above). Catalog: `https://api.alexandria-library.com/marketplace`. Architecture and lifecycle: `factory/canon/library.md`.
