---
name: publish
description: Create and publish a module in the Author's own GitHub repository, with clear reuse and lineage metadata. No Alexandria upload.
---

Use this skill only when the Author directly asks to publish a Marketplace module. Publishing is an outward action: prepare everything, show the final bytes, and push only after their explicit yes.

## Decide the identity

Choose a lowercase slug. Then make two calls with the Author:

- `universal` — the mechanism is meant to be used as published.
- `personalizable` — the file is a starting point each Author is expected to adapt.

If this module materially adapts another published module, add its canonical ID as `derived_from`. If it stands independently and the source is not needed to explain it, leave lineage empty. There is no percentage test. Attribution and module continuity are meaning judgments; the stable public ID carries the mechanism and exact hashes carry provenance.

## Prepare the file

Run the signed script. It creates or updates the Author's own public `<github-login>/alexandria-modules` repository and writes a local template. Nothing is uploaded in this phase.

```bash
VF="$HOME/.local/share/alexandria/scripts/verify-fetch.sh"
[ -f "$VF" ] || { echo "Alexandria's verifier is missing; restore it through https://alexandria-library.com/start before publishing anything."; exit 1; }
file=$(bash "$VF" --run scripts/publish.sh setup "<slug>" "<universal|personalizable>" "<optional-derived-from-id>")
echo "$file"
```

Write one self-contained Markdown module. It needs a plain description, concrete use and non-use cases, the complete reusable mechanism, and one privacy-safe example. Another AI should be able to inspect and use it without private context or a separate explanation. Keep the module flexible; encode intent and constraints, not assumptions about one harness.

## Publish the exact bytes

Read the finished file back. Verify that private details, secrets, machine paths, and accidental dependencies are absent. Show the Author the full final body and destination. After their explicit yes:

```bash
id=$(bash "$VF" --run scripts/publish.sh finalize "<slug>")
echo "$id"
```

The script commits and pushes to the Author's GitHub repository and prints the canonical module ID. That public GitHub file is the publication. Alexandria receives no upload and stores no body.

Stop after publication unless the Author separately asks to inspect/register their new public module. Publication does not install, activate, or report it. Registering uses the same exact-byte inspection as every other module; reporting needs a separate approval of the complete manifest hash.

Source: `factory/scripts/publish.sh`. Full lifecycle: `factory/canon/marketplace.md`.
