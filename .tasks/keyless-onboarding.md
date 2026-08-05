# Keyless one-copy-paste onboarding — full plan

> **Historical plan — install transport superseded 2026-08-05.** `/a` no longer serves executable bytes. The official first install is the non-executable message at `/start`, which makes the user's existing coding agent authenticate one exact GitHub commit and the Touch ID key before running setup. Later updates use the installed verifier.

**Goal (founder, this session):** getting Alexandria = **copy one line → paste into your AI → it installs the free product and starts.** No sign-in, no key, nothing else. Sign-in is deferred to a later opt-in "join the Library" step.

**Why this is correct now (new ground truth, 2026-06-23):** the **product** (the gym) and the **protocol** (`mind.md`) are *free and need no account*; only the **Library hub** needs sign-in, and it's opt-in/later. So the front door needs no account. This is mostly *deleting* a requirement (the forced key), not adding anything.

## DECISIONS LOCKED (founder, 2026-06-24)
1. **Historical decision, now retired:** `/a` used to be the install one-liner. It now returns 410 so old executable commands fail closed; `/start` is the only official first-install door.
2. **Marketplace — CORE to the product, but defer the *machinery* (corrected 2026-06-24).** Earlier "deleted" was part of the over-strip — wrong. The marketplace *function* (everyone's harness-learnings aggregate → the floor under every individual continuously rises) is one half of the closed loop (the systems flywheel; a2 THE PURE PRODUCT). It is **not** cut from the product. What we defer is the heavy *ranking machinery* (`marketplace*.ts`, the `/call` usage-signal half) — because at movement scale there's no usage signal yet to rank. Keep it dormant/dead-code-removed now; rebuild it when there's a network generating signal. Concept = core; machinery = not-yet.
3. **The product is FREE.** Delete the billing machinery entirely (`billing.ts`, Stripe, checkout, patron/kin pricing). No payment anywhere in onboarding or the product. Monetise *depth* later (B2B opt-in shadows / pay-to-query) only if/when a network exists.
4. **Kin — drop the *pricing* mechanic, keep the *social* ring (corrected 2026-06-24).** Free makes "free with 5 kin" (the pricing lever) moot — remove the kin *code/referral-for-pricing* from the primer. But "kin" also means the **social inner ring** (your circle on Alexandria — the friend's-mind primitive, ring 1 of the collective; a2/a4). That stays — it's part of the collective loop, not pricing. Drop kin-as-price; keep kin-as-circle.
5. **Sign-up nudge = one week after install** (penciled): a gentle "join the Library" line ~7 days in, plus when they reach for a hub action. Mechanism = the deferred OAuth sign-in. Not built this session.
6. **`mind.md` auto-draft on install** (see § Onboarding flow / the first-principles rethink): install → light, delightful first draft → running. Not "install and do nothing."

*Note: the first-principles product rethink (2026-06-24, separate) may further collapse this — esp. that the **free product needs no Alexandria server at all** (it rides the user's AI + git + GitHub; the server is 100% the optional hub). This plan will consolidate around the pure product once that's aligned.*

## THE KEYLESS LINE (the rule that decides every "does this run keyless?" question — added post-optimise)

Keyless installs the **product + protocol**, never the **hub**. Apply this to every step:
- **YES keyless** (product + protocol — local, sovereign, free): the `~/alexandria/` files, the canon, the hooks, the `/a` skill, the local autoloop/scheduled task, the **private** backup repo (`alexandria-private` — the user's own data), `mind.md`, the constitution draft.
- **NO keyless** (hub — opt-in at sign-in): the account/key, billing, kin, Library publishing, the marketplace, the server `/call`·`/file`·`/feedback` POSTs (already key-gated in `payload.sh`), **and the public fork + auto-publish job** (it surfaces marginal contributions into the *marketplace* — a hub feature). The hooks already honour this line via `[ -n "$API_KEY" ]`; `setup.sh` must too.

## The end-to-end flow (happy path)

1. User lands on the website → sees **start**: one line to copy, plus a one-click "start in claude code" deep-link button.
2. Copies the line (or clicks the button) → `curl -fsSL <url> | bash` (NO key) lands in their agent.
3. Agent runs it → `setup.sh` runs **keyless**.
4. `setup.sh` installs the **free product**: `~/alexandria/` structure, factory canon (public GitHub), hooks (shim+payload), `/a` skill, git init + genesis (gh-gated private-repo backup if gh authed), iCloud input pipe. No key written. Clean, non-error messaging.
5. Final message instructs the agent to **continue into the constitution draft** (read `~/alexandria/system/.block`, announce + start) — same agent-continue as today's keyed path.
6. Agent drafts the constitution on the user's own AI → the gym is running → user is "in."
7. Every session after: hooks run keyless — canon injected (local), git sync, local author-context; all server calls skipped. Clean.
8. **(Later, opt-in — NOT built this session)** a gentle "join the Library" nudge → sign in (OAuth) → key written into the existing install → server features turn on.

## Ground truth verified this session (don't re-verify)

- **`payload.sh` is already keyless-clean.** Every server call is guarded by `[ -n "$API_KEY" ]` (lines 185, 436, 693). Keyless session-start/end run canon + git + local context with zero server calls. **No hook changes needed.**
- **`setup.sh` hard-errors without a key** (L37-41) and has 8 key-touchpoints (enumerated below). This is the core change.
- **Landing CTA** is "join the tribe → `/signup`" (OAuth-first, L613). Needs to lead with **start** (keyless) instead; sign-in demoted to secondary.
- No `/go` or `/start` route exists.
- `setup.sh` is in `factory/` but is NOT `payload.sh` or `canon/*.md`, so it ships via normal `push.sh`, **not** `ship.sh` (not signature-gated). Confirmed.

## The changes

### A. `setup.sh` — make key-optional (the core, the only must-have)
Three input cases, made explicit at the top:
- key passed as `$1` → keyed install (existing).
- no key passed BUT `~/alexandria/system/.api_key` exists → reuse it (existing reinstall).
- **no key + no local key → KEYLESS install (NEW).** Set `KEYLESS=true`, proceed.

Per-touchpoint behaviour (line refs are current):
1. **L37-41 (hard error):** replace with the keyless branch — `KEYLESS=true`, print *"Setting up Alexandria — free, local, no account needed."*, continue. (Do not exit.)
2. **L43-47 (`alex_*` format check):** wrap in `[ -n "$API_KEY" ]` — validate only when a key is present.
3. **L66-67 (write `.api_key`):** wrap in `[ -n "$API_KEY" ]`. Keyless ⇒ no `.api_key` file (exactly what keyless hooks expect — the canonical "no account" signal; do NOT add a redundant marker file).
4. **L496-502 (`KEY_STATUS` HTTP probe):** skip when keyless; set `KEY_STATUS="none"`.
5. **L555-560 (status-matrix key row):** add a `none` case → label row **"account"** with detail *"none — running free; sign in later to join the Library"* and a neutral `·`/skip icon. **Never show "api key: FAIL" keyless.**
6. **L681-682, 687 (setup report):** keyless ⇒ `SETUP_STATUS` stays `ok` (not `auth_rejected`/`server_unreachable`); `key_status: none`.
7. **L700, 755, 776 (report line + matrix count + row):** count "account: none" as skip, not fail; show it informationally.
8. **L710-718 (setup-report POST):** skip when keyless (needs key). *(Telemetry — see Open Questions.)*
9. **L786-794 (final tail):** add a keyless branch → keyless success line + the **agent-continue instruction** (read `.block`, announce, begin — reuse the existing tail) + one line: *"Sign in later to join the Library and back up: <url>."*
10. **L357-474 (public fork + auto-publish launchd/cron):** **skip when keyless** — this is hub/marketplace machinery (it auto-publishes the user's additions into the marketplace and creates a *public* `github.com/<user>/alexandria` fork). Don't fire it for someone just trying the product; it's a surprising public side-effect and a hub opt-in. Gate the whole block on `[ -n "$API_KEY" ]` (or `[ "$KEYLESS" != true ]`). **Keep** the *private* backup repo (`alexandria-private`, the genesis/signing block ~L246-355) keyless — that's the user's own data, the protocol layer, not the hub.

### B. Website front door — lead with "start" (keyless)
- `app/components/LandingPage.tsx`: primary CTA becomes **start** — copies the keyless one-liner + the "start in claude code" deep-link button + a small "or copy the command" fallback (Cursor/Codex/Factory). Demote "join the tribe / sign in" to the secondary slot (it's the opt-in hub now).
- The deep-link `q` content = the keyless `curl … | bash` + "follow its final instruction" (same shape as the button already built this session, minus the key).
- Keep it on-brand and calm — the start action is a clean line, not a jarring code dump (form is content; Taste.md / design.md).
- Keep `/signup` (OAuth) alive as the secondary "join the Library" path.

### C. `/go` short URL — *optional polish, deferrable*
A redirect so the one-liner reads `curl -fsSL alexandria-library.com/go | bash` instead of the long raw-GitHub URL. Apex (`alexandria-library.com`) is cleanest → a Vercel redirect to the raw `setup.sh`. `curl -fsSL` follows redirects. **Not required for the flow to work** — the long URL works today. Build only if it's cheap; otherwise defer.

### D. Deferred "join the Library" (sign-in) — ensure compatible, don't build the nudge
- **Upgrade-compatibility is a hard requirement:** a keyless install must accept a later sign-in cleanly. When a keyless user signs in (OAuth → key), they re-run `curl … | bash -s -- KEY` (or a future `connect`); `setup.sh` is idempotent (seed-if-missing) and just writes `.api_key`, turning on server features without clobbering local files. **Verify this explicitly** (no reinstall damage).
- The post-OAuth callback page should hand a keyless user the **connect** command, not a fresh-install pitch (the existing returning-user path likely covers it — verify).
- The nudge mechanism itself is a **fast-follow, not this session**. The install message already tells them the path exists.

### E. Edge cases ("works perfectly the first time")
- Keyless session-start/end produce **zero** server-call errors (verified by the payload guards — confirm by running one).
- The **scheduled task / autoloop** keyless: local processing runs; any `/brief` relay is key-gated and skips. Verify it doesn't error keyless.
- `gh` not authed → local git only, no private repo; keyless still fully works.
- No coding agent present → files still install; the user runs `/a` when they open an agent. (Truly agent-less = the iCloud-shortcut path, separate.)
- Website opened on a phone → deep-link won't open a desktop agent; show "come back on your laptop" / the shortcut. Note, not a blocker.
- Reinstall idempotency: keyless re-run is safe (seed-if-missing).
- Security: `curl|bash` unchanged — payload is still signature-verified; keyless adds no attack surface.
- **Referral capture (note, fast-follow — don't build now):** the `?ref=`/kin referral is captured only at OAuth today, so a keyless install via a friend's link loses the referral until/unless they sign in. The kin mechanic is hub-layer (deferred), so this is acceptable now; a clean later fix is to write the ref locally at keyless install and replay it at sign-in. Flag, don't solve this session.

### F. Verification plan (ground-truth, not proxies)
1. `bash -n factory/setup.sh` — syntax.
2. **Keyless install in a temp HOME:** `HOME=$tmp bash factory/setup.sh` (no key). **Read the full output** and confirm: `~/alexandria/` created; canon + hooks + `/a` skill present; `.api_key` **absent**; status matrix shows **"account: none"** (not fail); **no public fork / auto-publish job created** (the keyless line held); exit 0; final message = agent-continue + sign-in-later. (Functional, not just exit code.)
3. **Keyless session-start:** run `shim.sh session-start` against that temp HOME → confirm canon injected, no server-call errors, clean output.
4. **No regression on the keyed path:** `HOME=$tmp bash setup.sh alex_test…` → confirm unchanged.
5. **Sign-in-later compatibility:** keyless install, then re-run with a key → confirm `.api_key` written, local files intact, server features would activate.
6. **Website:** render the landing "start" + deep-link + copy fallback; visual check (`scripts/see.mjs`).
7. **Build:** `cd server && npm run build` (only if `/go` added); website build.
8. **Ground-truth smoke (founder-fired):** real keyless install on a clean machine → copy-paste → free product runs → constitution drafts.

## Open questions (founder calls)
1. **Telemetry for keyless installs:** skip entirely (idiot-index→1, no metrics anxiety) or an anonymous install ping (awareness installs happen, no PII)? **Lean skip** this session.
2. **`/go` short URL:** build the apex redirect now or defer (long URL works today)? **Lean defer** unless trivially cheap.
3. **Landing "start" prominence:** how much the start action leads vs the pitch — a taste call on the landing page. **Lean:** start is the primary action; pitch stays.

## Sequencing & gate
1. `setup.sh` key-optional (A) — the must-have.
2. Website front door (B).
3. Verify (F) end-to-end keyless + no-regression + sign-in-later.
4. Optional: `/go` (C).
**Armed, not fired:** build on a branch; deploy (Vercel + Worker) and the live smoke test are founder-fired. `setup.sh` ships via `push.sh` (not signature-gated).
