# Marketplace of Systems — MVP

**Status:** ready to execute. ~4.5 hours of work, 6 commits, CI green between phases.

**For the agent picking this up:** read `~/alexandria-inc/public/code/CLAUDE.md` *first* (entity model, sovereignty rules, death tests, six-dyad loops, common traps). Don't re-derive any of it. Then read this file. Then execute.

When this task ships, delete this file (or move to `.tasks/done/marketplace.md`).

---

## The work

Make the public Marketplace of Systems on `mowinckel.ai/marketplace` real. Today the `/marketplace` endpoint is auth-required and returns just module-ID strings; there's no browse page, no install helper, no publish helper. The mechanism for tracking usage signal already works (Authors POST `.call_manifest` to `/call`, server tracks counts, factory drains weekly). The gap is purely the discovery + install + publish UX.

**Why it matters:** the marketplace is the load-bearing network-effect substrate of Alexandria. Today it's invisible. Without it, the protocol's "module" concept is theoretical. Ground-truth check: more Authors → more modules → more value → more Authors compounds only if Authors can find each other's work.

---

## Architectural decisions (baked in — don't re-debate)

- **No `/publish` endpoint exists or will exist.** The act of an Author *using their own module* (via `.call_manifest` → `/call` POST → server) surfaces it to the marketplace automatically. Publishing = writing a markdown file in a public github path. Self-installation propagates discovery.
- **Module ID format:** `github:<user>/<repo>#<path-without-extension>`. Server appends `.md` when fetching from `https://raw.githubusercontent.com/<user>/<repo>/main/<path>.md`.
- **Public catalog endpoint, auth-required usage history.** `GET /marketplace` is public (anyone can browse — drives signups). `GET /marketplace/:user/:repo/*` (detail) is also public. `GET /marketplace/:module` (existing, usage history) stays auth-required.
- **Module home: `<user>/alexandria-systems` is a *suggested convention*, not a *requirement*.** Protocol accepts any public github path. Authors with existing public module repos can use those.
- **Front-matter contract:** `name, description` only. Body is freeform markdown (when-to-use, when-not, instruction, example — per existing `library.md` guidance). `tags` deferred until search/filter UI exists. Slug pattern: `[a-z0-9][a-z0-9-]*`. Extension: `.md` only.
- **URL scheme on the website:** `mowinckel.ai/marketplace/<user>/<repo>/<path>` — not URL-encoded module IDs. Friendly, link-shareable, matches Library URL pattern.
- **Cache strategy:** one combined KV entry per module (`{frontmatter, body, last_fetched, status}`). 24h TTL. Lazy-fetch on `/call` arrival of a new ID. Re-fetch on TTL expiry. On 404 → mark `status: unreachable` (don't silently drop). On YAML parse failure → mark `status: parse_error`, fall back to slug-as-name + degraded display.

---

## The 6 phases

| Phase | Time | Output |
|---|---|---|
| **1. Foundation** | 1 hr | Front-matter spec pinned (`name, description` + slug pattern `[a-z0-9][a-z0-9-]*` + `.md` only). `factory/templates/system-module.md` template. `factory/canon/library.md` rewrite covering `<user>/alexandria-systems` as suggested convention + lifecycle + the "no /publish endpoint" architectural note. **Audit list (11 files) for stale `marketplace\|module\|system\|publish` vocabulary:** `axioms.md, methodology.md, editor.md, mercury.md, publisher.md, library.md, filter.md` + `factory/templates/**` + `public/docs/Trust.md` + `public/docs/Whitepaper.md` + `app/components/LandingPage.tsx`. |
| **2. Server** | 1.5 hr | Public `GET /marketplace` enriched: returns `[{id, name, description, author_github_login, usage_count, last_used, first_seen, status}]`. Lazy github fetch + KV cache (one combined entry per module, 24h TTL). On TTL expiry → re-fetch; on 404 → `status: unreachable`; on YAML parse failure → `status: parse_error` with fallback metadata. New `GET /marketplace/:user/:repo/*` (public) — full module detail. Existing `GET /marketplace/:module` (auth, usage history) untouched. |
| **3. Web** | 1 hr | `app/marketplace/page.tsx` — list view, default sort by usage descending, "no modules yet" empty state, `(unreachable)` and `(parse error)` badges where relevant. `app/marketplace/[user]/[repo]/[...path]/page.tsx` — detail view, renders body via `app/components/MarkdownDoc.tsx` (already exists in Library). Reuses Library typography. Link from main nav. No search/filter yet (defer until module count justifies). |
| **4. Install** | 10 min | `factory/scripts/install.sh <module-id>` — validates ID format, curl-checks github reachability, idempotent append to `~/alexandria/.call_manifest`. ~15 lines. `factory/skills/install.md` — thin pointer skill so AI can invoke when Author says "install module X". |
| **5. Publish** | 30 min | `factory/scripts/publish.sh <slug>` — checks if `<user>/alexandria-systems` exists on github, creates via `gh repo create` if not, clones locally (or pulls if exists), copies `factory/templates/system-module.md` with the slug filled in, commits + pushes after Author edits the body, prints resulting Module ID. `factory/skills/publish.md` — orchestrating skill: AI runs publish.sh setup, helps Author write the body, runs commit + push. AI inference only on the creative body-writing step; mechanics are scripted. |
| **6. Verify end-to-end** | 30 min | Pick ONE of three candidate modules to publish as the inaugural marketplace entry: (a) the `/optimise` skill (`~/.claude/skills/optimise/SKILL.md`) — perfect dogfood; (b) `scripts/verify-edit.cjs` (per `feedback_visual_edit_verification.md` memory) — concrete frontend Author value; (c) `factory/skills/brief-setup.md` — already built, just framed as a module. Founder picks at execution time. Then verify the full loop: catalog appears → install on this machine → /call POST → usage signal in /marketplace listing → factory drains via libsignal next cron. **Also test failure paths**: publish a module with broken front-matter (verify graceful `parse_error` degrade), publish then immediately delete from github (verify `unreachable` shows on next re-fetch). Update canon's worked example to reference whichever module shipped. |

---

## Verification discipline (NON-NEGOTIABLE — see `~/.claude/projects/-Users-benmowinckel/memory/feedback_verification_must_check_pipeline.md`)

Before claiming any phase "done":

1. `gh run list` — confirm CI Build, Deploy, Smoke, Stranger all green on the relevant commit.
2. `wrangler deployments list` — confirm the deployed version matches HEAD's intent.
3. For phases 2–3: `curl https://api.mowinckel.ai/marketplace` and verify the response shape.
4. For phase 6: confirm the actual end-to-end loop with real artifacts, not just configuration.
5. Never claim "all green" without naming the failure path that was checked. Endpoint health passing is *not* sufficient — that passes when *anything* is running, including stale code.

---

## Out of scope (deliberately deferred — don't drift into these)

- `alexandria install`/`uninstall` global CLI binary (skill + script are enough)
- Tag taxonomy / category browsing (defer until module count >50)
- Module versioning (pin to a specific commit/sha)
- Author profile pages
- Quality signals beyond raw usage (ratings, reviews, comments)
- Cross-module dependencies
- Featured / curated modules
- Search UI on the marketplace page
- Cache-bust mechanism for instant module-update visibility (24h soft staleness is acceptable for v1)

---

## When complete

1. Update `factory/canon/library.md` worked example to cite the inaugural shipped module.
2. Delete this file (or move to `.tasks/done/marketplace.md` if a done-archive directory exists).
3. The architecture/lifecycle content lives durably in `factory/canon/library.md` — that's the canonical home, not this file. This file is just the ephemeral plan.
