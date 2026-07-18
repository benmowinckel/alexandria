/**
 * Live twin matrix — exercises the PLM ask gate + serving paths that
 * gate-matrix.ts (file reads) does not reach:
 *
 *   1. weights (quick) twin actually SERVES — owner-authenticated ask hits the
 *      sidecar's Tinker checkpoint path, not just the visibility gate.
 *   2. grant lifecycle — owner grants an account, the grant lists, and the
 *      granted querier's deep ask runs at the INVITE tier (deeper substrate).
 *   3. anonymous weights ask stays gated (401 — the invite floor holds).
 *
 * Like gate-matrix, runs against PRODUCTION by default with the owner key.
 * The stranger-with-code cell still needs a second account (ALEXANDRIA_TEST_KEY)
 * — same acknowledged gap as gate-matrix's stranger cells.
 *
 * Usage:   tsx server/test/twin-matrix.ts
 * Env:
 *   TEST_URL          override base (default https://api.alexandria-library.com)
 *   TEST_AUTHOR_ID    author under test (default benmowinckel)
 *   OWNER_API_KEY     owner key; falls back to ~/alexandria/system/.api_key
 *   GRANT_LOGIN       account to grant for the invite-tier cell (default: the owner
 *                     itself — a standing self-grant is the correct owner state:
 *                     without it the owner queries his own twin at public depth)
 *   KEEP_GRANT        '0' to revoke the grant after the test (default: keep)
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const BASE = process.env.TEST_URL || 'https://api.alexandria-library.com';
const AUTHOR = process.env.TEST_AUTHOR_ID || 'benmowinckel';
const HOME = process.env.HOME || process.env.USERPROFILE || '';

function loadKey(envName: string, fallbackPath?: string): string | null {
  const fromEnv = process.env[envName];
  if (fromEnv) return fromEnv.trim();
  if (fallbackPath && existsSync(fallbackPath)) return readFileSync(fallbackPath, 'utf8').trim();
  return null;
}

const OWNER_KEY = loadKey('OWNER_API_KEY', join(HOME, 'alexandria', 'system', '.api_key'));

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, detail = ''): void {
  if (ok) { passed++; console.log(`  ✓ ${label}${detail ? ` · ${detail}` : ''}`); }
  else { failed++; console.log(`  ✗ ${label}${detail ? ` · ${detail}` : ''}`); }
}

async function ask(question: string, variant: 'weights' | 'context', auth: boolean): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${BASE}/library/${AUTHOR}/ask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(auth && OWNER_KEY ? { Authorization: `Bearer ${OWNER_KEY}` } : {}),
    },
    body: JSON.stringify({ question, variant }),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body };
}

async function main(): Promise<void> {
  console.log(`\n=== Twin matrix vs ${BASE} (author=${AUTHOR}) ===\n`);
  if (!OWNER_KEY) { console.error('  owner key missing — set OWNER_API_KEY'); process.exit(1); }

  // Who does the key authenticate as?
  const session = await fetch(`${BASE}/library/session`, { headers: { Authorization: `Bearer ${OWNER_KEY}` } })
    .then((r) => r.json() as Promise<{ signed_in?: boolean; github_login?: string | null }>)
    .catch(() => null);
  check('owner key authenticates', session?.signed_in === true, String(session?.github_login || ''));

  // 1) Anonymous weights ask stays gated (the invite floor).
  const anon = await ask('hello', 'weights', false);
  check('weights · anonymous → 401', anon.status === 401, `got ${anon.status}`);

  // 2) Weights twin SERVES for the owner (the Tinker checkpoint path).
  const w = await ask('what is the one thing you want people to take from alexandria?', 'weights', true);
  const wAnswer = typeof w.body.answer === 'string' ? (w.body.answer as string) : '';
  check('weights · owner → 200 + answer', w.status === 200 && wAnswer.length > 0,
    w.status === 200 ? `${wAnswer.length} chars` : `got ${w.status} ${JSON.stringify(w.body).slice(0, 120)}`);
  if (wAnswer) console.log(`    ↳ ${wAnswer.slice(0, 180).replace(/\n+/g, ' ')}…`);

  // 3) Grant lifecycle → invite-tier deep ask.
  const grantLogin = process.env.GRANT_LOGIN || AUTHOR;
  const granted = await fetch(`${BASE}/library/${AUTHOR}/grant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OWNER_KEY}` },
    body: JSON.stringify({ login: grantLogin, label: 'twin-matrix test' }),
  });
  const grantBody = (await granted.json().catch(() => ({}))) as { ok?: boolean; github_id?: string | number };
  check('grant · owner grants account', granted.status === 200 && grantBody.ok === true, grantLogin);

  const grants = await fetch(`${BASE}/library/${AUTHOR}/grants`, { headers: { Authorization: `Bearer ${OWNER_KEY}` } })
    .then((r) => r.json() as Promise<{ grants?: Array<{ account_github_id?: string | number; revoked_at?: string | null }> }>).catch(() => null);
  const listed = (grants?.grants || []).some((g) => String(g.account_github_id) === String(grantBody.github_id) && !g.revoked_at);
  check('grant · listed', listed);

  // Granted querier at the invite tier: the twin should ENGAGE with an
  // invite-gated piece (content in reach) rather than answer with the locked
  // teaser. Heuristic: a locked answer says so explicitly.
  await new Promise((r) => setTimeout(r, 8000)); // stay under the 8/min ask limiter
  const deep = await ask('you have access to my full substrate at this tier. what does In Full actually cover — be concrete.', 'context', true);
  const dAnswer = typeof deep.body.answer === 'string' ? (deep.body.answer as string) : '';
  const lockedTell = /locked|invite-only|isn't loaded|not loaded|can't quote|need an invite/i.test(dAnswer);
  check('context · granted → invite tier engages gated piece', deep.status === 200 && dAnswer.length > 0 && !lockedTell,
    deep.status === 200 ? (lockedTell ? 'answered with the LOCKED teaser' : `${dAnswer.length} chars, engaged`) : `got ${deep.status}`);
  if (dAnswer) console.log(`    ↳ ${dAnswer.slice(0, 180).replace(/\n+/g, ' ')}…`);

  if (process.env.KEEP_GRANT === '0' && grantBody.github_id != null) {
    const rev = await fetch(`${BASE}/library/${AUTHOR}/grant/${grantBody.github_id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${OWNER_KEY}` },
    });
    check('grant · revoked (cleanup)', rev.status === 200);
  } else {
    console.log(`  · grant left standing (KEEP_GRANT!=0) — the owner's own invite tier`);
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
