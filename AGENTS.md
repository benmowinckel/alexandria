# Alexandria

Greek philosophy infrastructure. Rides the user's existing ai. Does not run its own models or store user data.

Founder: Benjamin Mowinckel. Solo founder + ai agents. Relocating to SF April 2026.

**Canonical surfaces:** `https://alexandria-library.com` (website, Vercel) and `https://api.alexandria-library.com` (API, Cloudflare Worker — protocol, OAuth, billing, Library, cron). `mowinckel.ai` + `www.mowinckel.ai` 308-redirect to the canonical apex. `api.mowinckel.ai` stays bound to the same Worker so legacy CLI/skill installs that cached the old URL keep working; treat it as deprecated. `mcp.mowinckel.ai` is the older alias on the same retire path. Override only via `SERVER_URL` / `NEXT_PUBLIC_SERVER_URL` when intentional.

## Architecture — Two Things, Four Code Layers

The product is **two felt things**, not a protocol. (1) **What we give you** — a free, sovereign tool running on your own files, plus the methodology (the gear). Real value the day you start; it can never be taken back. (2) **The collective** — the library, the marketplace, and the tribe: the owned hub where Alexandrians are seen and connect, the one thing being built and where the moat lives. **Sovereignty** is the *principle* that runs through the first thing (plain files, yours, portable, leave anytime) — a promise, not a technical standard. There is no "protocol" in the story; "protocol" survives only as the **internal code name** for the publish/call/library plumbing below.

The code maps to four layers:

1. **The collective plumbing** (`server/src/protocol.ts` + `auth.ts` + `kv.ts` + `crypto.ts` + `db.ts` + `file-access.ts` + `marketplace-catalog.ts` + `marketplace.ts` + `audit.ts`) — optional server infrastructure for the Library, marketplace, and tribe. The incompressible product core is the local loop; it works without this layer. Internally still named `protocol.ts` — a code label for the plumbing, never the public framing.

2. **Factory** (`factory/`) — the public, signed distribution. The product taxonomy describes what each part *is*: **the loop** (Foundation + the local mirror + passive session + visible route into `/a` + active session/close + archive/Git); **methods** (`axioms·methodology·editor·mercury·publisher`, included and removable); **additions** (new local capabilities added when useful); **connections** (signed update checks, account, Library, marketplace signal, network, cloud, scheduled outbound messages, PLM/twin). Consent is a separate axis: the loop and methods start locally; the cue and methods have off switches; additions wait for a direct local need; connections stay off until exact approval. Signed availability is not activation. The marketplace lists Foundation and upkeep as `core` recovery references without ranking or reporting them, labels the five replaceable methods `default`, Alexandria additions `official`, and everything else by author. **Everything listed in `manifest.txt` is signature-gated**; use `factory/ship.sh` for any manifest-covered change.

3. **Machine** (`~/alexandria/`) — Each Author's personal system. Constitution, vault, marginalia, machine.md, notepad, feedback. Lives locally, never on the server — the sovereign tool running on the Author's own files. The product IS this folder. Alexandria stores what Authors publish, never what they think.

4. **Company** (`server/src/` everything else + `app/`) — Operational overhead. OAuth, billing, email, analytics, cron, Library CRUD, admin endpoints. This layer should shrink over time.

## Code

- **Website:** `app/` (Next.js, Vercel). Landing page: `app/components/LandingPage.tsx`; its styles live in `app/components/landing.css` (head-loaded, render-blocking). Never move styles back into inline `<style>` tags or CSS-in-JS on this page — body-streamed styles paint after the markup on chunked production HTML (the 2026-07-24 refresh-flash; physics in `~/alexandria/files/core/design.md § Performance`).
- **Server:** `server/src/` (Hono, Cloudflare Workers). One file per concern:
  - `worker.ts` (entry + middleware), `protocol.ts` (the collective plumbing — file, call, library, marketplace; "protocol" is the internal code name), `routes.ts` (company HTTP handlers), `auth.ts` (accounts + API keys), `accounts.ts` (account management + admin), `email.ts` (Resend + all templates), `cron.ts` (health digest + followup + engagement), `analytics.ts` (event log + dashboard), `billing.ts` (Stripe), `library.ts` (Library CRUD), `kv.ts` (KV persistence), `templates.ts` (HTML), `cors.ts` (CORS), `crypto.ts` (encryption), `db.ts` (D1/R2 accessor), `file-access.ts` (visibility gate — the only path that reads protocol/shadow/work bytes from R2), `marketplace-catalog.ts` (GitHub module catalog + push-webhook cache busting), `marketplace.ts` (Author-feedback substrate, writes to private GitHub repo), `audit.ts` (tamper-evident access audit mirrored to a hash-chained GitHub repo), `library-signal.ts` (daily funnel/engagement snapshot consumed by the founder), `time.ts` (PT formatter).
  - Stateless server. No private user data stored. KV for accounts/events, D1 for Library metadata + protocol data, R2 for published content.
- **Factory:** `factory/` — public, forkable. Canon methodology, hooks, skills, templates, setup, onboarding block.
- **Static assets:** `public/` (includes `public/docs/` for public artifacts).
- **In-flight task plans:** `.tasks/<task-name>.md`. Each plan is self-contained (any agent in any tool reads it cold and can execute), references this `AGENTS.md` for architecture, and is deleted (or moved to `.tasks/done/`) when the task ships. Use this for cross-session task hand-off — plans are for the next thing to do; durable signal routes to canon, never agent memory (canon-not-memory policy, `~/alexandria/files/core/agent.md`).
- **Investor docs:** kept out of this public repo. Live in `~/alexandria-inc/private/partners/` (private GitHub `alexandria-inc`). Shared directly with partners (email/DM) when needed — no public URL, no `/partners/` route.
- **Pre-commit hook:** `scripts/pre-commit` gates server type check + app build (mirrors CI). Activate on fresh clone: `git config core.hooksPath scripts`.
- **Build:** `cd server && npx wrangler deploy --dry-run --outdir=dist` (server). **Deploy:** `cd server && npx wrangler deploy` then check health. **Ship:** commit prepared work, then run `bash scripts/push.sh`; it replaces the local commits with one commit signed by the Mac's Touch ID key, submits that exact commit for GitHub verification and tests, then asks Touch ID again to move those tested bytes to `main`. GitHub structurally rejects every account key on `main`; the Secure Enclave release key is the only bypass. If the diff touches anything in ship.sh's `SIGNED_FILES` (grep `factory/manifest.txt`; never trust a remembered list), use `bash factory/ship.sh "msg"` first: it re-signs the Author-facing manifest and then enters the same structural release path. Skipping ship for a manifest-listed file freezes Authors on the last valid payload. `ship.sh` commits only the manifest-gated set; commit any other prepared changes separately before the final `scripts/push.sh`.
- **Harness skills are hand-synced copies — propagate or drift.** `skills/claudecode.md`, `codex.md`, and `droid.md` share their Phase-5 / first-session text as three separate files (cursor delegates to the installed claudecode copy). Any edit to that shared text in one MUST be applied to all three in the same commit — the 2026-07-22 conversion-language purge landed in claudecode only and shipped drifted siblings. If it drifts a second time, stop hand-syncing: generate all three from one source at ship time.
- **Parallel-session git discipline — this repo usually has more than one live session.** Never `git add -A` / `git add .` (it sweeps other tabs' staged or untracked WIP — casting PNGs, working assets — into your commit); stage explicit paths only. Expect the index and HEAD to move under you mid-task: another tab's commit can sweep your staged files in, or a reset can sweep them out — so after committing, verify the commit contains exactly your diff (`git show --stat HEAD`) before deploying or pushing, and re-check `git status` just before `wrangler deploy` (the working tree is what ships). Both failure directions happened 2026-07-09. Third direction (2026-07-15): a stash-pop can leave the working tree *behind* HEAD, so "commit-protecting" a shared file at session close silently reverts another tab's just-committed work — diff the file against HEAD (`git diff HEAD -- <file>`) and read what the diff actually says before committing anything you didn't author. (This bullet's home is AGENTS.md — CLAUDE.md and .cursorrules are generated copies via the npm `prebuild`; editing them directly gets clobbered on the next build, which is how this bullet vanished twice on 2026-07-15. The inverse failure — editing AGENTS.md and committing without a build, so the *stale* CLAUDE.md ships and the change never reaches the file Claude Code reads — bit again on 2026-07-27 and is now closed structurally: `scripts/pre-commit` regenerates and stages CLAUDE.md whenever AGENTS.md is staged. Neither direction can desync now; don't hand-sync either copy.)
- **Split-deploy trap — commit BEFORE you ship, and verify against production, not the working tree.** The two surfaces ship from different sources: `wrangler deploy` bundles the **working tree** (uncommitted edits go live on the Worker), while the **website** ships only from **committed `main`** via `git push`→Vercel — and `push.sh` pushes *commits*, not working-tree edits. So an uncommitted change can go live on the Worker (making the fix *look* deployed) while the website silently ships nothing. Sequence: **commit first**, then `push.sh` (website) and `wrangler deploy` (server) — never tell anyone "shipped" off a working-tree edit. A frontend/API change isn't done until `curl`ing the live URL (not `localhost`, not the diff) shows the new behavior. This exact gap shipped a "fixed" sign-in that was still broken in prod (2026-07-07). Second variant (2026-07-27): Vercel's ignore-build-step used to diff only the push's LAST commit, so a push ending in a non-app commit (ship.sh's manifest re-sign on top of site work) silently skipped deployment while looking shipped — now fixed structurally in `vercel.json` (`ignoreCommand` diffs against the last DEPLOYED sha, failing open to building). Don't re-add a dashboard ignore rule; vercel.json owns it. Verify deploys by `npx vercel list code --yes` (newest row READY, commit sha = HEAD).
- **Server health:** `curl https://api.alexandria-library.com/health`
- **Stack:** Vercel (website), Cloudflare (DNS + server + KV + D1 + R2), Resend (email), GitHub (code + OAuth), Stripe (billing), Mercury (banking, API), Claude (intelligence). All hybrid (CLI or API-controllable). Zero external dependencies.
- **Storage architecture:** Stateless server, sovereign local files (`~/alexandria/`; setup connects no cloud storage), optional user-owned iCloud/Drive/private-GitHub add-ons after separate consent, thin persistence for collective Library (D1 for metadata/discovery, R2 for published content, KV for accounts/events).

## Agent-owned operating queues

Founder email is not an operating queue. User-0 did not read the health or feedback alerts, so the emails created notification noise without producing action. The rented agent owns both loops whenever this repo is active:

- **Health:** before discretionary server work, `curl https://api.alexandria-library.com/health`. A degraded response carries the remaining `awareness.issues`; diagnose, fix, deploy, and verify production before starting lower-priority work. The daily cron still detects and self-heals, but never emails the founder.
- **Human feedback:** before discretionary product work, inspect every file in the private `benmowinckel/alexandria-feedback` repo. File presence means unprocessed. Implement or route what the agent can; batch only genuine founder taste or outward-facing calls; delete a file only after its signal has a durable home or shipped resolution. Cancel-screen and session feedback share this one substrate; machine setup reports stay in the event log and never enter it. `factory/skills/factory.md` is a dormant loop spec, not a running routine — never assume it drains the queue.

### Protocol Endpoints

Seven endpoints. The collective's plumbing — internally named "protocol" in code (`protocol.ts`); never the public framing:

| Method | Path | Purpose |
|--------|------|---------|
| PUT | `/file/{name}` | Publish a file (the file obligation) |
| GET | `/library` | Browse all published files |
| GET | `/library/{id}` | List one Author's files |
| GET | `/library/{id}/{name}` | Read a specific file |
| POST | `/call` | Report module usage (the call obligation; optional `requests` — Author-cleared unmet-demand wishes) |
| GET | `/marketplace` | Browse the module catalog |
| GET | `/marketplace/requests` | Unmet-demand board — anonymous, ranked by distinct callers, 90-day window |
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
| GET | `/account/rotate-key` | Lost-key self-serve rotation (single-use code minted on returning-member OAuth; old key dies atomically) |
| POST | `/feedback` | Author-explicit feedback sent only in the foreground after a direct request; never drafted or posted by session hooks. Stored in private `benmowinckel/alexandria-feedback`; returns an addressable id. |
| GET/POST | `/email/stop` | Email unsubscribe |
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
    MODULES.md              # Product map: loop / methods / additions / connections
    foundation.md           # Incompressible local closed loop + invariants
    axioms.md  methodology.md  editor.md  mercury.md  publisher.md  # replaceable defaults
    library.md  filter.md  marketplace.md  plm.md  twin.md           # dormant opt-in references
    bookshelf.md            # reference only
  hooks/
    shim.sh                 # Immutable local shim
    payload.sh              # GitHub-delivered hook logic (signed)
  skills/                   # claudecode · codex · cursor · droid · scheduled(-bootstrap) · install · publish · brief-setup · nudge · factory
  systems/                  # Additional modules (e.g. state-based-sync)
  scripts/                  # brief.py · install.sh · publish.sh · verify-fetch.sh
  templates/                # agent · machine · notepad · feedback · module · constitution/ · marginalia/ · vault/ · library/
```

## Visual Workflow

**See before shipping.** For any frontend work, use `scripts/see.mjs` (Playwright) to screenshot and visually verify. Read the PNGs with the Read tool — you are multimodal.

- **Screenshot any URL:** `node scripts/see.mjs <url> [--full] [--dark] [--only desktop|tablet|mobile]`
- **Local dev:** `node scripts/see.mjs localhost --port 3000`
- **Design reference:** `~/alexandria/files/core/design.md` — craft substrate (900 lines of concrete CSS physics, anti-patterns, thresholds). Read before any frontend work. Not taste — that's `~/alexandria/files/constitution/Taste.md`.
- Screenshots save to `.see/` at repo root (gitignored), auto-cleaned to last 30.
- **Loop:** build → screenshot → evaluate against design.md → fix → screenshot → ship.
- **Production may serve a "Vercel Security Checkpoint" to automation** (verified 2026-07-24: curl 403s even with a browser UA; headless Playwright gets the challenge page — "Failed to verify your browser, Code 21"). This is Vercel's platform-managed bot mitigation, NOT a project setting (firewall config and project security are empty — nothing to toggle); real browsers and verified search crawlers pass. So: do visual verification against localhost, and verify production deploys by deployment state (`npx vercel list code --yes` — newest row READY, commit SHA matches), not by curling the live page. Don't burn time re-diagnosing the checkpoint.

## Style

- "ai" is always lowercase unless at the start of a sentence or in a proper noun (e.g. "Apple Intelligence"). This is a brand and taste decision.
- **The three nouns — never let "Alexandria" do the work of "an Alexandria loop" (founder-locked 2026-07-27; full statement in private `truth/a1.md § THE THREE NOUNS`).** It is not Alexandria — it is *your own ai, with an Alexandria loop*. (1) **your ai** — their Claude, their Cursor, whatever they already opened: theirs, unchanged, never replaced or wrapped, and the only thing that ever acts. (2) **an Alexandria loop** — the method it runs, plain files on their machine, *closer to an AGENTS.md than to software*; no application, no runtime, nothing installed between the person and their ai. (3) **Alexandria** — not an entity: the aggregator, the library and marketplace of private individuals running their own private loops, and the only place a server exists. **The rule for every string a user reads:** Alexandria may be a *condition* ("with an Alexandria loop, every ai opens knowing you") but never the *subject of a custody verb* — never "Alexandria reads / keeps / holds / gives / draws / develops". Put the user's own ai in the subject position. **The same rule governs the agent's own speech** (caught 2026-07-29: an agent presenting the install said "it records our conversations… it gets to know you" — the phantom entity back in third person): anything the agent tells its user about what happens on the machine is first-person — "I'll write down what I learn about you, into files you own" — and the artifacts a pre-install agent reads (setup.sh reviewer letter, TRUST.md lede, block.md) carry that voice rule explicitly, because the agent learns its register from what we hand it. A sentence that fails this describes a service that does not exist, contradicts the architecture (a keyless install makes zero requests to our server — every POST in `factory/hooks/payload.sh` is gated on an API key), and hands a careful reader a reason to stop. This defect was fixed across ~25 strings on 2026-07-27; it recurs because the company name is the shortest available noun, so check it explicitly before shipping copy.

## Design Constraints

- **First touch is the human's plain intent; the trusted agent owns security (v4, 2026-08-09).** The paste contains only: the private local outcome the human wants; the exact public repo `github.com/benmowinckel/alexandria`; an instruction to treat every Alexandria file as untrusted evidence and use the agent's own security process; and a hard write gate — explain in plain English, then wait for the human to say `start`. No bash, fingerprint, setup path, environment variable, referral flag, vendor trust claim, or vendor-authored verification choreography. The earlier fingerprint-heavy paste failed a cold ultra-sensitive gate because the repo, trust root, and verification procedure all arrived in the same untrusted message; the simple request passed three cold agents. The implementation still supports a strong agent-chosen path: verify one signed canonical commit, audit it, and run setup pinned to the same hash. A fingerprint learned from the repo itself is continuity evidence, not an independent trust root; TRUST.md says this honestly. The paste must survive the cold simulation in `factory/redteam.md`, and `factory/scripts/check-private-boundary.sh` blocks structural regression.
- **The user's ai never sells Alexandria (2026-08-09).** Alexandria-owned surfaces may carry the pitch. Installed prompts, canon, onboarding, openers, closes, nudges, and the user's private map never initiate a join, referral, pricing, membership, marketplace, feedback, or other company ask. The private ai may answer a direct question or operate features the user already chose. It never uses private knowledge to sharpen commercial language. This boundary is release-blocking.

- **Radically simple UX (onboarding law).** Any do-this-now flow: one decision or action per screen; every actionable thing is the same box (one grammar: bold words — muted why, inputs inside boxes); a page line is only legal if the model can't carry it at the moment of need; numerals not prose for sequence; small asks before the point-of-no-return action. Full physics: ~/alexandria/files/core/design.md § Conversion & Sales. Forged on /start + /chat + /join, 2026-07-24/25.
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
- **Feedback.** Append to `~/alexandria/files/core/feedback.md` — what worked, what didn't, methodology observations. This stays local. Sending anything outward is a separate direct request with the exact text shown before it leaves.

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

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
