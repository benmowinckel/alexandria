# Join-funnel friction pass — before the first real cohort

One pass on the stranger's path from /join to first /call. Parked 2026-07-17 out of the collective-surfaces audit (three parallel agents + live smoke tests + hand-verification of every negative finding). Not urgent at n=1; becomes the limiting factor the day real signups start, because every user crosses this bridge before the collective can generate any signal. Architecture context: `AGENTS.md`.

## What the audit confirmed SOLID (don't re-litigate)

- Library: publish→gate→read wired end-to-end, all four visibility tiers live (`file-access.ts` pure gate), XSS-safe rendering, per-author scoping. Coherent v1.
- Marketplace: loop closed — live catalog (curled prod 2026-07-17, 200 + real ranked data), /call logs to D1, 90-day survival window + `?all=1` per the locked 2026-06-09 decisions, offline-signed module pulls (fail-closed), description sanitization. Zero volume beyond founder modules — by design at n=1.
- `setup.sh:856-892` DOES verify the API key against `$SERVER/alexandria` before persisting; 401 → quarantine to `.api_key.rejected`; network-fail → fail-open (correct, offline installs legit). An audit agent claimed otherwise — verified false, do not "fix" this.
- Canon delivery is client-driven (GitHub + offline-signed manifest), not in the /call response. Deliberate, stronger than server-push. a2 §The Spine reconciled 2026-07-17.

## The pass (in order)

1. **Walk the stranger's path with a fresh GitHub account**: /join → OAuth → welcome page → copy key → install → first session → first /call → check `installed_at` stamped and referral credited in D1. This single walkthrough validates or kills every item below — do it first.
2. **Welcome-page key handoff**: the key shows once and the happy path relies on a correct manual paste. Consider rendering the full install command with the key embedded (one copy target, not two). Mitigant already live: `/account/rotate-key` self-serve rotation.
3. **Referral attribution hops**: ref survives /join→/start→`~/.referrer`→first /call; a typo'd ref dies silently and kin credit is the free-tier promise. Verify end-to-end in the walkthrough; surface validation errors at entry, not silently downstream.
4. **Handoff TTL 120s** (`server/src/routes.ts:528`): fine for the automatic redirect chain; there is no retry if it stalls. Check behavior on a slow connection during the walkthrough; only extend if it actually bites.

Delete this file when the pass ships.
