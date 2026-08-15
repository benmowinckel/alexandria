# Mechanics

You are about to give a non-executable request to your existing coding agent. The request tells the agent to treat everything from Alexandria as untrusted, inspect the public code using its own security process, explain what it found, and change nothing until you say `start`. Read this once. If anything here doesn't match the scripts, don't run it. (Using Claude Desktop? Its **code tab** is Claude Code running on your machine — the same setup, run once via a coding agent, wires it up automatically. Everything on this page still applies.)

## TL;DR for the auditor

- **The structural claim** — none of this page asks you to trust the maintainer: we **can't receive** your private data (no protocol endpoint takes your private files, and the hook has no code path that reads them into any request — the session sync reads only your explicit publish outbox), **can't change** your machine after install (code pinned + hardware-signed; anything new applies only by your explicit action), and **can't hide** (public repo, small surface, and the adversarial audit prompt is ours to hand you: [`factory/redteam.md`](https://github.com/benmowinckel/alexandria/blob/main/factory/redteam.md)). Every leg is verifiable below.
- **What runs:** plain bash, Python, and markdown. Your editable files live at `~/alexandria/`; automatic hook programs and their verification markers live separately at `~/.local/share/alexandria/`, outside the writable root granted to the AI. The core is one local loop: ordinary sessions use your approved mirror and save transcripts when the host exposes them; persistent native terminal chrome, or one medium-native cue on the first reply in a new chat, links into an active session; `/a` develops what accumulated and `a.` preserves what changed. Text uses a quiet footer. Voice casually offers to spin up the Alexandria chat on the side and opens it only after you agree. Later replies mention Alexandria only when it helps that exchange. One local file turns the route off immediately. No new app, daemon, launchd/cron job, shell-rc edit, or root process.
- **What the install does NOT do:** no cloud connection, push to any remote, repo creation, key upload, or scheduled job. Capture shortcuts and other local additions wait until you ask for them. iCloud capture, Google Drive, backups (to your **own** GitHub/iCloud), Library publication, marketplace signal, network reading, scheduled outbound messages, and twin services are connections — each needs its own explicit yes after install (`~/alexandria/system/.optional` documents what each touches, what leaves the machine, and its off switch).
- **Source of truth:** `github.com/benmowinckel/alexandria` (public). Auditable line by line.
- **Trust model:** consent-symmetric. Your agent may pin setup to one verified Git commit. After that, the shim only runs the payload pinned on your disk, and every factory file is covered by a manifest signed with the maintainer's Touch ID-bound Secure Enclave key. Nothing self-updates or checks for updates by default. Signed update notices are a separate opt-in; your installed verifier authenticates any update before it runs. Existing installs resist later GitHub-account compromise; a fresh install that needs protection from compromise of the whole canonical account must confirm the release fingerprint through another trusted channel. Full mechanism in [`TRUST.md`](https://github.com/benmowinckel/alexandria/blob/main/TRUST.md).
- **What our server holds:** if you give an email during setup, we keep the address, the route you chose, and an unsubscribe token so we can send that setup and occasional useful notes until you unsubscribe. That does not create an account or install record. If you later create an account, we also hold your GitHub user ID, hashed API key, a 60-day event log of which endpoints you hit, and any files you explicitly publish to the Library.
- **What our server does not hold:** your constitution, vault, marginalia, transcripts, or AI-vendor API keys. There is no endpoint that accepts them.
- **Account boundary:** connecting an account stores and validates its key; it enables no Library, marketplace, network, telemetry, feedback, or referral activity. Each optional connection has its own consent record tied to the exact outbound file or list. Changed bytes stop until approved again. The private ai never drafts or proposes Alexandria requests, contributions, referrals, invitations, pricing, or feedback.
- **Uninstall:** the commands at the bottom of this page. Reversible.

## Threat model

We claim:
1. The install does what this page says, and only that. Auditable line by line.
2. Your private cognition (constitution, vault, marginalia, transcripts) never leaves your machine via Alexandria. There is no endpoint that accepts it.
3. A complete breach of our server yields the data listed above and nothing more — because nothing more is stored.

We do not claim:
- Zero metadata. The server logs which endpoints your account hits and when (60-day TTL in KV), and Cloudflare logs IPs at the edge.
- Immunity to the maintainer's Mac being compromised. The signing key cannot be exported from Apple hardware, but malicious local code could try to misuse it when the maintainer approves a Touch ID prompt. Compromise of the public repo or GitHub account alone is not sufficient. Rotation procedure is in `TRUST.md`.
- Protection from an AI tool you deliberately run without a filesystem sandbox. The protected runtime is outside the writable roots Alexandria grants to supported agents, but every file is still owned by your OS account; a truly unsandboxed process running as you can alter any user-owned file.
- Zero risk. AI tools execute hooks with your shell privileges. That is true of every editor extension, every dev-server, and every shell hook on your machine — but it is true here too.

## Inspect before running

Start at [`/start`](https://alexandria-library.com/start). Choose agent or chat. If you choose agent, say whether your computer is nearby. Email is optional. At the computer, the copied request names `github.com/benmowinckel/alexandria`, tells your AI to trust none of our files or setup instructions, and leaves the security process to that AI; nothing changes until it explains its findings and you say `start`. On a phone, the agent path asks which AI you use, gives its exact instructions path, and separates the current-phone setup from the later-computer reminder.

The chat path asks which ai you use, gives its exact additive account-instructions path, then copies one separate prompt into the normal chat bar. Your ai explains how its behavior changes, guides you through its own native Drive connection when available, builds and reads back the fullest accurate first record supported by what it already knows, and runs a miniature personal loop. Only after that works does it explain the optional computer-agent version. A fresh chat containing only `a` is the final proof: it must read the record and begin from one specific live thread rather than generic onboarding.

Before `start`, a robust agent stays read-only: it uses GitHub's account and commit APIs plus source views at one immutable `main` hash to authenticate the owner, key, signature, and code without cloning, downloading project files, running code, or creating local state. It explains the result and waits. After `start`, it clones or fetches only the canonical repo, locally verifies that same commit, and runs `factory/setup.sh` with every fetch pinned to it. The current release-key fingerprint is `SHA256:9DVo6uNuieqKMdNtT0QIi/WoQAAbWl5i/t0Z5MdQ/Jg`. Because this page and the repo come from the same publisher, that fingerprint is continuity evidence, not an independent trust root. If your threat model includes compromise of the maintainer's whole GitHub account, confirm it through a channel you already trust or do not proceed.

The setup is one bash script. The hooks payload is one bash script. The shim is one bash script. The matching private key cannot leave the maintainer's Mac hardware, and every release signature requires Touch ID. Everything below describes what they do, in order.

## What gets installed on your machine

**`~/alexandria/`** — the Author-writable folder, initialised as a local Git repository (`~/alexandria/.git/`). Plain markdown and small JSON state files. All readable. The Git repo IS the substrate format — your worldline is a sequence of commits, your own to push to any Git remote (GitHub is the default if you `gh auth login`; any host works).

**`~/.local/share/alexandria/`** — the small automatic runtime. Supported harnesses do not add this folder to the AI's writable roots. It contains only signed hook programs, their verification state, and the scoped uninstaller; no cognition or transcripts.

| Path | Purpose |
|---|---|
| `.git/` | Local Git repository. Your cognitive worldline as a commit history. |
| `files/constitution/` | Your beliefs, personality, working style. You write these. |
| `files/vault/` | Raw input — transcripts, notes, voice memos. You drop things in. `vault/input/` stays local unless you separately enable the iCloud-capture add-on. |
| `files/marginalia/` | Shared working layer between raw and settled — your developing thoughts + Engine candidates, drains over time. |
| `files/library/{public,authors,paid,invite}/` | Optional publication outbox. Your source file may stay anywhere in your own structure; the default adapter is a file symlink under the exact permission folder. Add exact cohort folders when needed (`invite/friends`, `paid/course`); parent and sibling scopes never inherit. A file leaves only when Library sync is separately enabled and its adjacent `.approved` file matches both the SHA-256 of its current target bytes and that exact scope. |
| `files/library/filter.md` | Your publishing policy — the canon-driven rule the Engine consults before promoting drafts to final. |
| `files/core/` | Engine working memory: `agent.md`, `machine.md`, `notepad.md`, `feedback.md`, `shelf.md`. |
| `files/works/` | Long-form pieces in progress. |
| `files/network.md` | Opt-in. URLs of other Authors whose shadows you want pulled into context. The hook fetches each to `files/network/<slug>/shadow.md`, once per day. |
| `~/.local/share/alexandria/hooks/shim.sh` | Bash wrapper outside the AI-writable root. Runs the pinned verified payload; checks upstream for signed updates only if you separately enable that option. |
| `~/.local/share/alexandria/.hooks_payload` | The pinned engine payload. Runs only after passing hardware-signature verification. |
| `~/.local/share/alexandria/.payload_verified_sha` | The recorded hash of the verified payload — the pin. If the payload file changes without re-verification, the shim refuses to run it. |
| `~/.local/share/alexandria/.canon_manifest` | The signed manifest that backed this cached payload — every canon module is hash-checked against it before being written, so a compromised GitHub repo cannot push poisoned canon either. |
| `~/.local/share/alexandria/.factory_version` | Highest signed factory release this machine has accepted. Older valid manifests are rejected instead of being replayed as a downgrade. |
| `~/.local/share/alexandria/.owned_integrations` | Exact path-and-hash receipts for skills, rules, droids, and Cursor hook files setup created. Re-runs and uninstallers require this receipt instead of trusting a filename or copied product sentence. |
| `~/.local/share/alexandria/allowed_signers` | The maintainer's P-256 public key. Trust root for payload + manifest signature verification. |
| `~/.local/share/alexandria/scripts/verify-fetch.sh` | The only later update door. It verifies the signed manifest, rejects rollback, verifies the requested file hash, then emits or runs those exact bytes. |
| `~/.local/share/alexandria/scripts/{capture_resolver,statusline,uninstall}.py/sh` | Signed automatic helpers and the scoped remover, kept outside the Author-writable folder. |
| `system/canon/` | Signed local references, cached once and never auto-written afterwards. **The loop:** `foundation.md`, the complete passive → cue → active local core. **Methods:** `axioms.md`, `methodology.md`, `editor.md`, `mercury.md`, `publisher.md`; moving one into `system/canon/disabled/` turns it off, and setup and update notices leave it off. **Additions:** local capabilities used only when chosen for a concrete job. **Connections:** Library/filter, marketplace, network, cloud, outbound messages, and PLM/twin stay dormant until exact approval. `MODULES.md` is the product map. A file being available here does not activate its feature. Signed updates are notices only; you pull one or ignore it. |
| `system/.api_key` | Your API key, mode 0600. |
| `system/.block` | One-time onboarding instructions cached locally. |
| `system/.optional` | The add-ons menu — what each opt-in add-on does, touches, and how to turn it off. |
| `system/.*` (other) | Ephemeral state — session ID markers, sync logs, the error log, autoloop dedup, account-status cache, last-maintenance timestamps. All readable. None leave the machine. |

**`~/.claude/skills/{a,alexandria}/SKILL.md`** — the `/a` skill (and its `/alexandria` alias). **`~/.claude/skills/a./SKILL.md`** — the `/a.` close skill: ends an /a session by capturing everything to your files, then asking what shifted — you say it, in your words; it files them. Plain markdown, all of them. `cat` them. (Cursor gets the same three under `~/.cursor/skills/`.) If `a` or `a.` already belongs to another tool, setup leaves it untouched. It may install a namespaced fallback, but it reports the loop incomplete and keeps every hook inactive because the visible `/a` → `/a.` route would otherwise point at the wrong skill.

### The Git substrate and commit signing

`~/alexandria/` is initialised as a local Git repository. Your worldline IS a commit history — every Constitution edit, marginalia drain, and vault drop you preserve becomes a commit. The repo is yours; you can push to any Git remote (GitHub is the default if you have `gh` authenticated; any host works).

Git preserves the history; it does not certify the mind behind it. A valid commit signature proves that a particular key committed particular bytes. It does not prove that a human originated, understood, or freely chose the position. Alexandria uses Git as a flight recorder beneath its before→after review, not as an authorship oracle.

**Root stewardship.** `root` is a mark inside the living Constitution, not a second identity file or a claim that an untouched self exists. The Author does not maintain a root list. At session start, before Constitution writes, at close, and during maintenance, the Engine compares the Constitution, recent material, deltas and Git history. It watches for unprotected positions that repeatedly govern other choices and for several small movements that together form one material drift. When something plausibly deserves exceptional protection, it creates or refreshes one plain-text `root candidate — pending` or `root drift — pending` packet in marginalia. The Engine nominates; only the Author confirms what becomes root.

The packet contains the evidence, cumulative before→after, strongest case for and against, and the proposing model's identity and self-reported influence. It stays local. Alexandria never calls another model or sends the packet merely because that provider was authorised before. Independent review happens when the Author opens a qualifying model themselves, or after the Engine shows the exact packet and destination and the Author gives a fresh yes for that one call. The first qualifying model to encounter the local packet reviews it before discretionary work. Another session, alias, version or reasoning mode of the proposer does not count.

Only after the proposing AI marks the case ready and the independent reviewer marks the contest complete does the Engine ask the Author once for the substantive decision and reason in their own words. Adding a root mark, changing or deleting a root position, and removing the mark all run that same gate. An accepted decision lands in the Constitution, `works/deltas.md` and Git. A rejected designation is recorded and not reproposed without new evidence. An unfinished case waits without nagging. Until all gates close, the old state remains current.

At session start, close and before a Constitution commit, a conforming Engine also compares the root set and passages against Git. An unauthorised addition, rewrite, deletion or unmarking is restored from the last commit and left pending. This is model-enforced semantic review over a file-and-Git substrate, not a cryptographic write lock: an Engine that ignores the instructions can bypass it, but the committed history makes the bypass visible and recoverable to the next conforming Engine. A hard-coded text matcher would be stricter about syntax but blind to the same position being smuggled through different words.

**The provenance stack.** The transcript or vault preserves what was actually said; the delta packet preserves the cumulative before→after, arguments, influences, model identities and human correction; Git preserves byte history and key continuity. None proves inner authorship or freedom from persuasion. The nominating AI can steer salience and framing; different providers can share blind spots; human signoff can rationalise prior influence. Together the stack makes the causal record inspectable and partly reversible. It offers resistance, not immunity.

**How signing works.** `setup.sh` detects an existing SSH public key under `~/.ssh/*.pub` (first one found, any type — Ed25519, RSA, ECDSA). If found, it (a) configures git inside `~/alexandria/` to sign with that key, repo-local — your global git config and other repos are untouched, (b) writes the key + your email to `~/.config/git/allowed_signers` so `git verify-commit` and `git log --show-signature` work locally, and (c) signs the genesis commit. Every subsequent commit is signed automatically. **All of this is local and offline — nothing is uploaded at install.** Registering the key with GitHub (for the "Verified" badge) happens only when you enable the `backup` add-on, which is also the only step that creates the private `alexandria-private` repo on your own account and pushes to it.

The `~/.config/git/allowed_signers` file (used by `git verify-commit` for your own commits) is **not** the same file as `~/.local/share/alexandria/allowed_signers` (used by the shim to verify the maintainer's payload signature). Same file format, different purposes.

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
| `~/.agents/skills/a/` + `a./` | Only if Codex detected. Installs one start skill and the separate close skill. A foreign name is preserved; because the product's visible route is `/a` → `/a.`, either collision leaves setup visibly incomplete rather than pointing at the foreign skill. | `find ~/.agents/skills -maxdepth 2 -name SKILL.md` |
| `~/.factory/droids/a.md` | Only if Factory droid CLI detected. Plain markdown skill. | `cat ~/.factory/droids/a.md` |

**Not modified:** shell rc files (`.zshrc`, `.bashrc`, `.profile`), system `PATH`, sudoers, system services, launchd, cron, or cloud storage. The install does modify the detected harness folders (`~/.claude/`, `~/.cursor/`, `~/.codex/`, `~/.factory/`, `~/.agents/skills/`) exactly as listed above, may append the Author's existing public signing key to `~/.config/git/allowed_signers`, and uses the Cursor sidecar `~/.alexandria/` for transcript staging and hook logs. The repo-local git config inside `~/alexandria/` is set; your global git config is not. The install schedules nothing and creates no background processes — scheduled jobs exist only inside opt-in add-ons, each installed only on its own explicit yes and each with a one-line off switch listed in `~/alexandria/system/.optional`.

The hooks activate only after setup proves the assembled local loop: passive hooks are present, the exact `/a` and `/a.` skills are safe, the cue renders both its start state and its per-session close state, and Codex is either trusted or visibly waiting for its required trust step. Skill and rule filenames are shared user space, so setup replaces one only when an exact content marker proves Alexandria owns it. A foreign collision is preserved and the host is reported incomplete; another healthy host cannot hide that failure. The uninstaller applies the same content test. If setup or an update stops halfway, the partial files remain available to inspect and repair, but every Alexandria hook stays off until a verified rerun succeeds.

### How each surface is wired

One verified setup wires every surface — nothing to install per-agent, no plugin, no marketplace:

- **Claude Code:** the 3 hook entries in `~/.claude/settings.json` fire the shim at session start/end.
- **Claude Desktop's code tab:** that tab **is** Claude Code running on your machine — it reads the same `~/.claude/settings.json`, so the same entries cover it automatically. The normal chat tab cannot run these local hooks; the [chat onboarding page](/chat) adds the account instruction, then has that chat guide and prove the strongest durable personal record it can actually use.
- **Cursor:** 5 hook entries in `~/.cursor/hooks.json` call small Python wrappers — session start/end/stop plus per-prompt and per-response transcript capture — that shell out to the same shim (or write the local staging transcript Cursor never provides natively).
- **Codex:** native `hooks.json`, current `AGENTS.md`, and one start + one close skill. SessionEnd saves the transcript and a receipt inside Codex's three-second cap; the next SessionStart drains the ordinary feedback/git work. Setup stays visibly pending until trusted hooks have actually run at start and end.
- **Factory:** a plain active-session droid in `~/.factory/droids/a.md`. Factory has no passive lifecycle path here, so Factory alone is reported as an incomplete loop rather than a successful install.

Result: Claude Code, Cursor, and Codex can close the full passive → cue → active loop over one signed payload and one sovereign folder. Factory can run the active part beside one of those hosts, but does not pretend to supply the passive part.

### Cowork and the Claude app (a file surface, not an install path)

Cowork runs your agent in a sealed environment and can only see a local folder when you attach it. Alexandria installs no Cowork plugin: a plugin duplicated the skill, could not provide a trustworthy hook path, and created a misleading extra install surface. Cowork works through the files themselves:

1. **Capture (automatic).** An optional launchd agent (`com.alexandria.session-capture`, enabled separately) reads the transcripts Cowork writes to your disk and mirrors the dialogue into `~/alexandria/files/vault/sessions/` — no attach needed, riding the one direction the VM shares out.
2. **Awareness (one-time, additive).** Working Alexandria hooks are primary. Setup writes compact Alexandria instructions to `~/alexandria/system/.account-instructions.md`; after the local loop works and the first personalized result has landed, the agent helps paste them below the current instructions in each other AI app, one at a time. For Cowork and similar folder-only tools, the Alexandria instructions open `_start` at each task because no Alexandria hooks run there.
3. **Full read/write (prompted).** Attach `~/alexandria` in Cowork and type bare `a`. The agent reads `system/canon/methodology.md` and the constitution directly. If local is unavailable, use the Drive pocket copy; never load both homes in one task.

Nothing here routes your files through a server; it's the same sovereign folder, reached the only way a sealed VM allows.

## The pinned-payload update model

This is the most important property to understand.

The shim at `~/.local/share/alexandria/hooks/shim.sh` is installed by `setup.sh` outside the AI-writable Author folder and refreshed only by a verified, explicit update. Sessions never refetch the shim. On every session start — Claude Code and Claude Desktop's code tab reach it via the settings-hook entries; Cursor via its Python wrappers — the shim does this:

1. **Runs only the payload pinned on your disk** (`~/.local/share/alexandria/.hooks_payload`) — and only if that exact file has passed verification. The payload, accepted manifest, version floor, activation marker, and verification hash all remain outside `~/alexandria`, the only Alexandria root granted writable to the AI. When the payload is new or changed (fresh install, an update you applied), the shim fetches `factory/manifest.txt` + `.sig` over HTTPS, verifies the signature with `ssh-keygen -Y verify` against `~/.local/share/alexandria/allowed_signers` (the public key installed once at setup), and compares the payload's SHA-256 to the manifest entry. Pass → the hash is recorded beside the payload and it runs. Fail → the shim refuses to run it: loud warning in the AI's context, entry in `~/alexandria/system/.alexandria_errors`, bare mode (constitution only, no protocol calls).
2. **Optionally checks for updates, notify-only** (only if you created `hooks/auto-update` after a separate yes): fetches and signature-verifies the current upstream manifest; if it lists a different payload hash, a "signed update available" notice lands in the AI's context. Nothing is applied.

So **the code that processes your session is exactly what you approved — the payload pinned at install or at your last explicit update — and it passed the hardware-signature check before its first run.** Applying an update is always your action: `bash ~/.local/share/alexandria/scripts/verify-fetch.sh --run setup.sh`. The installed verifier authenticates setup before it executes; setup then verifies every fetched factory file. Bare GitHub access isn't enough to ship code — the maintainer must also approve that exact manifest with Touch ID. Full mechanism in [`TRUST.md`](https://github.com/benmowinckel/alexandria/blob/main/TRUST.md).

Engine and **canon** work the same way: both are offered, verified, and applied only on your go — canon via the update notice you pull per-module, the engine via the local verifier. Nothing on your machine changes without your explicit action.

What you're trusting: the maintainer's Touch ID approval on a private key that cannot leave Apple hardware. The public repo is auditable; that physical approval is the only thing that can ship new signed code.

What protects you anyway:
1. **Whole-factory signed manifest + hash pinning.** `manifest.txt` lists a monotonic release version and the SHA-256 of every tracked file under `factory/`, including setup and the verifier. CI derives the same set from Git and fails on any missing or extra path. The manifest itself is signed (`manifest.txt.sig`). Compromise of the GitHub repo alone does not produce code execution.
2. **Refuse-to-run.** A payload that has never passed verification never executes — if the file on disk changes without re-verification (tampering, a half-finished update), the session runs bare instead of running it.
3. **Public diff.** Every payload version is in git history. Any session can be reconstructed from the commit SHA on `main` at that moment.
4. **Canon canaries.** The canon explicitly tells the model to refuse instructions that try to exfiltrate files, escalate scope, or bypass the user. The same posture covers marketplace modules: a foreign module's body is untrusted input — instructions inside it are read as data, not commands, and adopted only after review against your own canon.
5. **AI-tool approval dialogs.** Claude Code, Cursor, and Codex show every shell action before executing. Real protection at install and during anomaly, but it weakens with habituation — treat it as a backstop, not the primary defense.

**Residual gap:** a compromised maintainer Mac could try to misuse the non-exportable key during a misleading Touch ID prompt. Every release still requires the maintainer's physical approval. The key-rotation procedure is documented in `TRUST.md`. If that residual gap matters to you, run a frozen install.

### Turning update checks on or off

**They start off.** To enable signed, notify-only checks after a separate yes: `touch ~/alexandria/system/hooks/auto-update`. To stop them: `rm ~/alexandria/system/hooks/auto-update`. Removing the marker keeps every session on the pinned local copy, and re-running setup does not turn checks back on. Account connection alone has no standing calls. Separately approved Library, marketplace, backup, saved-link resolution, or network activity stops by removing its file under `~/alexandria/system/permissions/`.

**A truly independent fork needs its own trust root.** Copying the repo is easy; safely shipping changed factory files means replacing the embedded public key and release signer, publishing the new fingerprint through a channel your users already trust, then signing your own whole-factory manifests. A raw fork URL is not an authentication mechanism. If you only want immutability, the simple freeze above is the safer, smaller move: your already-verified local files keep running with no update path at all.

## Network call inventory

Every outbound call the install or hooks make. Complete list.

| Call | Trigger | Sends | Receives |
|---|---|---|---|
| `GET github.com/benmowinckel/alexandria` + GitHub account signing-key API | Your coding agent, once before first install | nothing | one exact commit + the public keys needed to authenticate it |
| `GET raw.githubusercontent.com/.../<verified-commit>/factory/...` | Setup, pinned to the exact verified commit | nothing | signed manifest + factory files |
| `GET raw.githubusercontent.com/.../factory/{setup.sh,hooks/...}` | Only when you explicitly apply an update through the installed verifier | nothing | files accepted only if the whole-factory manifest signature, version, and file hash pass |
| `GET raw.githubusercontent.com/.../factory/manifest.txt(.sig)` | Verifying a newly pinned payload, or session start after optional update checks are enabled | nothing | signed manifest + signature |
| `GET raw.githubusercontent.com/.../factory/canon/*.md` | Install, an explicit pull, or session start after optional update checks are enabled | nothing | signed local references |
| `GET raw.githubusercontent.com/.../factory/{skills,hooks/cursor,templates,scripts}/...` | Install, or session-start drift comparison after optional update checks are enabled | nothing | factory files for install or comparison |
| `GET api.alexandria-library.com/alexandria` | Once when you separately say `connect`; later only inside separately approved Library sync | API key (Bearer) | account + membership status |
| `POST api.alexandria-library.com/call` | Only when `permissions/marketplace` contains the SHA-256 of the current `.call_manifest` | API key + the exact approved JSON | 200/4xx |
| `GET api.alexandria-library.com/library/<your-login>` | Only with Library permission, during reconciliation | nothing | your current server-side file list |
| `PUT api.alexandria-library.com/file/<name>` | Only with Library permission and a matching `<filename>.approved` content hash | API key, that exact approved file + visibility tier; no adjacent metadata or other private path. The shared Library caps an account at 250 files, 25MB per file, and 250MB total; large media stays elsewhere and enters as a link. | 200/4xx |
| `DELETE api.alexandria-library.com/file/<name>` | Only after you directly ask to unpublish that exact remote artifact and separately approve the deletion; never from standing sync | API key | 200/4xx |
| `GET api.alexandria-library.com/library/<slug>/shadow/{authors,free}` | At most daily, only when `permissions/network` matches the SHA-256 of the current user-written `network.md` | API key on authors-tier reads, plus the approved slug | published shadow content |
| `git push` / `git pull --rebase` against your own `alexandria-private` GitHub repo | Session start (commit + push, then pull/rebase) + session end (push) — **only if the `backup` permission file contains the exact current `origin` URL**. A pre-existing or changed remote does nothing. | the tracked contents of `~/alexandria/` — gitignored paths excluded: `system/canon/`, `system/hooks/`, `system/permissions/`, `system/.*`, `files/library/`, `node_modules/` | git ref data |
| `gh` CLI: `gh ssh-key add`, `gh repo create` | **Never at install.** Only when you enable the `backup` or `publish` add-on, on your explicit yes | your separate `gh` OAuth token (not your Alexandria API key) | success/failure |
| `GET api.fxtwitter.com/status/<id>` (+ the tweet's media hosts) | Session start, only when `permissions/capture-network` exists **and** you dropped an X/Twitter link into `files/vault/input/` | the tweet ID you chose to save (+ your IP, as with any fetch) | tweet text/media, written locally into `files/vault/_input/` |
| `GET www.youtube.com/oembed?...` | Same separate permission plus a saved YouTube link | the video URL you saved | title/author metadata, local |
| `GET <a URL you saved>` | Same separate permission plus a saved link/`.url` drop | the exact URL you saved (+ IP) | page title/content, written locally for your review |

Every authenticated call also carries an `X-Alexandria-Client` header — a client version hash, so a broken client build can be spotted server-side; it identifies the software version, not you (your account is already on the request).

That is all. No telemetry pings, install reports, automatic feedback, error reporters, analytics SDKs, or account-key-triggered feature calls. The last three rows require both a separate permission file and a link you deliberately dropped into your own capture inbox; everything they fetch lands on your disk, not ours. You can confirm the full surface by `grep -E 'curl|wget|http' ~/.local/share/alexandria/.hooks_payload` and the same grep on `~/.local/share/alexandria/scripts/capture_resolver.py`.

## What our server holds (specifics)

Cloudflare Worker, stateless re: your private content. KV + D1 + R2.

| Stored | Where | Why |
|---|---|---|
| Email + GitHub login + Stripe customer ID, in one encrypted account blob | KV (AES-256-GCM at rest) | Account, OAuth, billing |
| API key — SHA-256 hash only | KV | Auth check |
| Event log: endpoints you deliberately use, with timestamps and lightweight request context | KV (60-day TTL) | Debugging, abuse signal |
| Library files you explicitly publish | R2 | Published Library content |
| Library file metadata (name, exact scope, visibility, content hash, updated_at) | D1 | Permissioned discovery and listing |
| Marketplace calls you separately approve: module ID, account ID, timestamp, and exact optional notes/requests in the approved manifest | D1 (`protocol_calls`) | Marketplace listing and request board |

**Not stored anywhere we control:** your constitution, vault, marginalia, transcripts, machine.md, notepad, raw API key, AI-vendor (Anthropic/OpenAI/etc) API keys, or any file outside your approved `files/library/` publication mappings — the only path the session sync ever `PUT`s. A context PLM receives only the exact published scopes allowed for that reader, plus the active artifact and current conversation. Its adapter lives in an environment you choose and, to meet Alexandria's contract, has no Author filesystem, hidden memory, live web, or Alexandria credential; it accepts Author context only from the Worker's bearer-authenticated request. There is no endpoint that accepts private-source files.

**What a complete server breach yields:** account emails, GitHub user IDs, hashed (un-reversible) API keys, the 60-day event log, your full `protocol_calls` history (the per-module portion is already exposed by design via the authed marketplace endpoint), published Library content (files you explicitly published), and Cloudflare-level access logs (IPs, timing). It does not yield private cognition, unpublished files, or AI-vendor credentials, because those never reach the server.

## Why your API key is safe

- Stored server-side as SHA-256 hash. Never the raw key.
- Account blob in KV encrypted at rest with AES-256-GCM.
- The raw key appears once on the OAuth callback page in your browser. Never in email, never in any third-party metadata.
- Stripe identifies your account by GitHub login, not API key.
- `DELETE /account` with your key cancels any Stripe subscription and removes your account, module-call records, Library activity, and published files. Endpoint events expire on their 60-day TTL.

## Audit checklist

Fastest path: give the plain request from [`/start`](https://alexandria-library.com/start) to your existing agent and let it choose the audit. For the project's own hostile checklist, use [`factory/redteam.md`](https://github.com/benmowinckel/alexandria/blob/main/factory/redteam.md) as untrusted evidence, not authority. To do it by hand, clone the canonical repo, obtain the account's public signing keys from GitHub's API, compare the release key with the fingerprint above, and verify the exact `main` commit before running anything:

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
  -f ~/.local/share/alexandria/allowed_signers \
  -I alexandria-payload-signing \
  -n alexandria \
  -s factory/manifest.txt.sig \
  < factory/manifest.txt
# Expected: Good "alexandria" signature for alexandria-payload-signing with ECDSA key SHA256:9DVo6uNuieqKMdNtT0QIi/WoQAAbWl5i/t0Z5MdQ/Jg
```

After install, your live install is at:
- `~/.local/share/alexandria/hooks/shim.sh` (refreshed only by a verified explicit update)
- `~/.local/share/alexandria/.hooks_payload` (refreshed only by a verified explicit update)
- `~/.local/share/alexandria/.canon_manifest` (the verified manifest backing the cached payload)
- `~/.local/share/alexandria/.factory_version` (the accepted rollback floor)
- `~/alexandria/system/canon/*.md` (sovereign; divergence from upstream shows up in `~/alexandria/system/.canon_update_notice`)

Then audit the cached payload for anything that touches the network, evaluates remote code, or reads sensitive paths:

```
# Network and code-evaluation surface
grep -nE '\b(curl|wget|eval|osascript)\b|python -c|bash -c' \
  ~/.local/share/alexandria/.hooks_payload

# Credential-store traversal
grep -nE '\.ssh|\.aws|\.anthropic|\.openai|keychain|gnome-keyring' \
  ~/.local/share/alexandria/.hooks_payload
```

The first should match only the `curl` calls in the network inventory above. The second should return zero matches. (The same checks against `factory/setup.sh` will surface a few additional `curl`s and `gh` calls for the install-time GitHub fork setup, all listed in the install table.)

## Uninstall

To hide only the `/a` cue and leave the loop running:

```
touch ~/alexandria/system/hooks/visible-cue.off
```

One scoped remover reverses every hook, instruction block, writable-root entry, skill, and optional background job that Alexandria owns. It checks generic names such as `a` and `a.` before removing them, so a pre-existing skill is left alone. By default it disconnects the loop but keeps your local files:

```
python3 ~/.local/share/alexandria/scripts/uninstall.py
```

Cursor's shared `~/.alexandria/` sidecar is also preserved. Alexandria uses
parts of it for local transcript staging, but the directory name alone cannot
prove every file inside belongs to Alexandria, so the uninstaller never removes
the whole directory.

To remove the local files too, use the explicit destructive form. It refuses if `~/alexandria` is a symlink and never deletes a remote backup:

```
python3 ~/.local/share/alexandria/scripts/uninstall.py --delete-files
```

Deleting an Alexandria account is separate because it changes server-side state:

```

# Revoke server-side (removes the account record, endpoint events, marketplace
# calls, published files, and any Stripe subscription; messages you separately
# chose to send Alexandria are correspondence and are not part of the local loop)
curl -X DELETE -H "Authorization: Bearer $YOUR_KEY" https://api.alexandria-library.com/account
```

## How to think about this

The trust here is legible, not zero. It is bounded-trust:

- The repo is public; every payload change is in git history.
- The signing key is non-exportable Apple hardware. Anyone with the public repo or GitHub account cannot ship factory code; a release also needs a fresh Touch ID approval. That is a real concentration of trust; we are not pretending otherwise. Rotation procedure is in `TRUST.md`.
- You can freeze forever on your verified local copy. A modified fork must establish and publish its own signing root rather than inheriting ours.
- You can re-audit at any time. `diff` your cached payload against the GitHub raw URL, and verify the manifest signature with `ssh-keygen -Y verify` — both shown above.

What we are claiming is *not* "no trust required." We are claiming you can read every line of the trust you are extending, change the relationship anytime, and walk away cleanly with all your files intact.
