# Alexandria

Greek philosophy infrastructure. Rides the user's existing ai. Does not run its own models or store user data.

Founder: Benjamin Mowinckel. Solo founder + ai agents. Relocating to SF April 2026.

**Canonical surfaces:** `https://alexandria-library.com` (website, Vercel) and `https://api.alexandria-library.com` (API, Cloudflare Worker — protocol, OAuth, billing, Library, cron). `mowinckel.ai` + `www.mowinckel.ai` 308-redirect to the canonical apex. `api.mowinckel.ai` stays bound to the same Worker so legacy CLI/skill installs that cached the old URL keep working; treat it as deprecated. `mcp.mowinckel.ai` is the older alias on the same retire path. Override only via `SERVER_URL` / `NEXT_PUBLIC_SERVER_URL` when intentional.

## Architecture — Two Things, Four Code Layers

The product is **two felt things**, not a protocol. (1) **What we give you** — a free, sovereign tool running on your own files, plus the methodology (the gear). Real value the day you start; it can never be taken back. (2) **The collective** — the library, the marketplace, and the tribe: the owned hub where Alexandrians are seen and connect, the one thing being built and where the moat lives. **Sovereignty** is the *principle* that runs through the first thing (plain files, yours, portable, leave anytime) — a promise, not a technical standard. There is no "protocol" in the story; "protocol" survives only as the **internal code name** for the publish/call/library plumbing below.

The code maps to four layers:

1. **The collective plumbing** (`server/src/protocol.ts` + `auth.ts` + `kv.ts` + `crypto.ts` + `db.ts` + `file-access.ts` + `marketplace-catalog.ts` + `marketplace.ts` + `audit.ts`) — the incompressible core that makes the library/marketplace/tribe work. 7 endpoints, ~1700 lines including the visibility gate (`file-access.ts`), the module catalog (`marketplace-catalog.ts`), the Author-feedback substrate (`marketplace.ts`), and the tamper-evident access audit (`audit.ts`). Three obligations: account (membership), file (publish monthly), call (communicate). Internally still named `protocol.ts` — a code label for the plumbing, never the public framing.

2. **Factory** (`factory/`) — The founder's system, public on GitHub, forkable. ~48 files: **canon** (10 modules in two tiers — Foundation: `foundation.md` (universal); Founder: `axioms·methodology·editor·mercury·publisher·library·filter·bookshelf` (his default, personalisable) — plus `MODULES.md` index), **hooks** (shim + payload), **setup.sh**, **ship.sh** + signed **manifest.txt**, **skills** (claudecode, codex, cursor, droid, scheduled, install, publish, brief-setup, nudge, …), **systems/** (Author-0 modules, e.g. state-based-sync), **scripts/**, **templates/**, onboarding block. This is the gear — shipped default-on but deletable, forkable, replaceable. The marketplace evolves canon defaults from cross-Author signal. Canon + payload + skills are signature-gated (`ship.sh` re-signs `manifest.txt`).

3. **Machine** (`~/alexandria/`) — Each Author's personal system. Constitution, vault, marginalia, machine.md, notepad, feedback. Lives locally, never on the server — the sovereign tool running on the Author's own files. The product IS this folder. Alexandria stores what Authors publish, never what they think.

4. **Company** (`server/src/` everything else + `app/`) — Operational overhead. OAuth, billing, email, analytics, cron, Library CRUD, admin endpoints. This layer should shrink over time.

## Code

- **Website:** `app/` (Next.js, Vercel). Landing page: `app/components/LandingPage.tsx`.
- **Server:** `server/src/` (Hono, Cloudflare Workers). One file per concern:
  - `worker.ts` (entry + middleware), `protocol.ts` (the collective plumbing — file, call, library, marketplace; "protocol" is the internal code name), `routes.ts` (company HTTP handlers), `auth.ts` (accounts + API keys), `accounts.ts` (account management + admin), `email.ts` (Resend + all templates), `cron.ts` (health digest + followup + engagement), `analytics.ts` (event log + dashboard), `billing.ts` (Stripe), `library.ts` (Library CRUD), `kv.ts` (KV persistence), `templates.ts` (HTML), `cors.ts` (CORS), `crypto.ts` (encryption), `db.ts` (D1/R2 accessor), `file-access.ts` (visibility gate — the only path that reads protocol/shadow/work bytes from R2), `marketplace-catalog.ts` (GitHub module catalog + push-webhook cache busting), `marketplace.ts` (Author-feedback substrate, writes to private GitHub repo), `audit.ts` (tamper-evident access audit mirrored to a hash-chained GitHub repo), `library-signal.ts` (daily funnel/engagement snapshot consumed by the founder), `time.ts` (PT formatter).
  - Stateless server. No private user data stored. KV for accounts/events, D1 for Library metadata + protocol data, R2 for published content.
- **Factory:** `factory/` — public, forkable. Canon methodology, hooks, skills, templates, setup, onboarding block.
- **Static assets:** `public/` (includes `public/docs/` for public artifacts).
- **In-flight task plans:** `.tasks/<task-name>.md`. Each plan is self-contained (any agent in any tool reads it cold and can execute), references this `AGENTS.md` for architecture, and is deleted (or moved to `.tasks/done/`) when the task ships. Use this for cross-session task hand-off — plans are for the next thing to do; durable signal routes to canon, never agent memory (canon-not-memory policy, `~/alexandria/files/core/agent.md`).
- **Investor docs:** kept out of this public repo. Live in `~/alexandria-inc/private/partners/` (private GitHub `alexandria-inc`). Shared directly with partners (email/DM) when needed — no public URL, no `/partners/` route.
- **Pre-commit hook:** `scripts/pre-commit` gates server type check + app build (mirrors CI). Activate on fresh clone: `git config core.hooksPath scripts`.
- **Build:** `cd server && npx wrangler deploy --dry-run --outdir=dist` (server). **Deploy:** `cd server && npx wrangler deploy` then check health. **Push:** `bash scripts/push.sh` (pushes + waits for CI + reports results). Always use `push.sh` instead of raw `git push` — **except** when the diff touches `factory/hooks/payload.sh` or any `factory/canon/*.md`: those are signature-gated, so use `bash factory/ship.sh "msg"` (re-signs `factory/manifest.txt`, then pushes). Skipping ship for canon/hook changes leaves the manifest out of sync, breaks payload signature verification for every Author, and silently freezes them on the cached payload.
- **Parallel-session git discipline — this repo usually has more than one live session.** Never `git add -A` / `git add .` (it sweeps other tabs' staged or untracked WIP — casting PNGs, working assets — into your commit); stage explicit paths only. Expect the index and HEAD to move under you mid-task: another tab's commit can sweep your staged files in, or a reset can sweep them out — so after committing, verify the commit contains exactly your diff (`git show --stat HEAD`) before deploying or pushing, and re-check `git status` just before `wrangler deploy` (the working tree is what ships). Both failure directions happened 2026-07-09.
- **Split-deploy trap — commit BEFORE you ship, and verify against production, not the working tree.** The two surfaces ship from different sources: `wrangler deploy` bundles the **working tree** (uncommitted edits go live on the Worker), while the **website** ships only from **committed `main`** via `git push`→Vercel — and `push.sh` pushes *commits*, not working-tree edits. So an uncommitted change can go live on the Worker (making the fix *look* deployed) while the website silently ships nothing. Sequence: **commit first**, then `push.sh` (website) and `wrangler deploy` (server) — never tell anyone "shipped" off a working-tree edit. A frontend/API change isn't done until `curl`ing the live URL (not `localhost`, not the diff) shows the new behavior. This exact gap shipped a "fixed" sign-in that was still broken in prod (2026-07-07).
- **Server health:** `curl https://api.alexandria-library.com/health`
- **Stack:** Vercel (website), Cloudflare (DNS + server + KV + D1 + R2), Resend (email), GitHub (code + OAuth), Stripe (billing), Mercury (banking, API), Claude (intelligence). All hybrid (CLI or API-controllable). Zero external dependencies.
- **Storage architecture:** Stateless server, sovereign local files (`~/alexandria/` — local + private GitHub; `iCloud/alexandria/` is Apple-native input only), thin persistence for collective Library (D1 for metadata/discovery, R2 for published content, KV for accounts/events).

### Protocol Endpoints

Seven endpoints. The collective's plumbing — internally named "protocol" in code (`protocol.ts`); never the public framing:

| Method | Path | Purpose |
|--------|------|---------|
| PUT | `/file/{name}` | Publish a file (the file obligation) |
| GET | `/library` | Browse all published files |
| GET | `/library/{id}` | List one Author's files |
| GET | `/library/{id}/{name}` | Read a specific file |
| POST | `/call` | Report module usage (the call obligation) |
| GET | `/marketplace` | Browse module usage |
| GET | `/marketplace/{module}` | Read usage for one module |

### Company Endpoints

Operational overhead — OAuth, billing, email, admin:

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/alexandria` | Protocol handshake (unauthenticated: spec; authenticated: status) |
| GET | `/auth/github` | OAuth initiation |
| GET | `/auth/github/callback` | OAuth callback |
| GET | `/account` | Billing portal redirect |
| DELETE | `/account` | Account deletion (GDPR-ready) |
| POST | `/brief` | Morning brief (autoloop trigger) |
| POST | `/feedback` | Author-explicit feedback (typed into `~/alexandria/system/.session_feedback`, posted at session end, stored in private `mowinckelb/alexandria-feedback` GitHub repo) |
| GET/GET | `/email/less`, `/email/stop` | Email preferences |
| GET/GET | `/brief/less`, `/brief/stop` | Brief preferences |
| POST | `/admin/nudge` | Nudge uninstalled users (admin) |
| POST | `/admin/email` | Send email (admin) |

### Factory Structure

```
factory/
  block.md                  # Onboarding block instructions
  setup.sh                  # Setup script (curl → install)
  ship.sh                   # Sign + commit + push factory changes (re-signs manifest.txt)
  manifest.txt              # Signed sha256 manifest the shim verifies (canon + payload + skills)
  canon/                    # The canon — two tiers (see MODULES.md)
    MODULES.md              # Index: Foundation (universal) vs Founder (his default)
    foundation.md           # Foundation — the universal closed loop + invariants
    axioms.md               # Founder — the thesis (the why)
    methodology.md          # Founder — the craft (the how)
    editor.md  mercury.md  publisher.md   # Founder — the three functions (extract/amplify/create)
    library.md  filter.md   # Founder — Library surface + publishing conventions
    bookshelf.md            # Founder — reference shelf
  hooks/
    shim.sh                 # Immutable local shim
    payload.sh              # GitHub-delivered hook logic (signed)
  skills/                   # claudecode · codex · cursor · droid · scheduled(-bootstrap) · install · publish · brief-setup · nudge · factory
  systems/                  # Author-0 modules pulled from the marketplace (e.g. state-based-sync)
  scripts/                  # brief.py · install.sh · publish(-fork).sh · verify-fetch.sh
  templates/                # agent · machine · notepad · feedback · module · constitution/ · marginalia/ · vault/ · library/
```

## Visual Workflow

**See before shipping.** For any frontend work, use `scripts/see.mjs` (Playwright) to screenshot and visually verify. Read the PNGs with the Read tool — you are multimodal.

- **Screenshot any URL:** `node scripts/see.mjs <url> [--full] [--dark] [--only desktop|tablet|mobile]`
- **Local dev:** `node scripts/see.mjs localhost --port 3000`
- **Design reference:** `~/alexandria/files/core/design.md` — craft substrate (900 lines of concrete CSS physics, anti-patterns, thresholds). Read before any frontend work. Not taste — that's `~/alexandria/files/constitution/Taste.md`.
- Screenshots save to `.see/` at repo root (gitignored), auto-cleaned to last 30.
- **Loop:** build → screenshot → evaluate against design.md → fix → screenshot → ship.

## Style

- "ai" is always lowercase unless at the start of a sentence or in a proper noun (e.g. "Apple Intelligence"). This is a brand and taste decision.

## Design Constraints

- **Pure marginal value add.** Alexandria must never override, compete with, or degrade the user's existing workflows, memory, or tools. Passive mode is read-only context + optional marginalia writes. Active mode (/a) is opt-in. The user's existing system is the floor — Alexandria only adds.
- **All .md files maximise total net signal for the model.** This is THE governing principle for every file an agent reads. Everything downstream is capped at file fidelity. Self-contained (0 to 100 with zero prior context). Max signal, not min length. But net, not gross (overwhelm the model and total received signal drops). Never compress signal. Only delete noise or true redundancy.
- **Data and intent, not intelligence.** Alexandria ships data (the Author's files) and intent (axioms, philosophy, developmental objective). Never intelligence. The host LLM IS the intelligence. Every structure must be optimizable by the model — unstructured markdown, no schemas, no prescribed formats. When models improve, the same data yields more. Zero workflow changes.
- **Bitter lesson:** general methods leveraging computation beat hand-engineered solutions. No structured parameters, fixed schemas, or hand-crafted rules. Unstructured text/JSONL. Let the model figure it out.
- **Philosophy IS the objective:** no numerical loss function or optimization target. Metrics are verification, not goals.
- **Build as little as possible.** Ride existing infrastructure. Server is intent layer, not intelligence layer.
- **Live the philosophy.** Every artifact — factory canon, investor docs, code, brand — must visibly carry the human edge Alexandria claims is the tiebreaker. The test: could a competing team write the same thing from first principles? If yes, it has failed. Generic = interchangeable = dead.

## Session Close

Two triggers, two protocols. Clean separation.

### "a." — Alexandria session close (product behavior)

Triggered by: "a." at the end of an /a session or any session where constitutional signal surfaced.

This is the product. Act as a normal Machine would for any Author — this IS the product test:

- **Constitution.** Write any crystallised signal about the founder as a person to `~/alexandria/files/constitution/`. Opinions, stories, patterns, contradictions revealed this session.
- **Machine.md.** Rewrite `~/alexandria/files/core/machine.md` — how to work with this Author, what worked, what didn't, cognitive style observations.
- **Notepad.** Update `~/alexandria/files/core/notepad.md` — parked questions, accretion candidates, what to carry forward.
- **Feedback.** Append to `~/alexandria/files/core/feedback.md` — what worked, what didn't, methodology observations. (This stays local — the Engine never auto-sends. If the Author wants to push feedback to the marketplace, they type it into `~/alexandria/system/.session_feedback` themselves.)

Do this silently. No report. This is the product working. If Phase 1 feels wrong, the product is wrong.

### "close" / "end" — Work session close (founder/company)

Triggered by: "close", "end", or any sign-off that is NOT "a." — used for coding sessions, company work, non-/a sessions.

No Machine loop. No constitution writes. This is company work, not product:

- **Delta.** What changed about Alexandria the company. Not what you did — what's different now. Hazy fragments only.
- **Open threads.** What's unresolved. What the next session should pick up. Ordered by priority.
- **Meta loop.** Product learnings → factory canon (`factory/canon/methodology.md`).
- **Founder loop.** Route how-to-work-with-the-founder signal (communication patterns, preferences, anti-patterns) to `~/alexandria/files/core/machine.md` / `feedback.md` — canon, never agent memory.

**Principles (both protocols):**
- Hazy fragments scale. Weeds do not. Keep it compressed.
- Signal, not summary. Don't restate what the founder already saw — extract what compounds.
- If nothing happened in a loop, skip it. No empty sections.
- The whole output should take <60 seconds to read.

## Code Quality — Server

Before committing any server code change:

1. **Correctness:** Trace the full execution path, not just the changed function. Check all callers of anything modified.
2. **Build:** Run `npm run build` in server/. Must pass.
3. **Test:** Run `npm test` if tests exist. Check the e2e test (`server/test/e2e.ts`).
4. **No regressions:** Review recent commits for anything the change might break.
5. **Bitter lesson compliance:** No structured parameters, fixed schemas, or hand-crafted rules. Unstructured text/JSONL. Soft defaults that thin as models improve.
6. **Statelessness:** Server stores nothing user-specific in plaintext. Account blobs are AES-256-GCM encrypted in KV; the API key is never stored, only its SHA-256 hash, indexed for O(1) auth. There is no refresh token — rotation requires a fresh OAuth round-trip.
7. **Deployment:** After deploying (`cd server && npx wrangler deploy`), check health: `curl https://api.alexandria-library.com/health`.

## Working With the Founder

See `~/alexandria/files/core/agent.md` for principles, communication style, Three-Phase Execution, and Reflect Gate (loaded globally in every session).

Three-way split — keep them separate:

- **This repo** (`~/alexandria-inc/public/code/` → public GitHub `alexandria`) — product source code. Intentionally open. No secrets (use env vars).
- **User vault** (`~/alexandria/` → private GitHub `alexandria-private`) — founder-as-user-0 content: agora, marginalia, constitution, notepad, personal writing, session captures. Every future user will have a `~/alexandria/`; this is the founder's instance.
- **Company business** (`~/alexandria-inc/private/` → private GitHub `alexandria-inc`) — founder-as-CEO materials: investor docs, pitch, brand, early drafts, fundraise tracker. Not part of the product. Not in the public repo.

**Founder's Constitution** lives at `~/alexandria/files/constitution/` — Core.md, Love.md, Power.md, Mind.md, Taste.md. READ Core.md first for any task. READ Taste.md first for any creative task. `~/alexandria/files/core/design.md` for craft substrate.
