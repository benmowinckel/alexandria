# Mechanics

You are about to run a curl command that puts files on your machine, modifies your ai config, and pulls live code from GitHub on every session. Read this once. If anything here doesn't match the scripts, don't run it.

## TL;DR for the auditor

- **What runs:** plain bash scripts and markdown. No binaries, no daemons, no shell-rc edits, no root.
- **Source of truth:** `github.com/mowinckelb/alexandria` (public). Everything you can audit, you can audit there.
- **Trust model:** mutable, by design. The hooks payload is fetched from `main` on every session. You're trusting an ongoing relationship with the public repo, not a frozen install. Tradeoff is named below.
- **What our server holds:** your email, GitHub user ID, hashed API key, an event log of which endpoints you hit, and any files you explicitly publish to the Library. Nothing else.
- **What our server does not hold:** your constitution, vault, marginalia, transcripts, or AI-vendor API keys. There is no endpoint that accepts them.
- **Side channel:** the only data that leaves your machine for our server is (a) module IDs you call (anonymous usage tally), (b) feedback you explicitly type into `~/alexandria/system/.session_feedback`, and (c) files you explicitly publish to the Library. The Engine never auto-sends content on your behalf.
- **Uninstall:** three commands at the bottom of this page. Reversible.

## Threat model

We claim:
1. The install does what this page says, and only that. Auditable line by line.
2. Your private cognition (constitution, vault, marginalia, transcripts) never leaves your machine via Alexandria. There is no endpoint that accepts it.
3. A complete breach of our server yields the data listed above and nothing more — because nothing more is stored.

We do not claim:
- Zero metadata. The server logs which endpoints your account hits and when, and Cloudflare logs IPs at the edge.
- Immunity to future repo compromise. If `mowinckelb/alexandria` is compromised, the next session pulls the compromised payload. Mitigations below; pinning is not one of them today.
- Zero risk. AI tools execute hooks with your shell privileges. That is true of every editor extension, every dev-server, and every shell hook on your machine — but it is true here too.

## Inspect before running

```
curl -s https://raw.githubusercontent.com/mowinckelb/alexandria/main/factory/setup.sh | less
```

The setup is one bash script, ~685 lines. The hooks payload is one bash script, ~463 lines. The shim is 89 lines. Everything below describes what they do, in order.

## What gets installed on your machine

**`~/alexandria/`** — a folder, initialised as a local Git repository (`~/alexandria/.git/`). Plain markdown and small JSON state files. All readable. The Git repo IS the substrate format — your worldline is a sequence of commits, your own to push to any Git remote (GitHub is the default if you `gh auth login`; any host works).

| Path | Purpose |
|---|---|
| `.git/` | Local Git repository. Your cognitive worldline as a commit history. |
| `files/constitution/` | Your beliefs, personality, working style. You write these. |
| `files/vault/` | Raw input — transcripts, notes, voice memos. You drop things in. |
| `files/marginalia/` | Shared working layer between raw and settled — your developing thoughts + Engine candidates, drains over time. |
| `files/library/` | Files you publish (opt-in). |
| `files/core/` | Engine working memory (machine.md, notepad.md, feedback.md). |
| `system/hooks/shim.sh` | 89-line wrapper. Fetches `.hooks_payload` from GitHub at session start. |
| `system/.hooks_payload` | Cached copy of `factory/hooks/payload.sh` from the public repo, signature-verified before execution (see Trust model below). |
| `system/allowed_signers` | The maintainer's offline public key. Trust root for payload signature verification. |
| `system/canon/methodology.md` | Cached copy of the public canon. |
| `system/.api_key` | Your API key, mode 0600. |

**`~/.claude/skills/alexandria/SKILL.md`** — a skill file. Plain markdown. `cat` it.

**`~/.claude/scheduled-tasks/alexandria/SKILL.md`** — optional scheduled task. Plain markdown. `cat` it.

**`~/alexandria-fork/`** — only if you have `gh` authenticated. A sparse-checkout of your own GitHub fork of the public alexandria repo, used for publishing modules you write.

### The Git substrate and commit signing

`~/alexandria/` is initialised as a local Git repository. Your worldline IS a commit history — every Constitution edit, marginalia drain, and vault drop you preserve becomes a commit. The repo is yours; you can push to any Git remote (GitHub is the default if you have `gh` authenticated; any host works).

**How signing works.** `setup.sh` detects an existing SSH public key under `~/.ssh/*.pub` (first one found, any type — Ed25519, RSA, ECDSA). If found and you have `gh` authenticated, it (a) registers that key with GitHub as a *signing* key via `gh ssh-key add --type signing` (idempotent — re-runs and multi-machine setups quietly do the right thing), (b) configures git inside `~/alexandria/` to sign with that key, repo-local — your global git config and other repos are untouched, (c) writes the key + your email to `~/.config/git/allowed_signers` so `git verify-commit` and `git log --show-signature` work locally, and (d) signs the genesis commit. Every subsequent commit is signed automatically. GitHub will display "Verified" badges on your signed commits.

**Soft fallback.** If you have no SSH key or `gh` isn't authenticated, setup prints `signing: skipped (...)` with the reason and the genesis commit goes through unsigned. The worldline still works — you just don't get the verified ledger property. Run `ssh-keygen -t ed25519` or `gh auth login` and re-run setup to enable signing later.

**OAuth scope.** Alexandria's GitHub OAuth requests `admin:ssh_signing_key` at signup so `setup.sh` can register the key without a separate scope-refresh step. Existing pre-scope users see a one-time re-authorize prompt at next web login.

**What you can verify yourself.** `git -C ~/alexandria log --show-signature` shows the signature on each commit. `git -C ~/alexandria verify-commit HEAD` returns "Good signature" if signing is configured. On GitHub, the commit history page shows the green "Verified" badge on each commit. The signing key never leaves your machine; only the public key is uploaded to GitHub.

## What gets modified in your config

| File | Change | Inspect |
|---|---|---|
| `~/.claude/settings.json` | Adds 3 hook entries (SessionStart, SessionEnd, SubagentStart) pointing to the shim. | `cat ~/.claude/settings.json` |
| `~/.cursor/hooks.json` | Only if Cursor detected. Adds 3 hook entries. | `cat ~/.cursor/hooks.json` |
| `~/.cursor/rules/alexandria.mdc` | Only if Cursor detected. Plain markdown rule. | `cat ~/.cursor/rules/alexandria.mdc` |
| `~/.codex/instructions.md` | Only if Codex detected. Appends a marked block (`<!-- alexandria:start -->` … `<!-- alexandria:end -->`). | `cat ~/.codex/instructions.md` |
| `~/Library/LaunchAgents/io.alexandria.publish.plist` | macOS only, only if `gh` authenticated. Hourly publish job for your fork. | `cat ~/Library/LaunchAgents/io.alexandria.publish.plist` |
| User crontab | Linux only, only if `gh` authenticated. One hourly line. | `crontab -l` |

**Not modified:** shell rc files (`.zshrc`, `.bashrc`, `.profile`), system PATH, sudoers, system services, anything outside `~/alexandria/`, `~/.claude/`, `~/.cursor/`, `~/.codex/`, and the launchd/cron entries above.

## The bootstrap-from-main model

This is the most important property to understand.

The shim at `~/alexandria/system/hooks/shim.sh` is installed once and never re-fetched. On every Claude Code session start, it does this:

```
curl -sf https://raw.githubusercontent.com/mowinckelb/alexandria/main/factory/hooks/payload.sh
```

It caches the result, then runs it. **The code that processes your session is whatever is on `main` right now**, not what was on `main` when you installed.

Why this exists: improvements to the engine reach you without you having to re-install. Bugs get fixed once, for everyone, on push. The canon evolves and your machine picks it up.

What you're trusting: the public repo `github.com/mowinckelb/alexandria` and whoever can push to it (today: one person, the founder, account-protected with 2FA).

What protects you anyway:
1. **Payload signature verification.** The shim (`system/hooks/shim.sh`) verifies the SSH signature on every payload fetch against `~/alexandria/system/allowed_signers` (which pins the maintainer's offline public key, installed once at setup). An unsigned or wrong-signature payload is refused. `ssh-keygen -Y verify` is the verification primitive; the trust root is the offline-held private key that signs the manifest in the repo. See `TRUST.md` in the public repo for the full trust model.
2. **Cache cutoff.** If GitHub is unreachable AND the cache is >14 days old, the shim deletes it and runs in bare mode (constitution-only, no network, no payload code).
3. **Public diff.** Every payload version is in git history. Any session can be reconstructed from the commit SHA on `main` at that moment.
4. **Canon canaries.** The canon explicitly tells the model to refuse instructions that try to exfiltrate files, escalate scope, or bypass the user.
5. **AI-tool approval dialogs.** Claude Code, Cursor, and Codex show every shell action before executing. Real protection at install and during anomaly, but it weakens with habituation — treat it as a backstop, not the primary defense.

What does not protect you: content-hash pinning to a specific payload version on the install side. The shim verifies *signatures*, not specific hashes — a fresh sign from the same key on a new payload will be accepted. Compromise of the offline signing key would compromise future payloads (mitigation: the key is offline-held and the maintainer's repo is 2FA-protected). If that residual gap matters to you, run a frozen install (see below).

### Want a frozen install instead?

Fork `mowinckelb/alexandria` on GitHub. The fork copies `setup.sh`, `shim.sh`, `payload.sh`, and the canon — but each of those files still references `mowinckelb/alexandria` in their URLs. Rewrite them all to point at your fork, then install from your fork:

```
git clone https://github.com/YOUR-HANDLE/alexandria.git
cd alexandria
grep -rl 'mowinckelb/alexandria' factory/ \
  | xargs sed -i.bak 's|mowinckelb/alexandria|YOUR-HANDLE/alexandria|g'
find factory/ -name '*.bak' -delete    # cross-platform: BSD/GNU sed compatible
git commit -am "pin to my fork"
git push
curl -fsSL "https://raw.githubusercontent.com/YOUR-HANDLE/alexandria/main/factory/setup.sh" \
  | bash -s -- $YOUR_API_KEY
```

To pin to a specific commit (full immutability), also replace `main` with a commit SHA in those files. Re-pin manually whenever you want to upgrade.

## Network call inventory

Every outbound call the install or hooks make. Complete list.

| Call | Trigger | Sends | Receives |
|---|---|---|---|
| `GET raw.githubusercontent.com/.../setup.sh` | You, once, at install time | nothing | the install script |
| `GET raw.githubusercontent.com/.../hooks/payload.sh` | Every session start | nothing | the hooks payload |
| `GET raw.githubusercontent.com/.../canon/methodology.md` | Session start, when canon refresh due | nothing | the canon |
| `GET raw.githubusercontent.com/.../factory/...` | Session start, drift check | nothing | factory file diff |
| `GET api.alexandria-library.com/alexandria` | Setup probe + session status | API key (Bearer) | account status |
| `POST api.alexandria-library.com/call` | Session start | API key, module IDs, optional short notes | 200/4xx |
| `POST api.alexandria-library.com/feedback` | Session end, only if YOU typed feedback into `~/alexandria/system/.session_feedback` | API key, the feedback text you wrote | 200/4xx |
| `PUT api.alexandria-library.com/file/shadow` | Only when you explicitly publish a shadow file | API key, the file content you chose to publish | 200/4xx |

That is all. No telemetry pings, no error reporters, no third-party CDNs, no analytics SDKs, no DNS callbacks beyond what's listed. You can confirm by `grep -E 'curl|wget|http' ~/alexandria/system/.hooks_payload`.

## What our server holds (specifics)

Cloudflare Worker, stateless re: your private content. KV + D1 + R2 on the server. The Engine never auto-sends data on your behalf — the only thing that can leave the local machine is feedback you explicitly type into `~/alexandria/system/.session_feedback`.

| Stored | Where | Why |
|---|---|---|
| Email + GitHub login + Stripe customer ID, in one encrypted account blob | KV (AES-256-GCM at rest) | Account, OAuth, billing |
| API key — SHA-256 hash only | KV | Auth check |
| Event log: which endpoints your account hit, with timestamps | KV (60-day TTL) | Debugging, abuse signal |
| Library files you explicitly publish | R2 | Public Library content |
| Library file metadata (visibility, updated_at) | D1 | Discovery, listing |
| Feedback text you explicitly type and submit | Private GitHub repo `mowinckelb/alexandria-feedback` (founder-only access) | Founder reads + factory autoloop processes weekly to draft canon updates |

**Not stored anywhere we control:** your constitution, vault, marginalia, transcripts, machine.md, notepad, raw API key, AI-vendor (Anthropic/OpenAI/etc) API keys, or any file you did not explicitly `PUT /file/...`. There is no endpoint that accepts them.

**What a complete server breach yields:** account emails, GitHub user IDs, hashed (un-reversible) API keys, the 60-day event log, published Library content (already public), and Cloudflare-level access logs (IPs, timing). It does not yield private cognition, unpublished files, or AI-vendor credentials, because those never reach the server.

**What a `mowinckelb/alexandria-feedback` breach yields:** feedback text users explicitly typed and submitted (attributed — they chose what to send, knowing it goes to the founder). Same trust posture as the public repo: protected by GitHub account security.

## Why your API key is safe

- Stored server-side as SHA-256 hash. Never the raw key.
- Account blob in KV encrypted at rest with AES-256-GCM.
- The raw key appears once on the OAuth callback page in your browser. Never in email, never in any third-party metadata.
- Stripe identifies your account by GitHub login, not API key.
- `DELETE /account` with your key removes everything: account record, events, feedback, published files, Stripe subscription.

## Audit checklist

These are the files. Read them.

```
# The install
curl https://raw.githubusercontent.com/mowinckelb/alexandria/main/factory/setup.sh

# The shim that runs every session (89 lines)
curl https://raw.githubusercontent.com/mowinckelb/alexandria/main/factory/hooks/shim.sh

# The mutable payload (~463 lines) — the one to read most carefully
curl https://raw.githubusercontent.com/mowinckelb/alexandria/main/factory/hooks/payload.sh

# The canon the AI follows
curl https://raw.githubusercontent.com/mowinckelb/alexandria/main/factory/canon/methodology.md

# What the AI is told via skill
curl https://raw.githubusercontent.com/mowinckelb/alexandria/main/factory/skills/claudecode.md
```

After install, your live install is at:
- `~/alexandria/system/hooks/shim.sh` (immutable)
- `~/alexandria/system/.hooks_payload` (refreshed each session — diff against the GitHub URL above)
- `~/alexandria/system/canon/methodology.md` (refreshed periodically)

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
# Remove the folder
rm -rf ~/alexandria

# Remove the Claude Code hooks (edit ~/.claude/settings.json by hand,
# or use jq):
jq 'del(.hooks.SessionStart, .hooks.SessionEnd, .hooks.SubagentStart)' \
  ~/.claude/settings.json > ~/.claude/settings.json.tmp \
  && mv ~/.claude/settings.json.tmp ~/.claude/settings.json

# Remove the skill, scheduled task, and (if installed) Cursor / Codex / launchd entries
rm -rf ~/.claude/skills/alexandria ~/.claude/scheduled-tasks/alexandria
rm -f  ~/.cursor/rules/alexandria.mdc ~/.cursor/hooks/alexandria-*.py
launchctl unload ~/Library/LaunchAgents/io.alexandria.publish.plist 2>/dev/null
rm -f  ~/Library/LaunchAgents/io.alexandria.publish.plist
sed -i '' '/alexandria:start/,/alexandria:end/d' ~/.codex/instructions.md 2>/dev/null

# Revoke server-side
curl -X DELETE -H "Authorization: Bearer $YOUR_KEY" https://api.alexandria-library.com/account
```

Your files in `~/alexandria/` are yours. If you back them up to `alexandria-private` on GitHub during install, that repo also stays yours; we never had access to it.

## How to think about this

The trust here is legible, not zero. It is bounded-trust:

- The repo is public; every payload change is in git history.
- Today, one maintainer can push to `main`. That is a real concentration of trust; we are not pretending otherwise.
- You can fork, pin to a commit SHA, and run from your own copy. The instructions are above.
- You can re-audit at any time. `diff` your `.hooks_payload` against the GitHub raw URL whenever you feel like it.

What we are claiming is *not* "no trust required." We are claiming you can read every line of the trust you are extending, change the relationship anytime, and walk away cleanly with all your files intact.
