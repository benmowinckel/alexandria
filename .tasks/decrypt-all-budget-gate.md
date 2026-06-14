# Decrypt-all budget gate — decision-ready

**What changes / who benefits.** A CI gate that fails the build the moment a new
`loadAccounts()` (decrypt-every-account) call is added to `server/src`. Benefits
every user: it permanently closes the DoS-amplifier class that has now been
hand-fixed twice — `/check-kin` and `/library` both decrypted every account per
unauthenticated request, a cost that grows with every signup. The gate makes the
third instance impossible to ship silently.

**Why now.** Beats 3 and 4 each found and fixed one instance of this exact class
by hand. `accounts.ts:17` documents the convention in a comment ("never
`Object.values(accounts).find(...)`" — use `getAccountByLogin` for O(1)), but a
comment is not a verification loop — it relies on the next author noticing it.
This is precisely the "recurring problems demand permanent solutions" + "missing
verification loops demand new ones" case in `Principles.md`. The codebase already
uses this exact pattern for other invariants (`build.yml`: "only file-access.ts
may issue R2 .get calls", "only file-access/protocol.ts may build protocol/*
keys"). This extends that proven pattern to the decrypt-all class.

**What it does.** `server/test/decrypt-all-budget.ts` scans `server/src/*.ts`
(excluding `kv.ts`, which defines the function) and enforces a per-file CEILING
on `loadAccounts<…>()` call sites:

| file | ceiling | why it's allowed |
|---|---|---|
| accounts.ts | 2 | admin billing summary + the self-healing fallback inside `getAccountByLogin` (the sanctioned O(1) lookup) |
| auth.ts | 1 | auth-index self-healing fallback (O(1) on the hot path) |
| billing.ts | 1 | Stripe webhook / admin reconciliation — off the hot path |
| cron.ts | 2 | scheduled jobs — not a request path |
| routes.ts | 2 | `/admin/nudge` + `/admin/nudge-conversion` — admin-authed |
| library.ts | 2 | `/library` + `/library/:author` directory — **PENDING FIX** on branch `elon/library-directory-dos-floor` (surfaced loudly every run, not a failure — the fix is already armed) |

Adding a `loadAccounts()` anywhere (a new handler, or a new line in an existing
file, or a brand-new file) pushes a file over its ceiling and fails the build
with guidance (use `getAccountByLogin`, or cache a public projection). Removing
calls only lowers the count — never fails — and the follow-up is to ratchet the
ceiling down to lock the win in.

**Completed proof (done-check evidence).**
- Gate passes on `main` today: 10 call sites total, all within budget; library.ts
  surfaced as the known pending offender. `EXIT=0`.
- Gate actually fires (the seam that matters): a simulated new call in `worker.ts`
  (budget 0) → `EXIT=1`; a simulated 2nd call in `auth.ts` (ceiling 1) → `EXIT=1`;
  both restored → `EXIT=0`.
- `npx tsc --noEmit` clean; `npm run build` (wrangler dry-run) clean.
- Offline unit floor green (cron-scanner 18, secret-fingerprint 5,
  timing-safe-credential-compare 8, audit 11).
- Live product unaffected (read-only probe: `/health` all-ok, `/library` healthy).
  No source code changed, nothing deployed.

**Tradeoffs / residual risk.** The scan is text-based (like the existing
`build.yml` grep gates), so a `loadAccounts<` written inside a comment would also
count — a harmless false positive, resolved by editing the comment or bumping the
budget. It does not catch a decrypt-all written via a different helper name; it
covers the one real, recurring vector. Low blast radius: a test file + one CI line.

**The one step that needs you (the fire).** The gate file is on the branch, but
**wiring it into CI requires a credential decision only you can make.** The PAT
the remote runner uses (`ELON_REPO_PAT`) lacks the `workflow` OAuth scope, so it
cannot push a change to `.github/workflows/build.yml` (`remote rejected … without
workflow scope` — the documented gotcha in `alexandria-inc/private/CLAUDE.md`).

Two ways to fire, your call:
1. **Grant the scope, then wire it** (recommended — makes it gate on every push +
   PR, like the other architectural gates). Add `workflow` scope to `ELON_REPO_PAT`
   (or, if pushing yourself, `gh auth refresh -s workflow`), then apply this diff
   to `.github/workflows/build.yml` (after the "Server type check" step):

   ```yaml
         - name: Decrypt-all budget gate (no new loadAccounts() on a request path)
           run: cd server && npx tsx test/decrypt-all-budget.ts
   ```

2. **Discard** if you'd rather not enforce this in CI — the test file is still
   runnable on demand (`cd server && npx tsx test/decrypt-all-budget.ts`).

**Recommendation.** Take option 1, and ideally merge it together with the two
armed DoS-floor branches (`elon/check-kin-dos-floor`, `elon/library-directory-dos-floor`)
in one pass — then ratchet `library.ts`'s ceiling from 2 down to 0 in the budget
to lock the win. Branch: `elon/decrypt-all-budget-gate`. No deploy implied.

Delete this file once the gate is wired (or discarded).
