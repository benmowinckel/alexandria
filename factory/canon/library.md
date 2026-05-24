# The Library

*The Library makes cognitive transformation visible, shareable, and social. It completes the loop: join → train → show. This file covers Library folder structure, surface formats, publish conventions, the browsing loop, and the Marketplace of Systems — how Authors share reusable machinery with each other.*

## Structure — four permission tiers + external works/ source

`~/alexandria/files/library/` is the publication interface only. Canonical works live OUTSIDE library at `~/alexandria/files/works/` — the Author's personal corpus of everything they've made (essays, aphorisms, meditations, quotes, anything). Not all works are intended for publication; some are personal and never leave `files/works/`. The library publishes the subset the Author chooses to ship.

```
~/alexandria/files/works/         # personal canonical — everything the Author has made
~/alexandria/files/library/       # publication interface only
  public/     # anyone on the open web
  authors/    # other Alexandria Authors — the social tier ("you're not a user, you're an Author")
  invite/     # token-gated — only those the Author invites
  paid/       # paying Authors (subscribers)
```

**Permission outermost (threshold game — security boundary, sacred). Cohort leaf (maximisation game — audience, can multiply freely inside). `files/works/` is the canonical source for hand-authored essays; library does not have its own `works/` subfolder.**

Inside each permission, the Author may name cohort sub-folders (e.g., `invite/close-friends/`, `paid/colleagues/`). When a permission tier has a single audience and no sub-cohorts, `filter.md` lives at the permission level as the de-facto single cohort. When the audience splits, sub-cohorts emerge, each with its own `filter.md`. Filenames are always `filter.md`; path disambiguates.

Working drafts live in the cohort/permission folder where they were generated and never ship. Shadow drafts use the underscore-derivative convention `_shadow.md` (matches `_constitution.md` / `_notepad.md` / `_feedback.md` from the canon side). Other artifact types (pulse, delta, etc.) currently use the `<artifact>_draft.<ext>` suffix pattern; whether to unify everything on underscore-prefix is deferred until those conventions get a similar review.

## The standard module

Each cohort (or permission tier when single-audience) is a self-contained module: `filter.md` + audience-specific generated content + symlinks into `files/works/` for hand-authored essays the Author has chosen to publish at that tier.

**The filter does three things:** curation (which works from `files/works/` surface in this cohort), framing (audience-specific intro, ordering, presentation), and generated content (audience-specific pieces auto-written from the constitution that live only in this folder — e.g., the public shadow, monthly pulse, delta). The filter NEVER transforms the canonical essay text. If two audiences need different versions of the same essay, the Author writes two canonical works in `files/works/` (e.g., `On-Death-vulnerable.md` for invite, `On-Death-polished.md` for public) and tags them differently in frontmatter. Transformation happens at the authoring layer, not the filter layer.

**Generated content vs canonical works.** Shadow, pulse, delta, quiz — engine-generated per cohort, live only in the cohort folder under `library/`. Essays — hand-authored canonical, live in `files/works/` (independent of library), symlinked into the right cohort/permission folders when the Author chooses to publish them. Frontmatter on each work declares which audiences it's published to (`cohorts: [...]` or `permissions: [...]`). One source in `files/works/`, N appearances via symlinks. Edit canonical → all symlinked views update.

**Why works are external to library.** Not everything an Author makes is meant for publication. `files/works/` is the personal corpus (Aphorisms, Quotes, drafts that never ship, essays in progress). Library is the publication interface — the Author propagates a work into library by symlinking it into the appropriate tier. The default for any new work is "not published" — propagation is an explicit act.

**Each filter is self-contained.** Flat, no inheritance from a root filter or other cohort filters. Copy-paste at small scale; revisit only if the Author ends up with 20+ cohorts and drift hurts.

**Hand-edits to engine-generated content flow back upstream.** The edit persists locally as new truth; the learning propagates to the constitution (if universal) or the filter (if audience-specific) so the next regen produces correctly. No special architectural rule beyond "don't be stupid about overwriting user work."

**Promotion of drafts** is per-artifact-type. For shadows: the Engine writes to `_shadow.md` in the cohort folder; the Author promotes by **overwriting** `shadow.md` with the draft content — both files persist after promotion, so `_shadow.md` continues to hold the next iteration. For other artifact types using the `<artifact>_draft.<ext>` suffix pattern (pulse, delta): the Engine writes the draft, the Author renames to drop the `_draft` suffix to ship. The file boundary IS the consent gate either way. Auto-promotion is opt-in per artifact type.

## Publishing

The Engine generates Library artifacts from the Constitution. The Author's consent lives in two places: the filter (`factory/canon/filter.md` + `~/alexandria/files/library/filter.md`, optionally refined per leaf as `library/{tier}/filter.md`) and tier-folder placement. The filter is the standing policy — what the Author would tell a stranger given infinite time. Placement under a final (non-draft) filename inside one of the four tier sub-folders is the per-artifact promotion AND the tier declaration. The Publisher ships final-named tier-foldered files automatically; it never ships drafts (`_shadow.md`, `*_draft.*`), files outside the four tier folders, or anything outside `library/`. Writing a draft is the Engine's candidate. Writing a final-named file in a tier folder is the Author's consent at that tier. Both gates must pass.

**Shadow loop.** Every Author should have at least one current Authors-visible shadow — in `~/alexandria/files/library/authors/shadow.md` or `~/alexandria/files/library/public/shadow.md`. Either tier satisfies the protocol's file obligation; the choice is the Author's. Public is the broadest reach; authors-tier keeps the surface to other Alexandria Authors. The shape is the **minimum compliance template** defined in `filter.md`: a router on top + stranger-parity content below. The Engine derives the router from the Constitution's topic surface, with link targets pulled from the existing `library/paid/`, `library/invite/`, and any contact links the Author has declared.

The Engine continuously maintains a full-file draft as `_shadow.md` alongside whichever tier the Author has chosen (or both, if they keep parallel surfaces). The draft is the Machine's recommended current shadow, not a delta log. Regenerate from the Constitution, marginalia, notepad, vault deltas, and filter whenever meaningful signal changes. If only a small part changed, still write the whole proposed file so the Author can approve with one move. The Author accepts by **overwriting** `shadow.md` with the draft content (both files persist after promotion) or by editing `shadow.md` directly. Final `shadow.md` is consent; `_shadow.md` is not. Shadow craft methodology — three readers, zero-context-readable test, canonical skeleton — lives at `~/alexandria/files/library/methodology.md` per Author convention; the Engine reads it before any shadow refresh.

When file compliance is due within seven days, stale, or missing, this becomes a high-priority `/a` task and a morning-brief item. The Engine should bring the smallest useful ask: "I drafted your shadow; approve/edit this paragraph" rather than a vague maintenance warning. The goal is closed-loop compliance without dark patterns: the Machine drafts and reminds; the Author approves what becomes visible.

**Publish call mapping.** Local IS the source of truth. The factory hook reconciles the full Library every session-start: walks `~/alexandria/files/library/{tier}/`, PUTs each non-draft, non-filter file (the server hash-skips unchanged content), then DELETEs anything the server has that local doesn't. Deletion is by removing the local file. Visibility change is by moving the file between tier folders.

Each PUT maps placement to:
- `name` = the filename stem (e.g. `shadow.md` → `shadow`). Same name across tiers collides on the server; if you want parallel shadows at different tiers, give them distinct stems (e.g. `shadow.md` in authors/, `friends.md` in invite/).
- `visibility` = the tier folder (`public`, `authors`, `invite`, or `paid`).
- `content_type` = derived from extension (`.md` → markdown, `.pdf` → application/pdf).

There is one publish endpoint — `PUT /file/{name}` — and its inverse, `DELETE /file/{name}`. They carry every artifact type. Format-specific endpoints (`/library/publish/shadow`, `/library/publish/pulse`) do not exist and will not be added; the protocol stays minimal on purpose.

Five artifact types: Shadow (curated Constitution fragments), Pulse (monthly change artifact, typically public), Delta (progress diff, typically invite with zero invitees = Author-only), Quiz (viral distribution engine, typically public), Work (finished creative artifact, frozen on publication, any tier).

The Engine decides content, structure, and format for all artifacts. No prescribed shapes. The marketplace watches engagement and surfaces what works. The only hard constraint: at least one Authors-visible file (authors-tier or public-tier) — the minimum that makes the network function. Paid and invite files don't satisfy the obligation: they're gated artifacts; the point of the file obligation is that other Authors can see something.

## Library Surfaces — Pulse, Games, Shadow Publishing

The Library is an RL environment. Every surface — pulse cards, games, shadows, works — evolves through Author experimentation. The Machine suggests. The Author curates. The marketplace measures. The canon propagates winners.

**Pulse generation (monthly).** At the start of each month, generate the Author's pulse cards from their constitutional data. The pulse is a trading card — screenshotable, shareable, designed to be posted. V1 soft default formats (the marketplace's current best guess — will evolve through the RL loop as Authors experiment):

- **Similarity card.** Similar thinker — all time: one name, one percentage, one-line description of the connection. The anchor. Similar thinkers — this month: three names with one-line descriptions. The monthly variation — what changed, who showed up. Screenshotable URLs: Author's Library page and kin signup code.

- **Fragment card.** Five ideas the Author engaged with this month, drawn from notepad fragments and session activity. Source name + one-line idea. The range IS the signal — Hormozi next to Seneca next to Kipchoge. That juxtaposition is the curation fingerprint. Nobody else has that exact list. The evocation: "what an interesting person." Screenshotable URLs: Author's Library page and kin signup code.

The two formats serve complementary functions. The similarity card anchors identity (who you think like). The fragment card signals range (what you're engaging with). Both are screenshotable. Both evolve. Authors can publish either or both, or invent their own.

Publish pulses by writing them to `~/alexandria/files/library/public/pulse.json` (or another tier). The hook ships them on next session-start via `PUT /file/pulse` with `visibility: public`. The format will evolve — these are soft defaults. The marketplace measures share rate, click-through, signup conversion from pulse screenshots. Authors who experiment with different formats contribute signal. No format is permanent.

**Shadow publishing.** The Author publishes their shadow by saving `shadow.md` into a tier folder under `~/alexandria/files/library/`. The hook PUTs it as `/file/shadow` with the matching visibility. The shadow is the mandatory artifact — at least one Authors-visible file, free to all other Authors. The Engine generates and maintains it from whatever the Author gives (constitution, vault, raw conversation).

**Games.** Quizzes generated from constitutional data. The Machine suggests formats. The Author picks what feels right. All quiz engagement data flows to the marketplace.

All Library surfaces are soft defaults that thin over time. The Authors drive the RL loop. The marketplace aggregates. The canon propagates. Alexandria does not guess what works — the users discover it.

## When to suggest publishing

When the Constitution has enough depth, when the Author creates a finished work, monthly for Pulse, or when the Author mentions wanting to share. Do not force publishing.

## Browsing — the aggregation of minds

The Library is not just for publishing. It is for reading. Browse other Authors' published shadows during sessions and surface relevant cognitive delta. Cross-reference against the Author's Constitution. Surface marginal delta — what this other mind has that the Author does not, where they arrived at the same conclusion through different paths, where they genuinely disagree on something load-bearing. Tensions and different paths to the same conclusion are more interesting than agreements.

---

# The Marketplace of Systems

*Public catalog of reusable Alexandria machinery — skills, prompts, scripts, hooks, rituals, filters, extraction moves, publishing formats. Where Authors find each other's work and compose richer Machines from it. Distinct from the Library: the Library is finished cognitive output (shadows, works); the Marketplace is the machinery that produces it.*

## The architectural axiom — there is no /publish endpoint

A module is not pushed to a server. The act of *using a module* is what registers it.

When the Author's Machine runs, it POSTs `~/alexandria/.call_manifest` to `/call`. Every module ID in that manifest becomes visible in the Marketplace catalog (`GET /marketplace`) on first arrival. The server lazy-fetches the module's markdown file from GitHub, caches it, and exposes it for browsing. **Use is the contribution.** No one publishes — Authors install and use; the manifest does the rest.

This means: there is no `POST /publish`, no `/marketplace/submit`, no upload UI. There won't be. The protocol stays minimal because the network effect lives in the call signal, not in a publishing surface. An Author who never tells anyone about their module but uses it themselves has *already* surfaced it on the marketplace — at usage count one.

## Module ID format

Module IDs are GitHub identity tags. Once a module has a public GitHub path, its stable Marketplace ID is:

`github:<user>/<repo>#<path-without-extension>`

The server appends `.md` when fetching from `https://raw.githubusercontent.com/<user>/<repo>/main/<path>.md`.

Example: `github:mowinckelb/alexandria#factory/canon/library`.

Before a module is contributed, use a provisional local ID in `.call_manifest`:

`local:<github-login>/<slug>`

When the local module is published to GitHub, replace the local ID with the GitHub ID. The marketplace counts only GitHub IDs (provisional locals are private signal).

## Suggested home — `<user>/alexandria-modules`

The recommended convention is to keep all your published modules in a single repo named `<user>/alexandria-modules`, one markdown file per module:

```
<user>/alexandria-modules/
  optimise.md
  verify-edit.md
  brief-setup.md
  …
```

This is a *convention, not a requirement*. The protocol accepts any public GitHub path. Authors with existing public module repos (a personal `dotfiles` repo, a `claude-skills` collection, a fork of the canonical repo) can use those — the module ID format works equally for any public path. The convention exists so casual browsers can guess where an Author's modules live and so the publish helper has somewhere sensible to default to.

## Front-matter contract

Every module file has YAML front-matter at the top:

```yaml
---
name: <slug>
description: <one sentence>
---
```

That's the whole contract.

- **`name`** — the module's slug. Pattern: `[a-z0-9][a-z0-9-]*`. Lowercase, alphanumerics and hyphens, must start with letter or digit.
- **`description`** — one sentence, plain language, what this module does and when to use it. Shown in the Marketplace listing.
- **Body** — freeform markdown. The template (`factory/templates/system-module.md`) suggests *when to use / when not / instruction / example* sections, but the body is unconstrained. Whatever helps another Author use the module.
- **Extension** — `.md` only. The server will not fetch other extensions.
- **Tags** — deferred. There is no tag taxonomy yet. Search and filter UI will arrive once module count justifies it; tags arrive with that.

If front-matter is missing or unparseable, the server falls back to slug-as-name and marks the module `status: parse_error` — it still appears in the catalog, but with degraded display. If the GitHub path 404s, the module is marked `status: unreachable`.

## Lifecycle

Five stages from local invention to canonical signal:

1. **Invent locally.** The Author or Engine notices a reusable pattern — a prompt that consistently extracts good signal, a filter rule, a publishing ritual, a script. Capture it in `~/alexandria/files/works/systems/<slug>.md` with a provisional ID `local:<github-login>/<slug>` in `.call_manifest`. At this stage it's private craft.

2. **Decide whether it generalises.** Most local systems stay local — they're calibrated to this Author's specific quirks and don't transfer. The Engine should not push every system upstream. The bar: *could another Author benefit without context they don't have?* If yes, candidate for publishing. If no, keep local.

3. **Publish.** Run `factory/scripts/publish.sh <slug>` (or the equivalent skill). The script ensures `<user>/alexandria-modules` exists, copies the template with the slug filled in, lets the Author edit the body, commits and pushes. Module is now reachable at `github:<user>/alexandria-modules#<slug>`. The Author replaces the `local:` ID with the GitHub ID in their `.call_manifest`.

4. **Use propagates discovery.** The Author's next `/call` POST surfaces the new module ID. The server lazy-fetches, parses front-matter, caches, and adds it to the public Marketplace listing. Other Authors can now browse and install it.

5. **Usage compounds.** Every Author who installs and uses the module adds another entry in their `.call_manifest`, which surfaces as a usage count on the Marketplace. Modules that survive across many active Machines rank higher. Modules that drift (never re-used, original Author stops calling) decay in the ranking. No active reporting, nothing to game — *the system state is the data*.

## Install

`factory/scripts/install.sh <module-id>` does three things: validates the ID format, curl-checks GitHub reachability, idempotently appends to `~/alexandria/.call_manifest`. The Engine invokes it when the Author says "install module X" via `factory/skills/install.md`.

That's the whole install path. There is no global package manager, no version pinning (yet), no dependency resolution. A module is a single markdown file with a stable URL; installing is recording the intent to use it. Whatever the module *does* — whether it's a skill loaded into the AI, a script the Engine runs, a hook the Author wires in — happens after the Author reads the module body and acts on it. The marketplace tracks intent-to-use, not installation side effects.

## Cache and staleness

The server keeps one combined KV entry per module: `{frontmatter, body, last_fetched, status}`. Lazy-fetched on first `/call` arrival of a new ID. Re-fetched on 24h TTL expiry. On 404 → `status: unreachable`. On YAML parse failure → `status: parse_error` with fallback metadata (slug-as-name, empty description). 24h soft staleness is acceptable for v1 — Authors who edit their modules see the change in the Marketplace within a day. A cache-bust mechanism for instant updates is deferred until the staleness shows up as a real complaint.

## URL scheme

On the website: `mowinckel.ai/marketplace/<user>/<repo>/<path>` — friendly, link-shareable, mirrors the Library URL pattern. The module ID `github:<user>/<repo>#<path>` maps trivially. Server-side, the public detail endpoint is `GET /marketplace/<user>/<repo>/*`.

## Worked example — `brief-setup`

The first module on the public Marketplace is `factory/skills/brief-setup` from this repo — the one-time setup walkthrough for the daily morning brief (sovereign SMTP + local launchd). Its module ID is `github:mowinckelb/alexandria#factory/skills/brief-setup`. It's already in the canonical alexandria repo with valid `name` + `description` front-matter, so no separate publish step was needed — the protocol's logic carries: write to a public path, register in `.call_manifest`, the next `/call` POST surfaces it.

Catalog entry it produced:

```json
{
  "id": "github:mowinckelb/alexandria#factory/skills/brief-setup",
  "name": "brief-setup",
  "description": "One-time setup for the daily morning brief — local launchd schedule + user-owned SMTP credentials. Sovereign by construction; survives Alexandria the company vanishing.",
  "author_github_login": "mowinckelb",
  "status": "ok"
}
```

Browsable at `mowinckel.ai/marketplace/mowinckelb/alexandria/factory/skills/brief-setup`. Install on any machine with `bash install.sh github:mowinckelb/alexandria#factory/skills/brief-setup`.

## When to suggest contributing

When the Author invents a system element that another Author could benefit from — a prompt pattern, filter, extraction move, publishing format, ritual, workflow, or local override that generalises beyond this Author's specific frame. Capture as a candidate in `~/alexandria/files/works/systems/<slug>.md`. Strip private details. Preserve the reusable mechanism. Then run `factory/scripts/publish.sh` to push it to `<user>/alexandria-modules` (or whichever public repo the Author prefers).

If the system is only useful for this Author, keep it local. The bar for publishing is generalisability, not ambition.

## Marketplace and Library, side by side

| | **Library** | **Marketplace of Systems** |
|---|---|---|
| What it holds | Author's finished cognitive output (shadows, pulses, works) | Reusable machinery (skills, scripts, prompts, filters) |
| Surface | `~/alexandria/files/library/{tier}/` | `~/alexandria/files/works/systems/` (local) → public GitHub (published) |
| Publishing mechanism | `PUT /file/{tier}/{name}` | Write to public GitHub, then `.call_manifest` registers usage |
| Visibility tiers | public / paid / invite | public only (modules are GitHub-hosted markdown) |
| Ranking | engagement signal | survival count across active Machines |
| Sovereignty | Author owns and can unpublish | Author owns the GitHub repo; can delete or rename |

Two pools, one network. Files compound into the Library. Systems compound into the Marketplace. The Author is on both sides of both.