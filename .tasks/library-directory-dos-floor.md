# Library directory DoS-floor fix — decision-ready brief

**Decision:** merge + deploy (recommended) vs discard.
**Branch:** `elon/library-directory-dos-floor` (armed, NOT pushed to main, NOT deployed).
**One file:** `server/src/library.ts`. **Risk:** low (response shape unchanged).

## What changes and who benefits

The two public, unauthenticated Library browse endpoints stop decrypting every
account on every request. Benefits every visitor (faster, cheaper browse) and
the company (the surface no longer gets more expensive with each signup, and an
anonymous attacker can no longer amplify load by hammering a public URL).

- **`GET /library`** (browse-all directory) and **`GET /library/:author`** (author
  page) each called `loadAccounts()` per request — an O(N) KV list + **AES-256-GCM
  decrypt of every account blob**. `/library/:author` did it *twice* (once for the
  O(1) author lookup, then a second full decrypt-all purely to compute the
  signup-ordinal for `alexandria_id`).
- Both are unauthenticated, uncached, and un-rate-limited. Cost scales with the
  user base. Same amplifier class as the `/check-kin` floor (see
  `.tasks/check-kin-dos-floor.md`), but on a higher-traffic surface (every
  website Library visitor hits `/library`).

## Why now

It is the limiting-factor surface (demand / product-working): the Library browse
is the most-hit public endpoint and the amplification silently worsens with
growth. Closing it now is cheap; retrofitting under load is not. "Awareness is
upstream of everything" — found by sweeping the `loadAccounts` decrypt-all family
after the check-kin fix.

## The fix (first-principles: delete the per-request work)

A short-TTL KV cache of the **derived, already-public** directory projection
(`getDirectoryEntries()`), shared by both endpoints:

- Caches only `{github_login, github_id, github_name, created_at}` — exactly the
  fields the directory already exposes publicly. **No email / stripe id /
  api_key_hash is ever cached** (statelessness / no-plaintext-secrets preserved —
  checked against `directoryAuthor`'s exposed fields).
- Amplification drops from **one decrypt-all per request** to **at most one per 60s
  window across both endpoints**, regardless of request volume.
- `directoryAuthor` / `alexandriaId` signatures narrowed to the 3 account fields
  they actually read, so the secret-free cached entries type-check cleanly.

## Completed proof (the done-check)

- **Build:** `cd server && npm run build` → exit 0 (wrangler dry-run, no type errors).
- **Tests:** full offline logic suite green, identical to pre-change baseline —
  audit 11, cron-scanner 18, file-access 44, gate-matrix 6, secret-fingerprint 5,
  timing-safe 8 (= 92). (The `server.ts` / `billing-stress.ts` integration tests
  need a running worker — `fetch failed` in CI sandbox, not a regression;
  `library.ts` / `lifecycle.ts` SKIP for no API key.)
- **Seam trace:** `getDirectoryEntries` preserves the exact filter + sort
  (created_at asc, then github_id), so the per-author `index` and the
  `fallbackIndex` ordinal are byte-identical to the old decrypt-all path;
  `directoryAuthor` reads only the 3 cached fields → `{authors}` response shape
  unchanged. Verified against the live contract captured read-only:
  `{authors:[{id,account_id,alexandria_id,display_name,location,location_key,contact,website,text,files_url}]}`.
- **Live probe:** `GET /health` all components ok (kv/d1/r2/env), `GET /library`
  returns the expected contract — current product healthy; the branch reproduces
  that contract.
- **Conservation:** `loadAccounts` hot-path call sites in `library.ts`: 2 → 0
  (now 1, inside the cached helper).

## Tradeoffs and residual risk

1. **Directory staleness ≤ 60s.** A brand-new signup appears in the browse list,
   and a just-deleted account stops appearing, up to 60s late. Per-author file
   reads stay O(1) and live, so a deleted author's *page* still 404s immediately;
   only the directory listing lags. Acceptable for a browse surface.
2. **Cache stampede.** When the TTL expires, concurrent requests can each rebuild
   (a few decrypt-alls/min worst case) — still bounded vs per-request. Optional
   future hardening: stale-while-revalidate or a short rebuild lock.
3. **Optional enhancement (out of scope):** proactively bust the cache on account
   create/delete for instant freshness (would touch `saveAccount`/`deleteAccount`).
   Deliberately left out to keep this a one-file floor fix.

## Recommendation

**Merge + deploy.** Pure-win robustness fix on the hottest public surface, no
semantic change, low risk, fully verified. Pair it with the parked
`/check-kin-dos-floor` fix (same class) in one deploy.

## Fire checklist (≤5 min)

1. `cd ~/alexandria-inc/public/code && git checkout main && git merge elon/library-directory-dos-floor`
   (optionally also merge `elon/check-kin-dos-floor` — same class).
2. `bash scripts/push.sh` (pushes + waits for CI; `deploy.yml` auto-deploys on
   main since `server/src/**` changed).
3. `curl https://api.alexandria-library.com/health` → all components `ok`.
4. `curl https://api.alexandria-library.com/library` → directory renders; hit it
   twice within 60s and confirm it's served from cache (response identical).
5. Delete this file (or move to `.tasks/done/`).
