# Product engineering plan — building the closed loop

> **Historical roadmap note — install transport superseded 2026-08-05.** The website no longer redirects any route to executable setup code. `/start` gives the user's coding agent a non-executable instruction to authenticate one exact GitHub commit and Touch ID fingerprint; later updates use the installed verifier.

**What we're building (a2 THE PURE PRODUCT):** the closed-loop product — the **gym** (individual: `mind.md` developed by the user's AI via the `alexandria.md` harness) + the **collective** (library of minds + marketplace of systems + kin/circle + identity), with the **mesh** wiring the two.

**Engineering principles (from the vehicle — these are architecture constraints):**
- **Own the files, rent the rest.** Own `mind.md` + `alexandria.md` (markdown on the user's machine). Rent the user's AI (intelligence), git/GitHub (storage/sync/signing/history/canon delivery), Cloudflare (the thin hub). Build only the missing piece.
- **Idiot-index→1.** Thin stateless server, near-zero opex, delete machinery the product doesn't need. Every dependency CLI/API-controllable.
- **The floor is server-less.** The free gym talks to nothing of ours — it rides GitHub (canon + payload) + git + the user's AI. The Cloudflare Worker is the hub backend only.
- **Ride the exponential.** Unstructured markdown, soft defaults, the model does the work. No hand-engineered pipelines, no schemas. Better model → more value, zero workflow change.

**Architecture mapped to code:**
- **Floor (gym):** `factory/` + the user's `~/alexandria/`. Free, no account, server-less.
- **Hub (collective):** `server/src/` (thin Worker) + `app/library/`. Opt-in account.
- **Mesh:** the call (`/call`, systems flywheel), the file (publish → Library, files flywheel), kin (`network.md`, inner ring).

---

## 1. The floor — the gym (the substrate everything sits on)
Full detail in `keyless-onboarding.md`. Work-list:
- `setup.sh` **key-optional** (the 10 enumerated touchpoints) → keyless = the free gym, no account, no server calls. (`payload.sh` already keyless-clean.)
- **First-install door:** `/start` is non-executable; `/a` is a retired 410 route.
- **Auto-draft on install** (setup.sh tail → agent reads `.block`, begins) + tune `block.md`/editor canon so the first session is a *light, sharp* conversation, not a 20-question intake.
- **Keyless public primer page** (slick copy-block + deep-link + copy-fallback; no kin code, no OAuth to view).
- **Delete billing** (see §4) — it's free.
- **Result:** the individual loop runs (capture → vault → extract → read `mind.md` → develop → write back → overnight autoloop). The gym *runtime* (hooks, capture/`vault`, the `/a` skill, the autoloop) is already built — §1 is mostly making the **install** keyless and wiring the existing runtime. Server-less, free.

## 2. The hub — the collective (built by engineering dependency)

**2a. The Library of minds — the neo-biography page.** Repurpose `app/library/[author]/page.tsx` + `client.tsx` into one **entity-centric, medium-agnostic, browse-free** page: Shadow (the twin, front-and-center) + Works (any medium) + Quizzes + latest Pulse; de-emphasise raw `.md`. Extend the `/library/{author}` response in `library.ts` to return all artifacts in one call.
- **Static-first, no hosted inference:** the "quizzable twin" is the *reader's own AI* processing a **pullable `shadow.md`** (canon: no author-side inference). Beautiful frontend (form is content); thin/static backend.
- Buildable now against existing accounts (dogfood with Benjamin's own page). ~400–600 lines, a repurpose.
- *Architecture flag (founder's call, when built): a more sovereign + lower-opex Library would **index** user-hosted public-git shadows rather than **host** copies in R2. Canon currently locks R2-hosting (freshness-defeats-piracy needs the live API).*

**2b. Keyless → hub connect (the account gate).** Signing in (OAuth — GitHub primary, email/Apple later) re-runs the one-liner *with* the key → writes `.api_key` into the existing keyless install, idempotent, no clobber. The post-OAuth page hands them the connect line. One-week-after-install nudge + a natural prompt when they reach for a hub action. This is the gate to publish / marketplace signal / kin.

**2c. Kin / the circle (the friend's-mind primitive).** Partly built: `payload.sh` does **network sync** (reads `~/alexandria/files/network.md`, fetches each connected Author's shadow → relational context). Missing: the **invite flow** (a link/code that lands a friend on the keyless install + connects you as kin). The **L3 shared-with-circle tier rides the existing visibility system** — `file-access.ts` already gates public/paid/invite; "invite" *is* shared-with-specific-people, so this is wiring, not a new sharing mechanism. So the only genuine build here is the invite flow → both AIs gain each other's circle-shared `mind.md`.

**2d. Marketplace of systems (keep the signal).** Keep the `/call` usage signal (already built, low-cost) — it ranks harness-learnings (the systems flywheel). The `/call` IS the closed-loop verification primitive (use → report → rank → canon back). Simplify only if a piece is genuinely heavy/unused (catalog/webhook), but keep the loop.

**2e. Identity / brand.** The neo-biography-as-identity + the tribe surfaces; mostly brand/website, light engineering.

## 3. The mesh — loop wiring (each loop must close)
- **call:** `/call` → survival rank → canon back. *(Built — 2d.)* The systems flywheel.
- **file:** publish `shadow.md` → Library → other AIs accrete. *(Publish = the file obligation, built. The Library read API, built. The human-browse surface = 2a. The AI-accrete side rides the existing read API + a canon instruction — "browse the Library for relevant shadows" — not new infra.)* The files flywheel.
- **kin:** invite → `network.md` → shared `mind.md` → relational context. *(Partly built — 2c.)* The inner ring.
- **continuous floor (already live, not a build):** the canon (`alexandria.md`) is served from GitHub and **re-fetched every session** (`payload.sh`), so improving the methodology raises every user's next-session floor automatically. The marketplace automates *which* improvements at scale.

## 4. Delete / thin — idiot-index→1
- **DELETE:** `billing.ts` + Stripe + checkout (free; future depth/B2B is a different shape — rev-split/pay-per-query — so nothing reusable is lost; it's in git history); user re-engagement nudges + followup sequences (`cron.ts`); drip email templates (`email.ts`); analytics dashboards (`analytics.ts`); the hash-chained audit mirror (`audit.ts`).
- **SAFETY GATE:** grep each module's call-paths before cutting — don't break the **autoloop** or anything Benjamin dogfoods (the morning brief + `library-signal.ts` stay).
- **KEEP (thin):** `protocol.ts`, `file-access.ts`, `library.ts`, `auth.ts`, `accounts.ts`, `kv`/`db`/`crypto`, the `/call` signal, the founder funnel signal.

## Sequencing (engineering dependencies)
1. **Floor (§1)** — the substrate; nothing else runs without it.
2. **Neo-biography page (§2a)** — buildable now against existing accounts.
3. **Keyless→hub connect (§2b)** — needed for new users to populate the hub.
4. **Kin invite (§2c)** — the remaining mesh build. (§2d marketplace is *retain, not build* — already running; just don't delete it.)
5. **Deletes (§4)** — parallel throughout (each is independent; billing-delete rides with §1 since free = no billing).

## Dogfood gate (quality)
Benjamin is user-zero. Each layer must be excellent *for him*: his gym (§1), his neo-biography page (§2a), his circle (§2c). Build what he actually uses; cut what he doesn't.

## Verification (ground truth, not proxies)
Each loop closes *observably*: keyless install runs clean (read full output, no errors, no regression on the keyed path); `/call` fires and the canon improves; a published shadow renders + another AI accretes it; an invited friend lands and both AIs gain the shared mind. "It builds" is the floor; the loop closing for a real user is the bar.
