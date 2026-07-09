# Twin structural build-out — make it perfect + ship as a marketplace module

Goal: every Alexandrian runs their own **structural** twin as an installable module.
Mind on their device; *who* gets access decided by the author's key (not our code);
gated library documents locked by crypto (not our code).

**Trust axiom (non-negotiable, design FROM it not toward it):** trust = the author's
device (Apple) + named companies (Anthropic inference, GitHub code). Assume our own
code + infra ARE hacked. Structural = enforced by crypto / where-the-data-physically-
lives, never by our-code-robustness (degree). Refs: `~/alexandria/files/core/feedback.md`
(2026-07-07 "design FROM the axiom"), `~/alexandria-inc/private/plm.md` ("SETTLED
structural security model").

Where things stand (2026-07-07): twin is LIVE on the current sidecar + cloudflared
named tunnel (bearer-locked). Mind-on-device is already structural. The rest below is
**deliberately deferred** — correct work, but premature until the triggers below fire.
Do the phases in order. **Do NOT rush phases 2 & 3 — rushed crypto is a fake structural
guarantee. Test the forge/compromise cases before shipping either.**

---

## TRIGGERS — when to build each (so NEITHER the founder NOR the agent has to remember)

These are **observable conditions**, not dates. Each fires exactly when the relevant work
is already happening — so nobody has to remember a schedule. Discovery path: `plm.md`'s
SETTLED-security entry points here; any session touching the twin / library / marketplace
reads it and checks: *has a trigger fired?* If yes → build that phase from the spec below.
If NO trigger has fired, the current state is correct — **do not build** (this line exists
to stop a future agent over-building again, which was the 2026-07-07 failure).

**The founder does NOT need to track any of this.** When the condition is real, the founder
(or an agent) is necessarily working in that area, and this file surfaces the trigger.
The agent decides "is it time"; the founder just says yes when asked, or the trigger is
obvious enough to act on directly.

- **Phase 1 (smooth module) — build when ANY of:**
  1. A second person (any author besides the founder) wants to run a twin → packaging is now for a real user, not hypothetical.
  2. The founder's own twin goes offline / the tunnel breaks costing real time a **SECOND** time → recurring fragility = fix it structurally ("recurring problems demand permanent solutions").
  3. The founder decides to actively push the twin to authors as a product.
- **Phase 2 (capability-passes) — build when ANY of** (prereq: Phase 1 done — passes must verify on the device):
  1. The founder or any author puts genuinely sensitive content in the INVITE/deep tier AND cares that "our code decides who gets in" (the gap stops being hypothetical).
  2. A second author with sensitive deep content onboards.
  3. Right before any moment where a leaked deep *answer* would actually matter — a real, named person you'd be upset leaked to.
- **Phase 3 (encrypted library) — build when ANY of** (prereq: Phases 1 + 2 done):
  1. Multiple authors publish GATED (non-public) documents that must be always-on → at-rest secrecy of real gated content is now a real need.
  2. A specific author / customer / investor explicitly requires "even Alexandria can't read my gated content."

**Until a trigger fires:** the twin is live and safe (mind-on-device is structural today);
these phases make it structural *for everyone, on every tier* — a scaling need, not a
safety need. Ship to users; let real demand fire the triggers.

---

## Phase 1 — Smooth device-twin module (NO crypto; removes the tunnel pain) — do first
**Problem:** current per-author serving = sidecar + cloudflared named tunnel + Worker
registration. Rough (install cloudflared, run the tunnel setup, offline-flapping, the
Cloudflare Access mess). Not shippable to a normal author.
**Build — the OUTBOUND model.** The author's device dials OUT to the Alexandria Worker
and holds a persistent connection; the Worker hands queries down it; the device answers
locally (substrate + the author's Anthropic key stay on device) and returns the answer up.
- Mechanism: a per-author Cloudflare **Durable Object** holds a WebSocket from the device
  (or long-poll fallback). `/library/:author/ask` routes to that DO, which relays to the
  device and awaits the answer.
- Rewrite `twin_server.py` as an **outbound client**: connect out, authenticate with the
  author's own Alexandria API key (outbound — the easy direction), receive jobs, answer,
  return. No inbound listener.
  - **Carry over the `/guide` route (added 2026-07-07).** `twin_server.py` now also serves
    an isolated `POST /guide` — the public homepage "ask Alexandria" company FAQ (reads only
    `alexandria_guide.md`, no substrate; Worker `POST /ask` relays to it). It's public-tier
    ("public = plaintext, no gate" in the settled model), so it needs no crypto — but the
    outbound rewrite must not drop it: keep the company guide answerable (as a company job
    over the founder's outbound connection, or a tiny always-on company relay). Frontend
    (the reader's ask via `PublicDocReader` → `/api/ask`) and Worker `/ask` are architecture-agnostic and stay.
- **Deletes entirely:** cloudflared, the public tunnel, Cloudflare Access, the inbound
  bearer, `validateSidecarUrl`/SSRF guard, `twinOnline` health-polling + 30s cache, URL
  drift, sidecar registration. "Online" becomes "is the connection open" — instant, certain.
- Package as a factory module: `factory/canon/twin.md` + an install skill; one command
  installs the client + starts it. List it on the marketplace so any Alexandrian can add it.
**Verify (product = ground truth):** twin answers across device sleep→wake with no
re-registration; a port scan of the device shows NO inbound listener; cloudflared fully
uninstalled and the tunnel/Access deleted, twin still works.

## Phase 2 — Capability-pass structural tiering (bounded crypto) — makes ACCESS structural
**Problem:** today the Worker (our code) decides who gets which tier. Structural on the
mind, but the tier-decision leans on our code (bounded residual: worst case a leaked deep
*answer*, never the mind).
**Build:** the author's device holds an **Ed25519 signing key** (in the Apple keychain).
Access = a signed capability pass `{authorId, tier, holder, expiry, nonce}` signed by the
author's key. The querier presents the pass; the Worker just *forwards* it; the author's
**device verifies** the signature + expiry + a local revocation list and sets the tier
**from the pass** — our code no longer decides. The Worker can't forge one (no private key).
- "Invite" becomes *minting a pass for a person* — this REPLACES the DB invite codes (the
  "random code we generated that any mythos-10 person beats"). Kill the code path.
- Revocation = a local list on the device + (optional) short expiries.
**Verify:** a forged/edited pass is rejected; an expired pass is rejected; **simulate a
fully-hacked Worker** sending `tier:"invite"` with no valid pass → the device must serve
only `public`. That test passing IS the structural guarantee.

## Phase 3 — Encrypted always-on library (the big one) — makes gated DOCUMENTS structural
**Problem:** gated static docs (invite/paid/authors) sit on our servers, gated by our
(now-hardened) code = degree. An always-on library needs them on our servers, so the only
structural answer is encryption.
**Build — E2E encryption.** Content stored **encrypted at rest** on R2 (we hold ciphertext
we can't read). Every user has a device keypair (Apple keychain, auto-generated, synced).
The author's device **wraps each tier's content key to an authorized reader's public key**
(a key-grant); the reader's device decrypts. Our servers = a dumb ciphertext + public-key +
key-grant store. An "invite" = a key wrapped for one device, un-forgeable by us.
- **Public** = plaintext, no gate. **Invite** (personal) = encrypt first, the tier that
  matters. **Paid** = worst case is a lost sale, not a leaked mind; and since we mediate
  payment it can't be fully structural against us — secrecy is structural, access-integrity
  is commercial. **Authors/members** = group key, re-key on membership change — hardest +
  least sensitive → last.
- **THE make-or-break: key recovery.** Lost device = lost access is what kills E2EE
  products. Ride Apple keychain custody. **Design this FIRST**, above the group-key work.
- Honest residuals to state, not hide: metadata (who reads/queries what, when) is visible
  to our infra; encrypted content is not server-searchable (gated discovery limited to
  metadata; public stays searchable).
**Verify:** simulate full infra compromise → gated content is unreadable; only public +
ciphertext + metadata exposed. Test a reader losing + recovering their device.

---

## Order + why
1 first (unblocks every author, no crypto, deletes today's whole pain class). 2 next
(bounded crypto → the twin becomes fully structural end-to-end). 3 last (biggest, must be
deliberate). Each phase ships + is verified before the next. The crown jewel (raw mind) is
already structural today; none of this is required for the twin to be *safe* — it's
required for it to be *structural for everyone, on every tier.*
