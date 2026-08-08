# Mechanics

You are about to give a non-executable setup message to your existing coding agent. That agent independently verifies one exact GitHub commit before it runs the setup file that modifies your AI config. Read this once. If anything here doesn't match the scripts, don't run it. (Using Claude Desktop? Its **code tab** is Claude Code running on your machine — the same verified setup, run once via a coding agent, wires it up automatically. Everything on this page still applies.)

## TL;DR for the auditor

- **The structural claim** — none of this page asks you to trust the maintainer: we **can't receive** your private data (no protocol endpoint takes your private files, and the hook has no code path that reads them into any request — the session sync reads only your explicit publish outbox), **can't change** your machine after install (code pinned + hardware-signed; anything new applies only by your explicit action), and **can't hide** (public repo, small surface, and the adversarial audit prompt is ours to hand you: [`factory/redteam.md`](https://github.com/benmowinckel/alexandria/blob/main/factory/redteam.md)). Every leg is verifiable below.
- **What runs:** plain bash and markdown. No binaries, no daemons, no launchd/cron jobs, no shell-rc edits, no root.
- **What the install does NOT do:** no push to any remote, no repo creation, no key upload, nothing scheduled. Backups (to your **own** GitHub/iCloud), the iMessage bridge, and marketplace publishing are opt-in add-ons — each needs a separate explicit yes after install (`~/alexandria/system/.optional` documents every one: what it touches, what leaves the machine, its off switch).
- **Source of truth:** `github.com/benmowinckel/alexandria` (public). Auditable line by line.
- **Trust model:** consent-symmetric. The first install runs one independently verified Git commit. After that, the shim only runs the payload pinned on your disk, and every factory file is covered by a manifest signed with the maintainer's Touch ID-bound Secure Enclave key. Newer signed versions surface as a notice; your installed verifier authenticates any update before it runs. Nothing self-updates; compromise of the GitHub account alone does not yield code execution. Full mechanism in [`TRUST.md`](https://github.com/benmowinckel/alexandria/blob/main/TRUST.md).
- **What our server holds:** your email, GitHub user ID, hashed API key, a 60-day event log of which endpoints you hit, and any files you explicitly publish to the Library. Nothing else.
- **What our server does not hold:** your constitution, vault, marginalia, transcripts, or AI-vendor API keys. There is no endpoint that accepts them.
- **Side channel:** the only data that leaves your machine for our server is (a) module IDs you call — recorded so the marketplace can show who's using which gear; per-module call records (your account ID + timestamp + any notes the Engine attached) are queryable by any authenticated Alexandria user via `/marketplace/<module>`, by design, (b) feedback you explicitly type into `~/alexandria/system/.session_feedback`, (c) files you explicitly publish to the Library, (d) one install status report at setup (which subsystems succeeded/failed — no file content), (e) marketplace requests — "I wish a module existed for X" lines you have explicitly cleared for the public wish-board (max 5 per call, ≤300 chars; shown anonymously, ranked by how many distinct accounts asked, at public `/marketplace/requests`), and (f) a canon-health status ping each keyed session-start — which canon modules failed to fetch plus whether an update notice is pending; module names only, never file content. The Engine may *draft* requests and contributions proactively, but nothing in any category is sent without your explicit go — the Engine never auto-sends private content.
- **Uninstall:** the commands at the bottom of this page. Reversible.

## Threat model

We claim:
1. The install does what this page says, and only that. Auditable line by line.
2. Your private cognition (constitution, vault, marginalia, transcripts) never leaves your machine via Alexandria. There is no endpoint that accepts it.
3. A complete breach of our server yields the data listed above and nothing more — because nothing more is stored.

We do not claim:
- Zero metadata. The server logs which endpoints your account hits and when (60-day TTL in KV), and Cloudflare logs IPs at the edge.
- Immunity to the maintainer's Mac being compromised. The signing key cannot be exported from Apple hardware, but malicious local code could try to misuse it when the maintainer approves a Touch ID prompt. Compromise of the public repo or GitHub account alone is not sufficient. Rotation procedure is in `TRUST.md`.
- Zero risk. AI tools execute hooks with your shell privileges. That is true of every editor extension, every dev-server, and every shell hook on your machine — but it is true here too.

## Inspect before running

Start at [`/start`](https://alexandria-library.com/start). Its message tells your agent to clone only `github.com/benmowinckel/alexandria`, fetch the maintainer's public signing keys independently from GitHub's account API, require fingerprint `SHA256:9DVo6uNuieqKMdNtT0QIi/WoQAAbWl5i/t0Z5MdQ/Jg`, and verify the current `main` commit before reading or running project code. It then audits and runs `factory/setup.sh` from that exact commit, with every setup fetch pinned to the same hash.

The setup is one bash script. The hooks payload is one bash script. The shim is one bash script. The matching private key cannot leave the maintainer's Mac hardware, and every release signature requires Touch ID. Everything below describes what they do, in order.

## What gets installed on your machine

**`~/alexandria/`** — a folder, initialised as a local Git repository (`~/alexandria/.git/`). Plain markdown and small JSON state files. All readable. The Git repo IS the substrate format — your worldline is a sequence of commits, your own to push to any Git remote (GitHub is the default if you `gh auth login`; any host works).

| Path | Purpose |
|---|---|
| `.git/` | Local Git repository. Your cognitive worldline as a commit history. |
| `files/constitution/` | Your beliefs, personality, working style. You write these. |
| `files/vault/` | Raw input — transcripts, notes, voice memos. You drop things in. On macOS, `vault/input/` symlinks to `iCloud/alexandria/` for Apple-native captures (Shortcuts, Voice Memos, Files). |
| `files/marginalia/` | Shared working layer between raw and settled — your developing thoughts + Engine candidates, drains over time. |
| `files/library/{public,authors,paid,invite}/` | Files you publish, by visibility tier. Anything in here that doesn't start with `_` or `.` and isn't `filter.md`/`README.md` gets PUT to the server on session-start; deletes there propagate. |
| `files/library/filter.md` | Your publishing policy — the canon-driven rule the Engine consults before promoting drafts to final. |
| `files/core/` | Engine working memory: `agent.md`, `machine.md`, `notepad.md`, `feedback.md`, `shelf.md`. |
| `files/works/` | Long-form pieces in progress. |
| `files/network.md` | Opt-in. URLs of other Authors whose shadows you want pulled into context. The hook fetches each to `files/network/<slug>/shadow.md`, once per day. |
| `system/hooks/shim.sh` | Bash wrapper. Runs the pinned verified payload; checks upstream for signed updates (notify-only). |
| `system/.hooks_payload` | The pinned engine payload. Runs only after passing hardware-signature verification. |
| `system/.payload_verified_sha` | The recorded hash of the verified payload — the pin. If the payload file changes without re-verification, the shim refuses to run it. |
| `system/.canon_manifest` | The signed manifest that backed this cached payload — every canon module is hash-checked against it before being written, so a compromised GitHub repo cannot push poisoned canon either. |
| `system/.factory_version` | Highest signed factory release this machine has accepted. Older valid manifests are rejected instead of being replayed as a downgrade. |
| `system/allowed_signers` | The maintainer's P-256 public key. Trust root for payload + manifest signature verification. |
| `system/scripts/verify-fetch.sh` | The only later update door. It verifies the signed manifest, rejects rollback, verifies the requested file hash, then emits or runs those exact bytes. |
| `system/canon/` | The canon modules, cached locally. **Foundation:** `foundation.md` (the incompressible core — the minimal closed-loop system). **Founder module** (Author #1's default, forkable): `axioms.md`, `methodology.md`, `editor.md`, `mercury.md`, `publisher.md`, `library.md`, `filter.md`, `bookshelf.md`, `plm.md`, `twin.md`. Plus `MODULES.md` (the tier map). **Sovereign and never auto-written** — seeded once at install; after that nothing is auto-applied. Each session checks upstream, **verifies it against the signed manifest**, and surfaces any update as a notice; you pull it (verified) or ignore it. |
| `system/.api_key` | Your API key, mode 0600. |
| `system/.block` | One-time onboarding instructions cached locally. |
| `system/.optional` | The add-ons menu — what each opt-in add-on does, touches, and how to turn it off. |
| `system/.*` (other) | Ephemeral state — session ID markers, sync logs, the error log, autoloop dedup, account-status cache, last-maintenance timestamps. All readable. None leave the machine. |

**`~/.claude/skills/{a,alexandria}/SKILL.md`** — the `/a` skill (and its `/alexandria` alias). **`~/.claude/skills/a./SKILL.md`** — the `/a.` close skill: ends an /a session by capturing everything to your files, then asking what shifted — you say it, in your words; it files them. Plain markdown, all of them. `cat` them. (Cursor gets the same three under `~/.cursor/skills/`.)

**`~/alexandria-fork/`** — **not created at install.** Part of the opt-in `publish` add-on (marketplace contribution): a sparse-checkout of your own GitHub fork of the public `alexandria` repo, created only when you enable that add-on.

### The Git substrate and commit signing

`~/alexandria/` is initialised as a local Git repository. Your worldline IS a commit history — every Constitution edit, marginalia drain, and vault drop you preserve becomes a commit. The repo is yours; you can push to any Git remote (GitHub is the default if you have `gh` authenticated; any host works).

Git preserves the history; it does not certify the mind behind it. A valid commit signature proves that a particular key committed particular bytes. It does not prove that a human originated, understood, or freely chose the position. Alexandria uses Git as a flight recorder beneath its before→after review, not as an authorship oracle.

**Root stewardship.** `root` is a mark inside the living Constitution, not a second identity file or a claim that an untouched self exists. The Author does not maintain a root list. At session start, before Constitution writes, at close, and during maintenance, the Engine compares the Constitution, recent material, deltas and Git history. It watches for unprotected positions that repeatedly govern other choices and for several small movements that together form one material drift. When something plausibly deserves exceptional protection, it creates or refreshes one plain-text `root candidate — pending` or `root drift — pending` packet in marginalia. The Engine nominates; only the Author confirms what becomes root.

The packet contains the evidence, cumulative before→after, strongest case for and against, and the proposing model's identity and self-reported influence. If an already-authorised model from a different provider and independently trained base-model family is callable, the Engine sends it the packet automatically. Otherwise the packet waits in marginalia, the shared layer every supported AI reads; the first qualifying model to encounter it reviews it before discretionary work. Another session, alias, version or reasoning mode of the proposer does not count. The Author never schedules this handoff or remembers a command.

Only after the proposing AI marks the case ready and the independent reviewer marks the contest complete does the Engine ask the Author once for the substantive decision and reason in their own words. Adding a root mark, changing or deleting a root position, and removing the mark all run that same gate. An accepted decision lands in the Constitution, `works/deltas.md` and Git. A rejected designation is recorded and not reproposed without new evidence. An unfinished case waits without nagging. Until all gates close, the old state remains current.

At session start, close and before a Constitution commit, a conforming Engine also compares the root set and passages against Git. An unauthorised addition, rewrite, deletion or unmarking is restored from the last commit and left pending. This is model-enforced semantic review over a file-and-Git substrate, not a cryptographic write lock: an Engine that ignores the instructions can bypass it, but the committed history makes the bypass visible and recoverable to the next conforming Engine. A hard-coded text matcher would be stricter about syntax but blind to the same position being smuggled through different words.

**The provenance stack.** The transcript or vault preserves what was actually said; the delta packet preserves the cumulative before→after, arguments, influences, model identities and human correction; Git preserves byte history and key continuity. None proves inner authorship or freedom from persuasion. The nominating AI can steer salience and framing; different providers can share blind spots; human signoff can rationalise prior influence. Together the stack makes the causal record inspectable and partly reversible. It offers resistance, not immunity.

**How signing works.** `setup.sh` detects an existing SSH public key under `~/.ssh/*.pub` (first one found, any type — Ed25519, RSA, ECDSA). If found, it (a) configures git inside `~/alexandria/` to sign with that key, repo-local — your global git config and other repos are untouched, (b) writes the key + your email to `~/.config/git/allowed_signers` so `git verify-commit` and `git log --show-signature` work locally, and (c) signs the genesis commit. Every subsequent commit is signed automatically. **All of this is local and offline — nothing is uploaded at install.** Registering the key with GitHub (for the "Verified" badge) happens only when you enable the `backup` add-on, which is also the only step that creates the private `alexandria-private` repo on your own account and pushes to it.

The `~/.config/git/allowed_signers` file (used by `git verify-commit` for your own commits) is **not** the same file as `~/alexandria/system/allowed_signers` (used by the shim to verify the maintainer's payload signature). Same file format, different purposes.

**Soft fallback.** If you have no SSH key, setup prints `signing: skipped (...)` with the reason and the genesis commit goes through unsigned. The worldline still works — you just don't get cryptographic key continuity on the ledger. Run `ssh-keygen -t ed25519` and re-run setup to enable signing later.

**OAuth scope.** Alexandria's GitHub OAuth requests `admin:ssh_signing_key` at signup so the `backup` add-on can register your signing key without a separate scope-refresh step when you enable it. Existing pre-scope users see a one-time re-authorize prompt at next web login.

**What you can verify yourself.** `git -C ~/alexandria log --show-signature` shows the signature on each commit. `git -C ~/alexandria verify-commit HEAD` returns "Good signature" if signing is configured. On GitHub, the commit history page shows the green "Verified" badge on each commit. The signing key never leaves your machine; only the public key is uploaded to GitHub.

## What gets modified in your config

| File | Change | Inspect |
|---|---|---|
| `~/.claude/settings.json` | `setup.sh` adds 4 hook entries: SessionStart ×2 (the shim, plus the capture resolver that turns links you saved into readable captures — see the network table), SessionEnd, SubagentStart. Same file Claude Desktop's code tab reads, so that surface is covered by the same entries — nothing extra to install. | `cat ~/.claude/settings.json` |
| `~/.cursor/hooks.json` | Only if Cursor detected. Adds 5 hook entries pointing to the Python wrappers below — session start/end/stop plus per-prompt and per-response transcript capture (written locally to your vault, like the Claude Code transcript archive). | `cat ~/.cursor/hooks.json` |
| `~/.cursor/hooks/alexandria-{session-start,session-end,stop,transcript}.py` | Only if Cursor detected. Four small Python files that shell out to the shim or write the local transcript. | `cat ~/.cursor/hooks/alexandria-*.py` |
| `~/.cursor/rules/alexandria.mdc` | Only if Cursor detected. Plain markdown rule. | `cat ~/.cursor/rules/alexandria.mdc` |
| `~/.codex/hooks.json` | Only if Codex detected. Preserves unknown hooks; adds SessionStart, bounded 3-second SessionEnd, SubagentStart, and capture resolver entries. Codex requires the user to trust each new or changed definition in `/hooks` before it runs. | `cat ~/.codex/hooks.json` |
| `~/.codex/AGENTS.md` | Only if Codex detected. Preserves existing instructions and merges one small marked Alexandria block. If the full Alexandria agent instructions are already present, writes nothing. Legacy `instructions.md` is never touched. | `cat ~/.codex/AGENTS.md` |
| `~/.agents/skills/a/` + `a./` | Only if Codex detected. Installs one start skill and the separate close skill. If the user already owns a foreign `/a`, Alexandria installs only `/alexandria` instead. | `find ~/.agents/skills -maxdepth 2 -name SKILL.md` |
| `~/.factory/droids/a.md` | Only if Factory droid CLI detected. Plain markdown skill. | `cat ~/.factory/droids/a.md` |

**Not modified:** shell rc files (`.zshrc`, `.bashrc`, `.profile`), system `PATH`, sudoers, system services, launchd, cron, anything outside `~/alexandria/`, the detected harness folders (`~/.claude/`, `~/.cursor/`, `~/.codex/`, `~/.factory/`, `~/.agents/skills/`), and the Cursor sidecar `~/.alexandria/` (transcript staging + hook logs — session capture only, never canon). The repo-local git config inside `~/alexandria/` is set; your global git config is not. The install schedules nothing and creates no background processes — scheduled jobs exist only inside opt-in add-ons (`io.alexandria.publish` for marketplace publishing, `io.alexandria.icloud-backup` for the iCloud mirror, the texting bridge's digest job), each installed only on your explicit yes and each with a one-line off switch listed in `~/alexandria/system/.optional`.

### How each surface is wired

One verified setup wires every surface — nothing to install per-agent, no plugin, no marketplace:

- **Claude Code:** the 3 hook entries in `~/.claude/settings.json` fire the shim at session start/end.
- **Claude Desktop's code tab:** that tab **is** Claude Code running on your machine — it reads the same `~/.claude/settings.json`, so the same entries cover it automatically. The normal chat tab cannot run these local hooks; Alexandria still works there through the one account-instructions paste on the [chat onboarding page](/chat), using writable Drive or native memory for personal content.
- **Cursor:** 5 hook entries in `~/.cursor/hooks.json` call small Python wrappers — session start/end/stop plus per-prompt and per-response transcript capture — that shell out to the same shim (or write the local staging transcript Cursor never provides natively).
- **Codex:** native `hooks.json`, current `AGENTS.md`, and one start + one close skill. SessionEnd saves the transcript and a receipt inside Codex's three-second cap; the next SessionStart drains the ordinary feedback/git work. Setup stays visibly pending until trusted hooks have actually run at start and end.
- **Factory:** a plain droid skill in `~/.factory/droids/a.md`; the file-only floor applies where lifecycle hooks are unavailable.

Result: every supported harness uses its native mechanism over one signed payload and one sovereign folder. Hooks are an efficiency ceiling; bare `a` plus the installed methodology is the portable floor.

### Cowork and the Claude app (a file surface, not an install path)

Cowork runs your agent in a sealed environment and can only see a local folder when you attach it. Alexandria installs no Cowork plugin: a plugin duplicated the skill, could not provide a trustworthy hook path, and created a misleading extra install surface. Cowork works through the files themselves:

1. **Capture (automatic).** An optional launchd agent (`com.alexandria.session-capture`, enabled separately) reads the transcripts Cowork writes to your disk and mirrors the dialogue into `~/alexandria/files/vault/sessions/` — no attach needed, riding the one direction the VM shares out.
2. **Awareness (one-time, additive).** `setup.sh` writes `~/alexandria/system/.claude-instructions.md`; integrate its short Alexandria block into **Claude Settings → Profile → "Instructions for Claude"** without replacing anything already there. It prompts for the right home when context would help.
3. **Full read/write (prompted).** Attach `~/alexandria` in Cowork and type bare `a`. The agent reads `system/canon/methodology.md` and the constitution directly. If local is unavailable, use the Drive pocket copy; never load both homes in one task.

Nothing here routes your files through a server; it's the same sovereign folder, reached the only way a sealed VM allows.

## The pinned-payload update model

This is the most important property to understand.

The shim at `~/alexandria/system/hooks/shim.sh` is installed by `setup.sh` and refreshed only by a verified, explicit update. Sessions never refetch the shim. On every session start — Claude Code and Claude Desktop's code tab reach it via the settings-hook entries; Cursor via its Python wrappers — the shim does this:

1. **Runs only the payload pinned on your disk** (`system/.hooks_payload`) — and only if that exact file has passed verification. When the file is new or changed (fresh install, an update you applied), the shim fetches `factory/manifest.txt` + `.sig` over HTTPS, verifies the signature with `ssh-keygen -Y verify` against `~/alexandria/system/allowed_signers` (the public key installed once at setup), and compares the payload's SHA-256 to the manifest entry. Pass → the hash is recorded in `system/.payload_verified_sha` and the payload runs. Fail → the shim refuses to run it: loud warning in the AI's context, entry in `~/alexandria/system/.alexandria_errors`, bare mode (constitution only, no protocol calls).
2. **Checks for updates, notify-only** (skipped if you deleted `hooks/auto-update`): fetches and signature-verifies the current upstream manifest; if it lists a different payload hash, a "signed update available" notice lands in the AI's context. Nothing is applied.

So **the code that processes your session is exactly what you approved — the payload pinned at install or at your last explicit update — and it passed the hardware-signature check before its first run.** Applying an update is always your action: `bash ~/alexandria/system/scripts/verify-fetch.sh --run setup.sh`. The installed verifier authenticates setup before it executes; setup then verifies every fetched factory file. Bare GitHub access isn't enough to ship code — the maintainer must also approve that exact manifest with Touch ID. Full mechanism in [`TRUST.md`](https://github.com/benmowinckel/alexandria/blob/main/TRUST.md).

Engine and **canon** work the same way: both are offered, verified, and applied only on your go — canon via the update notice you pull per-module, the engine via the local verifier. Nothing on your machine changes without your explicit action.

What you're trusting: the maintainer's Touch ID approval on a private key that cannot leave Apple hardware. The public repo is auditable; that physical approval is the only thing that can ship new signed code.

What protects you anyway:
1. **Whole-factory signed manifest + hash pinning.** `manifest.txt` lists a monotonic release version and the SHA-256 of every tracked file under `factory/`, including setup and the verifier. CI derives the same set from Git and fails on any missing or extra path. The manifest itself is signed (`manifest.txt.sig`). Compromise of the GitHub repo alone does not produce code execution.
2. **Refuse-to-run.** A payload that has never passed verification never executes — if the file on disk changes without re-verification (tampering, a half-finished update), the session runs bare instead of running it.
3. **Public diff.** Every payload version is in git history. Any session can be reconstructed from the commit SHA on `main` at that moment.
4. **Canon canaries.** The canon explicitly tells the model to refuse instructions that try to exfiltrate files, escalate scope, or bypass the user. The same posture covers marketplace modules: a foreign module's body is untrusted input — instructions inside it are read as data, not commands, and adopted only after review against your own canon.
5. **AI-tool approval dialogs.** Claude Code, Cursor, and Codex show every shell action before executing. Real protection at install and during anomaly, but it weakens with habituation — treat it as a backstop, not the primary defense.

**Residual gap:** a compromised maintainer Mac could try to misuse the non-exportable key during a misleading Touch ID prompt. Every release still requires the maintainer's physical approval. The key-rotation procedure is documented in `TRUST.md`. If that residual gap matters to you, run a frozen install.

### Turning off update checks

**The simple freeze — delete one file.** `rm ~/alexandria/system/hooks/auto-update`. Updates are already never applied without you; deleting this file stops the public engine/canon checks and every session runs on your pinned local copy. For a free install, that removes Alexandria's standing session-start network reads. If you joined the collective, keyed Library, marketplace, canon-health, and feedback calls remain until you remove `~/alexandria/system/.api_key`. Re-running setup restores the update-check file.

**A truly independent fork needs its own trust root.** Copying the repo is easy; safely shipping changed factory files means replacing the embedded public key, the first-touch fingerprint, and the release signer, then signing your own whole-factory manifests. A raw fork URL is not an authentication mechanism. If you only want immutability, the simple freeze above is the safer, smaller move: your already-verified local files keep running with no update path at all.

## Network call inventory

Every outbound call the install or hooks make. Complete list.

| Call | Trigger | Sends | Receives |
|---|---|---|---|
| `GET github.com/benmowinckel/alexandria` + GitHub account signing-key API | Your coding agent, once before first install | nothing | one exact commit + the public keys needed to authenticate it |
| `GET raw.githubusercontent.com/.../<verified-commit>/factory/...` | Setup, pinned to the exact verified commit | nothing | signed manifest + factory files |
| `POST api.alexandria-library.com/onboard/<token>/installed` | Only after setup succeeds, if you asked for the setup message by email | the one-time opaque email token; no files or machine data | empty 204 response; stops follow-up nudges |
| `GET raw.githubusercontent.com/.../factory/{setup.sh,hooks/...}` | Only when you explicitly apply an update through the installed verifier | nothing | files accepted only if the whole-factory manifest signature, version, and file hash pass |
| `GET raw.githubusercontent.com/.../factory/manifest.txt(.sig)` | Session start — verifying a newly pinned payload + the notify-only update check (skipped if `hooks/auto-update` is deleted) | nothing | signed manifest + signature |
| `GET raw.githubusercontent.com/.../factory/canon/*.md` | Session start, eleven modules | nothing | canon |
| `GET raw.githubusercontent.com/.../factory/{skills,hooks/cursor,templates,scripts}/...` | Install + session-start drift checks | nothing | factory files for skill/hook/template install + comparison |
| `GET api.alexandria-library.com/alexandria` | Setup probe + session status | API key (Bearer) | account + membership status |
| `POST api.alexandria-library.com/canon/status` | Session start, fire-and-forget | API key, list of canon modules that failed to fetch, whether divergence notice exists | 200 |
| `POST api.alexandria-library.com/call` | Session start | API key, module IDs, optional per-module notes (≤2000 chars each — the Engine writes "default canon module" unless you've supplied a `.call_manifest`), optional `requests` you explicitly cleared for the public wish-board (max 5 × 300 chars) | 200/4xx |
| `GET api.alexandria-library.com/library/<your-login>` | Session start, Library reconciliation | nothing | your current server-side file list |
| `PUT api.alexandria-library.com/file/<name>` | Session start, for each file in `library/<tier>/` that isn't a draft/filter/readme | API key, file content + visibility tier | 200/4xx |
| `DELETE api.alexandria-library.com/file/<name>` | Session start, for any server file you no longer have locally | API key | 200/4xx |
| `GET api.alexandria-library.com/library/<slug>/shadow/{authors,free}` | Once per day, only if you created `files/network.md` | API key (for authors-tier), the slug from your network file | shadow content |
| `POST api.alexandria-library.com/feedback` | Install (one install status report, attributed to your account, no file content) + session end (only if YOU typed into `~/alexandria/system/.session_feedback`) | API key, the text being submitted. Install status stays in the 60-day event log; human feedback enters the private feedback queue. | 200/4xx |
| `git push` / `git pull --rebase` against your own `alexandria-private` GitHub repo | Session start (pull then push) + session end (push) — **only if the `backup` add-on is enabled** (i.e. a git remote exists; the install itself creates none) | the tracked contents of `~/alexandria/` — gitignored paths excluded: `system/canon/`, `system/hooks/`, `system/.*`, `files/library/`, `node_modules/` | git ref data |
| `gh` CLI: `gh ssh-key add`, `gh repo create alexandria-private`, `gh repo fork benmowinckel/alexandria` | **Never at install.** Only when you enable the `backup` or `publish` add-on, on your explicit yes | your separate `gh` OAuth token (not your Alexandria API key) | success/failure |
| `GET api.fxtwitter.com/status/<id>` (+ the tweet's media hosts) | Session start, **only if you dropped an X/Twitter link into your capture inbox** (`files/vault/input/`) — the capture resolver turns the link you saved into readable text + media instead of a dead URL | the tweet ID you chose to save (+ your IP, as with any fetch) | tweet text/media, written locally into `files/vault/_input/` |
| `GET www.youtube.com/oembed?...` | Same trigger, for a saved YouTube link | the video URL you saved | title/author metadata, local |
| `GET <a URL you saved>` | Same trigger, for saved links/`.url` drops — fetching what **you** chose to capture | the URL you saved (+ IP) | page content, written locally for your review |

Every authenticated call also carries an `X-Alexandria-Client` header — a client version hash, so a broken client build can be spotted server-side; it identifies the software version, not you (your account is already on the request).

That is all. No telemetry pings, no error reporters, no analytics SDKs, no calls you didn't cause: the last three rows fire only for links you deliberately dropped into your own capture inbox, and everything they fetch lands on your disk, not ours. You can confirm the full surface by `grep -E 'curl|wget|http' ~/alexandria/system/.hooks_payload` and the same grep on `~/alexandria/system/scripts/capture_resolver.py`.

## What our server holds (specifics)

Cloudflare Worker, stateless re: your private content. KV + D1 + R2.

| Stored | Where | Why |
|---|---|---|
| Email + GitHub login + Stripe customer ID, in one encrypted account blob | KV (AES-256-GCM at rest) | Account, OAuth, billing |
| API key — SHA-256 hash only | KV | Auth check |
| Event log: which endpoints your account hit, with timestamps and lightweight context (e.g. "canon_status: failures=editor, has_notice=true") | KV (60-day TTL) | Debugging, abuse signal |
| Library files you explicitly publish | R2 | Published Library content |
| Library file metadata (name, visibility tier, content hash, updated_at) | D1 | Discovery, listing |
| Per-account record of every module call: module ID, your account ID, timestamp, optional notes (≤2000 chars) — plus any requests you cleared for the wish-board, stored in the same table | D1 (`protocol_calls`) | Powers the marketplace. Catalog of modules used in the last 90 days is exposed at public `/marketplace`; per-module caller list is exposed at authed `/marketplace/<module>`; cleared requests are exposed anonymously (text + distinct-caller count only, never account IDs) at public `/marketplace/requests`. |
| Feedback text you explicitly type and submit | Private GitHub repo `benmowinckel/alexandria-feedback` (founder-only access) | Working agents process it and use it to improve the instructions |
| One-line install status report | D1 event log (60-day expiry) | Health and setup diagnosis; it never enters the human feedback queue |

**Not stored anywhere we control:** your constitution, vault, marginalia, transcripts, machine.md, notepad, raw API key, AI-vendor (Anthropic/OpenAI/etc) API keys, or any file outside your `files/library/` publish outbox — the only path the session sync ever `PUT`s. There is no endpoint that accepts them.

**What a complete server breach yields:** account emails, GitHub user IDs, hashed (un-reversible) API keys, the 60-day event log, your full `protocol_calls` history (the per-module portion is already exposed by design via the authed marketplace endpoint), published Library content (files you explicitly published), and Cloudflare-level access logs (IPs, timing). It does not yield private cognition, unpublished files, or AI-vendor credentials, because those never reach the server.

**What a `benmowinckel/alexandria-feedback` breach yields:** feedback text you explicitly typed and submitted, attributed to your GitHub login. Same trust posture as the public repo: protected by GitHub account security.

## Why your API key is safe

- Stored server-side as SHA-256 hash. Never the raw key.
- Account blob in KV encrypted at rest with AES-256-GCM.
- The raw key appears once on the OAuth callback page in your browser. Never in email, never in any third-party metadata.
- Stripe identifies your account by GitHub login, not API key.
- `DELETE /account` with your key cancels any Stripe subscription and removes your account, module-call records, Library activity, and published files. Endpoint events expire on their 60-day TTL. Email us to remove feedback you explicitly submitted.

## Audit checklist

Fastest path: paste the adversarial audit prompt from [`factory/redteam.md`](https://github.com/benmowinckel/alexandria/blob/main/factory/redteam.md) into your AI — it authenticates the commit first, then tries to refute our claims. (We run the same prompt against every change before it ships.) To do it by hand, clone the canonical repo, obtain the account's public signing keys from GitHub's API, require the fingerprint above, and verify the exact `main` commit before reading these paths:

These are the files. Read them.

```
factory/setup.sh
factory/hooks/shim.sh
factory/hooks/payload.sh
factory/scripts/verify-fetch.sh
factory/manifest.txt
factory/manifest.txt.sig
factory/canon/methodology.md
factory/skills/claudecode.md
```

From that authenticated checkout, verify the manifest signature yourself:

```
ssh-keygen -Y verify \
  -f ~/alexandria/system/allowed_signers \
  -I alexandria-payload-signing \
  -n alexandria \
  -s factory/manifest.txt.sig \
  < factory/manifest.txt
# Expected: Good "alexandria" signature for alexandria-payload-signing with ECDSA key SHA256:9DVo6uNuieqKMdNtT0QIi/WoQAAbWl5i/t0Z5MdQ/Jg
```

After install, your live install is at:
- `~/alexandria/system/hooks/shim.sh` (refreshed only by a verified explicit update)
- `~/alexandria/system/.hooks_payload` (refreshed only by a verified explicit update)
- `~/alexandria/system/.canon_manifest` (the verified manifest backing the cached payload)
- `~/alexandria/system/.factory_version` (the accepted rollback floor)
- `~/alexandria/system/canon/*.md` (sovereign; divergence from upstream shows up in `~/alexandria/system/.canon_update_notice`)

Then audit the cached payload for anything that touches the network, evaluates remote code, or reads sensitive paths:

```
# Network and code-evaluation surface
grep -nE '\b(curl|wget|eval|osascript)\b|python -c|bash -c' \
  ~/alexandria/system/.hooks_payload

# Credential-store traversal
grep -nE '\.ssh|\.aws|\.anthropic|\.openai|keychain|gnome-keyring' \
  ~/alexandria/system/.hooks_payload
```

The first should match only the `curl` calls in the network inventory above. The second should return zero matches. (The same checks against `factory/setup.sh` will surface a few additional `curl`s and `gh` calls for the install-time GitHub fork setup, all listed in the install table.)

## Uninstall

```
# Remove the folder + your fork checkout. Your files in alexandria-private
# on GitHub stay yours; we never had access to that repo.
rm -rf ~/alexandria ~/alexandria-fork

# Remove the Claude Code hooks (Claude Desktop's code tab reads the same file,
# so this covers it too)
# (scoped: removes only entries whose command mentions alexandria — any
# hooks of your own in the same file are untouched)
jq '.hooks |= (if . == null then . else with_entries(.value |= map(select(tostring | contains("alexandria") | not))) end)' \
  ~/.claude/settings.json > ~/.claude/settings.json.tmp \
  && mv ~/.claude/settings.json.tmp ~/.claude/settings.json

# Remove the skill, scheduled task, Cursor / Codex / Factory entries
rm -rf ~/.claude/skills/a ~/.claude/skills/a. ~/.claude/skills/alexandria ~/.claude/scheduled-tasks/alexandria
rm -rf ~/.cursor/skills/a ~/.cursor/skills/a. ~/.cursor/skills/alexandria
rm -f  ~/.cursor/rules/alexandria.mdc ~/.cursor/hooks/alexandria-*.py
rm -rf ~/.alexandria
rm -f  ~/.factory/droids/a.md
# ~/.cursor/hooks.json: edit by hand to remove the five alexandria entries
# ~/.codex/hooks.json: remove only hook entries whose command points at ~/alexandria
# ~/.codex/AGENTS.md: remove only the alexandria:start … alexandria:end marker block
rm -rf ~/.agents/skills/a ~/.agents/skills/a. ~/.agents/skills/alexandria

# Add-on jobs — only present if you enabled the matching add-on
launchctl unload ~/Library/LaunchAgents/io.alexandria.publish.plist 2>/dev/null
launchctl unload ~/Library/LaunchAgents/io.alexandria.icloud-backup.plist 2>/dev/null
launchctl bootout gui/$(id -u)/com.alexandria.imsg-daemon 2>/dev/null
launchctl unload ~/Library/LaunchAgents/com.alexandria.capture-digest.plist 2>/dev/null
rm -f  ~/Library/LaunchAgents/io.alexandria.publish.plist \
       ~/Library/LaunchAgents/io.alexandria.icloud-backup.plist \
       ~/Library/LaunchAgents/com.alexandria.capture-digest.plist
# Linux publish add-on: `crontab -e` and remove the publish-fork.sh line
# Texting add-on: remove the imsg_run.sh block from ~/.zshrc (added only at enable)

# Revoke server-side (removes account record, events, feedback, published files,
# and any Stripe subscription)
curl -X DELETE -H "Authorization: Bearer $YOUR_KEY" https://api.alexandria-library.com/account
```

## How to think about this

The trust here is legible, not zero. It is bounded-trust:

- The repo is public; every payload change is in git history.
- The signing key is non-exportable Apple hardware. Anyone with the public repo or GitHub account cannot ship factory code; a release also needs a fresh Touch ID approval. That is a real concentration of trust; we are not pretending otherwise. Rotation procedure is in `TRUST.md`.
- You can freeze forever on your verified local copy. A modified fork must establish and publish its own signing root rather than inheriting ours.
- You can re-audit at any time. `diff` your cached payload against the GitHub raw URL, and verify the manifest signature with `ssh-keygen -Y verify` — both shown above.

What we are claiming is *not* "no trust required." We are claiming you can read every line of the trust you are extending, change the relationship anytime, and walk away cleanly with all your files intact.
