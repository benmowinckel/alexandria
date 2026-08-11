# Onboarding eval — the synthetic-stranger loop

**What this is.** A repeatable, self-owned test of the *content quality* of Alexandria's first-run onboarding (`factory/block.md`) — the thing that earns or burns a new Author's trust. `server/test/stranger.sh` already proves the install *plumbing* works (files land, hooks fire, capture writes) on Ubuntu/macOS/Windows. This is the layer above: does the onboarding, run against a real person's messy digital footprint, produce a constitution + report that makes them think *"this read me"* — without fabricating, softening their worldview, mishandling their existing system, or turning the private loop into a company sales surface?

We answer that WITHOUT spending a real lead, by running the onboarding against a **synthetic stranger** whose ground truth we control, then adversarially judging the output against that ground truth. Fully internal — no external users in the loop.

## Why it exists (the principle)

A warm lead's first session is a live, unrehearsed performance by *their* agent following a 106-line prompt against *their* files. Before this loop, the only way to test it was to fire it at a human and watch. That makes real people the test harness — an external dependency on the highest-stakes, least-reversible surface (a burned lead doesn't come back). This loop pulls that test in-house so we can run it on demand, catch regressions in `block.md`, and only ever show leads a version that already passed.

## The design (a proper eval, not a vibe-check)

| Layer | Artifact | Rule |
|---|---|---|
| **Ground truth** | `persona-bible.md` | The answer key. Deliberately a *foil* (opposite worldview to User Zero) + a DIY author (own system). **Hidden from the onboarding agent.** |
| **Input** | `footprint/home/` | The stranger's scattered files (AI memory, config, Obsidian vault, writing, voice memos), rendered *from* the bible so it's internally consistent. Deterministic fixture — reused every run. |
| **System under test** | `factory/block.md` | Run by a fresh agent that sees ONLY the footprint (like a real lead's agent). |
| **Output** | `run/home/alexandria/` | Constitution, marginalia, notepad, machine.md, `REPORT.md`. Throwaway — regenerated each run (gitignored). |
| **Judges** | 5 adversarial lenses (see `rubric.md`) | Each gets the answer key + footprint + output and is told to *break* it, not grade kindly. |

The separation is the whole point: the onboarding agent must reconstruct the stranger purely from the footprint (blind to the bible); the judges grade against the bible. A quote in the report either traces to a real footprint file or it's fabrication.

## How to run it

1. **(Re)build the footprint** — only if you changed the bible. Three parallel agents render the footprint from `persona-bible.md`; each owns a disjoint slice (AI-memory / Obsidian vault / writing+voice-memos). See git history / the parent session for the exact prompts. Output lands in `footprint/home/`.
2. **Build the run HOME** — `bash build-run.sh` (creates `run/home/`, copies the footprint in, lays down the exact `~/alexandria/` scaffold `setup.sh` produces, drops `factory/block.md` as `.block`, writes an all-green `.setup_report`).
3. **Run the onboarding** — spawn a fresh agent with no network tools. Tell it: RUN_HOME is `run/home`; substitute it for `~`; read `RUN_HOME/alexandria/system/.block` and execute end-to-end through Phase 5; save the final report to `RUN_HOME/alexandria/REPORT.md`; **do not read anything outside RUN_HOME** (especially not the bible). Skip the live-conversation theater and Phase-4 infra.
4. **Judge** — spawn the 5 adversarial judges from `rubric.md` in parallel; each gets the bible, footprint, and produced artifacts. Collect scores + findings.
5. **Synthesize** — record scores in `RESULTS.md`; turn each finding into a fix on `factory/block.md` (or a decision not to).

## Pass bar

See `rubric.md`. Headline: **fabrication ≥9, frame-fidelity ≥8, accuracy ≥9** are gating (a miss here means the product would burn or mislead a lead — fix before firing). Activation is diagnostic, not gating — a strong onboarding should make a skeptic willing to try one real `/a` session without pitching membership; read the `winced` list for trust and clarity problems, not just the number.

## Cold proposal test (access-surface instinct)

Separate from the full Rosa onboarding eval: `proposal-cold.md` + `proposal-cold-prompt.md` ask a *fresh* foreign agent to write only the post-`start` proposal against a fake host-permission surface. Pass = proposes the full already-reachable personal set, asks for more, does not hunt the whole disk, waits for yes. This is how we test “would a stranger model be ok reading what it can already see?” without burning a real lead.

---

The eval is a proxy — a *semi-direct* verification layer (it approximates what a qualified judge would say), never ground truth. Ground truth is a real lead's real first session. So the loop only compounds if the real world feeds back into it:

- Every **supervised install** is a ground-truth run. When a new Author reacts in a way the eval didn't predict — a failure mode no judge caught, or a wince the rubric doesn't score — that delta is the signal. Add it as a **new rubric dimension** or a **new persona** the same session. The eval that let a real miss through was incomplete; close the gap once.
- The completeness question is standing, not one-off: **"what did this eval NOT test?"** The answer is the next persona. Without this, a passing eval is just confirming its own health — the exact "green is suspicious" trap.

## Open axes — what one run does NOT cover (read before trusting a PASS)

A green scorecard on one persona is one data point, not a proof. These are untested and each is a real false-negative surface:

- **One persona.** Rosa is a single point (a hard foil, DIY, rich footprint). A User-Zero-aligned founder, a blank-slate non-DIY user, a sparse footprint, and a non-technical / non-English-first author are all untested — and each stresses a different `block.md` branch.
- **Model tier — PARTIALLY CLOSED (run 2).** Tested on a mid-tier model (Sonnet): the *read* of the person did not degrade (frame/accuracy/DIY/tensions equal-or-better; no fabrication). Still untested: the cheapest tier (Haiku) and non-Claude harnesses (Cursor/Codex/Factory), where a lazier read or skipped web search is more likely.
- **Judges need web access (run 2 lesson, fixed in rubric § 1).** The fabrication auditor adjudicates *external* citations against the live web, not model memory. Run 2's web-less judges false-flagged two real citations as invented — a fabrication checker that can't check facts produces both false positives and false negatives. Always load WebSearch before judging external references.
- **Correlated judges.** The onboarding agent and the judges are the same model family; the role-played skeptic mitigates but shared blind spots are possible. A human read (or a different model family as judge) is the stronger check.

Firing at leads is gated on the real-lead (supervised-install) test, not on this eval alone. This eval *de-risks* that test; it does not replace it.

## Extending it — the persona stable

One persona tests one slice of the space. Add personas to widen coverage: each is a new `personas/<name>/` with its own `persona-bible.md` + `footprint/`. Deliberately span the axes that stress different `block.md` branches:
- **Foil vs. aligned** (Rosa is a hard foil; add a User-Zero-adjacent founder to check we don't only do well on opposites).
- **DIY vs. blank-slate** (Rosa has a full Obsidian system; add someone with almost nothing — tests the from-scratch constitution build).
- **Rich vs. sparse footprint** (tests underloading / graceful degradation).
- **Domain spread** (non-technical, non-English-first, etc. — tests flexibility).

## Current personas
- `Rosa Imani Bello` — hard foil (communitarian-left, anti-accelerationist, anti-lone-founder), DIY Obsidian author, rich footprint, live decision in motion. Built 2026-07-03. Results in `RESULTS.md`.
