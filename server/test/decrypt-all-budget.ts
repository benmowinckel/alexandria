/**
 * Architectural gate — the decrypt-all budget.
 *
 * `loadAccounts()` (kv.ts) loads AND AES-256-GCM-decrypts EVERY account in one
 * pass. On a request path that any caller can hit cheaply and often — especially
 * an unauthenticated one — it is a denial-of-service amplifier whose cost grows
 * with every signup. This exact class has been found and hand-fixed twice:
 *   - GET /check-kin           (login-index miss fell back to decrypt-all)
 *   - GET /library, /:author   (directory built by decrypting every account)
 * accounts.ts documents the convention in a comment ("never
 * Object.values(accounts).find(...)" — use getAccountByLogin for O(1) lookups),
 * but a comment is not a verification loop. This gate makes the convention
 * enforceable: CI fails the moment a NEW decrypt-all call appears anywhere in
 * server/src, so the third instance can never ship silently.
 *
 * How it works: a per-file CEILING on the number of `loadAccounts<...>()` call
 * sites. Adding a call (a new handler, or a new line in an existing file) pushes
 * a file over its ceiling and fails the build. Removing calls (e.g. when a
 * pending-fix branch lands) only lowers the count — never fails — and the
 * follow-up is to ratchet the ceiling down here to lock the win in.
 *
 * When you legitimately need to iterate all accounts:
 *   - single-login lookup  -> getAccountByLogin() in accounts.ts (O(1), indexed)
 *   - a public projection   -> cache/maintain a denormalised view, don't decrypt
 *                              every account per request
 *   - admin/cron/billing    -> acceptable (authed, low-frequency, off the hot
 *                              request path) — bump the ceiling below WITH a reason
 *
 * Run: cd server && npx tsx test/decrypt-all-budget.ts
 */

import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';

const SRC_DIR = fileURLToPath(new URL('../src/', import.meta.url));

// A `loadAccounts<...>()` call site (the type-arg form). Excludes the import
// (`import { loadAccounts }`) and the definition (`function loadAccounts<T>`),
// neither of which is a call.
const CALL = /loadAccounts</g;

// The definition lives here — it is the thing we are budgeting calls to, never a
// call itself. Excluded from the scan entirely.
const DEFINITION_FILE = 'kv.ts';

/**
 * Per-file ceiling on decrypt-all call sites. A file absent from this map has an
 * implicit ceiling of 0 — any decrypt-all in a new file fails the gate until it
 * is added here WITH a justification. `pending` marks a known offender awaiting a
 * fix on a branch; it is surfaced loudly every run so it can never be forgotten,
 * but it does not fail the build (the fix is already armed elsewhere).
 */
interface Budget { max: number; why: string; pending?: string }
const BUDGET: Record<string, Budget> = {
  'accounts.ts': { max: 2, why: 'getAccounts() admin billing summary + self-healing fallback inside getAccountByLogin (the sanctioned O(1) lookup)' },
  'auth.ts':     { max: 1, why: 'auth-index self-healing fallback (O(1) on the hot path; scan only when the index is missing)' },
  'billing.ts':  { max: 1, why: 'billing reconciliation — Stripe webhook / admin path, off the hot request path' },
  'cron.ts':     { max: 2, why: 'scheduled jobs (health digest, engagement) — not a request path' },
  'routes.ts':   { max: 2, why: 'GET /admin/nudge-conversion + POST /admin/nudge — admin-authed, low frequency' },
  'library.ts':  { max: 2, why: 'GET /library + GET /library/:author directory ordering on unauthenticated read paths', pending: 'elon/library-directory-dos-floor (60s-TTL cached projection — armed, awaiting merge)' },
};

function countCalls(text: string): number {
  return (text.match(CALL) || []).length;
}

function main(): void {
  const files = readdirSync(SRC_DIR).filter(f => f.endsWith('.ts') && f !== DEFINITION_FILE);

  const violations: string[] = [];
  const pending: string[] = [];
  let totalCalls = 0;

  for (const file of files.sort()) {
    const count = countCalls(readFileSync(SRC_DIR + file, 'utf8'));
    if (count === 0) continue;
    totalCalls += count;

    const budget = BUDGET[file];
    if (!budget) {
      violations.push(`  ${file}: ${count} decrypt-all call(s) — file not in the budget. New decrypt-all on a request path is the DoS-amplifier class (see check-kin / library). Use getAccountByLogin() for single-login lookups, or cache a public projection. If genuinely admin/cron/billing, add an entry to BUDGET in test/decrypt-all-budget.ts with a reason.`);
      continue;
    }
    if (count > budget.max) {
      violations.push(`  ${file}: ${count} decrypt-all call(s) exceeds ceiling ${budget.max}. A NEW decrypt-all was added. ${budget.why ? `(allowed: ${budget.why})` : ''} Remove it or, if justified, raise the ceiling in BUDGET with a reason.`);
    }
    if (budget.pending) {
      pending.push(`  ${file}: ${count} call(s) — PENDING FIX on ${budget.pending}`);
    }
  }

  console.log('=== decrypt-all budget gate ===');
  console.log(`Scanned ${files.length} files in server/src (excluding ${DEFINITION_FILE}). ${totalCalls} decrypt-all call site(s) total.\n`);

  if (pending.length) {
    console.log('Known offenders awaiting an armed fix (not a build failure — visibility only):');
    pending.forEach(p => console.log(p));
    console.log('');
  }

  if (violations.length) {
    console.log('GATE FAILED — decrypt-all budget exceeded:');
    violations.forEach(v => console.error(`::error::${v.trim()}`));
    violations.forEach(v => console.log(v));
    process.exit(1);
  }

  console.log('PASS — no new decrypt-all call sites on any path.');
  process.exit(0);
}

main();
