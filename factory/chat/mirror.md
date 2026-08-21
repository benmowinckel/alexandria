# mirror — Door 1's phone/chat satellite (the shipped design)

*Shipped for full local Authors through `factory/scripts/drive_ctl.sh` + `drive_sync.sh`. THE LADDER (anti-distortion rule, all surfaces): Git history is ground truth, the local folder is its primary checkout, and Drive is the pocket copy — a session that can reach the local checkout ignores Drive canon entirely; never load both in one session.*

## the projection (up — nightly, in place)

Not a file mirror — a projection. The position-layer derivative (`_constitution.md`) is split per domain and rclone **updates the Google Docs in place** (`--drive-export-formats md --drive-import-formats md`; verified same-Doc-ID, 2026-07-24). Chat always reads current canon as native Docs; no version clutter; the raw sources (10–20x larger, full reasoning and evidence) never leave the Author's machine.

## the drain (down — runs FIRST; order matters)

Before projecting up, copy new or changed chat writings home: `vault/`, `marginalia/`, and any "— vN" constitution proposals → `~/alexandria/files/vault/input/chat/` for the next `/a` to drain. A local content-hash ledger prevents repeats without deleting the Author's Drive documents. Down-first captures every change before the primary checkout is projected back up.

## setup (per Author — one unavoidable Google approval)

The agent fetches and runs the signed `drive_ctl.sh enable`. It installs rclone through Homebrew when needed, opens Google's OAuth approval once, runs the first sync, and schedules the bridge daily at 04:15. The OAuth token stays in the Author's local rclone config; Alexandria's server receives neither credentials nor private data. `drive_ctl.sh off` removes the scheduler while preserving both user-owned copies.

## why not Drive for desktop, and why no .md in Drive

Plain `.md` in Drive is not the connector-native form — the bridge imports Markdown as Google Docs and updates the same-name Docs in place. Drive for desktop syncs Docs as `.gdoc` pointers local tools can't read, so it is not the bridge. The projection replaces copy-forward and manual fold-back.
