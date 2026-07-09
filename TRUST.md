# Trust model

Alexandria is a local agent that reads your files and emits a prompt block for the host LLM. Every session, the shim fetches the latest `payload.sh` and runs it. This document explains what that means for trust.

## Trust root

A single ed25519 keypair, held offline.

- **Public key fingerprint**: `SHA256:kAas5fUUnV/XcfKoH3Ysm7IZrqY2HcQSuhSaMoAMqnA`
- **Public key (verbatim, as installed at `~/alexandria/system/allowed_signers`)**:
  ```
  alexandria-payload-signing ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHv5jBpDuEg2Nae7QrtNQ9ycclulY8+G4iZOjd2Kdw+9 alexandria-payload-signing
  ```
- **Private key**: lives only on the maintainer's machine. Never committed, never in CI, never in any secret manager that grants programmatic access. Backed up to an offline-secured location.

## What is signed

A single manifest, `factory/manifest.txt`, lists the SHA-256 of every file that runs as code or steers the model — the payload, every canon module, the signed skills and scripts, and the plugin's shell files. The authoritative set is the `SIGNED_FILES` array in `factory/ship.sh`; the manifest itself is one `<sha256>  <path>` line per file. Excerpt (trimmed — read the real file for the full list):

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

The manifest is signed with the offline key (`factory/manifest.txt.sig`), in the namespace `alexandria` with identity `alexandria-payload-signing`.

## What the shim does on every session start

1. Fetch `payload.sh` from GitHub (HTTPS).
2. Fetch `manifest.txt` and `manifest.txt.sig` from GitHub (HTTPS).
3. Verify the signature on `manifest.txt` using the embedded public key.
4. Compute SHA-256 of the freshly-fetched `payload.sh` and compare to the manifest entry.
5. Only if both checks pass: cache the verified payload and run it.

If any check fails: fall back to the last verified cached payload, surface a loud warning in the AI's context, and log to `~/alexandria/system/.alexandria_errors`. If no verified cache exists, run bare mode (constitution only, no protocol calls).

## What this defends against

| Threat | Mitigation |
|---|---|
| GitHub account compromise — attacker pushes malicious `payload.sh` to main | Attacker cannot produce a valid `manifest.txt.sig` without the offline private key. Shim refuses to exec. |
| Selectively tampered single file (e.g. swapping `methodology.md`) | Manifest covers every file; any change breaks the manifest hash → signature verify fails. |
| Man-in-the-middle on `raw.githubusercontent.com` | Signature verification on top of HTTPS catches forged content. |
| Rollback to an old signed manifest | The shim does not check a monotonic version counter today. A patient attacker with a previously-valid signed manifest could replay it. Documented limit; rotated bundles will add a version field. |

## What this does NOT defend against

| Residual risk | Why it's accepted at current stage |
|---|---|
| Maintainer's Mac compromised → attacker signs malicious content | Inherent to any signing scheme. Mitigated by FileVault + 1Password backup + the human user noticing public-code changes. |
| Maintainer ships malicious code intentionally | Code is public on GitHub. Anyone can read every line. Reputational + legal alignment is the structural deterrent — same as every CLI tool maintainer. |
| Compromise of the initial `setup.sh` fetch (bootstrap problem) | Public key is embedded in `setup.sh` itself. Inherent to `curl \| bash` install patterns. Verifiable by anyone with the published fingerprint above. |

## Verifying it yourself

```bash
# 1. Fetch the latest manifest + signature from GitHub
curl -fsSL https://raw.githubusercontent.com/mowinckelb/alexandria/main/factory/manifest.txt -o /tmp/m.txt
curl -fsSL https://raw.githubusercontent.com/mowinckelb/alexandria/main/factory/manifest.txt.sig -o /tmp/m.sig

# 2. Verify the signature against the published public key
ssh-keygen -Y verify \
  -f ~/alexandria/system/allowed_signers \
  -I alexandria-payload-signing \
  -n alexandria \
  -s /tmp/m.sig < /tmp/m.txt

# Expected output:
#   Good "alexandria" signature for alexandria-payload-signing with ED25519 key SHA256:kAas5fUUnV/XcfKoH3Ysm7IZrqY2HcQSuhSaMoAMqnA

# 3. Verify any individual file's hash matches the manifest
curl -fsSL https://raw.githubusercontent.com/mowinckelb/alexandria/main/factory/hooks/payload.sh \
  | shasum -a 256
# Compare to the line in /tmp/m.txt for factory/hooks/payload.sh
```

## Key rotation

If the offline key is ever compromised or suspected compromised, the maintainer will:

1. Generate a new keypair on a clean machine.
2. Update `factory/setup.sh` to embed the new public key.
3. Sign the next manifest with the new key.
4. Announce the rotation on the project website and in the repo.
5. Existing users will need to re-run the install script to pick up the new public key (`curl -fsSL https://raw.githubusercontent.com/mowinckelb/alexandria/main/factory/setup.sh | bash`).

This is intentionally manual — automated key-rotation infrastructure would itself become a new attack surface.

## Plugin delivery (Claude Code / Claude Desktop / Cowork)

The `alexandria` plugin (`factory/plugin/`, served from this repo's marketplace manifest at `.claude-plugin/marketplace.json`) is a delivery shell, not a second product. Its hook entries call `plugin-shim.sh`, which locates the Author's alexandria folder and hands off to the same `shim.sh` → signature-verified `payload.sh` chain documented above. All evolving behavior remains inside the signed payload.

Trust surface: the plugin's shell files (`hooks/hooks.json`, `scripts/plugin-shim.sh`, `scripts/shim.sh`, `skills/a/SKILL.md`) arrive via the Claude plugin marketplace — a git clone of this repo — the same channel `setup.sh` and the shim itself arrive through. They are listed in `SIGNED_FILES` and covered by `manifest.txt` from the first signing after their introduction, so tampering is detectable by comparing a clone against the signed manifest. Claude Code itself does not verify plugin content at load time; the runtime signature gate remains where it has always been — on the payload, immediately before execution.

## Reporting issues

Suspected key compromise, signature anomalies, or trust-model questions: open an issue at [github.com/mowinckelb/alexandria](https://github.com/mowinckelb/alexandria) or email Benjamin@mowinckel.com.
