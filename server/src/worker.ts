/**
 * Alexandria Server — Cloudflare Workers entry point
 *
 * Stateless server implementing the Alexandria protocol.
 * Protocol + company routes. Stores nothing user-specific.
 */

import { Hono } from 'hono';
import { extractApiKey, findByApiKey } from './auth.js';
import { updateAccountBilling, getBillingSummary } from './accounts.js';
import { runHealthDigest, runWeekOneCheckIns, runInstallNudges } from './cron.js';
import { mirrorPendingAuditBatch, getAuditHead } from './audit.js';
import { registerProtocol } from './protocol.js';
import { registerRoutes } from './routes.js';
import { registerBillingRoutes, settleMonthlyTabs, recalculateAllKinPricing, createPatronCheckoutSession } from './billing.js';
import { registerLibraryRoutes } from './library.js';
import { getAnalytics, getEventLog, getDashboard, getUserEvents, logEvent, flushEvents } from './analytics.js';
import { setKV, getKV } from './kv.js';
import { getDB } from './db.js';
import { sendFollowerWelcome } from './email.js';
import { generateToken } from './crypto.js';
import { getAllowedOrigins } from './cors.js';
import { formatPT } from './time.js';

// ---------------------------------------------------------------------------
// Hono app
// ---------------------------------------------------------------------------

const app = new Hono();

app.onError((err, c) => {
  const status = typeof (err as any).status === 'number'
    ? (err as any).status
    : 500;
  const path = new URL(c.req.url).pathname;
  const method = c.req.method;

  if (status >= 500) {
    const errorName = err instanceof Error ? err.name : 'Error';
    logEvent('server_error', {
      method,
      path,
      status: String(status),
      error_name: errorName.slice(0, 80),
    });
    console.error(`[server_error] ${method} ${path}`, err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }

  return c.json({ error: 'Request failed' }, status as any);
});

// Bind Worker env → process.env + KV/D1/R2 globals
function initEnv(env: Record<string, unknown>) {
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string') process.env[key] = value;
  }
  if (env.DATA) setKV(env.DATA as KVNamespace);
  if (env.DB) (globalThis as any).__d1 = env.DB;
  if (env.ARTIFACTS) (globalThis as any).__r2 = env.ARTIFACTS;
}

app.use('*', async (c, next) => {
  initEnv(c.env as Record<string, unknown>);
  await next();
  // Flush pending event writes — without this, KV writes from logEvent()
  // are killed when the Worker isolate exits after sending the response.
  c.executionCtx.waitUntil(flushEvents());
});

// Security headers — all responses
app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()');
  c.header('Cross-Origin-Opener-Policy', 'same-origin');
  const serverUrl = process.env.SERVER_URL || 'https://api.alexandria-library.com';
  const websiteUrl = process.env.WEBSITE_URL || 'https://alexandria-library.com';
  c.header('Content-Security-Policy', `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self' ${serverUrl} ${websiteUrl}; img-src 'self' ${websiteUrl}; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`);
});

// Body size limit — reject requests > 10MB (Cloudflare enforces 100MB platform limit)
app.use('*', async (c, next) => {
  const contentLength = c.req.header('content-length');
  if (contentLength && parseInt(contentLength, 10) > 10 * 1024 * 1024) {
    return c.text('Request body too large', 413);
  }
  await next();
});

// Allowed CORS origins — imported from cors.ts (single source of truth)

// CORS for kin code validation (website /signup calls api.mowinckel.ai/check-kin)
app.use('/check-kin', async (c, next) => {
  const allowed = getAllowedOrigins();
  const reqOrigin = c.req.header('Origin') || '';
  if (!allowed.includes(reqOrigin)) {
    if (c.req.method === 'OPTIONS') return c.text('', 403);
  } else {
    c.header('Access-Control-Allow-Origin', reqOrigin);
    c.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    c.header('Access-Control-Allow-Headers', 'Content-Type');
    c.header('Vary', 'Origin');
  }
  if (c.req.method === 'OPTIONS') return c.body(null, 204);
  await next();
});

// CORS for Library API (website at mowinckel.ai calls server at api.mowinckel.ai)
app.use('/library/*', async (c, next) => {
  const allowed = getAllowedOrigins();
  const reqOrigin = c.req.header('Origin') || '';
  if (!allowed.includes(reqOrigin)) {
    if (c.req.method === 'OPTIONS') return c.text('', 403);
    // Non-browser requests (curl, hooks) won't send Origin — let them through without CORS headers
  } else {
    c.header('Access-Control-Allow-Origin', reqOrigin);
    c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    c.header('Access-Control-Allow-Credentials', 'true');
    c.header('Vary', 'Origin');
  }
  if (c.req.method === 'OPTIONS') return c.body(null, 204);
  await next();
});

// ---------------------------------------------------------------------------
// Protocol — the incompressible core (file, call, library, marketplace)
// ---------------------------------------------------------------------------

registerProtocol(app);

// ---------------------------------------------------------------------------
// Company — OAuth, feedback, admin
// ---------------------------------------------------------------------------

registerRoutes(app);

// ---------------------------------------------------------------------------
// Billing — Stripe subscription management (conditional)
// ---------------------------------------------------------------------------

registerBillingRoutes(app, updateAccountBilling);

// ---------------------------------------------------------------------------
// Library — Turn 3 (shadows, pulses, quizzes, works)
// ---------------------------------------------------------------------------

registerLibraryRoutes(app);

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

app.get('/health', async (c) => {
  // Probe KV, D1, R2 — report component status
  const components: Record<string, string> = {};

  try {
    const env = c.env as Record<string, unknown>;
    const kv = env.DATA as KVNamespace;
    // Read-only list probe — verifies binding works without burning writes or reading a specific key.
    await kv.list({ prefix: 'account:', limit: 1 });
    components.kv = 'ok';
  } catch { components.kv = 'error'; }

  try {
    const env = c.env as Record<string, unknown>;
    const db = env.DB as D1Database | undefined;
    if (db) {
      await db.prepare('SELECT 1').first();
      components.d1 = 'ok';
    } else {
      components.d1 = 'not_bound';
    }
  } catch { components.d1 = 'error'; }

  try {
    const env = c.env as Record<string, unknown>;
    const r2 = env.ARTIFACTS as R2Bucket | undefined;
    if (r2) {
      await r2.head('.health-probe');
      components.r2 = 'ok';
    } else {
      components.r2 = 'not_bound';
    }
  } catch { components.r2 = 'error'; } // head() on missing keys returns null, not throw

  // Env var validation — log details server-side, don't expose var names publicly
  const requiredEnvVars = ['ENCRYPTION_KEY', 'STRIPE_WEBHOOK_SECRET', 'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'STRIPE_SECRET_KEY', 'RESEND_API_KEY'];
  const missingEnv = requiredEnvVars.filter(k => !process.env[k]);
  components.env = missingEnv.length === 0 ? 'ok' : 'error';
  if (missingEnv.length > 0) {
    console.error(`[health] Missing env vars: ${missingEnv.join(', ')}`);
  }

  // Awareness — last scheduled digest's urgency + issue list. Cheap KV read,
  // cached by cron.ts. Lets external monitors see stale-client/deprecated-hit
  // signal without needing auth on /analytics/dashboard.
  let awareness: Record<string, unknown> = { status: 'no_digest_yet' };
  try {
    const env = c.env as Record<string, unknown>;
    const kv = env.DATA as KVNamespace;
    const raw = await kv.get('cron:health_digest');
    if (raw) {
      awareness = JSON.parse(raw);
      if (awareness && typeof (awareness as { t?: unknown }).t === 'string') {
        (awareness as { t: string }).t = formatPT((awareness as { t: string }).t);
      }
    }
  } catch { /* non-fatal */ }

  const infraHealthy = Object.values(components).every(v => v === 'ok');
  const digestUrgency = (awareness as { urgency?: string }).urgency;

  // Stripe mode derived from the secret key prefix. Surfaced so we can verify
  // live-vs-test from /health without ever exposing the key value itself.
  // Handles both standard (sk_*) and restricted (rk_*) keys.
  const stripeKey = process.env.STRIPE_SECRET_KEY || '';
  const stripe_mode = !stripeKey
    ? 'unset'
    : /^(sk|rk)_live_/.test(stripeKey)
      ? 'live'
      : /^(sk|rk)_test_/.test(stripeKey)
        ? 'test'
        : `unrecognized:${stripeKey.slice(0, 8)}…`;

  return c.json({
    status: infraHealthy && digestUrgency !== 'sprint' ? 'ok' : 'degraded',
    components,
    awareness,
    stripe_mode,
    beta_mode: process.env.BETA_MODE === 'true',
    server: 'alexandria',
    version: '0.4.0',
  });
});

// ---------------------------------------------------------------------------
// Audit head — public observability of the access-log hash chain
// ---------------------------------------------------------------------------
//
// Returns the latest chain head + cron liveness timestamps. Anyone can poll
// this and record the head_hash; any future deletion or rewriting of historic
// audit entries (in the alexandria-audit GitHub repo) would produce a
// different head_hash than the values external observers already recorded.
// This is what makes the audit tamper-evident rather than just "stored."
//
// Returns no entries — only the cryptographic summary. Per-author entries
// live on /library/:author/access-log (author-auth required), full history
// lives in the audit repo.

app.get('/audit/head', async (c) => {
  try {
    const head = await getAuditHead();
    return c.json({
      ...head,
      audit_repo: 'mowinckelb/alexandria-audit',
      verify: 'Walk the hash chain in the audit_repo from genesis; the final entry hash must equal head_hash.',
    }, 200, { 'Cache-Control': 'no-store' });
  } catch (err) {
    return c.json({ error: 'audit head unavailable', detail: String(err).slice(0, 200) }, 500);
  }
});

// ---------------------------------------------------------------------------
// Root page
// ---------------------------------------------------------------------------

app.get('/', (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Alexandria</title>
<link rel="icon" type="image/png" href="https://alexandria-library.com/favicon.png">
</head>
<body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0a0a0a;color:#fff">
<div style="text-align:center">
<h1 style="margin:1rem 0 0.5rem;font-weight:300">Alexandria</h1>
<p style="color:#888;font-size:0.9rem">Greek philosophy infrastructure</p>
<p style="color:#555;font-size:0.8rem;margin-top:2rem"><a href="/health" style="color:#555">health</a></p>
</div>
</body>
</html>`);
});

// ---------------------------------------------------------------------------
// Public endpoint rate limiting (D1-backed, atomic)
// ---------------------------------------------------------------------------

const PUBLIC_RATE_LIMIT_MAX = 5;
const PUBLIC_RATE_LIMIT_WINDOW_SECONDS = 60;

let rateLimitSchemaReady = false;
let rateLimitSchemaInit: Promise<void> | null = null;

async function ensureRateLimitSchema(db: D1Database): Promise<void> {
  if (rateLimitSchemaReady) return;
  if (!rateLimitSchemaInit) {
    rateLimitSchemaInit = (async () => {
      await db.prepare(
        `CREATE TABLE IF NOT EXISTS request_rate_limits (
          scope TEXT NOT NULL,
          ip TEXT NOT NULL,
          window_bucket INTEGER NOT NULL,
          hits INTEGER NOT NULL DEFAULT 1,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (scope, ip, window_bucket)
        )`
      ).run();
      await db.prepare(
        `CREATE INDEX IF NOT EXISTS idx_request_rate_limits_window
         ON request_rate_limits(scope, window_bucket)`
      ).run();
      rateLimitSchemaReady = true;
    })().catch((err) => {
      rateLimitSchemaInit = null;
      throw err;
    });
  }
  await rateLimitSchemaInit;
}

async function enforcePublicRateLimit(scope: 'waitlist' | 'follow', ip: string): Promise<boolean> {
  const windowSeconds = PUBLIC_RATE_LIMIT_WINDOW_SECONDS;
  const limit = PUBLIC_RATE_LIMIT_MAX;

  // Primary path — D1 upsert + increment (atomic).
  try {
    const db = getDB();
    await ensureRateLimitSchema(db);

    const windowBucket = Math.floor(Date.now() / (windowSeconds * 1000));
    const now = new Date().toISOString();
    const row = await db.prepare(
      `INSERT INTO request_rate_limits (scope, ip, window_bucket, hits, updated_at)
       VALUES (?, ?, ?, 1, ?)
       ON CONFLICT(scope, ip, window_bucket) DO UPDATE SET
         hits = request_rate_limits.hits + 1,
         updated_at = excluded.updated_at
       RETURNING hits`
    ).bind(scope, ip, windowBucket, now).first<{ hits: number }>();

    // Keep table bounded (best-effort, same keyspace only).
    await db.prepare(
      `DELETE FROM request_rate_limits
       WHERE scope = ? AND window_bucket < ?`
    ).bind(scope, windowBucket - 2).run();

    return (row?.hits || 1) <= limit;
  } catch (e) {
    console.error('[rate-limit] D1 failure, falling back to KV:', e);
  }

  // Fallback path — KV (non-atomic but preserves availability if D1 is down).
  try {
    const kv = getKV();
    const rateKey = `rate:${scope}:${ip}`;
    const raw = await kv.get(rateKey);
    const count = raw ? parseInt(raw, 10) : 0;
    if (count >= limit) return false;
    await kv.put(rateKey, String(count + 1), { expirationTtl: windowSeconds });
  } catch (e) {
    // Last-resort availability: do not block signups if both D1 and KV fail.
    console.error('[rate-limit] KV fallback failure, allowing request:', e);
  }

  return true;
}

// ---------------------------------------------------------------------------
// Canon status — cross-Author awareness of canon fetch health
// ---------------------------------------------------------------------------
// Authors' payload.sh fire this after each session-start canon fetch. Logs to
// the existing event store so cross-Author/cross-machine canon health is
// queryable via /analytics/log. Per-Author local awareness still lives in
// ~/alexandria/system/.alexandria_errors — this is the aggregation layer.

app.post('/canon/status', async (c) => {
  const key = extractApiKey(c);
  if (!key) return c.json({ error: 'Unauthorized' }, 401);
  const account = await findByApiKey(key);
  if (!account) return c.json({ error: 'Unauthorized' }, 401);

  const body = await c.req.json().catch(() => null) as {
    fetch_failures?: unknown;
    has_notice?: unknown;
  } | null;

  // Bounded strings only — never trust client-supplied data unbounded.
  const failures = typeof body?.fetch_failures === 'string'
    ? body.fetch_failures.slice(0, 500)
    : '';
  const hasNotice = body?.has_notice === true;

  logEvent('canon_status', {
    login: account.github_login,
    has_failures: failures.length > 0 ? 'true' : 'false',
    failures: failures || 'none',
    has_notice: hasNotice ? 'true' : 'false',
  });

  c.executionCtx.waitUntil(flushEvents());
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Waitlist
// ---------------------------------------------------------------------------

app.post('/waitlist', async (c) => {
  // CORS for website
  const reqOrigin = c.req.header('Origin') || '';
  const allowed = getAllowedOrigins();
  if (allowed.includes(reqOrigin)) {
    c.header('Access-Control-Allow-Origin', reqOrigin);
  }

  // IP rate limiting
  const ip = c.req.header('cf-connecting-ip') || 'unknown';
  if (!await enforcePublicRateLimit('waitlist', ip)) {
    return c.json({ error: 'Too many requests.' }, 429);
  }

  const body = await c.req.json().catch(() => null);
  const email = body?.email;
  if (!email || typeof email !== 'string' || !email.includes('@') || email.length > 320) {
    return c.json({ error: 'Valid email required.' }, 400);
  }

  const validTypes = ['author', 'investor'];
  const type = validTypes.includes(body.type) ? body.type : 'author';
  const source = body.source === 'confidential' ? 'confidential' : 'public';

  try {
    const db = (globalThis as any).__d1 as D1Database;
    if (!db) {
      return c.json({ error: 'Database not available.' }, 503);
    }
    await db.prepare(
      'INSERT OR REPLACE INTO waitlist (email, type, source, created_at) VALUES (?, ?, ?, ?)'
    ).bind(email.toLowerCase().trim(), type, source, new Date().toISOString()).run();

    logEvent('waitlist_signup', { type, source });
    return c.json({ ok: true });
  } catch (err: any) {
    console.error('Waitlist error:', err?.message || err);
    return c.json({ error: 'Failed to join waitlist.' }, 500);
  }
});

// CORS preflight for waitlist (website calls cross-origin)
app.options('/waitlist', (c) => {
  const reqOrigin = c.req.header('Origin') || '';
  const allowed = getAllowedOrigins();
  if (allowed.includes(reqOrigin)) {
    c.header('Access-Control-Allow-Origin', reqOrigin);
    c.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    c.header('Access-Control-Allow-Headers', 'Content-Type');
  }
  return c.body(null, 204);
});

// ---------------------------------------------------------------------------
// Follow along (Door 2) — email list with optional one-time tip at the gate.
// Radiohead "In Rainbows" model: $0 valid, tip optional.
// ---------------------------------------------------------------------------

app.post('/follow', async (c) => {
  const reqOrigin = c.req.header('Origin') || '';
  const allowed = getAllowedOrigins();
  if (allowed.includes(reqOrigin)) {
    c.header('Access-Control-Allow-Origin', reqOrigin);
  }

  const ip = c.req.header('cf-connecting-ip') || 'unknown';
  if (!await enforcePublicRateLimit('follow', ip)) {
    return c.json({ error: 'Too many requests.' }, 429);
  }

  const body = await c.req.json().catch(() => null);
  const email = body?.email;
  if (!email || typeof email !== 'string' || !email.includes('@') || email.length > 320) {
    return c.json({ error: 'Valid email required.' }, 400);
  }

  const amountRaw = typeof body?.amount === 'number' ? body.amount : 0;
  const amount = isFinite(amountRaw) ? Math.max(0, Math.min(500, Math.floor(amountRaw))) : 0;
  const normalizedEmail = email.toLowerCase().trim();

  try {
    const db = (globalThis as any).__d1 as D1Database;
    if (!db) {
      return c.json({ error: 'Database not available.' }, 503);
    }
    const unsubscribeToken = generateToken();
    const insertResult = await db.prepare(
      'INSERT OR IGNORE INTO waitlist (email, type, source, created_at, unsubscribe_token) VALUES (?, ?, ?, ?, ?)'
    ).bind(normalizedEmail, 'follow', 'public', new Date().toISOString(), unsubscribeToken).run();

    const isNewSignup = ((insertResult as unknown as { meta?: { changes?: number } }).meta?.changes || 0) > 0;
    logEvent('follow_signup', { amount: String(amount), new: isNewSignup ? 'true' : 'false' });

    if (isNewSignup && amount <= 0) {
      // Free path — send the follower welcome now. Paying signups skip this and
      // get the patron welcome from the Stripe webhook instead, so a single
      // signup event produces a single email.
      c.executionCtx.waitUntil(
        sendFollowerWelcome(normalizedEmail, unsubscribeToken).catch((err) => {
          console.error('Follower welcome email failed:', err);
        })
      );
    }
  } catch (err: any) {
    console.error('Follow signup error:', err?.message || err);
    return c.json({ error: 'Failed to sign up.' }, 500);
  }

  if (amount <= 0) {
    return c.json({ ok: true });
  }

  try {
    const url = await createPatronCheckoutSession({
      email: normalizedEmail,
      amountCents: amount * 100,
    });
    logEvent('follow_subscription_checkout', { amount: String(amount) });
    return c.json({ ok: true, url });
  } catch (err: any) {
    console.error('Follow subscription checkout error:', err?.message || err);
    logEvent('follow_subscription_checkout_failed', { reason: err?.message || 'unknown' });
    // Email is already stored; surface partial-success so the UI can still confirm signup
    return c.json({ ok: true, subscription_unavailable: true });
  }
});

app.options('/follow', (c) => {
  const reqOrigin = c.req.header('Origin') || '';
  const allowed = getAllowedOrigins();
  if (allowed.includes(reqOrigin)) {
    c.header('Access-Control-Allow-Origin', reqOrigin);
    c.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    c.header('Access-Control-Allow-Headers', 'Content-Type');
  }
  return c.body(null, 204);
});

// ---------------------------------------------------------------------------
// Favicon
// ---------------------------------------------------------------------------

app.get('/favicon.ico', (c) => c.redirect('https://alexandria-library.com/favicon.png', 301));
app.get('/favicon.png', (c) => c.redirect('https://alexandria-library.com/favicon.png', 301));

// ---------------------------------------------------------------------------
// Analytics endpoints
// ---------------------------------------------------------------------------

// Auth gate for analytics
async function analyticsAuth(c: any, next: any) {
  const key = extractApiKey(c);
  if (!key) return c.json({ error: 'Unauthorized' }, 401);
  const account = await findByApiKey(key);
  if (!account) return c.json({ error: 'Unauthorized' }, 401);
  c.set('account', account);
  await next();
}
app.use('/analytics', analyticsAuth);
app.use('/analytics/*', analyticsAuth);

app.get('/analytics', async (c) => {
  return c.json(getAnalytics());
});

app.get('/analytics/log', async (c) => {
  const log = await getEventLog();
  return c.text(log || 'No events logged yet.');
});

app.get('/analytics/dashboard', async (c) => {
  const dashboard = await getDashboard();
  delete dashboard._events;
  const billing = await getBillingSummary();
  return c.json({ ...dashboard, billing });
});

app.get('/analytics/user/:login', async (c) => {
  const login = c.req.param('login');
  if (!login) return c.json({ error: 'Missing login' }, 400);
  const data = await getUserEvents(login);
  return c.json(data);
});

// ---------------------------------------------------------------------------
// Deprecated — routes removed in prior refactors. Serve 410 + log so stale
// clients learn to upgrade and we see which installs haven't migrated.
// ---------------------------------------------------------------------------

const DEPRECATED_ROUTES = [
  '/hooks', '/hooks/payload',
  '/session',
  '/blueprint', '/blueprint/delta',
  '/factory/signal',
  '/dashboard', '/setup', '/block',
  '/reference', '/reference/*',
  '/admin/factory/delta', '/admin/factory/signals',
];
for (const path of DEPRECATED_ROUTES) {
  app.all(path, async (c) => {
    const actualPath = new URL(c.req.url).pathname;
    const details: Record<string, string> = { method: c.req.method, path: actualPath };

    // CI smoke test fires a hit every 6h to verify the alarm pipeline. Tag those
    // so the daily alarm scanner can exclude them — otherwise the test self-
    // pollutes the signal it's supposed to verify.
    const isSmoke = c.req.query('_smoke') === '1';
    if (isSmoke) details.smoke = 'true';

    // Anonymous deprecated hits (no API key) need IP/UA to be traceable. Without
    // it, the alarm reports counts but can't tell us which install/scraper to
    // upgrade or block. Cheap to capture, only logged on the deprecated path.
    const key = extractApiKey(c);
    if (!key) {
      details.ip = c.req.header('cf-connecting-ip') || '?';
      details.ua = (c.req.header('user-agent') || '?').slice(0, 120);
      details.country = c.req.header('cf-ipcountry') || '?';
    }

    // Authenticated stuck clients: log login for analytics. The 410 response
    // body is swallowed by the shim, so we no longer try to email them — that
    // gap belongs to a structural fix (shim self-update), not nag mail.
    if (key) {
      try {
        const account = await findByApiKey(key);
        if (account) details.login = account.github_login;
      } catch (e) {
        console.error('[deprecated_hit] auth lookup failed:', e);
      }
    }

    logEvent('deprecated_hit', details);
    return c.text('410 Gone — endpoint removed. Upgrade the client: https://github.com/mowinckelb/alexandria', 410);
  });
}

// PHP/wordpress/admin-panel probes from vuln scanners drown the real 404
// signal (stale-client links, dropped routes) and pad KV write volume.
// CF Analytics already shows attack traffic; the app event log only needs
// real client behavior. Still return 404 — just don't log it.
function isScraperPath(path: string): boolean {
  if (/\.(php|asp|aspx|jsp|cgi)$/i.test(path)) return true;
  if (/^\/wp-/i.test(path)) return true;
  if (/(^|\/)\.(env|git|aws|ssh|DS_Store)/i.test(path)) return true;
  if (/^\/+(admin|administrator|phpmyadmin|adminer|setup|webadmin|panel)(\/|$)/i.test(path)) return true;
  return false;
}

app.notFound((c) => {
  const path = new URL(c.req.url).pathname;
  if (!isScraperPath(path)) {
    logEvent('server_not_found', { method: c.req.method, path });
  }
  return c.text('404 Not Found', 404);
});

// ---------------------------------------------------------------------------
// Export for Cloudflare Workers
// ---------------------------------------------------------------------------

export default {
  fetch: app.fetch,

  // Cron Triggers — dispatch by event.cron so each schedule runs only its job.
  async scheduled(event: ScheduledEvent, env: Record<string, unknown>, ctx: ExecutionContext) {
    initEnv(env);

    // Diagnostic — log every scheduled invocation so we can confirm cron is
    // actually firing and see which pattern triggered it (debugging the
    // initial deploy where */10 wasn't visibly firing). Cheap; remove later
    // once cron behaviour is well-understood.
    logEvent('scheduled_invoked', { cron: String(event.cron || 'undefined') });

    // Audit mirror — every 10 minutes. Tight window to keep the tampering
    // surface small. Runs alone (other crons skipped) to keep latency low
    // and avoid burning GitHub API rate limit on no-op scans.
    if (event.cron === '*/10 * * * *') {
      let auditErr: unknown;
      try {
        await mirrorPendingAuditBatch();
      } catch (err) {
        // Log the failure for the analytics endpoint, but flush BEFORE
        // re-throwing — otherwise the diagnostic event lives in `pendingLines`
        // and never reaches KV, hiding the very failure we wanted to surface.
        logEvent('audit_mirror_failed', { error: String(err).slice(0, 200) });
        auditErr = err;
      }
      // Run the flush regardless of success/failure. ctx.waitUntil keeps the
      // isolate alive long enough for the KV write to complete.
      ctx.waitUntil(flushEvents());
      if (auditErr) throw auditErr;
      return;
    }

    // Daily 15:00 UTC (health digest, library-signal snapshot) + monthly 1st
    // @ 02:00 UTC (settlement). settleMonthlyTabs is idempotent — only does
    // work on month-end keys.
    await Promise.all([runHealthDigest(), settleMonthlyTabs(), recalculateAllKinPricing(), runWeekOneCheckIns(), runInstallNudges()]);
    ctx.waitUntil(flushEvents());
  },
};
