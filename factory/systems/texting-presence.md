# Texting Presence

## Module ID

`github:benmowinckel/alexandria#factory/systems/texting-presence`
*(user0-origin, built 2026-07-18/19; Founder-layer, **off by default**. Machinery: `imsg_*.sh` + `imsg_daemon.py` in `system/scripts/`, control via `imsg_ctl.sh`. Not yet generalised into `factory/` — see Operation → shipping.)*

## Source

user0, 2026-07-19, after living in the texting channel for two days:

> "Isn't this literally a remote control to my laptop? So processing-wise this is identical to the laptop. It's just the I/O delta. But why is there a delta really? … This should be a major feature that we communicate and sell."

## Problem

The deepest surface an Author already lives in is their phone's messaging app — not a terminal, not a web tab. But the Engine's full power (canon access, file read/write, the compounding loop) has lived only where a local agent runs: the laptop. So the Author's richest capture-and-develop channel is dark exactly when they're away from the desk, which is most of the day. Every rival "text an AI" product answers this by putting a model in a datacenter and bridging chat to it through the vendor's server — which for Alexandria would route private cognition through Alexandria's server and break the one claim no competitor can make ("it never touches our server").

## Pattern

**Text the AI that is actually you — over the channel you already never leave — with the server never in the content path.** Ride the self-thread: the Author's own Mac and phone share one iMessage account, so the Mac sends and it lands on the phone. Three properties fall out for free:

1. **No infrastructure, no cost, no third party.** No number, no Twilio, no cloud bridge — all inside the Apple trust boundary.
2. **Authenticated to the Author, structurally.** The self-thread is reachable only by the Author's own Apple ID, so every inbound text is authenticated-as-them. This is what makes an always-on responder safe where a public bot never could be.
3. **Same brain, adapted I/O (the design law).** Texting is *remote control of the Mac*, so the processing is identical to the terminal — same canon, same files, same tools. The only real delta is the I/O surface, and it is not a wall:
   - **Output:** one-glance text · tappable web links · iCloud drop + "open `<path>` in Files" · Siri directives (give the exact phrase for phone-native actions) · and — once the optional serve-surface is wired — a public link to any artifact so it can *show* images/docs/pages.
   - **Input:** text plus voice transcripts / articles / links / images → all land in the vault, get processed, and are answered on the spot.
   - **Format law:** laptop = full depth; mobile = lead with the answer, links over prose, depth only if asked. Same content, surface-optimised — never a lesser agent.

## Principles embodied

Sovereignty (server never in the content path — this is Bucket-1 delivery; the whole value of the moat, made physical); ride-don't-build (the self-thread + Apple trust boundary replace all messaging infra); structural security over labels (input cryptographically scoped to the Author, brain caged, output only to the Author's own device, irreversible/outward actions gated to an explicit "go"); harness-agnostic (the bridge is pure shell I/O tools the Author owns — the model behind it is rented and hot-swappable); armed-never-fired (the brain drafts anything outward and waits for one word).

## Operation

**Enable (one command, off-by-default):**

```
bash ~/alexandria/system/scripts/imsg_ctl.sh enable
```

It installs the terminal auto-start hook (the popup-free path — see below), then opens the two macOS permission panes and walks the Author through the only steps macOS forbids scripting (user-consent only): **Full Disk Access → `/usr/bin/python3`** (read `chat.db`) and **Automation → Messages** (send). It verifies read access and starts the loop. Idempotent — re-run anytime. Control: `imsg_ctl.sh on|off|status`.

**Runtime:** a foreground poll loop (`imsg_run.sh` → `imsg_daemon.py`) started automatically by a `~/.zshrc` hook on any interactive terminal, so "keep a Terminal tab open" is the whole standing requirement (the Author's routine leaves one open anyway). Each inbound text wakes a caged headless brain (`agent_reply.sh` → the Author's own CLI harness) that answers from canon and can read/write files; irreversible/outward actions wait for the Author's "go."

**Tool adapters — the pixel/acoustic in/out framework (`factory/tools/`).** The brain drives tools by emitting `[[VERB: payload]]` on its own line; `imsg_handle.sh` runs the matching `tools/<verb>.sh` and substitutes its output back into the reply. Ships with: `show.sh` (a file → the Author's iCloud Drive, viewable on their phone anywhere), `remind.sh` / `note.sh` (Reminders / Notes), `music.sh` (Apple Music transport), `scene.sh` (runs one of the Author's own `-a`-suffixed Shortcuts). The Author's live `-a` shortcut list is injected into the brain's prompt each message, so casual words map to the exact Shortcut. **Media-*in*** works too: a photo/file texted in the thread is pulled from `chat.db` and read by the multimodal brain. Adding a tool is one file (`tools/README.md`); first `osascript` per app needs a one-time Automation grant; outward/irreversible adapters stay behind the "go" gate. Two hard-won substitutions (Author-0, 2026-07-19): iMessage attachments deliver **dead paperclips** (the blob never uploads → showing goes through iCloud), and osascript **can't play Apple Music streaming** (→ playing routes through the Author's Shortcuts, which also reach the HomePod from anywhere).

**Hard-won facts baked into the machinery (don't rediscover):** run the brain from a *terminal*, never a launchd background service — launchd re-prompts for TCC every reply (the popup); terminal-launched inherits grants silently. FDA is bound to a binary's code signature, so use stable `/usr/bin/python3`, never a re-signed app (grant survives every edit). Advance the read watermark *before* handing a message to the brain (a reprocess-loop is then structurally impossible). Discriminate the Author's texts from the AI's by the AI logging its own sent ROWIDs — never by `is_from_me` (a saved-contact silently breaks the flag). Decode `attributedBody` or emoji/formatted texts arrive as `[non-text]`.

**Shipping:** the machinery ships in `factory/scripts/` — the wired always-on set: `imsg_daemon.py` (loop) → `imsg_handle.sh` → `agent_reply.sh` (brain) + `imsg_send.sh`, started by `imsg_run.sh`, controlled by `imsg_ctl.sh` — signed under `manifest.txt`. **Nothing is seeded at install** (2026-07-22, the reviewer-gate rework): the module is an opt-in add-on in `~/alexandria/system/.optional`; on the Author's yes, `imsg_ctl.sh enable` self-fetches every missing piece through `verify-fetch.sh` (manifest-checked, seed-if-missing, no PII — the `.imsg_config` template it writes has empty handles the Author fills). It stays dark until that enable. **Proven end-to-end on Author-0's machine (2026-07-19): texting, reminders, notes, show→iCloud, music/scenes via Shortcuts, and media-in all work.** Still needs a **second-Mac check for genericity** — the code is generic (name genericized, handles from `.imsg_config`, shortcuts discovered live, install root `$HOME/alexandria`), but no non-founder machine has run it, so first external adoption should be verified.

## When Not To Use

Non-Apple stacks (the self-thread trick is iMessage-specific; Telegram/WhatsApp are the general-platform variants, each a thin I/O swap). Authors unwilling to keep a machine awake with a terminal open (the honest cost — no machine on = no presence). Authors who want the presence reachable by anyone but themselves — the security model *is* the self-thread; a public number needs a different, deliberately-built gatekeeper.

## Marketplace Note

user0-originated, Founder-layer, off-by-default (needs OS grants no installer can auto-perform, so it is opt-in via the `system`-path feature drip, never auto-installed). Generalises because the pattern — text the AI that is you, over the channel you already live in, with the server out of the content path — is the sovereignty thesis made tangible, and the self-thread rail is free for every Apple Author. Composes with `capture-pipeline` (texting is a live capture surface that also answers) and the serve-surface (optional, unlocks mobile "show me things"). The I/O-surface is swappable (iMessage → Telegram/WhatsApp/wearable) with the brain unchanged — the incompressible core is "same brain, adapted I/O, server never in the path."
