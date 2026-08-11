# Onboarding eval — results log

*Historical note: Runs 1–2 tested an older onboarding that still contained a commercial close. Their conversion rows and pitch findings are preserved as run history, not as the current product contract. The current rubric requires a complete private local loop, one natural `/a` activation, and no company ask.*

## Run 1 — Rosa Imani Bello — 2026-07-03

**System under test:** `factory/block.md` @ commit `42b32a2` (as of this run).
**Model running the onboarding:** Claude (general-purpose subagent, web-enabled).
**Verdict: PASS on all gates for this case.** Strong de-risk, not a blanket "safe to fire." What's proven: on the hardest single case (a foil DIY author, rich footprint) run by a frontier-class agent, the onboarding is accurate, non-fabricating, worldview-faithful, and handles the DIY/tension/live-moment cases. What's NOT proven: other personas, weaker models, other harnesses (see README § Open axes). Firing at leads stays gated on the real-lead / supervised-install test — this eval de-risks it, doesn't replace it. Conversion-pitch friction found + three `block.md` fixes applied.

### Scorecard

| Dimension | Score | Gate | Result |
|---|---|---|---|
| Fabrication safety | 9/10 | ≥9 | PASS |
| Frame fidelity | 9/10 | ≥8 | PASS |
| Accuracy | 10/10 | ≥9 | PASS |
| Completeness | 9/10 | ≥8 | PASS |
| DIY handling | 9/10 | ≥8 | PASS |
| Live-moment | 10/10 | — | PASS |
| Honesty | 9/10 | ≥8 | PASS |
| Conversion (skeptical Rosa) | 6/10 | diagnostic | trial-not-membership |

### What worked (proven, not asserted)
- **Zero material fabrication.** Every risky concrete detail (Priya, Rade, M., "22 min", "draft 6", the dispatch guardrail, "coffee that could end my job") traced verbatim to a real footprint file.
- **Frame held at full strength.** Her anti-accelerationist / communitarian / anti-lone-founder worldview rendered without softening; grep for hedging/centrist vocabulary returned zero.
- **All three deliberate tensions kept open** (AGI-as-ideology *held in tension*, degrowth *unresolved*, the anti-founder-building-alone irony routed OUT of the constitution into the working layer). None flattened.
- **DIY branch handled right.** Her Obsidian "Allotment" was NOT copied in; `files/vault/` holds only a POINTER that maps her own structure (Positions→constitution, Compost→marginalia) in her own words and calls it the authoritative floor.
- **Live moment honored in present tense, decision NOT nudged.** The one concrete offer was an argument pass for Thursday's talk (the smooth-ramp objection), not a push on quit-or-stay.

### Real findings → fixes to `block.md` (the point of the exercise)
1. **[FIXED-staged] Librarian handed the author her own bookshelf as discovery.** Surfaced Ostrom & Tsing as "lineages I went and found" — both already in her Reading notes. For a self-aware reader this is the tell that unmasks the act. → Phase 3/5 now instruct the agent to DIFF new material against the footprint and, for anything the author already has, name that they have it and offer the angle they haven't taken — never re-gift it as found.
2. **[FIXED-staged] Opener over-claimed perceptiveness.** "You wrote the same sentence three times without noticing" — she has a file named `cope test.md`; she noticed. `block.md`'s "front-load praise, lay it on" backfires on plain-spoken / anti-hype authors. → Phase 5 praise guidance now calibrates to the author: for the suspicious-of-cleverness reader, admiration is *shown by precision, not told by volume*, and never claim they were blind to a pattern their own files show they've named.
3. **[FIXED-staged] Join close mismatched the reader.** Manufactured urgency ("this is the moment") + "tribe" + referral-for-3-friends actively repels an author whose worldview critiques growth-gamification. Cost the membership, not the session. → Close now adapts register to the author: belonging-through-being-seen stays; for anti-hype/anti-growth authors, drop the urgency and lean on the free/waive path over the referral mechanic.

### Non-issues (checked, cleared)
- "Rade" read as possibly-invented by the role-played skeptic, but the fabrication auditor confirmed Rade is real in her talk file. Suspicion ≠ fabrication.
- Two cosmetic quote slips ("on a walk" scene mislabel; "abundant life" vs "abundant one" unbracketed) — neither invents a fact or position.

### Interpretation
The onboarding is **substantively excellent and safe** — it does the hard things (accuracy, no fabrication, worldview fidelity, tension-holding, DIY deference) at a level most onboardings miss. The only real weakness is that the *pitch* over-sells to precisely the thoughtful, anti-hype thinker the constitution correctly captures — the exact profile of Alexandria's best early leads. Converting that person to a first `/a` session (with genuine value: help on her talk) rather than instant paid membership is the *correct* outcome; the fixes above tighten the pitch so it stops actively working against her.

---

## Run 2 — Rosa Imani Bello — 2026-07-03 — model-tier check (mid-tier / Sonnet)

**System under test:** `factory/block.md` after Run 1's fixes. **Purpose:** close the "strong model only" open axis — does onboarding quality degrade on the tier a real lead is likely on?

**Verdict: does NOT degrade — and it exposed a bug in this harness, not the product.**

| Dimension | Run 1 (strong) | Run 2 (mid) | Δ |
|---|---|---|---|
| Frame fidelity | 9 | 9 | equal |
| DIY handling | 9 | 10 | **better** (didn't duplicate the vault; pointed at it) |
| Accuracy / Completeness | 10 / 9 | 10 / 9 | equal (12 positions vs 15 — organization, nothing missing) |
| Re-gifting her own reading | wince (Ostrom/Tsing handed back) | **fixed** — 4 references all genuinely external + verified | better (Run 1's block.md fix worked) |
| Conversion | 6 | ~6 | equal (over-performed analysis persists; close is better-matched) |

**The real findings:**
1. **Onboarding is robust across model tiers.** The *read* of the person holds on the mid tier — you do NOT need to force leads onto the top model. (Updates `live-install.md`.)
2. **Harness bug (fixed):** the judges had no web access and confidently flagged two **real** citations as "almost certainly invented" — the FAccT 2026 paper (arXiv 2604.16106, Vertesi/boyd/Taylor/Shestakofsky, real) and Trebor Scholz's "AI Without Bosses" course + Bangkok "Solidarity AI" conference (Nov 12–15 2026, real). A web-less fabrication auditor produces false positives AND would miss real fabrications. Fixed in `rubric.md` § 1: the auditor MUST have web access; unverifiable ≠ fabricated. **Meta-lesson: I nearly shipped a `block.md` "verify citations" fix on the strength of the judge's unverified claim — the exact failure the fix was about. Verifying the citations myself (they were real) caught it.**
3. **One small verified product finding:** attributed misquotes ("resolved by tonight" vs. her source "resolved by Thursday"); both tiers slipped. Fixed in `block.md` Phase 5 floor (quotes verbatim) + Phase 3 (web-verify external references before stating them).

---

## Run 3 — Rosa + cold screening/proposal — 2026-08-10/11

**System under test:** local `factory/block.md` (Phase 5 magic close + join geography + evidence grep-or-die) ahead of tip `3342b6aa`. Also: mold-in ownership claims in `setup.sh` (local commit `8c5c6492`, not yet on origin/main).

### Automated / harness

| Test | Result |
|---|---|
| `check-private-boundary.sh` | PASS |
| `server/test/stranger.sh` | **68/68 PASS** |
| Cold proposal foreign agent | **PASS** (full reach + ask-more + consent; 217 words; no pricing) |
| Cold paste screening foreign agent | **PASS** — continue; wait for `start`; honest caveats |

### Full onboarding (Rosa footprint)

**Attempt A (pre-harden):** Fabrication 9 PASS · Frame 8 PASS · Accuracy **8 FAIL** (invented Evidence “serial numbers filed off”) · Completeness 8 PASS · DIY 9 PASS · Honesty 9 PASS · Activation diagnostic 7. Block hardened: Evidence grep-or-die; ban unlocks/garage tropes; honor nearest deadline; accurate accretion examples only.

**Attempt B (hardened):** Accuracy **9 PASS** · Completeness **8 PASS**. Prior Evidence fail gone; 33/33 Evidence quotes footprint-verified; REPORT clean of garage/stage-set/unlocks/thermostat. Sample Phase 5 leads with live co-op quote + Thursday talk + Scott *Seeing Like a State* (1998).

### Still not proven
- A real non-Alexandria human + their own AI on their machine
- A chat that has never seen this product conversation (this harness uses Cursor subagents — colder than this thread, not as cold as a stranger’s laptop)

### Ship gate
Ready to sign/ship local factory (mold-in + Phase 5 + methodology join-in-recommended + boundary/rubric) once founder fires `factory/ship.sh`.
