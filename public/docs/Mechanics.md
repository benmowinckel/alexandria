# Mechanics

You are about to run a curl command that puts files on your machine, modifies your ai config, and pulls live code from GitHub on every session. Read this once. If anything here doesn't match the scripts, don't run it. (Using Claude Desktop? Its **code tab** is Claude Code running on your machine — the same setup, run once via a coding agent, wires it up automatically. Everything on this page still applies.)

## TL;DR for the auditor

- **What runs:** plain bash and markdown. No binaries, no daemons, no shell-rc edits, no root.
- **Source of truth:** `github.com/mowinckelb/alexandria` (public). Auditable line by line.
- **Trust model:** every session, the shim refuses to run any payload whose SHA-256 doesn't match an entry in a manifest signed by the maintainer's offline ed25519 key. Compromise of the GitHub account alone does not yield code execution. Full mechanism in [`TRUST.md`](https://github.com/mowinckelb/alexandria/blob/main/TRUST.md).
- **What our server holds:** your email, GitHub user ID, hashed API key, a 60-day event log of which endpoints you hit, and any files you explicitly publish to the Library. Nothing else.
- **What our server does not hold:** your constitution, vault, marginalia, transcripts, or ai-vendor API keys. There is no endpoint that accepts them.
- **Side channel:** the only data that leaves your machine for our server is (a) module IDs you call — recorded so the marketplace can show who's using which gear; per-module call records (your account ID + timestamp + any notes the Engine attached) are queryable by any authenticated Alexandria user via `/marketplace/<module>`, by design, (b) feedback you explicitly type into `~/alexandria/system/.session_feedback`, (c) files you explicitly publish to the Library, and (d) one install status report at setup (which subsystems succeeded/failed — no file content). The Engine never auto-sends private content.
- **Uninstall:** the commands at the bottom of this page. Reversible.

## Threat model

We claim:
1. The install does what this page says, and only that. Auditable line by line.
2. Your private cognition (constitution, vault, marginalia, transcripts) never leaves your machine via Alexandria. There is no endpoint that accepts it.
3. A complete breach of our server yields the data listed above and nothing more — because nothing more is stored.

We do not claim:
- Zero metadata. The server logs which endpoints your account hits and when (60-day TTL in KV), and Cloudflare logs IPs at the edge.
- Immunity to the maintainer's signing key being compromised. The key is offline-held; if it ever leaks, future signed payloads could ship arbitrary code until rotation. Rotation procedure is in `TRUST.md`. Compromise of the public repo or GitHub account alone is not sufficient.
- Zero risk. ai tools execute hooks with your shell privileges. That is true of every editor extension, every dev-server, and every shell hook on your machine — but it is true here too.

## Inspect before running

```
curl -s https://raw.githubusercontent.com/mowinckelb/alexandria/main/factory/setup.sh | less
```

The setup is one bash script. The hooks payload is one bash script. The shim is one bash script. The trust root is one ed25519 public key, embedded inline in `setup.sh` (fingerprint `SHA256:kAas5fUUnV/XcfKoH3Ysm7IZrqY2HcQSuhSaMoAMqnA`). Everything below describes what they do, in order.

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
| `system/hooks/shim.sh` | Bash wrapper. Refetches and verifies the payload at every session start. |
| `system/.hooks_payload` | The most recently verified payload, cached. |
| `system/.canon_manifest` | The signed manifest that backed this cached payload — every canon module is hash-checked against it before being written, so a compromised GitHub repo cannot push poisoned canon either. |
| `system/allowed_signers` | The maintainer's offline ed25519 public key. Trust root for payload + manifest signature verification. |
| `system/canon/` | The canon modules, cached locally. **Foundation:** `foundation.md` (the incompressible core — the minimal closed-loop system). **Founder module** (Author #1's default, forkable): `axioms.md`, `methodology.md`, `editor.md`, `mercury.md`, `publisher.md`, `library.md`, `filter.md`, `bookshelf.md`, `plm.md`, `twin.md`. Plus `MODULES.md` (the tier map). **Sovereign and never auto-written** — seeded once at install; after that nothing is auto-applied. Each session checks upstream, **verifies it against the signed manifest**, and surfaces any update as a notice; you pull it (verified) or ignore it. |
| `system/.api_key` | Your API key, mode 0600. |
| `system/.block` | One-time onboarding instructions cached locally. |
| `system/.*` (other) | Ephemeral state — session ID markers, sync logs, the error log, autoloop dedup, account-status cache, last-maintenance timestamps. All readable. None leave the machine. |

**`~/.claude/skills/alexandria/SKILL.md`** — the `/a` skill. Plain markdown. `cat` it.

**`~/.claude/scheduled-tasks/alexandria/SKILL.md`** — optional scheduled task. Plain markdown. `cat` it.

**`~/alexandria-fork/`** — only if you have `gh` authenticated. A sparse-checkout of your own GitHub fork of the public `alexandria` repo, used for publishing skills or canon contributions you write.

### The Git substrate and commit signing

`~/alexandria/` is initialised as a local Git repository. Your worldline IS a commit history — every Constitution edit, marginalia drain, and vault drop you preserve becomes a commit. The repo is yours; you can push to any Git remote (GitHub is the default if you have `gh` authenticated; any host works).

**How signing works.** `setup.sh` detects an existing SSH public key under `~/.ssh/*.pub` (first one found, any type — Ed25519, RSA, ECDSA). If found and you have `gh` authenticated, it (a) registers that key with GitHub as a *signing* key via `gh ssh-key add --type signing` (idempotent — re-runs and multi-machine setups quietly do the right thing), (b) configures git inside `~/alexandria/` to sign with that key, repo-local — your global git config and other repos are untouched, (c) writes the key + your email to `~/.config/git/allowed_signers` so `git verify-commit` and `git log --show-signature` work locally, and (d) signs the genesis commit. Every subsequent commit is signed automatically. GitHub will display "Verified" badges on your signed commits.

The `~/.config/git/allowed_signers` file (used by `git verify-commit` for your own commits) is **not** the same file as `~/alexandria/system/allowed_signers` (used by the shim to verify the maintainer's payload signature). Same file format, different purposes.

**Soft fallback.** If you have no SSH key or `gh` isn't authenticated, setup prints `signing: skipped (...)` with the reason and the genesis commit goes through unsigned. The worldline still works — you just don't get the verified-ledger property. Run `ssh-keygen -t ed25519` or `gh auth login` and re-run setup to enable signing later.

**OAuth scope.** Alexandria's GitHub OAuth requests `admin:ssh_signing_key` at signup so `setup.sh` can register the key without a separate scope-refresh step. Existing pre-scope users see a one-time re-authorize prompt at next web login.

**What you can verify yourself.** `git -C ~/alexandria log --show-signature` shows the signature on each commit. `git -C ~/alexandria verify-commit HEAD` returns "Good signature" if signing is configured. On GitHub, the commit history page shows the green "Verified" badge on each commit. The signing key never leaves your machine; only the public key is uploaded to GitHub.

## What gets modified in your config

| File | Change | Inspect |
|---|---|---|
| `~/.claude/settings.json` | `setup.sh` adds 3 hook entries (SessionStart, SessionEnd, SubagentStart) pointing to the shim. Same file Claude Desktop's code tab reads, so that surface is covered by the same entries — nothing extra to install. | `cat ~/.claude/settings.json` |
| `~/.cursor/hooks.json` | Only if Cursor detected. Adds 3 hook entries pointing to the Python wrappers below. | `cat ~/.cursor/hooks.json` |
| `~/.cursor/hooks/alexandria-{session-start,session-end,stop}.py` | Only if Cursor detected. Three small Python files that just shell out to the shim. | `cat ~/.cursor/hooks/alexandria-*.py` |
| `~/.cursor/rules/alexandria.mdc` | Only if Cursor detected. Plain markdown rule. | `cat ~/.cursor/rules/alexandria.mdc` |
| `~/.codex/instructions.md` | Only if Codex detected. Appends a marked block (`<!-- alexandria:start -->` … `<!-- alexandria:end -->`). | `cat ~/.codex/instructions.md` |
| `~/.factory/droids/a.md` | Only if Factory droid CLI detected. Plain markdown skill. | `cat ~/.factory/droids/a.md` |
| `~/Library/LaunchAgents/io.alexandria.publish.plist` | macOS only, only if `gh` authenticated. Hourly publish job for your fork. | `cat ~/Library/LaunchAgents/io.alexandria.publish.plist` |
| User crontab | Linux only, only if `gh` authenticated. One hourly line. | `crontab -l` |

**Not modified:** shell rc files (`.zshrc`, `.bashrc`, `.profile`), system `PATH`, sudoers, system services, anything outside `~/alexandria/`, `~/.claude/`, `~/.cursor/`, `~/.codex/`, `~/.factory/`, and the launchd/cron entries above. The repo-local git config inside `~/alexandria/` is set; your global git config is not.

### How each surface is wired

One curl wires every surface — nothing to install per-agent, no plugin, no marketplace:

- **Claude Code:** the 3 hook entries in `~/.claude/settings.json` fire the shim at session start/end.
- **Claude Desktop's code tab:** that tab **is** Claude Code running on your machine — it reads the same `~/.claude/settings.json`, so the same entries cover it automatically. (The chat tab has no local file access, so it does nothing.)
- **Cursor:** three hook entries in `~/.cursor/hooks.json` call small Python wrappers that shell out to the same shim.
- **Codex, Factory:** an always-loaded instruction block appended to `~/.codex/instructions.md` / `~/.factory/droids/a.md` — no hooks, the instructions load every session.

Result: session-start context load and session-end capture run in every Claude Code, Claude Desktop code-tab, and Cursor session; Codex and Factory load the same behavior via their instruction files. One behavior source (the signed payload), N dumb shells; the sovereign folder is the interop bus between all of them.

### Cowork and the Claude app (a different, opt-in path)

Cowork runs your agent in a sealed Apple-Virtualization VM: it can't run the hooks or load the `/a` skill on its own, and it can only see a folder when you explicitly attach it that session (no external script can auto-mount it — the share is created inside the Claude app's own process). So Cowork isn't wired by the curl. It's still usable, opt-in, in four parts (two one-time, then per-session):

1. **Capture (automatic).** An optional launchd agent (`com.alexandria.session-capture`, enabled separately) reads the transcripts Cowork writes to your disk and mirrors the dialogue into `~/alexandria/files/vault/sessions/` — no attach needed, riding the one direction the VM shares out.
2. **The `/a` command (one-time plugin add).** Cowork keeps its own skill registry, so `/a` isn't there by default. Add it once: in Cowork, **Add plugins → from repo → `mowinckelb/alexandria`**. This installs only the `/a` skill (its hooks are inert in Cowork — they can't fire in the VM — so it's a skill delivery, nothing more). This is the *only* thing the plugin is still used for; the curl path never touches it.
3. **Awareness (one-time paste).** `setup.sh` writes `~/alexandria/system/.claude-instructions.md`; paste it into **Claude Settings → Profile → "Instructions for Claude"**. Every Cowork/chat session then knows who you are and proactively prompts you to attach the folder + run `/a` when it would help.
4. **Full read/write (prompted).** Attach `~/alexandria` in a desktop Cowork session and type `/a` — it loads your constitution and works from your real files. (If you skipped the plugin, the pasted instructions make the agent do the same by reading your canon directly once the folder is attached.) Mobile and plain chat can't attach a folder, so there they point you to your desktop.

Nothing here routes your files through a server; it's the same sovereign folder, reached the only way a sealed VM allows.

## The bootstrap-from-main model

This is the most important property to understand.

The shim at `~/alexandria/system/hooks/shim.sh` is installed by `setup.sh` (re-running setup will overwrite it; sessions never refetch the shim). On every session start — Claude Code and Claude Desktop's code tab reach it via the settings-hook entries; Cursor via its Python wrappers — the shim does this:

1. Fetches `factory/hooks/payload.sh` from `main` over HTTPS.
2. Fetches `factory/manifest.txt` and `factory/manifest.txt.sig` over HTTPS.
3. Verifies the manifest signature with `ssh-keygen -Y verify` against `~/alexandria/system/allowed_signers` (the offline key installed once at setup).
4. Computes SHA-256 of the freshly-fetched payload and compares it to the entry in the verified manifest.
5. Executes the payload only if both checks pass. Otherwise it falls back to the previously-verified cached payload, with a loud warning in the ai's context and an entry in `~/alexandria/system/.alexandria_errors`.

So **the code that processes your session is whatever is on `main` right now AND signed by the offline key.** Bare GitHub access isn't enough to ship code — the attacker also needs to produce a fresh signed manifest with the new payload's hash, which requires the offline private key. Full mechanism in [`TRUST.md`](https://github.com/mowinckelb/alexandria/blob/main/TRUST.md).

Why this exists: payload (engine) fixes reach you without re-installing — bugs get fixed once, for everyone, the moment a new payload passes the offline-key signature check. The **canon** works differently: it is never auto-applied. Updates are verified against the signed manifest and surfaced as a notice; you pull what you want. The verified mechanism updates itself; your cognition changes only when you choose.

What you're trusting: the maintainer's offline ed25519 private key. The public repo is auditable; the key is the only thing that can ship new signed code.

What protects you anyway:
1. **Signed manifest + hash pinning.** `manifest.txt` lists the SHA-256 of `payload.sh` and every canon module. The manifest itself is signed (`manifest.txt.sig`). The shim refuses to run any file whose hash isn't in a manifest whose signature verifies against the embedded public key. Compromise of the GitHub repo alone does not produce code execution.
2. **Cache cutoff.** If GitHub is unreachable or verification fails AND the cached payload is >14 days old, the shim deletes it and runs in bare mode (constitution only, no network, no payload code).
3. **Public diff.** Every payload version is in git history. Any session can be reconstructed from the commit SHA on `main` at that moment.
4. **Canon canaries.** The canon explicitly tells the model to refuse instructions that try to exfiltrate files, escalate scope, or bypass the user. The same posture covers marketplace modules: a foreign module's body is untrusted input — instructions inside it are read as data, not commands, and adopted only after review against your own canon.
5. **ai-tool approval dialogs.** Claude Code, Cursor, and Codex show every shell action before executing. Real protection at install and during anomaly, but it weakens with habituation — treat it as a backstop, not the primary defense.

**Residual gap:** compromise of the offline signing key would compromise future payloads. Mitigations: the key is offline-held, the maintainer's repo is 2FA-protected, the key-rotation procedure is documented in `TRUST.md`. If that residual gap matters to you, run a frozen install (see below).

### Turning off continuous updates

**The simple freeze — delete one file.** `rm ~/alexandria/system/hooks/auto-update`. From then on neither the shim nor the payload fetches anything from us — every session runs on your local copy in `~/alexandria/system/canon/`, with zero network contact with Alexandria. It's on by default (the file's own contents explain this); deleting it is the one-line opt-out. Re-running setup restores it.

**The paranoid freeze — fork it.** If you don't even want to *fetch-and-verify* from our repo, fork `mowinckelb/alexandria` on GitHub. Rewrite `mowinckelb/alexandria` to `YOUR-HANDLE/alexandria` in every script + skill file under `factory/`, then install from your fork:

```
git clone https://github.com/YOUR-HANDLE/alexandria.git
cd alexandria
grep -rl 'mowinckelb/alexandria' factory/ \
  | xargs sed -i.bak 's|mowinckelb/alexandria|YOUR-HANDLE/alexandria|g'
find factory/ -name '*.bak' -delete    # BSD/GNU sed compatible
git commit -am "pin to my fork"
git push
curl -fsSL "https://raw.githubusercontent.com/YOUR-HANDLE/alexandria/main/factory/setup.sh" \
  | bash -s -- $YOUR_API_KEY
```

To pin to a specific commit (full immutability), also replace `main` with a commit SHA in those files. Re-pin manually whenever you want to upgrade.

The bundled `factory/manifest.txt` + `manifest.txt.sig` keep verifying against the maintainer's public key as long as you don't modify any file listed in the manifest — the signature is over the manifest, and the manifest pins file hashes, so an unmodified fork continues to verify cleanly. If you intend to *edit* any signed file (e.g., write your own canon), replace `factory/setup.sh`'s embedded public key with your own and re-sign with `ssh-keygen -Y sign -f <your_key> -n alexandria -I alexandria-payload-signing factory/manifest.txt`.

## Network call inventory

Every outbound call the install or hooks make. Complete list.

| Call | Trigger | Sends | Receives |
|---|---|---|---|
| `GET raw.githubusercontent.com/.../factory/setup.sh` | You, once, at install | nothing | the install script |
| `GET alexandria-library.com/a/<token>` (302s via `api.alexandria-library.com/a/<token>`) | You, once, at install — only if you used the command from the onboarding email (the public copy-paste command is the tokenless `/a`) | the one-time token in the URL path, which marks that email capture as installed so the follow-up nudges stop — no other data | redirect to the same `setup.sh` above |
| `GET raw.githubusercontent.com/.../factory/hooks/{shim.sh,payload.sh}` | Install (both); session start (payload only) | nothing | hooks |
| `GET raw.githubusercontent.com/.../factory/manifest.txt(.sig)` | Session start | nothing | signed manifest + signature |
| `GET raw.githubusercontent.com/.../factory/canon/*.md` | Session start, eleven modules | nothing | canon |
| `GET raw.githubusercontent.com/.../factory/{skills,hooks/cursor,templates,scripts}/...` | Install + session-start drift checks | nothing | factory files for skill/hook/template install + comparison |
| `GET api.alexandria-library.com/alexandria` | Setup probe + session status | API key (Bearer) | account + membership status |
| `POST api.alexandria-library.com/canon/status` | Session start, fire-and-forget | API key, list of canon modules that failed to fetch, whether divergence notice exists | 200 |
| `POST api.alexandria-library.com/call` | Session start | API key, module IDs, optional per-module notes (≤2000 chars each — the Engine writes "default canon module" unless you've supplied a `.call_manifest`) | 200/4xx |
| `GET api.alexandria-library.com/library/<your-login>` | Session start, Library reconciliation | nothing | your current server-side file list |
| `PUT api.alexandria-library.com/file/<name>` | Session start, for each file in `library/<tier>/` that isn't a draft/filter/readme | API key, file content + visibility tier | 200/4xx |
| `DELETE api.alexandria-library.com/file/<name>` | Session start, for any server file you no longer have locally | API key | 200/4xx |
| `GET api.alexandria-library.com/library/<slug>/shadow/{authors,free}` | Once per day, only if you created `files/network.md` | API key (for authors-tier), the slug from your network file | shadow content |
| `POST api.alexandria-library.com/feedback` | Install (one install status report, attributed to your account, no file content) + session end (only if YOU typed into `~/alexandria/system/.session_feedback`) | API key, the text being submitted | 200/4xx |
| `git push` / `git pull --rebase` against your own `alexandria-private` GitHub repo | Session start (pull then push) + session end (push) | the tracked contents of `~/alexandria/` — gitignored paths excluded: `system/canon/`, `system/hooks/`, `system/.*`, `files/library/`, `node_modules/` | git ref data |
| `gh` CLI: `gh ssh-key add`, `gh repo create alexandria-private`, `gh repo fork mowinckelb/alexandria` | Install, only if `gh` is authenticated | your separate `gh` OAuth token (not your Alexandria API key) | success/failure |

That is all. No telemetry pings, no error reporters, no third-party CDNs, no analytics SDKs, no DNS callbacks beyond what's listed. You can confirm by `grep -E 'curl|wget|http' ~/alexandria/system/.hooks_payload`.

## What our server holds (specifics)

Cloudflare Worker, stateless re: your private content. KV + D1 + R2.

| Stored | Where | Why |
|---|---|---|
| Email + GitHub login + Stripe customer ID, in one encrypted account blob | KV (AES-256-GCM at rest) | Account, OAuth, billing |
| API key — SHA-256 hash only | KV | Auth check |
| Event log: which endpoints your account hit, with timestamps and lightweight context (e.g. "canon_status: failures=editor, has_notice=true") | KV (60-day TTL) | Debugging, abuse signal |
| Library files you explicitly publish | R2 | Published Library content |
| Library file metadata (name, visibility tier, content hash, updated_at) | D1 | Discovery, listing |
| Per-account record of every module call: module ID, your account ID, timestamp, optional notes (≤2000 chars) | D1 (`protocol_calls`) | Powers the marketplace. Catalog of modules used in the last 90 days is exposed at public `/marketplace`; per-module caller list is exposed at authed `/marketplace/<module>`. |
| Feedback text you explicitly type and submit (including the one-line install status report at setup) | Private GitHub repo `mowinckelb/alexandria-feedback` (founder-only access) | Founder reads + factory autoloop processes weekly to draft canon updates |

**Not stored anywhere we control:** your constitution, vault, marginalia, transcripts, machine.md, notepad, raw API key, ai-vendor (Anthropic/OpenAI/etc) API keys, or any file you did not explicitly `PUT /file/...`. There is no endpoint that accepts them.

**What a complete server breach yields:** account emails, GitHub user IDs, hashed (un-reversible) API keys, the 60-day event log, your full `protocol_calls` history (the per-module portion is already exposed by design via the authed marketplace endpoint), published Library content (files you explicitly published), and Cloudflare-level access logs (IPs, timing). It does not yield private cognition, unpublished files, or ai-vendor credentials, because those never reach the server.

**What a `mowinckelb/alexandria-feedback` breach yields:** feedback text you explicitly typed and submitted, attributed to your GitHub login. Same trust posture as the public repo: protected by GitHub account security.

## Why your API key is safe

- Stored server-side as SHA-256 hash. Never the raw key.
- Account blob in KV encrypted at rest with AES-256-GCM.
- The raw key appears once on the OAuth callback page in your browser. Never in email, never in any third-party metadata.
- Stripe identifies your account by GitHub login, not API key.
- `DELETE /account` with your key removes everything: account record, events, feedback, published files, and any Stripe subscription.

## Audit checklist

These are the files. Read them.

```
# The install
curl https://raw.githubusercontent.com/mowinckelb/alexandria/main/factory/setup.sh

# The shim that runs every session
curl https://raw.githubusercontent.com/mowinckelb/alexandria/main/factory/hooks/shim.sh

# The mutable payload — the one to read most carefully
curl https://raw.githubusercontent.com/mowinckelb/alexandria/main/factory/hooks/payload.sh

# The signed manifest that gates the payload
curl https://raw.githubusercontent.com/mowinckelb/alexandria/main/factory/manifest.txt
curl https://raw.githubusercontent.com/mowinckelb/alexandria/main/factory/manifest.txt.sig

# The canon the ai follows (one of eleven modules)
curl https://raw.githubusercontent.com/mowinckelb/alexandria/main/factory/canon/methodology.md

# What the ai is told via skill
curl https://raw.githubusercontent.com/mowinckelb/alexandria/main/factory/skills/claudecode.md
```

Verify the manifest signature yourself:

```
ssh-keygen -Y verify \
  -f ~/alexandria/system/allowed_signers \
  -I alexandria-payload-signing \
  -n alexandria \
  -s <(curl -fsSL https://raw.githubusercontent.com/mowinckelb/alexandria/main/factory/manifest.txt.sig) \
  < <(curl -fsSL https://raw.githubusercontent.com/mowinckelb/alexandria/main/factory/manifest.txt)
# Expected: Good "alexandria" signature for alexandria-payload-signing with ED25519 key SHA256:kAas5fUUnV/XcfKoH3Ysm7IZrqY2HcQSuhSaMoAMqnA
```

After install, your live install is at:
- `~/alexandria/system/hooks/shim.sh` (refreshed only by re-running setup)
- `~/alexandria/system/.hooks_payload` (refreshed each session after signature + hash check — `diff` against the GitHub raw URL)
- `~/alexandria/system/.canon_manifest` (the verified manifest backing the cached payload)
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
jq 'del(.hooks.SessionStart, .hooks.SessionEnd, .hooks.SubagentStart)' \
  ~/.claude/settings.json > ~/.claude/settings.json.tmp \
  && mv ~/.claude/settings.json.tmp ~/.claude/settings.json

# Remove the skill, scheduled task, Cursor / Codex / Factory entries
rm -rf ~/.claude/skills/alexandria ~/.claude/scheduled-tasks/alexandria
rm -f  ~/.cursor/rules/alexandria.mdc ~/.cursor/hooks/alexandria-*.py
rm -f  ~/.factory/droids/a.md
# ~/.cursor/hooks.json: edit by hand to remove the three alexandria entries
launchctl unload ~/Library/LaunchAgents/io.alexandria.publish.plist 2>/dev/null
rm -f  ~/Library/LaunchAgents/io.alexandria.publish.plist
# Linux: `crontab -e` and remove the publish-fork.sh line
sed -i '' '/alexandria:start/,/alexandria:end/d' ~/.codex/instructions.md 2>/dev/null

# Revoke server-side (removes account record, events, feedback, published files,
# and any Stripe subscription)
curl -X DELETE -H "Authorization: Bearer $YOUR_KEY" https://api.alexandria-library.com/account
```

## How to think about this

The trust here is legible, not zero. It is bounded-trust:

- The repo is public; every payload change is in git history.
- The signing key is offline-held. Anyone with the public repo cannot ship code; only the keyholder can. That is a real concentration of trust; we are not pretending otherwise. Rotation procedure is in `TRUST.md`.
- You can fork, pin to a commit SHA, and run from your own copy. Instructions are above.
- You can re-audit at any time. `diff` your cached payload against the GitHub raw URL, and verify the manifest signature with `ssh-keygen -Y verify` — both shown above.

What we are claiming is *not* "no trust required." We are claiming you can read every line of the trust you are extending, change the relationship anytime, and walk away cleanly with all your files intact.
