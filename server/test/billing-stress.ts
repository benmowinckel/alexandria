/**
 * Billing stress / resilience checks — patron (/follow) + light tribe-adjacent probes.
 *
 * Safe by default: waitlist-only signups (amount: 0), no Stripe checkout sessions.
 *
 * Usage:
 *   cd server && npx tsx test/billing-stress.ts
 *
 * Env:
 *   TEST_URL          — default https://api.alexandria-library.com
 *   TEST_ORIGIN       — CORS Origin header; default https://alexandria-library.com
 *   FOLLOW_BURST      — concurrent /follow requests (default 40)
 *   SKIP_FOLLOW_STRESS=1 — skip burst/sequential/invalid-email (e.g. isolate Stripe patron probe)
 *   ASSERT_STRICT_RATE_LIMIT=1 — fail if burst allows >5 successes in a 60s window
 *   BILLING_STRESS_PATRON_CHECKOUT=1 — before /follow burst: ONE POST with amount: 1 ($1)
 *                                    patron checkout (hits Stripe; retries once on 429).
 *
 * Note: /follow increments the per-IP KV counter before email validation, so a 400
 * still consumes one of the five slots per minute.
 */

const BASE = process.env.TEST_URL || 'https://api.alexandria-library.com';
const ORIGIN = process.env.TEST_ORIGIN || 'https://alexandria-library.com';
const BURST = Math.max(1, parseInt(process.env.FOLLOW_BURST || '40', 10));
const PATRON_CHECKOUT = process.env.BILLING_STRESS_PATRON_CHECKOUT === '1';
const SKIP_FOLLOW_STRESS = process.env.SKIP_FOLLOW_STRESS === '1';
const ASSERT_STRICT_RATE_LIMIT = process.env.ASSERT_STRICT_RATE_LIMIT === '1';

function uniqEmail(tag: string) {
  const t = Date.now();
  const r = Math.random().toString(36).slice(2, 8);
  return `stress.${tag}.${t}.${r}@example.invalid`;
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postFollow(email: string, amount: number) {
  return fetch(`${BASE}/follow`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: ORIGIN,
    },
    body: JSON.stringify({ email, amount }),
  });
}

async function main() {
  const hardFailures: string[] = [];

  console.log('=== Billing stress (patron + tribe-adjacent) ===');
  console.log(`Target: ${BASE}`);
  console.log(`Origin: ${ORIGIN}`);
  console.log(`Burst concurrency: ${BURST}`);
  console.log(`Patron checkout probe (Stripe): ${PATRON_CHECKOUT ? 'ON (one $1 session)' : 'OFF'}`);
  console.log(`Skip /follow stress (burst/seq): ${SKIP_FOLLOW_STRESS ? 'YES' : 'NO'}`);
  console.log(`Assert strict /follow cap (<=5): ${ASSERT_STRICT_RATE_LIMIT ? 'YES' : 'NO'}\n`);

  // --- 1) Billing success page without session (should redirect, not 5xx) ---
  const successNoSession = await fetch(`${BASE}/billing/success`, { redirect: 'manual' });
  const loc = successNoSession.headers.get('location') || '';
  const okSuccess = successNoSession.status >= 300 && successNoSession.status < 400 && loc.includes('mowinckel');
  console.log(
    `[tribe-adjacent] GET /billing/success (no session_id): ${successNoSession.status} → ${okSuccess ? 'PASS' : 'CHECK'}`,
  );
  if (!okSuccess) console.log(`  location: ${loc || '(none)'}`);
  if (!okSuccess) hardFailures.push(`/billing/success did not redirect as expected (HTTP ${successNoSession.status})`);

  // --- 1b) Tribe — OAuth authorize URL must use this host as redirect_uri (join-the-tribe path) ---
  const ghStart = await fetch(`${BASE}/auth/github?ref_source=billing_stress`, { redirect: 'manual' });
  const ghLoc = ghStart.headers.get('location') || '';
  const tribeOAuthOk =
    (ghStart.status === 301 || ghStart.status === 302)
    && ghLoc.includes('github.com/login/oauth/authorize')
    && ghLoc.includes('api.alexandria-library.com')
    && ghLoc.includes('auth%2Fgithub%2Fcallback');
  console.log(
    `[tribe] GET /auth/github → ${ghStart.status}; redirect_uri host=api: ${tribeOAuthOk ? 'PASS' : 'CHECK'}`,
  );
  if (!tribeOAuthOk) {
    console.log(`  location (truncated): ${ghLoc.slice(0, 220)}${ghLoc.length > 220 ? '…' : ''}`);
  }
  if (!tribeOAuthOk) hardFailures.push(`/auth/github redirect_uri did not validate against api.alexandria-library.com`);

  // --- 1c) Webhook rejects unsigned bodies (Stripe path surface) ---
  const wh = await fetch(`${BASE}/billing/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  const whOk = wh.status === 400 || wh.status === 500;
  console.log(`[billing] POST /billing/webhook (no signature): ${wh.status} → ${whOk ? 'PASS' : 'FAIL'} (expect 400/500)`);
  if (!whOk) hardFailures.push(`/billing/webhook unsigned request returned unexpected HTTP ${wh.status}`);

  // --- 1d) Optional: patron paid path (Stripe Checkout session) — before /follow rate limit ---
  if (PATRON_CHECKOUT) {
    console.log('\n[patron] single checkout session (amount: 1 USD)...');

    const runPaidProbe = async () => {
      const r = await postFollow(uniqEmail('paid'), 1);
      const j = await r.json().catch(() => ({})) as { ok?: boolean; url?: string; subscription_unavailable?: boolean };
      const hasUrl = typeof j.url === 'string' && j.url.includes('stripe.com');
      const partial = j.ok === true && j.subscription_unavailable === true;
      return { status: r.status, ok: j.ok, hasUrl, partial, subscriptionUnavailable: j.subscription_unavailable };
    };

    let paid = await runPaidProbe();
    if (paid.status === 429) {
      console.log('  rate-limited (429). waiting 62s and retrying once...');
      await pause(62_000);
      paid = await runPaidProbe();
    }

    console.log(`  HTTP ${paid.status} ok=${paid.ok} url=${paid.hasUrl} subscription_unavailable=${paid.subscriptionUnavailable}`);
    if (paid.status === 200 && (paid.hasUrl || paid.partial)) {
      console.log(`  ${paid.hasUrl ? 'PASS — Stripe returned checkout URL' : 'PASS — graceful degradation (no url)'}`);
    } else {
      console.log('  FAIL — unexpected body for patron checkout');
      hardFailures.push(`Patron paid probe failed (HTTP ${paid.status})`);
    }
  }

  if (!SKIP_FOLLOW_STRESS) {
  // --- 2) Concurrent burst first (clean counter) — KV read/increment/put may allow >5 under race ---
  console.log(`\n[patron] concurrent burst (${BURST} parallel, unique emails, amount:0)...`);
  const burstEmails = Array.from({ length: BURST }, (_, i) => uniqEmail(`b${i}`));
  const burstResults = await Promise.all(burstEmails.map((em) => postFollow(em, 0)));
  const burstStatuses = burstResults.map((r) => r.status);
  const ok = burstStatuses.filter((s) => s === 200).length;
  const limited = burstStatuses.filter((s) => s === 429).length;
  const other = burstStatuses.filter((s) => s !== 200 && s !== 429).length;
  console.log(`  200: ${ok}, 429: ${limited}, other: ${other}`);
  if (ok > 5) {
    console.log(
      '  NOTE: more than 5 successes in one burst indicates a race on the KV rate counter',
      '(expected under heavy parallel load unless counters are atomic).',
    );
    if (ASSERT_STRICT_RATE_LIMIT) {
      hardFailures.push(`Strict limiter check failed: burst allowed ${ok} successes (expected <= 5)`);
    }
  } else {
    console.log('  Rate limit held under burst (strict or lucky ordering).');
  }

  // --- 3) Sequential rate limit (6th should 429) — run after burst; may need fresh minute for 5×200 ---
  console.log('\n[patron] sequential rate limit (6 × amount:0, same IP)...');
  const seqEmails = Array.from({ length: 6 }, (_, i) => uniqEmail(`seq${i}`));
  const seqStatuses: number[] = [];
  for (const em of seqEmails) {
    const r = await postFollow(em, 0);
    seqStatuses.push(r.status);
    await new Promise((res) => setTimeout(res, 50));
  }
  const fifthOk = seqStatuses.slice(0, 5).every((s) => s === 200);
  const sixthLimited = seqStatuses[5] === 429;
  console.log(`  statuses: ${seqStatuses.join(', ')}`);
  console.log(
    `  ${fifthOk && sixthLimited ? 'PASS' : 'PARTIAL/UNEXPECTED'} — design: 5×200 then 429`,
  );

  // --- 4) /follow validation — counter increments before email check (400 still uses a slot) ---
  const bad = await postFollow('not-an-email', 0);
  const badLabel =
    bad.status === 400 ? 'PASS' : bad.status === 429 ? 'SKIP (rate window full)' : 'FAIL';
  console.log(`\n[patron] invalid email → HTTP ${bad.status} (prefer 400): ${badLabel}`);
  }

  if (hardFailures.length > 0) {
    console.log('\n=== HARD FAILURES ===');
    for (const f of hardFailures) console.log(`- ${f}`);
    process.exit(1);
  }

  console.log(
    '\n[tribe] Full "join the tribe" billing runs after GitHub OAuth callback (createCheckoutSession).',
    'Validate with a real signup in staging or production; watch Stripe Dashboard for Checkout + subscription.',
  );

  console.log('\nDone.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
