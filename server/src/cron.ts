/** Cron jobs — health digest. Called by worker scheduled handler. */

import { getKV, getRecentDaysEvents } from './kv.js';
import { sendEmail, FOUNDER_EMAIL } from './email.js';
import { formatPT } from './time.js';
import { publishLibrarySignalSnapshot } from './marketplace.js';
import { computeLibrarySignalText } from './library-signal.js';
import { reconcilePatronSubscriptions } from './billing.js';

// ---------------------------------------------------------------------------
// Health digest — self-heal, only email the founder if he needs to log on
// ---------------------------------------------------------------------------

type Urgency = 'sprint' | 'stroll';
type Escalate = (u: Urgency, reason: string) => void;

/**
 * D1 health probe + schema/invariant checks. Extracted from runHealthDigest
 * because it's the longest subsection (multiple independent D1 queries) and
 * benefits most from being a named unit.
 */
async function probeD1(escalate: Escalate): Promise<void> {
  try {
    const db = (globalThis as any).__d1 as D1Database | undefined;
    if (!db) {
      escalate('sprint', 'D1 not bound');
      return;
    }
    await db.prepare('SELECT 1').first();

    // Schema verification — expected tables must exist
    const expectedTables = ['authors', 'shadows', 'quizzes', 'works', 'quiz_results', 'referrals', 'access_log', 'billing_tab', 'waitlist', 'stripe_webhook_events', 'protocol_files', 'protocol_calls', 'patron_subscriptions'];
    const { results: tables } = await db.prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table'`
    ).all<{ name: string }>();
    const tableNames = new Set((tables || []).map(t => t.name));
    const missing = expectedTables.filter(t => !tableNames.has(t));
    if (missing.length > 0) escalate('sprint', `D1 missing tables: ${missing.join(', ')}`);

    // Billing invariant: no duplicate unsettled rows for the same artifact-month key.
    const duplicateRows = await db.prepare(
      `SELECT COUNT(*) as c
       FROM (
         SELECT accessor_id, author_id, artifact_type, artifact_id, month
         FROM billing_tab
         WHERE settled = 0 AND artifact_id != ''
         GROUP BY accessor_id, author_id, artifact_type, artifact_id, month
         HAVING COUNT(*) > 1
       )`
    ).first<{ c: number }>();
    if ((duplicateRows?.c || 0) > 0) escalate('sprint', `D1 billing duplicate unsettled rows: ${duplicateRows?.c}`);

    // Verification substrate present.
    const billingIndex = await db.prepare(
      `SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_tab_unique_unsettled_artifact'`
    ).first<{ name: string }>();
    if (!billingIndex) escalate('stroll', 'D1 missing billing uniqueness index');

    const webhookTable = await db.prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'stripe_webhook_events'`
    ).first<{ name: string }>();
    if (!webhookTable) escalate('stroll', 'D1 missing stripe_webhook_events table');
  } catch (e) {
    escalate('sprint', `D1 probe failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * Marketplace activity check. The daily library-signal snapshot pushes to the
 * marketplace repo every cron run, so pushedAt should never go more than ~24h
 * stale. If it does, either GITHUB_BOT_TOKEN is broken, github is down for
 * a long time, or the cron itself stopped firing. 14d threshold makes this
 * a real-failure signal, not a daily-blip one.
 */
async function checkMarketplaceActivity(escalate: Escalate): Promise<void> {
  try {
    const token = process.env.GITHUB_BOT_TOKEN;
    if (!token) return; // not configured yet — skip silently during bootstrap
    const resp = await fetch('https://api.github.com/repos/mowinckelb/alexandria-signal', {
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'alexandria-server' },
    });
    if (!resp.ok) return; // non-fatal probe
    const data = await resp.json() as { pushed_at: string };
    const ageDays = Math.floor((Date.now() - new Date(data.pushed_at).getTime()) / 86400000);
    if (ageDays > 14) {
      escalate('stroll', `alexandria-signal stale (${ageDays}d since last push) — daily snapshot or relay broken`);
    }
  } catch { /* non-fatal */ }
}

export interface EventScanResult {
  serverErrors: number;
  deprecatedHits: number;
  staleClientCalls: number;
  setupFailures: number;
  followCheckoutFailed: number;
  deprecatedByPath: Map<string, number>;
  clientVersions: Map<string, number>;
  setupFailuresByStatus: Map<string, number>;
}

/**
 * Pure function: scan a JSONL event log for events that feed alarms.
 * Extracted from runHealthDigest so the counter logic is testable in
 * isolation — see server/test/cron-scanner.ts. Malformed lines are
 * skipped silently (logs can contain partial writes); events outside
 * [cutoff, now] are ignored.
 */
export function scanEventsForAlarms(rawLog: string, cutoff: number): EventScanResult {
  const r: EventScanResult = {
    serverErrors: 0,
    deprecatedHits: 0,
    staleClientCalls: 0,
    setupFailures: 0,
    followCheckoutFailed: 0,
    deprecatedByPath: new Map(),
    clientVersions: new Map(),
    setupFailuresByStatus: new Map(),
  };
  for (const line of rawLog.split('\n')) {
    if (!line) continue;
    try {
      const ev = JSON.parse(line);
      if (new Date(ev.t).getTime() < cutoff) continue;
      if (ev.e === 'server_error') r.serverErrors++;
      else if (ev.e === 'deprecated_hit') {
        // CI smoke fires hits every 6h to verify the alarm path. Skip those —
        // they're verification noise, not real stuck installs.
        if (ev.smoke === 'true') continue;
        r.deprecatedHits++;
        const p = ev.path || '(unknown)';
        r.deprecatedByPath.set(p, (r.deprecatedByPath.get(p) || 0) + 1);
      } else if (ev.e === 'client_version_seen') {
        const v = ev.version || 'unset';
        r.clientVersions.set(v, (r.clientVersions.get(v) || 0) + 1);
        // Only the bash shim path is upgradeable from our side. Native MCP clients
        // (Claude Desktop/web) legitimately don't set X-Alexandria-Client.
        if (v === 'unset' || v === 'unset-curl') r.staleClientCalls++;
      } else if (ev.e === 'setup_report') {
        const status = ev.status || 'unknown';
        if (status !== 'ok') {
          r.setupFailures++;
          r.setupFailuresByStatus.set(status, (r.setupFailuresByStatus.get(status) || 0) + 1);
        }
      } else if (ev.e === 'follow_subscription_checkout_failed') {
        r.followCheckoutFailed++;
      }
    } catch { continue; }
  }
  return r;
}

export async function runHealthDigest(opts: { sendEmailOnAlarm?: boolean } = { sendEmailOnAlarm: true }): Promise<void> {
  try {
    const kv = getKV();
    const issues: string[] = [];
    let urgency: Urgency | null = null;
    const escalate = (u: Urgency, reason: string) => {
      issues.push(`[${u}] ${reason}`);
      if (!urgency || u === 'sprint') urgency = u;
    };

    // --- Self-healing probes ---

    // KV
    try {
      const page = await kv.list({ prefix: 'account:' });
      if (page.keys.length === 0) {
        escalate('sprint', 'KV: zero accounts');
      }
    } catch (e) {
      escalate('sprint', `KV read failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    await probeD1(escalate);

    // R2 — Library content storage
    try {
      const r2 = (globalThis as any).__r2 as R2Bucket | undefined;
      if (!r2) {
        escalate('sprint', 'R2 not bound — Library content inaccessible');
      } else {
        // head() returns null for missing keys, throws only on binding failure
        await r2.head('.health-probe');
      }
    } catch (e) {
      escalate('sprint', `R2 probe failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    // Canon now served from GitHub, not from this server. No KV cache to verify.

    // Event log analysis — delegate to the pure scanEventsForAlarms helper
    // (testable in isolation, see server/test/cron-scanner.ts). Test-tag
    // filtering stays here because drift semantics may evolve independently.
    try {
      const raw = await getRecentDaysEvents(2);
      if (raw) {
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        const scan = scanEventsForAlarms(raw, cutoff);
        if (scan.serverErrors > 0) escalate('stroll', `${scan.serverErrors} server errors in 24h`);
        // deprecatedHits / staleClientCalls / stale-payload version drift
        // intentionally don't escalate. The shim self-updates payload from
        // GitHub on every session-start; "stuck" client versions resolve on
        // their own when the user next opens Claude Code. Counts still flow
        // into the cached digest marker for /analytics/dashboard visibility.
        if (scan.setupFailures > 0) {
          const dist = [...scan.setupFailuresByStatus.entries()].sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s}=${n}`).join(', ');
          escalate('stroll', `${scan.setupFailures} setup reports with non-ok status in 24h (${dist})`);
        }
        if (scan.followCheckoutFailed > 0) {
          escalate('stroll', `${scan.followCheckoutFailed} patron checkout failures in 24h — Stripe down or misconfigured`);
        }
      }
    } catch { /* non-fatal */ }

    // Route probes removed — Workers can't reliably self-fetch during cron (522 errors).
    // Infrastructure is verified directly above (KV, D1, R2, env vars).
    // External route verification is handled by GitHub Actions smoke test (every 6 hours).

    // Resend (email delivery)
    try {
      if (!process.env.RESEND_API_KEY) {
        escalate('stroll', 'RESEND_API_KEY not set — email delivery broken');
      }
    } catch { /* non-fatal */ }

    // Env var completeness
    try {
      const required = ['ENCRYPTION_KEY', 'STRIPE_WEBHOOK_SECRET', 'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'STRIPE_SECRET_KEY', 'RESEND_API_KEY'];
      const missing = required.filter(k => !process.env[k]);
      if (missing.length > 0) escalate('sprint', `Missing env vars: ${missing.join(', ')}`);
    } catch { /* non-fatal */ }

    await checkMarketplaceActivity(escalate);

    // Refresh the library-signal snapshot in alexandria-signal. The factory
    // reads this on its weekly run; daily refresh keeps it ≤24h stale. Non-fatal
    // if it fails — just logged, no escalate (the factory will see a stale snapshot
    // but other signals still flow).
    try {
      const text = await computeLibrarySignalText(30);
      await publishLibrarySignalSnapshot(text);
    } catch (err) {
      console.error('[cron] library-signal snapshot failed:', err);
    }

    // Patron subscription reconcile — Stripe is source of truth, patron_subscriptions is index.
    // Self-healing: drift gets corrected without alarm. Only alarm if reconcile itself fails.
    try {
      await reconcilePatronSubscriptions();
    } catch (err) {
      escalate('stroll', `patron reconcile failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Cron marker (proves the job ran — includes issue list for debugging)
    try {
      await kv.put('cron:health_digest', JSON.stringify({
        t: new Date().toISOString(),
        urgency,
        issues: issues.length > 0 ? issues : undefined,
      }), { expirationTtl: 30 * 24 * 60 * 60 });
    } catch { /* non-fatal */ }

    if (!urgency) return;
    if (opts.sendEmailOnAlarm === false) return;

    // Subject carries urgency; body carries the issue list. Awareness axiom:
    // a notification without actionable content is just a notification.
    const body = `<div style="font-family:'EB Garamond',Georgia,serif;max-width:520px;margin:0 auto;padding:40px 20px;color:#3d3630;">` +
      `<p style="margin:0 0 1rem;font-size:0.85rem;opacity:0.5">` + formatPT(new Date()) + `</p>` +
      issues.map(i => `<p style="margin:0 0 0.5rem;line-height:1.5;">${i.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`).join('') +
      `<p style="margin:2rem 0 0;font-size:0.75rem;opacity:0.4"><a href="https://mcp.mowinckel.ai/analytics/dashboard" style="color:#8a8078">dashboard</a></p>` +
      `</div>`;
    await sendEmail(FOUNDER_EMAIL, `alexandria. — ${urgency}`, body);
  } catch (err) {
    console.error('Health digest failed:', err);
  }
}
