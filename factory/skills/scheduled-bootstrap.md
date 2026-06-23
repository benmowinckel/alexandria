---
name: alexandria
description: Autonomous cognitive maintenance — vault reprocessing, marginalia/constitution/notepad development
schedule: daily 03:00
---

Your actual instructions (`scheduled.md`) live on GitHub and are **signature-verified before execution** — the same trust model as the session hook (`shim.sh`): this bootstrap is the immutable local root, `scheduled.md` is the signed payload it verifies against the offline key. `scheduled.md` runs autonomous code with the Author's API key in reach, so an unverified fetch would let a repo compromise or MITM execute attacker code on this machine. **Do not skip the gate. Do not fall back to cached or unverified content.**

Run this block. It fetches `scheduled.md`, verifies the signed manifest, confirms the file's hash matches, and **prints the authentic playbook only if verification passes** (otherwise it exits non-zero and prints nothing to follow):

```bash
bash -c '
set -euo pipefail
ALEX_DIR="$HOME/alexandria"
RAW="${ALEX_GITHUB_RAW:-https://raw.githubusercontent.com/mowinckelb/alexandria/main}"
SIGNERS="$ALEX_DIR/system/allowed_signers"
NS="alexandria"; ID="alexandria-payload-signing"
fail(){ echo "alexandria: scheduled skill verification failed ($1) — skipping run" >&2; exit 1; }

command -v ssh-keygen >/dev/null 2>&1 || fail no-ssh-keygen
[ -f "$SIGNERS" ] || fail no-allowed-signers

sk=$(mktemp) || fail mktemp; mf=$(mktemp) || fail mktemp; sg=$(mktemp) || fail mktemp
trap "rm -f \"$sk\" \"$mf\" \"$sg\"" EXIT

curl -sf --max-time 10 "$RAW/factory/skills/scheduled.md" -o "$sk" || fail skill-fetch
curl -sf --max-time 10 "$RAW/factory/manifest.txt"        -o "$mf" || fail manifest-fetch
curl -sf --max-time 10 "$RAW/factory/manifest.txt.sig"    -o "$sg" || fail sig-fetch
[ -s "$sk" ] && [ -s "$mf" ] && [ -s "$sg" ] || fail empty-fetch

# 1. Manifest is authentically signed by the offline key.
ssh-keygen -Y verify -f "$SIGNERS" -I "$ID" -n "$NS" -s "$sg" < "$mf" >/dev/null 2>&1 || fail bad-signature

# 2. The fetched scheduled.md matches its hash in the verified manifest.
want=$(awk "\$2==\"factory/skills/scheduled.md\"{print \$1}" "$mf")
[ -n "$want" ] || fail no-skill-entry
if command -v shasum >/dev/null 2>&1; then got=$(shasum -a 256 "$sk" | cut -d" " -f1)
elif command -v sha256sum >/dev/null 2>&1; then got=$(sha256sum "$sk" | cut -d" " -f1)
else fail no-sha-tool; fi
[ "$want" = "$got" ] || fail sha-mismatch

# Verified — emit the authentic playbook for execution.
cat "$sk"
'
```

If the block exits non-zero (printing a `verification failed (...)` line), **stop** — log "alexandria: scheduled skill verification failed, skipping run" and exit. The next scheduled invocation will retry. Never execute unverified instructions.

If the block succeeds, its stdout **is** the authentic, signature-verified playbook — follow those instructions as the canonical run.
