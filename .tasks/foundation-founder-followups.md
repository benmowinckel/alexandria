# Follow-ups — foundation/founder canon split (shipped 2026-06-15)

The foundation/founder/marketplace restructure + sovereignty hardening shipped and verified live
(commits `2bf8805` canon + `4903692` rest; signature + canon integrity-gate verified end-to-end;
server deployed green; smoke + stranger e2e green). Two threads remain.

## 1. foundation.md invariant wording correction — awaiting re-ship (founder passphrase)

The shipped `factory/canon/foundation.md` invariant overclaimed — *"nothing is auto-applied to your
files … a leaked signing key cannot push a change you did not accept."* False for the payload, which
auto-updates under signature every session (`shim.sh:98-100`). Corrected in the working tree to:

> - **your cognition changes only by your action.** No canon or constitution file is auto-applied —
> the system verifies upstream against an offline-signed manifest, *notifies*, and you pull. The sole
> exception is the verified mechanism itself (the hook payload), which auto-updates only if it passes
> that signature check — the deliberate channel that lets security fixes reach you fast. A leaked
> signing key could push mechanism code; it can never silently rewrite your cognition.

Deploy with: `bash factory/ship.sh "fix: foundation invariant — cognition is pull-only, mechanism auto-updates under signature"`
(re-signs manifest + foundation.md; needs the offline passphrase). **Do NOT commit foundation.md via
plain git** — it would desync the signed manifest and break the integrity gate for every Author. Low
urgency: the deployed claim is inaccurate, not exploitable (the payload auto-update was always
signature-gated).

## 2. ax-sync derivatives — propagate the Foundation/Founder model

`private/truth/a2.md` now defines Canon as **Foundation** (the minimal closed-loop *system*, objective)
+ **Founder module** (general-optimal, download-and-personalise) + **marketplace** (person-specific),
plus the sovereignty / notify-and-pull / two-zone / ingestion-log invariants. Investor + public
derivatives still describe the old *"canon = the founder's machine / Layer 1-2"* model and need a
surgical ax-sync regen:
`private/partners/{Memo,Brief,fundraise,investor}.md`, `public/code/public/docs/{Whitepaper,Mechanics}.md`.
Deferred at close: a concurrent tab was editing `Whitepaper.md` — don't race it. (`factory/canon/axioms.md`
header was already reframed + deployed.)

## Resolved (flip only if founder disagrees)

Should the payload (mechanism) *also* be notify-pull, not auto-update-under-signature? **No** — keep the
verified mechanism auto-updating (fast security-fix propagation); notify-pull only cognition. The
corrected invariant in #1 states this. Flip only for full "nothing changes without my action" at the
cost of slower security response.
