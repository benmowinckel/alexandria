# Capture Pipeline

## Module ID

`github:benmowinckel/alexandria#factory/systems/capture-pipeline`
*(user0-origin, contributed 2026-07-01; machinery: `factory/scripts/capture_resolver.py`, installed by `setup.sh` as a SessionStart hook)*

## Source

user0, 2026-07-01, after a 73-capture drain accepted "payload locked" gaps he then rejected:

> "You should be proactive and figure out how to solve the problem rather than just accepting that you couldn't see it. […] Overall, just review the entire process and optimize the process — the entire flow of when I save something on my phone."

## Problem

Universal across Authors: they save things all day from the phone — X posts, links, screenshots, articles — and without a pipeline the saves rot. Three failure classes, all observed live: backlogs grow invisibly (link-shares sat 8 days uncounted); captures resolve to lossy stubs while the actual payload lives in an attached image, a linked article, or a reply thread; and extraction that does happen never reaches the Author's mind because there is no absorption surface. Vault intake is upstream of everything — a cold vault caps every downstream session.

## Pattern

Five stages, two owners. The Author touches only the ends: one save gesture at the top, paced absorption at the bottom. Everything between is Engine work, run to completion.

1. **Capture (Author, ~2s).** Share sheet → iCloud folder → `vault/input/` (symlinked by setup). X posts arrive as HTML, links as `.txt`, media raw. Capture must never cost more than the gesture.
2. **Resolve (machine, session start).** `capture_resolver.py` (SessionStart hook) turns raw into readable derivatives in `vault/_input/`: X HTML → markdown via the tweet API **with photos downloaded alongside** (visually readable by the model) **and X Article bodies embedded**; `.txt` links → resolved titles (YouTube via keyless oEmbed, else page `<title>`); anything unresolvable stays raw **and is counted in the pending nudge**. Idempotent, per-item isolated, never deletes.
3. **Extract (Engine, any live session).** Per-item, never gist-of-the-pile: each capture gets a dedicated extraction to `vault/saved/<stem>.analysis.md` (frontmatter: `source`, `captured`, `passes`; body: Signal / Why they saved it / Tension / Gaps) plus one ledger line, then the files move to `saved/`. Parallel subagents make pile size irrelevant (73 items ≈ 10 minutes, measured). **The gap rule: a gap is only legitimate after the fetch chain fails** — local HTML → tweet API → linked article → downloaded media read visually. "Image unviewed" with the URL in hand is a protocol violation, not a gap.
4. **Land (Engine, same session).** Constitution/marginalia deltas flow live where warranted; the Author's absorption surfaces get restocked.
5. **Absorb (Author, their pace).** The ledger (`vault/saved/ledger.md`) is the single absorption surface: one checkbox line per item, unchecked = extracted-not-absorbed, checked only on genuine engagement. Pile size is never homework.

## Principles embodied

Awareness-upstream (the pending nudge + marker make invisible backlog growth impossible); source/derivative + never-delete (raw stays beside its analysis; richer passes append to `passes`, never rewrite); ground-truth proximity (the gap rule — payload over placeholder); bitter lesson (schemaless prose analyses — a sharper model re-extracts more from the same raw with zero migration); humans-out-of-maximisation-loops (extraction is pure Engine; the Author only absorbs).

## Operation

Machinery: `capture_resolver.py` as a SessionStart hook (installed by `setup.sh`; intake folders + iCloud symlink also wired there); drain protocol in `canon/methodology.md § Session-start input check`. Known failure classes (the mirror — extend as drains teach):

- Listicle accounts put the payload in **reply threads** with bait images attached — media download cannot recover these; only thread capture can. Open gap.
- Videos (X + YouTube) are catalogued, not transcribed, until a cheap transcription path exists. Open gap.

## When Not To Use

Authors who never capture from the phone have no intake to resolve. Authors who want archive-only (capture without cognitive development) run the resolver + ledger and skip the constitution/marginalia landing — the pipeline degrades gracefully to a well-indexed archive.

## Marketplace Note

user0-originated. Generalises because the phone→mind gap is structural for every Author: capture is easy, resolution is lossy by default, and extraction without absorption is filing, not development. Composes with `internalization-loop` (the absorption side of the same loop — this module gets signal into the files; that one gets it into the mind) and `state-based-sync` (the pending report verifies the current state of both intake folders, not deltas). Design constraint (user0, 2026-07-01, X MCP evaluation): capture surfaces must ride **account-free, zero-cost rails** — a capture path requiring a per-user paid API account does not generalise.
