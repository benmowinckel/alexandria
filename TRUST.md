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

1. **Run the pinned payload — verified.** The payload at `~/alexandria/system/.hooks_payload` executes only if its SHA-256 matches the recorded verified hash (`.payload_verified_sha`). When the file is new or changed (fresh install, an update the Author applied), the shim first fetches `manifest.txt` + `manifest.txt.sig` over HTTPS, verifies the signature with the embedded public key, and compares the payload's SHA-256 to the manifest entry — pass → record the hash and run; fail → refuse to run it, loud warning in the AI's context, log to `~/alexandria/system/.alexandria_errors`, bare mode (constitution only, no protocol calls). A payload that has never passed verification never executes.
2. **Check for updates — notify only.** If `hooks/auto-update` exists, the shim fetches and signature-verifies the current upstream manifest; a different payload hash there surfaces as a "signed update available" notice. Nothing is applied. The Author applies with `bash ~/alexandria/system/scripts/verify-fetch.sh --run setup.sh`; the local verifier authenticates setup before it executes, and setup authenticates every fetched factory file. Deleting `hooks/auto-update` stops the update notices. It does not make sessions network-silent: the payload's canon drift check still fetches reference copies from the public repo each session start (public files, carrying nothing about the Author), and a keyed member's API calls continue. Full inventory: [alexandria-library.com/mechanics](https://alexandria-library.com/mechanics).

## What the hooks capture — locally

The session hooks archive each session's transcript into `~/alexandria/files/vault/` on the Author's machine. That is the product working — the vault is the Author's own accumulating record, and later sessions read it to know them. It is written locally, owned by the Author, deletable at any time, and transmitted nowhere: the only network calls the hooks make are the signed-manifest fetches described above, plus — for members only — the API-key-gated calls inventoried on [alexandria-library.com/mechanics](https://alexandria-library.com/mechanics). Transcripts appear in neither list.

## What this defends against

| Threat | Mitigation |
|---|---|
| Impersonating site, repo, or fork supplies different code | The official paste tells the user's already-running agent to require the exact canonical owner and Touch ID key fingerprint before any project code runs. The installer then stays pinned to that verified commit. Any mismatch stops. |
| GitHub account compromise — attacker pushes malicious factory code to main | Attacker cannot produce a valid manifest signature without a fresh Touch ID approval. Setup and the local verifier refuse the bytes. |
| Selectively tampered single file (including `setup.sh` or the verifier itself) | Manifest covers the entire tracked factory; any change breaks the signed hash and is refused. |
| Man-in-the-middle on `raw.githubusercontent.com` | Signature verification on top of HTTPS catches forged content. |
| Replay of an old but valid signed release | The signed release version can only move forward; each machine stores the highest authenticated version and rejects anything lower. |

## What this does NOT defend against

| Residual risk | Why it's accepted at current stage |
|---|---|
| Maintainer's Mac compromised | The private key still cannot be exported or used without Touch ID. Malicious local code could try to present a misleading signing prompt; the system prompt names Alexandria and shows the release hash, so approval still requires the maintainer's physical action and attention. |
| Maintainer's Mac is lost or its enrolled fingerprints change | The key is deliberately not recoverable. A new fingerprint must be accepted through the independent first-install process; it cannot be silently rotated by the old software. Availability is traded for a hard no-backup signing boundary. |
| Maintainer ships malicious code intentionally | Code is public on GitHub. Anyone can read every line. Reputational + legal alignment is the structural deterrent — same as every CLI tool maintainer. |
| User bypasses the official flow and runs code from an impersonator | No shell script can authenticate itself after it has already started. The independent agent check prevents this on the official path; a person can still deliberately ignore the canonical owner and fingerprint, as with any phishing attempt. |

## Verifying it yourself

After authenticating the exact Git commit as described above, run this inside that checkout:

```bash
# Verify the checked-out manifest against the installed public key
ssh-keygen -Y verify \
  -f ~/alexandria/system/allowed_signers \
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
