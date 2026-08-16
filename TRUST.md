# Trust model

Alexandria is not an agent and not a service — it is a method your own ai runs: plain Author files at `~/alexandria/`, plus a small automatic runtime at `~/.local/share/alexandria/` that points your ai to those files and archives session transcripts locally. The AI is granted write access to the Author folder, not the runtime; a prompt that changes personal files cannot replace the next automatic hook or its verification marker. Your ai does the reading, writing, and learning; these files tell it how. The core is one local loop: passive ordinary sessions use the approved mirror and preserve clear signal; persistent native terminal chrome, or one medium-native cue on the first reply in a new chat, links into an active session; `/a` develops what accumulated; `a.` preserves the shift; local capture and Git keep the history. Text uses a quiet footer. Voice makes one casual offer to spin up an Alexandria chat on the side and opens it only after the Author agrees. Later replies mention Alexandria only when it is materially part of that exchange. `touch ~/alexandria/system/hooks/visible-cue.off` turns off the whole automatic return path immediately; there is no hidden second nudge. It remains core because without the link the loop depends on the Author remembering, not because the Author is forced to keep it. Five starting method files are installed on top but remain removable or replaceable; moving one into `~/alexandria/system/canon/disabled/` turns it off, and both setup and update notices respect that choice. Shared skill and rule names remain user space: setup overwrites a path only when the protected runtime holds that exact path and its exact installed hash; an exact signed-file comparison migrates older Alexandria installs once. A filename, product word, or copied sentence is never ownership proof. Anything else is preserved and the integration reports incomplete. Additions wait for a direct local need. Connections to updates, an account, Library, marketplace, network, cloud, outbound messages, or twin services stay off until separately approved. Every session, the shim runs only the engine payload pinned in the protected runtime after that exact file has passed signature verification against a manifest signed by the maintainer's Touch ID-bound key. Nothing self-updates or checks for updates by default. This document explains the mechanism and what it does and does not defend against.

The visible route uses the current host's real skill invocation: a slash command in slash-command hosts, a dollar-sign command in Codex, and the plain request `start an Alexandria session` as the portable floor. Typing the bare word `alexandria` is not treated as a universal skill trigger.

## Trust root

A single P-256 key generated inside the Secure Enclave of the maintainer's Mac.

- **Public key fingerprint**: `SHA256:9DVo6uNuieqKMdNtT0QIi/WoQAAbWl5i/t0Z5MdQ/Jg`
- **Public key (verbatim, as installed at `~/.local/share/alexandria/allowed_signers`)**:
  ```
  alexandria-payload-signing ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBETzcr+XjCojo7y6s+JU8UwqkOtzIv3h9kEQI/ef9/nuGolyXvLF8WXkoEDwFc3zkXxTbZ+TVWI5Uq0fgMxHvjM= alexandria-touchid
  ```
- **Private key**: non-exportable Apple hardware. Every signature requires a fresh match against the fingerprints enrolled when the key was created; changing that fingerprint set invalidates the key. There is no passphrase, agent cache, CI secret, or backup copy that can sign.

## First-install identity

The official first touch gives no executable command, fingerprint, or vendor-authored verification recipe. It states the user's intent, discloses the local hooks and removable session cue, names the public canonical repo, tells their existing agent to treat every Alexandria file as untrusted evidence, and requires a plain explanation plus the user's word `start` before anything changes. The agent chooses its own security process.

A robust process has two phases. Before the user says `start`, the agent stays read-only: it uses GitHub's account and commit APIs plus source views at one immutable `main` hash to authenticate the owner, signing key, commit signature, and code without cloning, downloading project files, executing code, or creating local state. It explains the result and waits. Only after `start` does it clone or fetch the canonical repo, check out and locally verify that already-authenticated commit, and run `factory/setup.sh` with `ALEXANDRIA_SOURCE_COMMIT` set to the same hash. Setup then uses that immutable hash for every file it fetches, so the code cannot change between inspection and setup. The fingerprint above is continuity evidence, but a fingerprint learned from this repo is not an independent trust root. Protection against compromise of the maintainer's whole GitHub account requires confirming it through a channel the user already trusts, or declining to proceed. A script cannot authenticate itself with a key it supplies itself.

## Existing-loop account connection

Joining does not authorize local setup. The joined handoff assumes the private loop already works and points the user's own AI to one focused public document, `factory/connect.md`. The paste is non-executable, tells the AI to distrust Alexandria's material, requires a plain explanation, and waits for the exact word `connect`.

After consent, the already-installed verifier authenticates the signed `factory/scripts/connect-account.sh`. That connector refuses unless setup and local onboarding are complete, reads no private Author file, and writes only `system/.api_key` plus the verified `system/.protocol_status.json`. The browser and email carry a random 24-hour, one-use connection code, never the persistent API key. D1 consumes that code atomically; the API checks live membership before minting a key. GitHub sign-in alone never rotates a working key, and account connection is recorded as `connected_at`, separately from `installed_at` (the first optional module call). Publishing, marketplace reporting, network reading, backups, and every other optional capability remain off behind their own exact consent.

## What is signed

A single manifest, `factory/manifest.txt`, lists a signed, monotonically increasing release version and the SHA-256 of **every tracked file under `factory/`**. `factory/ship.sh` derives that set from Git itself; there is no hand-maintained allowlist that can forget a new script, prompt, template, hook, or setup file. Only the generated manifest and its signature are excluded.

On first install, `factory/setup.sh` is protected by the independently verified Git commit and every fetch is pinned to that exact commit. Setup then authenticates the manifest before fetching any factory file and refuses any file missing from the manifest or not matching its signed hash. On every later update, the already-installed verifier authenticates `setup.sh` before running it. The website and API are never executable update authorities.

```
<sha256>  factory/hooks/payload.sh
<sha256>  factory/hooks/shim.sh
<sha256>  factory/setup.sh
<sha256>  factory/canon/foundation.md
<sha256>  factory/canon/axioms.md
<sha256>  factory/canon/methodology.md
...
<sha256>  factory/skills/scheduled.md
<sha256>  factory/scripts/install.sh
<sha256>  factory/migrate.sh
```

The manifest is signed only after Touch ID approval (`factory/manifest.txt.sig`), in the namespace `alexandria` with identity `alexandria-payload-signing`. The result is a standard SSH signature, so Authors verify it with `ssh-keygen`; the Apple-only signer exists only on the publishing side. Each accepted release version becomes a local floor. An older valid manifest is rejected, so rollback is shipped as a new forward-signed release rather than replaying old bytes.

## What the shim does on every session start

The model is **pinned + consent-symmetric**: the shim only ever executes the payload pinned on disk, nothing self-updates, and no code runs before verification.

1. **Run the pinned payload — verified.** The payload at `~/.local/share/alexandria/.hooks_payload` executes only if its SHA-256 matches the recorded verified hash beside it (`.payload_verified_sha`). The harness grants the model write access to `~/alexandria`, while hook commands and verification state remain outside that root. When the payload is new or changed (fresh install, an update the Author applied), the shim first fetches `manifest.txt` + `manifest.txt.sig` over HTTPS, verifies the signature with the embedded public key, and compares the payload's SHA-256 to the manifest entry — pass → record the hash and run; fail → refuse to run it, loud warning in the AI's context, log to `~/alexandria/system/.alexandria_errors`, bare mode (constitution only, no protocol calls). A payload that has never passed verification never executes.
2. **Optional update notices.** Setup leaves `hooks/auto-update` absent. If the Author separately creates it, the shim fetches and signature-verifies the current upstream manifest; a different payload hash surfaces as a "signed update available" notice, and the payload compares public canon and installed factory files for drift. Nothing is applied. The Author applies with `bash ~/.local/share/alexandria/scripts/verify-fetch.sh --run setup.sh`; the local verifier authenticates setup before it executes, and setup authenticates every fetched factory file. Removing `hooks/auto-update` stops those requests. A separately connected account makes one small authenticated `GET /alexandria` status read at session start: API key + client-version hash out; live account state + the current static module-map version back. It sends no Author file or private content and activates nothing else. Library, marketplace reporting, backup, saved-link resolution, and network reading each require a separate permission. Full inventory: [alexandria-library.com/mechanics](https://alexandria-library.com/mechanics).

## What the hooks capture — locally

The session hooks archive transcripts into `~/alexandria/files/vault/` when the host exposes them; Cursor's prompt/response hooks build a local transcript themselves. If a host supplies no transcript, the loop must say so rather than claim capture. The vault is the Author's accumulating local record, owned by them, retained until they delete it, and removable at any time. Running the scoped uninstaller disconnects every Alexandria hook while keeping the files by default; `--delete-files` removes those local files too. Cursor's shared `~/.alexandria/` sidecar is preserved because its directory name cannot prove every existing file inside belongs to Alexandria. Every hook also requires the post-probe `.setup_complete` marker, so a failed install or update leaves a visible partial folder but no mixed Alexandria hooks running. By default the vault is transmitted nowhere. A keyless loop makes no post-setup network request. A connected account makes only the status read described above; every data-carrying feature remains separately permissioned. Each connected computer has its own revocable account key, so a later GitHub sign-in or connection on another computer does not invalidate a healthy local connection. If the Author separately enables backup, tracked vault files are pushed only to the exact private Git remote they approved; Alexandria has no access to that repo. Optional signed update checks, Library, marketplace, network, or saved-link resolution run only while their separate permission is valid. Saved-link resolution sends only the exact URL or tweet ID the Author deliberately placed in the capture inbox; it stays off without `system/permissions/capture-network`. Transcripts appear in none of those requests.

## What this defends against

| Threat | Mitigation |
|---|---|
| Impersonating site, repo, or fork supplies different code | The official paste names the exact canonical GitHub owner and tells the user's already-running agent to use its own security process while trusting none of our instructions. A robust agent verifies one signed commit and setup stays pinned to it. Strict protection against compromise of the canonical GitHub account still requires confirming the published fingerprint through an already-trusted channel. |
| GitHub account compromise after installation | The installed verifier retains the already-accepted release key. An attacker cannot produce a valid newer manifest signature, so updates are refused. For a fresh install, protection against compromise of the whole canonical account requires confirming the fingerprint through another trusted channel. |
| Selectively tampered single file (including `setup.sh` or the verifier itself) | Manifest covers the entire tracked factory; any change breaks the signed hash and is refused. |
| A prompt or repository edits the Author-writable Alexandria folder | Automatic hook programs, the signing key, accepted manifest, version floor, and activation marker live at `~/.local/share/alexandria/`, outside the writable root granted to the AI. The next hook does not execute a file or trust marker from `~/alexandria`. |
| Man-in-the-middle on `raw.githubusercontent.com` | Signature verification on top of HTTPS catches forged content. |
| Replay of an old but valid signed release | The signed release version can only move forward; each machine stores the highest authenticated version and rejects anything lower. |

## What this does NOT defend against

| Residual risk | Why it's accepted at current stage |
|---|---|
| Maintainer's Mac compromised | The private key still cannot be exported or used without Touch ID. Malicious local code could try to present a misleading signing prompt; the system prompt names Alexandria and shows the release hash, so approval still requires the maintainer's physical action and attention. |
| Maintainer's Mac is lost or its enrolled fingerprints change | The key is deliberately not recoverable. A new fingerprint must be accepted through the independent first-install process; it cannot be silently rotated by the old software. Availability is traded for a hard no-backup signing boundary. |
| Maintainer ships malicious code intentionally | Code is public on GitHub. Anyone can read every line. Reputational + legal alignment is the structural deterrent — same as every CLI tool maintainer. |
| User bypasses the official flow and runs code from an impersonator | No shell script can authenticate itself after it has already started. The official path asks the user's existing agent to inspect first and wait for informed consent; a person can still deliberately bypass that boundary, as with any phishing attempt. |
| The AI tool is deliberately run without a filesystem sandbox | All runtime files are owned by the same OS user, so a truly unsandboxed agent could alter them. The separation protects supported sandboxed operation; it is not an OS account boundary. |

## Verifying it yourself

After authenticating the exact Git commit as described above, run this inside that checkout:

```bash
# Verify the checked-out manifest against the installed public key
ssh-keygen -Y verify \
  -f ~/.local/share/alexandria/allowed_signers \
  -I alexandria-payload-signing \
  -n alexandria \
  -s factory/manifest.txt.sig < factory/manifest.txt

# Expected output:
#   Good "alexandria" signature for alexandria-payload-signing with ECDSA key SHA256:9DVo6uNuieqKMdNtT0QIi/WoQAAbWl5i/t0Z5MdQ/Jg

# Verify every tracked factory file's hash matches the manifest
awk '$1 !~ /^#/ { print $1 "  " $2 }' factory/manifest.txt | shasum -a 256 -c
```

## Key rotation

If the Secure Enclave key is invalidated, unavailable, or suspected compromised, the maintainer will:

1. Generate a new Touch ID-bound key inside a clean Mac's Secure Enclave.
2. Use GitHub's account-recovery/admin path to replace the default-branch release gate and `factory/setup.sh` with the new public key. This is a visible trust-root recovery, not an ordinary release.
3. Sign the first factory manifest under the new root with the new key.
4. Announce the rotation independently on the project website and in the repo.
5. Existing users repeat the independent `/start` verification flow and explicitly accept the announced new fingerprint. The old local verifier cannot silently grant trust to a replacement key.

This is intentionally manual — automated key rotation would recreate the unattended signing path this design removes. The rotation to the current fingerprint happened in August 2026; installs trusting the earlier Ed25519 fingerprint must re-run setup once.

## Reporting issues

Suspected key compromise, signature anomalies, or trust-model questions: open an issue at [github.com/benmowinckel/alexandria](https://github.com/benmowinckel/alexandria) or email Benjamin@mowinckel.com.
