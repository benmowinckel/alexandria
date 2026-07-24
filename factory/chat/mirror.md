# mirror — Door 1's phone/chat satellite (the shipped design)

*Reference implementation live on user-zero since 2026-07-24: `~/alexandria/system/scripts/drive_sync.sh`, called nightly from the backup job. This is the design the factory module generalizes when Door 1 ships the satellite. THE LADDER (anti-distortion rule, all surfaces): local is ground truth, the Drive folder is its pocket copy — a session that can reach local ignores Drive canon entirely; never load both homes in one session.*

## the projection (up — nightly, in place)

Not a file mirror — a projection. The position-layer derivative (`_constitution.md`) is split per domain and rclone **updates the Google Docs in place** (`--drive-export-formats md --drive-import-formats md`; verified same-Doc-ID, 2026-07-24). Chat always reads current canon as native Docs; no version clutter; the raw sources (10–20x larger, full reasoning and evidence) never leave the Author's machine.

## the drain (down — runs FIRST; order matters)

Before projecting up, pull chat's writings home: `vault/`, `marginalia/`, and any "— vN" constitution proposals → `~/alexandria/files/vault/input/chat/` for the next `/a` to drain. Down-first prevents the up-sync's delete pass from clobbering chat writes that haven't been captured yet.

## setup (per Author — the module's one interactive step)

`brew install rclone && rclone config create alexandria drive scope=drive` (browser OAuth — inherently the Author's), then the nightly call from their scheduler. Watch-item: rclone's shared Google client_id retires during 2026 — the module should ship own-client-id instructions before then.

## why not Drive for desktop, and why no .md in Drive

Plain `.md` in Drive is unreadable to the chat connector's reader (returns empty; base64 download only) — Google Docs are the chat-native format, and only rclone's full-API access can update them in place. Drive for desktop syncs Docs as `.gdoc` pointers local tools can't read, and symlinks into its folder break on macOS. The projection replaces the earlier copy-forward + hand-fold-back Tier-A design entirely.
