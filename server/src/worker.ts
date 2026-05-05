/**
 * Alexandria Server — Cloudflare Workers entry point
 *
 * Stateless server implementing the Alexandria protocol.
 * Protocol + company routes. Stores nothing user-specific.
 */

import { Hono } from 'hono';
import { extractApiKey, findByApiKey } from './auth.js';
import { updateAccountBilling, getBillingSummary } from './accounts.js';
import { runHealthDigest } from './cron.js';
import { registerProtocol } from './protocol.js';
import { registerRoutes } from './routes.js';
import { registerBillingRoutes, settleMonthlyTabs, recalculateAllKinPricing, createPatronCheckoutSession } from './billing.js';
import { registerLibraryRoutes } from './library.js';
import { getAnalytics, getEventLog, getDashboard, getUserEvents, logEvent, flushEvents } from './analytics.js';
import { setKV, getKV } from './kv.js';
import { sendFollowerWelcome } from './email.js';
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
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  const serverUrl = process.env.SERVER_URL || 'https://mcp.mowinckel.ai';
  const websiteUrl = process.env.WEBSITE_URL || 'https://mowinckel.ai';
  c.header('Content-Security-Policy', `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self' ${serverUrl} ${websiteUrl}; img-src 'self' ${websiteUrl}`);
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

// CORS for Library API (website at mowinckel.ai calls server at mcp.mowinckel.ai)
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

  return c.json({
    status: infraHealthy && digestUrgency !== 'sprint' ? 'ok' : 'degraded',
    components,
    awareness,
    server: 'alexandria',
    version: '0.4.0',
  });
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
<link rel="icon" type="image/png" href="https://mowinckel.ai/favicon.png">
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
// Waitlist
// ---------------------------------------------------------------------------

app.post('/waitlist', async (c) => {
  // CORS for website
  const reqOrigin = c.req.header('Origin') || '';
  const allowed = getAllowedOrigins();
  if (allowed.includes(reqOrigin)) {
    c.header('Access-Control-Allow-Origin', reqOrigin);
  }

  // KV-backed rate limiting (persists across isolate restarts)
  const ip = c.req.header('cf-connecting-ip') || 'unknown';
  try {
    const kv = getKV();
    const rateKey = `rate:waitlist:${ip}`;
    const raw = await kv.get(rateKey);
    const count = raw ? parseInt(raw, 10) : 0;
    if (count >= 5) {
      return c.json({ error: 'Too many requests.' }, 429);
    }
    await kv.put(rateKey, String(count + 1), { expirationTtl: 60 });
  } catch (e) {
    // KV failure — allow request through rather than blocking, but log
    console.error('[rate-limit] KV failure, allowing request:', e);
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
  try {
    const kv = getKV();
    const rateKey = `rate:follow:${ip}`;
    const raw = await kv.get(rateKey);
    const count = raw ? parseInt(raw, 10) : 0;
    if (count >= 5) {
      return c.json({ error: 'Too many requests.' }, 429);
    }
    await kv.put(rateKey, String(count + 1), { expirationTtl: 60 });
  } catch (e) {
    console.error('[rate-limit] KV failure, allowing request:', e);
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
    const insertResult = await db.prepare(
      'INSERT OR IGNORE INTO waitlist (email, type, source, created_at) VALUES (?, ?, ?, ?)'
    ).bind(normalizedEmail, 'follow', 'public', new Date().toISOString()).run();

    const isNewSignup = ((insertResult as unknown as { meta?: { changes?: number } }).meta?.changes || 0) > 0;
    logEvent('follow_signup', { amount: String(amount), new: isNewSignup ? 'true' : 'false' });

    if (isNewSignup) {
      // Fire-and-forget welcome — don't block Stripe checkout on email send
      c.executionCtx.waitUntil(
        sendFollowerWelcome(normalizedEmail).catch((err) => {
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

app.get('/favicon.ico', (c) => c.redirect('https://mowinckel.ai/favicon.png', 301));
app.get('/favicon.png', (c) => c.redirect('https://mowinckel.ai/favicon.png', 301));

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

app.notFound((c) => {
  const path = new URL(c.req.url).pathname;
  logEvent('server_not_found', { method: c.req.method, path });
  return c.text('404 Not Found', 404);
});

// ---------------------------------------------------------------------------
// Export for Cloudflare Workers
// ---------------------------------------------------------------------------

export default {
  fetch: app.fetch,

  // Cron Triggers — daily health digest + monthly settlement
  async scheduled(_event: ScheduledEvent, env: Record<string, unknown>, ctx: ExecutionContext) {
    initEnv(env);
    // Daily 15:00 UTC (health digest, also publishes library-signal snapshot
    // to alexandria-marketplace) + monthly 1st @ 02:00 UTC (settlement).
    // settleMonthlyTabs is idempotent — only does work on month-end keys.
    await Promise.all([runHealthDigest(), settleMonthlyTabs(), recalculateAllKinPricing()]);
    ctx.waitUntil(flushEvents());
  },
};
