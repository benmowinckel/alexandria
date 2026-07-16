# warm-lead hardening — fix plan from the 2026-07-15 full-funnel audit

*Self-contained: any agent in any tool can execute this cold. Architecture context: `AGENTS.md`. Source: five-track verification (install simulation in scratch HOMEs, live site crawl, server/billing code+live audit, factory signature verification, 12-persona stress test) run 2026-07-15 before warm-lead outreach. Delete sections as they ship; delete the file when empty.*

**What already passed (do not re-litigate):** all 33 install-fetch URLs 200 on origin/main · keyless cold install + idempotent re-run + `--ref` path clean in scratch-HOME runs · manifest 22/22 sha256 match + GOOD ssh signature · zero broken routes/links on the live site (27 routes) · OG card renders · OAuth CSRF-hardened, keys hash-only at rest, Stripe webhook signature-verified · billing implements exactly $10/mo, 30-day trial, 100%-forever coupon at 3 kin · mobile `/start` email-me-the-command flow works · zero founder-local leaks in factory.

## Shipped 2026-07-15 (all verified against production, not the working tree)

- **P0.1** landing commits pushed (a19c02c + the sample-frame rebuild); current copy live.
- **P0.2** `.block` first-run branch in cursor.mdc/codex.md/droid.md + Cursor hook.
- **P0.3** shim SessionStart timeout 10s→60s (both node AND python3 write paths — the python3 one was missed first time); payload cold-start fast path (d1b2cd1).
- **P0.4** /start now defaults the agent-less lead to Claude Code (`npm install -g @anthropic-ai/claude-code`) + windows line (git bash / wsl). Verified live.
- **P0.5** referral plumbing end-to-end: /onboard stores sanitized ref from ALL sources (first-ref-wins), emailed install commands carry `--ref`, 2d/5d nudges keep it, join escape-link forwards `/start?ref`, mobile /start passes ref through, member share surfaces emit `/start?ref` (free door) for try-asks — /join?ref kept only for kin-lapse + pre-bill (genuine membership asks). Commit a4a2951.
- **P0.6** /follow opens free (email-first, slider 0); homepage CTA "take it — it's free" → /start.
- **P1.8** invalid key: never persisted before verify (401 quarantines to `.api_key.rejected`, offline still stores), plain rejection + signup URL in closing, malformed keys hit the format error loudly. Verified in scratch-HOME runs.
- **P1.9** lost key: `GET /account/rotate-key` behind single-use 10-min OAuth-bound code, "lost your key?" link on both returning-member welcome branches; casual re-OAuth never rotates. Live (400 sans code).
- **P1.10a/b** `.block` gates CORE_OK on fresh installs; block.md stops on missing `.setup_report`; block close touches `.block_complete`.
- **P1.11** verify-fetch.sh installed at setup (trust root); lazy-fetch demoted to documented fallback. Verified in live install.
- **P1.12** rate limits live: /auth/github + callback 10/min/IP, /check-kin 10/min/IP (verified: 11th hit 429s), rotate-key 5/min/IP.
- **P2.13** robustness batch: curl required outright; shim robust mktemp; node-broken→python3 fallback; gh-unauthenticated says `gh auth login`; .DS_Store-safe existing-Author check; pre-existing vault/input dir kept with honest matrix row; DIY /a skill never clobbered (alexandria-marker detect).
- **P2.14** honorary spelling; marketplace hrefs → alexandria-modules; OG description realigned to the rebuilt page; short-phone CTA/header overlap fixed. Verified live.
- **P2.15** droid.md first-/a calibration ported; Cursor hook "Founder axioms"→Author preferences + stub-template skip; branded connect command in emails/templates; price single-constant; pre-bill unsubscribe footer; AGENTS.md endpoint table pruned + rotate-key row.

- **P1.7 + P1.10c** founder-shipped via ship.sh (cddc367): publish.sh module.md path + non-empty/H1 guard; payload.sh onboarding resume state machine (legacy infer-complete only when .block absent; .block present + no marker → gentle resume, never re-onboard, never strand). Verified: manifest hashes match, signature GOOD on origin/main, all four CI checks green (Canon Sovereignty / Signing / Smoke / Stranger).

## Remaining (open)

16. **Real-machine smoke test (15 min per tool) before firing outreach volume:** Cursor loads global `~/.cursor/rules/*.mdc` + resolves `./hooks/…` in hooks.json (`~/.cursor` exists on this machine — testable); Codex passes literal `/a` through; Factory reads `~/.factory/droids/`. Neither test suite covers fresh-install→agent-finds-the-block per tool.
17. Marketplace module ID `github:mowinckelb/alexandria-systems#optimise` still carries the legacy repo name in the catalog data (rendered href is fixed client-side; the ID itself lives server-side / in the module registration) — rename at source.
18. Same clobber-class as the /a skill fix, other surfaces: `~/.factory/droids/a.md` and `~/.cursor/rules/alexandria.mdc` are force-overwritten on re-run — apply the marker-detect pattern.
19. Cosmetic follow-ups: theme-toggle overlaps the "library." link bottom-left on short phones (pre-existing); `SEO_DESCRIPTION` in app/layout.tsx ("path through the singularity") predates the rebuild — refresh if wanted; `templates/canon_overrides.md` orphaned — delete or wire.
