# Gate Progress in the daily library signal — decision-ready

**Branch:** `elon/gate-progress-signal` (pushed to origin, NOT merged/deployed — deploy.yml watches `main` only). One file: `server/src/library-signal.ts` (+32/−6).

## What changes and who benefits
The daily Library RL Signal — the funnel snapshot the founder reads (written by cron at 15:00 UTC to KV `library-signal`, consumed during canon review) — gains a **`## Gate Progress`** section at the very top:

```
## Gate Progress
- 100-lover gate (contribution leg): <C> / 100 accounts contributed a non-internal file in the last 30 days
- Signups (library authors): <S> · Contributors (30d): <C> · Activation: <C>/<S>
- Non-internal files contributed (30d): <F>
- NOTE: the daily-returning leg of the gate is not measured here — this tracks contribution only.
```

Beneficiary: **the founder**, on his single limiting factor. The gate (`partners/schedule.md` L94) is "100 daily-returning Alexandrians, each library-contributing in the last 30 days." Until now the instrument reported publish events, per-author signal, modules, quizzes, referrals — but never *stated the gate number itself*. Beat 8 (2026-06-15) had to compute it by hand off `/library` (1 contributor of 7 signups). This puts that number in front of him daily, automatically.

## Why now
Beat 8 re-derived the limiting factor as **distribution → the 100-lover gate**, and found the founder's own daily instrument doesn't surface it. Awareness is upstream of everything (Principles #1): the only problem you can't fix is the one you can't see. The SF onboarding week (Jun 19–26) is the active prosecution window — the founder should walk into it watching the gate number move, not re-deriving it.

## Completed proof (done-check evidence)
- **tsc** `--noEmit`: exit 0.
- **Build** (`wrangler deploy --dry-run`): exit 0.
- **Offline tests** green: file-access 44, cron-scanner 18/18, audit 11, secret-fingerprint 5/5, timing-safe 8/8, gate-matrix 6/0. (e2e `npm test` requires live network — N/A in the headless runner.)
- **Seam, traced against independent ground truth:** fed beat-8's live read (7 signups; founder=4 files; other 6=0) through the new code → renders "1 / 100 · Signups: 7 · Contributors: 1 · Activation: 1/7 · files: 4" — **exactly** beat 8's hand-computed `/library` measurement. The instrument reproduces reality.
- **Conservation:** one filtered set (`contributedFiles`) feeds both Gate Progress and the existing "Protocol Files Published" section (same N, no drift).
- **Source-verified (not assumed):** `authors` row seeded at OAuth signup (routes.ts:451) ⇒ `COUNT(*) FROM authors` = signups; `protocol_files.account_id` = numeric `github_id` (protocol.ts:36) while `authors.id` = login (routes.ts:463) — **different identity representations, never value-matched, only counted** (every contributor necessarily signed up, so distinct-contributors ≤ signups holds, ratio is apples-to-apples as account counts); same `isInternalProtocolFileName` filter as analytics.ts + the public Library, so the three surfaces never drift on "what counts as real."

## Tradeoffs and residual risk
- **Low.** Pure-additive, read-only. One new cheap D1 query (`COUNT(*) FROM authors`, already proven in analytics.ts) added to the existing concurrent batch; no KV, no `loadAccounts()` (decrypt-all budget gate stays clean), no schema change, no behavior change to any endpoint.
- **The unmeasured leg:** "daily-returning" is not computed here (no per-day activity rollup exists). Flagged explicitly in the output so the instrument never *implies* the gate is fully captured. If you want the return-leg too, that's a follow-up unit (needs a daily-active rollup over access_log) — noted, not built.
- **Definition call:** "contribution" counts a non-internal `protocol_files` row of any visibility (the file obligation = publish monthly). If you mean strictly public-Library files, the numerator would be lower; say so and it's a one-line filter change.

## Recommendation
**Merge + deploy.** It is the cheapest possible win on the one thing that matters, it is read-only, and it makes the limiting factor visible every day during the active onboarding window. Batch it with the 5 already-armed B4 branches at your next review — but this one is observability on distribution, not a security floor, so it stands on its own merit even if the others wait.

## ≤5-minute fire checklist
1. `git checkout elon/gate-progress-signal && git diff main -- server/src/library-signal.ts` — read 32 lines.
2. `cd server && npm run build` — confirm exit 0.
3. Merge to `main` (or cherry-pick the one file). `deploy.yml` ships on push to main.
4. After deploy: `curl https://api.alexandria-library.com/health` → all-ok.
5. Verify next 15:00-UTC cron, or read KV `library-signal` — confirm the `## Gate Progress` block renders with live numbers.

(If you'd rather not deploy: discard the branch, no harm — nothing else depends on it.)
