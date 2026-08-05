# Trust model

Alexandria is not an agent and not a service — it is a method your own ai runs: plain files on your machine, plus a session hook that loads them into your ai's context at each session start. Your ai does the reading, the writing, and the learning; these files only tell it how. Every session, the shim runs the engine payload pinned on your disk — only after that exact file has passed signature verification against a manifest signed by the maintainer's Touch ID-bound key. Nothing self-updates: a newer signed version surfaces as a notice, and applying it is always your explicit action. This document explains the mechanism and what it does and does not defend against.

## Trust root

A single P-256 key generated inside the Secure Enclave of the maintainer's Mac.

- **Public key fingerprint**: `SHA256:9DVo6uNuieqKMdNtT0QIi/WoQAAbWl5i/t0Z5MdQ/Jg`
- **Public key (verbatim, as installed at `~/alexandria/system/allowed_signers`)**:
  ```
  alexandria-payload-signing ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBETzcr+XjCojo7y6s+JU8UwqkOtzIv3h9kEQI/ef9/nuGolyXvLF8WXkoEDwFc3zkXxTbZ+TVWI5Uq0fgMxHvjM= alexandria-touchid
  ```
- **Private key**: non-exportable Apple hardware. Every signature requires a fresh match against the fingerprints enrolled when the key was created; changing that fingerprint set invalidates the key. There is no passphrase, agent cache, CI secret, or backup copy that can sign.

## First-install identity

The official first touch gives no executable command. The user's existing coding agent independently clones only `https://github.com/benmowinckel/alexandria`, obtains the maintainer account's public signing keys from GitHub's account API, requires the exact fingerprint above, resolves `main` to one full commit hash, and verifies that commit before it reads or runs anything from the project. It then audits and runs `factory/setup.sh` from that same verified commit with `ALEXANDRIA_SOURCE_COMMIT` set to the hash. The setup script uses that immutable hash for every file it fetches, so the code cannot change between inspection and installation.

The check must use the key written into the user's original request or another trust root independent of the downloaded code; a script cannot prove its own identity with a key it supplies itself. A different GitHub owner, fork, unsigned commit, wrong fingerprint, floating download, or mismatch fails closed as possible impersonation. The exact commands are deliberately left to the user's agent so they are produced by the trusted side of the boundary, not copied from the thing being examined.

## What is signed

A single manifest, `factory/manifest.txt`, lists the SHA-256 of the **recurring execution path**: the hook payload, every canon module, and the scheduled skills and scripts. The authoritative set is the `SIGNED_FILES` array in `factory/ship.sh`; the manifest itself is one `<sha256>  <path>` line per file.

Be precise about the boundary, because it is narrower than "everything": the manifest signs the recurring execution path, not `setup.sh` itself. On the official first-install path, that bootstrap is protected one layer earlier by verifying the Git commit before any project code runs, then pinning every setup fetch to the same immutable commit. `setup.sh` embeds the payload public key, fetches and verifies the signed manifest first, and then checks every fetched file that appears in that manifest before installing it. The recurring payload, canon modules, harness skills, Codex merge helper, and other named execution files therefore get a per-file hash check during setup. Files intentionally outside the manifest — including the shim, onboarding block, templates, and setup script itself — are still bound to the verified Git commit on that path. A direct `curl | bash` bypasses the independent commit check and is not the official first-install path. Excerpt (trimmed — read `factory/ship.sh` for the authoritative set):

```
<sha256>  factory/hooks/payload.sh
<sha256>  factory/canon/foundation.md
<sha256>  factory/canon/axioms.md
<sha256>  factory/canon/methodology.md
...
<sha256>  factory/skills/scheduled.md
<sha256>  factory/scripts/install.sh
<sha256>  factory/migrate.sh
```

The manifest is signed only after Touch ID approval (`factory/manifest.txt.sig`), in the namespace `alexandria` with identity `alexandria-payload-signing`. The result is a standard SSH signature, so Authors verify it with the built-in `ssh-keygen` already used by Alexandria; the Apple-only signer exists only on the publishing side.

## What the shim does on every session start

The model is **pinned + consent-symmetric**: the shim only ever executes the payload pinned on disk, nothing self-updates, and no code runs before verification.

1. **Run the pinned payload — verified.** The payload at `~/alexandria/system/.hooks_payload` executes only if its SHA-256 matches the recorded verified hash (`.payload_verified_sha`). When the file is new or changed (fresh install, an update the Author applied), the shim first fetches `manifest.txt` + `manifest.txt.sig` over HTTPS, verifies the signature with the embedded public key, and compares the payload's SHA-256 to the manifest entry — pass → record the hash and run; fail → refuse to run it, loud warning in the AI's context, log to `~/alexandria/system/.alexandria_errors`, bare mode (constitution only, no protocol calls). A payload that has never passed verification never executes.
2. **Check for updates — notify only.** If `hooks/auto-update` exists, the shim fetches and signature-verifies the current upstream manifest; a different payload hash there surfaces as a "signed update available" notice. Nothing is applied. The Author applies by re-running the install line, and the new payload goes through step 1 before its first run. Deleting `hooks/auto-update` stops the update notices. It does not make sessions network-silent: the payload's canon drift check still fetches reference copies from the public repo each session start (public files, carrying nothing about the Author), and a keyed member's API calls continue. Full inventory: [alexandria-library.com/mechanics](https://alexandria-library.com/mechanics).

## What the hooks capture — locally

The session hooks archive each session's transcript into `~/alexandria/files/vault/` on the Author's machine. That is the product working — the vault is the Author's own accumulating record, and later sessions read it to know them. It is written locally, owned by the Author, deletable at any time, and transmitted nowhere: the only network calls the hooks make are the signed-manifest fetches described above, plus — for members only — the API-key-gated calls inventoried on [alexandria-library.com/mechanics](https://alexandria-library.com/mechanics). Transcripts appear in neither list.

## What this defends against

| Threat | Mitigation |
|---|---|
| Impersonating site, repo, or fork supplies different code | The official paste tells the user's already-running agent to require the exact canonical owner and Touch ID key fingerprint before any project code runs. The installer then stays pinned to that verified commit. Any mismatch stops. |
| GitHub account compromise — attacker pushes malicious `payload.sh` to main | Attacker cannot produce a valid `manifest.txt.sig` without the maintainer approving that exact release with Touch ID. Shim refuses to exec. |
| Selectively tampered single file (e.g. swapping `methodology.md`) | Manifest covers every file; any change breaks the manifest hash → signature verify fails. |
| Man-in-the-middle on `raw.githubusercontent.com` | Signature verification on top of HTTPS catches forged content. |
| Rollback to an old signed manifest | The shim does not check a monotonic version counter today. A patient attacker with a previously-valid signed manifest could replay it — under the pinned model this cannot silently change running code (applying always requires the Author's explicit re-run), but it could suppress an update notice or, replayed at apply time, verify an old payload. Documented limit; rotated bundles will add a version field. |

## What this does NOT defend against

| Residual risk | Why it's accepted at current stage |
|---|---|
| Maintainer's Mac compromised | The private key still cannot be exported or used without Touch ID. Malicious local code could try to present a misleading signing prompt; the system prompt names Alexandria and shows the release hash, so approval still requires the maintainer's physical action and attention. |
| Maintainer's Mac is lost or its enrolled fingerprints change | The key is deliberately not recoverable. A new Secure Enclave key must be created and Authors must explicitly re-run setup to trust it. Availability is traded for a hard no-backup signing boundary. |
| Maintainer ships malicious code intentionally | Code is public on GitHub. Anyone can read every line. Reputational + legal alignment is the structural deterrent — same as every CLI tool maintainer. |
| User bypasses the official flow and runs code from an impersonator | No shell script can authenticate itself after it has already started. The independent agent check prevents this on the official path; a person can still deliberately ignore the canonical owner and fingerprint, as with any phishing attempt. |

## Verifying it yourself

```bash
# 1. Fetch the latest manifest + signature from GitHub
curl -fsSL https://raw.githubusercontent.com/benmowinckel/alexandria/main/factory/manifest.txt -o /tmp/m.txt
curl -fsSL https://raw.githubusercontent.com/benmowinckel/alexandria/main/factory/manifest.txt.sig -o /tmp/m.sig

# 2. Verify the signature against the published public key
ssh-keygen -Y verify \
  -f ~/alexandria/system/allowed_signers \
  -I alexandria-payload-signing \
  -n alexandria \
  -s /tmp/m.sig < /tmp/m.txt

# Expected output:
#   Good "alexandria" signature for alexandria-payload-signing with ECDSA key SHA256:9DVo6uNuieqKMdNtT0QIi/WoQAAbWl5i/t0Z5MdQ/Jg

# 3. Verify any individual file's hash matches the manifest
curl -fsSL https://raw.githubusercontent.com/benmowinckel/alexandria/main/factory/hooks/payload.sh \
  | shasum -a 256
# Compare to the line in /tmp/m.txt for factory/hooks/payload.sh
```

## Key rotation

If the Secure Enclave key is invalidated, unavailable, or suspected compromised, the maintainer will:

1. Generate a new Touch ID-bound key inside a clean Mac's Secure Enclave.
2. Update `factory/setup.sh` to embed the new public key.
3. Sign the next manifest with the new key.
4. Announce the rotation on the project website and in the repo.
5. Existing users will need to re-run the install script to pick up the new public key (`curl -fsSL https://raw.githubusercontent.com/benmowinckel/alexandria/main/factory/setup.sh | bash`).

This is intentionally manual — automated key rotation would recreate the unattended signing path this design removes. The rotation to the current fingerprint happened in August 2026; installs trusting the earlier Ed25519 fingerprint must re-run setup once.

## Reporting issues

Suspected key compromise, signature anomalies, or trust-model questions: open an issue at [github.com/benmowinckel/alexandria](https://github.com/benmowinckel/alexandria) or email Benjamin@mowinckel.com.
