# Alexandria

Greek philosophy infrastructure. Rides the user's existing ai. Does not run its own models or store user data.

Founder: Benjamin Mowinckel. Solo founder + ai agents. Relocating to SF April 2026.

## Architecture

Alexandria decomposes into atomic entities. Each is exactly one thing; together they cover the whole system. Read this section before touching anything that crosses entity lines — most architectural confusion comes from conflating two of these.

### Entities

**Protocol** (`server/src/protocol.ts` + `auth.ts` + `kv.ts` + `crypto.ts` + `db.ts`) — The incompressible core. ~455 lines, 7 endpoints. Three obligations: account (payment), file (publish monthly), call (communicate). Designed to never grow. This is what makes Alexandria a *protocol*, not a product.

**Company** (`server/src/` everything else + `app/`) — Operational layer that hosts Protocol + Library + Marketplace Signal surfaces. Stateless server, OAuth, billing, email alarms, admin endpoints, analytics. Designed to shrink as the Protocol carries more weight. Pure marginal value add — provides infrastructure, never holds Author cognition.

**Factory** (`factory/`, plus the `factory` claude.ai routine) — Iterates the Canonical Machine. Reads cross-Author signal from Marketplace Signal, evolves the canon. Artifacts live in `mowinckelb/alexandria` public repo; iteration is a weekly autonomous loop.

**Canonical Machine** (`factory/canon/`, `factory/skills/`, `factory/hooks/`, `factory/scripts/`, `factory/templates/`, `factory/setup.sh`) — What the factory prints. Modular parts on the public alexandria repo. Anyone can download. Authors install (or fork) these to compose their own Machine. The factory iterates the canonical version; existing user installs hold whatever they last fetched (frozen unless they refresh).

**Per-Author Machine** — The Author's AI in active use, doing Alexandria work. NOT a single tool — a composition of pieces (skills running in Claude Code or Cursor or Codex; editor hooks; local launchd jobs; their AI subscription budget). Built from Canonical Machine parts at install, then diverges as the Author personalizes. The founder's user0 Machine is one instance; every other Author has their own.

**Per-Author Files & System** — The Author's content (vault, constitution, ontology, notepad) plus their personal machine config (which skills installed, which hooks running, SMTP creds, launchd plists). Lives on their stuff: their disk, their git repo (`alexandria-private`), their accounts.

**Marketplace of Systems** — Public, on github (`mowinckelb/alexandria` + future fork ecosystem). Where machine parts circulate. Today: signal-only via the `alexandria-signal` repo. Future: a true parts marketplace where Authors publish novel modules for others. Survives Alexandria's death only as long as the github org does — accepted tradeoff.

**Marketplace Signal** — Private, on the Company server. Anonymized cross-Author usage telemetry (file PUTs, calls, setup status). Only the Company sees raw signal; Authors get derivatives via the daily snapshot pushed to `alexandria-signal` for the factory to drain.

**Library** — Collection of published Author files. Mostly Author-discretion-public; the Company server always holds at least one file per Author (the Protocol's file obligation guarantees this minimum). Browsing surface lives on the Company.

**Other companies** — Vendors that Authors and Alexandria depend on (Anthropic, Cloudflare, GitHub, Stripe, Resend, Google, etc.). Allowed dependencies on either side.

### Sovereignty rules

Each Author's (Machine + Files + System) is INDEPENDENT of:
- Every other Author's (M+S+F)
- The founder's user0 (M+S+F)
- Alexandria the company (its Protocol service, Company server, Library, Marketplace Signal)

But CAN depend on:
- Other companies / vendors (Anthropic, Google, Resend, GitHub, etc.)

Collective surfaces depend on Alexandria *by definition*:
- Library (hosting)
- Marketplace Signal (private collective state)
- Protocol-as-a-service (the live `api.mowinckel.ai` endpoint)
- Canon iteration (factory routine)

These are accepted dependencies — they ARE Alexandria. Alexandria is *purely marginal value add*: provides collective surfaces and a canonical machine; never holds the Author's thinking hostage.

### Death tests (apply to every architectural change)

**If Alexandria the company dies tomorrow:**
- Every Author's personal cognitive system survives — files on their disk, machine on their tools, daily flow continues. ✓ This must always pass.
- Library / Marketplace Signal access ends. (By design — those WERE Alexandria.)
- Canon artifact persists on public github (frozen). Canon iteration stops.
- Public Marketplace of Systems persists only as long as the github org account does.

**If every user vanishes:**
- Company keeps running — server doesn't iterate accounts, doesn't depend on any specific Author existing.
- Stroll/sprint alarms still fire on Company state.

If a proposed change fails either test, the change is wrong.

### Common traps — do not conflate

- **Machine ≠ a specific AI tool.** Machine is the Author's AI in active use — Claude Code, Cursor, Codex, ChatGPT in a browser tab; all are valid manifestations. Tool-agnostic.
- **Canonical Machine ≠ Per-Author Machine.** Canonical is the factory's output on github (parts catalog). Per-Author is the live, personalized install. They share ancestry; they are not the same thing.
- **Two marketplaces.** Public (github, machine parts) vs private (server, signal). Different repos, different audiences, different purposes. Never collapse them.
- **Email-on-behalf-of-Authors is NOT what Alexandria does.** Each Author has their own email pipe — own SMTP creds, own provider (Gmail, iCloud, Microsoft 365, Proton). The factory ships setup instructions; the Company never sends Author-personal emails. The `sendEmail` path on the server is for Company alarms (stroll/sprint to FOUNDER_EMAIL) only.
- **Server-side cron is for Company work, not Author work.** `runHealthDigest` probes server infra and alarms on Company state. Per-Author processing happens in the per-Author autoloop, on infra the Author controls (or accepts as a vendor — today, claude.ai).
- **Authors depending on Alexandria ≠ Alexandria depending on Authors.** The first is fine for collective surfaces by design. The second is a bug — server must keep running if every user vanishes.

### The six autonomous loops

Six dyads that fire on a schedule. Each is named by *who is acting* → *who is the recipient*. Everything else in the system is either an input to one of these, an output, or a request-driven surface.

| # | Dyad | What fires | Where it runs |
|---|---|---|---|
| 1 | **machine → machine** | Per-Author Machine processes vault → notepad fragments + library drafts. Writes one line to `~/alexandria/system/.brief_outbox` only when something surfaceable warrants it. Never writes to constitution (needs Author's voice + consent). | claude.ai routine named `machine` in the Author's account. Spec at `factory/skills/machine.md`. Daily 15:00 UTC. |
| 2 | **machine → user** | Brief delivery — `brief.py` reads `.brief_outbox` (or default heartbeat) and SMTP-sends through the Author's own credentials, against the Author's own email provider. | Local launchd plist on the Author's machine. Daily 8:00 AM local. Setup recipe at `factory/skills/brief-setup.md`. |
| 3 | **company → founder** | Stroll/sprint health alarm — probes KV/D1/R2/env vars/Resend/marketplace activity, emails FOUNDER_EMAIL when urgency detected. | Cloudflare Worker scheduled handler, `server/src/cron.ts:runHealthDigest`. Daily 15:00 UTC. |
| 4 | **company → company** | Monthly Stripe billing settlement + kin pricing recalculation. Idempotent on month-end keys. | Cloudflare Worker scheduled handler, same `cron.ts`. Monthly 1st 02:00 UTC. |
| 5 | **company → factory** | Daily libsignal snapshot push to `alexandria-signal`. Loads the factory's input pile so it has fresh cross-Author library state on its next run. | Cloudflare Worker scheduled handler, same `cron.ts`. Daily 15:00 UTC (in same handler as the health digest). |
| 6 | **factory → factory** | Drains everything in `alexandria-signal` (signal POSTs + feedback POSTs + libsignal snapshot), evolves canon in `mowinckelb/alexandria`. Most weeks decide "no PR this run." | claude.ai routine named `factory`. Spec at `factory/skills/factory.md`. Weekly Sundays 16:00 UTC. |

Why these and not others — every other actor↔recipient combination is either request-driven (Author publishes a file → server stores it; Author opens `/a` → machine processes interactively) or absent by design (company never emails Authors personally; factory never talks to humans directly).

Death-test mapping:
- Loops 1, 2 survive Alexandria's death (run on Author's stuff: claude.ai routine writing to Author's repo + Author's own launchd + Author's own SMTP).
- Loops 3, 4, 5 die with the company (they ARE the company).
- Loop 6 dies with claude.ai routine availability; the canon artifact persists frozen on public github.

## Code

- **Website:** `app/` (Next.js, Vercel). Landing page: `app/components/LandingPage.tsx`.
- **Server:** `server/src/` (Hono, Cloudflare Workers). One file per concern:
  - `worker.ts` (entry + middleware), `protocol.ts` (the protocol — file, call, library, marketplace), `routes.ts` (company HTTP handlers), `auth.ts` (accounts + API keys), `accounts.ts` (account management + admin), `email.ts` (Resend + all templates), `cron.ts` (health digest + followup + engagement), `analytics.ts` (event log + dashboard), `billing.ts` (Stripe), `library.ts` (Library CRUD), `kv.ts` (KV persistence), `templates.ts` (HTML), `cors.ts` (CORS), `crypto.ts` (encryption), `db.ts` (D1/R2 accessor).
  - Stateless server. No private user data stored. KV for accounts/events, D1 for Library metadata + protocol data, R2 for published content.
- **Factory:** `factory/` — public, forkable. Canon methodology, hooks, skills, templates, setup, onboarding block.
- **Static assets:** `public/` (includes `public/docs/` for public artifacts).
- **In-flight task plans:** `.tasks/<task-name>.md`. Each plan is self-contained (any agent in any tool reads it cold and can execute), references this `AGENTS.md` for architecture, and is deleted (or moved to `.tasks/done/`) when the task ships. Use this for cross-session task hand-off instead of memory entries — memory is for stable patterns, plans are for the next thing to do.
- **Investor docs:** kept out of this public repo. Live in `~/AlexandriaInc/partners/` (private GitHub `alexandria-inc`). Shared directly with partners (email/DM) when needed — no public URL, no `/partners/` route.
- **Pre-commit hook:** `scripts/pre-commit` gates server type check + app build (mirrors CI). Activate on fresh clone: `git config core.hooksPath scripts`.
- **Build:** `cd server && npx wrangler deploy --dry-run --outdir=dist` (server). **Deploy:** `cd server && npx wrangler deploy` then check health. **Push:** `bash scripts/push.sh` (pushes + waits for CI + reports results). Always use `push.sh` instead of raw `git push`.
- **Server health:** `curl https://api.mowinckel.ai/health`
- **Stack:** Vercel (website), Cloudflare (DNS + server + KV + D1 + R2), Resend (email), GitHub (code + OAuth), Stripe (billing), Mercury (banking, API), Claude (intelligence). All hybrid (CLI or API-controllable). Zero external dependencies.
- **Storage architecture:** Stateless server, sovereign local files (`~/alexandria/` — local + private GitHub; `iCloud/alexandria/` is Apple-native input only), thin persistence for collective Library (D1 for metadata/discovery, R2 for published content, KV for accounts/events).

### Protocol Endpoints

Seven endpoints. The protocol core:

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
| POST | `/marketplace/signal` | Machine signal submission (relayed to alexandria-signal github repo) |
| POST | `/feedback` | User feedback (relayed to alexandria-signal github repo) |
| GET/GET | `/email/less`, `/email/stop` | Email preferences |
| GET/GET | `/brief/less`, `/brief/stop` | Brief preferences |
| POST | `/admin/nudge` | Nudge uninstalled users (admin) |
| POST | `/admin/email` | Send email (admin) |

### Factory Structure

```
factory/
  block.md                  # Onboarding block instructions
  setup.sh                  # Setup script (curl → install)
  canon/
    methodology.md          # The canon — how to develop human cognition
  hooks/
    shim.sh                 # Immutable local shim
    payload.sh              # GitHub-delivered hook logic
  skills/
    claudecode.md           # Claude Code skill definition
    codex.md                # Codex skill definition
    cursor.mdc              # Cursor rules
    scheduled.md            # Scheduled agent skill
  templates/
    agent.md                # Agent instructions template
    machine.md              # Machine.md template
    notepad.md              # Notepad template
    feedback.md             # Feedback template
    constitution/README.md  # Constitution directory scaffold
    ontology/README.md      # Ontology directory scaffold
    vault/README.md         # Vault directory scaffold
    library/README.md       # Library directory scaffold
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

- **Pure marginal value add.** Alexandria must never override, compete with, or degrade the user's existing workflows, memory, or tools. Passive mode is read-only context + optional ontology writes. Active mode (/a) is opt-in. The user's existing system is the floor — Alexandria only adds.
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
- **Feedback.** Append to `~/alexandria/files/core/feedback.md` — what worked, what didn't, methodology observations.
- **Machine signal.** Write methodology observations to `~/alexandria/system/.machine_signal` — not about the Author, about the craft.

Do this silently. No report. This is the product working. If Phase 1 feels wrong, the product is wrong.

### "close" / "end" — Work session close (founder/company)

Triggered by: "close", "end", or any sign-off that is NOT "a." — used for coding sessions, company work, non-/a sessions.

No Machine loop. No constitution writes. This is company work, not product:

- **Delta.** What changed about Alexandria the company. Not what you did — what's different now. Hazy fragments only.
- **Open threads.** What's unresolved. What the next session should pick up. Ordered by priority.
- **Meta loop.** Product learnings → factory canon (`factory/canon/methodology.md`).
- **Founder loop.** Save agent memories for communication patterns, preferences, anti-patterns.

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
6. **Statelessness:** Server stores nothing user-specific. Encrypted refresh token IS the access token.
7. **Deployment:** After deploying (`cd server && npx wrangler deploy`), check health: `curl https://api.mowinckel.ai/health`.

## Working With the Founder

See `~/alexandria/files/core/agent.md` for principles, communication style, Three-Phase Execution, and Reflect Gate (loaded globally in every session).

Three-way split — keep them separate:

- **This repo** (`~/AlexandriaInc/code/` → public GitHub `alexandria`) — product source code. Intentionally open. No secrets (use env vars).
- **User vault** (`~/alexandria/` → private GitHub `alexandria-private`) — founder-as-user-0 content: agora, ontology, constitution, notepad, personal writing, session captures. Every future user will have a `~/alexandria/`; this is the founder's instance.
- **Company business** (`~/AlexandriaInc/` → private GitHub `alexandria-inc`) — founder-as-CEO materials: investor docs, pitch, brand, early drafts, fundraise tracker. Not part of the product. Not in the public repo.

**Founder's Constitution** lives at `~/alexandria/files/constitution/` — Core.md, Love.md, Power.md, Mind.md, Taste.md. READ Core.md first for any task. READ Taste.md first for any creative task. `~/alexandria/files/core/design.md` for craft substrate.
