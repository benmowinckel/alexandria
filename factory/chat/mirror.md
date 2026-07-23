# mirror — Tier A recipe (CLI + chat, one canon)

*For Authors who already run the full engine locally and want chat as a satellite surface. Local `~/alexandria` stays primary and `.md`; the local agent stays the only editor of canon. Chat reads everything and writes captures only. No new server, no new format.*

## The two one-way flows (default: rclone)

Two one-way flows beat bidirectional sync complexity:

1. **Canon up** (mirror, local → Drive): `rclone sync ~/alexandria/files drive:alexandria --exclude ".git/**" --exclude "vault/input/**"` — on the nightly backup schedule (same pattern as the existing backup job). Drive's copy is a read mirror; nothing edits it from the cloud side except chat's capture writes, which flow down, not up.
2. **Captures down** (drain, Drive → local): `rclone copy drive:alexandria/vault/input ~/alexandria/files/vault/input` before each `/a` (or on the same schedule). The local session drains them like any capture; the next canon-up pass reflects the drained state.

Setup: `brew install rclone && rclone config` (new remote, type `drive`, own OAuth). **Never symlink `~/alexandria` into a Drive-for-desktop folder** — symlinks are unsupported and break on macOS. Alternative to rclone: Google Drive for desktop with the folder physically inside the Drive mirror (`.md` syncs bidirectionally in both its modes; Docs would appear as unreadable `.gdoc` pointers, which is fine because Tier A never creates Docs).

## The Tier-A `_start` variant

The mirror carries the Author's real `.md` canon, so chat's protocol differs from the chat-only tier in three lines — the bootstrap detects an `.md` canon (any `.md` files in constitution/) and writes this variant of the relevant `_start` sections:

- **Reading:** canon here is plain markdown. `read_file_content` returns empty for `.md` — read via `download_file_content` and decode; use search snippets to navigate before downloading.
- **Writing:** captures only — create plain `.md` files (conversion to Google Docs disabled) in `vault/input/`, date-titled. **Never write to constitution/ or anything else** — development happens on the Author's machine, where the full engine and the git history live.
- Everything else (session shape, manifest, guards) is identical.
