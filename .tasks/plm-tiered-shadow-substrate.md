# PLM — tiered-shadow substrate (the structural privacy fix)

**Status:** executing 2026-07-06. Ship-gate item from `~/alexandria-inc/private/plm.md § STRUCTURAL SECURITY MODEL` (invariant 2 — per-tier substrate; invariant 4 — no ground truth in the twin).

## The decision (founder, 2026-07-06)
The context/deep twin must run on a **derivative** of ground truth, never ground truth itself. The derivative is a **structurally separate item** — and it already exists: the **shadow** (`~/alexandria/files/library/<tier>/shadow.md`). The `constitution_digest.md` the twin loaded was a *second, parallel* derivative doing the same job — collapse the two into one. How close a tier's shadow sits to ground truth is a per-tier dial = the content of that tier's `shadow.md`, which the founder edits.

## Structural guarantee
The raw constitution is never loaded into the twin. So no prompt-injection can extract more than what the tier's shadow contains — the shadow is a **hard ceiling**. Tier is set by the Worker (`cfg.visibility`), never the caller. Fail closed to `public` on any unknown/missing tier.

## Tier → substrate (sidecar `_deep_system`)
- `public`  → `public/shadow.md`  + `voice_lite.md`
- `paid`    → `public/shadow.md` + `paid/shadow.md` + `voice_exemplars.md`
- `authors` → `authors/shadow.md` + `voice_exemplars.md`
- `invite`  → `authors/shadow.md` + `invite/shadow.md` + `voice_exemplars.md`
- unknown   → base identity + anti-inject guard only (no substrate)

Never loads `constitution_digest.md`. Reads LIVE `shadow.md` only, never `_shadow.md` drafts.

## Changes
1. **Content** — `library/invite/shadow.md` seeded from the digest (richest tier, founder to review = the dial); promote `public/_shadow.md` → `public/shadow.md` (public-safe, needed for the public tier to function).
2. **Sidecar** (`private/plm/twin_server.py`) — `_deep_system(tier)` resolves the tier map above; both call sites (`agent_answer`, `agent_stream`) pass `payload.get("tier") or "public"`; retire the digest/voice constants; add an owner-preview tier switch to the deep-twin UI.
3. **Worker** (`public/code/server/src/twin.ts`) — `TwinInferenceRequest.tier`; `body.tier` for the context variant. (`library.ts`) — pass `tier: cfg.visibility` at the `/ask` call site.
4. **Canon** — `plm.md`: consolidate (twin substrate = tiered shadow; ceiling guarantee; the dial); update the deploy runbook.

## Test (localhost:8899)
- invite tier → rich, in-voice; injection embedded in `focus` cannot exceed the shadow.
- public tier → thin (public shadow only); cannot reveal invite/authors content.
- confirm `constitution_digest.md` is no longer read.

## Deploy / promote = founder-only
Nothing deployed. `invite/shadow.md` written live for the localhost demo (invite is gated; nothing is public) but flagged for founder review — edit to taste, revert via git.
