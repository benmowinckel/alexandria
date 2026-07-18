# Task: GitHub username migration — `mowinckelb` → `benmowinckel`

Self-contained runbook. Any agent in any tool reads this cold and executes. See `AGENTS.md` for architecture. Delete (or move to `.tasks/done/`) when live-verified.

## Why this is safe (established 2026-07-18)

- Accounts are keyed on the **immutable numeric `github_id` = 233047998**, never the login string (`kv.ts`: `account:{github_id}`). The login is a **first-claim-wins sticky alias** (`accounts.ts` `getAccountByLogin`) — a squatter who grabs the freed `mowinckelb` and signs in **cannot** inherit the founder's account. So library data does NOT split-brain.
- On OAuth sign-in the callback writes the **current** login to the account (`routes.ts:486` `github_login: user.login`). So after rename+signin the stored login becomes `benmowinckel`, which is why `ADMIN_GITHUB_LOGIN` (a string compare) is the one thing that must change + deploy.
- `/library/{id}` resolves the id by login through the sticky index. `/library/mowinckelb` keeps resolving forever; `/library/benmowinckel` starts resolving after the first post-rename sign-in.
- The install **shim pins the signing public key** (`factory/hooks/shim.sh` uses `ssh-keygen -Y verify` against embedded `allowed_signers`). The signing key (`~/.alexandria-signing/key`) is **independent of the GitHub username**. Rename cannot forge or break the signature chain. Squatting the old name is optional insurance (stale/cached old install URLs only), NOT required.

## Human-only prerequisites (founder — must happen FIRST; nothing deployable can precede them)

1. Rename `mowinckelb` → `benmowinckel` at github.com/settings/admin ("Change username"). No API exists for this.
2. Sign in once at alexandria-library.com via GitHub (flips stored login + creates `login:benmowinckel` index → admin + benmowinckel library URL go live).
3. (Optional) Claim `mowinckelb` with a throwaway account/org to protect stale copies of the `curl|bash` install line.

## Execute (agent — one contiguous run, only AFTER step 1 above)

### 1. Git remotes (3 repos)
```
git -C ~/alexandria remote set-url origin https://github.com/benmowinckel/alexandria-private.git
git -C ~/alexandria-inc remote set-url origin https://github.com/benmowinckel/alexandria-inc.git
git -C ~/alexandria-inc/public/code remote set-url origin https://github.com/benmowinckel/alexandria.git
```

### 2. Edit — replace `mowinckelb` → `benmowinckel` in these ACTIVE files only

Product repo (`~/alexandria-inc/public/code/`):
- **Config / gates (verify each by hand):** `server/wrangler.toml` (`ADMIN_GITHUB_LOGIN`), `app/lib/config.ts` (`FOUNDER_LIBRARY_ID`).
- **Server constants:** `server/src/marketplace.ts` (`FEEDBACK_REPO`), `server/src/audit.ts` + `server/src/worker.ts` (`audit_repo`), `server/src/accounts.ts` + `server/src/routes.ts` + `server/src/worker.ts` + `server/src/library.ts` (admin-login fallbacks), `server/src/kv.ts` + `server/src/protocol.ts` (comments/refs).
- **App:** `app/layout.tsx`, `app/marketplace/page.tsx`, `next.config.ts`.
- **Docs:** `TRUST.md`, `AGENTS.md`, `public/docs/Mechanics.md`, `public/docs/Questions.md`.
- **Factory (URLs):** `factory/setup.sh`, `factory/hooks/payload.sh`, `factory/hooks/shim.sh`, `factory/migrate.sh`, `factory/block.md`, `factory/canon/library.md`, `factory/scripts/publish.sh`, `factory/scripts/verify-fetch.sh`, `factory/plugin/.claude-plugin/plugin.json`, `factory/plugin/README.md`, `factory/plugin/scripts/plugin-shim.sh`, `factory/plugin/scripts/shim.sh`, `factory/systems/capture-pipeline.md`, `factory/systems/state-based-sync.md`, all `factory/skills/*.md` that match.
- **CI / scripts / tests:** `.github/workflows/canon.yml`, `.github/workflows/smoke.yml`, `scripts/check-smoke-paths.sh`, `server/test/*.ts`, `server/test/stranger.sh`.

Founder's local install (`~/alexandria/system/`):
- `hooks/shim.sh`, `scripts/verify-fetch.sh`, `.hooks_payload`, `canon/library.md`, `.protocol_status.json`, `.claude-instructions.md`, `.block`.

DO NOT edit (historical records — leave as-is): `**/vault/*.jsonl`, `~/alexandria-inc/private/archive/**`, `~/alexandria/system/.close_backups/**`, `.tasks/done/**`, audit/activity logs, private truth prose (`a2.md`/`a3.md`) unless doing a cosmetic sweep.

### 3. Build
```
cd ~/alexandria-inc/public/code/server && npm run build
cd ~/alexandria-inc/public/code && npm run build   # app (Next.js)
```

### 4. Commit + ship (routing matters — see AGENTS.md)
- **Signed set** (`factory/canon/*.md`, `factory/hooks/payload.sh`, `factory/skills/*`, any file in `ship.sh` SIGNED_FILES): `bash factory/ship.sh "username migration: mowinckelb -> benmowinckel"` — **needs the signing-key passphrase** (`~/.alexandria-signing/key`). This re-signs `manifest.txt`. Skipping it freezes every Author's payload verification.
- **Non-signed factory files** (`setup.sh`, `shim.sh`, `scripts/*`, `plugin/*`, `migrate.sh`, `block.md`, `systems/*`): `ship.sh` leaves these uncommitted — commit them normally after.
- **Everything else** (server/app/docs/CI/tests): `bash scripts/push.sh` (pushes + waits for CI).
- Stage explicit paths only — **never `git add -A`** (multi-session repo).

### 5. Deploy Worker
```
cd ~/alexandria-inc/public/code/server && npx wrangler deploy
curl https://api.alexandria-library.com/health
```
Website (Vercel) auto-deploys from pushed `main`.

### 6. Verify live (not the working tree — production)
- `curl https://api.alexandria-library.com/health` → ok.
- `/library/benmowinckel` resolves to founder (after his post-rename sign-in).
- `/library/mowinckelb` STILL resolves (sticky index) — old links unbroken.
- Admin endpoint works signed in as benmowinckel (`ADMIN_GITHUB_LOGIN` deployed).
- Install: `curl -fsSL https://raw.githubusercontent.com/benmowinckel/alexandria/main/factory/setup.sh` → 200, and `next.config.ts` redirect (mowinckel.ai/... → raw benmowinckel setup.sh) → 200.
- Feedback/audit repo writes land under `benmowinckel/alexandria-feedback` + `-audit` (renamed repos redirect, but code now points direct).

## Rollback
Every step is a git revert + redeploy. The GitHub rename itself reverses by renaming back (only if `mowinckelb` hasn't been re-claimed — another reason to squat it).
