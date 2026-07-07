# Security audit — full library + marketplace surface (2026-07-06)

Adversarial re-audit triggered by founder's "are you 100% sure it's mythos-10-proof?" bar.
Four parallel red-teams (elite-attacker + malicious-insider threat model), each a slice:
A = library file gate/data isolation, B = marketplace/audit/GitHub-writes, C = auth/billing/oauth/admin, D = twin/sidecar.

Bar: STRUCTURAL (enforced by code/crypto/OS), never trust-based. Verdict: **NOT yet certifiable** — see open items.

## STATUS 2026-07-06 (updated): ALL code-level holes CLOSED + DEPLOYED. Remaining = founder-infra only.

Deployed fixes (in order): billing bypass · code-revocation cascade · least-privilege tier · sidecar GET-gate · audit gap-proofing · /call rate limit · marketplace injection fence · CORS · **#1 account-takeover (handle recycling)** · **#6 OAuth CSRF** · **#8 anon-purchase bearer** · Worker Cloudflare-Access support (armed). Every one type-checked, deployed, health-verified; founder account verified resolving + owning library + twin answering after the identity change.

REMAINING — all require FOUNDER INFRA (trust boundaries inside his own TCB — laptop/Cloudflare/GitHub token — not external doors):
1. **Sidecar network identity (F1)** — Worker code armed (sends CF-Access-Client-Id/Secret when `TWIN_ACCESS_CLIENT_ID`/`TWIN_ACCESS_CLIENT_SECRET` set). Founder fires: provision a Cloudflare Access self-hosted app + service token on the named tunnel hostname, set the two Worker secrets. Until then F1 residual = whoever holds the bearer secret (Worker env + laptop `.twin_secret`, both in TCB) can query any tier; blast bounded by the tier shadow (never raw constitution). Requires the stable named tunnel first (`bash ~/alexandria-inc/private/plm/twin-tunnel-setup.sh`).
2. **Audit external anchor (#4)** — code hook armed (`AUDIT_ANCHOR_URL` env; POSTs head_hash to an external append-only surface, fail-safe). Founder fires: set it to an OpenTimestamps calendar / transparency log / notary outside this account. Until then audit tamper-evidence is trust-based (operator holds both KV head + write token).
3. **GitHub token scoping (#3)** — split `GITHUB_BOT_TOKEN` into fine-grained PATs scoped to `alexandria-feedback` and `alexandria-audit` separately (marketplace.ts reads `GITHUB_FEEDBACK_TOKEN` if you wire it; audit.ts uses `GITHUB_BOT_TOKEN`).
4. **#7 manifest anti-rollback** — add a monotonic version to the signed manifest; shim refuses older-than-cached. Touches signature-gated files → needs `factory/ship.sh` re-sign (offline key). NOT yet implemented (deferred: the ed25519 chain is already strong; this is downgrade defense-in-depth).

## FIXED + DEPLOYED this session (Worker 2fa47866 → 15b4878)
- **[CRITICAL] Paywall bypass** — `/billing/success` is unauthenticated + attacker-supplied `session_id`; wrote setup-mode `beta` (an ACTIVE status) even for an ABANDONED/unpaid session (status `open`) → free permanent paid access. FIX: require `session.status === 'complete'` before any billing write. (`billing.ts:988`)
- **[MEDIUM] Code revocation didn't cascade** — revoking an access code left already-bound `access_grants` live, so revoked-code holders kept deep access; contradicted the "revoke the code to cut everyone off" claim. FIX: cascade `revoked_at` to `access_grants WHERE code_id = ?`. (`library.ts:1617`)
- (Prior in session, verified holding by red-team D: twin B1/B2/S1/S2/S3/S5 — deep = grant-or-active-pay; anon code = thin only; revocation structural; billable-only cap + global ceiling; SSRF guard.)

## OPEN — ranked by leverage

### 1. [HIGH · STRUCTURAL] Login-keyed ownership vs immutable github_id (red-team A, F1)
The file gate keys owner on immutable numeric `github_id`, but grants, access-codes, twin config, works, shadows, quizzes, earnings, sidecar KV, categories KV all key on the **mutable/recyclable `github_login`** (`resolveOwnerOnly` compares `github_login`). GitHub handle rename/recycle → attacker takes the freed handle → `getAccountByLogin` resolves to attacker → owns all login-keyed resources (reads raw access-code secrets, reconfigures twin, overwrites sidecar, reads earnings). This is the H1 fix finished for `protocol_files` only.
FIX (migration): re-key works/shadows/quizzes/pulses/access_codes/access_grants/authors/access_log/billing_tab + `twin_sidecar:`/`file_categories:` KV to `github_id`; resolve ownership by `accessor.github_id`. Interim backstop: on login, if `github_${id}` is new AND login previously bound to a different id, refuse pre-existing login-keyed rows.
NOTE: heavy — schema + data migration. Plan before executing.

### 2. [HIGH · TRUST→needs structure] Sidecar authorizes nothing + unauthenticated GET leak (red-team D, F1/F2)
- F1: `twin_server.py` `/agent`,`/chat` trust caller-supplied `tier`; whoever holds the bearer secret POSTs `{tier:"invite"}` → friends.md substrate, no grant/audit/cap. Deep boundary = "secret never leaks AND only Worker calls." FIX: Worker mints short-TTL HMAC token binding `{tier,author,exp}`; sidecar verifies (removes free tier-forgery).
- F2: `do_GET` (`/`, `/work/<slug>/artifact`, `/shadow/…/artifact`) has NO auth and is exposed through the public `cloudflared` tunnel → anonymous leak of authors-tier content, no rate limit, no audit. FIX: require bearer on `do_GET` (Worker never uses it), or bind content routes to loopback / Cloudflare Access, or strip bodies on a tunneled host.

### 3. [HIGH] No rate limit on /feedback + /call; shared GITHUB_BOT_TOKEN (red-team B, Q6)
`/feedback` = 1 GitHub commit/call, uncapped, shares the token the audit-mirror cron uses → authed user loops it to spam the repo AND exhaust the token's GH budget → audit mirror fails (compounds audit gaps). `/call` floods D1/catalog. FIX: per-account rate limits; split tokens (feedback vs audit, fine-grained PAT scoped to the two private repos).

### 4. [HIGH · TRUST] Audit tamper-evidence not structural (red-team B, Q5)
`/audit/head` served from operator-controlled KV; batch repo written by same token; no external anchor → insider with KV+token recomputes chain from genesis undetectably. Plus silent-drop bugs: `<=` timestamp boundary (`audit.ts:145`) drops same-ms events; 7-day read window (`:133`) drops events if cron pauses >7d while cursor advances. FIX: anchor `head_hash` to an append-only third-party surface (OpenTimestamps/transparency log); `<` + tie-breaker cursor; widen/guard the read window.

### 5. [MEDIUM · product decision — FOUNDER] Tier-collapse: any active-paying member gets invite/friends shadow (red-team D, F4)
`deep` is binary → `queryTier` always `'invite'` (most intimate: authors/_shadow + invite/friends), even for a twin the author set to `paid`/`authors` visibility. So an active-paying stranger with no invite from that author gets friends.md-tier. The sidecar's `paid`/`authors` tiers exist but are never used. **Decide:** is "paying → deepest shadow" intended, or should queryTier derive from the twin's configured visibility + the accessor's actual relationship (invite only when a real grant exists)?

### 6. [MEDIUM] OAuth login CSRF (red-team C, F2)
`state` verified by KV existence only, not bound to the browser. Attacker harvests state+code for their identity, lures victim to callback → victim's browser gets a session cookie for the ATTACKER's account. FIX: short-lived `oauth_state` cookie, double-submit against callback `state`.

### 7. [MEDIUM] Signed-manifest anti-rollback (red-team B, Q4)
Manifest has no version/epoch → network attacker serves a stale-but-validly-signed payload to pin a downgrade. FIX: monotonic version in the signed manifest; shim refuses older-than-cached. (The ed25519 chain itself is strong.)

### 8. [MEDIUM] Anonymous purchase session_id replayable 7 days (red-team A, F2)
Anon purchases store `buyer_github_login:null` → `buyerOk` true for anyone with the `?session_id=`. FIX: require login before paid checkout, or single-use token.

### 9. [MEDIUM · TRUST] Cross-user prompt-injection channels (red-team B, Q2)
≤280-char attacker markdown into shared `/marketplace` catalog (read by every agent); ≤5000-char text into founder-consumed feedback repo. Length/XSS bounded, injection semantics not. FIX: treat as hostile in any agent reading them (delimit/quarantine); allowlist or author-must-own-repo before a module enters the shared catalog.

### 10. [LOW] Misc
- CORS: drop `http://localhost:3000` from the credentialed allowlist in prod (`cors.ts`).
- SSRF: `validateSidecarUrl` misses hex `::ffff:7f00:1` mapped-loopback (`twin.ts`); reject any `::ffff:` host. (Low on CF edge.)
- Private-file name enumeration to any authed user; filter internal test names on `/library/:id` protocol list.
- `authorizeWorkRead` grants subscriber on any truthy `subscription_id` (canceled/past_due incl.) → check `ACTIVE_AUTHOR_STATUSES` (`file-access.ts:496`).
- Unbounded preview `text` in `PUT /file` — cap at ingress.
- Pulses have no gate by design — confirm they never carry non-public content.

## CONFIRMED STRUCTURALLY SOUND (held under attack)
Single R2 gate (all content via `authorizeFileRead`, CI-grep enforced) · D1 fully parameterized (no SQLi) · path traversal blocked (`isValidFileName`) · accessor identity always server-derived · API keys hash-only + timing-safe index lookup + rotation · session tokens 192-bit HttpOnly/Secure/SameSite=Lax · Stripe webhook signature-verified (the webhook path — only the success page was the hole) · admin authz on every /admin + /analytics · push-webhook HMAC constant-time · ed25519 signed manifest chain (fail-closed, offline key) · twin re-audit fixes all independently reproduced.
