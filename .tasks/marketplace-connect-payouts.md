# Marketplace creator payouts + 10% add-on fee (Stripe Connect) — FULL PLAN

**Decision (founder, a3 § marketplace):** Author sets price P, nets it in full; buyer pays P × 1.10; the 10% add-on stays with Alexandria. Real split via Stripe Connect destination charge. Verification is **just-in-time + gated**: invisible at install, prompted only when an Author tries to charge, blocked until done (fail-closed).

Status legend: **[DONE]** committed `e63ba48` · **[BUILD]** do now · **[FOUNDER]** only the founder can · **[DEFER]** out of scope, noted.

## Components — every piece

### Backend money mechanics
- **[DONE] A. Account model** — `stripe_connect_account_id` + `connect_payouts_enabled` (auth.ts, accounts.ts, billing.ts BillingInfo).
- **[DONE] B. Connect Express account + hosted onboarding link** — `getOrCreateConnectAccount`, `createConnectOnboardingLink` (billing.ts). Stripe does KYC; we never touch bank data.
- **[DONE] C. Onboarding endpoints** — `POST /account/connect`, `GET /account/connect/status` (routes.ts).
- **[DONE] D. Webhook sync** — `account.updated` → `connect_payouts_enabled` (billing.ts). Added to HANDLED_EVENTS.
- **[DONE] E. Checkout = destination charge** — file + work: buyer pays P×1.10, `application_fee_amount` = 10% of P, transfer to the Author's connected account. **Fail-closed 409** if not connected (library.ts).
- **[DONE] F. Ledger records the real split** — purchase webhook reads `platform_fee_cents`/`author_amount_cents` from session metadata; supersedes the stale `LIBRARY_CUT_PERCENT=50` bookkeeping (legacy sessions still fall back).
- **[DONE] G. Canon** — a3 10% add-on locked.

### Just-in-time author flow (the "frontend", agent-native)
- **[BUILD] H. Paid-publish nudge** — `PUT /file` (protocol.ts): when `visibility` is set to `'paid'` and the Author is not connected, include `payouts_required: true` in the response so the agent tells them "connect payouts at POST /account/connect to sell this." Server-side + agent-agnostic → **no signature-gated factory/skill change**, no ship.sh. The 409 at purchase (E) is the hard backstop; this is the friendly upstream prompt.
- **[BUILD] I. Featherlight onboarding** — `createConnectOnboardingLink` uses `collection_options.fields: 'currently_due'` so step one is minimal (email); Stripe defers fuller KYC until the Author has earnings to withdraw.

### Cleanups (optimise pass)
- **[BUILD] J. DRY the fee rate** — extract `MARKETPLACE_FEE_RATE = 0.10` (single source) instead of `0.10` hardcoded in two checkout handlers. (Values decision → constant, not env — it's policy, not config.)

### Founder actions (cannot be coded)
- **[FOUNDER] K. Enable Stripe Connect (test mode)** — Dashboard → Test mode ON → Connect → Enable → "Platform or marketplace" → fill platform profile. Prerequisite for everything; without it, account creation fails.
- **[VERIFIED 2026-06-28] L. Test-mode verification** — Stripe money mechanics confirmed end-to-end against real test mode via a standalone script running the code's exact Connect calls (create Express account → hosted onboarding → destination-charge checkout). Result: a $2 file → **buyer charged $2.20, application fee $0.20 (platform), $2.00 transfer to the connected account** — the 10% add-on split works. NOTE: this exercised the Stripe calls, not the worker HTTP endpoints (those are build-verified + logic-reviewed; they get their smoke test at first real deploy). Re-run anytime by re-creating the standalone test or via `server/test/e2e.ts`.
- **[DONE 2026-06-28] M. Go live** — deployed to prod; LIVE smoke test passed: `POST /account/connect` on the deployed worker authed, created live account `acct_1TnXsEA1vmH7uBtr`, and returned a hosted Stripe onboarding URL → deployed code + live key + Connect all confirmed in production. Real-money purchase intentionally not run (test mode already proved the split math); optional later.

**STATUS: SHIPPED + live-confirmed 2026-06-28.** Remaining = the deferred edges only (N refunds, O price-setter UI, P fee-surcharge) — future work, not blocking.

### Deferred edges (noted, not built — scope discipline)
- **[DEFER] N. Refund/dispute reversal** — there is currently **no** refund handling anywhere in the webhook (pre-existing, not introduced here). A Connect refund needs `reverse_transfer: true`. v2 edge; note in the ledger that refunds are manual until built.
- **[DONE 2026-06-28] O. Author "set your price" path** — per-file price, agent-native (no UI): `PUT /file` accepts `price_cents`, stored on `protocol_files` (lazy column via `ensureFilePriceColumn`, no migration apply). Checkout uses per-file price → per-author default → $2, with the author's price as the FLOOR (buyer may tip up via `amount_cents`, never underpay — closed a pre-existing underpay leak). Reconciliation-safe (COALESCE preserves price when a re-PUT omits it; unchanged-check includes price). Price clamp ($1–$1000) is single-sourced in `db.ts` (`clampPaidAmount`). **Open follow-ups:** (a) works still use the buyer $20–$200 slider, not author-set pricing — files & works now differ (product call); (b) agents need the `price_cents` param documented in canon/skill for "tell your AI to set the price" to be reliable (API supports it; instruction layer pending).
- **[DEFER→DEFAULT] P. Stripe processing fee** — absorbed from the platform's 10% (current behavior, simplest; on a $5 item the platform nets ~$0.05 after Stripe's ~$0.45). Revisit (surcharge to buyer / price floor) only if margin matters at volume.

## Test plan (founder, test mode)
1. Enable Connect (K).
2. `curl -X POST https://<env>/account/connect -H "Authorization: Bearer <your alex_ key>"` → open the returned URL → complete Stripe **test** onboarding (use Stripe's test SSN/bank values).
3. Confirm `GET /account/connect/status` → `payouts_enabled: true`.
4. Mark a file paid (`PUT /file` visibility=paid) at a known price; buy it as a different test user with a test card (4242…).
5. Confirm in the Stripe test dashboard: buyer charged P×1.10, transfer of P to the connected account, application fee = 0.10·P. Confirm the `billing_tab_ledger` row shows the same split.

## References
- `server/src/{auth,accounts,billing,routes,library,protocol}.ts` — change sites.
- a3.md § marketplace — the decision + add-on mechanic.
- CLAUDE.md — architecture, statelessness/encryption, code-quality gate.
